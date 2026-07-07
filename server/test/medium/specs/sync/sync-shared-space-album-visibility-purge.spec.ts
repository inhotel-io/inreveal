// Slice 1 (#753 follow-up #1): purge already-synced ALBUM-linked space assets
// from member devices when the owner flips an asset OUT of the space-shareable
// set (Timeline/Archive) to Hidden, and re-add it on restore. Locked is already
// covered by asset.service.updateAll -> albumRepository.removeAssetsFromAll,
// which deletes the album_asset row and fires the shared album_asset_audit.
// This slice closes only the Hidden gap, via a space-only audit table
// (shared_space_album_asset_audit) unioned into SharedSpaceAlbumToAssetSync.
import { Kysely } from 'kysely';
import { SharedSpaceRole, SyncEntityType, SyncRequestType } from 'src/enum';
import { AlbumRepository } from 'src/repositories/album.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

const setup = async (db?: Kysely<DB>) => {
  const ctx = new SyncTestContext(db || defaultDatabase);
  const { auth, user, session } = await ctx.newSyncAuthUser();
  return { auth, user, session, ctx };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

// Seed a space owned by `ownerId`, a linked album containing one asset. `member`
// (defaults to owner) is added to the space so it can sync the album asset.
const seedSpaceWithAlbumAsset = async (
  ctx: SyncTestContext,
  ownerId: string,
  opts: { memberId?: string; role?: SharedSpaceRole; showInTimeline?: boolean } = {},
) => {
  const { space } = await ctx.newSharedSpace({ createdById: ownerId });
  await ctx.newSharedSpaceMember({ spaceId: space.id, userId: ownerId, role: SharedSpaceRole.Owner });
  if (opts.memberId && opts.memberId !== ownerId) {
    await ctx.newSharedSpaceMember({
      spaceId: space.id,
      userId: opts.memberId,
      role: opts.role ?? SharedSpaceRole.Editor,
    });
  }
  const { album } = await ctx.newAlbum({ ownerId });
  const { asset } = await ctx.newAsset({ ownerId });
  await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
  await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id, showInTimeline: opts.showInTimeline ?? true });
  return { space, album, asset };
};

