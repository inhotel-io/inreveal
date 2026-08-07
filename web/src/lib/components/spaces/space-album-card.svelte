<script lang="ts">
  import AlbumCover from '$lib/components/album-page/AlbumCover.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { Route } from '$lib/route';
  import { buildDragPayload, setActiveDragPayload, writeDragPayload } from '$lib/utils/space-album-folder-dnd';
  import { type AlbumResponseDto, type SharedSpaceLinkedAlbumDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiCheckCircle, mdiDotsVertical } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    spaceId: string;
    album: SharedSpaceLinkedAlbumDto;
    canManage: boolean;
    /** Rename is allowed for a space Editor (canManage) OR the album's own owner. Defaults to
     * false so a caller that hasn't wired capability derivation yet fails closed rather than
     * breaking the type check — same rationale as SpaceAlbumFolderNameModal's icon/label. */
    canRename?: boolean;
    /** Delete is allowed for the album's own owner ONLY — never granted by canManage alone. */
    canDelete?: boolean;
    onUnlink?: (album: SharedSpaceLinkedAlbumDto) => void;
    onToggleTimeline?: (album: SharedSpaceLinkedAlbumDto) => void;
    onMove?: (album: SharedSpaceLinkedAlbumDto) => void;
    onRename?: (album: SharedSpaceLinkedAlbumDto) => void;
    onDelete?: (album: SharedSpaceLinkedAlbumDto) => void;
    /** Whether this album is part of the active multi-selection (design §4). */
    selected?: boolean;
    /** Live Shift-hover range preview (design §4.3). */
    selectionCandidate?: boolean;
    /** The full current selection, so a drag started from a selected card can carry the whole
     * batch (design §5.3 / S-22). Defaults leave a drag carrying only itself, matching a caller
     * that has no selection concept at all. */
    selectedIds?: string[];
    selectedKind?: 'album' | 'folder' | 'none';
    /** Fired on a plain card-body click. The caller decides open-vs-toggle — this component has no
     * opinion on whether a selection is active elsewhere on the page. */
    onOpen?: (album: SharedSpaceLinkedAlbumDto, shiftKey: boolean) => void;
    /** Fired ONLY from the check circle — always enters/extends the selection. */
    onToggleSelect?: (shiftKey: boolean) => void;
    onHover?: () => void;
  }

  let {
    spaceId,
    album,
    canManage,
    canRename = false,
    canDelete = false,
    onUnlink,
    onToggleTimeline,
    onMove,
    onRename,
    onDelete,
    selected = false,
    selectionCandidate = false,
    selectedIds = [],
    selectedKind = 'none',
    onOpen,
    onToggleSelect,
    onHover,
  }: Props = $props();

  // Ctrl/Cmd-click is exempted so the native <a href> still opens the album in a new tab — every
  // OTHER click is routed through onOpen/onToggleSelect instead of letting the anchor navigate,
  // so behaviour is identical whether the click landed on the cover, the title, or empty padding.
  const handleClick = (event: MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    onOpen?.(album, event.shiftKey);
  };

  const handleSelectClick = (event: MouseEvent) => {
    // Stops the click from also reaching handleClick above (this element is a descendant of the
    // card-body click target) — without this, entering selection via the check circle would ALSO
    // fire onOpen/onToggleSelect a second time via bubbling.
    event.stopPropagation();
    event.preventDefault();
    onToggleSelect?.(event.shiftKey);
  };
</script>

<!-- display:contents keeps this wrapper invisible to the surrounding CSS grid (it is not itself a
     grid item) while still being a real DOM node the list can address by album id. The static
     "space-album-card" testid below is unique-per-render-context in every existing test, so it stays
     on the inner element rather than being replaced by this id-scoped one. -->
<div
  data-testid="space-album-card-{album.id}"
  data-selected={selected ? 'true' : undefined}
  data-candidate={selectionCandidate ? 'true' : undefined}
  class="contents"
  role="presentation"
  onclick={handleClick}
  onmouseenter={() => onHover?.()}
