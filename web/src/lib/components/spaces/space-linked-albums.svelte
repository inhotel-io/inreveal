<script lang="ts">
  import { getAssetMediaUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import {
    AlbumUserRole,
    getAllAlbums,
    getSharedSpaceAlbums,
    linkAlbum,
    unlinkAlbum,
    updateSharedSpaceAlbum,
    type AlbumResponseDto,
    type SharedSpaceLinkedAlbumDto,
    type SharedSpaceResponseDto,
  } from '@immich/sdk';
  import { Button, Icon, modalManager, Switch } from '@immich/ui';
  import { mdiImageAlbum, mdiLinkVariantOff, mdiLinkVariantPlus } from '@mdi/js';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    space: SharedSpaceResponseDto;
    canManage: boolean;
    onChanged?: () => void;
  }

  let { space, canManage, onChanged }: Props = $props();

  let linkedAlbums = $state<SharedSpaceLinkedAlbumDto[]>([]);
  let availableAlbums = $state<AlbumResponseDto[]>([]);
  let loadingLinked = $state(true);
  let loadingAvailable = $state(false);
  let showPicker = $state(false);
  let linking = $state(false);

  const linkedAlbumIds = $derived(new Set(linkedAlbums.map((a) => a.albumId)));

  $effect(() => {
    void space.id;
    void loadLinkedAlbums();
  });

  async function loadLinkedAlbums() {
    try {
      loadingLinked = true;
      linkedAlbums = await getSharedSpaceAlbums({ id: space.id });
    } catch (error) {
      handleError(error, $t('spaces_linked_albums_error_load'));
    } finally {
      loadingLinked = false;
    }
  }

  async function loadAvailableAlbums() {
    try {
      loadingAvailable = true;
      const all = await getAllAlbums({});
      const userId = authManager.user?.id;
      availableAlbums = all.filter((album) => {
        if (linkedAlbumIds.has(album.id)) {
          return false;
        }
        // Only offer albums the user owns or can edit (owner/editor role)
        const myRole = album.albumUsers.find((au) => au.user.id === userId)?.role;
        return myRole === AlbumUserRole.Owner || myRole === AlbumUserRole.Editor;
      });
    } catch (error) {
      handleError(error, $t('spaces_linked_albums_error_load'));
    } finally {
      loadingAvailable = false;
    }
  }

  async function handleLink(albumId: string) {
    try {
      linking = true;
      await linkAlbum({ id: space.id, albumId });
      await loadLinkedAlbums();
      showPicker = false;
      onChanged?.();
    } catch (error) {
      handleError(error, $t('spaces_linked_albums_error_link'));
    } finally {
      linking = false;
    }
  }

  async function handleUnlink(albumId: string, albumName: string) {
    const confirmed = await modalManager.showDialog({
      prompt: $t('spaces_linked_albums_unlink_confirmation', { values: { name: albumName } }),
      title: $t('spaces_linked_albums_unlink'),
    });
    if (!confirmed) {
      return;
    }
    try {
      await unlinkAlbum({ id: space.id, albumId });
      await loadLinkedAlbums();
      onChanged?.();
    } catch (error) {
      handleError(error, $t('spaces_linked_albums_error_unlink'));
    }
  }

  async function handleToggleTimeline(albumId: string, current: boolean) {
    try {
      await updateSharedSpaceAlbum({
        id: space.id,
        albumId,
        sharedSpaceAlbumLinkUpdateDto: { showInTimeline: !current },
      });
      linkedAlbums = linkedAlbums.map((a) =>
        a.albumId === albumId ? { ...a, showInTimeline: !current } : a,
      );
      onChanged?.();
    } catch (error) {
      handleError(error, $t('spaces_linked_albums_error_update'));
    }
  }

  async function openPicker() {
    showPicker = true;
    await loadAvailableAlbums();
  }
</script>

<div class="flex flex-col gap-4 px-5 py-4" data-testid="linked-albums">
  <!-- Header -->
  <div class="flex items-center gap-2">
    <Icon icon={mdiImageAlbum} size="20" class="text-gray-500" />
    <h3 class="text-sm font-semibold">{$t('spaces_linked_albums_title')}</h3>
  </div>

  <!-- Linked albums list -->
  {#if loadingLinked}
    <p class="text-xs text-gray-400">{$t('spaces_linked_albums_loading')}</p>
  {:else if linkedAlbums.length === 0}
    <p class="text-sm text-gray-400 italic" data-testid="linked-albums-empty">
      {$t('spaces_linked_albums_empty')}
    </p>
  {:else}
    <div class="flex flex-col gap-2" data-testid="linked-album-list">
      {#each linkedAlbums as album (album.albumId)}
        <div
          class="flex items-center gap-3 rounded-lg border border-gray-200 p-2 dark:border-gray-700"
          data-testid="linked-album-item"
        >
          <!-- Thumbnail -->
          <div class="size-10 shrink-0 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
            {#if album.albumThumbnailAssetId}
              <img
                alt={album.albumName}
                src={getAssetMediaUrl({ id: album.albumThumbnailAssetId })}
                class="size-full object-cover"
                loading="lazy"
              />
            {:else}
              <div class="flex size-full items-center justify-center">
                <Icon icon={mdiImageAlbum} size="16" class="text-gray-400" />
              </div>
            {/if}
          </div>

          <!-- Info -->
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium" data-testid="linked-album-name">{album.albumName}</p>
            <p class="text-xs text-gray-500">{$t('items_count', { values: { count: album.assetCount } })}</p>
          </div>

          {#if canManage}
            <!-- Timeline toggle -->
            <div class="flex shrink-0 items-center gap-1" title={$t('spaces_linked_albums_show_in_timeline')}>
              <Switch
                checked={album.showInTimeline}
                onCheckedChange={() => handleToggleTimeline(album.albumId, album.showInTimeline)}
                aria-label={$t('spaces_linked_albums_show_in_timeline')}
                data-testid="album-timeline-toggle"
              />
            </div>

            <!-- Unlink button -->
            <Button
              size="tiny"
              variant="ghost"
              color="danger"
              leadingIcon={mdiLinkVariantOff}
              onclick={() => handleUnlink(album.albumId, album.albumName)}
              data-testid="album-unlink-button"
            >
              {$t('spaces_linked_albums_unlink')}
            </Button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Link new album (managers only) -->
  {#if canManage}
    {#if !showPicker}
      <Button
        size="small"
        variant="ghost"
        leadingIcon={mdiLinkVariantPlus}
        onclick={openPicker}
        data-testid="open-album-picker-button"
      >
        {$t('spaces_linked_albums_link_album')}
      </Button>
    {:else}
      <div class="flex flex-col gap-2" data-testid="album-picker">
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
                onclick={() => handleLink(album.id)}
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
    {/if}
  {/if}
</div>
