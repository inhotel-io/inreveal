import { NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { AssetStatus, AssetType, AssetVisibility, ChecksumAlgorithm } from 'src/enum';
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { LibraryManifestService } from 'src/services/library-manifest.service';
import { newMediumService } from 'test/medium.factory';
import { factory, newUuid } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

const setup = (db?: Kysely<DB>) => {
  return newMediumService(LibraryManifestService, {
    database: db || defaultDatabase,
    real: [AssetRepository, UserRepository, AlbumRepository],
    mock: [LoggingRepository],
  });
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe(LibraryManifestService.name, () => {
  describe('getManifest', () => {
    it('returns the owner and a mapped asset for an owned, active asset', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const checksum = Buffer.from('0123456789abcdef0123', 'utf8');
      const { asset } = await ctx.newAsset({
        ownerId: user.id,
        checksum,
        checksumAlgorithm: ChecksumAlgorithm.sha1File,
        type: AssetType.Image,
        originalPath: 'upload/library/user/2026/photo.jpg',
        originalFileName: 'photo.jpg',
      });
      await ctx.newExif({ assetId: asset.id, fileSizeInByte: 123_456 });

      const auth = factory.auth({ user: { id: user.id } });
      const result = await sut.getManifest(auth, user.id);

      expect(result.owner).toEqual({ id: user.id, email: user.email });
      expect(result.manifestSchemaVersion).toBe(1);
      expect(result.generatedAt).toEqual(expect.any(String));
      expect(result.albums).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(result.assets).toEqual([
        expect.objectContaining({
          assetId: asset.id,
          objectKey: 'upload/library/user/2026/photo.jpg',
          originalFileName: 'photo.jpg',
          checksum: checksum.toString('base64'),
          checksumAlgorithm: ChecksumAlgorithm.sha1File,
          size: 123_456,
          type: AssetType.Image,
          albumIds: [],
        }),
      ]);
    });

    it('only returns the target user\'s assets', async () => {
      const { sut, ctx } = setup();
      const { user: owner } = await ctx.newUser();
      const { user: other } = await ctx.newUser();
      const { asset: mine } = await ctx.newAsset({ ownerId: owner.id });
      await ctx.newAsset({ ownerId: other.id });

      const auth = factory.auth({ user: { id: owner.id } });
      const result = await sut.getManifest(auth, owner.id);

      expect(result.assets.map((a) => a.assetId)).toEqual([mine.id]);
    });

    it('excludes trashed and permanently-deleted assets', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const { asset: active } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newAsset({ ownerId: user.id, status: AssetStatus.Trashed, deletedAt: new Date() });
      await ctx.newAsset({ ownerId: user.id, status: AssetStatus.Deleted, deletedAt: new Date() });

      const auth = factory.auth({ user: { id: user.id } });
      const result = await sut.getManifest(auth, user.id);

      expect(result.assets.map((a) => a.assetId)).toEqual([active.id]);
    });

    it('excludes external-library assets', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const { asset: managed } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newAsset({ ownerId: user.id, isExternal: true });

      const auth = factory.auth({ user: { id: user.id } });
      const result = await sut.getManifest(auth, user.id);

      expect(result.assets.map((a) => a.assetId)).toEqual([managed.id]);
    });

    it('includes assets of every visibility', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const ids = [];
      for (const visibility of [
        AssetVisibility.Timeline,
        AssetVisibility.Archive,
        AssetVisibility.Hidden,
        AssetVisibility.Locked,
      ]) {
        const { asset } = await ctx.newAsset({ ownerId: user.id, visibility });
        ids.push(asset.id);
      }

      const auth = factory.auth({ user: { id: user.id } });
      const result = await sut.getManifest(auth, user.id);

      expect(result.assets.map((a) => a.assetId).toSorted()).toEqual(ids.toSorted());
    });

    it('returns size null when the asset has no exif row', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });

      const auth = factory.auth({ user: { id: user.id } });
      const result = await sut.getManifest(auth, user.id);

      expect(result.assets).toEqual([expect.objectContaining({ assetId: asset.id, size: null })]);
    });

    it('returns an empty manifest for a user with no assets', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();

      const auth = factory.auth({ user: { id: user.id } });
      const result = await sut.getManifest(auth, user.id);

      expect(result.assets).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(result.albums).toEqual([]);
    });

    it('still exports a deactivated (soft-deleted) user\'s library', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser({ deletedAt: new Date() });
      const { asset } = await ctx.newAsset({ ownerId: user.id });

      const auth = factory.auth({ user: { id: user.id } });
      const result = await sut.getManifest(auth, user.id);

      expect(result.owner.id).toBe(user.id);
      expect(result.assets.map((a) => a.assetId)).toEqual([asset.id]);
    });

    it('throws NotFoundException for a user that does not exist', async () => {
      const { sut } = setup();
      const missingId = newUuid();
      const auth = factory.auth({ user: { id: missingId } });

      await expect(sut.getManifest(auth, missingId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sets nextCursor and trims to pageSize when more rows remain', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const made = [];
      for (let i = 0; i < 3; i++) {
        const { asset } = await ctx.newAsset({ ownerId: user.id });
        made.push(asset.id);
      }
      const ordered = [...made].toSorted();
      const auth = factory.auth({ user: { id: user.id } });

      const page1 = await sut.getManifest(auth, user.id, undefined, 2);
      expect(page1.assets.map((a) => a.assetId)).toEqual(ordered.slice(0, 2));
      expect(page1.nextCursor).toBe(ordered[1]);

      const page2 = await sut.getManifest(auth, user.id, page1.nextCursor ?? undefined, 2);
      expect(page2.assets.map((a) => a.assetId)).toEqual([ordered[2]]);
      expect(page2.nextCursor).toBeNull();
    });

    it('returns nextCursor null when the page exactly equals pageSize', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      await ctx.newAsset({ ownerId: user.id });
      await ctx.newAsset({ ownerId: user.id });
      const auth = factory.auth({ user: { id: user.id } });

      const page = await sut.getManifest(auth, user.id, undefined, 2);
      expect(page.assets).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it('paginates to exhaustion with no duplicates or skips', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const all = new Set<string>();
      for (let i = 0; i < 5; i++) {
        const { asset } = await ctx.newAsset({ ownerId: user.id });
        all.add(asset.id);
      }
      const auth = factory.auth({ user: { id: user.id } });

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 10; guard++) {
        const page = await sut.getManifest(auth, user.id, cursor, 2);
        seen.push(...page.assets.map((a) => a.assetId));
        if (!page.nextCursor) { break; }
        cursor = page.nextCursor;
      }
      expect(seen).toHaveLength(5);
      expect(new Set(seen)).toEqual(all);
    });

    it('returns an empty page for a cursor past the end', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      await ctx.newAsset({ ownerId: user.id });
      const auth = factory.auth({ user: { id: user.id } });

      const page = await sut.getManifest(auth, user.id, 'ffffffff-ffff-4fff-bfff-ffffffffffff', 2);
      expect(page.assets).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });

    it('accepts a cursor whose asset no longer exists (returns rows ordered after it)', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const auth = factory.auth({ user: { id: user.id } });

      // a random uuid less-than the existing id is unlikely; use a known-small cursor
      const page = await sut.getManifest(auth, user.id, '00000000-0000-4000-8000-000000000000', 2);
      expect(page.assets.map((a) => a.assetId)).toContain(asset.id);
    });
  });
});
