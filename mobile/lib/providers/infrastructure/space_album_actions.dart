import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/utils/background_sync.dart';
import 'package:immich_mobile/providers/background_sync.provider.dart';
import 'package:immich_mobile/providers/infrastructure/album.provider.dart';
import 'package:immich_mobile/repositories/drift_album_api_repository.dart';
import 'package:immich_mobile/repositories/shared_space_api.repository.dart';
import 'package:openapi/api.dart' show BulkIdResponseDto;

/// Centralises the space-album mutation operations:
///   - [link]             — PUT  /shared-spaces/{id}/albums/{albumId} (one or more)
///   - [unlink]           — DELETE /shared-spaces/{id}/albums/{albumId}
///   - [toggleTimeline]   — PATCH  /shared-spaces/{id}/albums/{albumId}
///   - [addAssets]        — PUT  /albums/{albumId}/assets (server-only)
///   - [createFolder]     — POST   /shared-spaces/{id}/album-folders
///   - [renameFolder]     — PATCH  /shared-spaces/{id}/album-folders/{folderId}
///   - [moveFolder]       — PATCH  /shared-spaces/{id}/album-folders/{folderId}
///   - [deleteFolder]     — DELETE /shared-spaces/{id}/album-folders/{folderId}
///   - [moveAlbumToFolder] — PUT   /shared-spaces/{id}/albums/{albumId}/folder
///   - [renameAlbum]       — PUT   /shared-spaces/{id}/albums/{albumId}/name
///   - [bulkDeleteAlbums]  — POST  /shared-spaces/{id}/albums/bulk-delete
///
/// Each operation calls the API repo, fires the sync-nudge
/// (`BackgroundSyncManager.syncRemote()`), then returns.
/// On API failure the exception propagates to the caller (the page is
/// responsible for showing the error toast and catching the exception).
///
/// The nudge is NOT fired when the API call throws — failure on the first
/// album in a batch aborts the whole operation (fail-fast). The caller shows
/// an error toast; the sync will catch up on the next regular cycle.
class SpaceAlbumActions {
  SpaceAlbumActions({
    required this._repo,
    required this._albumApiRepo,
    required this._syncManager,
    required this._onOwnedAlbumsChanged,
  });

  final SharedSpaceApiRepository _repo;
  final DriftAlbumApiRepository _albumApiRepo;
  final BackgroundSyncManager _syncManager;

  /// Invoked after a mutation that MAY have changed the user's own albums, so the caller can
  /// refresh RemoteAlbumNotifier — it holds a snapshot, not a Drift watch, so the sync nudge alone
  /// leaves the Albums tab and every picker showing stale rows.
  ///
  /// m-3: [bulkDeleteAlbums] really is owner-only (the server refuses to delete an album you do
  /// not own), but [renameAlbum] is NOT — a space Editor may rename someone else's album, and this
  /// still fires for them even though they hold no `remote_album` row that could have gone stale.
  /// Deliberately left unconditional rather than threading ownership down into this
  /// repository-only class: the refresh is a cheap local re-read, and skipping it wrongly would
  /// silently strand the Albums tab on the old name.
  final Future<void> Function() _onOwnedAlbumsChanged;

  /// Link one or more albums to a space.
  ///
  /// Calls PUT for each albumId sequentially. On success fires one sync-nudge.
  /// If [albumIds] is empty, does nothing (no API call, no nudge).
  ///
  /// [folderId] is the space album folder to link into; null means the space root. Callers
  /// linking from inside a folder must pass it, or the album lands at the root instead of
  /// where the user is looking.
  Future<void> link(String spaceId, List<String> albumIds, {String? folderId}) async {
    if (albumIds.isEmpty) return;
    for (final albumId in albumIds) {
      await _repo.linkAlbum(spaceId, albumId, folderId: folderId);
    }
    await _syncManager.syncRemote();
  }

  /// Unlink a single album from a space.
  Future<void> unlink(String spaceId, String albumId) async {
    await _repo.unlinkAlbum(spaceId, albumId);
    await _syncManager.syncRemote();
  }

