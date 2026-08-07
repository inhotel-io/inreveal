<script lang="ts">
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { SortOrder, locale } from '$lib/stores/preferences.store';
  import { spaceAlbumViewSettings } from '$lib/stores/space-album-view-settings.store';
  import {
    isSpaceAlbumGroupCollapsed,
    toggleSpaceAlbumGroupCollapsing,
    type SpaceAlbumGroup,
  } from '$lib/utils/space-album-grouping';
  import { getFolderContents, getRecursiveAlbumCount } from '$lib/utils/space-album-folders';
  import { dateFormats } from '$lib/constants';
  import { Route } from '$lib/route';
  import { type SharedSpaceAlbumFolderDto, type SharedSpaceLinkedAlbumDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiCheckCircle, mdiChevronRight, mdiDotsVertical, mdiFolder } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { slide } from 'svelte/transition';

  interface Props {
    spaceId: string;
    albums: SharedSpaceLinkedAlbumDto[];
    canManage: boolean;
    /** Rename is allowed for a space Editor (canManage) OR the album's own owner. Defaults to
     * false so a caller that hasn't wired capability derivation yet fails closed rather than
     * breaking the type check — same rationale as SpaceAlbumFolderNameModal's icon/label.
     *
     * Deliberately a table-WIDE scalar, not per-row: this single call renders every album passed
     * in `albums`, unlike SpaceAlbumCard (instantiated once per album), so there is no single
     * album here to derive an owner-specific value from. A caller with a mixed-ownership
     * selection can only pass a value that is safe for every row it renders — e.g. `canManage`
     * alone, which never wrongly grants Rename to a row the viewer does not own. Row-level
     * SELECTABILITY does not share this limitation; see `canSelectAlbum` below. */
    canRename?: boolean;
    /** Delete is allowed for the album's own owner ONLY — never granted by canManage alone. Same
     * table-wide-scalar caveat as `canRename` above. */
    canDelete?: boolean;
    /** Per-ROW selectability (the check circle), independent of canRename/canDelete above — a
     * viewer who owns just SOME of the rendered albums must still be able to select the ones they
     * own. Defaults to `() => canManage` so a caller that hasn't wired per-album ownership keeps
     * today's canManage-only behaviour. */
    canSelectAlbum?: (album: SharedSpaceLinkedAlbumDto) => boolean;
    groups?: SpaceAlbumGroup[];
    grouped?: boolean;
    folders?: SharedSpaceAlbumFolderDto[];
    /** EVERY linked album in the space, not just this level — recursive counts need the lot. */
    allAlbums?: SharedSpaceLinkedAlbumDto[];
    currentFolderId?: string | null;
    onUnlink?: (album: SharedSpaceLinkedAlbumDto) => void;
    onToggleTimeline?: (album: SharedSpaceLinkedAlbumDto) => void;
    onRename?: (album: SharedSpaceLinkedAlbumDto) => void;
    onDelete?: (album: SharedSpaceLinkedAlbumDto) => void;
    /** Fired on a plain row click. The caller decides open-vs-toggle. */
    onOpenFolder?: (folder: SharedSpaceAlbumFolderDto, shiftKey?: boolean) => void;
    onOpenAlbum?: (album: SharedSpaceLinkedAlbumDto, shiftKey: boolean) => void;
    /** Fired ONLY from a row's check circle — always enters/extends the selection. */
    onToggleSelectAlbum?: (album: SharedSpaceLinkedAlbumDto, shiftKey: boolean) => void;
    onToggleSelectFolder?: (folder: SharedSpaceAlbumFolderDto, shiftKey: boolean) => void;
    isAlbumSelected?: (id: string) => boolean;
    isFolderSelected?: (id: string) => boolean;
  }

  let {
    spaceId,
    albums,
    canManage,
    canRename = false,
    canDelete = false,
    canSelectAlbum = () => canManage,
    groups = [],
    grouped = false,
    folders = [],
    allAlbums = [],
    currentFolderId = null,
    onUnlink,
    onToggleTimeline,
    onRename,
    onDelete,
    onOpenFolder,
    onOpenAlbum,
    onToggleSelectAlbum,
    onToggleSelectFolder,
    isAlbumSelected = () => false,
    isFolderSelected = () => false,
  }: Props = $props();

  // Ctrl/Cmd-click is exempted so the name link still opens the album in a new tab — every OTHER
  // click on the row is routed through onOpenAlbum instead of letting the anchor navigate.
  const handleAlbumRowClick = (event: MouseEvent, album: SharedSpaceLinkedAlbumDto) => {
    if (event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    onOpenAlbum?.(album, event.shiftKey);
  };

  const handleSelectClick = (event: MouseEvent, onToggleSelect: ((shiftKey: boolean) => void) | undefined) => {
    event.stopPropagation();
    event.preventDefault();
    onToggleSelect?.(event.shiftKey);
  };

  const dateLocaleString = (dateString: string) => {
    return new Date(dateString).toLocaleDateString($locale, dateFormats.album);
  };

  // Same rule as the cover grid: sort by name, honour the sort DIRECTION, ignore the sort key.
  // Switching view modes (or sort-by-item-count etc.) must never reorder the folder list.
  const levelFolders = $derived(
    getFolderContents(folders, [], currentFolderId)
      .folders.slice()
      .sort((a, b) =>
        $spaceAlbumViewSettings.sortOrder === SortOrder.Desc
          ? b.name.localeCompare(a.name)
          : a.name.localeCompare(b.name),
      ),
  );
</script>

{#snippet albumRow(album: SharedSpaceLinkedAlbumDto)}
  {@const selected = isAlbumSelected(album.id)}
  <tr
    data-selected={selected ? 'true' : undefined}
    class={[
      'flex w-full place-items-center border-3 p-2 text-center odd:bg-subtle/80 even:bg-subtle/20 hover:border-immich-primary/75 md:px-5 md:py-2 odd:dark:bg-immich-dark-gray/75 even:dark:bg-immich-dark-gray/50 dark:hover:border-immich-dark-primary/75',
      selected ? 'border-primary/70' : 'border-transparent',
    ]}
    onclick={(event) => handleAlbumRowClick(event, album)}
  >
    <!-- Per-ROW, unlike canRename/canDelete below (which stay table-wide scalars for the ⋮ menu —
         see canSelectAlbum's own doc comment): a viewer who owns THIS album must be able to enter
         selection even though canManage (space Editor) is false for them, without also exposing
         the check circle on a row for an album they do not own. -->
    {#if canSelectAlbum(album)}
      <td class="w-8 shrink-0 text-center">
        <button
          type="button"
          data-testid="space-album-select-{album.id}"
          aria-pressed={selected}
          aria-label={$t('select')}
          onclick={(event) => handleSelectClick(event, (shiftKey) => onToggleSelectAlbum?.(album, shiftKey))}
        >
          <Icon icon={mdiCheckCircle} size="20" class={selected ? 'text-primary' : 'opacity-50'} />
        </button>
      </td>
    {/if}
    <td class="text-md w-8/12 items-center text-start text-ellipsis sm:w-4/12 md:w-4/12 xl:w-[30%] 2xl:w-[40%]">
      <a
        href={Route.viewSpaceAlbum({ spaceId, albumId: album.id })}
        data-testid="space-album-row-{album.id}"
        class="hover:text-immich-primary"
      >
        {album.albumName}
      </a>
    </td>
    <td class="text-md text-center text-ellipsis sm:w-2/12 md:w-2/12 xl:w-[15%] 2xl:w-[12%]">
      {$t('items_count', { values: { count: album.assetCount } })}
    </td>
    <td class="text-md hidden w-3/12 text-center text-ellipsis sm:block xl:w-[15%] 2xl:w-[12%]">
      {dateLocaleString(album.updatedAt)}
    </td>
    <td class="text-md hidden w-3/12 text-center text-ellipsis sm:block xl:w-[15%] 2xl:w-[12%]">
      {dateLocaleString(album.createdAt)}
    </td>
    {#if canManage || canRename || canDelete}
      <td
        class="text-md w-1/12 text-end"
        data-testid="space-album-row-menu-{album.id}"
        onclick={(event) => event.stopPropagation()}
      >
        <ButtonContextMenu
          icon={mdiDotsVertical}
          title={$t('more')}
          color="secondary"
          variant="ghost"
          size="medium"
          align="top-right"
          direction="left"
        >
          {#if canManage}
            <MenuOption
              text={album.showInTimeline
                ? $t('spaces_hide_from_timeline')
                : $t('spaces_linked_albums_show_in_timeline')}
              onClick={() => onToggleTimeline?.(album)}
            />
            <MenuOption text={$t('spaces_linked_albums_unlink')} onClick={() => onUnlink?.(album)} />
          {/if}
          {#if canRename}
            <MenuOption text={$t('space_album_rename')} onClick={() => onRename?.(album)} />
          {/if}
          {#if canDelete}
            <MenuOption text={$t('space_album_delete')} onClick={() => onDelete?.(album)} />
          {/if}
        </ButtonContextMenu>
      </td>
    {/if}
  </tr>
{/snippet}

{#snippet folderRow(folder: SharedSpaceAlbumFolderDto)}
  {@const selected = isFolderSelected(folder.id)}
  <tr
    data-selected={selected ? 'true' : undefined}
    class={[
      'flex w-full cursor-pointer place-items-center border-3 p-2 text-center odd:bg-subtle/80 even:bg-subtle/20 hover:border-immich-primary/75 md:px-5 md:py-2 odd:dark:bg-immich-dark-gray/75 even:dark:bg-immich-dark-gray/50 dark:hover:border-immich-dark-primary/75',
      selected ? 'border-primary/70' : 'border-transparent',
    ]}
    data-testid="space-album-folder-row-{folder.id}"
    onclick={(event) => onOpenFolder?.(folder, event.shiftKey)}
  >
    {#if canManage}
      <td class="w-8 shrink-0 text-center">
        <button
          type="button"
          data-testid="space-album-folder-select-{folder.id}"
          aria-pressed={selected}
          aria-label={$t('select')}
          onclick={(event) => handleSelectClick(event, (shiftKey) => onToggleSelectFolder?.(folder, shiftKey))}
        >
          <Icon icon={mdiCheckCircle} size="20" class={selected ? 'text-primary' : 'opacity-50'} />
        </button>
      </td>
    {/if}
    <td
      class="text-md flex w-8/12 items-center gap-2 text-start text-ellipsis sm:w-4/12 md:w-4/12 xl:w-[30%] 2xl:w-[40%]"
    >
      <Icon icon={mdiFolder} size="20" />
      {folder.name}
    </td>
    <td class="text-md text-center text-ellipsis sm:w-2/12 md:w-2/12 xl:w-[15%] 2xl:w-[12%]">
      {$t('space_album_folder_albums_count', {
        values: { count: getRecursiveAlbumCount(folders, allAlbums, folder.id) },
      })}
    </td>
    <td class="text-md hidden w-3/12 text-center text-ellipsis sm:block xl:w-[15%] 2xl:w-[12%]"></td>
    <td class="text-md hidden w-3/12 text-center text-ellipsis sm:block xl:w-[15%] 2xl:w-[12%]"></td>
    {#if canManage || canRename || canDelete}
      <td class="text-md w-1/12 text-end"></td>
    {/if}
  </tr>
{/snippet}

<table class="w-full text-start">
  <thead>
    <tr class="flex w-full place-items-center border-3 border-transparent p-2 text-center md:px-5 md:py-2">
      <th class="text-md w-8/12 text-start sm:w-4/12 md:w-4/12 xl:w-[30%] 2xl:w-[40%]">{$t('album_name')}</th>
      <th class="text-md text-center sm:w-2/12 md:w-2/12 xl:w-[15%] 2xl:w-[12%]"
        >{$t('items_count', { values: { count: 0 } }).replace(/\d+\s/, '')}</th
      >
      <th class="text-md hidden text-center sm:block xl:w-[15%] 2xl:w-[12%]">{$t('sort_modified')}</th>
      <th class="text-md hidden text-center sm:block xl:w-[15%] 2xl:w-[12%]">{$t('date_created')}</th>
      {#if canManage || canRename || canDelete}
        <th class="text-md w-1/12 text-end"></th>
      {/if}
    </tr>
  </thead>
  {#if levelFolders.length > 0}
    <tbody data-testid="space-album-folders-tbody">
      {#each levelFolders as folder (folder.id)}
        {@render folderRow(folder)}
      {/each}
    </tbody>
  {/if}
  {#if grouped}
    {#each groups as group (group.id)}
      {@const collapsed = isSpaceAlbumGroupCollapsed($spaceAlbumViewSettings, group.id)}
      {@const iconRotation = collapsed ? 'rotate-0' : 'rotate-90'}
      <tbody class="mt-4 block w-full">
        <tr
          class="flex w-full place-items-center p-2 md:py-3 md:ps-5 md:pe-5"
          onclick={() => toggleSpaceAlbumGroupCollapsing(group.id)}
          aria-expanded={!collapsed}
          data-testid="space-album-group-header-{group.id}"
        >
          <td class="text-md -mb-1 text-start">
            <Icon
              icon={mdiChevronRight}
              size="20"
              class="-mt-2 inline-block transition-all duration-250 {iconRotation}"
            />
            <span class="text-2xl font-bold">{group.name}</span>
            <span class="ms-1.5">
              ({$t('albums_count', { values: { count: group.albums.length } })})
            </span>
          </td>
        </tr>
      </tbody>
      {#if !collapsed}
        <tbody class="mt-2 block w-full" transition:slide={{ duration: 300 }}>
          {#each group.albums as album (album.id)}
            {@render albumRow(album)}
          {/each}
        </tbody>
      {/if}
    {/each}
  {:else}
    <tbody>
      {#each albums as album (album.id)}
        {@render albumRow(album)}
      {/each}
    </tbody>
  {/if}
</table>
