import 'package:drift/drift.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';

class SpaceAlbumRepository extends DriftDatabaseRepository {
  final Drift _db;
  const SpaceAlbumRepository(this._db) : super(_db);

  // §4.4 sweep: drop metadata + its membership; remote_asset blobs untouched.
  Future<void> deleteAlbumMetadata(String albumId) async {
    await _db.transaction(() async {
      await (_db.delete(_db.sharedSpaceAlbumAssetEntity)..where((t) => t.albumId.equals(albumId))).go();
      await (_db.delete(_db.sharedSpaceAlbumEntity)..where((t) => t.id.equals(albumId))).go();
    });
  }

  Future<void> deleteLink({required String spaceId, required String albumId}) {
    return (_db.delete(_db.sharedSpaceAlbumLinkEntity)
          ..where((t) => t.spaceId.equals(spaceId) & t.albumId.equals(albumId)))
        .go();
  }
}
