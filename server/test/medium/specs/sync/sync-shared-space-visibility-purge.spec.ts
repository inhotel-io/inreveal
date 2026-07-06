// Slice 4.B: purge already-synced DIRECT space assets from member devices when
// the owner flips an asset OUT of the space-shareable set (Timeline/Archive) to
// Hidden or Locked, and re-add it when flipped back.
//
// Slice 4.A gated the sync READ streams so a NEW/full sync never receives
// Hidden/Locked. But a device that ALREADY synced an asset while it was
// Timeline/Archive keeps the bytes when the owner later flips it to
// Hidden/Locked — the SharedSpaceToAssetSync delete stream only fires on
// JOIN-ROW deletion, and a visibility flip deletes no shared_space_asset row.
//
// This slice closes the DIRECT path (`shared_space_asset` /
// `shared_space_asset_audit`, which is space-only). On flip to Hidden/Locked we
// emit a shared_space_asset_audit tombstone for every referencing row so
// getDeletes purges member devices. On flip back to Timeline/Archive we bump
// shared_space_asset.updateId so getUpserts re-adds.
//
// Album-path Hidden already-synced purge, the library path, and mobile-client
// end-to-end verification are documented follow-ups (out of scope here).

import { Kysely } from 'kysely';
import { SharedSpaceRole, SyncEntityType, SyncRequestType } from 'src/enum';
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

// Seed a space owned by `auth`, with `auth` as Owner, plus a directly-added
// asset. Returns the space + asset. The caller acks the current sync state to
// simulate an already-synced device before flipping visibility.
const seedSpaceWithDirectAsset = async (ctx: SyncTestContext, ownerId: string) => {
  const { space } = await ctx.newSharedSpace({ createdById: ownerId });
  await ctx.newSharedSpaceMember({ spaceId: space.id, userId: ownerId, role: SharedSpaceRole.Owner });
  const { asset } = await ctx.newAsset({ ownerId });
  await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id });
  return { space, asset };
};

describe('SharedSpaceToAssetSync — visibility purge/restore (direct path)', () => {
  it('emits a delete event for a directly-added asset flipped to Hidden after it was acked', async () => {
    const { auth, ctx } = await setup();
    const { space, asset } = await seedSpaceWithDirectAsset(ctx, auth.user.id);

    // Simulate an already-synced device.
    const initial = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceToAssetsV1]);
    await ctx.syncAckAll(auth, initial);
    await ctx.assertSyncIsComplete(auth, [SyncRequestType.SharedSpaceToAssetsV1]);

    // Owner flips the asset to Hidden — DIRECT-path purge must emit a tombstone.
    await ctx.get(SharedSpaceRepository).emitDirectAssetVisibilityPurge([asset.id]);

    const next = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceToAssetsV1]);
    const deleteEvents = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceToAssetDeleteV1);
    expect(deleteEvents).toHaveLength(1);
    expect((deleteEvents[0] as { data: { spaceId: string; assetId: string } }).data).toMatchObject({
      spaceId: space.id,
      assetId: asset.id,
    });
  });

  it('emits a delete event for a directly-added asset flipped to Locked after it was acked', async () => {
    const { auth, ctx } = await setup();
    const { space, asset } = await seedSpaceWithDirectAsset(ctx, auth.user.id);

    const initial = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceToAssetsV1]);
    await ctx.syncAckAll(auth, initial);
    await ctx.assertSyncIsComplete(auth, [SyncRequestType.SharedSpaceToAssetsV1]);

    // Locked purge uses the same direct-path tombstone mechanism.
    await ctx.get(SharedSpaceRepository).emitDirectAssetVisibilityPurge([asset.id]);

    const next = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceToAssetsV1]);
    const deleteEvents = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceToAssetDeleteV1);
    expect(deleteEvents).toHaveLength(1);
    expect((deleteEvents[0] as { data: { spaceId: string; assetId: string } }).data).toMatchObject({
      spaceId: space.id,
      assetId: asset.id,
    });
  });

  it('re-emits an upsert for a directly-added asset restored to Timeline after being purged', async () => {
    const { auth, ctx } = await setup();
    const { space, asset } = await seedSpaceWithDirectAsset(ctx, auth.user.id);

    const initial = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceToAssetsV1]);
    await ctx.syncAckAll(auth, initial);
    await ctx.assertSyncIsComplete(auth, [SyncRequestType.SharedSpaceToAssetsV1]);

    // Purge, ack the delete, then restore.
    await ctx.get(SharedSpaceRepository).emitDirectAssetVisibilityPurge([asset.id]);
    const afterPurge = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceToAssetsV1]);
    await ctx.syncAckAll(auth, afterPurge);
    await ctx.assertSyncIsComplete(auth, [SyncRequestType.SharedSpaceToAssetsV1]);

    // Restore to Timeline — updateId bump must re-emit the join row via getUpserts.
    await ctx.get(SharedSpaceRepository).emitDirectAssetVisibilityRestore([asset.id]);

    const next = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceToAssetsV1]);
    const upsertEvents = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceToAssetV1);
    const emitted = upsertEvents.map((e) => (e as { data: { spaceId: string; assetId: string } }).data);
    expect(emitted).toContainEqual(expect.objectContaining({ spaceId: space.id, assetId: asset.id }));
  });

  it('emits nothing when purging an asset that is not in any space', async () => {
    const { auth, ctx } = await setup();
    const { asset } = await ctx.newAsset({ ownerId: auth.user.id });

    await ctx.get(SharedSpaceRepository).emitDirectAssetVisibilityPurge([asset.id]);
    await ctx.get(SharedSpaceRepository).emitDirectAssetVisibilityRestore([asset.id]);

    const response = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceToAssetsV1]);
    const deleteEvents = response.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceToAssetDeleteV1);
    const joinEvents = response.filter(
      (r: { type: string }) =>
        r.type === SyncEntityType.SharedSpaceToAssetV1 || r.type === SyncEntityType.SharedSpaceToAssetBackfillV1,
    );
    expect(deleteEvents).toHaveLength(0);
    expect(joinEvents).toHaveLength(0);
  });

  it('is a no-op on an empty id list', async () => {
    const { ctx } = await setup();
    await expect(ctx.get(SharedSpaceRepository).emitDirectAssetVisibilityPurge([])).resolves.not.toThrow();
    await expect(ctx.get(SharedSpaceRepository).emitDirectAssetVisibilityRestore([])).resolves.not.toThrow();
  });
});
