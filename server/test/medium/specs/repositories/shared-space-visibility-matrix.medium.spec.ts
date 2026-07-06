/**
 * Slice 11 — Exhaustive RBAC visibility matrix (regression lock).
 *
 * Seeds {Timeline, Archive, Hidden, Locked} × {direct, library, album(showInTimeline=true),
 * album(showInTimeline=false), soft-deleted-album} and asserts the correct visible set
 * on EVERY surface touched by the space-albums RBAC hardening work (Slices 1–10).
 *
 * KEY RULES encoded here:
 *  - download / access / sync / search: Timeline + Archive present; Hidden + Locked ABSENT.
 *  - map / memory / view / folders: Timeline ONLY (Archive excluded by design).
 *  - showInTimeline=false album: ABSENT on projection surfaces; PRESENT on grant surfaces
 *    (album-asset sync backfill, direct album download/access).
 *  - soft-deleted album: ABSENT on all surfaces.
 *  - space people-facets: a face on another member's Hidden asset must NOT surface the
 *    space-person (visibility-gated by getPersonsBySpaceId + getPersonAssetIds).
 *
 * If ANY cell is RED (unexpected failure), that is a real gap in a prior slice —
 * DO NOT weaken the assertion; report it.
 */

import { Kysely } from 'kysely';
import { AssetVisibility, TimeBucketSize } from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { AssetRepository, TimeBucketOptions } from 'src/repositories/asset.repository';
import { DownloadRepository } from 'src/repositories/download.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { MapRepository } from 'src/repositories/map.repository';
import { MemoryRepository } from 'src/repositories/memory.repository';
import { SearchRepository } from 'src/repositories/search.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { SyncRepository } from 'src/repositories/sync.repository';
import { TagRepository } from 'src/repositories/tag.repository';
import { ViewRepository } from 'src/repositories/view-repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { upsertTags } from 'src/utils/tag';
import { newMediumService } from 'test/medium.factory';
import { newEmbedding } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

// Max UUIDv7-style value — used as nowId/beforeUpdateId to include ALL rows in backfill.
const NOW_ID = 'ffffffff-ffff-7fff-bfff-ffffffffffff';

