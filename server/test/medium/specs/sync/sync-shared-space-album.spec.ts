import { Kysely } from 'kysely';
import { SharedSpaceRole, SyncEntityType, SyncRequestType } from 'src/enum';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

// Handler-level end-to-end tests for the five SharedSpaceAlbum* sync types
// (Phase 2A slice A5). Tests mirror sync-shared-space-library.spec.ts but
// cover album metadata, link join rows, album_asset membership, full asset
// blobs, and asset exif.
//
// Scenarios:
//   1. Album linked to a space the user is already a member of → full sync
//   2. First-time invite to a space with a pre-linked album → backfill
//   3. Re-add to a space → fresh grant re-delivers
//   4. Absorbed invariant → space-only member does NOT see album via AlbumsV2
//   5. Viewer parity → Viewer receives same asset/exif events as Editor

let defaultDatabase: Kysely<DB>;

const setup = async (db?: Kysely<DB>) => {
  const ctx = new SyncTestContext(db || defaultDatabase);
  const { auth, user, session } = await ctx.newSyncAuthUser();
  return { auth, user, session, ctx };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

// ── Helper predicates ────────────────────────────────────────────────────────

const isAlbumEvent = (r: { type: string }) =>
  r.type === SyncEntityType.SharedSpaceAlbumV1 || r.type === SyncEntityType.SharedSpaceAlbumDeleteV1;

const isLinkEvent = (r: { type: string }) =>
  r.type === SyncEntityType.SharedSpaceAlbumLinkV1 || r.type === SyncEntityType.SharedSpaceAlbumLinkBackfillV1;

const isMembershipEvent = (r: { type: string }) =>
  r.type === SyncEntityType.SharedSpaceAlbumToAssetV1 ||
  r.type === SyncEntityType.SharedSpaceAlbumToAssetBackfillV1;

const isAssetEvent = (r: { type: string }) =>
  r.type === SyncEntityType.SharedSpaceAlbumAssetCreateV1 ||
  r.type === SyncEntityType.SharedSpaceAlbumAssetBackfillV1;

const isExifEvent = (r: { type: string }) =>
  r.type === SyncEntityType.SharedSpaceAlbumAssetExifCreateV1 ||
  r.type === SyncEntityType.SharedSpaceAlbumAssetExifBackfillV1;

// ── Scenario 1: album linked to a space the user already belongs to ──────────

describe('SharedSpaceAlbum sync — scenario 1: member sees linked album', () => {
  it('emits album metadata when an album is linked to an accessible space', async () => {
    const { auth, ctx } = await setup();
    const { user: owner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: auth.user.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    const response = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumsV1]);
    const albumEvents = response.filter((r) => isAlbumEvent(r));
    expect(albumEvents).toHaveLength(1);
    expect((albumEvents[0] as { data: { id: string } }).data).toMatchObject({ id: album.id });
  });

  it('emits link join rows (SharedSpaceAlbumLinkV1) for the space', async () => {
    const { auth, ctx } = await setup();
    const { user: owner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: auth.user.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id, showInTimeline: true });

    const response = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumLinksV1]);
    const linkEvents = response.filter((r) => isLinkEvent(r));
    expect(linkEvents).toHaveLength(1);
    expect((linkEvents[0] as { data: { spaceId: string; albumId: string; showInTimeline: boolean } }).data).toMatchObject({
      spaceId: space.id,
      albumId: album.id,
      showInTimeline: true,
    });
  });

  it('emits album_asset membership rows (SharedSpaceAlbumToAssetV1) for the album', async () => {
    const { auth, ctx } = await setup();
    const { user: owner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: auth.user.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    const response = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    const membershipEvents = response.filter((r) => isMembershipEvent(r));
    expect(membershipEvents.length).toBeGreaterThan(0);
    const assetIds = membershipEvents.map((r) => (r as { data: { assetId: string } }).data.assetId);
    expect(assetIds).toContain(asset.id);
  });

  it('emits full asset rows (SharedSpaceAlbumAssetCreateV1) for album assets', async () => {
    const { auth, ctx } = await setup();
    const { user: owner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: auth.user.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    // Need SharedSpaceAlbumToAssets acked first so creates stream fires.
    const membershipResponse = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    await ctx.syncAckAll(auth, membershipResponse);

    const response = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumAssetsV1]);
    const assetEvents = response.filter((r) => isAssetEvent(r));
    expect(assetEvents.length).toBeGreaterThan(0);
    const assetIds = assetEvents.map((r) => (r as { data: { id: string } }).data.id);
    expect(assetIds).toContain(asset.id);
  });

  it('emits exif rows (SharedSpaceAlbumAssetExifCreateV1) for album assets with exif', async () => {
    const { auth, ctx } = await setup();
    const { user: owner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    await ctx.newExif({ assetId: asset.id, make: 'TestCamera' });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: auth.user.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    // Need SharedSpaceAlbumToAssets acked first.
    const membershipResponse = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumToAssetsV1]);
    await ctx.syncAckAll(auth, membershipResponse);

    const response = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumAssetExifsV1]);
    const exifEvents = response.filter((r) => isExifEvent(r));
    expect(exifEvents.length).toBeGreaterThan(0);
    const assetIds = exifEvents.map((r) => (r as { data: { assetId: string } }).data.assetId);
    expect(assetIds).toContain(asset.id);
  });
});

