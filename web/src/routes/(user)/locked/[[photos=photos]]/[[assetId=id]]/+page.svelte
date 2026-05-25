<script lang="ts">
  import { goto } from '$app/navigation';
  import { createFilterState } from '$lib/components/filter-panel/filter-panel';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/button-context-menu.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/empty-placeholder.svelte';
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import SelectAllAssets from '$lib/components/timeline/actions/SelectAllAction.svelte';
  import SetVisibilityAction from '$lib/components/timeline/actions/SetVisibilityAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import TimelineRouteGroupingBar from '$lib/components/timeline/TimelineRouteGroupingBar.svelte';
  import { AssetAction } from '$lib/constants';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineGrouping, TimelineTemporalAnchor } from '$lib/managers/timeline-manager/types';
  import { Route } from '$lib/route';
  import { getUserActions } from '$lib/services/user.service';
  import {
    clearTimelineTemporalFilter,
    getTimelineBucketZoomTarget,
    type ActivatableTimelineBucket,
  } from '$lib/utils/timeline-filter-navigation';
  import { buildTimelineRouteOptions } from '$lib/utils/timeline-route-options';
  import { AssetVisibility } from '@immich/sdk';
  import { mdiDotsVertical } from '@mdi/js';
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
  const baseTimelineOptions = { visibility: AssetVisibility.Locked };
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

  const handleMoveOffLockedFolder = (assetIds: string[]) => {
    assetMultiSelectManager.clear();
    timelineManager.removeAssets(assetIds);
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

  const { LockSession } = $derived(getUserActions($t));

  const onSessionLocked = async () => {
    await goto(Route.photos());
  };
</script>

<OnEvents {onSessionLocked} />

<UserPageLayout
  title={data.meta.title}
  actions={[LockSession]}
  hideNavbar={assetMultiSelectManager.selectionActive}
  scrollbar={false}
>
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
    removeAction={AssetAction.SET_VISIBILITY_TIMELINE}
    {temporalAnchor}
    onTimelineBucketActivate={handleTimelineBucketActivate}
    onTemporalAnchorResolved={() => (temporalAnchor = undefined)}
    grouping={timelineGrouping}
    onGroupingChange={handleTimelineGroupingChange}
  >
    {#snippet empty()}
      <EmptyPlaceholder text={$t('no_locked_photos_message')} title={$t('nothing_here_yet')} class="mt-10 mx-auto" />
    {/snippet}
  </Timeline>
</UserPageLayout>

<!-- Multi-selection mode app bar -->
{#if assetMultiSelectManager.selectionActive}
  <AssetSelectControlBar>
    <SelectAllAssets withText {timelineManager} assetInteraction={assetMultiSelectManager} />
    <SetVisibilityAction unlock onVisibilitySet={handleMoveOffLockedFolder} />
    <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')}>
      <DownloadAction menuItem />
      <ChangeDate menuItem />
      <ChangeLocation menuItem />
      <DeleteAssets menuItem force onAssetDelete={(assetIds) => timelineManager.removeAssets(assetIds)} />
    </ButtonContextMenu>
  </AssetSelectControlBar>
{/if}
