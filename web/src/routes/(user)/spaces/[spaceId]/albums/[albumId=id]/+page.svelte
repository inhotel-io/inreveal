<script lang="ts">
  import { goto } from '$app/navigation';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { createFilterState } from '$lib/components/filter-panel/filter-panel';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { buildAlbumTimelineOptions } from '$lib/utils/album-filter-options';
  import {
    AlbumUserRole,
    SharedSpaceRole,
    type AlbumResponseDto,
    type SharedSpaceMemberResponseDto,
    type SharedSpaceResponseDto,
  } from '@immich/sdk';
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

  const options = $derived({
    ...buildAlbumTimelineOptions(
      album.id,
      album.order ?? authManager.preferences.albums.defaultAssetOrder,
      createFilterState(),
    ),
    grouping: 'month' as const,
  });

  const localMultiSelectManager = new AssetMultiSelectManager();
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
    {#if canManage}
      <IconButton
        variant="ghost"
        shape="round"
        color="secondary"
        aria-label={$t('space_album_add_photos')}
        data-testid="add-photos-button"
        icon={mdiImagePlusOutline}
      />
    {/if}
  {/snippet}

  <Timeline enableRouting={false} {options} assetInteraction={localMultiSelectManager}>
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
              onclick={() => {}}
            >
              {$t('add_photos')}
            </button>
          {/if}
        </div>
      </section>
    {/snippet}
  </Timeline>
</UserPageLayout>
