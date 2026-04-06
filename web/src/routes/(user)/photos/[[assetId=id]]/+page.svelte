<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import ActiveFiltersBar from '$lib/components/filter-panel/active-filters-bar.svelte';
  import FilterPanel from '$lib/components/filter-panel/filter-panel.svelte';
  import SmartSearchResults from '$lib/components/search/smart-search-results.svelte';
  import {
    buildFilterContext,
    clearFilters,
    createFilterState,
    getActiveFilterCount,
    type FilterPanelConfig,
    type FilterState,
  } from '$lib/components/filter-panel/filter-panel';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/button-context-menu.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/empty-placeholder.svelte';
  import ArchiveAction from '$lib/components/timeline/actions/ArchiveAction.svelte';
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '$lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import CreateSharedLink from '$lib/components/timeline/actions/CreateSharedLinkAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '$lib/components/timeline/actions/FavoriteAction.svelte';
  import LinkLivePhotoAction from '$lib/components/timeline/actions/LinkLivePhotoAction.svelte';
  import RotateAction from '$lib/components/timeline/actions/RotateAction.svelte';
  import SelectAllAssets from '$lib/components/timeline/actions/SelectAllAction.svelte';
  import SetVisibilityAction from '$lib/components/timeline/actions/SetVisibilityAction.svelte';
  import StackAction from '$lib/components/timeline/actions/StackAction.svelte';
  import TagAction from '$lib/components/timeline/actions/TagAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { AssetAction } from '$lib/constants';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { registerSelectionContext } from '$lib/managers/command-context-manager.svelte';
  import { memoryManager } from '$lib/managers/memory-manager.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import { Route } from '$lib/route';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import { lang } from '$lib/stores/preferences.store';
  import { createUrl, getAssetMediaUrl, memoryLaneTitle } from '$lib/utils';
  import { buildSearchablePageUrl, getSearchablePageState } from '$lib/utils/searchable-page-search';
  import {
    updateStackedAssetInTimeline,
    updateUnstackedAssetInTimeline,
    type OnLink,
    type OnUnlink,
  } from '$lib/utils/actions';
  import { openFileUploadDialog } from '$lib/utils/file-uploader';
  import { buildPhotosTimelineOptions, handlePhotosRemoveFilter } from '$lib/utils/photos-filter-options';
  import {
    buildSmartSearchFacetKey,
    buildSmartSearchFacetsParams,
    mapSmartSearchFacetsToFilterSuggestions,
  } from '$lib/utils/space-search';
  import { getAltText } from '$lib/utils/thumbnail-util';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import {
    AssetTypeEnum,
    getFilterSuggestions,
    getSearchSuggestions,
    searchSmartFacets,
    SearchSuggestionType,
    type SmartSearchFacetsResponseDto,
  } from '@immich/sdk';
  import { ActionButton, CommandPaletteDefaultProvider, ImageCarousel, type CarouselImageItem } from '@immich/ui';
  import { mdiDotsVertical } from '@mdi/js';
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { SvelteMap } from 'svelte/reactivity';

  type DemoMemoryCarouselItem = CarouselImageItem & { shouldGlow: boolean };

  let timelineManager = $state<TimelineManager>() as TimelineManager;

  // Demo mode: glow effect on filter panel to draw attention
  const DEMO_FILTER_CLICKED_KEY = 'demo-filter-panel-clicked';
  const DEMO_MEMORY_CLICKED_KEY = 'demo-south-africa-memory-clicked';
  const DEMO_MEMORY_TITLE = 'Your recent trip to South Africa';
  let filterDismissed = $state(!!globalThis.localStorage?.getItem(DEMO_FILTER_CLICKED_KEY));
  let memoryDismissed = $state(!!globalThis.localStorage?.getItem(DEMO_MEMORY_CLICKED_KEY));
  let showFilterGlow = $derived(authManager.isDemo && !filterDismissed);
  let showMemoryGlow = $derived(authManager.isDemo && !memoryDismissed);
  let showDemoGlow = $derived(showFilterGlow || showMemoryGlow);

  function onFilterPanelClick() {
    if (showFilterGlow) {
      filterDismissed = true;
      globalThis.localStorage?.setItem(DEMO_FILTER_CLICKED_KEY, 'true');
    }
  }

  function onMemoryClick(item: DemoMemoryCarouselItem) {
    if (item.shouldGlow) {
      memoryDismissed = true;
      globalThis.localStorage?.setItem(DEMO_MEMORY_CLICKED_KEY, 'true');
    }
  }

  $effect(() => {
    if (!showDemoGlow) {
      return;
    }
    const id = 'demo-glow-keyframes';
    if (document.getElementById(id)) {
      return;
    }
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `@keyframes demo-glow-pulse{0%,100%{box-shadow:0 0 4px 1px oklch(.65 .2 250/.3)}50%{box-shadow:0 0 12px 3px oklch(.65 .2 250/.5)}}`;
    document.head.append(style);
  });
  // Filter state
  const initialSearchState = getSearchablePageState(page.url);
  let filters = $state<FilterState>({
    ...createFilterState(),
    sortOrder: initialSearchState.sortOrder,
  });
  let committedQuery = $state(initialSearchState.query);
  let lastHandledSearchState = $state(`${initialSearchState.query}:${initialSearchState.sortOrder}`);
  let isLoading = $state(false);
  const showSearchResults = $derived(committedQuery.trim().length > 0);
  const options = $derived(buildPhotosTimelineOptions(filters));
  let personNames = new SvelteMap<string, string>();
  let tagNames = new SvelteMap<string, string>();
  let smartFacets = $state<SmartSearchFacetsResponseDto>();
  let smartFacetKey = $state('');
  let smartFacetInFlight:
    | {
        key: string;
        controller: AbortController;
        promise: Promise<SmartSearchFacetsResponseDto | undefined>;
      }
    | undefined;

  const timelineBuckets = $derived(
    timelineManager?.months?.map((m) => ({
      timeBucket: `${m.yearMonth.year}-${String(m.yearMonth.month).padStart(2, '0')}-01T00:00:00.000Z`,
      count: m.assetsCount,
    })) ?? [],
  );
  const smartFacetBuckets = $derived(showSearchResults ? (smartFacets?.timeBuckets ?? []) : timelineBuckets);
  const smartFacetTotal = $derived(showSearchResults ? smartFacets?.total : undefined);

  const emptyFilterSuggestions = () => ({
    countries: [],
    cities: [],
    cameraMakes: [],
    cameraModels: [],
    tags: [],
    people: [],
    ratings: [],
    mediaTypes: [],
    hasUnnamedPeople: false,
  });

  const loadPhotoFilterSuggestions = async (nextFilters: FilterState) => {
    const context = buildFilterContext(nextFilters);
    const response = await getFilterSuggestions({
      personIds: nextFilters.personIds.length > 0 ? nextFilters.personIds : undefined,
      country: nextFilters.country,
      city: nextFilters.city,
      make: nextFilters.make,
      model: nextFilters.model,
      tagIds: nextFilters.tagIds.length > 0 ? nextFilters.tagIds : undefined,
      rating: nextFilters.rating,
      mediaType:
        nextFilters.mediaType === 'all'
          ? undefined
          : nextFilters.mediaType === 'image'
            ? AssetTypeEnum.Image
            : AssetTypeEnum.Video,
      isFavorite: nextFilters.isFavorite,
      takenAfter: context?.takenAfter,
      takenBefore: context?.takenBefore,
      ...(nextFilters.isFavorite === undefined ? { withSharedSpaces: true } : {}),
    });
    const mappedPeople = response.people.map((p) => ({
      id: p.id,
      name: p.name,
      thumbnailUrl: createUrl(`/people/${p.id}/thumbnail`),
    }));
    for (const p of response.people) {
      personNames.set(p.id, p.name);
    }
    for (const t of response.tags) {
      tagNames.set(t.id, t.value);
    }
    return {
      countries: response.countries,
      cameraMakes: response.cameraMakes,
      tags: response.tags.map((t) => ({ id: t.id, name: t.value })),
      people: mappedPeople,
      ratings: response.ratings,
      mediaTypes: response.mediaTypes,
      hasUnnamedPeople: response.hasUnnamedPeople,
    };
  };

  async function loadPhotoSmartFacets(nextFilters: FilterState): Promise<SmartSearchFacetsResponseDto | undefined> {
    const query = committedQuery.trim();
    if (!query) {
      return undefined;
    }

    const withSharedSpaces = nextFilters.isFavorite === undefined;
    const key = buildSmartSearchFacetKey({ query, filters: nextFilters, withSharedSpaces, language: $lang });
    if (smartFacets && smartFacetKey === key) {
      return smartFacets;
    }
    if (smartFacetInFlight?.key === key) {
      return smartFacetInFlight.promise;
    }

    smartFacetInFlight?.controller.abort();
    const controller = new AbortController();

    const promise = searchSmartFacets(
      {
        smartSearchFacetsDto: buildSmartSearchFacetsParams({
          query,
          filters: nextFilters,
          withSharedSpaces,
          language: $lang,
        }),
      },
      { signal: controller.signal },
    )
      .then((result) => {
        if (smartFacetInFlight?.key === key && !controller.signal.aborted) {
          smartFacets = result;
          smartFacetKey = key;
        }
        return result;
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error('Failed to fetch smart search facets:', error);
        }
        return smartFacets;
      })
      .finally(() => {
        if (smartFacetInFlight?.key === key) {
          smartFacetInFlight = undefined;
        }
      });

    smartFacetInFlight = { key, controller, promise };
    return promise;
  }

  const normalProviders: NonNullable<FilterPanelConfig['providers']> = {
    cities: (country, context) =>
      getSearchSuggestions({
        $type: SearchSuggestionType.City,
        country,
        ...context,
        ...(context?.isFavorite === undefined ? { withSharedSpaces: true } : {}),
      }),
    cameraModels: (make, context) =>
      getSearchSuggestions({
        $type: SearchSuggestionType.CameraModel,
        make,
        ...context,
        ...(context?.isFavorite === undefined ? { withSharedSpaces: true } : {}),
      }),
  };

  const filterConfig: FilterPanelConfig = {
    sections: ['timeline', 'people', 'location', 'camera', 'tags', 'rating', 'media', 'favorites'],
    suggestionsProvider: async (nextFilters: FilterState) => {
      if (!showSearchResults) {
        return loadPhotoFilterSuggestions(nextFilters);
      }

      const facets = await loadPhotoSmartFacets(nextFilters);
      if (!facets) {
        return emptyFilterSuggestions();
      }

      for (const p of facets.people) {
        personNames.set(p.id, p.name);
      }
      for (const t of facets.tags) {
        tagNames.set(t.id, t.value);
      }
      return mapSmartSearchFacetsToFilterSuggestions(facets);
    },
    providers: {
      ...normalProviders,
      cities: async (country, context) => {
        if (!showSearchResults) {
          return normalProviders.cities?.(country, context) ?? [];
        }
        const query = committedQuery.trim();
        if (!query) {
          return [];
        }
        const facets = await searchSmartFacets({
          smartSearchFacetsDto: buildSmartSearchFacetsParams({
            query,
            filters: { ...filters, country },
            withSharedSpaces: filters.isFavorite === undefined,
            language: $lang,
          }),
        });
        return facets.cities;
      },
      cameraModels: async (make, context) => {
        if (!showSearchResults) {
          return normalProviders.cameraModels?.(make, context) ?? [];
        }
        const query = committedQuery.trim();
        if (!query) {
          return [];
        }
        const facets = await searchSmartFacets({
          smartSearchFacetsDto: buildSmartSearchFacetsParams({
            query,
            filters: { ...filters, make },
            withSharedSpaces: filters.isFavorite === undefined,
            language: $lang,
          }),
        });
        return facets.cameraModels;
      },
    },
  };

  const hasActiveFilters = $derived(getActiveFilterCount(filters) > 0 || showSearchResults);
  const totalAssetCount = $derived(timelineManager?.assetCount ?? 0);
  const isTimelineEmpty = $derived(timelineManager?.isInitialized && totalAssetCount === 0 && !hasActiveFilters);

  let selectedAssets = $derived(assetMultiSelectManager.assets);
  let isAssetStackSelected = $derived(selectedAssets.length === 1 && !!selectedAssets[0].stack);
  let isLinkActionAvailable = $derived.by(() => {
    const isLivePhoto = selectedAssets.length === 1 && !!selectedAssets[0].livePhotoVideoId;
    const isLivePhotoCandidate =
      selectedAssets.length === 2 &&
      selectedAssets.some((asset) => asset.isImage) &&
      selectedAssets.some((asset) => asset.isVideo);

    return assetMultiSelectManager.isAllUserOwned && (isLivePhoto || isLivePhotoCandidate);
  });

  const handleEscape = () => {
    if (assetViewerManager.isViewing) {
      return;
    }
    if (assetMultiSelectManager.selectionActive) {
      assetMultiSelectManager.clear();
      return;
    }
  };

  const handleLink: OnLink = ({ still, motion }) => {
    timelineManager.removeAssets([motion.id]);
    timelineManager.upsertAssets([still]);
  };

  const handleUnlink: OnUnlink = ({ still, motion }) => {
    timelineManager.upsertAssets([motion]);
    timelineManager.upsertAssets([still]);
  };

  const handleSetVisibility = (assetIds: string[]) => {
    timelineManager.removeAssets(assetIds);
    assetMultiSelectManager.clear();
  };

  registerSelectionContext({
    getAssets: () => assetMultiSelectManager.assets,
    clearSelection: () => assetMultiSelectManager.clear(),
    canAddToAlbum: () => true,
    canAddToSpace: () => true,
    getOnFavorite: () =>
      timelineManager
        ? (ids, isFavorite) => timelineManager.update(ids, (asset) => (asset.isFavorite = isFavorite))
        : undefined,
    getOnArchive: () =>
      timelineManager
        ? (ids, visibility) => timelineManager.update(ids, (asset) => (asset.visibility = visibility))
        : undefined,
    getOnDelete: () => (timelineManager ? (assetIds) => timelineManager.removeAssets(assetIds) : undefined),
    getOnUndoDelete: () => (timelineManager ? (assets) => timelineManager.upsertAssets(assets) : undefined),
  });

  function clearSearch() {
    isLoading = false;
    const nextUrl = buildSearchablePageUrl(page.url, '');
    if (!nextUrl) {
      return;
    }
    void goto(nextUrl, { replaceState: true, keepFocus: true, noScroll: true });
  }

  $effect(() => {
    const nextSearchState = getSearchablePageState(page.url);
    const nextToken = `${nextSearchState.query}:${nextSearchState.sortOrder}`;

    if (nextToken === lastHandledSearchState) {
      return;
    }

    const queryChanged = nextSearchState.query !== committedQuery;
    untrack(() => {
      committedQuery = nextSearchState.query;
      isLoading = false;
      filters = { ...filters, sortOrder: nextSearchState.sortOrder };
      if (queryChanged) {
        smartFacetInFlight?.controller.abort();
        smartFacets = undefined;
        smartFacetKey = '';
        smartFacetInFlight = undefined;
      }
      lastHandledSearchState = nextToken;
    });
  });

  const items = $derived.by((): DemoMemoryCarouselItem[] =>
    memoryManager.memories.map((memory) => {
      const title = $memoryLaneTitle(memory);

      return {
        id: memory.id,
        title,
        href: Route.memoryViewer({ id: memory.assets[0].id }),
        alt: $t('memory_lane_title', { values: { title: $getAltText(toTimelineAsset(memory.assets[0])) } }),
        src: getAssetMediaUrl({ id: memory.assets[0].id }),
        shouldGlow: showMemoryGlow && title === DEMO_MEMORY_TITLE,
      };
    }),
  );
