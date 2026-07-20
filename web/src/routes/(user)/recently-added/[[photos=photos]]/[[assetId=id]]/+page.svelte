<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import ActiveFiltersBar from '$lib/components/filter-panel/active-filters-bar.svelte';
  import FilterPanel from '$lib/components/filter-panel/filter-panel.svelte';
  import FilterToolbar from '$lib/components/filter-panel/filter-toolbar.svelte';
  import {
    clearFilters,
    createFilterState,
    getActiveFilterCount,
    loadFilterCollapsed,
    type FilterState,
  } from '$lib/components/filter-panel/filter-panel';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/EmptyPlaceholder.svelte';
  import ArchiveAction from '$lib/components/timeline/actions/ArchiveAction.svelte';
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '$lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import CreateSharedLink from '$lib/components/timeline/actions/CreateSharedLinkAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '$lib/components/timeline/actions/FavoriteAction.svelte';
  import LinkLivePhotoAction from '$lib/components/timeline/actions/LinkLivePhotoAction.svelte';
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
  import { globalSearchManager } from '$lib/managers/global-search-manager.svelte';
  import { getTimelineTopVisibleAnchor } from '$lib/managers/timeline-manager/timeline-anchor';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineGrouping, TimelineTemporalAnchor } from '$lib/managers/timeline-manager/types';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import {
    updateStackedAssetInTimeline,
    updateUnstackedAssetInTimeline,
    type OnLink,
    type OnUnlink,
  } from '$lib/utils/actions';
  import { openFileUploadDialog } from '$lib/utils/file-uploader';
  import { withNameCapture } from '$lib/utils/filter-name-capture';
  import { handlePhotosRemoveFilter } from '$lib/utils/photos-filter-options';
  import { buildRecentlyAddedFilterConfig } from '$lib/utils/recently-added-filter-config';
  import {
    buildRecentlyAddedTimelineOptions,
    shouldShowRecentlyAddedCount,
  } from '$lib/utils/recently-added-filter-options';
  import {
    buildSearchablePageUrl,
    getSearchablePageFilterState,
    getSearchablePageState,
    preserveTransientTemporalFilters,
    type SearchablePageTransientTemporalState,
  } from '$lib/utils/searchable-page-search';
  import {
    getTimelineBucketZoomTarget,
    getTimelineManagerTimeBuckets,
    type ActivatableTimelineBucket,
  } from '$lib/utils/timeline-zoom-navigation';
  import { consumeTypedSearchNamesInto } from '$lib/utils/typed-search/typed-search-name-cache';
  import { ActionButton, CommandPaletteDefaultProvider } from '@immich/ui';
  import { mdiDotsVertical } from '@mdi/js';
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { SvelteMap } from 'svelte/reactivity';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  let timelineManager = $state<TimelineManager>() as TimelineManager;

  // Filter state
  const initialSearchState = getSearchablePageState(page.url);
  const initialFilterState = getSearchablePageFilterState(page.url);
  let filters = $state<FilterState>({
    ...createFilterState(),
    dateAfter: undefined,
    dateBefore: undefined,
    selectedYear: undefined,
    selectedMonth: undefined,
    ...initialFilterState,
    sortOrder: initialSearchState.sortOrder,
  });
  let filtersBeforePanelChange: FilterState = {
    ...createFilterState(),
    dateAfter: undefined,
    dateBefore: undefined,
    selectedYear: undefined,
    selectedMonth: undefined,
    ...initialFilterState,
    sortOrder: initialSearchState.sortOrder,
  };
  let timelineGrouping = $state<TimelineGrouping>('day');
  let temporalAnchor = $state<TimelineTemporalAnchor | undefined>();
  let lastHandledSearchState = $state(`${initialSearchState.query}:${initialSearchState.sortOrder}:${page.url.search}`);
  let pendingFilterUrlSync = $state<
    { url: string; transientTemporal?: SearchablePageTransientTemporalState } | undefined
  >();
  const options = $derived({ ...buildRecentlyAddedTimelineOptions(filters), grouping: timelineGrouping });
  $effect(() => {
    filtersBeforePanelChange = filters;
  });
  let personNames = new SvelteMap<string, string>();
  let tagNames = new SvelteMap<string, string>();
  consumeTypedSearchNamesInto(page.url.pathname + page.url.search, personNames, tagNames);
  $effect(() => globalSearchManager.registerSearchablePageFilters(() => filters));

  const timelineBuckets = $derived(getTimelineManagerTimeBuckets(timelineManager));

  const filterConfig = withNameCapture(buildRecentlyAddedFilterConfig(), personNames, tagNames);

  const hasActiveFilters = $derived(getActiveFilterCount(filters) > 0);

  // Filter-panel collapse is driven here so a header filter button can reclaim the panel's space.
  let filterCollapsed = $state(loadFilterCollapsed());

  const assetCount = $derived(timelineManager?.assetCount ?? 0);
  const countLabel = $derived(
    shouldShowRecentlyAddedCount(assetCount, hasActiveFilters)
      ? $t('items_count', { values: { count: assetCount } })
      : undefined,
  );

  // Use the timeline's *loaded* result (for the current options) rather than a bare
  // `assetCount === 0`: clearing a filter that had 0 results would otherwise flip this true
  // for a tick (stale count, reload pending), unmounting the filter panel and dropping focus.
  const isTimelineEmpty = $derived(!!timelineManager?.isEmptyForOptions(options) && !hasActiveFilters);

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

  function syncFilterUrl(nextFilters: FilterState) {
    const currentSearchState = getSearchablePageState(page.url);
    // `buildSearchablePageUrl` writes an explicit `sort=` param whenever it is handed a literal
    // 'asc' | 'desc'; only 'relevance' clears it. `createFilterState()` defaults sortOrder to
    // 'desc', so passing it straight through would stamp `sort=desc` onto every filter URL the
    // user never asked for. Convert the *implicit* default to 'relevance' (= "no explicit sort")
    // and pass through anything the user actually chose. Photos does the same thing; its extra
    // free-text-query guard is query-mode-only and drops out here (this view has no query yet).
    const sortOrder =
      nextFilters.sortOrder === 'desc' && !currentSearchState.hasExplicitSort ? 'relevance' : nextFilters.sortOrder;
    const nextUrl = buildSearchablePageUrl(page.url, '', sortOrder, nextFilters);
    if (!nextUrl || nextUrl === page.url.pathname + page.url.search) {
      return;
    }
    pendingFilterUrlSync = {
      url: nextUrl,
      transientTemporal: {
        selectedYear: nextFilters.selectedYear,
        selectedMonth: nextFilters.selectedMonth,
      },
    };
    void goto(nextUrl, { replaceState: true, keepFocus: true, noScroll: true });
  }

  function handleFiltersChange(nextFilters: FilterState) {
    const temporalChanged =
      nextFilters.dateAfter !== filtersBeforePanelChange.dateAfter ||
      nextFilters.dateBefore !== filtersBeforePanelChange.dateBefore ||
      nextFilters.selectedYear !== filtersBeforePanelChange.selectedYear ||
      nextFilters.selectedMonth !== filtersBeforePanelChange.selectedMonth;

    if (temporalChanged) {
      temporalAnchor = undefined;
    }

    syncFilterUrl(nextFilters);
  }

  function handleTimelineBucketActivate(bucket: ActivatableTimelineBucket) {
    if (assetMultiSelectManager.selectionActive) {
      return;
    }

    const result = getTimelineBucketZoomTarget(bucket);
    if (!result) {
      return;
    }

    timelineGrouping = result.grouping;
    temporalAnchor = result.anchor;
  }

  function handleTimelineGroupingChange(grouping: TimelineGrouping) {
    const anchor = getTimelineTopVisibleAnchor(timelineManager);
    timelineGrouping = grouping;
    temporalAnchor = anchor;
  }

  function handleRemoveActiveFilter(type: string, id?: string) {
    const nextFilters = handlePhotosRemoveFilter(filters, type, id);
    if (type === 'timeline') {
      temporalAnchor = undefined;
    }
    filters = nextFilters;
    syncFilterUrl(nextFilters);
  }

  function handleClearAllFilters() {
    const nextFilters = clearFilters(filters);
    temporalAnchor = undefined;
    filters = nextFilters;
    syncFilterUrl(nextFilters);
  }

  $effect(() => {
    const nextSearchState = getSearchablePageState(page.url);
    const nextToken = `${nextSearchState.query}:${nextSearchState.sortOrder}:${page.url.search}`;
    const currentUrl = page.url.pathname + page.url.search;

    if (nextToken === lastHandledSearchState) {
      return;
    }

    untrack(() => {
      const filterState = getSearchablePageFilterState(page.url);
      const transientTemporal =
        pendingFilterUrlSync?.url === currentUrl ? pendingFilterUrlSync.transientTemporal : undefined;
      filters = {
        ...createFilterState(),
        ...preserveTransientTemporalFilters(filterState, transientTemporal),
        sortOrder: nextSearchState.sortOrder,
      };
      if (pendingFilterUrlSync?.url === currentUrl) {
        pendingFilterUrlSync = undefined;
      }
      consumeTypedSearchNamesInto(page.url.pathname + page.url.search, personNames, tagNames);
      lastHandledSearchState = nextToken;
    });
  });
