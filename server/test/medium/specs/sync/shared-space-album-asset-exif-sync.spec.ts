import { Kysely } from 'kysely';
import { SharedSpaceRole, SyncEntityType } from 'src/enum';
import { SyncRepository } from 'src/repositories/sync.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

// Repo-level tests for SharedSpaceAlbumAssetExifSync:
//   - getBackfill: per-album backfill of asset_exif rows
//   - getCreates: new album_asset exif join rows via grant
//   - getUpdates: exif changes gated by albumToAssetAck coupling

let defaultDatabase: Kysely<DB>;

const NOW_ID = 'ffffffff-ffff-7fff-bfff-ffffffffffff';
const BEFORE_UPDATE_ID = 'ffffffff-ffff-7fff-bfff-ffffffffffff';

const setup = () => {
  const ctx = new SyncTestContext(defaultDatabase);
  return { ctx, db: defaultDatabase, sut: ctx.get(SyncRepository).sharedSpaceAlbumAssetExif };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe('SharedSpaceAlbumAssetExifSync.getBackfill', () => {
  it('returns exif rows for assets in the given album', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    await ctx.newExif({ assetId: asset.id, make: 'TestCamera' });

    const stream = sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, album.id);
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    expect(result.map((r: any) => r.assetId)).toContain(asset.id);
  });

  it('does not return exif rows for a different album', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { album: a1 } = await ctx.newAlbum({ ownerId: owner.id });
    const { album: a2 } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: a1.id, assetId: asset.id });
    await ctx.newExif({ assetId: asset.id, make: 'TestCamera' });

    const stream = sut.getBackfill({ nowId: NOW_ID, beforeUpdateId: BEFORE_UPDATE_ID }, a2.id);
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    expect(result).toHaveLength(0);
  });
});

describe('SharedSpaceAlbumAssetExifSync.getCreates', () => {
  it('returns exif rows for album assets accessible via space grant', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    await ctx.newExif({ assetId: asset.id, make: 'TestCamera' });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    const stream = sut.getCreates({ nowId: NOW_ID, userId: member.id });
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    expect(result.map((r: any) => r.assetId)).toContain(asset.id);
  });

  it('does not return exif rows for non-grant-holders', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: stranger } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    await ctx.newExif({ assetId: asset.id, make: 'TestCamera' });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    const stream = sut.getCreates({ nowId: NOW_ID, userId: stranger.id });
    const result: any[] = [];
    for await (const row of stream) {
      result.push(row);
    }
    expect(result.map((r: any) => r.assetId)).not.toContain(asset.id);
  });
});

describe('SharedSpaceAlbumAssetExifSync.getUpdates', () => {
  it('honors albumToAssetAck coupling and returns exif updates for accessible grant holders', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    await ctx.newExif({ assetId: asset.id, make: 'TestCamera' });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    // With max ack — asset is "known", exif updates should come through
    const streamMax = sut.getUpdates({ nowId: NOW_ID, userId: member.id }, { type: SyncEntityType.AlbumToAssetV1, updateId: BEFORE_UPDATE_ID });
    const resultMax: any[] = [];
    for await (const row of streamMax) {
      resultMax.push(row);
    }
    expect(resultMax.map((r: any) => r.assetId)).toContain(asset.id);
  });
});