</script>

<UserPageLayout hideNavbar={assetMultiSelectManager.selectionActive} scrollbar={false}>
  <div class="flex h-full">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="h-full"
      role="presentation"
      onclick={onFilterPanelClick}
      style={showFilterGlow ? 'animation: demo-glow-pulse 2s ease-in-out infinite; border-radius: 0' : ''}
    >
      {#key showSearchResults ? `photos-search-${committedQuery.trim()}:${$lang}` : 'photos-browse'}
        <FilterPanel
          bind:filters
          config={filterConfig}
          timeBuckets={smartFacetBuckets}
          storageKey="gallery-filter-visible-sections-photos"
          hidden={isTimelineEmpty}
        />
      {/key}
    </div>
    <div class="flex flex-1 flex-col overflow-hidden pl-4">
      {#if hasActiveFilters}
        <ActiveFiltersBar
          {filters}
          searchQuery={committedQuery}
          onClearSearch={clearSearch}
          resultCount={showSearchResults ? smartFacetTotal : totalAssetCount}
          {personNames}
          {tagNames}
          onRemoveFilter={(type, id) => {
            filters = handlePhotosRemoveFilter(filters, type, id);
          }}
          onClearAll={() => {
            filters = clearFilters(filters);
          }}
        />
      {/if}
      {#if showSearchResults}
        <SmartSearchResults
          bind:isLoading
          searchQuery={committedQuery}
          {filters}
          language={$lang}
          isShared={false}
          withSharedSpaces={filters.isFavorite === undefined}
          total={smartFacetTotal}
        />
      {:else}
        <Timeline
          enableRouting={true}
          bind:timelineManager
          {options}
          assetInteraction={assetMultiSelectManager}
          removeAction={AssetAction.ARCHIVE}
          onEscape={handleEscape}
          withStacked
        >
          {#if authManager.preferences.memories.enabled && !hasActiveFilters}
            <ImageCarousel {items}>
              {#snippet child(item: DemoMemoryCarouselItem)}
                <a
                  class="demo-memory-card relative me-2 inline-block aspect-3/4 h-54 rounded-xl last:me-0 max-md:h-37.5 md:me-4 md:aspect-4/3 xl:aspect-video {item.shouldGlow
                    ? 'demo-memory-glow'
                    : ''}"
                  href={item.href}
                  onclick={() => onMemoryClick(item)}
                  style={item.shouldGlow ? 'animation: demo-glow-pulse 2s ease-in-out infinite' : ''}
                >
                  <img
                    class="h-full w-full rounded-xl object-cover"
                    src={item.src}
                    alt={item.alt ?? item.title}
                    draggable="false"
                  />
                  <div
                    class="absolute start-0 top-0 h-full w-full rounded-xl bg-linear-to-t from-black/40 via-transparent to-transparent transition-all hover:bg-black/20"
                  ></div>
                  <p
                    class="absolute start-4 bottom-2 w-[calc(100%-2rem)] whitespace-normal text-lg text-white max-md:text-sm"
                  >
                    {item.title}
                  </p>
                </a>
              {/snippet}
            </ImageCarousel>
          {/if}
          {#snippet empty()}
            <EmptyPlaceholder
              text={$t('no_assets_message')}
              onClick={() => openFileUploadDialog()}
              class="mt-10 mx-auto"
            />
          {/snippet}
        </Timeline>
      {/if}
    </div>
  </div>
</UserPageLayout>

{#if assetMultiSelectManager.selectionActive}
  <AssetSelectControlBar>
    {@const Actions = getAssetBulkActions($t)}
    <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />

    <CreateSharedLink />
    <SelectAllAssets {timelineManager} assetInteraction={assetMultiSelectManager} />
    <ActionButton action={Actions.AddToAlbum} />

    {#if assetMultiSelectManager.isAllUserOwned}
      <FavoriteAction
        removeFavorite={assetMultiSelectManager.isAllFavorite}
        onFavorite={(ids, isFavorite) => timelineManager.update(ids, (asset) => (asset.isFavorite = isFavorite))}
      />

      <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')}>
        <DownloadAction menuItem />
        {#if assetMultiSelectManager.assets.length > 1 || isAssetStackSelected}
          <StackAction
            unstack={isAssetStackSelected}
            onStack={(result) => updateStackedAssetInTimeline(timelineManager, result)}
            onUnstack={(assets) => updateUnstackedAssetInTimeline(timelineManager, assets)}
          />
        {/if}
        {#if isLinkActionAvailable}
          <LinkLivePhotoAction
            menuItem
            unlink={assetMultiSelectManager.assets.length === 1}
            onLink={handleLink}
            onUnlink={handleUnlink}
          />
        {/if}
        <RotateAction />
        <ChangeDate menuItem />
        <ChangeDescription menuItem />
        <ChangeLocation menuItem />
        <ArchiveAction
          menuItem
          onArchive={(ids, visibility) => timelineManager.update(ids, (asset) => (asset.visibility = visibility))}
        />
        {#if authManager.preferences.tags.enabled}
          <TagAction menuItem />
        {/if}
        <DeleteAssets
          menuItem
          onAssetDelete={(assetIds) => timelineManager.removeAssets(assetIds)}
          onUndoDelete={(assets) => timelineManager.upsertAssets(assets)}
        />
        <SetVisibilityAction menuItem onVisibilitySet={handleSetVisibility} />
        <hr />
        <ActionMenuItem action={Actions.RegenerateThumbnailJob} />
        <ActionMenuItem action={Actions.RefreshMetadataJob} />
        <ActionMenuItem action={Actions.TranscodeVideoJob} />
      </ButtonContextMenu>
    {:else}
      <DownloadAction />
    {/if}
  </AssetSelectControlBar>
{/if}

<style>
  .demo-memory-card {
    box-shadow:
      rgba(60, 64, 67, 0.3) 0px 1px 2px 0px,
      rgba(60, 64, 67, 0.15) 0px 1px 3px 1px;
  }
</style>
