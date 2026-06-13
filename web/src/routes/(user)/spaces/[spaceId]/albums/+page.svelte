<script lang="ts">
  import SpaceAlbumCard from '$lib/components/spaces/space-album-card.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import {
    AlbumUserRole,
    getAllAlbums,
    getSharedSpaceAlbums,
    linkAlbum,
    SharedSpaceRole,
    unlinkAlbum,
    updateSharedSpaceAlbum,
    type AlbumResponseDto,
    type SharedSpaceLinkedAlbumDto,
    type SharedSpaceMemberResponseDto,
    type SharedSpaceResponseDto,
  } from '@immich/sdk';
  import { Button, Icon, modalManager } from '@immich/ui';
  import { mdiImageAlbum, mdiImageMultipleOutline, mdiLinkVariantPlus } from '@mdi/js';
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

  // Picker state
  let showPicker = $state(false);
  let availableAlbums = $state<AlbumResponseDto[]>([]);
  let loadingAvailable = $state(false);
  let linking = $state(false);

  const linkedAlbumIds = $derived(new Set(albums.map((a) => a.albumId)));

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
    } catch (error) {
      handleError(error, $t('spaces_linked_albums_error_update'));
    }
  }

  async function loadAvailableAlbums() {
    try {
      loadingAvailable = true;
      const all = await getAllAlbums({});
      const userId = authManager.user.id;
      availableAlbums = all.filter((album) => {
        if (linkedAlbumIds.has(album.id)) {
          return false;
        }
        const myRole = album.albumUsers.find((au) => au.user.id === userId)?.role;
        return myRole === AlbumUserRole.Owner || myRole === AlbumUserRole.Editor;
      });
    } catch (error) {
      handleError(error, $t('spaces_linked_albums_error_load'));
    } finally {
      loadingAvailable = false;
    }
  }

  async function openPicker() {
    showPicker = true;
    await loadAvailableAlbums();
  }

  async function handleLink(albumId: string) {
    try {
      linking = true;
      await linkAlbum({ id: space.id, albumId });
      await reload();
      showPicker = false;
    } catch (error) {
      handleError(error, $t('spaces_linked_albums_error_link'));
    } finally {
      linking = false;
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
        onclick={() => void openPicker()}
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
          <Button onclick={() => void openPicker()} data-testid="empty-link-album-button">
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

  <!-- Inline album picker -->
  {#if showPicker}
    <div class="px-4 pt-4">
      <div
        class="flex flex-col gap-2 rounded-xl border border-gray-200 p-4 dark:border-gray-700"
        data-testid="album-picker"
      >
        <p class="text-xs font-medium text-gray-500">{$t('spaces_linked_albums_pick_album')}</p>
        {#if loadingAvailable}
          <p class="text-xs text-gray-400">{$t('spaces_linked_albums_loading')}</p>
        {:else if availableAlbums.length === 0}
          <p class="text-xs text-gray-400 italic">{$t('spaces_linked_albums_no_albums')}</p>
        {:else}
          <div class="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {#each availableAlbums as album (album.id)}
              <button
                type="button"
                class="flex items-center gap-2 rounded-lg p-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                onclick={() => void handleLink(album.id)}
                disabled={linking}
                data-testid="album-picker-item"
              >
                <div class="size-8 shrink-0 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                  {#if album.albumThumbnailAssetId}
                    <img
                      alt={album.albumName}
                      src={getAssetMediaUrl({ id: album.albumThumbnailAssetId })}
                      class="size-full object-cover"
                      loading="lazy"
                    />
                  {:else}
                    <div class="flex size-full items-center justify-center">
                      <Icon icon={mdiImageAlbum} size="12" class="text-gray-400" />
                    </div>
                  {/if}
                </div>
                <span class="truncate text-sm">{album.albumName}</span>
                <span class="ml-auto shrink-0 text-xs text-gray-400">
                  {$t('items_count', { values: { count: album.assetCount } })}
                </span>
              </button>
            {/each}
          </div>
        {/if}
        <Button
          size="tiny"
          variant="ghost"
          onclick={() => (showPicker = false)}
          data-testid="close-album-picker-button"
        >
          {$t('cancel')}
        </Button>
      </div>
    </div>
  {/if}
</div>
