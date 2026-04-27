import { sdkMock } from '$lib/__mocks__/sdk.mock';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { lang } from '$lib/stores/preferences.store';
import type { SharedSpaceMemberResponseDto, SharedSpaceResponseDto } from '@immich/sdk';
import { AssetTypeEnum, SharedSpaceRole } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import SpacesPage from './+page.svelte';

const { gotoMock, mockPage, mockAssetMultiSelectManager, mockAuthManager, mockEventManager } = vi.hoisted(() => ({
  gotoMock: vi.fn().mockResolvedValue(undefined),
  mockPage: {
    url: new URL('https://gallery.test/spaces/space-1/photos'),
    route: { id: '/(user)/spaces/[spaceId]/[[photos=photos]]/[[assetId=id]]' },
    params: { spaceId: 'space-1' },
  },
  mockAssetMultiSelectManager: {
    selectionActive: false,
    assets: [],
    clear: vi.fn(),
    isAllUserOwned: true,
  },
  mockAuthManager: {
    user: { id: 'user-1', isAdmin: false, name: 'Owner', email: 'owner@example.com' },
  },
  mockEventManager: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$app/state', () => ({ page: mockPage }));

vi.mock('$lib/components/layouts/user-page-layout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/OnEvents.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/filter-panel/filter-panel.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/bindable-filter-panel.stub.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/filter-panel/active-filters-bar.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/filter-panel/search-sort-dropdown.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/filter-panel/sort-toggle.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/sort-toggle.stub.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/search/smart-search-results.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/smart-search-results.stub.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/shared-components/context-menu/button-context-menu.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/spaces/space-map.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/spaces/space-panel.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/components/timeline/Timeline.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/bindable-timeline.stub.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({
  assetMultiSelectManager: mockAssetMultiSelectManager,
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mockAuthManager }));
vi.mock('$lib/managers/command-context-manager.svelte', () => ({ registerSpaceContext: vi.fn() }));
vi.mock('$lib/managers/event-manager.svelte', () => ({ eventManager: mockEventManager }));
vi.mock('$lib/utils/space-hero-storage', () => ({
  loadHeroCollapsed: vi.fn().mockReturnValue(false),
  persistHeroCollapsed: vi.fn(),
}));

function makeSpace(overrides: Partial<SharedSpaceResponseDto> = {}): SharedSpaceResponseDto {
  return {
    id: 'space-1',
    name: 'Test Space',
    createdById: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assetCount: 3,
    memberCount: 1,
    faceRecognitionEnabled: false,
    hasPets: false,
    petsEnabled: false,
    color: 'primary',
    recentAssetIds: [],
    recentAssetThumbhashes: [],
    members: [],
    thumbnailAssetId: null,
    thumbnailCropY: null,
    newAssetCount: 0,
    ...overrides,
  } as SharedSpaceResponseDto;
}

function makeMember(overrides: Partial<SharedSpaceMemberResponseDto> = {}): SharedSpaceMemberResponseDto {
  return {
    userId: 'user-1',
    email: 'owner@example.com',
    name: 'Owner',
    role: SharedSpaceRole.Owner,
    showInTimeline: true,
    joinedAt: '2026-01-01T00:00:00.000Z',
    contributionCount: 0,
    ...overrides,
  };
}

function renderPage() {
  const props = {
    data: {
      space: makeSpace(),
      members: [makeMember()],
      meta: { title: 'Test Space' },
    },
  };

  return render(TestWrapper as Component<{ component: typeof SpacesPage; componentProps: typeof props }>, {
    component: SpacesPage,
    componentProps: props,
  });
}

describe('Spaces page search URL state', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    gotoMock.mockResolvedValue(undefined);
    mockAssetMultiSelectManager.selectionActive = false;
    mockAssetMultiSelectManager.assets = [];
    mockPage.url = new URL('https://gallery.test/spaces/space-1/photos');
    lang.set('de');
    vi.mocked(sdkMock.markSpaceViewed).mockResolvedValue(void 0 as never);
    sdkMock.getSpaceActivities.mockResolvedValue([]);
    sdkMock.getSpacePeople.mockResolvedValue([]);
    sdkMock.getFilterSuggestions.mockResolvedValue({
      people: [],
      countries: [],
      cameraMakes: [],
      tags: [],
      ratings: [],
      mediaTypes: [],
      hasUnnamedPeople: false,
    });
    sdkMock.searchSmartFacets.mockResolvedValue({
      total: 7,
      timeBuckets: [{ timeBucket: '2024-03-01', count: 7 }],
      countries: ['Norway'],
      cities: ['Bergen'],
      cameraMakes: ['Fuji'],
      cameraModels: ['X-T5'],
      tags: [{ id: 'tag-1', value: 'Hike' }],
      people: [{ id: 'space-person-1', name: 'Ada' }],
      ratings: [5],
      mediaTypes: [AssetTypeEnum.Image],
      hasUnnamedPeople: false,
    });
    sdkMock.getSearchSuggestions.mockResolvedValue([]);
  });

  it('renders search results from q without a local search input', () => {
    mockPage.url = new URL('https://gallery.test/spaces/space-1/photos?q=beach');

    renderPage();

    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('sort-toggle')).not.toBeInTheDocument();
    expect(screen.getByTestId('smart-search-results')).toHaveAttribute('data-search-query', 'beach');
    expect(screen.getByTestId('smart-search-results')).toHaveAttribute('data-sort-order', 'relevance');
  });

  it('hydrates an explicit search sort from the URL', () => {
    mockPage.url = new URL('https://gallery.test/spaces/space-1/photos?q=beach&sort=asc');

    renderPage();

    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('sort-toggle')).not.toBeInTheDocument();
    expect(screen.getByTestId('smart-search-results')).toHaveAttribute('data-search-query', 'beach');
    expect(screen.getByTestId('smart-search-results')).toHaveAttribute('data-sort-order', 'asc');
  });

  it('exposes favorites in the spaces filter panel', () => {
    renderPage();

    expect(screen.getByTestId('filter-panel-stub')).toHaveAttribute(
      'data-sections',
      'timeline,people,location,camera,tags,rating,media,favorites',
    );
  });

  it('narrows space search results and facets to favorites within the space when selected', async () => {
    mockPage.url = new URL('https://gallery.test/spaces/space-1/photos?q=beach');

    renderPage();
    await vi.waitFor(() => expect(sdkMock.searchSmartFacets).toHaveBeenCalledTimes(1));
    await fireEvent.click(screen.getByTestId('select-favorites-filter'));

    await waitFor(() => {
      expect(screen.getByTestId('smart-search-results')).toHaveAttribute('data-is-favorite', 'true');
      expect(screen.getByTestId('smart-search-results')).toHaveAttribute('data-space-id', 'space-1');
      expect(sdkMock.searchSmartFacets).toHaveBeenCalledTimes(2);
    });
    expect(sdkMock.searchSmartFacets.mock.calls[1][0].smartSearchFacetsDto).toMatchObject({
      query: 'beach',
      isFavorite: true,
      spaceId: 'space-1',
    });
    expect(sdkMock.searchSmartFacets.mock.calls[1][0].smartSearchFacetsDto).not.toHaveProperty('withSharedSpaces');
  });

  it('fetches smart facets with spaceId for committed space search', async () => {
    mockPage.url = new URL('https://gallery.test/spaces/space-1/photos?q=beach');

    renderPage();

    await vi.waitFor(() => {
      expect(sdkMock.searchSmartFacets).toHaveBeenCalledWith(
        {
          smartSearchFacetsDto: expect.objectContaining({
            query: 'beach',
            language: 'de',
            spaceId: 'space-1',
          }),
        },
        expect.objectContaining({ signal: expect.any(Object) }),
      );
    });
    await vi.waitFor(() => expect(screen.getByTestId('smart-search-results')).toHaveAttribute('data-total', '7'));
    expect(screen.getByTestId('smart-search-results')).toHaveAttribute('data-language', 'de');
  });

  it('does not include withSharedSpaces or order in the space facets payload', async () => {
    mockPage.url = new URL('https://gallery.test/spaces/space-1/photos?q=beach&sort=asc');

    renderPage();

    await vi.waitFor(() => expect(sdkMock.searchSmartFacets).toHaveBeenCalled());
    const dto = sdkMock.searchSmartFacets.mock.calls[0][0].smartSearchFacetsDto;
    expect(dto).not.toHaveProperty('withSharedSpaces');
    expect(dto).not.toHaveProperty('order');
  });

  it('uses smart facet timeBuckets in space search mode', async () => {
    mockPage.url = new URL('https://gallery.test/spaces/space-1/photos?q=beach');

    renderPage();

    await vi.waitFor(() => {
      expect(screen.getByTestId('filter-panel-stub')).toHaveAttribute(
        'data-time-buckets',
        JSON.stringify([{ timeBucket: '2024-03-01', count: 7 }]),
      );
    });
  });

  it('preserves previous space facet total and buckets when a later facet fetch fails', async () => {
    mockPage.url = new URL('https://gallery.test/spaces/space-1/photos?q=beach');
    renderPage();
    await vi.waitFor(() => expect(screen.getByTestId('smart-search-results')).toHaveAttribute('data-total', '7'));

    sdkMock.searchSmartFacets.mockRejectedValueOnce(new Error('facets failed'));
    await fireEvent.click(screen.getByTestId('filter-panel-set-country'));

    await vi.waitFor(() => expect(sdkMock.searchSmartFacets).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('smart-search-results')).toHaveAttribute('data-total', '7');
    expect(screen.getByTestId('filter-panel-stub')).toHaveAttribute(
      'data-time-buckets',
      JSON.stringify([{ timeBucket: '2024-03-01', count: 7 }]),
    );
  });

  it('refetches space smart facets when an active filter changes', async () => {
    mockPage.url = new URL('https://gallery.test/spaces/space-1/photos?q=beach');
    renderPage();
    await vi.waitFor(() => expect(sdkMock.searchSmartFacets).toHaveBeenCalledTimes(1));

    await fireEvent.click(screen.getByTestId('filter-panel-set-country'));

    await vi.waitFor(() => expect(sdkMock.searchSmartFacets).toHaveBeenCalledTimes(2));
    expect(sdkMock.searchSmartFacets.mock.calls[1][0].smartSearchFacetsDto).toMatchObject({
      query: 'beach',
      country: 'Germany',
      spaceId: 'space-1',
    });
    expect(screen.getByTestId('smart-search-results')).toHaveAttribute('data-country', 'Germany');
  });

  it('refetches space smart facets when the search language changes', async () => {
    mockPage.url = new URL('https://gallery.test/spaces/space-1/photos?q=beach');
    renderPage();
    await vi.waitFor(() => expect(sdkMock.searchSmartFacets).toHaveBeenCalledTimes(1));

    lang.set('fr');

    await vi.waitFor(() => expect(sdkMock.searchSmartFacets).toHaveBeenCalledTimes(2));
    expect(sdkMock.searchSmartFacets.mock.calls[1][0].smartSearchFacetsDto).toMatchObject({
      query: 'beach',
      language: 'fr',
      spaceId: 'space-1',
    });
    expect(screen.getByTestId('smart-search-results')).toHaveAttribute('data-language', 'fr');
  });
});
