// Slice 3 (X1): Cross-path visibility purge convergence.
// Verifies that an asset reachable by a member via ALL THREE paths — direct add
// to space S1, a space-linked album in S2, and a space-linked library in S3 —
// is purged on ALL THREE sync streams when the owner emits all three purge
// calls (as asset.service.updateAll does on a flip to Hidden).
//
// This test exercises emitDirectAssetVisibilityPurge (Slice 4.B),
// emitAlbumAssetVisibilityPurge (Slice 1), and emitLibraryAssetVisibilityPurge
// (Slice 2) in concert, proving the three mechanisms converge on one device.
import { Kysely } from 'kysely';
import { AssetVisibility, SharedSpaceRole, SyncEntityType, SyncRequestType } from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetEditRepository } from 'src/repositories/asset-edit.repository';
import { AssetJobRepository } from 'src/repositories/asset-job.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { EventRepository } from 'src/repositories/event.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { MapRepository } from 'src/repositories/map.repository';
import { OcrRepository } from 'src/repositories/ocr.repository';
import { SharedLinkAssetRepository } from 'src/repositories/shared-link-asset.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { StackRepository } from 'src/repositories/stack.repository';
import { StorageRepository } from 'src/repositories/storage.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { AssetService } from 'src/services/asset.service';
import { newMediumService, SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

const setup = async (db?: Kysely<DB>) => {
  const ctx = new SyncTestContext(db || defaultDatabase);
  const { auth, user, session } = await ctx.newSyncAuthUser();
  return { auth, user, session, ctx };
};

// Drives asset.service.updateAll directly (not the raw SharedSpaceRepository emit methods) so the
// correctness-8 boundary-crossing GATE in applyVisibilityTransitionSideEffects is actually exercised —
// the raw emit* methods always fire unconditionally; the gating lives one layer up, in AssetService.
const setupAssetService = (db?: Kysely<DB>) => {
  const { sut, ctx } = newMediumService(AssetService, {
    database: db || defaultDatabase,
    real: [
      AssetRepository,
      AssetEditRepository,
      AssetJobRepository,
      AlbumRepository,
      AccessRepository,
      SharedLinkAssetRepository,
      SharedSpaceRepository,
      StackRepository,
      UserRepository,
    ],
    mock: [EventRepository, LoggingRepository, JobRepository, StorageRepository, OcrRepository, MapRepository],
  });
  ctx.getMock(JobRepository).queueAll.mockResolvedValue();
  return { sut, ctx };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe('Cross-path visibility purge convergence (X1)', () => {
  // Cross-path (X1): an asset reachable via direct add, a space-linked album, and
  // a space-linked library must be purged from an already-synced member on ALL
  // three streams when the owner flips it to Hidden. Verifies the three Slice-4.B/
  // Slice-1/Slice-2 mechanisms converge on one device.
  it('X1: purges an already-synced asset on all three streams (direct, album, library)', async () => {
    const { ctx } = await setup();

    const owner = await ctx.newSyncAuthUser();
    const member = await ctx.newSyncAuthUser();

    // One asset owned by the owner.
    const { asset } = await ctx.newAsset({ ownerId: owner.user.id, visibility: AssetVisibility.Timeline });

    // S1: direct-add path — asset directly added to space S1.
    const { space: s1 } = await ctx.newSharedSpace({ createdById: owner.user.id });
    await ctx.newSharedSpaceMember({ spaceId: s1.id, userId: owner.user.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: s1.id, userId: member.user.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAsset({ spaceId: s1.id, assetId: asset.id });

    // S2: album path — asset in an album linked to space S2.
    const { space: s2 } = await ctx.newSharedSpace({ createdById: owner.user.id });
    await ctx.newSharedSpaceMember({ spaceId: s2.id, userId: owner.user.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: s2.id, userId: member.user.id, role: SharedSpaceRole.Editor });
    const { album } = await ctx.newAlbum({ ownerId: owner.user.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    await ctx.newSharedSpaceAlbum({ spaceId: s2.id, albumId: album.id });

    // S3: library path — asset in a library linked to space S3.
    const { space: s3 } = await ctx.newSharedSpace({ createdById: owner.user.id });
    await ctx.newSharedSpaceMember({ spaceId: s3.id, userId: owner.user.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: s3.id, userId: member.user.id, role: SharedSpaceRole.Editor });
    const { library } = await ctx.newLibrary({ ownerId: owner.user.id });
    await ctx.newSharedSpaceLibrary({ spaceId: s3.id, libraryId: library.id });
    // Re-associate the asset with the library (set its libraryId).
    await ctx.database.updateTable('asset').set({ libraryId: library.id }).where('id', '=', asset.id).execute();

    // Member syncs and acks all three streams to simulate an already-synced device.
    const types = [
      SyncRequestType.SharedSpaceToAssetsV1,
      SyncRequestType.SharedSpaceAlbumToAssetsV1,
      SyncRequestType.LibraryAssetsV1,
    ];
    const initial = await ctx.syncStream(member.auth, types);
    await ctx.syncAckAll(member.auth, initial);
    await ctx.assertSyncIsComplete(member.auth, types);

    // Owner flips the asset to Hidden — all three purge emitters fire.
    await ctx.get(SharedSpaceRepository).emitDirectAssetVisibilityPurge([asset.id]);
    await ctx.get(SharedSpaceRepository).emitAlbumAssetVisibilityPurge([asset.id]);
    await ctx.get(SharedSpaceRepository).emitLibraryAssetVisibilityPurge([asset.id]);

    // Member's next sync must deliver deletes on ALL THREE streams.
    const next = await ctx.syncStream(member.auth, types);

    const directDeletes = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceToAssetDeleteV1);
    const albumDeletes = next.filter(
      (r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumToAssetDeleteV1,
    );
    const libraryDeletes = next.filter((r: { type: string }) => r.type === SyncEntityType.LibraryAssetDeleteV1);

    expect(directDeletes.length, 'direct-path delete missing').toBeGreaterThanOrEqual(1);
    expect(albumDeletes.length, 'album-path delete missing').toBeGreaterThanOrEqual(1);
    expect(libraryDeletes.length, 'library-path delete missing').toBeGreaterThanOrEqual(1);

    // Check each stream contains the expected asset.
    expect(directDeletes.some((e) => (e as { data: { assetId: string } }).data.assetId === asset.id)).toBe(true);
    expect(albumDeletes.some((e) => (e as { data: { assetId: string } }).data.assetId === asset.id)).toBe(true);
    expect(libraryDeletes.some((e) => (e as { data: { assetId: string } }).data.assetId === asset.id)).toBe(true);
  });
});

// correctness-8 / M3: applyVisibilityTransitionSideEffects's restore side still gates on the PRIOR
// visibility (a shareable-to-shareable move like Timeline -> Archive writes no spurious re-upsert), but
// the PURGE side (M3) is now UNCONDITIONAL on a non-shareable next, not gated on the prior. A re-affirm
// (already-Hidden -> Hidden) DOES write a new tombstone, and a mixed bulk request purges every id whose
// next is non-shareable, including one already Hidden. This is intentional: gating purge on the prior
// visibility read before the write meant a retry after a failed emit (write committed, emit lost) would
// re-read the now-Hidden asset and silently no-op, leaving a member device holding stale bytes forever.
// The purge tombstone is idempotent, so re-emitting it on every non-shareable-next call is harmless and
// makes the whole flow retry-convergent.
describe('Boundary-crossing purge gate (correctness-8 / M3 retry-convergence)', () => {
  it('M3: re-hiding an already-Hidden asset re-emits the purge tombstone so a retry after a failed emit converges', async () => {
    const { ctx } = await setup();
    const owner = await ctx.newSyncAuthUser();
    const member = await ctx.newSyncAuthUser();
    const { sut: assetSut } = setupAssetService(ctx.database);

    const { asset } = await ctx.newAsset({ ownerId: owner.user.id, visibility: AssetVisibility.Timeline });

    const { space } = await ctx.newSharedSpace({ createdById: owner.user.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.user.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.user.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id });

    const { album } = await ctx.newAlbum({ ownerId: owner.user.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    // Member already synced the asset while Timeline (simulates an already-synced device).
    const initial = await ctx.syncStream(member.auth, [SyncRequestType.SharedSpaceToAssetsV1]);
    await ctx.syncAckAll(member.auth, initial);
    await ctx.assertSyncIsComplete(member.auth, [SyncRequestType.SharedSpaceToAssetsV1]);

    // First hide: genuine Timeline -> Hidden crossing. The member converges (delete delivered + acked).
    await assetSut.updateAll(owner.auth, { ids: [asset.id], visibility: AssetVisibility.Hidden });
    const afterFirstHide = await ctx.syncStream(member.auth, [SyncRequestType.SharedSpaceToAssetsV1]);
    await ctx.syncAckAll(member.auth, afterFirstHide);
    await ctx.assertSyncIsComplete(member.auth, [SyncRequestType.SharedSpaceToAssetsV1]);

    // Simulate a retry after a failed emit: the asset is ALREADY Hidden, but "hide" is called again
    // (e.g. a client retry of a request whose write committed but whose response/emit was lost).
    await assetSut.updateAll(owner.auth, { ids: [asset.id], visibility: AssetVisibility.Hidden });

    const directAudit = await ctx.database
      .selectFrom('shared_space_asset_audit')
      .selectAll()
      .where('assetId', '=', asset.id)
      .execute();
    const albumAudit = await ctx.database
      .selectFrom('shared_space_album_asset_audit')
      .selectAll()
      .where('assetId', '=', asset.id)
      .execute();

    // A SECOND tombstone was written on the retry on both tables (audit rows are never deleted — only
    // consumed via sync/ack above — so both the first-hide row and the retry's re-affirm row persist).
    expect(directAudit, 'direct-path tombstone re-emitted on the retry').toHaveLength(2);
    expect(albumAudit, 'album-path tombstone re-emitted on the retry').toHaveLength(2);

    // The member's device — which had already acked the first delete and saw nothing new since — still
    // converges: the retry's fresh tombstone is delivered on the next sync.
    const afterRetry = await ctx.syncStream(member.auth, [SyncRequestType.SharedSpaceToAssetsV1]);
    const retryDeletes = afterRetry.filter(
      (r: { type: string }) => r.type === SyncEntityType.SharedSpaceToAssetDeleteV1,
    );
    expect(retryDeletes.length, 'member /sync still carries the purge tombstone on the retry').toBeGreaterThanOrEqual(
      1,
    );
  });

  it('a Timeline -> Archive move (both shareable) delivers no spurious re-upsert to an already-synced member', async () => {
    const { ctx } = await setup();
    const owner = await ctx.newSyncAuthUser();
    const member = await ctx.newSyncAuthUser();
    const { sut: assetSut } = setupAssetService(ctx.database);

    const { asset } = await ctx.newAsset({ ownerId: owner.user.id, visibility: AssetVisibility.Timeline });
    const { space } = await ctx.newSharedSpace({ createdById: owner.user.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.user.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.user.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id });

    const initial = await ctx.syncStream(member.auth, [SyncRequestType.SharedSpaceToAssetsV1]);
    await ctx.syncAckAll(member.auth, initial);
    await ctx.assertSyncIsComplete(member.auth, [SyncRequestType.SharedSpaceToAssetsV1]);

    // Timeline -> Archive: neither side of the transition crosses the shareable boundary.
    await assetSut.updateAll(owner.auth, { ids: [asset.id], visibility: AssetVisibility.Archive });

    const next = await ctx.syncStream(member.auth, [SyncRequestType.SharedSpaceToAssetsV1]);
    const upserts = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceToAssetV1);
    const deletes = next.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceToAssetDeleteV1);
    expect(upserts, 'no spurious re-upsert on a shareable-to-shareable move').toHaveLength(0);
    expect(deletes, 'no purge on a shareable-to-shareable move').toHaveLength(0);
  });

  it('M3: a mixed bulk request purges BOTH the asset that crosses the boundary and the one already Hidden', async () => {
    const { ctx } = await setup();
    const owner = await ctx.newSyncAuthUser();
    const { sut: assetSut } = setupAssetService(ctx.database);

    const { asset: crossing } = await ctx.newAsset({ ownerId: owner.user.id, visibility: AssetVisibility.Timeline });
    const { asset: alreadyHidden } = await ctx.newAsset({ ownerId: owner.user.id, visibility: AssetVisibility.Hidden });

    const { space } = await ctx.newSharedSpace({ createdById: owner.user.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.user.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: crossing.id });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: alreadyHidden.id });

    await assetSut.updateAll(owner.auth, {
      ids: [crossing.id, alreadyHidden.id],
      visibility: AssetVisibility.Hidden,
    });

    const auditRows = await ctx.database
      .selectFrom('shared_space_asset_audit')
      .selectAll()
      .where('assetId', 'in', [crossing.id, alreadyHidden.id])
      .execute();

    // M3: purge is unconditional on a non-shareable next — the already-Hidden asset is re-affirmed too.
    expect(auditRows.map((r) => r.assetId).toSorted()).toEqual([alreadyHidden.id, crossing.id].toSorted());
  });
});