</script>

<UserPageLayout
  hideNavbar={assetMultiSelectManager.selectionActive}
  title={data.meta.title}
  description={countLabel}
  scrollbar={false}
>
  <div class="flex h-full">
    <FilterPanel
      bind:filters
      bind:collapsed={filterCollapsed}
      externalToggle
      config={filterConfig}
      timeBuckets={timelineBuckets}
      storageKey="gallery-filter-visible-sections-recently-added"
      hidden={isTimelineEmpty}
      {personNames}
      {tagNames}
      onFiltersChange={handleFiltersChange}
    />
    <div class="flex flex-1 flex-col overflow-hidden pl-4">
      {#snippet recentlyAddedFiltersBar()}
        <ActiveFiltersBar
          embedded
          {filters}
          {personNames}
          {tagNames}
          onRemoveFilter={handleRemoveActiveFilter}
          onClearAll={handleClearAllFilters}
        />
      {/snippet}
      <FilterToolbar
        class="mb-2"
        grouping={timelineGrouping}
        onGroupingChange={handleTimelineGroupingChange}
        showGrouping={!assetMultiSelectManager.selectionActive}
        showFilters={hasActiveFilters}
        filters={recentlyAddedFiltersBar}
        showFilterButton={filterCollapsed && !isTimelineEmpty && !assetMultiSelectManager.selectionActive}
        filterActive={getActiveFilterCount(filters) > 0}
        onExpandFilters={() => (filterCollapsed = false)}
      />
      <Timeline
        enableRouting={true}
        bind:timelineManager
        {options}
        assetInteraction={assetMultiSelectManager}
        removeAction={AssetAction.ARCHIVE}
        onEscape={handleEscape}
        onTimelineBucketActivate={handleTimelineBucketActivate}
        {temporalAnchor}
        onTemporalAnchorResolved={() => (temporalAnchor = undefined)}
        grouping={timelineGrouping}
        onGroupingChange={handleTimelineGroupingChange}
        withStacked
      >
        {#snippet empty()}
          <EmptyPlaceholder
            text={$t('no_assets_message')}
            onClick={() => openFileUploadDialog()}
            class="mx-auto mt-10"
          />
        {/snippet}
      </Timeline>
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
