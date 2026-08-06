<script lang="ts">
  import type {
    AlbumResponseDto,
    SharedSpaceAlbumFolderDto,
    SharedSpaceLinkedAlbumDto,
    SharedSpaceMemberResponseDto,
  } from '@immich/sdk';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { SpaceAlbumMultiSelectManager } from '$lib/managers/space-album-multi-select-manager.svelte';
  import { AlbumViewMode, SortOrder } from '$lib/stores/preferences.store';
  import { keyboardManager } from '$lib/stores/keyboard-manager.svelte';
  import { SpaceAlbumGroupBy, spaceAlbumViewSettings } from '$lib/stores/space-album-view-settings.store';
  import { sortAlbums } from '$lib/utils/album-utils';
  import {
    buildSpaceAlbumGroups,
    getSelectedSpaceAlbumGroupOption,
    isSpaceAlbumGroupCollapsed,
    toggleSpaceAlbumGroupCollapsing,
  } from '$lib/utils/space-album-grouping';
  import {
    flattenForSearch,
    getFolderContents,
    getFolderPreviewAssetIds,
    getRecursiveAlbumCount,
  } from '$lib/utils/space-album-folders';
  import type { DragPayload } from '$lib/utils/space-album-folder-dnd';
  import LoadingSpinner from '$lib/components/shared-components/LoadingSpinner.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import SpaceAlbumCard from '$lib/components/spaces/space-album-card.svelte';
  import SpaceAlbumFolderCard from '$lib/components/spaces/space-album-folder-card.svelte';
  import SpaceAlbumSelectBar from '$lib/components/spaces/space-album-select-bar.svelte';
  import SpaceAlbumsTable from '$lib/components/spaces/space-albums-table.svelte';
  import { Icon } from '@immich/ui';
  import { mdiChevronRight } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { slide } from 'svelte/transition';

  interface Props {
    spaceId: string;
    albums: SharedSpaceLinkedAlbumDto[];
    folders?: SharedSpaceAlbumFolderDto[];
    /** The most recent folders fetch failed — fall back to a flat, unscoped album list rather
     * than hiding every album that lives in a folder we have no metadata for. */
    foldersUnavailable?: boolean;
    currentFolderId?: string | null;
    canManage: boolean;
    members?: SharedSpaceMemberResponseDto[];
    groupIds?: string[];
    searchQuery?: string;
    onUnlink?: (album: SharedSpaceLinkedAlbumDto) => void;
    onToggleTimeline?: (album: SharedSpaceLinkedAlbumDto) => void;
    onMoveAlbum?: (album: SharedSpaceLinkedAlbumDto) => void;
    /** Fired when the user opens an album with no selection active (design §5.1). */
    onOpenAlbum?: (album: SharedSpaceLinkedAlbumDto) => void;
    onOpenFolder?: (folder: SharedSpaceAlbumFolderDto) => void;
    onRenameFolder?: (folder: SharedSpaceAlbumFolderDto) => void;
    onMoveFolder?: (folder: SharedSpaceAlbumFolderDto) => void;
    onDeleteFolder?: (folder: SharedSpaceAlbumFolderDto) => void;
    onDropItem?: (payload: DragPayload, targetFolderId: string | null) => void;
    // I-1: bumped by the page after a multi-id drag-move (via EITHER drop target — the folder
    // grid, forwarded through onDropItem above, or the breadcrumb, which the page renders
    // directly and has no other route back into this component's own manager) completes. See
    // Trigger 5 below for why nothing else can catch this.
    selectionMoveSignal?: number;
    // Bulk-action callbacks for the selection bar. Each resolves to the ids that should REMAIN
    // selected (typically the page's own bulkXAction's `failedIds` — see space-album-bulk-actions.ts
    // — or, on a cancelled confirm dialog, the untouched input `ids`) so this component can fold
    // the result straight into the manager's own `reconcile` without the page reaching into it.
    onBulkUnlink?: (ids: string[]) => Promise<string[]>;
    onBulkMoveAlbums?: (ids: string[]) => Promise<string[]>;
    onBulkToggleAlbumsTimeline?: (ids: string[], showInTimeline: boolean) => Promise<string[]>;
    onBulkMoveFolders?: (ids: string[]) => Promise<string[]>;
    onBulkDeleteFolders?: (ids: string[]) => Promise<string[]>;
  }

  let {
    spaceId,
    albums,
    folders = [],
    foldersUnavailable = false,
    currentFolderId = null,
    canManage,
    members = [],
    // eslint-disable-next-line no-useless-assignment
    groupIds = $bindable([]),
    searchQuery = '',
    onUnlink,
    onToggleTimeline,
    onMoveAlbum,
    onOpenAlbum,
    onOpenFolder,
    onRenameFolder,
    onMoveFolder,
    onDeleteFolder,
    onDropItem,
    selectionMoveSignal = 0,
    onBulkUnlink,
    onBulkMoveAlbums,
    onBulkToggleAlbumsTimeline,
    onBulkMoveFolders,
    onBulkDeleteFolders,
  }: Props = $props();

  const isSearching = $derived((searchQuery ?? '').trim().length > 0);

  // While searching we leave the folder tree entirely: hits come from the whole space, each
  // labelled with its path. `?folder=` is untouched, so clearing the box restores this level.
  // flattenForSearch returns raw server order — re-apply the active sort so a search doesn't
  // silently discard the user's chosen ordering (grouping is the only thing search drops).
  const searchHits = $derived.by(() => {
    if (!isSearching) {
      return [];
    }
    const hits = flattenForSearch(folders, albums, searchQuery);
    const pathByAlbumId = new Map(hits.map((hit) => [hit.album.id, hit.path]));
    const sortedHitAlbums = sortAlbums(hits.map((hit) => hit.album) as unknown as AlbumResponseDto[], {
      sortBy: $spaceAlbumViewSettings.sortBy,
      orderBy: $spaceAlbumViewSettings.sortOrder,
    }) as unknown as SharedSpaceLinkedAlbumDto[];
    return sortedHitAlbums.map((album) => ({ album, path: pathByAlbumId.get(album.id) ?? [] }));
  });

  const searchHitAlbums = $derived(searchHits.map((hit) => hit.album));

  const contents = $derived(getFolderContents(folders, albums, currentFolderId ?? null));

  // Folders sort by NAME, honouring the sort direction but ignoring the sort key: assetCount and
  // mostRecentPhoto do not map onto a folder, and reshuffling them under "sort by item count" is
  // noise. Folders are never part of a search result set, and are hidden entirely (rather than
  // shown untrustworthy) while the folder tree failed to load.
  const sortedFolders = $derived(
    isSearching || foldersUnavailable
      ? []
      : contents.folders
          .slice()
          .sort((a, b) =>
            $spaceAlbumViewSettings.sortOrder === SortOrder.Desc
              ? b.name.localeCompare(a.name)
              : a.name.localeCompare(b.name),
          ),
  );

  // Everything downstream — filter, sort, group — now sees only THIS level's albums. When the
  // folder tree failed to load we can't reliably scope by level at all (we don't know which
  // albums belong at THIS level vs. a folder we have no data for), so degrade to every album in
  // the space, flat — far better than silently hiding anything with a non-null folderId.
  const levelAlbums = $derived(isSearching ? [] : foldersUnavailable ? albums : contents.albums);

  const filtered = $derived.by(() => {
    const q = (searchQuery ?? '').trim().toLowerCase();
    if (!q) {
      return levelAlbums;
    }
    return levelAlbums.filter(
      (a) => a.albumName.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q),
    );
  });

  const sorted = $derived(
    sortAlbums(filtered as unknown as AlbumResponseDto[], {
      sortBy: $spaceAlbumViewSettings.sortBy,
      orderBy: $spaceAlbumViewSettings.sortOrder,
    }) as unknown as SharedSpaceLinkedAlbumDto[],
  );

  const groups = $derived(
    buildSpaceAlbumGroups(sorted, $spaceAlbumViewSettings, {
      ungrouped: $t('albums'),
      unknownYear: $t('unknown_year'),
      unassigned: $t('unassigned'),
      myAlbums: $t('my_albums'),
      currentUserId: authManager.user.id,
      members: members.map((m) => ({ userId: m.userId, name: m.name })),
    }),
  );

  const isGrouped = $derived(getSelectedSpaceAlbumGroupOption($spaceAlbumViewSettings) !== SpaceAlbumGroupBy.None);

  $effect(() => {
    groupIds = groups.map((g) => g.id);
  });

  // Owned here (not by the route's +page.svelte) because three of its clearing triggers —
  // currentFolderId, searchQuery, and spaceId — are THIS component's own props, and the manager
  // needs to react to them directly. See the $effects below (search "Trigger").
  const selection = new SpaceAlbumMultiSelectManager();

  // §4.3: range resolution needs ONE flat list in visual order, folders first then albums, so the
  // two selection kinds stay CONTIGUOUS blocks. If they were interleaved, a same-kind Shift-range
  // could pull an id of the OTHER kind in via raw index slicing (the manager's #range does not
  // filter by kind) — see space-album-multi-select-manager.svelte.ts's docstring.
  const orderedFolderIds = $derived(isSearching || foldersUnavailable ? [] : sortedFolders.map((f) => f.id));

  const orderedAlbumIds = $derived.by(() => {
    if (isSearching) {
      return searchHitAlbums.map((a) => a.id);
    }
    if (isGrouped) {
      return groups
        .filter((g) => !isSpaceAlbumGroupCollapsed($spaceAlbumViewSettings, g.id))
        .flatMap((g) => g.albums.map((a) => a.id));
    }
    return sorted.map((a) => a.id);
  });

  const orderedIds = $derived([...orderedFolderIds, ...orderedAlbumIds]);

  const selectAlbum = (id: string, shiftKey: boolean) => {
    if (shiftKey) {
      selection.selectRange('album', id, orderedIds);
    } else {
      selection.toggle('album', id, orderedIds);
    }
  };

  const selectFolder = (id: string, shiftKey: boolean) => {
    if (shiftKey) {
      selection.selectRange('folder', id, orderedIds);
    } else {
      selection.toggle('folder', id, orderedIds);
    }
  };

  // Design table (§5.1): "Click a card, selection active → toggles"; "no selection active →
  // opens". The card/row components have no opinion on which — they just report the click.
  const handleAlbumClick = (album: SharedSpaceLinkedAlbumDto, shiftKey: boolean) => {
    if (selection.selectionActive) {
      selectAlbum(album.id, shiftKey);
    } else {
      onOpenAlbum?.(album);
    }
  };

  const handleFolderClick = (folder: SharedSpaceAlbumFolderDto, shiftKey = false) => {
    if (selection.selectionActive) {
      selectFolder(folder.id, shiftKey);
    } else {
      onOpenFolder?.(folder);
    }
  };

  // Shift-hover range preview (§4.3 / §5.1). Reads keyboardManager rather than the mouse event's
  // own shiftKey so a hover that starts before Shift is pressed still previews correctly. This
  // only fires on `mouseenter`, so it does NOT by itself clear the preview if Shift is released
  // (or the mouse moves off every card) without a new mouseenter elsewhere — see the effect below.
  const handleAlbumHover = (album: SharedSpaceLinkedAlbumDto) => {
    if (keyboardManager.shift && selection.selectionActive) {
      selection.previewRange('album', album.id, orderedIds);
    }
  };
  const handleFolderHover = (folder: SharedSpaceAlbumFolderDto) => {
    if (keyboardManager.shift && selection.selectionActive) {
      selection.previewRange('folder', folder.id, orderedIds);
    }
  };

  // M-2: without this, releasing Shift mid-hover leaves the candidate outline (and
  // `isCandidate`) stuck on whatever was last previewed — the hover handlers above only run on
  // `mouseenter`, so nothing re-evaluates once the mouse stops moving. This effect is the
  // general-purpose fix: the moment `keyboardManager.shift` goes false, the preview is cleared
  // regardless of mouse position. Safe unconditionally — `candidates` is never meaningfully
  // populated while Shift isn't held (both hover handlers gate `previewRange` on it).
  $effect(() => {
    if (!keyboardManager.shift) {
      selection.candidates = [];
    }
  });

  // E-5: an item that disappears from the incoming data (unlinked/deleted elsewhere, or a level
  // change under foldersUnavailable) must silently drop out of the selection. This runs on every
  // `albums`/`folders` identity change — i.e. every reload() the page performs, not on a timer or
  // a background poll this surface doesn't have. reconcile() also unconditionally clears
  // `candidates` (see the manager's own doc comment), so a reload mid Shift-hover blanks the
  // preview until the next mouseenter; accepted, since every current reload is the DIRECT result
  // of a user action (their own edit, unlink, or move), not a silent background refresh.
  const presentIds = $derived([...albums.map((a) => a.id), ...folders.map((f) => f.id)]);
  $effect(() => {
    selection.reconcile(presentIds);
  });

  // Trigger 1 (§5.1): entering/leaving a folder is `?folder=` on the SAME route, so `AppNavigate`
  // does not fire for it — this component's own `currentFolderId` prop is the only signal.
  //
  // Compares against the LAST VALUE the effect actually saw (rather than firing unconditionally
  // on every re-run) so a re-render that changes some OTHER prop can never spuriously clear an
  // active selection — this only fires selection.clear() when currentFolderId itself changed.
  let lastFolderId: string | null | undefined;
  $effect(() => {
    const current = currentFolderId;
    if (lastFolderId !== undefined && lastFolderId !== current) {
      selection.clear();
    }
    lastFolderId = current;
  });

  // Trigger 2 (§5.1 / E-6): searchQuery is local $state on the page, not URL-backed, so no
  // navigation of any kind fires when it changes — this is the ONLY way it clears. Same
  // value-comparison guard as above, for the same reason.
  let lastSearchQuery: string | undefined;
  $effect(() => {
    const current = searchQuery;
    if (lastSearchQuery !== undefined && lastSearchQuery !== current) {
      selection.clear();
    }
    lastSearchQuery = current;
  });

  // Trigger 3 (§5.1 / I-2 fix): switching spaces. `/spaces/A/albums` → `/spaces/B/albums` is the
  // SAME route id (`/(user)/spaces/[spaceId]/albums`), so +layout.svelte's same-route-transition
  // check returns before `AppNavigate` is emitted — that event does NOT cover this case, despite
  // an earlier version of this comment claiming it did. `currentFolderId`/`searchQuery` don't
  // necessarily change either. Nor is `reconcile` (trigger against `presentIds`, above) a reliable
  // backstop: if an album is linked to BOTH spaces, it stays present in the new space's data too,
  // so reconcile has nothing to drop — the bar would keep reading "1 selected" against the WRONG
  // space, and a bulk action would act on the wrong space's link row. `spaceId` itself is this
  // component's own prop, so it gets the same last-seen-value guard as the other two triggers.
  let lastSpaceId: string | undefined;
  $effect(() => {
    const current = spaceId;
    if (lastSpaceId !== undefined && lastSpaceId !== current) {
      selection.clear();
    }
    lastSpaceId = current;
  });

  // Trigger 4 (§5.1): still needed for leaving the albums route entirely to a DIFFERENT route
  // (e.g. into an album's own detail page, or off the space entirely) — that's a real navigation,
  // not a same-route param change, so `AppNavigate` does fire for it.
  const handleAppNavigate = () => selection.clear();

  // Trigger 5 (I-1, fix round 1): a multi-id drag-move can move every selected item out of the
  // current folder level without any of Triggers 1-4 firing — currentFolderId/searchQuery/spaceId
  // are all unchanged (the VIEWER didn't navigate, the DATA did), and it's AppNavigate-silent for
  // the same reason those are. The E-5 reconcile effect above can't catch it either: a moved
  // album/folder is still PRESENT in the space's data, just under a different
  // folderId/parentId — reconcile only drops ids that vanish entirely. Left alone, the bar keeps
  // reading "N selected" and offering confirmed-destructive bulk actions (unlink, delete) against
  // a selection with no visible card on screen. `+page.svelte` bumps `selectionMoveSignal` once a
  // multi-id drag-move completes (success or partial failure — the drag discharged the user's
  // intent either way) for BOTH drop targets: the folder grid (its onDropItem is forwarded
  // through this component) and the breadcrumb (which the page renders directly, with no other
  // route back into this component's own manager).
  let lastSelectionMoveSignal: number | undefined;
  $effect(() => {
    const current = selectionMoveSignal;
    if (lastSelectionMoveSignal !== undefined && lastSelectionMoveSignal !== current) {
      selection.clear();
    }
    lastSelectionMoveSignal = current;
  });

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && selection.selectionActive) {
      selection.clear();
    }
  };

  // M-3: selection can only ever be ENTERED while canManage is true (the check circle is gated on
  // it), but canManage can go FALSE mid-selection if the viewer's role is downgraded and a
  // `invalidateAll()` elsewhere refreshes `members` (E-15). Without this, the bar disappears
  // (also gated on canManage, see the template) yet the selection itself survives, and
  // handleAlbumClick/handleFolderClick keep routing clicks to toggle — silently making every card
  // unopenable, since `selection.selectionActive` is still true, until the user navigates away.
  $effect(() => {
    if (!canManage) {
      selection.clear();
    }
  });

  const allSelectedAlbumsInTimeline = $derived(
    selection.kind === 'album' && selection.ids.every((id) => albums.find((a) => a.id === id)?.showInTimeline),
  );

  // Composes each bulk-action prop with the manager's own `reconcile` primitive (Task 10's review
  // hint): reconcile drops any selected id NOT in the given list, so handing it exactly "the ids
  // that should remain selected" — the contract each onBulk* prop above documents — makes total
  // success clear the selection (S-26), a partial failure keep only the failures (S-24), and a
  // total failure keep everything (S-25) without this component ever inspecting *why*.
  //
  // The try/catch is defence in depth, not load-bearing for the page's own handlers: those already
  // funnel every bulk call through space-album-bulk-actions.ts's runBulkAction, which never
  // rethrows. But E-19's guarantee — a failed request must not silently deselect anything — should
  // hold at THIS boundary too, in case a caller's handler throws for some other reason.
  async function runBulkAction(action: ((ids: string[]) => Promise<string[]>) | undefined, ids: string[]) {
    if (!action) {
      return;
    }
    try {
      const keep = await action(ids);
      selection.reconcile(keep);
    } catch {
      // Nothing to do — leaving the selection untouched IS the correct outcome here.
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />
<OnEvents onAppNavigate={handleAppNavigate} />

{#if isSearching}
  {#if searchHits.length === 0}
    <p data-testid="space-albums-no-results" class="p-4 text-center text-gray-500">{$t('space_albums_no_matching')}</p>
  {:else if $spaceAlbumViewSettings.view === AlbumViewMode.List}
    <!-- Respect the user's List/Cover preference during a search too — it must not be silently
         discarded for the duration of the query. Deliberately UNGROUPED and with no folder rows
         (search escapes the folder tree entirely). -->
    <SpaceAlbumsTable
      {spaceId}
      albums={searchHitAlbums}
      {canManage}
      {onUnlink}
      {onToggleTimeline}
      onOpenAlbum={handleAlbumClick}
      onToggleSelectAlbum={(album, shiftKey) => selectAlbum(album.id, shiftKey)}
      isAlbumSelected={(id) => selection.has('album', id)}
    />
  {:else}
    <!-- Flattened, deliberately UNGROUPED: the path subtitle is the organising signal. -->
    <div class="grid grid-auto-fill-56 gap-y-4">
      {#each searchHits as hit (hit.album.id)}
        <div>
          <SpaceAlbumCard
            {spaceId}
            album={hit.album}
            {canManage}
            {onUnlink}
            {onToggleTimeline}
            onMove={onMoveAlbum}
            selected={selection.has('album', hit.album.id)}
            selectionCandidate={selection.isCandidate(hit.album.id)}
            selectedIds={selection.ids}
            selectedKind={selection.kind}
            onOpen={handleAlbumClick}
            onToggleSelect={(shiftKey) => selectAlbum(hit.album.id, shiftKey)}
            onHover={() => handleAlbumHover(hit.album)}
          />
          {#if hit.path.length > 0}
            <p class="px-5 text-xs opacity-70" data-testid="space-album-search-path-{hit.album.id}">
              {hit.path.join(' › ')}
            </p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
{:else if currentFolderId && levelAlbums.length === 0 && sortedFolders.length === 0}
  <!-- Reusing the space-level empty state here would wrongly claim the space has no albums at
       all, when it only means THIS folder is empty. -->
  <p class="p-8 text-center text-gray-500" data-testid="space-album-folder-empty">
    {$t('space_album_folder_empty')}
  </p>
{:else if sortedFolders.length > 0 || filtered.length > 0}
  {#if $spaceAlbumViewSettings.view === AlbumViewMode.List}
    {#if isGrouped}
      <SpaceAlbumsTable
        {spaceId}
        albums={sorted}
        {folders}
        allAlbums={albums}
        {currentFolderId}
        {canManage}
        {groups}
        grouped
        {onUnlink}
        {onToggleTimeline}
        onOpenFolder={handleFolderClick}
        onOpenAlbum={handleAlbumClick}
        onToggleSelectAlbum={(album, shiftKey) => selectAlbum(album.id, shiftKey)}
        onToggleSelectFolder={(folder, shiftKey) => selectFolder(folder.id, shiftKey)}
        isAlbumSelected={(id) => selection.has('album', id)}
        isFolderSelected={(id) => selection.has('folder', id)}
      />
    {:else}
      <SpaceAlbumsTable
        {spaceId}
        albums={sorted}
        {folders}
        allAlbums={albums}
        {currentFolderId}
        {canManage}
        {onUnlink}
        {onToggleTimeline}
        onOpenFolder={handleFolderClick}
        onOpenAlbum={handleAlbumClick}
        onToggleSelectAlbum={(album, shiftKey) => selectAlbum(album.id, shiftKey)}
        onToggleSelectFolder={(folder, shiftKey) => selectFolder(folder.id, shiftKey)}
        isAlbumSelected={(id) => selection.has('album', id)}
        isFolderSelected={(id) => selection.has('folder', id)}
      />
    {/if}
  {:else}
    {#if sortedFolders.length > 0}
      <div class="grid grid-auto-fill-56 gap-y-4" data-testid="space-album-folders-grid">
        {#each sortedFolders as folder (folder.id)}
          <SpaceAlbumFolderCard
            {folder}
            albumCount={getRecursiveAlbumCount(folders, albums, folder.id)}
            previewAssetIds={getFolderPreviewAssetIds(folders, albums, folder.id)}
            {canManage}
            {folders}
            {albums}
            selected={selection.has('folder', folder.id)}
            selectionCandidate={selection.isCandidate(folder.id)}
            selectedIds={selection.ids}
            selectedKind={selection.kind}
            onOpen={handleFolderClick}
            onToggleSelect={(shiftKey) => selectFolder(folder.id, shiftKey)}
            onHover={() => handleFolderHover(folder)}
            onRename={onRenameFolder}
            onMove={onMoveFolder}
            onDelete={onDeleteFolder}
            {onDropItem}
          />
        {/each}
      </div>
    {/if}
    {#if filtered.length > 0}
      {#if isGrouped}
        {#each groups as group (group.id)}
          {@const collapsed = isSpaceAlbumGroupCollapsed($spaceAlbumViewSettings, group.id)}
          {@const iconRotation = collapsed ? 'rotate-0' : 'rotate-90'}
          <div class="grid">
            <button
              type="button"
              onclick={() => toggleSpaceAlbumGroupCollapsing(group.id)}
              class="mt-2 w-full cursor-pointer rounded-md py-2 pe-2 text-start transition-colors hover:bg-subtle hover:text-primary dark:text-immich-dark-fg dark:hover:bg-immich-dark-gray"
              aria-expanded={!collapsed}
              data-testid="space-album-group-{group.id}"
            >
              <Icon
                icon={mdiChevronRight}
                size="24"
                class="-mt-2.5 inline-block transition-all duration-250 {iconRotation}"
              />
              <span class="text-3xl font-bold text-black dark:text-white">{group.name}</span>
              <span class="ms-1.5">({$t('albums_count', { values: { count: group.albums.length } })})</span>
            </button>
            <hr class="dark:border-immich-dark-gray" />
          </div>
          {#if !collapsed}
            <div class="mt-4 grid grid-auto-fill-56 gap-y-4" transition:slide={{ duration: 300 }}>
              {#each group.albums as album (album.id)}
                <SpaceAlbumCard
                  {spaceId}
                  {album}
                  {canManage}
                  {onUnlink}
                  {onToggleTimeline}
                  onMove={onMoveAlbum}
                  selected={selection.has('album', album.id)}
                  selectionCandidate={selection.isCandidate(album.id)}
                  selectedIds={selection.ids}
                  selectedKind={selection.kind}
                  onOpen={handleAlbumClick}
                  onToggleSelect={(shiftKey) => selectAlbum(album.id, shiftKey)}
                  onHover={() => handleAlbumHover(album)}
                />
              {/each}
            </div>
          {/if}
        {/each}
      {:else}
        <div class="grid grid-auto-fill-56 gap-y-4">
          {#each sorted as album (album.id)}
            <SpaceAlbumCard
              {spaceId}
              {album}
              {canManage}
              {onUnlink}
              {onToggleTimeline}
              onMove={onMoveAlbum}
              selected={selection.has('album', album.id)}
              selectionCandidate={selection.isCandidate(album.id)}
              selectedIds={selection.ids}
              selectedKind={selection.kind}
              onOpen={handleAlbumClick}
              onToggleSelect={(shiftKey) => selectAlbum(album.id, shiftKey)}
              onHover={() => handleAlbumHover(album)}
            />
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
{:else}
  <!-- Reachable on first paint (folders starts empty and is only filled by the caller's
       on-mount reload, so a space whose albums all live in folders is briefly like this) and,
       without foldersUnavailable being set, on a load failure — never leave the pane silently
       blank while that resolves. -->
  <div class="flex justify-center p-8" data-testid="space-albums-loading">
    <LoadingSpinner />
  </div>
{/if}

{#if canManage && selection.selectionActive}
  <SpaceAlbumSelectBar
    kind={selection.kind === 'folder' ? 'folder' : 'album'}
    count={selection.count}
    allInTimeline={allSelectedAlbumsInTimeline}
    onClear={() => selection.clear()}
    onUnlink={() => void runBulkAction(onBulkUnlink, selection.ids)}
    onMove={() => void runBulkAction(selection.kind === 'folder' ? onBulkMoveFolders : onBulkMoveAlbums, selection.ids)}
    onDelete={() => void runBulkAction(onBulkDeleteFolders, selection.ids)}
    onToggleTimeline={(showInTimeline) =>
      void runBulkAction(
        onBulkToggleAlbumsTimeline && ((ids) => onBulkToggleAlbumsTimeline(ids, showInTimeline)),
        selection.ids,
      )}
  />
{/if}
