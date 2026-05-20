import TestWrapper from '$lib/components/TestWrapper.svelte';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import TrashPage from './+page.svelte';

const { gotoMock, mockAssetMultiSelectManager, mockFeatureFlagsManager, mockServerConfigManager } = vi.hoisted(() => ({
  gotoMock: vi.fn(),
  mockAssetMultiSelectManager: {
    selectionActive: false,
    assets: [],
    clear: vi.fn(),
  },
  mockFeatureFlagsManager: { value: { trash: true } },
  mockServerConfigManager: { value: { trashDays: 30 } },
}));

vi.mock('$app/navigation', () => ({ goto: gotoMock }));

vi.mock('$lib/components/layouts/user-page-layout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/shared-components/empty-placeholder.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/Timeline.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/bindable-timeline.stub.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/AssetSelectControlBar.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/DeleteAssetsAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/SelectAllAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('./RestoreAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({
  assetMultiSelectManager: mockAssetMultiSelectManager,
}));

vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({
  featureFlagsManager: mockFeatureFlagsManager,
}));

vi.mock('$lib/managers/server-config-manager.svelte', () => ({
  serverConfigManager: mockServerConfigManager,
}));

vi.mock('$lib/services/trash.service', () => ({
  getTrashActions: vi.fn(() => ({ Empty: {}, RestoreAll: {} })),
}));

function renderPage() {
  const props = { data: { meta: { title: 'Trash' } } };

  return render(TestWrapper as Component<{ component: typeof TrashPage; componentProps: typeof props }>, {
    component: TrashPage,
    componentProps: props,
  });
}

describe('Trash page timeline grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssetMultiSelectManager.selectionActive = false;
    mockAssetMultiSelectManager.assets = [];
    mockFeatureFlagsManager.value.trash = true;
    globalThis.__timelineStubAssetCount = undefined;
  });

  afterEach(() => {
    globalThis.__timelineStubAssetCount = undefined;
  });

  it('renders desktop grouping controls and mobile grouping props for trash', async () => {
    renderPage();

    expect(await screen.findByTestId('timeline-desktop-grouping-control')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-grouping-day')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('timeline-mobile-grouping-props')).toHaveTextContent(
      JSON.stringify({ grouping: 'day', hasHandler: true }),
    );
    expect(screen.getByTestId('timeline-options')).toHaveTextContent('"isTrashed":true');
    expect(screen.getByTestId('timeline-options')).toHaveTextContent('"grouping":"day"');
  });

  it('year and month buckets keep trash options and show temporal chips', async () => {
    renderPage();

    await fireEvent.click(await screen.findByTestId('activate-year-bucket'));

    await waitFor(() => {
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"isTrashed":true');
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"grouping":"month"');
      expect(screen.getByTestId('active-filters-bar')).toHaveTextContent('2015');
      expect(screen.getByTestId('timeline-anchor')).toHaveTextContent('{"year":2015}');
    });

    await fireEvent.click(screen.getByTestId('activate-month-bucket'));

    await waitFor(() => {
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"grouping":"day"');
      expect(screen.getByTestId('active-filters-bar')).toHaveTextContent('Aug 2015');
      expect(screen.getByTestId('timeline-anchor')).toHaveTextContent('{"year":2015,"month":8}');
    });
  });

  it('singular temporal result count shows 1 result', async () => {
    renderPage();

    await fireEvent.click(await screen.findByTestId('activate-year-bucket'));

    expect(await screen.findByTestId('result-count')).toHaveTextContent('1 result');
  });

  it('manual grouping changes do not create temporal chips', async () => {
    renderPage();

    await fireEvent.click(await screen.findByTestId('timeline-grouping-year'));

    await waitFor(() => {
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"grouping":"year"');
    });
    expect(screen.queryByTestId('active-filters-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-anchor')).toHaveTextContent('null');
  });

  it('selection mode hides desktop grouping controls', () => {
    mockAssetMultiSelectManager.selectionActive = true;

    renderPage();

    expect(screen.queryByTestId('timeline-desktop-grouping-control')).not.toBeInTheDocument();
  });

  it('unfiltered empty placeholder does not render orphaned grouping controls', async () => {
    globalThis.__timelineStubAssetCount = 0;

    renderPage();

    await waitFor(() => {
      expect(screen.queryByTestId('timeline-desktop-grouping-control')).not.toBeInTheDocument();
    });
  });
});
