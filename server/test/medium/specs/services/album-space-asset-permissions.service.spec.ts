import { Kysely } from 'kysely';
import { AssetVisibility, Permission } from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { AlbumUserRepository } from 'src/repositories/album-user.repository';
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { EventRepository } from 'src/repositories/event.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { StorageRepository } from 'src/repositories/storage.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { AlbumService } from 'src/services/album.service';
import { checkAccess } from 'src/utils/access';
import { inAlbums } from 'src/utils/database';
import { spaceContributedAssetExists } from 'src/utils/shared-space-album-scope';
import { newMediumService } from 'test/medium.factory';
import { factory } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';

// -------------------------------------------------------------------------------------------------
// Cross-owner contribution permission matrix (#764)
//
//   Space S       — created by spaceOwner; links album L
//   Space T       — a DIFFERENT space, created by outsider; assetOnlyInT lives here
//   Album L       — owned by albumOwner (an Editor member of S, NOT the creator), linked to S
//   Album U       — owned by albumOwner, NOT linked to any space
//
//   assetCarol    — owned by carol (member of S), in S's DIRECT POOL   → contributable by editors
//   assetHidden   — owned by carol, in S's pool but visibility=Hidden  → NOT contributable (gate)
//   assetEditorOwn— owned by spaceEditor, in S's pool                  → own photo → album_asset path
//   assetOnlyInT  — owned by outsider, only in space T                 → NOT space-visible via S
//
//   Roles in S: spaceOwner(owner) · albumOwner(editor) · spaceEditor(editor) · spaceViewer(viewer)
//               nonMember(none)
// -------------------------------------------------------------------------------------------------

let db: Kysely<DB>;

const setup = () => {
  const result = newMediumService(AlbumService, {
    database: db,
    real: [
      AccessRepository,
      AlbumRepository,
      AlbumUserRepository,
      AssetRepository,
      SharedSpaceRepository,
      UserRepository,
    ],
    mock: [EventRepository, LoggingRepository, JobRepository, StorageRepository],
  });
  // The owned-asset path emits AlbumUpdate / AlbumAssetsAdd; give the auto-mock a no-op resolution.
  result.ctx.getMock(EventRepository).emit.mockResolvedValue(void 0);
  return result;
};

beforeAll(async () => {
  db = await getKyselyDB();
});

