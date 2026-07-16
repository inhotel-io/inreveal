import { Kysely } from 'kysely';
import { AssetVisibility, SharedSpaceRole, SyncEntityType } from 'src/enum';
import { AlbumRepository } from 'src/repositories/album.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { SyncRepository } from 'src/repositories/sync.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

// Repo-level tests for SharedSpaceAlbumToAssetSync:
//   - getBackfill: per-album backfill of (albumId, assetId) rows
//   - getUpserts: scoped by shared_space_album_user grant (album_user → grant swap)
//   - getDeletes: reads album_asset_audit scoped to albums in accessibleSpaceAlbums

let defaultDatabase: Kysely<DB>;

const NOW_ID = 'ffffffff-ffff-7fff-bfff-ffffffffffff';
const BEFORE_UPDATE_ID = 'ffffffff-ffff-7fff-bfff-ffffffffffff';

const setup = () => {
  const ctx = new SyncTestContext(defaultDatabase);
  return { ctx, db: defaultDatabase, sut: ctx.get(SyncRepository).sharedSpaceAlbumToAsset };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe('SharedSpaceAlbumToAssetSync.getBackfill', () => {
  it('returns (albumId, assetId) rows for the given album', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });

    const stream = sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, album.id, owner.id);
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    expect(result.map((r: any) => r.assetId)).toContain(asset.id);
    expect(result.find((r: any) => r.assetId === asset.id)?.albumId).toBe(album.id);
  });

  it('does not return rows for a different album', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { album: a1 } = await ctx.newAlbum({ ownerId: owner.id });
    const { album: a2 } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: a1.id, assetId: asset.id });

    const stream = sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, a2.id, owner.id);
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    expect(result).toHaveLength(0);
  });
});

describe('SharedSpaceAlbumToAssetSync.getUpserts', () => {
  it('returns membership rows for albums accessible via space grant', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    const stream = sut.getUpserts({ nowId: NOW_ID, userId: member.id });
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    expect(result.some((r: any) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);
  });

  it('does not return rows for albums a user has no grant for', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: stranger } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    const stream = sut.getUpserts({ nowId: NOW_ID, userId: stranger.id });
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    expect(result.some((r: any) => r.albumId === album.id)).toBe(false);
  });

  it('excludes membership rows for soft-deleted albums', async () => {
    const { ctx, db, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    // Confirm membership row is visible before soft-delete
    const streamBefore = sut.getUpserts({ nowId: NOW_ID, userId: member.id });
    const resultBefore: any[] = [];
    for await (const row of streamBefore) {
      resultBefore.push(row);
    }
    expect(resultBefore.some((r: any) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);

    // Soft-delete the album
    await db.updateTable('album').set({ deletedAt: new Date() }).where('id', '=', album.id).execute();

    const stream = sut.getUpserts({ nowId: NOW_ID, userId: member.id });
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    expect(result.some((r: any) => r.albumId === album.id)).toBe(false);
  });

  it('security-6: excludes a Hidden album asset link row from the member upsert stream', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset: hidden } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Hidden });
    const { asset: timeline } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: hidden.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: timeline.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    const stream = sut.getUpserts({ nowId: NOW_ID, userId: member.id });
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    const assetIds = result.map((r: any) => r.assetId);
    expect(assetIds).toContain(timeline.id); // shareable membership delivered
    expect(assetIds).not.toContain(hidden.id); // Hidden membership withheld
  });

  it('security-6: excludes a Hidden album asset link row from the per-album backfill stream', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset: hidden } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Hidden });
    const { asset: timeline } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: hidden.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: timeline.id });

    const stream = sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, album.id, owner.id);
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    const assetIds = result.map((r: any) => r.assetId);
    expect(assetIds).toContain(timeline.id);
    expect(assetIds).not.toContain(hidden.id);
  });

  it('security-6: an album linked into TWO spaces gates the Hidden asset in both member streams', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: memberA } = await ctx.newUser();
    const { user: memberB } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset: hidden } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Hidden });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: hidden.id });

    const { space: spaceA } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: spaceA.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: spaceA.id, userId: memberA.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: spaceA.id, albumId: album.id });

    const { space: spaceB } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: spaceB.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: spaceB.id, userId: memberB.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: spaceB.id, albumId: album.id });

    for (const userId of [memberA.id, memberB.id]) {
      const stream = sut.getUpserts({ nowId: NOW_ID, userId });
      const result: any[] = [];
      for await (const row of stream) {
        result.push(row);
      }
      expect(result.map((r: any) => r.assetId)).not.toContain(hidden.id);
    }
  });

  it('regression: an Archive album asset link row is still emitted (flat gate keeps Archive)', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Archive });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    const stream = sut.getUpserts({ nowId: NOW_ID, userId: member.id });
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    expect(result.map((r: any) => r.assetId)).toContain(asset.id);
  });
});