>
  <div
    data-testid="space-album-card"
    role="listitem"
    draggable={canManage}
    ondragstart={(event) => {
      // draggable="false" on this div does not stop the inner <a>/cover image from being natively
      // draggable, and dragstart bubbles — so without this guard a viewer could still drag the
      // cover and write a payload. No target ever accepts it (every drop target also gates on
      // canManage) and the server enforces regardless, but this keeps that guarantee local rather
      // than relying on every other surface getting it right.
      if (!canManage || !event.dataTransfer) {
        return;
      }
      const payload = buildDragPayload({ kind: 'album', id: album.id }, selectedIds, selectedKind);
      writeDragPayload(event.dataTransfer, payload);
      setActiveDragPayload(payload);
    }}
    ondragend={() => setActiveDragPayload(null)}
    class={[
      'group relative rounded-2xl border p-5 hover:border-gray-200 hover:bg-gray-100 dark:hover:border-gray-800 dark:hover:bg-gray-900',
      selected ? 'border-primary/70 bg-primary/5' : selectionCandidate ? 'border-primary/40' : 'border-transparent',
    ]}
  >
    <!-- Check circle — sibling of the anchor, not inside it. Always in the DOM (never hover-gated
         for RENDERING, only for opacity) so it is directly clickable without first hovering. -->
    {#if canManage}
      <div
        class={[
          'absolute inset-s-6 top-6 z-10 transition-opacity',
          selected || selectionCandidate ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
        ]}
        data-testid="space-album-card-select-wrapper"
      >
        <button
          type="button"
          data-testid="space-album-select-{album.id}"
          class="rounded-full bg-black/25 p-1 hover:bg-black/40"
          aria-pressed={selected}
          aria-label={$t('select')}
          onclick={handleSelectClick}
        >
          <Icon icon={mdiCheckCircle} size="24" class={selected ? 'text-primary' : 'text-white/80 hover:text-white'} />
        </button>
      </div>
    {/if}

    <!-- ⋯ menu — sibling of the anchor, not inside it. stopPropagation keeps a click anywhere in
         this menu (including its portal-free dropdown content, which renders as a DOM descendant
         of this div) from also bubbling into the card-body click handler above. -->
    {#if canManage || canRename || canDelete}
      <div
        class="absolute inset-e-6 top-6 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
        data-testid="space-album-card-menu"
        role="presentation"
        onclick={(event) => event.stopPropagation()}
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
          {#if canManage}
            <MenuOption
              text={album.showInTimeline
                ? $t('spaces_hide_from_timeline')
                : $t('spaces_linked_albums_show_in_timeline')}
              onClick={() => onToggleTimeline?.(album)}
            />
            <MenuOption text={$t('space_album_folder_move')} onClick={() => onMove?.(album)} />
            <MenuOption text={$t('spaces_linked_albums_unlink')} onClick={() => onUnlink?.(album)} />
          {/if}
          {#if canRename}
            <MenuOption text={$t('space_album_rename')} onClick={() => onRename?.(album)} />
          {/if}
          {#if canDelete}
            <MenuOption text={$t('space_album_delete')} onClick={() => onDelete?.(album)} />
          {/if}
        </ButtonContextMenu>
      </div>
    {/if}

    <a href={Route.viewSpaceAlbum({ spaceId, albumId: album.id })} data-testid="space-album-card-link">
      <!-- Cover image -->
      <div class="relative aspect-square w-full overflow-hidden rounded-xl {album.showInTimeline ? '' : 'opacity-60'}">
        <AlbumCover album={album as unknown as AlbumResponseDto} class="size-full object-cover" />
      </div>

      <!-- Text info -->
      <div class="mt-4">
        <p
          class="line-clamp-2 w-full text-lg/6 font-semibold text-black group-hover:text-primary dark:text-white"
          title={album.albumName}
        >
          {album.albumName}
        </p>
        <p class="text-sm dark:text-immich-dark-fg">
          {$t('items_count', { values: { count: album.assetCount } })}
          {#if !album.showInTimeline}
            · {$t('space_albums_hidden_from_timeline')}
          {/if}
        </p>
      </div>
    </a>
  </div>
</div>
