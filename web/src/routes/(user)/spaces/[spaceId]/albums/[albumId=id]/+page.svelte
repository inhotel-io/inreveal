<script lang="ts">
  import { goto } from '$app/navigation';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { createFilterState } from '$lib/components/filter-panel/filter-panel';
  import ControlAppBar from '$lib/components/shared-components/ControlAppBar.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import RemoveFromAlbum from '$lib/components/timeline/actions/RemoveFromAlbumAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import TimelineGroupingControl from '$lib/components/timeline/TimelineGroupingControl.svelte';
  import { assetMultiSelectManager, AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { getTimelineTopVisibleAnchor } from '$lib/managers/timeline-manager/timeline-anchor';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineGrouping, TimelineTemporalAnchor } from '$lib/managers/timeline-manager/types';
  import { getAlbumAssetsActions } from '$lib/services/album.service';
  import { buildAlbumAssetPickerOptions, buildAlbumTimelineOptions } from '$lib/utils/album-filter-options';
  import { type ActivatableTimelineBucket, getTimelineBucketZoomTarget } from '$lib/utils/timeline-zoom-navigation';
  import {
    AlbumUserRole,
    getAlbumInfo,
    SharedSpaceRole,
    type AlbumResponseDto,
    type SharedSpaceMemberResponseDto,
    type SharedSpaceResponseDto,
  } from '@immich/sdk';
  import HeaderActionButton from '$lib/components/HeaderActionButton.svelte';
  import { Icon, IconButton } from '@immich/ui';
  import { mdiArrowLeft, mdiImageOutline, mdiImagePlusOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const space: SharedSpaceResponseDto = $derived(data.space);
  const members: SharedSpaceMemberResponseDto[] = $derived(data.members);
  let album = $state<AlbumResponseDto>(data.album);

  // Mode: 'browse' shows the album timeline; 'add' shows the asset picker
  let mode = $state<'browse' | 'add'>('browse');

  // Timeline grouping state — default 'day' gives the flat "All" grid (fixes stuck-cover bug)
  let timelineGrouping = $state<TimelineGrouping>('day');
  let temporalAnchor = $state<TimelineTemporalAnchor | undefined>();
  let timelineManager = $state<TimelineManager>() as TimelineManager;

  // Picker multi-select manager (mirrors global album page's timelineMultiSelectManager)
  const pickerMultiSelectManager = new AssetMultiSelectManager();

  const currentMember = $derived(members.find((m) => m.userId === authManager.user.id));
  const isSpaceEditor = $derived(
    currentMember?.role === SharedSpaceRole.Owner || currentMember?.role === SharedSpaceRole.Editor,
  );
  const isAlbumEditor = $derived(
    album.albumUsers.some(
      (au) =>
        au.user.id === authManager.user.id && (au.role === AlbumUserRole.Owner || au.role === AlbumUserRole.Editor),
    ),
  );
  const canManage = $derived(isSpaceEditor || isAlbumEditor);

  const browseOptions = $derived({
    ...buildAlbumTimelineOptions(
      album.id,
      album.order ?? authManager.preferences.albums.defaultAssetOrder,
      createFilterState(),
    ),
    // The grouping MUST live in the options object — that is what the TimelineManager reads to
    // build buckets. The top-level <Timeline grouping={...}> prop alone does not re-group.
    grouping: timelineGrouping,
  });

  const pickerOptions = $derived(buildAlbumAssetPickerOptions(album.id, createFilterState()));

  const refreshAlbum = async () => {
    album = await getAlbumInfo({ id: album.id });
  };

  const handleRemoveAssets = (_: string[]) => {
    // RemoveFromAlbumAction already re-fetches the album via bind:album and clears the
    // selection internally before firing onRemove, so we only need to defensively clear here.
    assetMultiSelectManager.clear();
  };

  const handleExitAddMode = () => {
    pickerMultiSelectManager.clear();
    timelineGrouping = 'day';
    temporalAnchor = undefined;
    mode = 'browse';
  };

  const handleAddAssetsSuccess = async () => {
    pickerMultiSelectManager.clear();
    timelineGrouping = 'day';
    temporalAnchor = undefined;
    mode = 'browse';
    await refreshAlbum();
  };

  function handleTimelineGroupingChange(grouping: TimelineGrouping) {
    const anchor = getTimelineTopVisibleAnchor(timelineManager);
    timelineGrouping = grouping;
    temporalAnchor = anchor;
  }

  function handleTimelineBucketActivate(bucket: ActivatableTimelineBucket) {
    if (mode !== 'browse' || assetMultiSelectManager.selectionActive) {
      return;
    }
    const result = getTimelineBucketZoomTarget(bucket);
    if (!result) {
      return;
    }
    timelineGrouping = result.grouping;
    temporalAnchor = result.anchor;
  }

  const { AddAssets, Upload } = $derived(getAlbumAssetsActions($t, album, pickerMultiSelectManager.assets));
</script>

<UserPageLayout
  title={album.albumName}
  description={`${$t('items_count', { values: { count: album.assetCount } })} · ${$t('space_album_in_space', { values: { space: space.name } })}`}
>
  {#snippet leading()}
    <IconButton
      variant="ghost"
      shape="round"
      color="secondary"
      aria-label={$t('back')}
      onclick={() => void goto(`/spaces/${space.id}/albums`)}
      icon={mdiArrowLeft}
    />
  {/snippet}

  {#snippet buttons()}
    {#if canManage && mode === 'browse'}
      <IconButton
        variant="ghost"
        shape="round"
        color="secondary"
        aria-label={$t('space_album_add_photos')}
        data-testid="add-photos-button"
        onclick={() => {
          timelineGrouping = 'day';
          temporalAnchor = undefined;
          mode = 'add';
        }}
        icon={mdiImagePlusOutline}
      />
    {/if}
  {/snippet}

  <!-- Browse selection control bar (shows when assets are selected in browse mode) -->
  {#if mode === 'browse' && assetMultiSelectManager.selectionActive}
    <AssetSelectControlBar>
      <DownloadAction filename="{album.albumName}.zip" />
      {#if canManage}
        <RemoveFromAlbum bind:album onRemove={handleRemoveAssets} />
      {/if}
    </AssetSelectControlBar>
  {/if}

  {#if mode === 'browse' && !assetMultiSelectManager.selectionActive}
    <div
      class="hidden shrink-0 items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 md:flex dark:border-gray-700 dark:bg-gray-900"
      data-testid="timeline-desktop-grouping-control"
    >
      <TimelineGroupingControl grouping={timelineGrouping} onGroupingChange={handleTimelineGroupingChange} />
    </div>
  {/if}

  {#if mode === 'browse'}
    <Timeline
      enableRouting={false}
      options={browseOptions}
      bind:timelineManager
      assetInteraction={assetMultiSelectManager}
      isSelectionMode={false}
      singleSelect={false}
      grouping={timelineGrouping}
      onGroupingChange={handleTimelineGroupingChange}
      onTimelineBucketActivate={handleTimelineBucketActivate}
      {temporalAnchor}
      onTemporalAnchorResolved={() => (temporalAnchor = undefined)}
    >
      {#snippet empty()}
        <section class="mt-50 flex place-content-center place-items-center">
          <div class="flex flex-col items-center gap-4 text-center">
            <Icon icon={mdiImageOutline} size="3.5em" class="text-gray-400" />
            <p class="text-lg text-gray-500 dark:text-gray-400">{$t('no_assets_to_show')}</p>
            {#if canManage}
              <button
                type="button"
                data-testid="empty-add-photos-button"
                class="text-sm text-(--primary)"
                onclick={() => {
                  timelineGrouping = 'day';
                  temporalAnchor = undefined;
                  mode = 'add';
                }}
              >
                {$t('add_photos')}
              </button>
            {/if}
          </div>
        </section>
      {/snippet}
    </Timeline>
  {/if}
</UserPageLayout>

{#if mode === 'add'}
  <section class="fixed inset-0 z-40 bg-immich-bg dark:bg-immich-dark-bg" data-testid="add-photos-overlay">
    <ControlAppBar onClose={handleExitAddMode}>
      {#snippet leading()}
        <p class="text-lg dark:text-immich-dark-fg">
          {#if !pickerMultiSelectManager.selectionActive}
            {$t('add_to_album')}
          {:else}
            {$t('selected_count', { values: { count: pickerMultiSelectManager.assets.length } })}
          {/if}
        </p>
      {/snippet}

      {#snippet trailing()}
        <HeaderActionButton action={Upload} />
        <HeaderActionButton
          action={{
            ...AddAssets,
            onAction: () => void AddAssets.onAction().then(handleAddAssetsSuccess),
          }}
        />
      {/snippet}
    </ControlAppBar>
    <main
      class="relative h-dvh overflow-hidden px-2 pt-(--navbar-height) md:px-6"
      data-testid="add-photos-timeline-main"
    >
      <Timeline
        enableRouting={false}
        options={pickerOptions}
        assetInteraction={pickerMultiSelectManager}
        isSelectionMode={true}
        singleSelect={false}
      />
    </main>
  </section>
{/if}
