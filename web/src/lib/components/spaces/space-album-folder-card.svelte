<script lang="ts">
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import SpaceCollage from '$lib/components/spaces/space-collage.svelte';
  import {
    buildDragPayload,
    canDrop,
    getActiveDragPayload,
    readDragPayload,
    setActiveDragPayload,
    writeDragPayload,
    type DragPayload,
  } from '$lib/utils/space-album-folder-dnd';
  import type { SharedSpaceAlbumFolderDto, SharedSpaceLinkedAlbumDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiCheckCircle, mdiDotsVertical, mdiFolder } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    folder: SharedSpaceAlbumFolderDto;
    albumCount: number;
    previewAssetIds: string[];
    canManage: boolean;
    /** Needed to run the client-side canDrop check while this card is a drop target. */
    folders?: SharedSpaceAlbumFolderDto[];
    albums?: SharedSpaceLinkedAlbumDto[];
    /** Whether this folder is part of the active multi-selection (design §4). */
    selected?: boolean;
    /** Live Shift-hover range preview (design §4.3). */
    selectionCandidate?: boolean;
    /** The full current selection, so a drag started from a selected card can carry the whole
     * batch (design §5.3 / S-22). Defaults leave a drag carrying only itself. */
    selectedIds?: string[];
    selectedKind?: 'album' | 'folder' | 'none';
    /** Fired on a plain click on the "open" region. The caller decides open-vs-toggle. */
    onOpen?: (folder: SharedSpaceAlbumFolderDto, shiftKey: boolean) => void;
    /** Fired ONLY from the check circle — always enters/extends the selection. */
    onToggleSelect?: (shiftKey: boolean) => void;
    /** Shift-hover range preview (design §4.3) — the caller decides whether Shift is actually held. */
    onHover?: () => void;
    onRename?: (folder: SharedSpaceAlbumFolderDto) => void;
    onMove?: (folder: SharedSpaceAlbumFolderDto) => void;
    onDelete?: (folder: SharedSpaceAlbumFolderDto) => void;
    onDropItem?: (payload: DragPayload, targetFolderId: string | null) => void;
  }

  let {
    folder,
    albumCount,
    previewAssetIds,
    canManage,
    folders = [],
    albums = [],
    selected = false,
    selectionCandidate = false,
    selectedIds = [],
    selectedKind = 'none',
    onOpen,
    onToggleSelect,
    onHover,
    onRename,
    onMove,
    onDelete,
    onDropItem,
  }: Props = $props();

  // SpaceCollage takes {id, thumbhash}; folder previews are resolved album covers, which the
  // server has already cleared through spaceVisibilityGate, so no thumbhash is available.
  const collageAssets = $derived(previewAssetIds.map((id) => ({ id, thumbhash: null })));

  let isDropTarget = $state(false);

  // Viewers can neither drag nor drop — even if a stale payload were somehow still active, the
  // server would reject the request anyway, so this saves the round trip.
  const canAccept = () => {
    if (!canManage) {
      return false;
    }
    const payload = getActiveDragPayload();
    return !!payload && canDrop(folders, albums, payload, folder.id);
  };
</script>

<div
  data-testid="space-album-folder-card"
  data-folder-id={folder.id}
  role="listitem"
  draggable={canManage}
  ondragstart={(event) => {
    if (!event.dataTransfer) {
      return;
    }
    const payload: DragPayload = buildDragPayload({ kind: 'folder', id: folder.id }, selectedIds, selectedKind);
    writeDragPayload(event.dataTransfer, payload);
    setActiveDragPayload(payload);
  }}
  ondragend={() => setActiveDragPayload(null)}
  onmouseenter={() => onHover?.()}
  ondragover={(event) => {
    // A drop only fires if dragover calls preventDefault. Doing it *only* for valid targets is
    // also what makes the cursor show "no drop" over an illegal one.
    if (!canAccept()) {
      return;
    }
    event.preventDefault();
    isDropTarget = true;
  }}
  ondragleave={() => (isDropTarget = false)}
  ondrop={(event) => {
    event.preventDefault();
    isDropTarget = false;
    const payload = event.dataTransfer && readDragPayload(event.dataTransfer);
    setActiveDragPayload(null);
    if (payload) {
      onDropItem?.(payload, folder.id);
    }
  }}
  class:ring-2={isDropTarget}
  class:ring-primary={isDropTarget}
  data-selected={selected ? 'true' : undefined}
  data-candidate={selectionCandidate ? 'true' : undefined}
  class={[
    'group relative rounded-2xl border p-5 hover:border-gray-200 hover:bg-gray-100 dark:hover:border-gray-800 dark:hover:bg-gray-900',
    selected ? 'border-primary/70 bg-primary/5' : selectionCandidate ? 'border-primary/40' : 'border-transparent',
  ]}
>
  <!-- Check circle — always in the DOM (never hover-gated for RENDERING, only for opacity) so it
       is directly clickable without first hovering, mirroring space-album-card.svelte. -->
  {#if canManage}
    <div
      class={[
        'absolute inset-s-6 top-6 z-10 transition-opacity',
        selected || selectionCandidate ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
      ]}
    >
      <button
        type="button"
        data-testid="space-album-folder-select-{folder.id}"
        class="rounded-full bg-black/25 p-1 hover:bg-black/40"
        aria-pressed={selected}
        aria-label={$t('select')}
        onclick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          onToggleSelect?.(event.shiftKey);
        }}
      >
        <Icon icon={mdiCheckCircle} size="24" class={selected ? 'text-primary' : 'text-white/80 hover:text-white'} />
      </button>
    </div>
  {/if}

  {#if canManage}
    <div
      class="absolute inset-e-6 top-6 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
      data-testid="space-album-folder-card-menu"
    >
      <ButtonContextMenu
        icon={mdiDotsVertical}
        title={$t('more')}
        color="secondary"
        variant="filled"
        size="medium"
        align="top-right"
        direction="left"
        buttonClass="icon-white-drop-shadow"
      >
        <MenuOption text={$t('space_album_folder_rename')} onClick={() => onRename?.(folder)} />
        <MenuOption text={$t('space_album_folder_move')} onClick={() => onMove?.(folder)} />
        <MenuOption text={$t('space_album_folder_delete')} onClick={() => onDelete?.(folder)} />
      </ButtonContextMenu>
    </div>
  {/if}

  <button
    type="button"
    class="w-full text-start"
    onclick={(event) => onOpen?.(folder, event.shiftKey)}
    data-testid="space-album-folder-card-open"
  >
    <div class="relative aspect-square w-full overflow-hidden rounded-xl">
      <SpaceCollage assets={collageAssets} />
      <!-- Badge, so a folder is never mistaken for an album at a glance. -->
      <div class="absolute inset-s-2 bottom-2 rounded-lg bg-black/55 p-1.5 text-white">
        <Icon icon={mdiFolder} size="20" />
      </div>
    </div>

    <div class="mt-4">
      <p
        class="line-clamp-2 w-full text-lg/6 font-semibold text-black group-hover:text-primary dark:text-white"
        title={folder.name}
      >
        {folder.name}
      </p>
      <p class="text-sm dark:text-immich-dark-fg" data-testid="space-album-folder-card-count">
        {$t('space_album_folder_albums_count', { values: { count: albumCount } })}
      </p>
    </div>
  </button>
</div>