describe('SharedSpaceAlbumToAssetSync.getDeletes', () => {
  it('returns album_asset_audit rows for albums in accessibleSpaceAlbums', async () => {
    const { ctx, db, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    // Insert an album_asset_audit row directly (written by asset removal triggers)
    await db.insertInto('album_asset_audit').values({ assetId: asset.id, albumId: album.id }).execute();

    const stream = sut.getDeletes({ nowId: NOW_ID, userId: member.id });
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    expect(result.some((r: any) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);
  });

  it('does not return audit rows for albums the user cannot access', async () => {
    const { ctx, db, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: stranger } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    await db.insertInto('album_asset_audit').values({ assetId: asset.id, albumId: album.id }).execute();

    const stream = sut.getDeletes({ nowId: NOW_ID, userId: stranger.id });
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    expect(result).toHaveLength(0);
  });
});

const drain = async (stream: AsyncIterable<any>) => {
  const out: any[] = [];
  for await (const row of stream) {
    out.push(row);
  }
  return out;
};

describe('SharedSpaceAlbumToAssetSync — contributions (album_space_asset)', () => {
  it('getBackfill returns a contributed (albumId, assetId) row for the album', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: carol } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id }); // owned by someone else
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: space.id });

    const rows = await drain(sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, album.id, member.id));
    expect(rows.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);
  });

  it('getBackfill excludes a contributed row whose asset is Hidden (visibility gate)', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: carol } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id, visibility: AssetVisibility.Hidden });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: space.id });

    const rows = await drain(sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, album.id, member.id));
    expect(rows.some((r) => r.assetId === asset.id)).toBe(false);
  });

  it('getUpserts returns a contributed row for a member with an album grant', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: carol } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: space.id });

    const rows = await drain(sut.getUpserts({ nowId: NOW_ID, userId: member.id }));
    expect(rows.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);
  });

  it('getUpserts excludes a Hidden contribution for a member (visibility gate parity with getBackfill)', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: carol } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id, visibility: AssetVisibility.Hidden });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: space.id });

    const rows = await drain(sut.getUpserts({ nowId: NOW_ID, userId: member.id }));
    expect(rows.some((r) => r.assetId === asset.id)).toBe(false);
  });

  it('getUpserts does not return a contributed row for a non-member', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: stranger } = await ctx.newUser();
    const { user: carol } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: space.id });

    const rows = await drain(sut.getUpserts({ nowId: NOW_ID, userId: stranger.id }));
    expect(rows.some((r) => r.assetId === asset.id)).toBe(false);
  });

  it('getDeletes emits the contributed edge to every member (incl. asset owner) after removal', async () => {
    const { ctx, db, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: carol } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: carol.id, role: SharedSpaceRole.Viewer });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: space.id });

    await db.deleteFrom('album_space_asset').where('albumId', '=', album.id).where('assetId', '=', asset.id).execute();

    for (const viewer of [member.id, carol.id]) {
      const rows = await drain(sut.getDeletes({ nowId: NOW_ID, userId: viewer }));
      expect(rows.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);
    }
  });

  it('getUpserts stops returning a contribution after the member leaves S (grant revoked by #752 trigger)', async () => {
    const { ctx, db, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: carol } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: space.id });

    const before = await drain(sut.getUpserts({ nowId: NOW_ID, userId: member.id }));
    expect(before.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);

    // Member leaves S → shared_space_member_delete_album_audit revokes the album grant (#752), same
    // path that drops the album (and thus its contribution edges) on device.
    await db
      .deleteFrom('shared_space_member')
      .where('spaceId', '=', space.id)
      .where('userId', '=', member.id)
      .execute();

    const after = await drain(sut.getUpserts({ nowId: NOW_ID, userId: member.id }));
    expect(after.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(false);
  });

  it('P1-6 convergence: owner-add conversion delivers tombstone + album_asset upsert in one window', async () => {
    const { ctx, db, sut } = setup();
    const albumRepo = ctx.get(AlbumRepository);
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: carol } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: space.id });

    await albumRepo.addAssetIds(album.id, [asset.id]); // the owner-add conversion site

    const remaining = await db
      .selectFrom('album_space_asset')
      .select('assetId')
      .where('albumId', '=', album.id)
      .execute();
    expect(remaining).toHaveLength(0);
    const deletes = await drain(sut.getDeletes({ nowId: NOW_ID, userId: member.id }));
    expect(deletes.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);
    const upserts = await drain(sut.getUpserts({ nowId: NOW_ID, userId: member.id }));
    expect(upserts.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);

    // Post-conversion removal (P1-6 spec seed): the owner now removes the asset — devices must get
    // a NEW tombstone (album_asset_audit) beyond the conversion ones, and the edge must stop
    // upserting. (Convergence order is safe by construction: the server handler streams deletes
    // before upserts and the client applies batches sequentially.)
    const conversionTombstoneIds = new Set(
      deletes.filter((r) => r.albumId === album.id && r.assetId === asset.id).map((r) => r.id),
    );
    await albumRepo.removeAssetIds(album.id, [asset.id]);
    const deletesAfter = await drain(sut.getDeletes({ nowId: NOW_ID, userId: member.id }));
    expect(
      deletesAfter.some((r) => r.albumId === album.id && r.assetId === asset.id && !conversionTombstoneIds.has(r.id)),
    ).toBe(true);
    const upsertsAfter = await drain(sut.getUpserts({ nowId: NOW_ID, userId: member.id }));
    expect(upsertsAfter.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(false);
  });
});