  /// Toggle the `showInTimeline` flag for a space-album link.
  ///
  /// Pass [current] as the album's current `showInTimeline` value; the method
  /// sends the inverse.
  Future<void> toggleTimeline(String spaceId, String albumId, {required bool current}) async {
    await _repo.updateAlbumLink(spaceId, albumId, showInTimeline: !current);
    await _syncManager.syncRemote();
  }

  /// Add assets to a linked album via the **server-only** REST path.
  ///
  /// A linked album may be "absorbed" — present only in `shared_space_album`
  /// with no local `remote_album` row — so the personal-album add path (which
  /// also writes the local `remote_album_asset` junction) would hit a foreign
  /// key violation. This routes through [DriftAlbumApiRepository.addAssets]
  /// (the REST add only) and then nudges sync; the server is the source of
  /// truth and `spaceAlbum()`'s Drift watch surfaces the new assets.
  ///
  /// Returns the number of assets the server actually added. If [assetIds] is
  /// empty, does nothing (no API call, no nudge). On API failure the exception
  /// propagates and the nudge is skipped (fail-fast).
  Future<int> addAssets(String albumId, List<String> assetIds) async {
    if (assetIds.isEmpty) return 0;
    final result = await _albumApiRepo.addAssets(albumId, assetIds);
    await _syncManager.syncRemote();
    return result.added.length;
  }

  /// Create a folder in [spaceId], optionally nested under [parentId].
  Future<void> createFolder(String spaceId, String name, {String? parentId}) async {
    await _repo.createAlbumFolder(spaceId, name, parentId: parentId);
    await _syncManager.syncRemote();
  }

  /// Rename a folder.
  Future<void> renameFolder(String spaceId, String folderId, String name) async {
    await _repo.renameAlbumFolder(spaceId, folderId, name);
    await _syncManager.syncRemote();
  }

  /// Move a folder under [parentId], or to the space root when [parentId] is null.
  Future<void> moveFolder(String spaceId, String folderId, String? parentId) async {
    await _repo.moveAlbumFolder(spaceId, folderId, parentId);
    await _syncManager.syncRemote();
  }

  /// Delete a folder. Direct children are promoted one level up server-side.
  Future<void> deleteFolder(String spaceId, String folderId) async {
    await _repo.deleteAlbumFolder(spaceId, folderId);
    await _syncManager.syncRemote();
  }

  /// Move a linked album into [folderId], or to the space root when [folderId] is null.
  Future<void> moveAlbumToFolder(String spaceId, String albumId, String? folderId) async {
    await _repo.setAlbumFolder(spaceId, albumId, folderId);
    await _syncManager.syncRemote();
  }

  // ---------------------------------------------------------------------
  // Task 15 (multi-select bulk actions).
  //
  // Every `bulkX` method below returns the SUBSET of the requested ids that
  // failed — empty on total success. Unlike the single-item methods above,
  // a bulk request can partially fail (the server responds 200 with
  // per-item results even when every item fails), so there is no single
  // exception to propagate. Mirrors the web `runBulkAction`
  // (space-album-bulk-actions.ts): a thrown request (never reached the
  // server — offline, 500, timeout) is folded into "every id failed" HERE,
  // rather than propagating, so the caller (the page) can compose the
  // result directly with `SpaceAlbumSelectionNotifier.reconcile` regardless
  // of which of the three ways the batch failed — total success reconciles
  // to nothing selected, a partial failure keeps only the failures, and a
  // total failure or a throw keeps everything (identical from the caller's
  // perspective: reconcile(failedIds) where failedIds == the ids sent).
  //
  // The sync nudge fires whenever the request actually reached the server
  // (even a 200 with every item failed) but is skipped on a throw, matching
  // the single-item methods' own fail-fast convention above.
  // ---------------------------------------------------------------------

  /// Folds a bulk response into the subset of [ids] that failed — the complement of
  /// "succeeded". An id missing from [results] entirely (e.g. an empty response array) counts as
  /// failed too. Never branches on the SPECIFIC `error` reason (the deliberate albums/folders
  /// error asymmetry — `not_found` vs `validation`): only `success` is read, so every failure
  /// reason is treated identically here.
  Set<String> _bulkFailures(Set<String> ids, List<BulkIdResponseDto> results) {
    final succeeded = results.where((result) => result.success).map((result) => result.id).toSet();
    return ids.where((id) => !succeeded.contains(id)).toSet();
  }

