import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/space_album.model.dart';
import 'package:immich_mobile/domain/models/space_album_folder.model.dart';
import 'package:immich_mobile/infrastructure/repositories/space_album.repository.dart';
import 'package:immich_mobile/providers/infrastructure/db.provider.dart';
import 'package:immich_mobile/providers/user.provider.dart';

final spaceAlbumRepositoryProvider = Provider<SpaceAlbumRepository>(
  (ref) => SpaceAlbumRepository(ref.watch(driftProvider)),
);

/// Watches all albums linked to the given [spaceId].
///
/// Emits a reactive [List<SpaceAlbum>] ordered by album name. Each
/// [SpaceAlbum] carries the joined metadata (name, thumbnailAssetId) and the
/// per-space link fields (showInTimeline).
final spaceAlbumsProvider = StreamProvider.family<List<SpaceAlbum>, String>((ref, spaceId) {
  // Watched, not read: a login/logout must re-resolve ownership rather than strand a stale id.
  final currentUserId = ref.watch(currentUserProvider.select((u) => u?.id));
  return ref.watch(spaceAlbumRepositoryProvider).watchLinkedAlbums(spaceId, currentUserId: currentUserId);
});

/// Watches all album folders of the given [spaceId].
///
/// Emits a reactive [List<SpaceAlbumFolder>], flat (not yet nested into a
/// tree — see `lib/utils/space_album_folders.dart` for that). Mirrors
/// [spaceAlbumsProvider]'s shape so [SpaceAlbumsPage] can watch both with the
/// same pattern.
final spaceAlbumFoldersProvider = StreamProvider.family<List<SpaceAlbumFolder>, String>(
  (ref, spaceId) => ref.watch(spaceAlbumRepositoryProvider).watchFolders(spaceId),
);
