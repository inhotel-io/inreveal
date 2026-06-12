import { Kysely } from 'kysely';
import { AlbumUserRole, Permission } from 'src/enum';
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
import { SharedSpaceService } from 'src/services/shared-space.service';
import { checkAccess } from 'src/utils/access';
import { newMediumService } from 'test/medium.factory';
import { factory } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

const setup = (db?: Kysely<DB>) => {
  return newMediumService(SharedSpaceService, {
    database: db || defaultDatabase,
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
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

// ---------------------------------------------------------------------------
// Permission-matrix spec: Space Albums Phase 1 — READ
// ---------------------------------------------------------------------------

describe('SharedSpaceService — space-album permission matrix', () => {
  /**
   * Fixture world (created once in beforeAll, shared across all Grid tests):
   *
   *  Space S  — links album A
   *  Space S2 — links album C
   *  Album B  — not linked to any space
   *
   *  Actors:
   *    spaceOwner  — owner member of S (non-admin user)
   *    spaceEditor — editor member of S
   *    spaceViewer — viewer member of S
   *    nonMember   — no membership anywhere
   *    albumOwner  — album_user owner on A, NOT in S
   *    albumEditor — album_user editor on A, NOT in S
   *    albumViewer — album_user viewer on A, NOT in S
   *    crossEditor — editor of S2, NOT in S
   *
   *  assetInA — an asset inside album A (owned by albumOwner)
   */

  let world: {
    spaceS: string;
    spaceS2: string;
    albumA: string;
    albumB: string;
    albumC: string;
    assetInA: string;
    actors: Record<string, { id: string; email: string }>;
  };

  let accessRepo: AccessRepository;
  let spaceRepo: SharedSpaceRepository;

  const authOf = (actorName: string) => {
    const actor = world.actors[actorName];
    if (!actor) {
      throw new Error(`Unknown actor: ${actorName}`);
    }
    return factory.auth({ user: { id: actor.id, email: actor.email } });
  };

  beforeAll(async () => {
    const { ctx } = setup();

    accessRepo = ctx.get(AccessRepository);
    spaceRepo = ctx.get(SharedSpaceRepository);

    // --- Create actors ---
    const { user: spaceOwnerUser } = await ctx.newUser();
    const { user: spaceEditorUser } = await ctx.newUser();
    const { user: spaceViewerUser } = await ctx.newUser();
    const { user: nonMemberUser } = await ctx.newUser();
    const { user: albumOwnerUser } = await ctx.newUser();
    const { user: albumEditorUser } = await ctx.newUser();
    const { user: albumViewerUser } = await ctx.newUser();
    const { user: crossEditorUser } = await ctx.newUser();

    // --- Create spaces ---
    const { space: spaceS } = await ctx.newSharedSpace({ createdById: spaceOwnerUser.id });
    const { space: spaceS2 } = await ctx.newSharedSpace({ createdById: crossEditorUser.id });

    // --- Memberships for S ---
    await ctx.newSharedSpaceMember({ spaceId: spaceS.id, userId: spaceOwnerUser.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: spaceS.id, userId: spaceEditorUser.id, role: 'editor' });
    await ctx.newSharedSpaceMember({ spaceId: spaceS.id, userId: spaceViewerUser.id, role: 'viewer' });

    // --- Memberships for S2 ---
    await ctx.newSharedSpaceMember({ spaceId: spaceS2.id, userId: crossEditorUser.id, role: 'editor' });

    // --- Create albums ---
    // Album A — owned by albumOwner, additional album_user members
    const { result: albumA } = await ctx.newAlbum({ ownerId: albumOwnerUser.id, albumName: 'Album A' });
    // Album B — unlinked
    const { result: albumB } = await ctx.newAlbum({ ownerId: albumOwnerUser.id, albumName: 'Album B' });
    // Album C — linked to S2
    const { result: albumC } = await ctx.newAlbum({ ownerId: crossEditorUser.id, albumName: 'Album C' });

    // album_user rows on A for albumEditor and albumViewer
    await ctx.newAlbumUser({ albumId: albumA.id, userId: albumEditorUser.id, role: AlbumUserRole.Editor });
    await ctx.newAlbumUser({ albumId: albumA.id, userId: albumViewerUser.id, role: AlbumUserRole.Viewer });

    // --- Create asset inside A ---
    const { asset: assetInA } = await ctx.newAsset({ ownerId: albumOwnerUser.id });
    await ctx.newAlbumAsset({ albumId: albumA.id, assetId: assetInA.id });

    // --- Link A to S, C to S2 ---
    await spaceRepo.addAlbum({ spaceId: spaceS.id, albumId: albumA.id, addedById: spaceOwnerUser.id });
    await spaceRepo.addAlbum({ spaceId: spaceS2.id, albumId: albumC.id, addedById: crossEditorUser.id });

    world = {
      spaceS: spaceS.id,
      spaceS2: spaceS2.id,
      albumA: albumA.id,
      albumB: albumB.id,
      albumC: albumC.id,
      assetInA: assetInA.id,
      actors: {
        spaceOwner: spaceOwnerUser,
        spaceEditor: spaceEditorUser,
        spaceViewer: spaceViewerUser,
        nonMember: nonMemberUser,
        albumOwner: albumOwnerUser,
        albumEditor: albumEditorUser,
        albumViewer: albumViewerUser,
        crossEditor: crossEditorUser,
      },
    };
  });

  // =========================================================================
  // Grid 1 — READ asset in album A via full AssetRead authorization chain
  // =========================================================================

  describe('Grid 1 — READ asset in album A (full AssetRead authorization)', () => {
    it.each([
      ['spaceOwner', true],
      ['spaceEditor', true],
      ['spaceViewer', true],
      ['nonMember', false],
      ['albumOwner', true],
      ['albumEditor', true],
      ['albumViewer', true],
      ['crossEditor', false],
    ] as const)('%s read A.asset → allowed=%s', async (actor, allowed) => {
      const allowedIds = await checkAccess(accessRepo, {
        auth: authOf(actor),
        permission: Permission.AssetRead,
        ids: new Set([world.assetInA]),
      });
      expect(allowedIds.has(world.assetInA)).toBe(allowed);
    });

    it('checkSpaceAccess (space-album branch) grants space members, denies non/cross', async () => {
      for (const [actor, expected] of [
        ['spaceOwner', true],
        ['spaceEditor', true],
        ['spaceViewer', true],
        ['nonMember', false],
        ['crossEditor', false],
      ] as const) {
        const r = await accessRepo.asset.checkSpaceAccess(world.actors[actor].id, new Set([world.assetInA]));
        expect(r.has(world.assetInA)).toBe(expected);
      }
    });
  });

  // =========================================================================
  // Grid 2 — WRITE add/remove assets in album A (space-linked write)
  // =========================================================================

  describe('Grid 2 — WRITE add/remove assets in album A (space-linked write)', () => {
    it.each([
      ['spaceOwner', true],
      ['spaceEditor', true],
      ['spaceViewer', false], // Viewer is read-only
      ['nonMember', false],
      ['crossEditor', false], // edits S2; A not linked there
      ['albumOwner', false], // album membership ⊥ space membership
      ['albumViewer', false], // album membership ⊥ space membership
    ] as const)('%s space-linked write to A → allowed=%s', async (actor, allowed) => {
      const result = await accessRepo.album.checkSpaceLinkedAlbumAccess(
        world.actors[actor].id,
        new Set([world.albumA]),
      );
      expect(result.has(world.albumA)).toBe(allowed);
    });

    it('spaceEditor cannot space-link-write to unlinked album B', async () => {
      const result = await accessRepo.album.checkSpaceLinkedAlbumAccess(
        world.actors.spaceEditor.id,
        new Set([world.albumB]),
      );
      expect(result.has(world.albumB)).toBe(false);
    });

    it('albumEditor gets AlbumAssetCreate via album_user path (independent of space membership)', async () => {
      const allowedIds = await checkAccess(accessRepo, {
        auth: authOf('albumEditor'),
        permission: Permission.AlbumAssetCreate,
        ids: new Set([world.albumA]),
      });
      expect(allowedIds.has(world.albumA)).toBe(true);
    });
  });

  // =========================================================================
  // Grid 6 — multi-path READ (direct asset + album paths, unlink behaviour)
  // =========================================================================

  describe('Grid 6 — multi-path READ (direct-add vs album-link)', () => {
    it('asset directly in S stays readable after removing its album link from S', async () => {
      const { ctx } = setup();
      const spaceAccessRepo = ctx.get(AccessRepository);
      const spaceAccessSpaceRepo = ctx.get(SharedSpaceRepository);

      // Isolated actors + space + album + asset
      const { user: owner } = await ctx.newUser();
      const { user: member } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: owner.id });
      await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: 'viewer' });

      const { result: album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'G6-album' });
      const { asset } = await ctx.newAsset({ ownerId: owner.id });
      await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });

      // Add asset DIRECTLY to space
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: owner.id });
      // Also link album to space
      await spaceAccessSpaceRepo.addAlbum({ spaceId: space.id, albumId: album.id, addedById: owner.id });

      // Both paths grant access
      const before = await spaceAccessRepo.asset.checkSpaceAccess(member.id, new Set([asset.id]));
      expect(before.has(asset.id)).toBe(true);

      // Remove album link — direct-asset path still works
      await spaceAccessSpaceRepo.removeAlbum(space.id, album.id);
      const after = await spaceAccessRepo.asset.checkSpaceAccess(member.id, new Set([asset.id]));
      expect(after.has(asset.id)).toBe(true);
    });

    it('asset accessible via two space-album links; removing one still grants access via the other', async () => {
      const { ctx } = setup();
      const spaceAccessRepo = ctx.get(AccessRepository);
      const spaceAccessSpaceRepo = ctx.get(SharedSpaceRepository);

      const { user: owner } = await ctx.newUser();
      const { user: memberS1 } = await ctx.newUser();
      const { user: memberS2 } = await ctx.newUser();

      const { space: s1 } = await ctx.newSharedSpace({ createdById: owner.id });
      const { space: s2 } = await ctx.newSharedSpace({ createdById: owner.id });

      await ctx.newSharedSpaceMember({ spaceId: s1.id, userId: memberS1.id, role: 'viewer' });
      await ctx.newSharedSpaceMember({ spaceId: s2.id, userId: memberS2.id, role: 'viewer' });

      const { result: album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'G6-shared-album' });
      const { asset } = await ctx.newAsset({ ownerId: owner.id });
      await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });

      // Link album to both spaces
      await spaceAccessSpaceRepo.addAlbum({ spaceId: s1.id, albumId: album.id, addedById: owner.id });
      await spaceAccessSpaceRepo.addAlbum({ spaceId: s2.id, albumId: album.id, addedById: owner.id });

      // Both members can read
      const r1 = await spaceAccessRepo.asset.checkSpaceAccess(memberS1.id, new Set([asset.id]));
      expect(r1.has(asset.id)).toBe(true);
      const r2 = await spaceAccessRepo.asset.checkSpaceAccess(memberS2.id, new Set([asset.id]));
      expect(r2.has(asset.id)).toBe(true);

      // Unlink from s1; s1-member loses access, s2-member retains it
      await spaceAccessSpaceRepo.removeAlbum(s1.id, album.id);
      const r1after = await spaceAccessRepo.asset.checkSpaceAccess(memberS1.id, new Set([asset.id]));
      expect(r1after.has(asset.id)).toBe(false);
      const r2after = await spaceAccessRepo.asset.checkSpaceAccess(memberS2.id, new Set([asset.id]));
      expect(r2after.has(asset.id)).toBe(true);
    });
  });
});