// ── Scenario 2: first-time invite → backfill ────────────────────────────────

describe('SharedSpaceAlbum sync — scenario 2: first-time invite backfills pre-linked album', () => {
  it('backfills album metadata after user is added to a space with a pre-linked album', async () => {
    const { auth, ctx } = await setup();
    const { user: owner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    // Album linked BEFORE auth.user is a member.
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    // Empty initial sync — user is not yet a member.
    const initial = await ctx.syncStream(auth, [
      SyncRequestType.SharedSpaceAlbumsV1,
      SyncRequestType.SharedSpaceAlbumLinksV1,
      SyncRequestType.SharedSpaceAlbumToAssetsV1,
    ]);
    expect(initial.filter((r) => isAlbumEvent(r))).toHaveLength(0);
    expect(initial.filter((r) => isLinkEvent(r))).toHaveLength(0);
    expect(initial.filter((r) => isMembershipEvent(r))).toHaveLength(0);
    await ctx.syncAckAll(auth, initial);

    // Add auth.user to the space — grant createId advances.
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: auth.user.id, role: SharedSpaceRole.Editor });

    const next = await ctx.syncStream(auth, [
      SyncRequestType.SharedSpacesV1,
      SyncRequestType.SharedSpaceMembersV1,
      SyncRequestType.SharedSpaceAlbumsV1,
      SyncRequestType.SharedSpaceAlbumLinksV1,
      SyncRequestType.SharedSpaceAlbumToAssetsV1,
    ]);

    // Album metadata must arrive.
    const albumEvents = next.filter((r) => isAlbumEvent(r));
    expect(albumEvents).toHaveLength(1);
    expect((albumEvents[0] as { data: { id: string } }).data.id).toBe(album.id);

    // Link join row must arrive.
    const linkEvents = next.filter((r) => isLinkEvent(r));
    expect(linkEvents).toHaveLength(1);
    expect((linkEvents[0] as { data: { albumId: string } }).data.albumId).toBe(album.id);

    // Membership row must arrive.
    const membershipEvents = next.filter((r) => isMembershipEvent(r));
    const assetIds = membershipEvents.map((r) => (r as { data: { assetId: string } }).data.assetId);
    expect(assetIds).toContain(asset.id);
  });
});

// ── Scenario 3: re-add to a space → fresh grant re-delivers ─────────────────

describe('SharedSpaceAlbum sync — scenario 3: re-add after removal re-delivers', () => {
  it('re-delivers album metadata when user is re-added to a space', async () => {
    const { auth, ctx } = await setup();
    const { user: owner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: auth.user.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    // Initial sync — album arrives.
    const initial = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumsV1]);
    expect(initial.filter((r) => isAlbumEvent(r))).toHaveLength(1);
    await ctx.syncAckAll(auth, initial);
    await ctx.assertSyncIsComplete(auth, [SyncRequestType.SharedSpaceAlbumsV1]);

    // Remove auth.user from the space (revokes grant → writes to shared_space_album_user_audit).
    await defaultDatabase
      .deleteFrom('shared_space_member')
      .where('spaceId', '=', space.id)
      .where('userId', '=', auth.user.id)
      .execute();

    // After removal, next sync delivers a delete.
    const afterRemoval = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumsV1]);
    const deleteEvents = afterRemoval.filter(
      (r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumDeleteV1,
    );
    expect(deleteEvents).toHaveLength(1);
    await ctx.syncAckAll(auth, afterRemoval);

    // Re-add to the space — fresh grant createId → album re-delivers.
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: auth.user.id, role: SharedSpaceRole.Viewer });
    const readdSync = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumsV1]);
    const upsertEvents = readdSync.filter((r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumV1);
    expect(upsertEvents).toHaveLength(1);
    expect((upsertEvents[0] as { data: { id: string } }).data.id).toBe(album.id);
  });
});

