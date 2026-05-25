<script lang="ts">
  import { goto } from '$app/navigation';
  import { createFilterState } from '$lib/components/filter-panel/filter-panel';
  import ControlAppBar from '$lib/components/shared-components/control-app-bar.svelte';
  import CreateSharedLink from '$lib/components/timeline/actions/CreateSharedLinkAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import TimelineRouteGroupingBar from '$lib/components/timeline/TimelineRouteGroupingBar.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineGrouping, TimelineTemporalAnchor } from '$lib/managers/timeline-manager/types';
  import { Route } from '$lib/route';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import {
    clearTimelineTemporalFilter,
    getTimelineBucketZoomTarget,
    type ActivatableTimelineBucket,
  } from '$lib/utils/timeline-filter-navigation';
  import { buildTimelineRouteOptions } from '$lib/utils/timeline-route-options';
  import { AssetVisibility } from '@immich/sdk';
  import { ActionButton, CommandPaletteDefaultProvider } from '@immich/ui';
  import { mdiArrowLeft } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let timelineManager = $state<TimelineManager>() as TimelineManager;
  let timelineFilters = $state(createFilterState());
  let timelineGrouping = $state<TimelineGrouping>('day');
  let temporalAnchor = $state<TimelineTemporalAnchor | undefined>();
  const baseTimelineOptions = $derived({
    userId: data.partner.id,
    visibility: AssetVisibility.Timeline,
    withStacked: true,
  });
  const options = $derived(buildTimelineRouteOptions(baseTimelineOptions, timelineFilters, timelineGrouping));
  const hasTemporalFilters = $derived(
    Boolean(
      timelineFilters.dateAfter ||
      timelineFilters.dateBefore ||
      timelineFilters.selectedYear ||
      timelineFilters.selectedMonth,
    ),
  );
  const hideGroupingControls = $derived(
    assetMultiSelectManager.selectionActive ||
      (!hasTemporalFilters && Boolean(timelineManager?.isInitialized && timelineManager.assetCount === 0)),
  );

  const handleEscape = () => {
    if (assetMultiSelectManager.selectionActive) {
      assetMultiSelectManager.clear();
      return;
    }
  };

  function handleTimelineGroupingChange(grouping: TimelineGrouping) {
    timelineGrouping = grouping;
    temporalAnchor = undefined;
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

  function clearRouteTemporalFilter() {
    timelineFilters = clearTimelineTemporalFilter(timelineFilters);
    temporalAnchor = undefined;
  }
</script>

<main class="relative h-dvh overflow-hidden px-2 md:px-6 max-md:pt-(--navbar-height-md) pt-(--navbar-height)">
  <TimelineRouteGroupingBar
    grouping={timelineGrouping}
    filters={timelineFilters}
    resultCount={timelineManager?.assetCount}
    hidden={hideGroupingControls}
    onGroupingChange={handleTimelineGroupingChange}
    onClearTemporalFilter={clearRouteTemporalFilter}
  />
  <Timeline
    enableRouting={true}
    bind:timelineManager
    {options}
    assetInteraction={assetMultiSelectManager}
    onEscape={handleEscape}
    {temporalAnchor}
    onTimelineBucketActivate={handleTimelineBucketActivate}
    onTemporalAnchorResolved={() => (temporalAnchor = undefined)}
    grouping={timelineGrouping}
    onGroupingChange={handleTimelineGroupingChange}
  />
</main>

{#if assetMultiSelectManager.selectionActive}
  <AssetSelectControlBar>
    {@const Actions = getAssetBulkActions($t)}
    <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />
    <CreateSharedLink />
    <ActionButton action={Actions.AddToAlbum} />
    <DownloadAction />
  </AssetSelectControlBar>
{:else}
  <ControlAppBar showBackButton backIcon={mdiArrowLeft} onClose={() => goto(Route.sharing())}>
    {#snippet leading()}
      <p class="whitespace-nowrap text-immich-fg dark:text-immich-dark-fg">
        {$t('partner_list_user_photos', { values: { user: data.partner.name } })}
      </p>
    {/snippet}
  </ControlAppBar>
{/if}