  /// Bulk-unlink [albumIds] from [spaceId]. Returns the subset that failed.
  Future<Set<String>> bulkUnlink(String spaceId, Set<String> albumIds) async {
    try {
      final results = await _repo.bulkUnlinkAlbums(spaceId, albumIds);
      await _syncManager.syncRemote();
      return _bulkFailures(albumIds, results);
    } catch (_) {
      return albumIds;
    }
  }

  /// Bulk-move [albumIds] into [folderId], or to the space root when null. Returns the subset
  /// that failed.
  Future<Set<String>> bulkSetAlbumFolder(String spaceId, Set<String> albumIds, {String? folderId}) async {
    try {
      final results = await _repo.bulkSetAlbumFolder(spaceId, albumIds, folderId: folderId);
      await _syncManager.syncRemote();
      return _bulkFailures(albumIds, results);
    } catch (_) {
      return albumIds;
    }
  }

  /// Bulk-toggle the `showInTimeline` flag for [albumIds]. Returns the subset that failed.
  Future<Set<String>> bulkSetAlbumTimeline(String spaceId, Set<String> albumIds, {required bool showInTimeline}) async {
    try {
      final results = await _repo.bulkSetAlbumTimeline(spaceId, albumIds, showInTimeline: showInTimeline);
      await _syncManager.syncRemote();
      return _bulkFailures(albumIds, results);
    } catch (_) {
      return albumIds;
    }
  }

  /// Bulk-move [folderIds] under [parentId], or to the space root when null. Returns the subset
  /// that failed.
  Future<Set<String>> bulkMoveFolders(String spaceId, Set<String> folderIds, {String? parentId}) async {
    try {
      final results = await _repo.bulkMoveAlbumFolders(spaceId, folderIds, parentId: parentId);
      await _syncManager.syncRemote();
      return _bulkFailures(folderIds, results);
    } catch (_) {
      return folderIds;
    }
  }

  /// Bulk-delete [folderIds]. Direct children of each are promoted one level up; albums are
  /// never unlinked. Returns the subset that failed.
  Future<Set<String>> bulkDeleteFolders(String spaceId, Set<String> folderIds) async {
    try {
      final results = await _repo.bulkDeleteAlbumFolders(spaceId, folderIds);
      await _syncManager.syncRemote();
      return _bulkFailures(folderIds, results);
    } catch (_) {
      return folderIds;
    }
  }

  /// Rename a space-linked album. Throws on failure, like the other single-item methods.
  ///
  /// Fires [_onOwnedAlbumsChanged] unconditionally, including for a space Editor renaming an album
  /// they do not own — see that field's own note (m-3).
  Future<void> renameAlbum(String spaceId, String albumId, String name) async {
    await _repo.renameAlbum(spaceId, albumId, name);
    await _syncManager.syncRemote();
    await _onOwnedAlbumsChanged();
  }

  /// Bulk-delete [albumIds]. Returns the subset that failed. Same three-way failure contract as
  /// the other bulk methods: a throw folds into "every id failed" here rather than propagating.
  Future<Set<String>> bulkDeleteAlbums(String spaceId, Set<String> albumIds) async {
    try {
      final results = await _repo.bulkDeleteAlbums(spaceId, albumIds);
      await _syncManager.syncRemote();
      final failed = _bulkFailures(albumIds, results);
      if (failed.length < albumIds.length) {
        await _onOwnedAlbumsChanged();
      }
      return failed;
    } catch (_) {
      return albumIds;
    }
  }
}

/// Provider for [SpaceAlbumActions].
///
/// Override [sharedSpaceApiRepositoryProvider] and [backgroundSyncProvider] in
/// tests to inject mocks.
final spaceAlbumActionsProvider = Provider<SpaceAlbumActions>((ref) {
  return SpaceAlbumActions(
    repo: ref.watch(sharedSpaceApiRepositoryProvider),
    albumApiRepo: ref.watch(driftAlbumApiRepositoryProvider),
    syncManager: ref.watch(backgroundSyncProvider),
    onOwnedAlbumsChanged: () => ref.read(remoteAlbumProvider.notifier).refresh(),
  );
});
