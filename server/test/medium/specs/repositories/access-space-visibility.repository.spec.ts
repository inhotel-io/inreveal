/**
 * Medium tests for `AccessRepository.asset.checkSpaceAccess` — visibility filter (Slice 3).
 *
 * Security requirement: space-membership asset access via any path (direct /
 * library / album) must only expose assets whose visibility is `Timeline` or
 * `Archive`. `Hidden` and `Locked` are NEVER exposed through the space gate.
 *
 * Each test seeds a clean context so there is no shared-state cross-contamination.
 */
import { Kysely } from 'kysely';
import { AssetVisibility } from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

const setup = () => {
  const { ctx } = newMediumService(BaseService, {
    database: defaultDatabase,
    real: [AccessRepository, SharedSpaceRepository],
    mock: [LoggingRepository],
  });
  return { ctx, accessRepo: ctx.get(AccessRepository) };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

// ---------------------------------------------------------------------------
// Path 1 — direct add (shared_space_asset)
// ---------------------------------------------------------------------------

describe('checkSpaceAccess — direct path visibility gate', () => {
  it('grants Timeline and Archive assets; blocks Hidden and Locked', async () => {
    const { ctx, accessRepo } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const { asset: timeline } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    const { asset: archive } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Archive });
    const { asset: hidden } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Hidden });
    const { asset: locked } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Locked });

    for (const assetId of [timeline.id, archive.id, hidden.id, locked.id]) {
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId });
    }

    const result = await accessRepo.asset.checkSpaceAccess(
      viewer.id,
      new Set([timeline.id, archive.id, hidden.id, locked.id]),
    );

    expect(result.has(timeline.id)).toBe(true);
    expect(result.has(archive.id)).toBe(true);
    expect(result.has(hidden.id)).toBe(false);
    expect(result.has(locked.id)).toBe(false);
  });

  it('added-then-locked: asset added while Timeline, later flipped to Locked → excluded at read time', async () => {
    const { ctx, accessRepo } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    // Asset starts as Timeline → shared_space_asset row created
    const { asset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id });

    // Before flip: readable
    const before = await accessRepo.asset.checkSpaceAccess(viewer.id, new Set([asset.id]));
    expect(before.has(asset.id)).toBe(true);

    // Flip to Locked (the shared_space_asset row remains)
    await defaultDatabase
      .updateTable('asset')
      .set({ visibility: AssetVisibility.Locked })
      .where('id', '=', asset.id)
      .execute();

    // After flip: blocked despite the surviving space row
    const after = await accessRepo.asset.checkSpaceAccess(viewer.id, new Set([asset.id]));
    expect(after.has(asset.id)).toBe(false);
  });

  it('livePhotoVideoId: Locked parent → video part is NOT granted via livePhotoVideoId', async () => {
    const { ctx, accessRepo } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    // Video asset (no visibility restriction itself — it's the *parent* that is Locked)
    const { asset: video } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });

    // Locked parent that references the video via livePhotoVideoId
    const { asset: parent } = await ctx.newAsset({
      ownerId: owner.id,
      visibility: AssetVisibility.Locked,
      livePhotoVideoId: video.id,
    });

    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: parent.id });

    // Ask for the video ID — the only route is via the Locked parent's livePhotoVideoId
    const result = await accessRepo.asset.checkSpaceAccess(viewer.id, new Set([video.id]));
    expect(result.has(video.id)).toBe(false);
  });

  it('own Locked asset is NOT over-blocked: checkOwnerAccess grants it; checkSpaceAccess is orthogonal', async () => {
    // checkOwnerAccess runs BEFORE checkSpaceAccess in access.ts. This test confirms
    // that checkSpaceAccess returning empty for a Locked asset does NOT "un-grant" what
    // checkOwnerAccess already granted (the two paths are additive via setUnion).
    // We verify the gate function itself is orthogonal: as an *owner* calling
    // checkSpaceAccess (not checkOwnerAccess), the Locked asset is still excluded.
    // The real over-block risk is that we might accidentally strip already-granted IDs —
    // but since access.ts uses setDifference to feed checkSpaceAccess only the IDs not
    // yet granted, there is no double-dip. We pin this explicitly.
    const { ctx, accessRepo } = setup();
    const { user: owner } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });

    const { asset: locked } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Locked });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: locked.id });

    // checkSpaceAccess excludes Locked even for the owner — the owner's OWN read
    // comes from checkOwnerAccess (hasElevatedPermission), not from checkSpaceAccess.
    const spaceResult = await accessRepo.asset.checkSpaceAccess(owner.id, new Set([locked.id]));
    expect(spaceResult.has(locked.id)).toBe(false);

    // checkOwnerAccess with elevation grants it (confirming the real path is untouched)
    const ownerResult = await accessRepo.asset.checkOwnerAccess(owner.id, new Set([locked.id]), true);
    expect(ownerResult.has(locked.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Path 2 — library (shared_space_library)
// ---------------------------------------------------------------------------

describe('checkSpaceAccess — library path visibility gate', () => {
  it('grants Timeline and Archive; blocks Hidden and Locked from a linked library', async () => {
    const { ctx, accessRepo } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const { library } = await ctx.newLibrary({ ownerId: owner.id });
    await ctx.newSharedSpaceLibrary({ spaceId: space.id, libraryId: library.id });

    const { asset: timeline } = await ctx.newAsset({
      ownerId: owner.id,
      libraryId: library.id,
      visibility: AssetVisibility.Timeline,
    });
    const { asset: archive } = await ctx.newAsset({
      ownerId: owner.id,
      libraryId: library.id,
      visibility: AssetVisibility.Archive,
    });
    const { asset: hidden } = await ctx.newAsset({
      ownerId: owner.id,
      libraryId: library.id,
      visibility: AssetVisibility.Hidden,
    });
    const { asset: locked } = await ctx.newAsset({
      ownerId: owner.id,
      libraryId: library.id,
      visibility: AssetVisibility.Locked,
    });

    const result = await accessRepo.asset.checkSpaceAccess(
      viewer.id,
      new Set([timeline.id, archive.id, hidden.id, locked.id]),
    );

    expect(result.has(timeline.id)).toBe(true);
    expect(result.has(archive.id)).toBe(true);
    expect(result.has(hidden.id)).toBe(false);
    expect(result.has(locked.id)).toBe(false);
  });

  it('isOffline=true library asset is excluded regardless of visibility', async () => {
    const { ctx, accessRepo } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const { library } = await ctx.newLibrary({ ownerId: owner.id });
    await ctx.newSharedSpaceLibrary({ spaceId: space.id, libraryId: library.id });

    const { asset: offlineTimeline } = await ctx.newAsset({
      ownerId: owner.id,
      libraryId: library.id,
      visibility: AssetVisibility.Timeline,
      isOffline: true,
    });

    const result = await accessRepo.asset.checkSpaceAccess(viewer.id, new Set([offlineTimeline.id]));
    expect(result.has(offlineTimeline.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Path 3 — album (shared_space_album)
// ---------------------------------------------------------------------------

describe('checkSpaceAccess — album path visibility gate', () => {
  it('grants Timeline and Archive; blocks Hidden and Locked from a linked album', async () => {
    const { ctx, accessRepo } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const { result: album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'VisibilityTestAlbum' });
    await ctx.get(SharedSpaceRepository).addAlbum({ spaceId: space.id, albumId: album.id, addedById: owner.id });

    const { asset: timeline } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    const { asset: archive } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Archive });
    const { asset: hidden } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Hidden });
    const { asset: locked } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Locked });

    for (const assetId of [timeline.id, archive.id, hidden.id, locked.id]) {
      await ctx.newAlbumAsset({ albumId: album.id, assetId });
    }

    const result = await accessRepo.asset.checkSpaceAccess(
      viewer.id,
      new Set([timeline.id, archive.id, hidden.id, locked.id]),
    );

    expect(result.has(timeline.id)).toBe(true);
    expect(result.has(archive.id)).toBe(true);
    expect(result.has(hidden.id)).toBe(false);
    expect(result.has(locked.id)).toBe(false);
  });

  it('soft-deleted album assets are excluded', async () => {
    const { ctx, accessRepo } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const { result: album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'SoftDeletedAlbumVis' });
    await ctx.get(SharedSpaceRepository).addAlbum({ spaceId: space.id, albumId: album.id, addedById: owner.id });

    const { asset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });

    // Before soft-delete: asset reachable
    const before = await accessRepo.asset.checkSpaceAccess(viewer.id, new Set([asset.id]));
    expect(before.has(asset.id)).toBe(true);

    // Soft-delete the album
    await ctx.softDeleteAlbum(album.id);

    // After: excluded even though asset.visibility = Timeline
    const after = await accessRepo.asset.checkSpaceAccess(viewer.id, new Set([asset.id]));
    expect(after.has(asset.id)).toBe(false);
  });

  it('added-then-locked via album path: asset flipped to Locked → excluded', async () => {
    const { ctx, accessRepo } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const { result: album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'AlbumLockReplay' });
    await ctx.get(SharedSpaceRepository).addAlbum({ spaceId: space.id, albumId: album.id, addedById: owner.id });

    const { asset } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });

    const before = await accessRepo.asset.checkSpaceAccess(viewer.id, new Set([asset.id]));
    expect(before.has(asset.id)).toBe(true);

    await defaultDatabase
      .updateTable('asset')
      .set({ visibility: AssetVisibility.Locked })
      .where('id', '=', asset.id)
      .execute();

    const after = await accessRepo.asset.checkSpaceAccess(viewer.id, new Set([asset.id]));
    expect(after.has(asset.id)).toBe(false);
  });
});