// ── Scenario 4: absorbed invariant ──────────────────────────────────────────

describe('SharedSpaceAlbum sync — absorbed invariant: space-only member excluded from personal AlbumsV2', () => {
  it('does NOT emit the album via AlbumsV2 for a space-only member', async () => {
    const { auth, ctx } = await setup();
    const { user: owner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: auth.user.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    const response = await ctx.syncStream(auth, [SyncRequestType.AlbumsV2]);
    const personalAlbumIds = response
      .filter((r: { type: string }) => r.type === SyncEntityType.AlbumV2)
      .map((r) => (r as { data: { id: string } }).data.id);

    // The owner's album must NOT appear in auth.user's personal album stream
    // because auth.user is not an album_user on it — only a space-album-grant holder.
    expect(personalAlbumIds).not.toContain(album.id);
  });
});

// ── Scenario 5: viewer parity ────────────────────────────────────────────────

describe('SharedSpaceAlbum sync — viewer parity: Viewer receives same asset/exif events as Editor', () => {
  it('Viewer receives album and asset events identically to an Editor', async () => {
    const { auth: viewer, ctx: ctx1 } = await setup();
    const { auth: editor, ctx: ctx2 } = await setup(defaultDatabase);

    const { user: owner } = await ctx1.newUser();
    const { album } = await ctx1.newAlbum({ ownerId: owner.id });
    const { asset } = await ctx1.newAsset({ ownerId: owner.id });
    await ctx1.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    await ctx1.newExif({ assetId: asset.id, make: 'ViewerCamera' });
    const { space } = await ctx1.newSharedSpace({ createdById: owner.id });
    await ctx1.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx1.newSharedSpaceMember({ spaceId: space.id, userId: viewer.user.id, role: SharedSpaceRole.Viewer });
    await ctx1.newSharedSpaceMember({ spaceId: space.id, userId: editor.user.id, role: SharedSpaceRole.Editor });
    await ctx1.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    const viewerResponse = await ctx1.syncStream(viewer, [SyncRequestType.SharedSpaceAlbumsV1]);
    const editorResponse = await ctx2.syncStream(editor, [SyncRequestType.SharedSpaceAlbumsV1]);

    const viewerAlbumEvents = viewerResponse.filter((r) => isAlbumEvent(r));
    const editorAlbumEvents = editorResponse.filter((r) => isAlbumEvent(r));

    expect(viewerAlbumEvents).toHaveLength(1);
    expect(editorAlbumEvents).toHaveLength(1);
    expect((viewerAlbumEvents[0] as { data: { id: string } }).data.id).toBe(album.id);
    expect((editorAlbumEvents[0] as { data: { id: string } }).data.id).toBe(album.id);
  });
});

// ── Delete events ────────────────────────────────────────────────────────────

describe('SharedSpaceAlbum sync — delete events', () => {
  it('emits SharedSpaceAlbumLinkDeleteV1 when an album is unlinked from a space', async () => {
    const { auth, ctx } = await setup();
    const { user: owner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: auth.user.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    const initial = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumLinksV1]);
    await ctx.syncAckAll(auth, initial);
    await ctx.assertSyncIsComplete(auth, [SyncRequestType.SharedSpaceAlbumLinksV1]);

    // Unlink the album from the space.
    await defaultDatabase
      .deleteFrom('shared_space_album')
      .where('spaceId', '=', space.id)
      .where('albumId', '=', album.id)
      .execute();

    const next = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumLinksV1]);
    const deleteEvents = next.filter(
      (r: { type: string }) => r.type === SyncEntityType.SharedSpaceAlbumLinkDeleteV1,
    );
    expect(deleteEvents).toHaveLength(1);
    expect((deleteEvents[0] as { data: { spaceId: string; albumId: string } }).data).toMatchObject({
      spaceId: space.id,
      albumId: album.id,
    });
  });

  it('does not emit link rows for spaces the user cannot access', async () => {
    const { auth, ctx } = await setup();
    const { user: stranger } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: stranger.id });
    const { space } = await ctx.newSharedSpace({ createdById: stranger.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: stranger.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

    const response = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumLinksV1]);
    expect(response.filter((r) => isLinkEvent(r))).toHaveLength(0);
  });
});
