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
    /** Rename is allowed for a space Editor (canManage) OR the album's own owner — genuinely
     * per-row, since this single call renders every album in `albums` and two rows can have
     * different owners. Defaults to `() => false` so a caller that hasn't wired capability
     * derivation yet fails closed rather than breaking the type check — same rationale as
     * SpaceAlbumFolderNameModal's icon/label. */
    canRename?: (album: SharedSpaceLinkedAlbumDto) => boolean;
    /** Delete is allowed for the album's own owner ONLY — never granted by canManage alone. Same
     * per-row shape and fail-closed default as `canRename` above. */
    canDelete?: (album: SharedSpaceLinkedAlbumDto) => boolean;
    /** Per-ROW selectability (the check circle) — a viewer who owns just SOME of the rendered
     * albums must still be able to select the ones they own. Defaults to `() => canManage` so a
     * caller that hasn't wired per-album ownership keeps today's canManage-only behaviour. */
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
    canRename = () => false,
    canDelete = () => false,
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

  // Structural threshold for the actions column as a WHOLE (header `<th>` and every folder row's
  // trailing filler `<td>`, neither of which has a single album to evaluate a per-row predicate
  // against): the column must exist the moment ANY rendered album row would show it, so the header
  // and folder rows stay aligned with the album rows underneath them (Task 6's column-alignment
  // fix). Per-row presence inside `albumRow` itself uses `canRename(album)`/`canDelete(album)`
  // directly and does not read this. `albums` is already the full flat list the table renders even
  // when `grouped` — `groups` is derived from it, not a separate source — so this covers both.
  const anyAlbumEditable = $derived(canManage || albums.some((album) => canRename(album) || canDelete(album)));

  // I-3 (final review): the leading select column's counterpart to `anyAlbumEditable`, and for the
  // same reason. Both edge columns must be decided TABLE-WIDE and only their CONTENTS per row: a
  // viewer who owns some of the rendered albums used to get a 32px `w-8 shrink-0` cell on their
  // owned rows and none on the rest, so unowned rows' album names sat 32px left of owned rows'.
  // Before this branch both cells were gated on the uniform page-wide `canManage`, so every row
  // agreed by construction; per-row gating is what broke that. Folder rows share this column too
  // (their own button stays `canManage`-only inside it), so a viewer's folder row keeps an empty
  // cell rather than dropping it.
  const anyAlbumSelectable = $derived(canManage || albums.some((album) => canSelectAlbum(album)));
</script>

{#snippet albumRow(album: SharedSpaceLinkedAlbumDto)}
  {@const selected = isAlbumSelected(album.id)}
  {@const selectable = canSelectAlbum(album)}
  {@const hasRowMenu = canManage || canRename(album) || canDelete(album)}
  <tr
    data-selected={selected ? 'true' : undefined}
    class={[
      'flex w-full place-items-center border-3 p-2 text-center odd:bg-subtle/80 even:bg-subtle/20 hover:border-immich-primary/75 md:px-5 md:py-2 odd:dark:bg-immich-dark-gray/75 even:dark:bg-immich-dark-gray/50 dark:hover:border-immich-dark-primary/75',
      selected ? 'border-primary/70' : 'border-transparent',
    ]}
    onclick={(event) => handleAlbumRowClick(event, album)}
  >
    <!-- The CELL is structural (anyAlbumSelectable, table-wide) so every row keeps the same column
         grid; only its CONTENTS are per-row. `canSelectAlbum` is an independent predicate from
         canRename/canDelete below (selectability and rename/delete are different capabilities that
         happen to often coincide, not the same thing under two names): a viewer who owns THIS album
         must be able to enter selection even though canManage (space Editor) is false for them,
         without also exposing the check circle on a row for an album they do not own. -->
    {#if anyAlbumSelectable}
      <td class="w-8 shrink-0 text-center">
        {#if selectable}
          <button
            type="button"
            data-testid="space-album-select-{album.id}"
            aria-pressed={selected}
            aria-label={$t('select')}
            onclick={(event) => handleSelectClick(event, (shiftKey) => onToggleSelectAlbum?.(album, shiftKey))}
          >
            <Icon icon={mdiCheckCircle} size="20" class={selected ? 'text-primary' : 'opacity-50'} />
          </button>
        {/if}
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
    <!-- Same structural-cell/per-row-contents split as the leading select cell above. The testid
         and the click-swallowing both stay tied to `hasRowMenu`, so a filler cell is indistinguishable
         from the rest of the row: no phantom menu for a test to find, and clicking it still opens
         the album like any other cell. -->
    {#if anyAlbumEditable}
      <td
        class="text-md w-1/12 text-end"
        data-testid={hasRowMenu ? `space-album-row-menu-${album.id}` : undefined}
        onclick={(event) => {
          if (hasRowMenu) {
            event.stopPropagation();
          }
        }}
      >
        {#if hasRowMenu}
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
            {#if canRename(album)}
              <MenuOption text={$t('space_album_rename')} onClick={() => onRename?.(album)} />
            {/if}
            {#if canDelete(album)}
              <MenuOption text={$t('space_album_delete')} onClick={() => onDelete?.(album)} />
            {/if}
          </ButtonContextMenu>
        {/if}
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
    <!-- Structural cell shared with the album rows (anyAlbumSelectable); the button itself stays
         canManage-only, since folders have no owner concept and a viewer can never select one. -->
    {#if anyAlbumSelectable}
      <td class="w-8 shrink-0 text-center">
        {#if canManage}
          <button
            type="button"
            data-testid="space-album-folder-select-{folder.id}"
            aria-pressed={selected}
            aria-label={$t('select')}
            onclick={(event) => handleSelectClick(event, (shiftKey) => onToggleSelectFolder?.(folder, shiftKey))}
          >
            <Icon icon={mdiCheckCircle} size="20" class={selected ? 'text-primary' : 'opacity-50'} />
          </button>
        {/if}
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
    {#if anyAlbumEditable}
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
      {#if anyAlbumEditable}
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