describe('SharedSpaceAlbumToAssetSync — album visibility purge/restore', () => {
  it('A1: emits a delete for an album-linked asset flipped to Hidden after it was acked', async () => {
    const { auth, ctx } = await setup();
    const { album, asset } = await seedSpaceWithAlbumAsset(ctx, auth.user.id);

    const initial = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    await ctx.syncAckAll(auth, initial);
    await ctx.assertSyncIsComplete(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);

    await ctx.get(SharedSpaceRepository).emitAlbumAssetVisibilityPurge([asset.id]);

    const next = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    const deletes = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumToAssetDeleteV1);
    expect(deletes).toHaveLength(1);
    expect((deletes[0] as { data: { albumId: string; assetId: string } }).data).toMatchObject({
      albumId: album.id,
      assetId: asset.id,
    });
  });

  it('A2: re-emits the album membership when the asset is restored to Timeline after a purge', async () => {
    const { auth, ctx } = await setup();
    const { album, asset } = await seedSpaceWithAlbumAsset(ctx, auth.user.id);

    const initial = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    await ctx.syncAckAll(auth, initial);

    await ctx.get(SharedSpaceRepository).emitAlbumAssetVisibilityPurge([asset.id]);
    const afterPurge = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    await ctx.syncAckAll(auth, afterPurge);
    await ctx.assertSyncIsComplete(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);

    await ctx.get(SharedSpaceRepository).emitAlbumAssetVisibilityRestore([asset.id]);

    const next = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    const upserts = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumToAssetV1);
    const emitted = upserts.map((e) => (e as { data: { albumId: string; assetId: string } }).data);
    expect(emitted).toContainEqual(expect.objectContaining({ albumId: album.id, assetId: asset.id }));
  });

  it('A3: Locked path delivers delete via album_asset_audit (removeAssetsFromAll) — no shared_space_album_asset_audit row', async () => {
    const { auth, ctx } = await setup();
    const { asset } = await seedSpaceWithAlbumAsset(ctx, auth.user.id);

    const initial = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    await ctx.syncAckAll(auth, initial);
    await ctx.assertSyncIsComplete(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);

    // Locked path: removeAssetsFromAll deletes the album_asset row, firing album_asset_audit trigger.
    // No emitAlbumAssetVisibilityPurge call here.
    await ctx.get(AlbumRepository).removeAssetsFromAll([asset.id]);

    // Assert no shared_space_album_asset_audit row was written for this asset.
    const auditRows = await ctx.database
      .selectFrom('shared_space_album_asset_audit')
      .selectAll()
      .where('assetId', '=', asset.id)
      .execute();
    expect(auditRows).toHaveLength(0);

    // But the member's sync should still deliver a delete (via album_asset_audit).
    const next = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    const deletes = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumToAssetDeleteV1);
    expect(deletes).toHaveLength(1);
  });

  it('A4: no bleed to normal albums not linked to any space', async () => {
    const { auth, ctx } = await setup();
    // Create a normal (non-space-linked) album with an asset
    const { album } = await ctx.newAlbum({ ownerId: auth.user.id });
    const { asset } = await ctx.newAsset({ ownerId: auth.user.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });

    await ctx.get(SharedSpaceRepository).emitAlbumAssetVisibilityPurge([asset.id]);

    // Assert no shared_space_album_asset_audit row was written.
    const auditRows = await ctx.database
      .selectFrom('shared_space_album_asset_audit')
      .selectAll()
      .where('assetId', '=', asset.id)
      .execute();
    expect(auditRows).toHaveLength(0);

    // And the non-space sync yields no album delete.
    const next = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    const deletes = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumToAssetDeleteV1);
    expect(deletes).toHaveLength(0);
  });

  it('A5: multi-album fan-out — delete emitted for each (albumId, assetId) pair', async () => {
    const { auth, ctx } = await setup();
    const { space } = await ctx.newSharedSpace({ createdById: auth.user.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: auth.user.id, role: SharedSpaceRole.Owner });

    const { album: album1 } = await ctx.newAlbum({ ownerId: auth.user.id });
    const { album: album2 } = await ctx.newAlbum({ ownerId: auth.user.id });
    const { asset } = await ctx.newAsset({ ownerId: auth.user.id });

    await ctx.newAlbumAsset({ albumId: album1.id, assetId: asset.id });
    await ctx.newAlbumAsset({ albumId: album2.id, assetId: asset.id });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album1.id });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album2.id });

    const initial = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    await ctx.syncAckAll(auth, initial);
    await ctx.assertSyncIsComplete(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);

    await ctx.get(SharedSpaceRepository).emitAlbumAssetVisibilityPurge([asset.id]);

    const next = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    const deletes = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumToAssetDeleteV1);
    expect(deletes).toHaveLength(2);
    const pairs = deletes.map((d) => (d as { data: { albumId: string; assetId: string } }).data);
    expect(pairs).toContainEqual(expect.objectContaining({ albumId: album1.id, assetId: asset.id }));
    expect(pairs).toContainEqual(expect.objectContaining({ albumId: album2.id, assetId: asset.id }));
  });

  it('A6: Viewer-role member receives the delete (parity with Editor)', async () => {
    const { auth: ownerAuth, ctx } = await setup();
    const { auth: viewerAuth } = await ctx.newSyncAuthUser();

    const { album, asset } = await seedSpaceWithAlbumAsset(ctx, ownerAuth.user.id, {
      memberId: viewerAuth.user.id,
      role: SharedSpaceRole.Viewer,
    });

    const initial = await ctx.syncStream(viewerAuth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    await ctx.syncAckAll(viewerAuth, initial);
    await ctx.assertSyncIsComplete(viewerAuth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);

    await ctx.get(SharedSpaceRepository).emitAlbumAssetVisibilityPurge([asset.id]);

    const next = await ctx.syncStream(viewerAuth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    const deletes = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumToAssetDeleteV1);
    expect(deletes).toHaveLength(1);
    expect((deletes[0] as { data: { albumId: string; assetId: string } }).data).toMatchObject({
      albumId: album.id,
      assetId: asset.id,
    });
  });

  it('A7: non-member of the space receives no album delete', async () => {
    const { auth: ownerAuth, ctx } = await setup();
    const { auth: nonMemberAuth } = await ctx.newSyncAuthUser();

    await seedSpaceWithAlbumAsset(ctx, ownerAuth.user.id);

    const { asset: otherAsset } = await ctx.newAsset({ ownerId: ownerAuth.user.id });
    // Use a fresh asset to call purge — non-member should see nothing
    await ctx.get(SharedSpaceRepository).emitAlbumAssetVisibilityPurge([otherAsset.id]);

    const next = await ctx.syncStream(nonMemberAuth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    const deletes = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumToAssetDeleteV1);
    expect(deletes).toHaveLength(0);
  });

  it('A8: no album re-add after Locked — album_asset row was deleted, restore finds nothing', async () => {
    const { auth, ctx } = await setup();
    const { asset } = await seedSpaceWithAlbumAsset(ctx, auth.user.id);

    // Locked path removes the album_asset row permanently.
    await ctx.get(AlbumRepository).removeAssetsFromAll([asset.id]);

    // Sync and ack the delete delivered by removeAssetsFromAll.
    const afterLocked = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    await ctx.syncAckAll(auth, afterLocked);
    await ctx.assertSyncIsComplete(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);

    // Attempt restore — no album_asset row to bump.
    await ctx.get(SharedSpaceRepository).emitAlbumAssetVisibilityRestore([asset.id]);

    const next = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    const upserts = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumToAssetV1);
    expect(upserts).toHaveLength(0);
  });

  it('A9: showInTimeline=false linked album still fires purge and restore', async () => {
    const { auth, ctx } = await setup();
    const { album, asset } = await seedSpaceWithAlbumAsset(ctx, auth.user.id, { showInTimeline: false });

    const initial = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    await ctx.syncAckAll(auth, initial);
    await ctx.assertSyncIsComplete(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);

    await ctx.get(SharedSpaceRepository).emitAlbumAssetVisibilityPurge([asset.id]);

    const afterPurge = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    const deletes = afterPurge.filter(
      (r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumToAssetDeleteV1,
    );
    expect(deletes).toHaveLength(1);
    expect((deletes[0] as { data: { albumId: string; assetId: string } }).data).toMatchObject({
      albumId: album.id,
      assetId: asset.id,
    });

    await ctx.syncAckAll(auth, afterPurge);
    await ctx.assertSyncIsComplete(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);

    await ctx.get(SharedSpaceRepository).emitAlbumAssetVisibilityRestore([asset.id]);

    const afterRestore = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    const upserts = afterRestore.filter(
      (r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumToAssetV1,
    );
    expect(upserts).toContainEqual(
      expect.objectContaining({ data: expect.objectContaining({ albumId: album.id, assetId: asset.id }) }),
    );
  });
});
