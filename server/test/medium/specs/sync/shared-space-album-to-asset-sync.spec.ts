import { Kysely } from 'kysely';
import { AssetVisibility, SharedSpaceRole } from 'src/enum';
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

    const stream = sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, album.id);
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

    const stream = sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, a2.id);
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

    const stream = sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, album.id);
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
    const { user: carol } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id }); // owned by someone else
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: space.id });

    const rows = await drain(sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, album.id));
    expect(rows.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(true);
  });

  it('getBackfill excludes a contributed row whose asset is Hidden (visibility gate)', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: carol } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: carol.id, visibility: AssetVisibility.Hidden });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });
    await ctx.newAlbumSpaceAsset({ albumId: album.id, assetId: asset.id, spaceId: space.id });

    const rows = await drain(sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, album.id));
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
    await db.deleteFrom('shared_space_member').where('spaceId', '=', space.id).where('userId', '=', member.id).execute();

    const after = await drain(sut.getUpserts({ nowId: NOW_ID, userId: member.id }));
    expect(after.some((r) => r.albumId === album.id && r.assetId === asset.id)).toBe(false);
  });
});