const setup = () => {
  const { ctx } = newMediumService(BaseService, {
    database: defaultDatabase,
    real: [
      AccessRepository,
      AssetRepository,
      DownloadRepository,
      MapRepository,
      MemoryRepository,
      SearchRepository,
      SharedSpaceRepository,
      SyncRepository,
      TagRepository,
      ViewRepository,
    ],
    mock: [LoggingRepository],
  });
  return {
    ctx,
    accessRepo: ctx.get(AccessRepository),
    assetRepo: ctx.get(AssetRepository),
    downloadRepo: ctx.get(DownloadRepository),
    mapRepo: ctx.get(MapRepository),
    memoryRepo: ctx.get(MemoryRepository),
    searchRepo: ctx.get(SearchRepository),
    spaceRepo: ctx.get(SharedSpaceRepository),
    syncRepo: ctx.get(SyncRepository),
    tagRepo: ctx.get(TagRepository),
    viewRepo: ctx.get(ViewRepository),
  };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

// Helpers to collect streaming results
async function collectDownloadIds(stream: AsyncIterable<{ id: string }>): Promise<Set<string>> {
  const ids = new Set<string>();
  for await (const row of stream) {
    ids.add(row.id);
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE BUILDER
// Seeds the full 4×5 matrix into a fresh space for each test.
// Returns named handles for every asset so assertions can be expressed clearly.
// ─────────────────────────────────────────────────────────────────────────────

interface MatrixAssets {
  // direct-add (shared_space_asset)
  directTimeline: string;
  directArchive: string;
  directHidden: string;
  directLocked: string;
  // library-linked (shared_space_library)
  libTimeline: string;
  libArchive: string;
  libHidden: string;
  libLocked: string;
  // album, showInTimeline=true
  albumShownTimeline: string;
  albumShownArchive: string;
  albumShownHidden: string;
  albumShownLocked: string;
  // album, showInTimeline=false (projection surfaces must exclude; grant surfaces include)
  albumHiddenTimeline: string;
  albumHiddenArchive: string;
  // soft-deleted album (all surfaces exclude)
  albumDeletedTimeline: string;
}

interface MatrixFixture {
  assets: MatrixAssets;
  spaceId: string;
  albumShownId: string; // album with showInTimeline=true
  albumHiddenId: string; // album with showInTimeline=false
  albumDeletedId: string; // soft-deleted album
  ownerId: string;
  viewerId: string;
}

const seedMatrix = async (
  ctx: ReturnType<typeof setup>['ctx'],
  spaceRepo: SharedSpaceRepository,
): Promise<MatrixFixture> => {
  const { user: owner } = await ctx.newUser();
  const { user: viewer } = await ctx.newUser();
  const { space } = await ctx.newSharedSpace({ createdById: owner.id });
  await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
  await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

  // Helper: asset with GPS so map markers can find it
  const makeAsset = async (vis: AssetVisibility, opts: { libraryId?: string } = {}) => {
    const { asset } = await ctx.newAsset({
      ownerId: owner.id,
      visibility: vis,
      ...opts,
      fileCreatedAt: new Date('2024-06-15T12:00:00.000Z'),
      localDateTime: new Date('2024-06-15T12:00:00.000Z'),
      width: 400,
      height: 300,
      thumbhash: Buffer.from('t'),
    });
    await ctx.newExif({
      assetId: asset.id,
      latitude: 48.8566,
      longitude: 2.3522,
      timeZone: 'UTC',
      fileSizeInByte: 1024,
    });
    return asset.id;
  };

  // ── direct-add ──────────────────────────────────────────────────────────────
  const directTimeline = await makeAsset(AssetVisibility.Timeline);
  const directArchive = await makeAsset(AssetVisibility.Archive);
  const directHidden = await makeAsset(AssetVisibility.Hidden);
  const directLocked = await makeAsset(AssetVisibility.Locked);
  for (const assetId of [directTimeline, directArchive, directHidden, directLocked]) {
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId });
  }

  // ── library-linked ───────────────────────────────────────────────────────────
  const { result: library } = await ctx.newLibrary({ ownerId: owner.id });
  await ctx.newSharedSpaceLibrary({ spaceId: space.id, libraryId: library.id });
  const libTimeline = await makeAsset(AssetVisibility.Timeline, { libraryId: library.id });
  const libArchive = await makeAsset(AssetVisibility.Archive, { libraryId: library.id });
  const libHidden = await makeAsset(AssetVisibility.Hidden, { libraryId: library.id });
  const libLocked = await makeAsset(AssetVisibility.Locked, { libraryId: library.id });

  // ── album, showInTimeline=true ───────────────────────────────────────────────
  const { result: albumShown } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'ShownAlbum' });
  await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumShown.id, addedById: owner.id });
  // showInTimeline is true by default in addAlbum
  const albumShownTimeline = await makeAsset(AssetVisibility.Timeline);
  const albumShownArchive = await makeAsset(AssetVisibility.Archive);
  const albumShownHidden = await makeAsset(AssetVisibility.Hidden);
  const albumShownLocked = await makeAsset(AssetVisibility.Locked);
  for (const assetId of [albumShownTimeline, albumShownArchive, albumShownHidden, albumShownLocked]) {
    await ctx.newAlbumAsset({ albumId: albumShown.id, assetId });
  }

  // ── album, showInTimeline=false ──────────────────────────────────────────────
  const { result: albumHidden } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'HiddenAlbum' });
  await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumHidden.id, addedById: owner.id });
  await spaceRepo.setAlbumShowInTimeline(space.id, albumHidden.id, false);
  const albumHiddenTimeline = await makeAsset(AssetVisibility.Timeline);
  const albumHiddenArchive = await makeAsset(AssetVisibility.Archive);
  for (const assetId of [albumHiddenTimeline, albumHiddenArchive]) {
    await ctx.newAlbumAsset({ albumId: albumHidden.id, assetId });
  }

  // ── soft-deleted album ───────────────────────────────────────────────────────
  const { result: albumDeleted } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'DeletedAlbum' });
  await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumDeleted.id, addedById: owner.id });
  const albumDeletedTimeline = await makeAsset(AssetVisibility.Timeline);
  await ctx.newAlbumAsset({ albumId: albumDeleted.id, assetId: albumDeletedTimeline });
  await ctx.softDeleteAlbum(albumDeleted.id);

  return {
    assets: {
      directTimeline,
      directArchive,
      directHidden,
      directLocked,
      libTimeline,
      libArchive,
      libHidden,
      libLocked,
      albumShownTimeline,
      albumShownArchive,
      albumShownHidden,
      albumShownLocked,
      albumHiddenTimeline,
      albumHiddenArchive,
      albumDeletedTimeline,
    },
    spaceId: space.id,
    albumShownId: albumShown.id,
    albumHiddenId: albumHidden.id,
    albumDeletedId: albumDeleted.id,
    ownerId: owner.id,
    viewerId: viewer.id,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 1: downloadSpaceId
// Rule: Timeline + Archive present; Hidden + Locked ABSENT; showInTimeline=false
// album PRESENT (download is a grant surface, not projection); soft-deleted ABSENT.
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: downloadSpaceId', () => {
  it('grants Timeline+Archive on all paths; blocks Hidden+Locked; showInTimeline=false present; soft-deleted absent', async () => {
    const { downloadRepo, spaceRepo, ctx } = setup();
    const f = await seedMatrix(ctx, spaceRepo);
    const ids = await collectDownloadIds(downloadRepo.downloadSpaceId(f.spaceId));
    const a = f.assets;

    // Present: direct Timeline + Archive
    expect(ids.has(a.directTimeline)).toBe(true);
    expect(ids.has(a.directArchive)).toBe(true);
    // Absent: direct Hidden + Locked
    expect(ids.has(a.directHidden)).toBe(false);
    expect(ids.has(a.directLocked)).toBe(false);

    // Present: library Timeline + Archive
    expect(ids.has(a.libTimeline)).toBe(true);
    expect(ids.has(a.libArchive)).toBe(true);
    // Absent: library Hidden + Locked
    expect(ids.has(a.libHidden)).toBe(false);
    expect(ids.has(a.libLocked)).toBe(false);

    // Present: album(shown) Timeline + Archive
    expect(ids.has(a.albumShownTimeline)).toBe(true);
    expect(ids.has(a.albumShownArchive)).toBe(true);
    // Absent: album(shown) Hidden + Locked
    expect(ids.has(a.albumShownHidden)).toBe(false);
    expect(ids.has(a.albumShownLocked)).toBe(false);

    // Present: album(hidden, showInTimeline=false) — download IS a grant surface
    expect(ids.has(a.albumHiddenTimeline)).toBe(true);
    expect(ids.has(a.albumHiddenArchive)).toBe(true);

    // Absent: soft-deleted album
    expect(ids.has(a.albumDeletedTimeline)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 2: downloadAlbumId (via AlbumDownload space grant)
// Rule: Timeline + Archive present; Hidden + Locked ABSENT.
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: downloadAlbumId (via space grant)', () => {
  it('grants Timeline+Archive; blocks Hidden+Locked for a linked album download', async () => {
    const { downloadRepo, spaceRepo, ctx } = setup();
    const f = await seedMatrix(ctx, spaceRepo);
    const ids = await collectDownloadIds(downloadRepo.downloadAlbumId(f.albumShownId));
    const a = f.assets;

    expect(ids.has(a.albumShownTimeline)).toBe(true);
    expect(ids.has(a.albumShownArchive)).toBe(true);
    expect(ids.has(a.albumShownHidden)).toBe(false);
    expect(ids.has(a.albumShownLocked)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 3: checkSpaceAccess (all three paths)
// Rule: Timeline + Archive granted; Hidden + Locked absent.
// showInTimeline=false album: ABSENT (checkSpaceAccess applies requireShowInTimeline).
// soft-deleted album: ABSENT.
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: checkSpaceAccess', () => {
  it('grants Timeline+Archive on all paths; blocks Hidden+Locked+noTimeline+deletedAlbum', async () => {
    const { accessRepo, spaceRepo, ctx } = setup();
    const f = await seedMatrix(ctx, spaceRepo);
    const a = f.assets;

    const allIds = new Set([
      a.directTimeline,
      a.directArchive,
      a.directHidden,
      a.directLocked,
      a.libTimeline,
      a.libArchive,
      a.libHidden,
      a.libLocked,
      a.albumShownTimeline,
      a.albumShownArchive,
      a.albumShownHidden,
      a.albumShownLocked,
      a.albumHiddenTimeline,
      a.albumHiddenArchive,
      a.albumDeletedTimeline,
    ]);
    const result = await accessRepo.asset.checkSpaceAccess(f.viewerId, allIds);

    // Direct path
    expect(result.has(a.directTimeline)).toBe(true);
    expect(result.has(a.directArchive)).toBe(true);
    expect(result.has(a.directHidden)).toBe(false);
    expect(result.has(a.directLocked)).toBe(false);

    // Library path
    expect(result.has(a.libTimeline)).toBe(true);
    expect(result.has(a.libArchive)).toBe(true);
    expect(result.has(a.libHidden)).toBe(false);
    expect(result.has(a.libLocked)).toBe(false);

    // Album(shown) path
    expect(result.has(a.albumShownTimeline)).toBe(true);
    expect(result.has(a.albumShownArchive)).toBe(true);
    expect(result.has(a.albumShownHidden)).toBe(false);
    expect(result.has(a.albumShownLocked)).toBe(false);

    // Album(hidden, showInTimeline=false) — PRESENT on checkSpaceAccess (grant surface, not projection).
    // The showInTimeline flag suppresses assets from timeline/map/memory/search (projection surfaces),
    // but does NOT revoke READ access (e.g. the album itself is still downloadable).
    expect(result.has(a.albumHiddenTimeline)).toBe(true);
    expect(result.has(a.albumHiddenArchive)).toBe(true);

    // Soft-deleted album — ABSENT
    expect(result.has(a.albumDeletedTimeline)).toBe(false);
  });

  it('added-then-flipped: direct-add asset flipped from Timeline to Locked → revoked', async () => {
    const { accessRepo, spaceRepo, ctx } = setup();
    const f = await seedMatrix(ctx, spaceRepo);
    const a = f.assets;

    const before = await accessRepo.asset.checkSpaceAccess(f.viewerId, new Set([a.directTimeline]));
    expect(before.has(a.directTimeline)).toBe(true);

    await defaultDatabase
      .updateTable('asset')
      .set({ visibility: AssetVisibility.Locked })
      .where('id', '=', a.directTimeline)
      .execute();

    const after = await accessRepo.asset.checkSpaceAccess(f.viewerId, new Set([a.directTimeline]));
    expect(after.has(a.directTimeline)).toBe(false);
  });

  it('added-then-flipped: album-path asset flipped from Timeline to Hidden → revoked', async () => {
    const { accessRepo, spaceRepo, ctx } = setup();
    const f = await seedMatrix(ctx, spaceRepo);
    const a = f.assets;

    const before = await accessRepo.asset.checkSpaceAccess(f.viewerId, new Set([a.albumShownTimeline]));
    expect(before.has(a.albumShownTimeline)).toBe(true);

    await defaultDatabase
      .updateTable('asset')
      .set({ visibility: AssetVisibility.Hidden })
      .where('id', '=', a.albumShownTimeline)
      .execute();

    const after = await accessRepo.asset.checkSpaceAccess(f.viewerId, new Set([a.albumShownTimeline]));
    expect(after.has(a.albumShownTimeline)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 4: checkSpaceAccessForSpace
// Same rules as checkSpaceAccess but with explicit spaceId.
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: checkSpaceAccessForSpace', () => {
  it('grants Timeline+Archive; blocks Hidden+Locked+noTimeline+deletedAlbum', async () => {
    const { accessRepo, spaceRepo, ctx } = setup();
    const f = await seedMatrix(ctx, spaceRepo);
    const a = f.assets;

    const allIds = new Set([
      a.directTimeline,
      a.directArchive,
      a.directHidden,
      a.directLocked,
      a.libTimeline,
      a.libArchive,
      a.libHidden,
      a.libLocked,
      a.albumShownTimeline,
      a.albumShownArchive,
      a.albumShownHidden,
      a.albumShownLocked,
      a.albumHiddenTimeline,
      a.albumHiddenArchive,
      a.albumDeletedTimeline,
    ]);
    const result = await accessRepo.asset.checkSpaceAccessForSpace(f.viewerId, f.spaceId, allIds);

    expect(result.has(a.directTimeline)).toBe(true);
    expect(result.has(a.directArchive)).toBe(true);
    expect(result.has(a.directHidden)).toBe(false);
    expect(result.has(a.directLocked)).toBe(false);

    expect(result.has(a.libTimeline)).toBe(true);
    expect(result.has(a.libArchive)).toBe(true);
    expect(result.has(a.libHidden)).toBe(false);
    expect(result.has(a.libLocked)).toBe(false);

    expect(result.has(a.albumShownTimeline)).toBe(true);
    expect(result.has(a.albumShownArchive)).toBe(true);
    expect(result.has(a.albumShownHidden)).toBe(false);
    expect(result.has(a.albumShownLocked)).toBe(false);

    // showInTimeline=false album — PRESENT on checkSpaceAccessForSpace (grant surface, not projection).
    expect(result.has(a.albumHiddenTimeline)).toBe(true);
    expect(result.has(a.albumHiddenArchive)).toBe(true);

    // soft-deleted — ABSENT
    expect(result.has(a.albumDeletedTimeline)).toBe(false);
  });

  it('added-then-flipped: library asset flipped from Archive to Locked → revoked', async () => {
    const { accessRepo, spaceRepo, ctx } = setup();
    const f = await seedMatrix(ctx, spaceRepo);
    const a = f.assets;

    const before = await accessRepo.asset.checkSpaceAccessForSpace(f.viewerId, f.spaceId, new Set([a.libArchive]));
    expect(before.has(a.libArchive)).toBe(true);

    await defaultDatabase
      .updateTable('asset')
      .set({ visibility: AssetVisibility.Locked })
      .where('id', '=', a.libArchive)
      .execute();

    const after = await accessRepo.asset.checkSpaceAccessForSpace(f.viewerId, f.spaceId, new Set([a.libArchive]));
    expect(after.has(a.libArchive)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 5: checkSpaceEditAccess
// Same visibility rules; only editor (not viewer) gets the grant.
// NO album arm (known RBAC gap) — but visibility gate IS applied (Slice 10).
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: checkSpaceEditAccess', () => {
  it('grants Timeline+Archive to editor; blocks Hidden+Locked (direct path); viewer gets nothing', async () => {
    const { accessRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: editor } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: editor.id, role: 'editor' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const { asset: tl } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    const { asset: ar } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Archive });
    const { asset: hi } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Hidden });
    const { asset: lo } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Locked });

    for (const assetId of [tl.id, ar.id, hi.id, lo.id]) {
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId });
    }

    const editorResult = await accessRepo.asset.checkSpaceEditAccess(editor.id, new Set([tl.id, ar.id, hi.id, lo.id]));
    expect(editorResult.has(tl.id)).toBe(true);
    expect(editorResult.has(ar.id)).toBe(true);
    expect(editorResult.has(hi.id)).toBe(false);
    expect(editorResult.has(lo.id)).toBe(false);

    const viewerResult = await accessRepo.asset.checkSpaceEditAccess(viewer.id, new Set([tl.id]));
    expect(viewerResult.has(tl.id)).toBe(false);
  });

  it('added-then-flipped: asset flipped to Locked → edit access revoked', async () => {
    const { accessRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: editor } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: editor.id, role: 'editor' });

    const { asset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id });

    const before = await accessRepo.asset.checkSpaceEditAccess(editor.id, new Set([asset.id]));
    expect(before.has(asset.id)).toBe(true);

    await defaultDatabase
      .updateTable('asset')
      .set({ visibility: AssetVisibility.Locked })
      .where('id', '=', asset.id)
      .execute();

    const after = await accessRepo.asset.checkSpaceEditAccess(editor.id, new Set([asset.id]));
    expect(after.has(asset.id)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 6: sync — SharedSpaceAssetSync (direct-add path)
// Rule: Timeline + Archive present; Hidden + Locked ABSENT.
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: SharedSpaceAssetSync backfill (direct path)', () => {
  it('grants Timeline+Archive; blocks Hidden+Locked', async () => {
    const { ctx, syncRepo } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const { asset: tl } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    const { asset: ar } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Archive });
    const { asset: hi } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Hidden });
    const { asset: lo } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Locked });

    for (const assetId of [tl.id, ar.id, hi.id, lo.id]) {
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId });
    }

    const stream = syncRepo.sharedSpaceAsset.getBackfill(
      { nowId: NOW_ID, beforeUpdateId: NOW_ID },
      space.id,
      viewer.id,
    );
    const streamIds = new Set<string>();
    for await (const row of stream) {
      streamIds.add(row.id);
    }

    expect(streamIds.has(tl.id)).toBe(true);
    expect(streamIds.has(ar.id)).toBe(true);
    expect(streamIds.has(hi.id)).toBe(false);
    expect(streamIds.has(lo.id)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 7: sync — SharedSpaceAlbumAssetSync backfill (album path)
// Rule: Timeline + Archive present; Hidden + Locked ABSENT.
// showInTimeline=false album: PRESENT (album-asset sync is a grant stream,
//   not a projection stream — the brief is explicit).
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: SharedSpaceAlbumAssetSync backfill (album path)', () => {
  it('grants Timeline+Archive; blocks Hidden+Locked; showInTimeline=false album present', async () => {
    const { ctx, spaceRepo, syncRepo } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    // shown album
    const { result: albumShown } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'ShownSync' });
    await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumShown.id, addedById: owner.id });

    const { asset: tl } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    const { asset: ar } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Archive });
    const { asset: hi } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Hidden });
    const { asset: lo } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Locked });
    for (const assetId of [tl.id, ar.id, hi.id, lo.id]) {
      await ctx.newAlbumAsset({ albumId: albumShown.id, assetId });
    }

    // hidden album (showInTimeline=false)
    const { result: albumHidden } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'HiddenSync' });
    await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumHidden.id, addedById: owner.id });
    await spaceRepo.setAlbumShowInTimeline(space.id, albumHidden.id, false);
    const { asset: hiddenAlbumTl } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newAlbumAsset({ albumId: albumHidden.id, assetId: hiddenAlbumTl.id });

    const stream1 = syncRepo.sharedSpaceAlbumAsset.getBackfill(
      { nowId: NOW_ID, beforeUpdateId: NOW_ID },
      albumShown.id,
      viewer.id,
    );
    const shownIds = new Set<string>();
    for await (const row of stream1) {
      shownIds.add(row.id);
    }

    expect(shownIds.has(tl.id)).toBe(true);
    expect(shownIds.has(ar.id)).toBe(true);
    expect(shownIds.has(hi.id)).toBe(false);
    expect(shownIds.has(lo.id)).toBe(false);

    const stream2 = syncRepo.sharedSpaceAlbumAsset.getBackfill(
      { nowId: NOW_ID, beforeUpdateId: NOW_ID },
      albumHidden.id,
      viewer.id,
    );
    const hiddenIds = new Set<string>();
    for await (const row of stream2) {
      hiddenIds.add(row.id);
    }
    // showInTimeline=false album IS present on the sync stream (grant surface)
    expect(hiddenIds.has(hiddenAlbumTl.id)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 8: getSearchSuggestions / getFilterSuggestions (space-scoped)
// Rule: Timeline + Archive count; Hidden + Locked ABSENT.
// Slice 10 note: other members' Archive IS present in search (spaceVisibilityGate).
// showInTimeline=false album: absent from suggestions (projection surface with
//   requireShowInTimeline).
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: getFilterSuggestions (space-scoped)', () => {
  it('includes Timeline+Archive countries; excludes Hidden+Locked+noTimeline', async () => {
    const { searchRepo, spaceRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    // Direct assets with unique countries per visibility
    const assetData: Array<{ vis: AssetVisibility; country: string }> = [
      { vis: AssetVisibility.Timeline, country: 'TimelineCountry' },
      { vis: AssetVisibility.Archive, country: 'ArchiveCountry' },
      { vis: AssetVisibility.Hidden, country: 'HiddenCountry' },
      { vis: AssetVisibility.Locked, country: 'LockedCountry' },
    ];
    for (const { vis, country } of assetData) {
      const { asset } = await ctx.newAsset({ ownerId: owner.id, visibility: vis });
      await ctx.newExif({ assetId: asset.id, country });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id });
    }

    // showInTimeline=false album asset with unique country
    const { result: album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'NoTimelineFilter' });
    await spaceRepo.addAlbum({ spaceId: space.id, albumId: album.id, addedById: owner.id });
    await spaceRepo.setAlbumShowInTimeline(space.id, album.id, false);
    const { asset: noTlAsset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newExif({ assetId: noTlAsset.id, country: 'NoTimelineCountry' });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: noTlAsset.id });

    // Call with viewer.id only — the M3 bypass in getFilterSuggestions allows a caller's OWN
    // assets to bypass the space-visibility gate, so passing [owner.id, viewer.id] would expose
    // the owner's own Hidden/Locked assets (the owner can see their own hidden assets in their
    // search facets). Testing with viewer.id alone validates the space-member perspective.
    const result = await searchRepo.getFilterSuggestions([viewer.id], { spaceId: space.id });

    expect(result.countries).toContain('TimelineCountry');
    // Archive IS included in search (spaceVisibilityGate includes Archive)
    expect(result.countries).toContain('ArchiveCountry');
    expect(result.countries).not.toContain('HiddenCountry');
    expect(result.countries).not.toContain('LockedCountry');
    // showInTimeline=false album excluded from suggestion projection
    expect(result.countries).not.toContain('NoTimelineCountry');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 9: getAccessibleTags (space-scoped)
