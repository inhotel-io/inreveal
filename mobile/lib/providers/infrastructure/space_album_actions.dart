import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/utils/background_sync.dart';
import 'package:immich_mobile/providers/background_sync.provider.dart';
import 'package:immich_mobile/repositories/shared_space_api.repository.dart';

/// Centralises the three space-album mutation operations:
///   - [link]           — PUT  /shared-spaces/{id}/albums/{albumId} (one or more)
///   - [unlink]         — DELETE /shared-spaces/{id}/albums/{albumId}
///   - [toggleTimeline] — PATCH  /shared-spaces/{id}/albums/{albumId}
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
  SpaceAlbumActions({required this._repo, required this._syncManager});

  final SharedSpaceApiRepository _repo;
  final BackgroundSyncManager _syncManager;

  /// Link one or more albums to a space.
  ///
  /// Calls PUT for each albumId sequentially. On success fires one sync-nudge.
  /// If [albumIds] is empty, does nothing (no API call, no nudge).
  Future<void> link(String spaceId, List<String> albumIds) async {
    if (albumIds.isEmpty) return;
    for (final albumId in albumIds) {
      await _repo.linkAlbum(spaceId, albumId);
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
}

/// Provider for [SpaceAlbumActions].
///
/// Override [sharedSpaceApiRepositoryProvider] and [backgroundSyncProvider] in
/// tests to inject mocks.
final spaceAlbumActionsProvider = Provider<SpaceAlbumActions>((ref) {
  return SpaceAlbumActions(
    repo: ref.watch(sharedSpaceApiRepositoryProvider),
    syncManager: ref.watch(backgroundSyncProvider),
  );
});