describe('SharedSpaceAlbumToAssetSync — multi-space co-linked album (I2 §8.3)', () => {
  // Album L linked to S1 AND S2 (disjoint members). A contribution made via S1 must reach an S1 member
  // but NEVER an S2-only member — the album grant / accessibleSpaceAlbums are space-agnostic, so without
  // the space-correlation gate an S1 contribution leaks the edge to S2.
  // eslint-disable-next-line unicorn/consistent-function-scoping -- test-local seed factory, co-located with its cases
  const seedDisjoint = async (ctx: SyncTestContext) => {
    const { user: owner } = await ctx.newUser();
    const { user: carol } = await ctx.newUser();
    const { user: memberS1 } = await ctx.newUser();
    const { user: memberS2 } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id }); // contributed by a third user

    const { space: s1 } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: s1.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: s1.id, userId: memberS1.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: s1.id, albumId: album.id });

    const { space: s2 } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: s2.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: s2.id, userId: memberS2.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: s2.id, albumId: album.id });

    // Contribution pinned to S1 only.
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: s1.id });
    return { album, asset, memberS1, memberS2 };
  };

  it('getUpserts does not emit an S1 contribution to an S2-only member (but does to an S1 member)', async () => {
    const { ctx, sut } = setup();
    const { album, asset, memberS1, memberS2 } = await seedDisjoint(ctx);

    const s2 = await drain(sut.getUpserts({ nowId: NOW_ID, userId: memberS2.id }));
    expect(s2.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(false);

    const s1 = await drain(sut.getUpserts({ nowId: NOW_ID, userId: memberS1.id }));
    expect(s1.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);
  });

  it('getBackfill does not emit an S1 contribution to an S2-only member (but does to an S1 member)', async () => {
    const { ctx, sut } = setup();
    const { album, asset, memberS1, memberS2 } = await seedDisjoint(ctx);

    const s2 = await drain(sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, album.id, memberS2.id));
    expect(s2.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(false);

    const s1 = await drain(sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, album.id, memberS1.id));
    expect(s1.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);
  });
});

