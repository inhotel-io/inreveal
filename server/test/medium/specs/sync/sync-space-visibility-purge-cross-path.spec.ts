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

    const directDeletes = next.filter(
      (r: { type: string }) => r.type === SyncEntityType.SharedSpaceToAssetDeleteV1,
    );
    const albumDeletes = next.filter(
      (r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumToAssetDeleteV1,
    );
    const libraryDeletes = next.filter((r: { type: string }) => r.type === SyncEntityType.LibraryAssetDeleteV1);

    expect(directDeletes.length, 'direct-path delete missing').toBeGreaterThanOrEqual(1);
    expect(albumDeletes.length, 'album-path delete missing').toBeGreaterThanOrEqual(1);
    expect(libraryDeletes.length, 'library-path delete missing').toBeGreaterThanOrEqual(1);

    // Check each stream contains the expected asset.
    expect(
      directDeletes.some((e) => (e as { data: { assetId: string } }).data.assetId === asset.id),
    ).toBe(true);
    expect(
      albumDeletes.some((e) => (e as { data: { assetId: string } }).data.assetId === asset.id),
    ).toBe(true);
    expect(
      libraryDeletes.some((e) => (e as { data: { assetId: string } }).data.assetId === asset.id),
    ).toBe(true);
  });
});