describe('AlbumService — cross-owner contribution permission matrix (#764)', () => {
  let sut: AlbumService;
  let accessRepo: AccessRepository;
  let spaceRepo: SharedSpaceRepository;

  let spaceS: string;
  let albumL: string;
  let albumU: string;
  let assetCarol: string;
  let assetHidden: string;
  let assetEditorOwn: string;
  let assetOnlyInT: string;

  const actors: Record<string, { id: string; email: string }> = {};
  const authOf = (name: string) => factory.auth({ user: { id: actors[name].id, email: actors[name].email } });

  // The exact read gate every album surface uses — does `userId` see `assetId` as a contribution?
  // eslint-disable-next-line unicorn/consistent-function-scoping -- test helper closes over the shared fixture db
  const seesContribution = async (userId: string, assetId: string) => {
    const rows = await db
      .selectFrom('asset')
      .select('asset.id')
      .where('asset.id', '=', assetId)
      .where((eb) => spaceContributedAssetExists(eb, { correlateAssetId: 'asset.id', scope: { memberUserId: userId } }))
      .execute();
    return rows.length > 0;
  };

  const isContributionRow = async (assetId: string) => {
    const row = await db
      .selectFrom('album_space_asset')
      .select(['albumId', 'spaceId'])
      .where('albumId', '=', albumL)
      .where('assetId', '=', assetId)
      .executeTakeFirst();
    return row;
  };

  const isAlbumAssetRow = async (assetId: string) => {
    const row = await db
      .selectFrom('album_asset')
      .select('assetId')
      .where('albumId', '=', albumL)
      .where('assetId', '=', assetId)
      .executeTakeFirst();
    return !!row;
  };

  beforeAll(async () => {
    const { sut: albumService, ctx } = setup();
    sut = albumService;
    accessRepo = ctx.get(AccessRepository);
    spaceRepo = ctx.get(SharedSpaceRepository);

    const { user: spaceOwner } = await ctx.newUser();
    const { user: albumOwner } = await ctx.newUser();
    const { user: spaceEditor } = await ctx.newUser();
    const { user: spaceViewer } = await ctx.newUser();
    const { user: nonMember } = await ctx.newUser();
    const { user: carol } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
    Object.assign(actors, { spaceOwner, albumOwner, spaceEditor, spaceViewer, nonMember, carol, outsider });

    const { space: s } = await ctx.newSharedSpace({ createdById: spaceOwner.id });
    const { space: t } = await ctx.newSharedSpace({ createdById: outsider.id });
    spaceS = s.id;

    await ctx.newSharedSpaceMember({ spaceId: s.id, userId: spaceOwner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: s.id, userId: albumOwner.id, role: 'editor' });
    await ctx.newSharedSpaceMember({ spaceId: s.id, userId: spaceEditor.id, role: 'editor' });
    await ctx.newSharedSpaceMember({ spaceId: s.id, userId: spaceViewer.id, role: 'viewer' });
    await ctx.newSharedSpaceMember({ spaceId: s.id, userId: carol.id, role: 'editor' });
    await ctx.newSharedSpaceMember({ spaceId: t.id, userId: outsider.id, role: 'owner' });

    const { result: l } = await ctx.newAlbum({ ownerId: albumOwner.id, albumName: 'Album L' });
    const { result: u } = await ctx.newAlbum({ ownerId: albumOwner.id, albumName: 'Album U (unlinked)' });
    albumL = l.id;
    albumU = u.id;
    await spaceRepo.addAlbum({ spaceId: s.id, albumId: l.id, addedById: spaceOwner.id });

    const { asset: aCarol } = await ctx.newAsset({ ownerId: carol.id, visibility: AssetVisibility.Timeline });
    const { asset: aHidden } = await ctx.newAsset({ ownerId: carol.id, visibility: AssetVisibility.Hidden });
    const { asset: aEditor } = await ctx.newAsset({ ownerId: spaceEditor.id, visibility: AssetVisibility.Timeline });
    const { asset: aT } = await ctx.newAsset({ ownerId: outsider.id, visibility: AssetVisibility.Timeline });
    assetCarol = aCarol.id;
    assetHidden = aHidden.id;
    assetEditorOwn = aEditor.id;
    assetOnlyInT = aT.id;

    await ctx.newSharedSpaceAsset({ spaceId: s.id, assetId: aCarol.id, addedById: carol.id });
    await ctx.newSharedSpaceAsset({ spaceId: s.id, assetId: aHidden.id, addedById: carol.id });
    await ctx.newSharedSpaceAsset({ spaceId: s.id, assetId: aEditor.id, addedById: spaceEditor.id });
    await ctx.newSharedSpaceAsset({ spaceId: t.id, assetId: aT.id, addedById: outsider.id });
  });

  // ===============================================================================================
  // ADD — who may contribute what
  // ===============================================================================================
  describe('ADD', () => {
    it('space Editor contributes a non-owned pool asset → success, album_space_asset row (NOT album_asset)', async () => {
      const [res] = await sut.addAssets(authOf('spaceEditor'), albumL, { ids: [assetCarol] });
      expect(res).toEqual({ id: assetCarol, success: true });
      const row = await isContributionRow(assetCarol);
      expect(row).toMatchObject({ albumId: albumL, spaceId: spaceS });
      expect(await isAlbumAssetRow(assetCarol)).toBe(false);
    });

    it('duplicate contribution → DUPLICATE (idempotent, no second row)', async () => {
      const [res] = await sut.addAssets(authOf('spaceOwner'), albumL, { ids: [assetCarol] });
      expect(res).toEqual({ id: assetCarol, success: false, error: 'duplicate' });
    });

    it('space Editor contributes their OWN pool asset → success via album_asset (not a contribution)', async () => {
      const [res] = await sut.addAssets(authOf('spaceEditor'), albumL, { ids: [assetEditorOwn] });
      expect(res).toEqual({ id: assetEditorOwn, success: true });
      expect(await isAlbumAssetRow(assetEditorOwn)).toBe(true);
      expect(await isContributionRow(assetEditorOwn)).toBeUndefined();
    });

    it('Hidden asset is NOT contributable (visibility gate) → NO_PERMISSION, no row', async () => {
      const [res] = await sut.addAssets(authOf('spaceEditor'), albumL, { ids: [assetHidden] });
      expect(res).toEqual({ id: assetHidden, success: false, error: 'no_permission' });
      expect(await isContributionRow(assetHidden)).toBeUndefined();
    });

    it('asset not visible via the album’s space (only in space T) → NO_PERMISSION', async () => {
      const [res] = await sut.addAssets(authOf('spaceEditor'), albumL, { ids: [assetOnlyInT] });
      expect(res).toEqual({ id: assetOnlyInT, success: false, error: 'no_permission' });
    });

    it('space Viewer is hard-blocked (403) before any per-asset logic', async () => {
      await expect(sut.addAssets(authOf('spaceViewer'), albumL, { ids: [assetCarol] })).rejects.toThrow();
    });

    it('non-member is denied (403)', async () => {
      await expect(sut.addAssets(authOf('nonMember'), albumL, { ids: [assetCarol] })).rejects.toThrow();
    });

    it('cannot contribute a non-owned asset into an UNLINKED album (403 — not space-linked)', async () => {
      await expect(sut.addAssets(authOf('spaceEditor'), albumU, { ids: [assetCarol] })).rejects.toThrow();
    });

    it('mixed batch → per-asset outcomes preserved', async () => {
      // fresh assets so this test is order-independent
      const { ctx } = setup();
      const { asset: freshCarol } = await ctx.newAsset({
        ownerId: actors.carol.id,
        visibility: AssetVisibility.Timeline,
      });
      await ctx.newSharedSpaceAsset({ spaceId: spaceS, assetId: freshCarol.id, addedById: actors.carol.id });
      const { asset: freshOwn } = await ctx.newAsset({
        ownerId: actors.spaceEditor.id,
        visibility: AssetVisibility.Timeline,
      });
      await ctx.newSharedSpaceAsset({ spaceId: spaceS, assetId: freshOwn.id, addedById: actors.spaceEditor.id });

      const results = await sut.addAssets(authOf('spaceEditor'), albumL, {
        ids: [freshCarol.id, freshOwn.id, assetOnlyInT],
      });
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));
      expect(byId[freshCarol.id]).toEqual({ id: freshCarol.id, success: true });
      expect(byId[freshOwn.id]).toEqual({ id: freshOwn.id, success: true });
      expect(byId[assetOnlyInT]).toEqual({ id: assetOnlyInT, success: false, error: 'no_permission' });
    });
  });

  // ===============================================================================================
  // READ — who sees a contribution (any live member) + leak / lifecycle
  // ===============================================================================================
  describe('READ + lifecycle', () => {
    it('every live member (owner/editor/viewer) sees the contribution; non-member does not', async () => {
      expect(await seesContribution(actors.spaceOwner.id, assetCarol)).toBe(true);
      expect(await seesContribution(actors.spaceEditor.id, assetCarol)).toBe(true);
      expect(await seesContribution(actors.spaceViewer.id, assetCarol)).toBe(true);
      expect(await seesContribution(actors.nonMember.id, assetCarol)).toBe(false);
    });

    it('LEAK NEGATIVE: album owner reaches the contribution ONLY via live membership (no permanent album_asset grant)', async () => {
      // While a member, albumOwner sees it — but via the space arm, NOT checkAlbumAccess.
      expect(await seesContribution(actors.albumOwner.id, assetCarol)).toBe(true);
      const grantedWhileMember = await checkAccess(accessRepo, {
        auth: authOf('albumOwner'),
        permission: Permission.AssetRead,
        ids: new Set([assetCarol]),
      });
      expect(grantedWhileMember.has(assetCarol)).toBe(true);

      // Remove the album owner from the space (link stays; other members keep seeing it).
      await spaceRepo.removeMember(spaceS, actors.albumOwner.id);
      try {
        expect(await seesContribution(actors.albumOwner.id, assetCarol)).toBe(false);
        expect(await seesContribution(actors.spaceEditor.id, assetCarol)).toBe(true);
        const grantedAfterLeave = await checkAccess(accessRepo, {
          auth: authOf('albumOwner'),
          permission: Permission.AssetRead,
          ids: new Set([assetCarol]),
        });
        // The whole point: no album_asset grant survived — the owner loses the photo entirely.
        expect(grantedAfterLeave.has(assetCarol)).toBe(false);
      } finally {
        // Restore albumOwner's membership so later tests keep the fixture world intact.
        await db
          .insertInto('shared_space_member')
          .values({ spaceId: spaceS, userId: actors.albumOwner.id, role: 'editor' })
          .onConflict((oc) => oc.doNothing())
          .execute();
      }
    });

    it('UNLINK NEGATIVE: unlinking the album hides the contribution for everyone (reversible on re-link)', async () => {
      await spaceRepo.removeAlbum(spaceS, albumL);
      try {
        expect(await seesContribution(actors.spaceEditor.id, assetCarol)).toBe(false);
        expect(await seesContribution(actors.spaceViewer.id, assetCarol)).toBe(false);
      } finally {
        await spaceRepo.addAlbum({ spaceId: spaceS, albumId: albumL, addedById: actors.spaceOwner.id });
      }
      expect(await seesContribution(actors.spaceEditor.id, assetCarol)).toBe(true);
    });
  });

  // ===============================================================================================
  // DISPLAY — contribution surfaces as album content only for a live member (inAlbums gate)
  // ===============================================================================================
  describe('DISPLAY (album grid membership)', () => {
    it('shows as album content when the viewer has the tether space live (timelineSpaceIds); excluded without it', async () => {
      const { ctx } = setup();
      const { asset } = await ctx.newAsset({ ownerId: actors.carol.id, visibility: AssetVisibility.Timeline });
      await ctx.newSharedSpaceAsset({ spaceId: spaceS, assetId: asset.id, addedById: actors.carol.id });
      const [res] = await sut.addAssets(authOf('spaceEditor'), albumL, { ids: [asset.id] });
      expect(res.success).toBe(true);

      const asLiveMember = await inAlbums(db.selectFrom('asset').where('asset.id', '=', asset.id), [albumL], [spaceS])
        .select('asset.id')
        .execute();
      expect(asLiveMember.map((r) => r.id)).toContain(asset.id);

      // No live member-space (album owner who left / a pure-owner album view) → contribution excluded.
      const withoutLiveMembership = await inAlbums(db.selectFrom('asset').where('asset.id', '=', asset.id), [albumL])
        .select('asset.id')
        .execute();
      expect(withoutLiveMembership).toHaveLength(0);
    });
  });

  // ===============================================================================================
  // REMOVE — who may remove a contribution
  // ===============================================================================================
  describe('REMOVE', () => {
    // eslint-disable-next-line unicorn/consistent-function-scoping -- closes over the shared fixture (sut, actors, spaceS, albumL)
    const contributeFresh = async () => {
      const { ctx } = setup();
      const { asset } = await ctx.newAsset({ ownerId: actors.carol.id, visibility: AssetVisibility.Timeline });
      await ctx.newSharedSpaceAsset({ spaceId: spaceS, assetId: asset.id, addedById: actors.carol.id });
      const [res] = await sut.addAssets(authOf('spaceEditor'), albumL, { ids: [asset.id] });
      expect(res.success).toBe(true);
      return asset.id;
    };

    it('space Editor removes a contribution → row gone, underlying asset untouched', async () => {
      const assetId = await contributeFresh();
      const [res] = await sut.removeAssets(authOf('spaceEditor'), albumL, { ids: [assetId] });
      expect(res).toEqual({ id: assetId, success: true });
      const row = await db
        .selectFrom('album_space_asset')
        .selectAll()
        .where('assetId', '=', assetId)
        .executeTakeFirst();
      expect(row).toBeUndefined();
      const asset = await db.selectFrom('asset').select('id').where('id', '=', assetId).executeTakeFirst();
      expect(asset).toBeDefined();
    });

    it('album owner (Editor of S) removes a contribution → success', async () => {
      const assetId = await contributeFresh();
      const [res] = await sut.removeAssets(authOf('albumOwner'), albumL, { ids: [assetId] });
      expect(res.success).toBe(true);
    });

    it('space Viewer cannot remove a contribution (403) — row stays', async () => {
      const assetId = await contributeFresh();
      await expect(sut.removeAssets(authOf('spaceViewer'), albumL, { ids: [assetId] })).rejects.toThrow();
      const row = await db
        .selectFrom('album_space_asset')
        .selectAll()
        .where('assetId', '=', assetId)
        .executeTakeFirst();
      expect(row).toBeDefined();
    });

    it('non-member cannot remove a contribution (403)', async () => {
      const assetId = await contributeFresh();
      await expect(sut.removeAssets(authOf('nonMember'), albumL, { ids: [assetId] })).rejects.toThrow();
    });
  });
});
