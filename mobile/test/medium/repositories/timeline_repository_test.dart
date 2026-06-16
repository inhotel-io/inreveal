import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/infrastructure/repositories/timeline.repository.dart';
import 'package:intl/date_symbol_data_local.dart';

import '../repository_context.dart';

void main() {
  late MediumRepositoryContext ctx;
  late DriftTimelineRepository sut;

  setUpAll(() async {
    await initializeDateFormatting();
  });

  setUp(() {
    ctx = MediumRepositoryContext();
    sut = DriftTimelineRepository(ctx.db);
  });

  tearDown(() async {
    await ctx.dispose();
  });

  group('remoteAlbum assets', () {
    test('no duplicate assets when identical checksum appears in multiple local asset rows', () async {
      // Regression check for #23273: a LEFT OUTER JOIN on checksum would fan out and create duplicates
      // happens when same photo exists in multiple albums on device
      final user = await ctx.newUser();
      final checksum = 'yolo';
      final album = await ctx.newRemoteAlbum(ownerId: user.id);
      final remoteAsset = await ctx.newRemoteAsset(ownerId: user.id, checksum: checksum);
      await ctx.newRemoteAlbumAsset(albumId: album.id, assetId: remoteAsset.id);

      final localAsset1 = await ctx.newLocalAsset(checksum: checksum);
      final localAsset2 = await ctx.newLocalAsset(checksum: checksum);

      final query = sut.remoteAlbum(album.id, .day);

      final buckets = await query.bucketSource().first;
      expect(buckets, hasLength(1));
      expect(buckets.single.assetCount, 1);

      final assets = await query.assetSource(0, 10);
      expect(assets, hasLength(1));
      expect((assets.first as RemoteAsset).id, remoteAsset.id);
      expect([localAsset1.id, localAsset2.id], contains((assets.first as RemoteAsset).localId));
    });
  });

  group('person assets', () {
    test('does not duplicate an asset that has multiple face records for the same person', () async {
      // Regression check for #26723: an INNER JOIN between remote_asset_entity and asset_face_entity
      // fanned out one asset into N rows when N face records pointed at the same (asset, person) pair
      final user = await ctx.newUser();
      final asset = await ctx.newRemoteAsset(ownerId: user.id);

      final person = await ctx.newPerson(ownerId: user.id);
      await ctx.newFace(assetId: asset.id, personId: person.id);
      await ctx.newFace(assetId: asset.id, personId: person.id);

      final query = sut.person(user.id, person.id, .day);

      final buckets = await query.bucketSource().first;
      expect(buckets, hasLength(1));
      expect(buckets.single.assetCount, 1);

      final assets = await query.assetSource(0, 10);
      expect(assets, hasLength(1));
      expect((assets.first as RemoteAsset).id, asset.id);
    });
  });

  group('sharedSpace album branch', () {
    test('includes an album asset when its link showInTimeline = true', () async {
      final user = await ctx.newUser();
      final space = await ctx.newSharedSpace(createdById: user.id);
      final album = await ctx.newSharedSpaceAlbum();
      final asset = await ctx.newRemoteAsset(ownerId: user.id);
      await ctx.insertSharedSpaceAlbumLink(spaceId: space.id, albumId: album.id, showInTimeline: true);
      await ctx.insertSharedSpaceAlbumAsset(albumId: album.id, assetId: asset.id);

      final assets = await sut.sharedSpace(space.id, .none).assetSource(0, 100);
      final ids = assets.map((a) => (a as RemoteAsset).id);
      expect(ids, contains(asset.id));
    });

    test('excludes an album asset when its link showInTimeline = false', () async {
      final user = await ctx.newUser();
      final space = await ctx.newSharedSpace(createdById: user.id);
      final album = await ctx.newSharedSpaceAlbum();
      final asset = await ctx.newRemoteAsset(ownerId: user.id);
      await ctx.insertSharedSpaceAlbumLink(spaceId: space.id, albumId: album.id, showInTimeline: false);
      await ctx.insertSharedSpaceAlbumAsset(albumId: album.id, assetId: asset.id);

      final assets = await sut.sharedSpace(space.id, .none).assetSource(0, 100);
      final ids = assets.map((a) => (a as RemoteAsset).id);
      expect(ids, isNot(contains(asset.id)));
    });

    test('counts an asset once when it is both album-linked and direct-added', () async {
      final user = await ctx.newUser();
      final space = await ctx.newSharedSpace(createdById: user.id);
      final album = await ctx.newSharedSpaceAlbum();
      final asset = await ctx.newRemoteAsset(ownerId: user.id);
      await ctx.insertSharedSpaceAlbumLink(spaceId: space.id, albumId: album.id, showInTimeline: true);
      await ctx.insertSharedSpaceAlbumAsset(albumId: album.id, assetId: asset.id);
      await ctx.insertSharedSpaceAsset(spaceId: space.id, assetId: asset.id);

      final assets = await sut.sharedSpace(space.id, .none).assetSource(0, 100);
      final matching = assets.where((a) => (a as RemoteAsset).id == asset.id);
      expect(matching, hasLength(1));
    });

    test('an album in two spaces shows its asset in each space timeline', () async {
      final user = await ctx.newUser();
      final s1 = await ctx.newSharedSpace(createdById: user.id);
      final s2 = await ctx.newSharedSpace(createdById: user.id);
      final album = await ctx.newSharedSpaceAlbum();
      final asset = await ctx.newRemoteAsset(ownerId: user.id);
      await ctx.insertSharedSpaceAlbumLink(spaceId: s1.id, albumId: album.id, showInTimeline: true);
      await ctx.insertSharedSpaceAlbumLink(spaceId: s2.id, albumId: album.id, showInTimeline: true);
      await ctx.insertSharedSpaceAlbumAsset(albumId: album.id, assetId: asset.id);

      final a1 = await sut.sharedSpace(s1.id, .none).assetSource(0, 100);
      final a2 = await sut.sharedSpace(s2.id, .none).assetSource(0, 100);
      expect(a1.map((a) => (a as RemoteAsset).id), contains(asset.id));
      expect(a2.map((a) => (a as RemoteAsset).id), contains(asset.id));
    });
  });
}
