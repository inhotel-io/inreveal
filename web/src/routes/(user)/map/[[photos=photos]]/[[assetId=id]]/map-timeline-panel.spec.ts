import { createFilterState } from '$lib/components/filter-panel/filter-panel';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';

import MapTimelinePanel from './MapTimelinePanel.svelte';

const { mockAssetMultiSelectManager } = vi.hoisted(() => ({
  mockAssetMultiSelectManager: {
    selectionActive: false,
    assets: [],
    ownedAssets: [],
    clear: vi.fn(),
    getOwnedAssets: vi.fn(() => []),
    isAllFavorite: false,
    isAllArchived: false,
    isAllUserOwned: true,
  },
}));

vi.mock('$lib/components/timeline/Timeline.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/bindable-timeline.stub.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/shared-components/context-menu/button-context-menu.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/AssetSelectControlBar.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/ArchiveAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/ChangeDateAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/ChangeDescriptionAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/ChangeLocationAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/CreateSharedLinkAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/DeleteAssetsAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/DownloadAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/FavoriteAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/LinkLivePhotoAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/SelectAllAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/SetVisibilityAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/StackAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/actions/TagAction.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/elements/Portal.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({
  assetMultiSelectManager: mockAssetMultiSelectManager,
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: { preferences: { tags: { enabled: true } } },
}));

vi.mock('$lib/services/asset.service', () => ({
  getAssetBulkActions: vi.fn(() => ({})),
}));

function renderPanel(filters = createFilterState()) {
  return render(
    TestWrapper as Component<{ component: typeof MapTimelinePanel; componentProps: Record<string, unknown> }>,
    {
      component: MapTimelinePanel,
      componentProps: {
        bbox: { west: 1, south: 2, east: 3, north: 4 },
        selectedClusterIds: new Set(['asset-1', 'asset-2']),
        assetCount: 2,
        filters,
        onClose: vi.fn(),
      },
    },
  );
}

describe('MapTimelinePanel grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssetMultiSelectManager.selectionActive = false;
    mockAssetMultiSelectManager.assets = [];
    mockAssetMultiSelectManager.ownedAssets = [];
  });

  it('renders compact grouping controls and passes mobile grouping props', () => {
    renderPanel();

    expect(screen.getByTestId('timeline-desktop-grouping-control')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-mobile-grouping-props')).toHaveTextContent(
      JSON.stringify({ grouping: 'day', hasHandler: true }),
    );
  });

  it('manual grouping changes keep map bbox and selected cluster filters without temporal chips', async () => {
    renderPanel();

    await fireEvent.click(screen.getByTestId('timeline-grouping-year'));

    await waitFor(() => {
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"grouping":"year"');
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"assetFilter":{}');
      expect(screen.queryByTestId('active-filters-bar')).not.toBeInTheDocument();
    });
  });

  it('year bucket activation updates panel temporal filters and anchors the map panel', async () => {
    renderPanel(createFilterState());

    await fireEvent.click(screen.getByTestId('activate-year-bucket'));

    await waitFor(() => {
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"grouping":"month"');
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"takenAfter":"2015-01-01T00:00:00.000Z"');
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"takenBefore":"2016-01-01T00:00:00.000Z"');
      expect(screen.getByTestId('active-filters-bar')).toHaveTextContent('2015');
      expect(screen.getByTestId('timeline-anchor')).toHaveTextContent(JSON.stringify({ year: 2015 }));
    });
  });

  it('month bucket activation switches to day grouping and uses an exclusive month range', async () => {
    renderPanel(createFilterState());

    await fireEvent.click(screen.getByTestId('activate-month-bucket'));

    await waitFor(() => {
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"grouping":"day"');
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"takenAfter":"2015-08-01T00:00:00.000Z"');
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"takenBefore":"2015-09-01T00:00:00.000Z"');
      expect(screen.getByTestId('timeline-anchor')).toHaveTextContent(JSON.stringify({ year: 2015, month: 8 }));
    });
  });

  it('hides panel grouping controls while selection mode is active', () => {
    mockAssetMultiSelectManager.selectionActive = true;

    renderPanel();

    expect(screen.queryByTestId('timeline-desktop-grouping-control')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-mobile-grouping-props')).toHaveTextContent(
      JSON.stringify({ grouping: 'day', hasHandler: false }),
    );
  });
});
