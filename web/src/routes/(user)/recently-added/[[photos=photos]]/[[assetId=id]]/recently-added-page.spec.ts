import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { goto } from '$app/navigation';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { buildRecentlyAddedTimelineOptions } from '$lib/utils/recently-added-filter-options';
import RecentlyAddedPage from './+page.svelte';

const { mockPage, mockAssetMultiSelectManager, mockAuthManager, mockRegisterSearchablePageFilters } = vi.hoisted(
  () => ({
    mockPage: {
      url: new URL('https://gallery.test/recently-added'),
      route: { id: '/(user)/recently-added/[[photos=photos]]/[[assetId=id]]' },
      params: {},
    },
    mockAssetMultiSelectManager: {
      selectionActive: false,
      assets: [],
      clear: vi.fn(),
      isAllUserOwned: true,
    },
    mockAuthManager: {
      preferences: { tags: { enabled: false } },
    },
    mockRegisterSearchablePageFilters: vi.fn(() => vi.fn()),
  }),
);

vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$app/state', () => ({ page: mockPage }));

vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/ActionMenuItem.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/filter-panel/active-filters-bar.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/active-filters-bar-actions.stub.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/filter-panel/filter-panel.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/bindable-filter-panel.stub.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/shared-components/context-menu/ButtonContextMenu.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/shared-components/EmptyPlaceholder.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/Timeline.svelte', async () => {
  const { default: MockComponent } =
    await import('../../../albums/[albumId=id]/[[photos=photos]]/[[assetId=id]]/mock-timeline.test-wrapper.svelte');
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

vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({
  assetMultiSelectManager: mockAssetMultiSelectManager,
}));

vi.mock('$lib/managers/asset-viewer-manager.svelte', () => ({
  assetViewerManager: { isViewing: false },
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: mockAuthManager,
}));

vi.mock('$lib/managers/global-search-manager.svelte', () => ({
  globalSearchManager: {
    registerSearchablePageFilters: mockRegisterSearchablePageFilters,
  },
}));

vi.mock('$lib/services/asset.service', () => ({
  getAssetBulkActions: vi.fn(() => ({})),
}));

vi.mock('$lib/utils/file-uploader', () => ({
  openFileUploadDialog: vi.fn(),
}));

vi.mock('$lib/utils/recently-added-filter-options', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/utils/recently-added-filter-options')>();
  return {
    ...actual,
    buildRecentlyAddedTimelineOptions: vi.fn(actual.buildRecentlyAddedTimelineOptions),
  };
});

type RecentlyAddedPageProps = { data: { meta: { title: string } } };

function renderPage() {
  return render(
    TestWrapper as Component<{ component: typeof RecentlyAddedPage; componentProps: RecentlyAddedPageProps }>,
    {
      component: RecentlyAddedPage,
      componentProps: { data: { meta: { title: 'Recently added' } } },
    },
  );
}

describe('Recently Added page filters', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPage.url = new URL('https://gallery.test/recently-added');
    mockAssetMultiSelectManager.selectionActive = false;
    mockAssetMultiSelectManager.assets = [];
    mockRegisterSearchablePageFilters.mockReturnValue(vi.fn());
    sdkMock.getFilterSuggestions.mockResolvedValue({
      people: [],
      countries: [],
      cameraMakes: [],
      tags: [],
      ratings: [],
      mediaTypes: [],
      hasUnnamedPeople: false,
    });
    sdkMock.getSearchSuggestions.mockResolvedValue([]);
  });

  it('derives timeline options from the filters — orderBy CreatedAt, no withSharedSpaces', async () => {
    renderPage();

    await waitFor(() => {
      expect(buildRecentlyAddedTimelineOptions).toHaveBeenCalled();
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"orderBy":"createdAt"');
      expect(screen.getByTestId('timeline-options')).not.toHaveTextContent('"withSharedSpaces"');
    });
  });

  it('seeds filter state from the URL on load (deep link, e.g. ?rating=5)', async () => {
    mockPage.url = new URL('https://gallery.test/recently-added?rating=5');

    renderPage();

    await waitFor(() => {
      expect(buildRecentlyAddedTimelineOptions).toHaveBeenCalledWith(expect.objectContaining({ rating: 5 }));
      expect(screen.getByTestId('timeline-options')).toHaveTextContent('"rating":5');
    });
  });

  it('writes filter changes to the URL via goto', async () => {
    renderPage();

    await fireEvent.click(await screen.findByTestId('filter-panel-set-country'));

    expect(goto).toHaveBeenCalledWith('/recently-added?country=Germany', {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  });

  it('clearing all filters removes the filter params from the URL', async () => {
    mockPage.url = new URL('https://gallery.test/recently-added?people=person-1&city=Berlin');

    renderPage();
    await fireEvent.click(await screen.findByTestId('active-filters-clear-all'));

    expect(goto).toHaveBeenLastCalledWith('/recently-added', {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  });

  it('registers its filters with globalSearchManager (registerSearchablePageFilters called)', async () => {
    renderPage();

    await waitFor(() => expect(mockRegisterSearchablePageFilters).toHaveBeenCalledOnce());
  });

  it("passes the nine sections to the filter panel, and no 'text' section", async () => {
    renderPage();

    const panel = await screen.findByTestId('filter-panel-stub');

    expect(panel).toHaveAttribute(
      'data-sections',
      'timeline,people,location,camera,tags,rating,media,favorites,albums',
    );
    expect(panel.dataset.sections).not.toContain('text');
  });
});
