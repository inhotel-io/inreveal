<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import SpaceAlbumCard from '$lib/components/spaces/space-album-card.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import SpaceLinkAlbumModal from '$lib/modals/SpaceLinkAlbumModal.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import {
    getSharedSpaceAlbums,
    SharedSpaceRole,
    unlinkAlbum,
    updateSharedSpaceAlbum,
    type SharedSpaceLinkedAlbumDto,
    type SharedSpaceMemberResponseDto,
    type SharedSpaceResponseDto,
  } from '@immich/sdk';
  import { Button, Icon, modalManager } from '@immich/ui';
  import { mdiImageMultipleOutline, mdiLinkVariantPlus } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const space = $derived<SharedSpaceResponseDto>(data.space);
  const members = $derived<SharedSpaceMemberResponseDto[]>(data.members);
  let albums = $state<SharedSpaceLinkedAlbumDto[]>(data.linkedAlbums);

  const currentMember = $derived(members.find((m) => m.userId === authManager.user.id));
  const isEditor = $derived(
    currentMember?.role === SharedSpaceRole.Owner || currentMember?.role === SharedSpaceRole.Editor,
  );

  const linkedAlbumIds = $derived(albums.map((a) => a.albumId));

  async function reload() {
    try {
      albums = await getSharedSpaceAlbums({ id: space.id });
    } catch (error) {
      handleError(error, $t('spaces_linked_albums_error_load'));
    }
  }

  async function handleUnlink(album: SharedSpaceLinkedAlbumDto) {
    const confirmed = await modalManager.showDialog({
      prompt: $t('spaces_linked_albums_unlink_confirmation', { values: { name: album.albumName } }),
      title: $t('spaces_linked_albums_unlink'),
    });
    if (!confirmed) {
      return;
    }
    try {
      await unlinkAlbum({ id: space.id, albumId: album.albumId });
      await reload();
      // Refresh the [spaceId] layout's cached linkedAlbums so other tabs (and a re-mount of this
      // page on tab navigation) reflect the change without a full page refresh.
      await invalidateAll();
    } catch (error) {
      handleError(error, $t('spaces_linked_albums_error_unlink'));
    }
  }

  async function handleToggleTimeline(album: SharedSpaceLinkedAlbumDto) {
    try {
      await updateSharedSpaceAlbum({
        id: space.id,
        albumId: album.albumId,
        sharedSpaceAlbumLinkUpdateDto: { showInTimeline: !album.showInTimeline },
      });
      albums = albums.map((a) => (a.albumId === album.albumId ? { ...a, showInTimeline: !album.showInTimeline } : a));
      // Keep the layout's cached linkedAlbums in sync so the timeline tab + a re-mount reflect it.
      await invalidateAll();
    } catch (error) {
      handleError(error, $t('spaces_linked_albums_error_update'));
    }
  }

  async function openLinkAlbumModal() {
    const linkedCount = await modalManager.show(SpaceLinkAlbumModal, {
      spaceId: space.id,
      linkedAlbumIds,
    });
    // The modal returns how many albums it linked; only refresh when something changed.
    if (linkedCount) {
      await reload();
      // Refresh the [spaceId] layout's cached linkedAlbums so other tabs (and a re-mount of this
      // page on tab navigation) reflect the change without a full page refresh.
      await invalidateAll();
    }
  }
</script>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between px-4 py-2">
    <p class="text-sm text-gray-500">{$t('space_albums_count', { values: { count: albums.length } })}</p>
    {#if isEditor}
      <Button
        size="small"
        variant="ghost"
        leadingIcon={mdiLinkVariantPlus}
        onclick={() => void openLinkAlbumModal()}
        data-testid="link-album-button"
      >
        {$t('spaces_linked_albums_link_album')}
      </Button>
    {/if}
  </div>

  {#if albums.length === 0}
    <div class="flex min-h-[calc(66vh-11rem)] w-full place-content-center items-center dark:text-white">
      <div class="flex flex-col content-center items-center gap-4 text-center">
        <Icon icon={mdiImageMultipleOutline} size="3.5em" />
        <p class="text-lg text-gray-500 dark:text-gray-400" data-testid="empty-state-message">
          {$t('space_albums_empty')}
        </p>
        {#if isEditor}
          <Button onclick={() => void openLinkAlbumModal()} data-testid="empty-link-album-button">
            {$t('space_albums_empty_editor_cta')}
          </Button>
        {/if}
      </div>
    </div>
  {:else}
    <div class="px-4 pt-4">
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
        {#each albums as album (album.albumId)}
          <SpaceAlbumCard
            spaceId={space.id}
            {album}
            canManage={isEditor}
            onUnlink={handleUnlink}
            onToggleTimeline={handleToggleTimeline}
          />
        {/each}
      </div>
    </div>
  {/if}
</div>