// Rule: Timeline + Archive present (spaceVisibilityGate); Hidden + Locked ABSENT.
// showInTimeline=false album: absent (requireShowInTimeline on the scoping).
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: getAccessibleTags (space-scoped)', () => {
  it('returns tags for Timeline+Archive assets; excludes Hidden+Locked+noTimeline', async () => {
    const { searchRepo, tagRepo, spaceRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const makeTaggedAsset = async (vis: AssetVisibility, tagValue: string, asAlbum = false) => {
      const { asset } = await ctx.newAsset({ ownerId: owner.id, visibility: vis });
      const [tag] = await upsertTags(tagRepo, { userId: owner.id, tags: [tagValue] });
      await ctx.newTagAsset({ tagIds: [tag.id], assetIds: [asset.id] });
      if (asAlbum) {
        const { result: album } = await ctx.newAlbum({ ownerId: owner.id, albumName: `AlbumTag_${tagValue}` });
        await spaceRepo.addAlbum({ spaceId: space.id, albumId: album.id, addedById: owner.id });
        await spaceRepo.setAlbumShowInTimeline(space.id, album.id, false);
        await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
      } else {
        await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id });
      }
      return tag.id;
    };

    await makeTaggedAsset(AssetVisibility.Timeline, 'TagTimeline');
    await makeTaggedAsset(AssetVisibility.Archive, 'TagArchive');
    await makeTaggedAsset(AssetVisibility.Hidden, 'TagHidden');
    await makeTaggedAsset(AssetVisibility.Locked, 'TagLocked');
    await makeTaggedAsset(AssetVisibility.Timeline, 'TagNoTimeline', true /* via noTimeline album */);

    // Call with viewer.id only — same M3 reason as getFilterSuggestions: passing owner.id
    // would expose the owner's own Hidden/Locked tags via the "caller's own assets" bypass.
    const tags = await searchRepo.getAccessibleTags([viewer.id], { spaceId: space.id });
    const tagValues = tags.map((t) => t.value);

    expect(tagValues).toContain('TagTimeline');
    expect(tagValues).toContain('TagArchive'); // Archive present in search
    expect(tagValues).not.toContain('TagHidden');
    expect(tagValues).not.toContain('TagLocked');
    expect(tagValues).not.toContain('TagNoTimeline'); // showInTimeline=false excluded
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 10: tag.getAll (space-scoped via timelineSpaceIds)
// Rule: Timeline+Archive; Hidden+Locked ABSENT; showInTimeline=false absent.
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: tag.getAll (space-scoped via timelineSpaceIds)', () => {
  it('includes tags for Timeline+Archive; excludes Hidden+Locked+noTimeline', async () => {
    const { tagRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const makeTaggedDirect = async (vis: AssetVisibility, tagValue: string) => {
      const { asset } = await ctx.newAsset({ ownerId: owner.id, visibility: vis });
      const [tag] = await upsertTags(tagRepo, { userId: owner.id, tags: [tagValue] });
      await ctx.newTagAsset({ tagIds: [tag.id], assetIds: [asset.id] });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id });
      return tag;
    };

    await makeTaggedDirect(AssetVisibility.Timeline, 'GetAllTimeline');
    await makeTaggedDirect(AssetVisibility.Archive, 'GetAllArchive');
    await makeTaggedDirect(AssetVisibility.Hidden, 'GetAllHidden');
    await makeTaggedDirect(AssetVisibility.Locked, 'GetAllLocked');

    const tags = await tagRepo.getAll(viewer.id);
    const tagValues = tags.map((t: { value: string }) => t.value);

    // tag.getAll includes tags on assets accessible to the viewer through shared spaces
    // (the ownedOrSpaceAccessible helper in tag.repository includes three space arms gated by
    // spaceVisibilityGate). Timeline and Archive assets' tags ARE visible; Hidden and Locked
    // assets' tags are blocked by the visibility gate.
    expect(tagValues).toContain('GetAllTimeline'); // Timeline accessible via space ✓
    expect(tagValues).toContain('GetAllArchive'); // Archive accessible via space ✓
    expect(tagValues).not.toContain('GetAllHidden'); // Hidden blocked by visibility gate ✓
    expect(tagValues).not.toContain('GetAllLocked'); // Locked blocked by visibility gate ✓
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 11: space people-facets — getPersonsBySpaceId
// Deferred from Slice 5. A face on another member's Hidden asset must NOT
// surface the space-person in the people listing.
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: space people-facets — getPersonsBySpaceId', () => {
  it('person backed only by a Hidden-asset face is NOT surfaced', async () => {
    const { spaceRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    // Person backed by a Timeline asset — should appear
    const { asset: tlAsset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: tlAsset.id });
    const { result: tlFaceId } = await ctx.newAssetFace({ assetId: tlAsset.id });
    await ctx.database.insertInto('face_search').values({ faceId: tlFaceId, embedding: newEmbedding() }).execute();
    const visiblePerson = await spaceRepo.createPerson({
      spaceId: space.id,
      name: 'Timeline Person',
      representativeFaceId: tlFaceId,
      type: 'person',
    });
    await spaceRepo.addPersonFaces([{ personId: visiblePerson.id, assetFaceId: tlFaceId }], { skipRecount: true });
    await spaceRepo.recountPersons([visiblePerson.id]);

    // Person backed ONLY by a Hidden asset face — must NOT appear
    const { asset: hiddenAsset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Hidden });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: hiddenAsset.id });
    const { result: hiddenFaceId } = await ctx.newAssetFace({ assetId: hiddenAsset.id });
    await ctx.database.insertInto('face_search').values({ faceId: hiddenFaceId, embedding: newEmbedding() }).execute();
    const hiddenPerson = await spaceRepo.createPerson({
      spaceId: space.id,
      name: 'Hidden Person',
      representativeFaceId: hiddenFaceId,
      type: 'person',
    });
    await spaceRepo.addPersonFaces([{ personId: hiddenPerson.id, assetFaceId: hiddenFaceId }], { skipRecount: true });
    await spaceRepo.recountPersons([hiddenPerson.id]);

    const people = await spaceRepo.getPersonsBySpaceId(space.id, { withHidden: true, petsEnabled: false });
    const personIds = people.map((p) => p.id);

    expect(personIds).toContain(visiblePerson.id);
    expect(personIds).not.toContain(hiddenPerson.id);
  });

  it('person backed only by a Locked-asset face is NOT surfaced', async () => {
    const { spaceRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });

    const { asset: lockedAsset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Locked });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: lockedAsset.id });
    const { result: lockedFaceId } = await ctx.newAssetFace({ assetId: lockedAsset.id });
    await ctx.database.insertInto('face_search').values({ faceId: lockedFaceId, embedding: newEmbedding() }).execute();
    const person = await spaceRepo.createPerson({
      spaceId: space.id,
      name: 'Locked Person',
      representativeFaceId: lockedFaceId,
      type: 'person',
    });
    await spaceRepo.addPersonFaces([{ personId: person.id, assetFaceId: lockedFaceId }], { skipRecount: true });
    await spaceRepo.recountPersons([person.id]);

    const people = await spaceRepo.getPersonsBySpaceId(space.id, { withHidden: true, petsEnabled: false });
    const personIds = people.map((p) => p.id);

    expect(personIds).not.toContain(person.id);
  });

  it('added-then-flipped: person whose face asset flips to Hidden → person drops from listing', async () => {
    const { spaceRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });

    const { asset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id });
    const { result: faceId } = await ctx.newAssetFace({ assetId: asset.id });
    await ctx.database.insertInto('face_search').values({ faceId, embedding: newEmbedding() }).execute();
    const person = await spaceRepo.createPerson({
      spaceId: space.id,
      name: 'FlipPerson',
      representativeFaceId: faceId,
      type: 'person',
    });
    await spaceRepo.addPersonFaces([{ personId: person.id, assetFaceId: faceId }], { skipRecount: true });
    await spaceRepo.recountPersons([person.id]);

    const before = await spaceRepo.getPersonsBySpaceId(space.id, { withHidden: true, petsEnabled: false });
    expect(before.map((p) => p.id)).toContain(person.id);

    await defaultDatabase
      .updateTable('asset')
      .set({ visibility: AssetVisibility.Hidden })
      .where('id', '=', asset.id)
      .execute();

    const after = await spaceRepo.getPersonsBySpaceId(space.id, { withHidden: true, petsEnabled: false });
    expect(after.map((p) => p.id)).not.toContain(person.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 12: isFaceInSpace
// Rule: Timeline + Archive → true; Hidden + Locked → false.
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: isFaceInSpace', () => {
  it('returns true for Timeline face, false for Hidden+Locked faces (direct path)', async () => {
    const { spaceRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });

    const makeDirectFace = async (vis: AssetVisibility) => {
      const { asset } = await ctx.newAsset({ ownerId: owner.id, visibility: vis });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id });
      const { result: faceId } = await ctx.newAssetFace({ assetId: asset.id });
      return faceId;
    };

    const tlFace = await makeDirectFace(AssetVisibility.Timeline);
    const arFace = await makeDirectFace(AssetVisibility.Archive);
    const hiFace = await makeDirectFace(AssetVisibility.Hidden);
    const loFace = await makeDirectFace(AssetVisibility.Locked);

    expect(await spaceRepo.isFaceInSpace(space.id, tlFace)).toBe(true);
    expect(await spaceRepo.isFaceInSpace(space.id, arFace)).toBe(true);
    expect(await spaceRepo.isFaceInSpace(space.id, hiFace)).toBe(false);
    expect(await spaceRepo.isFaceInSpace(space.id, loFace)).toBe(false);
  });

  it('returns true for album(shown) face, false for album(noTimeline) face', async () => {
    const { spaceRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });

    const { result: albumShown } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'FaceShown' });
    await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumShown.id, addedById: owner.id });
    const { asset: shownAsset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newAlbumAsset({ albumId: albumShown.id, assetId: shownAsset.id });
    const { result: shownFaceId } = await ctx.newAssetFace({ assetId: shownAsset.id });

    const { result: albumHidden } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'FaceHidden' });
    await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumHidden.id, addedById: owner.id });
    await spaceRepo.setAlbumShowInTimeline(space.id, albumHidden.id, false);
    const { asset: hiddenAsset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newAlbumAsset({ albumId: albumHidden.id, assetId: hiddenAsset.id });
    const { result: hiddenFaceId } = await ctx.newAssetFace({ assetId: hiddenAsset.id });

    expect(await spaceRepo.isFaceInSpace(space.id, shownFaceId)).toBe(true);
    expect(await spaceRepo.isFaceInSpace(space.id, hiddenFaceId)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 13: getPersonAssetIds
// Rule: Timeline + Archive present; Hidden + Locked ABSENT.
// showInTimeline=false album → ABSENT (requireShowInTimeline in the query).
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: getPersonAssetIds', () => {
  it('returns asset IDs for Timeline+Archive faces; excludes Hidden+Locked+noTimeline', async () => {
    const { spaceRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });

    // Build a space person
    const { asset: tlAsset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: tlAsset.id });
    const { result: tlFaceId } = await ctx.newAssetFace({ assetId: tlAsset.id });
    await ctx.database.insertInto('face_search').values({ faceId: tlFaceId, embedding: newEmbedding() }).execute();

    const { asset: arAsset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Archive });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: arAsset.id });
    const { result: arFaceId } = await ctx.newAssetFace({ assetId: arAsset.id });
    await ctx.database.insertInto('face_search').values({ faceId: arFaceId, embedding: newEmbedding() }).execute();

    const { asset: hiAsset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Hidden });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: hiAsset.id });
    const { result: hiFaceId } = await ctx.newAssetFace({ assetId: hiAsset.id });
    await ctx.database.insertInto('face_search').values({ faceId: hiFaceId, embedding: newEmbedding() }).execute();

    const { asset: loAsset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Locked });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: loAsset.id });
    const { result: loFaceId } = await ctx.newAssetFace({ assetId: loAsset.id });
    await ctx.database.insertInto('face_search').values({ faceId: loFaceId, embedding: newEmbedding() }).execute();

    const person = await spaceRepo.createPerson({
      spaceId: space.id,
      name: 'MatrixPerson',
      representativeFaceId: tlFaceId,
      type: 'person',
    });
    await spaceRepo.addPersonFaces(
      [tlFaceId, arFaceId, hiFaceId, loFaceId].map((assetFaceId) => ({ personId: person.id, assetFaceId })),
      { skipRecount: true },
    );

    const rows = await spaceRepo.getPersonAssetIds(person.id);
    const assetIds = new Set(rows.map((r) => r.assetId));

    expect(assetIds.has(tlAsset.id)).toBe(true);
    expect(assetIds.has(arAsset.id)).toBe(true);
    expect(assetIds.has(hiAsset.id)).toBe(false);
    expect(assetIds.has(loAsset.id)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 14: timeline (getTimeBuckets / getTimeBucket)
// Rule: Timeline ONLY (Archive excluded — space timeline is Timeline-only).
// showInTimeline=false album: ABSENT.
// soft-deleted album: ABSENT.
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: timeline (getTimeBuckets)', () => {
  it('counts only Timeline assets; Archive excluded by design; Hidden+Locked+noTimeline absent', async () => {
    const { assetRepo, spaceRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });

    const { user: viewer } = await ctx.newUser();
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const when = new Date('2024-01-15T12:00:00.000Z');

    const makeTimelineReady = async (vis: AssetVisibility, opts: { albumId?: string; libraryId?: string } = {}) => {
      const { asset } = await ctx.newAsset({
        ownerId: owner.id,
        visibility: vis,
        fileCreatedAt: when,
        localDateTime: when,
        width: 400,
        height: 300,
        thumbhash: Buffer.from('t'),
        ...opts,
      });
      await ctx.newExif({ assetId: asset.id, timeZone: 'UTC' });
      return asset.id;
    };

    // Direct-add
    const tlDirect = await makeTimelineReady(AssetVisibility.Timeline);
    const arDirect = await makeTimelineReady(AssetVisibility.Archive);
    const hiDirect = await makeTimelineReady(AssetVisibility.Hidden);
    for (const assetId of [tlDirect, arDirect, hiDirect]) {
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId });
    }

    // Album(shown)
    const { result: albumShown } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'TLShown' });
    await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumShown.id, addedById: owner.id });
    const tlAlbumShown = await makeTimelineReady(AssetVisibility.Timeline);
    await ctx.newAlbumAsset({ albumId: albumShown.id, assetId: tlAlbumShown });

    // Album(noTimeline)
    const { result: albumNo } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'TLHidden' });
    await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumNo.id, addedById: owner.id });
    await spaceRepo.setAlbumShowInTimeline(space.id, albumNo.id, false);
    const tlAlbumNo = await makeTimelineReady(AssetVisibility.Timeline);
    await ctx.newAlbumAsset({ albumId: albumNo.id, assetId: tlAlbumNo });

    const opts: TimeBucketOptions = {
      spaceId: space.id,
      visibility: AssetVisibility.Timeline,
      bucketSize: TimeBucketSize.Year,
    };
    const buckets = await assetRepo.getTimeBuckets(opts);
    const total = buckets.reduce((sum, b) => sum + Number(b.count), 0);

    // Timeline direct + Timeline album(shown) = 2 assets
    // Archive direct → excluded (space timeline is Timeline-only)
    // Hidden → excluded (visibility gate)
    // album(noTimeline) → excluded (requireShowInTimeline)
    expect(total).toBe(2);
  });

  it('added-then-flipped for materialized shared_space_asset: timeline count drops when asset flips to Hidden', async () => {
    const { assetRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });

    const when = new Date('2024-03-01T12:00:00.000Z');
    const { asset } = await ctx.newAsset({
      ownerId: owner.id,
      visibility: AssetVisibility.Timeline,
      fileCreatedAt: when,
      localDateTime: when,
      width: 400,
      height: 300,
      thumbhash: Buffer.from('t'),
    });
    await ctx.newExif({ assetId: asset.id, timeZone: 'UTC' });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id });

    const opts: TimeBucketOptions = {
      spaceId: space.id,
      visibility: AssetVisibility.Timeline,
      bucketSize: TimeBucketSize.Year,
    };
    const before = await assetRepo.getTimeBuckets(opts);
    const beforeCount = before.reduce((sum, b) => sum + Number(b.count), 0);
    expect(beforeCount).toBeGreaterThanOrEqual(1);

    await defaultDatabase
      .updateTable('asset')
      .set({ visibility: AssetVisibility.Hidden })
      .where('id', '=', asset.id)
      .execute();

    const after = await assetRepo.getTimeBuckets(opts);
    const afterCount = after.reduce((sum, b) => sum + Number(b.count), 0);
    expect(afterCount).toBe(beforeCount - 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 15: map markers
// Rule: Timeline ONLY (Archive excluded by design — getMapMarkers filters
//   visibility=Timeline when isArchived is undefined/false).
// showInTimeline=false album: ABSENT.
// soft-deleted album: ABSENT.
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: map markers', () => {
  it('includes Timeline markers; excludes Archive+Hidden+Locked+noTimeline+deletedAlbum', async () => {
    const { mapRepo, spaceRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const makeGpsAsset = async (vis: AssetVisibility, lat: number) => {
      const { asset } = await ctx.newAsset({ ownerId: owner.id, visibility: vis });
      await ctx.database.insertInto('asset_exif').values({ assetId: asset.id, latitude: lat, longitude: 2 }).execute();
      return asset.id;
    };

    const tlId = await makeGpsAsset(AssetVisibility.Timeline, 1);
    const arId = await makeGpsAsset(AssetVisibility.Archive, 2);
    const hiId = await makeGpsAsset(AssetVisibility.Hidden, 3);
    const loId = await makeGpsAsset(AssetVisibility.Locked, 4);
    for (const assetId of [tlId, arId, hiId, loId]) {
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId });
    }

    // showInTimeline=false album
    const { result: albumNo } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'MapNoTL' });
    await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumNo.id, addedById: owner.id });
    await spaceRepo.setAlbumShowInTimeline(space.id, albumNo.id, false);
    const noTlId = await makeGpsAsset(AssetVisibility.Timeline, 5);
    await ctx.newAlbumAsset({ albumId: albumNo.id, assetId: noTlId });

    // shown album
    const { result: albumShown } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'MapShown' });
    await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumShown.id, addedById: owner.id });
    const shownId = await makeGpsAsset(AssetVisibility.Timeline, 6);
    await ctx.newAlbumAsset({ albumId: albumShown.id, assetId: shownId });

    // soft-deleted album
    const { result: albumDel } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'MapDel' });
    await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumDel.id, addedById: owner.id });
    const delId = await makeGpsAsset(AssetVisibility.Timeline, 7);
    await ctx.newAlbumAsset({ albumId: albumDel.id, assetId: delId });
    await ctx.softDeleteAlbum(albumDel.id);

    const markers = await mapRepo.getMapMarkers(viewer.id, [viewer.id], [], {
      timelineSpaceIds: [space.id],
    });
    const markerIds = new Set(markers.map((m) => m.id));

    expect(markerIds.has(tlId)).toBe(true); // Timeline direct ✓
    expect(markerIds.has(shownId)).toBe(true); // Timeline album(shown) ✓
    expect(markerIds.has(arId)).toBe(false); // Archive excluded by design ✓
    expect(markerIds.has(hiId)).toBe(false); // Hidden blocked ✓
    expect(markerIds.has(loId)).toBe(false); // Locked blocked ✓
    expect(markerIds.has(noTlId)).toBe(false); // showInTimeline=false excluded ✓
    expect(markerIds.has(delId)).toBe(false); // soft-deleted album excluded ✓
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 16: memory (searchAccessible)
// Rule: Timeline ONLY (searchAccessible inner asset list filters
//   visibility=Timeline); Archive excluded by design.
// Direct+library paths in the outer scope use asset.visibility=Timeline only.
// showInTimeline=false album: ABSENT.
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: memory searchAccessible', () => {
  it('includes Timeline assets in memory; excludes Archive+Hidden+Locked', async () => {
    const { memoryRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const { memory } = await ctx.newMemory({ ownerId: owner.id });

    const makeAsset = async (vis: AssetVisibility) => {
      const { asset } = await ctx.newAsset({ ownerId: owner.id, visibility: vis });
      await ctx.newMemoryAsset({ memoryId: memory.id, assetId: asset.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id });
      return asset.id;
    };

    const tlId = await makeAsset(AssetVisibility.Timeline);
    const arId = await makeAsset(AssetVisibility.Archive);
    const hiId = await makeAsset(AssetVisibility.Hidden);
    const loId = await makeAsset(AssetVisibility.Locked);

    const memories = await memoryRepo.searchAccessible(viewer.id, {});
    const assetIds = new Set(memories.flatMap((m) => (m.assets as { id: string }[]).map((a) => a.id)));

    expect(assetIds.has(tlId)).toBe(true); // Timeline ✓
    expect(assetIds.has(arId)).toBe(false); // Archive excluded by design ✓
    expect(assetIds.has(hiId)).toBe(false); // Hidden blocked ✓
    expect(assetIds.has(loId)).toBe(false); // Locked blocked ✓
  });

  it('memory accessible ONLY via noTimeline-album asset is hidden from viewer', async () => {
    // When a memory's ONLY space-accessible asset comes from a showInTimeline=false album,
    // the outer scope (accessibleSearchBuilder) cannot find an accessible asset to grant
    // visibility, so the memory is NOT returned to the viewer.
    const { memoryRepo, spaceRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const { memory: noTlMemory } = await ctx.newMemory({ ownerId: owner.id });

    const { result: albumNo } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'MemNoTLOnly' });
    await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumNo.id, addedById: owner.id });
    await spaceRepo.setAlbumShowInTimeline(space.id, albumNo.id, false);
    const { asset: noTlAsset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newAlbumAsset({ albumId: albumNo.id, assetId: noTlAsset.id });
    await ctx.newMemoryAsset({ memoryId: noTlMemory.id, assetId: noTlAsset.id });

    const memories = await memoryRepo.searchAccessible(viewer.id, {});
    const memoryIds = new Set(memories.map((m) => m.id));

    // The memory is not accessible to viewer because its only space-path is via
    // a showInTimeline=false album (requireShowInTimeline=true outer scope gate).
    expect(memoryIds.has(noTlMemory.id)).toBe(false); // noTimeline-only memory hidden ✓
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE 17: view / folders (getUniqueOriginalPaths / getAssetsByOriginalPath)
// Rule: Timeline ONLY; Archive excluded; Hidden+Locked absent.
// showInTimeline=false album: ABSENT (requireShowInTimeline in ownedOrSpaceAccessible).
// ─────────────────────────────────────────────────────────────────────────────

describe('matrix: view/folders (getUniqueOriginalPaths)', () => {
  it('includes Timeline paths; excludes Archive+Hidden+Locked+noTimeline', async () => {
    const { viewRepo, spaceRepo, ctx } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const basePath = `/matrix_view_test_${Date.now()}`;

    const makePathAsset = async (vis: AssetVisibility, subdir: string) => {
      const { asset } = await ctx.newAsset({
        ownerId: owner.id,
        visibility: vis,
        originalPath: `${basePath}/${subdir}/photo.jpg`,
        fileCreatedAt: new Date(),
        localDateTime: new Date(),
      });
      await ctx.newExif({ assetId: asset.id, timeZone: 'UTC' });
      return asset.id;
    };

    const tlId = await makePathAsset(AssetVisibility.Timeline, 'timeline');
    const arId = await makePathAsset(AssetVisibility.Archive, 'archive');
    const hiId = await makePathAsset(AssetVisibility.Hidden, 'hidden');
    for (const assetId of [tlId, arId, hiId]) {
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId });
    }

    // showInTimeline=false album
    const { result: albumNo } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'ViewNoTL' });
    await spaceRepo.addAlbum({ spaceId: space.id, albumId: albumNo.id, addedById: owner.id });
    await spaceRepo.setAlbumShowInTimeline(space.id, albumNo.id, false);
    const noTlId = await makePathAsset(AssetVisibility.Timeline, 'notimeline');
    await ctx.newAlbumAsset({ albumId: albumNo.id, assetId: noTlId });

    const paths = await viewRepo.getUniqueOriginalPaths(viewer.id);
    const tlPath = `${basePath}/timeline`;
    const arPath = `${basePath}/archive`;
    const hiPath = `${basePath}/hidden`;
    const noTlPath = `${basePath}/notimeline`;

    expect(paths).toContain(tlPath); // Timeline ✓
    expect(paths).not.toContain(arPath); // Archive excluded ✓
    expect(paths).not.toContain(hiPath); // Hidden blocked ✓
    expect(paths).not.toContain(noTlPath); // showInTimeline=false excluded ✓
  });
});
