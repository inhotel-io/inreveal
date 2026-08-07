<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import SpaceAlbumFolderBreadcrumb from '$lib/components/spaces/space-album-folder-breadcrumb.svelte';
  import SpaceAlbumsControls from '$lib/components/spaces/space-albums-controls.svelte';
  import SpaceAlbumsList from '$lib/components/spaces/space-albums-list.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import SpaceAlbumFolderNameModal from '$lib/modals/SpaceAlbumFolderNameModal.svelte';
  import SpaceAlbumFolderPickerModal from '$lib/modals/SpaceAlbumFolderPickerModal.svelte';
  import SpaceLinkAlbumModal from '$lib/modals/SpaceLinkAlbumModal.svelte';
  import { Route } from '$lib/route';
  import { handleError } from '$lib/utils/handle-error';
  import { createAlbum } from '$lib/utils/album-utils';
  import {
    bulkDeleteAlbumFoldersAction,
    bulkDeleteAlbumsAction,
    bulkMoveAlbumFoldersAction,
    bulkSetAlbumFolderAction,
    bulkSetAlbumTimelineAction,
    bulkUnlinkAlbumsAction,
  } from '$lib/utils/space-album-bulk-actions';
  import { canDrop, canDropOne, type DragPayload } from '$lib/utils/space-album-folder-dnd';
  import { getFolderPath } from '$lib/utils/space-album-folders';
  import {
    createSharedSpaceAlbumFolder,
    deleteSharedSpaceAlbumFolder,
    getSharedSpaceAlbumFolders,
    getSharedSpaceAlbums,
    linkAlbum,
    renameSharedSpaceAlbum,
    setSharedSpaceAlbumFolder,
    SharedSpaceRole,
    unlinkAlbum,
    updateSharedSpaceAlbum,
    updateSharedSpaceAlbumFolder,
    type SharedSpaceAlbumFolderDto,
    type SharedSpaceLinkedAlbumDto,
    type SharedSpaceMemberResponseDto,
    type SharedSpaceResponseDto,
  } from '@immich/sdk';
  import { Button, Icon, modalManager, toastManager } from '@immich/ui';
  import {
    mdiFolderPlusOutline,
    mdiImageMultipleOutline,
    mdiLinkVariantPlus,
    mdiPlus,
    mdiRenameOutline,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const space = $derived<SharedSpaceResponseDto>(data.space);
  const members = $derived<SharedSpaceMemberResponseDto[]>(data.members);
  let albums = $state<SharedSpaceLinkedAlbumDto[]>(data.linkedAlbums);
  let folders = $state<SharedSpaceAlbumFolderDto[]>([]);
  // True once a folders fetch has ever SUCCEEDED (even with an empty result) — distinct from
  // `folders.length > 0`, which can't tell "haven't loaded yet" apart from "genuinely zero
  // folders" and would otherwise never let the fallback effect below strip a dangling ?folder=
  // for a space that no longer has any folders at all.
  let foldersLoaded = $state(false);
  // True when the MOST RECENT folders fetch failed.
  let foldersLoadFailed = $state(false);
  let groupIds = $state<string[]>([]);
  let searchQuery = $state('');
  // I-1 (fix round 2): bumped after ANY drag-move settles, so SpaceAlbumsList's own Trigger 5
  // effect can reconcile a selection whose moved members just left view — see that effect's own
  // comment for why nothing else (route change, prop change, reconcile) catches this. `movedIds`
  // (not a bare success/fail boolean) is what lets Trigger 5 drop exactly what moved and keep
  // exactly what didn't — a failed item stayed exactly where it was and is still visible, so it
  // must stay selected, matching S-24/S-25's contract for every other bulk action in this feature.
  // `seq` (not just comparing movedIds by value) is what makes two consecutive moves of the SAME
  // id register as two distinct signals rather than looking unchanged to Trigger 5's guard.
  let selectionMove = $state<{ seq: number; movedIds: string[] }>({ seq: 0, movedIds: [] });
  // Safe to call unconditionally on ANY settled move — single-item or bulk, drag or (since
  // moveAlbumToFolder is shared with the kebab's "Move to folder…") that too: an id that was
  // never part of the current selection reconciles to a no-op on the list's side, so there is no
  // "was this actually a multi-select drag" gate this function needs to get right.
  function markSelectionMoved(movedIds: string[]) {
    selectionMove = { seq: selectionMove.seq + 1, movedIds };
  }

  const currentMember = $derived(members.find((m) => m.userId === authManager.user.id));
  const isEditor = $derived(
    currentMember?.role === SharedSpaceRole.Owner || currentMember?.role === SharedSpaceRole.Editor,
  );

  const linkedAlbumIds = $derived(albums.map((a) => a.id));

  const isSearching = $derived(searchQuery.trim().length > 0);

  const requestedFolderId = $derived(page.url.searchParams.get('folder'));

  // A folder another editor deleted must degrade to the root rather than break the page.
  const currentFolderId = $derived(
    requestedFolderId && folders.some((f) => f.id === requestedFolderId) ? requestedFolderId : null,
  );

  const folderPath = $derived(getFolderPath(folders, currentFolderId));

  // "Unavailable" must mean we have no usable folder data to scope by — not merely that the
  // MOST RECENT fetch failed. A prior success leaves `folders` non-empty and deliberately
  // untouched on a later failure (see reload() below), and that stale-but-usable tree is exactly
  // what currentFolderId/folderPath/the breadcrumb are still derived from; flattening the album
  // list in that case would show every album in the space while the breadcrumb still claims
  // you're inside a specific folder. Only degrade to the flat list when there's genuinely nothing
  // to scope by (never loaded, or loaded to confirmed-empty and now also failing).
  const foldersUnavailable = $derived(foldersLoadFailed && folders.length === 0);

  $effect(() => {
    // Strip a stale ?folder= so a refresh or a share of this URL does not keep resolving to a
    // folder that no longer exists — including a space that has been emptied down to zero
    // folders entirely. replaceState: the fallback is not a history entry. Gated on
    // foldersLoaded (not folders.length > 0) so we do not strip the param before the initial
    // folder fetch resolves, but still do strip it once we've confirmed there is nothing there.
    if (requestedFolderId && foldersLoaded && currentFolderId === null) {
      void goto(Route.viewSpaceAlbums({ id: space.id }), { replaceState: true });
    }
  });

  async function reload() {
    // Independent fetches: a folders failure must not also block the (usually far more
    // important) albums refresh the way an atomic Promise.all would. See handleError below for
    // what each half does when it fails.
    const [albumsResult, foldersResult] = await Promise.allSettled([
      getSharedSpaceAlbums({ id: space.id }),
      getSharedSpaceAlbumFolders({ id: space.id }),
    ]);

    // Both halves share one error message, so if both fail, show it once rather than stacking two
    // identical toasts.
    let notifiedLoadError = false;

    if (albumsResult.status === 'fulfilled') {
      albums = albumsResult.value;
    } else {
      handleError(albumsResult.reason, $t('spaces_linked_albums_error_load'));
      notifiedLoadError = true;
    }

    if (foldersResult.status === 'fulfilled') {
      folders = foldersResult.value;
      foldersLoaded = true;
      foldersLoadFailed = false;
    } else {
      // Deliberately leave `folders` (and foldersLoaded) as they were: a transient refetch
      // failure after a prior success should keep showing the last-known-good folder tree rather
      // than wiping it — `foldersUnavailable` above only forces the flat-list fallback when
      // `folders` is also empty, so a non-empty stale tree keeps scoping normally.
      foldersLoadFailed = true;
      handleError(foldersResult.reason, $t('spaces_linked_albums_error_load'), { notify: !notifiedLoadError });
    }
  }

  // linkedAlbums comes from the space layout's cached load, which isn't invalidated when an album is
  // edited on its detail page (rename, added photos, or abandoned-empty cleanup). Re-fetch on mount so
  // returning to the list always shows current names and counts.
  onMount(() => {
    void reload();
  });

  // A real (pushState) navigation, not a replace — drilling into a folder must be undoable with
  // the browser back button.
  const navigateToFolder = (folderId: string | null) => goto(Route.viewSpaceAlbums({ id: space.id, folderId }));

  // Fired by SpaceAlbumsList when the user opens an album with no selection active (design §5.1).
  // Selection state — and the clearing triggers that watch currentFolderId/searchQuery — live
  // inside SpaceAlbumsList itself (its own props), not here; see that component for why.
  const openAlbum = (album: SharedSpaceLinkedAlbumDto) =>
    goto(Route.viewSpaceAlbum({ spaceId: space.id, albumId: album.id }));

  async function handleUnlink(album: SharedSpaceLinkedAlbumDto) {
    const confirmed = await modalManager.showDialog({
      prompt: $t('spaces_linked_albums_unlink_confirmation', { values: { name: album.albumName } }),
      title: $t('spaces_linked_albums_unlink'),
    });
    if (!confirmed) {
      return;
    }
    try {
      await unlinkAlbum({ id: space.id, albumId: album.id });
      eventManager.emit('SpaceUnlinkAlbum', { spaceId: space.id });
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
        albumId: album.id,
        sharedSpaceAlbumLinkUpdateDto: { showInTimeline: !album.showInTimeline },
      });
      albums = albums.map((a) => (a.id === album.id ? { ...a, showInTimeline: !album.showInTimeline } : a));
      // Keep the layout's cached linkedAlbums in sync so the timeline tab + a re-mount reflect it.
      await invalidateAll();
    } catch (error) {
      handleError(error, $t('spaces_linked_albums_error_update'));
    }
  }

  async function handleCreateAlbum() {
    const newAlbum = await createAlbum();
    if (!newAlbum) {
      return; // create failed; createAlbum already showed a toast
    }
    try {
      // `?? undefined` is load-bearing, not cosmetic: linkAlbum's folderId query param is
      // `.optional()` and NOT nullable, so root must be OMITTED, not sent as null. Worse than a
      // 400 — oazapfts' `explode` helper filters only `undefined` out of the params object, and
      // `typeof null === 'object'`, so a literal `null` here makes it recurse into
      // `Object.entries(null)` and throw a TypeError, hard-breaking album creation at the space
      // root. Dropping this `??` isn't caught by unit tests because the SDK is module-mocked.
      await linkAlbum({ id: space.id, albumId: newAlbum.id, folderId: currentFolderId ?? undefined });
      eventManager.emit('SpaceLinkAlbum', { spaceId: space.id });
      await invalidateAll();
      await goto(Route.viewSpaceAlbum({ spaceId: space.id, albumId: newAlbum.id }));
    } catch (error) {
      handleError(error, $t('spaces_linked_albums_error_link'));
      await reload();
      await invalidateAll();
    }
  }

  async function openLinkAlbumModal() {
    // `?? undefined` is load-bearing here too — see the comment on the linkAlbum call in
    // handleCreateAlbum above: linkAlbum's folderId is optional-but-not-nullable, and a literal
    // null makes oazapfts' `explode` throw (Object.entries(null)) instead of 400ing, breaking
    // linking at the space root. Not caught by unit tests since the SDK is module-mocked.
    const linkedCount = await modalManager.show(SpaceLinkAlbumModal, {
      spaceId: space.id,
      linkedAlbumIds,
      folderId: currentFolderId ?? undefined,
    });
    // The modal returns how many albums it linked; only refresh when something changed.
    if (linkedCount) {
      eventManager.emit('SpaceLinkAlbum', { spaceId: space.id });
      await reload();
      // Refresh the [spaceId] layout's cached linkedAlbums so other tabs (and a re-mount of this
      // page on tab navigation) reflect the change without a full page refresh.
      await invalidateAll();
    }
  }

  // showDialog resolves to a boolean, so it cannot collect a name — this uses the dedicated
  // single-field modal from Task 9.
  async function handleCreateFolder() {
    const name = await modalManager.show(SpaceAlbumFolderNameModal, {
      title: $t('space_album_folder_new'),
    });
    if (!name) {
      return;
    }
    try {
      await createSharedSpaceAlbumFolder({
        id: space.id,
        sharedSpaceAlbumFolderCreateDto: { name, parentId: currentFolderId },
      });
      await reload();
    } catch (error) {
      handleError(error, $t('space_album_folder_error_create'));
    }
  }

  async function handleRenameFolder(folder: SharedSpaceAlbumFolderDto) {
    const name = await modalManager.show(SpaceAlbumFolderNameModal, {
      title: $t('space_album_folder_rename'),
      initialName: folder.name,
    });
    if (!name || name === folder.name) {
      return;
    }
    try {
      await updateSharedSpaceAlbumFolder({
        id: space.id,
        folderId: folder.id,
        sharedSpaceAlbumFolderUpdateDto: { name },
      });
      await reload();
    } catch (error) {
      handleError(error, $t('space_album_folder_error_rename'));
    }
  }

  // Rename is canManage (space Editor) OR ownership — see space-albums-list.svelte's
  // canRename={canManage || isOwner(album)}. Reuses SpaceAlbumFolderNameModal (Task 6's icon/label
  // generalisation) rather than a second near-identical modal.
  async function handleRenameAlbum(album: SharedSpaceLinkedAlbumDto) {
    const name = await modalManager.show(SpaceAlbumFolderNameModal, {
      title: $t('space_album_rename'),
      initialName: album.albumName,
      icon: mdiRenameOutline,
      label: $t('space_album_name_label'),
    });
    if (!name) {
      return;
    }
    try {
      // NOT handleUpdateAlbum ($lib/services/album.service.ts) — that issues PATCH /albums/{id},
      // which 403s for a space editor who does not own the album. This route carries the editor
      // arm renameSharedSpaceAlbum was added for.
      await renameSharedSpaceAlbum({ id: space.id, albumId: album.id, sharedSpaceAlbumRenameDto: { name } });
      await reload();
      // albumName is a field on the layout's cached linkedAlbums (same staleness concern as
      // handleToggleTimeline/handleUnlink above) — without this, a re-mount via tab navigation
      // would keep showing the pre-rename name until an unrelated full page refresh.
      await invalidateAll();
    } catch (error) {
      handleError(error, $t('space_album_error_rename'));
    }
  }

  async function moveFolder(folderId: string, parentId: string | null) {
    try {
      await updateSharedSpaceAlbumFolder({
        id: space.id,
        folderId,
        sharedSpaceAlbumFolderUpdateDto: { parentId },
      });
      // Fix round 3: the last remaining "moved out of view but still present in the data" gap —
      // moveFolder is the kebab-only counterpart to moveAlbumToFolder, and unlike that function
      // (bumped in round 2), this one was never wired up. The kebab is always in the DOM (only
      // opacity-gated by group-hover), so hovering a card while a selection is live reaches it: a
      // multi-folder selection with one moved via the kebab left the bar counting an invisible
      // folder and offering "Delete folder" against it. Marked BEFORE reload() for the same
      // bump-before-awaits reason as every other move path.
      markSelectionMoved([folderId]);
      await reload();
    } catch (error) {
      handleError(error, $t('space_album_folder_error_move'));
    }
  }

  async function handleMoveFolder(folder: SharedSpaceAlbumFolderDto) {
    const result = await modalManager.show(SpaceAlbumFolderPickerModal, {
      folders,
      excludeFolderIds: [folder.id],
      currentFolderId: folder.parentId,
    });
    if (!result) {
      return;
    }
    await moveFolder(folder.id, result.folderId);
  }

  async function handleDeleteFolder(folder: SharedSpaceAlbumFolderDto) {
    const confirmed = await modalManager.showDialog({
      title: $t('space_album_folder_delete'),
      prompt: $t('space_album_folder_delete_confirm', { values: { name: folder.name } }),
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteSharedSpaceAlbumFolder({ id: space.id, folderId: folder.id });
      // If we were standing inside it, the fallback effect above returns us to the root.
      await reload();
      // Deleting a folder promotes its albums one level up, changing their folderId — so the
      // layout's cached linkedAlbums are now stale for the same reason as an explicit move.
      await invalidateAll();
    } catch (error) {
      handleError(error, $t('space_album_folder_error_delete'));
    }
  }

  // Shared by both entry points that move an album — a drag-and-drop and the card kebab's
  // "Move to folder…" — so both get the same optimistic-apply-then-rollback behaviour.
  async function moveAlbumToFolder(albumId: string, targetFolderId: string | null) {
    const previous = albums;
    albums = albums.map((a) => (a.id === albumId ? { ...a, folderId: targetFolderId } : a));
    try {
      await setSharedSpaceAlbumFolder({
        id: space.id,
        albumId,
        sharedSpaceAlbumFolderMoveAlbumDto: { folderId: targetFolderId },
      });
      // Marked BEFORE reload()/invalidateAll() (fix round 2, cheap item): if either of those two
      // rejects even though the move itself already succeeded, the bump must not be skipped —
      // the album really did move.
      markSelectionMoved([albumId]);
      await reload();
      // reload() only refreshes THIS page's state. The [spaceId] layout separately caches
      // linkedAlbums, and each of those rows carries the folderId that the album detail page's
      // back button navigates to — so without this, opening a just-moved album and pressing
      // back returns to the folder it used to live in.
      await invalidateAll();
    } catch (error) {
      albums = previous; // rollback
      handleError(error, $t('space_album_folder_error_move'));
      // Reload regardless: a "folder not found" failure means someone else deleted the target,
      // and the stale folder must disappear from the grid (W-19).
      await reload();
    }
  }

  async function handleMoveAlbum(album: SharedSpaceLinkedAlbumDto) {
    const result = await modalManager.show(SpaceAlbumFolderPickerModal, {
      folders,
      excludeFolderIds: [],
      currentFolderId: album.folderId ?? null,
    });
    if (!result) {
      return;
    }
    await moveAlbumToFolder(album.id, result.folderId);
  }

  // A single warning toast for however many items a bulk call failed on (S-24/S-25) — the key's
  // own plural form covers both a partial and a total failure, so one call site is enough.
  function notifyBulkFailures(failedCount: number) {
    if (failedCount > 0) {
      toastManager.warning($t('space_album_bulk_partial_failure', { values: { count: failedCount } }));
    }
  }

  // Every onBulk* handler below returns "the ids that should remain selected" (see
  // SpaceAlbumsList's own prop doc): the untouched input `ids` when the user cancels the confirm
  // dialog (nothing happened, so nothing should be deselected), otherwise the bulk action's own
  // `failedIds` — empty on total success, everything on a request that never reached the server
  // (bulkXAction's own catch already marks every id failed for that case; see
  // space-album-bulk-actions.ts), exactly the failures on a partial one.
  async function handleBulkUnlink(ids: string[]): Promise<string[]> {
    const confirmed = await modalManager.showDialog({
      title: $t('space_album_bulk_unlink_title', { values: { count: ids.length } }),
      prompt: $t('space_album_bulk_unlink_confirm'),
    });
    if (!confirmed) {
      return ids;
    }
    const { failedIds, failedCount } = await bulkUnlinkAlbumsAction(space.id, ids);
    notifyBulkFailures(failedCount);
    if (failedCount < ids.length) {
      // Mirrors the single-unlink path: only fire once something actually changed.
      eventManager.emit('SpaceUnlinkAlbum', { spaceId: space.id });
    }
    await reload();
    // Refresh the [spaceId] layout's cached linkedAlbums, same reason as the single-unlink path.
    await invalidateAll();
    return failedIds;
  }

  async function handleBulkMoveAlbums(ids: string[]): Promise<string[]> {
    // No excludeFolderIds: unlike a single album (which can only ever be "not currently here"), a
    // batch has no one destination to forbid — the bulk endpoint validates per item anyway, so an
    // album already at the chosen destination is simply a no-op success, not a blocked choice.
    const result = await modalManager.show(SpaceAlbumFolderPickerModal, {
      folders,
      excludeFolderIds: [],
      currentFolderId: currentFolderId ?? null,
    });
    if (!result) {
      return ids;
    }
    const { failedIds, failedCount } = await bulkSetAlbumFolderAction(space.id, ids, result.folderId);
    notifyBulkFailures(failedCount);
    await reload();
    await invalidateAll();
    return failedIds;
  }

  async function handleBulkToggleAlbumsTimeline(ids: string[], showInTimeline: boolean): Promise<string[]> {
    const { failedIds, failedCount } = await bulkSetAlbumTimelineAction(space.id, ids, showInTimeline);
    notifyBulkFailures(failedCount);
    await reload();
    await invalidateAll();
    return failedIds;
  }

  async function handleBulkMoveFolders(ids: string[]): Promise<string[]> {
    // Fix round 1, Minor #2: every folder in the batch is excluded (plus each of their own
    // descendants), not just left unexcluded — the earlier "no exclusion, the server validates
    // anyway" reasoning was right for CROSS-batch legality (§6.3 still owns cycle/depth) but wrong
    // for the degenerate single-selection case: selecting one folder "Trips" and moving it used to
    // offer "Trips" itself as a destination, guaranteeing a 100% failure with no explanation —
    // exactly what the single-item kebab's picker (handleMoveFolder above) already prevented.
    const result = await modalManager.show(SpaceAlbumFolderPickerModal, {
      folders,
      excludeFolderIds: ids,
      currentFolderId: currentFolderId ?? null,
    });
    if (!result) {
      return ids;
    }
    const { failedIds, failedCount } = await bulkMoveAlbumFoldersAction(space.id, ids, result.folderId);
    notifyBulkFailures(failedCount);
    await reload();
    await invalidateAll();
    return failedIds;
  }

  async function handleBulkDeleteFolders(ids: string[]): Promise<string[]> {
    const confirmed = await modalManager.showDialog({
      title: $t('space_album_bulk_folder_delete_title', { values: { count: ids.length } }),
      prompt: $t('space_album_bulk_folder_delete_confirm'),
    });
    if (!confirmed) {
      return ids;
    }
    const { failedIds, failedCount } = await bulkDeleteAlbumFoldersAction(space.id, ids);
    notifyBulkFailures(failedCount);
    // If we were standing inside a deleted folder, the fallback effect above returns us to the
    // root. Deleting promotes children one level up, changing albums' folderId too — same
    // layout-cache staleness as the single-folder-delete path.
    await reload();
    await invalidateAll();
    return failedIds;
  }

  // Serves single delete too — the card kebab's onDeleteAlbum passes one id (handleDeleteAlbum
  // below) — so there is one code path and one failure contract, matching
  // bulkDeleteAlbumsAction's own "single delete reuses the bulk path" design. The copy branches on
  // length: the counted title/prompt (space_album_bulk_delete_title/_confirm) would read "Delete 1
  // albums" for a lone item — the singular strings (space_album_delete /
  // space_album_delete_confirm) exist specifically to avoid that.
  async function handleBulkDeleteAlbums(ids: string[], albumName?: string): Promise<string[]> {
    const single = ids.length === 1;
    const confirmed = await modalManager.showDialog({
      title: single ? $t('space_album_delete') : $t('space_album_bulk_delete_title', { values: { count: ids.length } }),
      prompt: single
        ? $t('space_album_delete_confirm', { values: { name: albumName ?? '' } })
        : $t('space_album_bulk_delete_confirm'),
      confirmText: $t('delete'),
      confirmColor: 'danger',
    });
    if (!confirmed) {
      // Nothing happened, so nothing should be deselected — same contract as every other bulk
      // handler above.
      return ids;
    }
    const { failedIds, failedCount } = await bulkDeleteAlbumsAction(space.id, ids);
    notifyBulkFailures(failedCount);
    await reload();
    // The [spaceId] layout separately caches linkedAlbums (used by the Timeline tab and a
    // re-mount on tab navigation) — same staleness concern as every other mutating handler above
    // (handleUnlink, handleBulkUnlink, handleBulkDeleteFolders): a deleted album must not keep
    // appearing there until an unrelated full page refresh.
    await invalidateAll();
    return failedIds;
  }

  // The card kebab's single-album Delete — routes through the same confirm/request/reconcile path
  // as the bulk case above, just with a one-element array.
  async function handleDeleteAlbum(album: SharedSpaceLinkedAlbumDto): Promise<void> {
    await handleBulkDeleteAlbums([album.id], album.albumName);
  }

  // Drag counterparts of handleBulkMoveAlbums/handleBulkMoveFolders above, for a multi-id drop
  // (S-22): no confirm (a drag is not destructive) and no folder-picker modal (the target is the
  // drop's own destination), otherwise the same bulk-action-plus-toast shape. `markSelectionMoved`
  // (I-1, fix round 2) is passed only the ids that actually SUCCEEDED — a failed id is still
  // linked/parented exactly where it was, still visible, and must stay selected, matching
  // S-24/S-25's contract for every other bulk action in this feature.
  async function bulkMoveAlbumsToFolder(ids: string[], targetFolderId: string | null) {
    const { failedIds, failedCount } = await bulkSetAlbumFolderAction(space.id, ids, targetFolderId);
    notifyBulkFailures(failedCount);
    // Marked BEFORE reload()/invalidateAll() (fix round 2, cheap item): a rejection there must
    // not skip the bump. Only the ids that actually SUCCEEDED count as "moved" — a failed id
    // stayed exactly where it was and must stay selected, not get reconciled away too.
    markSelectionMoved(ids.filter((id) => !failedIds.includes(id)));
    await reload();
    await invalidateAll();
  }

  async function bulkMoveFoldersToParent(ids: string[], targetParentId: string | null) {
    const { failedIds, failedCount } = await bulkMoveAlbumFoldersAction(space.id, ids, targetParentId);
    notifyBulkFailures(failedCount);
    markSelectionMoved(ids.filter((id) => !failedIds.includes(id)));
    // Matches the single-folder-move branch below: folder-to-folder reparenting does not touch
    // any album's folderId, so the layout's cached linkedAlbums stay valid — no invalidateAll.
    await reload();
  }

  // The client-side canDrop guard means a drop with NOTHING legal in it never fires a request at
  // all. `canDrop` itself only proves "at least one id in the batch can legally move" (§ canDrop's
  // own doc comment) — Minor #3 (fix round 1): dispatching the FULL payload after that check would
  // still send along any illegal members (e.g. dragging folders {A, B, C} onto A itself sends A
  // too), which the server correctly rejects but surfaces as a confusing "N could not be updated"
  // toast for something the user never asked to move. Filtering to exactly the ids `canDropOne`
  // itself accepts — the same predicate `canDrop`'s `.some()` is built from — means the dispatched
  // batch is always legal by construction, and a filtered-down batch of exactly one id falls
  // through to the existing single-item paths below rather than a needless one-item bulk call.
  async function handleDropItem(payload: DragPayload, targetFolderId: string | null) {
    if (!canDrop(folders, albums, payload, targetFolderId)) {
      return;
    }

    const legalIds = payload.ids.filter((id) => canDropOne(folders, albums, payload.kind, id, targetFolderId));

    if (payload.kind === 'album') {
      if (legalIds.length === 1) {
        await moveAlbumToFolder(legalIds[0], targetFolderId);
      } else {
        await bulkMoveAlbumsToFolder(legalIds, targetFolderId);
      }
      return;
    }

    if (legalIds.length > 1) {
      await bulkMoveFoldersToParent(legalIds, targetFolderId);
      return;
    }

    const folderId = legalIds[0];
    const previous = folders;
    folders = folders.map((f) => (f.id === folderId ? { ...f, parentId: targetFolderId } : f));
    try {
      await updateSharedSpaceAlbumFolder({
        id: space.id,
        folderId,
        sharedSpaceAlbumFolderUpdateDto: { parentId: targetFolderId },
      });
      // I-1 (fix round 2): this is the exact branch probe B reaches — a multi-id folder drag that
      // canDropOne filters down to one legal id (e.g. {Trips, Family} dropped onto Trips: Trips
      // filters itself out) lands HERE, not in the bulk branch above. Without this bump, that
      // filtered-down single-item move was the one path fix round 1 left uncovered.
      markSelectionMoved([folderId]);
      await reload();
    } catch (error) {
      folders = previous; // rollback
      handleError(error, $t('space_album_folder_error_move'));
      await reload();
    }
  }
</script>

<div class="flex h-full flex-col">
  {#if albums.length === 0 && folders.length === 0}
    <div class="flex min-h-[calc(66vh-11rem)] w-full place-content-center items-center dark:text-white">
      <div class="flex flex-col content-center items-center gap-4 text-center">
        <Icon icon={mdiImageMultipleOutline} size="3.5em" />
        <p class="text-lg text-gray-500 dark:text-gray-400" data-testid="empty-state-message">
          {$t('space_albums_empty')}
        </p>
        {#if isEditor}
          <!-- Same pair as the populated view's toolbar (space-albums-controls.svelte): creating a
               fresh album is the primary action, linking an existing one the secondary. -->
          <div class="flex flex-wrap items-center justify-center gap-2">
            <Button
              leadingIcon={mdiPlus}
              onclick={() => void handleCreateAlbum()}
              data-testid="empty-create-album-button"
            >
              {$t('create_album')}
            </Button>
            <Button
              variant="ghost"
              leadingIcon={mdiLinkVariantPlus}
              onclick={() => void openLinkAlbumModal()}
              data-testid="empty-link-album-button"
            >
              {$t('space_albums_empty_editor_cta')}
            </Button>
            <!-- Otherwise a brand-new space has no way to make a folder until an album exists to
                 put in one. -->
            <Button
              variant="ghost"
              leadingIcon={mdiFolderPlusOutline}
              onclick={() => void handleCreateFolder()}
              data-testid="empty-create-folder-button"
            >
              {$t('space_album_folder_new')}
            </Button>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    {#if folders.length > 0 && !isSearching}
      <!-- Search escapes the folder tree entirely (results are space-wide), so showing where we
           were would misrepresent where the results actually come from. -->
      <SpaceAlbumFolderBreadcrumb
        path={folderPath}
        {folders}
        {albums}
        canManage={isEditor}
        onNavigate={(id) => void navigateToFolder(id)}
        onDropItem={handleDropItem}
      />
    {/if}
    <SpaceAlbumsControls
      {groupIds}
      bind:searchQuery
      canManage={isEditor}
      onCreate={handleCreateAlbum}
      onLink={openLinkAlbumModal}
      onCreateFolder={handleCreateFolder}
    />
    <div class="px-4 pt-4">
      <SpaceAlbumsList
        spaceId={space.id}
        {albums}
        {folders}
        {foldersUnavailable}
        {currentFolderId}
        canManage={isEditor}
        {members}
        bind:groupIds
        {searchQuery}
        onUnlink={handleUnlink}
        onToggleTimeline={handleToggleTimeline}
        onMoveAlbum={handleMoveAlbum}
        onOpenAlbum={(album) => void openAlbum(album)}
        onOpenFolder={(f) => void navigateToFolder(f.id)}
        onRenameFolder={handleRenameFolder}
        onMoveFolder={handleMoveFolder}
        onDeleteFolder={handleDeleteFolder}
        onRenameAlbum={handleRenameAlbum}
        onDeleteAlbum={handleDeleteAlbum}
        onDropItem={handleDropItem}
        {selectionMove}
        onBulkUnlink={handleBulkUnlink}
        onBulkMoveAlbums={handleBulkMoveAlbums}
        onBulkToggleAlbumsTimeline={handleBulkToggleAlbumsTimeline}
        onBulkMoveFolders={handleBulkMoveFolders}
        onBulkDeleteFolders={handleBulkDeleteFolders}
        onBulkDeleteAlbums={handleBulkDeleteAlbums}
      />
    </div>
  {/if}
</div>