describe('SharedSpaceAlbumToAssetSync — unlink revocation + re-link re-delivery (P0-1 / D1-b)', () => {
  // eslint-disable-next-line unicorn/consistent-function-scoping -- test-local seed factory
  const seedCoLinked = async (ctx: SyncTestContext) => {
    const { user: owner } = await ctx.newUser();
    const { user: m } = await ctx.newUser(); // member of BOTH spaces
    const { user: carol } = await ctx.newUser(); // asset owner
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id });
    const { space: s1 } = await ctx.newSharedSpace({ createdById: owner.id });
    const { space: s2 } = await ctx.newSharedSpace({ createdById: owner.id });
    for (const s of [s1, s2]) {
      await ctx.newSharedSpaceMember({ spaceId: s.id, userId: owner.id, role: SharedSpaceRole.Owner });
      await ctx.newSharedSpaceMember({ spaceId: s.id, userId: m.id, role: SharedSpaceRole.Editor });
      await ctx.newSharedSpaceAlbum({ spaceId: s.id, albumId: album.id });
    }
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: s1.id });
    return { owner, m, album, asset, s1, s2 };
  };

  it('unlink tombstones the contribution for a member who keeps the album via a co-linked space; the row is retained', async () => {
    const { ctx, db, sut } = setup();
    const spaceRepo = ctx.get(SharedSpaceRepository);
    const { m, album, asset, s1 } = await seedCoLinked(ctx);

    await spaceRepo.removeAlbum(s1.id, album.id);

    // D1-(b) retention: the row survives for re-link reversibility …
    const row = await db
      .selectFrom('album_space_asset')
      .select('assetId')
      .where('albumId', '=', album.id)
      .executeTakeFirst();
    expect(row).toBeDefined();
    // … but the member device receives a delete tombstone (album stays accessible via S2).
    const deletes = await drain(sut.getDeletes({ nowId: NOW_ID, userId: m.id }));
    expect(deletes.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);
  });

  it('re-link bumps the retained contribution so getUpserts re-delivers past a pre-unlink ack', async () => {
    const { ctx, db, sut } = setup();
    const spaceRepo = ctx.get(SharedSpaceRepository);
    const { owner, m, album, asset, s1 } = await seedCoLinked(ctx);

    const before = await db
      .selectFrom('album_space_asset')
      .select('updateId')
      .where('albumId', '=', album.id)
      .executeTakeFirstOrThrow();

    await spaceRepo.removeAlbum(s1.id, album.id);
    const relinked = await spaceRepo.addAlbum({ spaceId: s1.id, albumId: album.id, addedById: owner.id });
    expect(relinked).toBeDefined();

    // A device that acked past the original updateId must re-receive the edge.
    const rows = await drain(
      sut.getUpserts({
        nowId: NOW_ID,
        userId: m.id,
        ack: { type: SyncEntityType.SharedSpaceAlbumToAssetV1, updateId: before.updateId },
      }),
    );
    expect(rows.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);
  });

  it('member-departure link cleanup (removeOwnedAlbumLinksAddedBy) tombstones the removed links’ contributions', async () => {
    const { ctx, db, sut } = setup();
    const spaceRepo = ctx.get(SharedSpaceRepository);
    const { user: dep } = await ctx.newUser(); // departing member, owns + added the album
    const { user: m } = await ctx.newUser();
    const { user: carol } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: dep.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id });
    const { space: s1 } = await ctx.newSharedSpace({ createdById: dep.id });
    const { space: s2 } = await ctx.newSharedSpace({ createdById: dep.id });
    for (const s of [s1, s2]) {
      await ctx.newSharedSpaceMember({ spaceId: s.id, userId: dep.id, role: SharedSpaceRole.Owner });
      await ctx.newSharedSpaceMember({ spaceId: s.id, userId: m.id, role: SharedSpaceRole.Editor });
      await ctx.newSharedSpaceAlbum({ spaceId: s.id, albumId: album.id, addedById: dep.id });
    }
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: s1.id });

    const removed = await spaceRepo.removeOwnedAlbumLinksAddedBy(s1.id, dep.id);
    expect(removed).toContain(album.id);

    const deletes = await drain(sut.getDeletes({ nowId: NOW_ID, userId: m.id }));
    expect(deletes.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);
    // sanity: retention here too
    const row = await db
      .selectFrom('album_space_asset')
      .select('assetId')
      .where('albumId', '=', album.id)
      .executeTakeFirst();
    expect(row).toBeDefined();
  });

  it('single-space unlink: member gets the whole-album drop; the edge tombstone is correctly withheld', async () => {
    // Expected-GREEN regression guard for the removeAlbum rewrite (BDD 4): in the common
    // single-space case the device converges via the album-level metadata drop, NOT the edge
    // tombstone (getDeletes filters it out once the album leaves accessibleSpaceAlbums).
    const { ctx, sut } = setup();
    const spaceRepo = ctx.get(SharedSpaceRepository);
    const { user: owner } = await ctx.newUser();
    const { user: m } = await ctx.newUser();
    const { user: carol } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: m.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: space.id });

    await spaceRepo.removeAlbum(space.id, album.id);

    const edgeDeletes = await drain(sut.getDeletes({ nowId: NOW_ID, userId: m.id }));
    expect(edgeDeletes.some((r) => r.albumId === album.id)).toBe(false);
    // Album-metadata sync delivers the whole-album drop via the (gated) grant tombstone. Adjust
    // the sut property + delete-row shape to mirror sync-shared-space-album.spec.ts.
    const albumSync = ctx.get(SyncRepository).sharedSpaceAlbum;
    const albumDeletes = await drain(albumSync.getDeletes({ nowId: NOW_ID, userId: m.id }));
    expect(JSON.stringify(albumDeletes)).toContain(album.id);
  });
});
