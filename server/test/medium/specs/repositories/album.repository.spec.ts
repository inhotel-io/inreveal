import { Kysely } from 'kysely';
import { AssetVisibility, SharedLinkType } from 'src/enum';
import { AlbumRepository } from 'src/repositories/album.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { SharedLinkRepository } from 'src/repositories/shared-link.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { asDateString } from 'src/utils/date';
import { newMediumService } from 'test/medium.factory';
import { factory } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';
import { vi } from 'vitest';

let defaultDatabase: Kysely<DB>;

const setup = (db?: Kysely<DB>) => {
  const { ctx } = newMediumService(BaseService, {
    database: db || defaultDatabase,
    real: [],
    mock: [LoggingRepository],
  });
  return { ctx, sut: ctx.get(AlbumRepository) };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe(AlbumRepository.name, () => {
  describe('getOwnedNames', () => {
    it('returns lightweight projection of owned albums', async () => {
      const { ctx, sut } = setup();
      const { user: owner } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: owner.id });
      const { album } = await ctx.newAlbum({
        ownerId: owner.id,
        albumName: 'Hawaii 2024',
        albumThumbnailAssetId: asset.id,
      });
      await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });

      const rows = await sut.getOwnedNames(owner.id);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: album.id,
        albumName: 'Hawaii 2024',
        albumThumbnailAssetId: expect.any(String),
        assetCount: 1,
      });

      // startDate / endDate must be coercible by asDateString. Postgres timestamp
      // returns Date | string depending on Kysely driver config; asDateString handles both.
      expect(() => asDateString(rows[0].startDate ?? undefined)).not.toThrow();
      expect(() => asDateString(rows[0].endDate ?? undefined)).not.toThrow();
    });

    it('does not call updateThumbnails', async () => {
      const { ctx, sut } = setup();
      const { user: owner } = await ctx.newUser();
      const spy = vi.spyOn(sut, 'updateThumbnails');

      await sut.getOwnedNames(owner.id);

      expect(spy).not.toHaveBeenCalled();
    });

    it('returns empty-album with assetCount=0 and null date range', async () => {
      const { ctx, sut } = setup();
      const { user: owner } = await ctx.newUser();
      await ctx.newAlbum({ ownerId: owner.id, albumName: 'Empty' });

      const rows = await sut.getOwnedNames(owner.id);

      expect(rows).toHaveLength(1);
      expect(rows[0].assetCount).toBe(0);
      expect(rows[0].startDate).toBeNull();
      expect(rows[0].endDate).toBeNull();
    });
  });

  describe('getSharedNames', () => {
    it('returns lightweight projection of albums shared with the user', async () => {
      const { ctx, sut } = setup();
      const { user: owner } = await ctx.newUser();
      const { user: viewer } = await ctx.newUser();
      const { album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Shared Trip' });
      await ctx.newAlbumUser({ albumId: album.id, userId: viewer.id });

      const rows = await sut.getSharedNames(viewer.id);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: album.id,
        albumName: 'Shared Trip',
      });
      // Note: `shared: true` is NOT asserted at the repo layer — service (Task 3)
      // hardcodes it based on which repo method produced the record.
    });

    it('includes albums owned-and-shared-out (dedup is downstream responsibility)', async () => {
      const { ctx, sut } = setup();
      const { user: owner } = await ctx.newUser();
      const { user: buddy } = await ctx.newUser();
      const { album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Beach' });
      await ctx.newAlbumUser({ albumId: album.id, userId: buddy.id });

      // Owner's "shared" query returns the album too (they share it out)
      const ownerShared = await sut.getSharedNames(owner.id);
      expect(ownerShared.map((r) => r.id)).toContain(album.id);
    });
  });

  describe('agent album projections', () => {
    it('lists owned and shared albums for agent reads without deleted albums and dedupes shared albums', async () => {
      const { ctx, sut } = setup();
      const { user: viewer } = await ctx.newUser();
      const { user: owner } = await ctx.newUser();
      const { asset: ownedAsset } = await ctx.newAsset({ ownerId: viewer.id });
      const { asset: sharedAsset } = await ctx.newAsset({ ownerId: owner.id });
      const { album: owned } = await ctx.newAlbum({
        ownerId: viewer.id,
        albumName: 'Owned',
        albumThumbnailAssetId: ownedAsset.id,
      });
      const { album: shared } = await ctx.newAlbum({
        ownerId: owner.id,
        albumName: 'Shared',
        albumThumbnailAssetId: sharedAsset.id,
      });
      const { album: deleted } = await ctx.newAlbum({ ownerId: viewer.id, albumName: 'Deleted' });
      await Promise.all([
        ctx.newAlbumAsset({ albumId: owned.id, assetId: ownedAsset.id }),
        ctx.newAlbumAsset({ albumId: shared.id, assetId: sharedAsset.id }),
        ctx.newAlbumUser({ albumId: shared.id, userId: viewer.id }),
        ctx.softDeleteAlbum(deleted.id),
        ctx.get(SharedLinkRepository).create({
          userId: viewer.id,
          key: Buffer.from(factory.uuid()),
          type: SharedLinkType.Album,
          albumId: shared.id,
          allowUpload: false,
          allowDownload: true,
          showExif: true,
          expiresAt: null,
          password: null,
          description: null,
          slug: null,
        }),
      ]);

      const result = await sut.getAgentAlbums(viewer.id);

      expect(result.map((album) => album.id).toSorted()).toEqual([owned.id, shared.id].toSorted());
      expect(result.filter((album) => album.id === shared.id)).toHaveLength(1);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: owned.id, albumName: 'Owned', ownerId: viewer.id, assetCount: 1 }),
          expect.objectContaining({
            id: shared.id,
            albumName: 'Shared',
            ownerId: owner.id,
            assetCount: 1,
            albumThumbnailAssetId: sharedAsset.id,
          }),
        ]),
      );
      expect(result.map((album) => album.albumName)).not.toContain('Deleted');
    });

    it('does not expose shared-link-only albums to agent reads', async () => {
      const { ctx, sut } = setup();
      const { user: viewer } = await ctx.newUser();
      const { user: owner } = await ctx.newUser();
      const { album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Shared link only' });
      await ctx.get(SharedLinkRepository).create({
        userId: viewer.id,
        key: Buffer.from(factory.uuid()),
        type: SharedLinkType.Album,
        albumId: album.id,
        allowUpload: false,
        allowDownload: true,
        showExif: true,
        expiresAt: null,
        password: null,
        description: null,
        slug: null,
      });

      await expect(sut.getAgentAlbums(viewer.id)).resolves.toEqual([]);
      await expect(sut.getAgentAlbumById(viewer.id, album.id)).resolves.toBeNull();
    });

    it('reads an agent album with ordered asset ids and summary metadata', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset: first } = await ctx.newAsset({ ownerId: user.id, localDateTime: new Date('2026-05-01') });
      const { asset: second } = await ctx.newAsset({ ownerId: user.id, localDateTime: new Date('2026-05-02') });
      const { album } = await ctx.newAlbum({
        ownerId: user.id,
        albumName: 'Porto',
        description: 'Spring trip',
        albumThumbnailAssetId: first.id,
      });
      await ctx.newAlbumAsset({ albumId: album.id, assetId: first.id });
      await ctx.newAlbumAsset({ albumId: album.id, assetId: second.id });

      const result = await sut.getAgentAlbumById(user.id, album.id);

      expect(result).toEqual(
        expect.objectContaining({
          id: album.id,
          albumName: 'Porto',
          description: 'Spring trip',
          ownerId: user.id,
          assetCount: 2,
          albumThumbnailAssetId: first.id,
          assetIds: [first.id, second.id],
        }),
      );
    });

    it('includes archived assets in agent album counts and detail asset ids', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset: archived } = await ctx.newAsset({
        ownerId: user.id,
        visibility: AssetVisibility.Archive,
        localDateTime: new Date('2026-05-04'),
      });
      const { album } = await ctx.newAlbum(
        { ownerId: user.id, albumName: 'Archived trip', albumThumbnailAssetId: archived.id },
        [archived.id],
      );

      const albums = await sut.getAgentAlbums(user.id);
      const detail = await sut.getAgentAlbumById(user.id, album.id);

      expect(albums).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: album.id,
            assetCount: 1,
            albumThumbnailAssetId: archived.id,
            startDate: new Date('2026-05-04'),
            endDate: new Date('2026-05-04'),
          }),
        ]),
      );
      expect(detail).toEqual(
        expect.objectContaining({
          id: album.id,
          assetCount: 1,
          albumThumbnailAssetId: archived.id,
          assetIds: [archived.id],
        }),
      );
    });

    it('excludes offline and locked assets from agent album summaries', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset: visible } = await ctx.newAsset({ ownerId: user.id, localDateTime: new Date('2026-05-01') });
      const { asset: offline } = await ctx.newAsset({
        ownerId: user.id,
        isOffline: true,
        localDateTime: new Date('2026-05-02'),
      });
      const { asset: locked } = await ctx.newAsset({
        ownerId: user.id,
        visibility: AssetVisibility.Locked,
        localDateTime: new Date('2026-05-03'),
      });
      const { album } = await ctx.newAlbum(
        { ownerId: user.id, albumName: 'Filtered', albumThumbnailAssetId: visible.id },
        [visible.id, offline.id, locked.id],
      );

      const result = await sut.getAgentAlbums(user.id);

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: album.id,
            assetCount: 1,
            startDate: new Date('2026-05-01'),
            endDate: new Date('2026-05-01'),
          }),
        ]),
      );
    });

    it('nulls agent album thumbnails that point at filtered assets', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset: visible } = await ctx.newAsset({ ownerId: user.id });
      const filteredAssets = await Promise.all([
        ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Locked }),
        ctx.newAsset({ ownerId: user.id, isOffline: true }),
        ctx.newAsset({ ownerId: user.id, deletedAt: new Date() }),
        ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Hidden }),
      ]);

      for (const { asset: filtered } of filteredAssets) {
        const { album } = await ctx.newAlbum(
          { ownerId: user.id, albumName: `Filtered thumbnail ${filtered.id}`, albumThumbnailAssetId: filtered.id },
          [visible.id, filtered.id],
        );

        const summaries = await sut.getAgentAlbums(user.id);
        const summary = summaries.find(({ id }) => id === album.id);
        const detail = await sut.getAgentAlbumById(user.id, album.id);

        expect(summary).toEqual(
          expect.objectContaining({
            id: album.id,
            assetCount: 1,
            albumThumbnailAssetId: null,
          }),
        );
        expect(detail).toEqual(
          expect.objectContaining({
            id: album.id,
            assetCount: 1,
            albumThumbnailAssetId: null,
            assetIds: [visible.id],
          }),
        );
      }
    });

    it('returns accessible agent albums with empty asset ids when all assets are filtered', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset: offline } = await ctx.newAsset({ ownerId: user.id, isOffline: true });
      const { asset: locked } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Locked });
      const { asset: deleted } = await ctx.newAsset({ ownerId: user.id, deletedAt: new Date() });
      const { asset: hidden } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Hidden });
      const { album } = await ctx.newAlbum(
        { ownerId: user.id, albumName: 'Private assets', albumThumbnailAssetId: locked.id },
        [offline.id, locked.id, deleted.id, hidden.id],
      );

      const albums = await sut.getAgentAlbums(user.id);
      const result = await sut.getAgentAlbumById(user.id, album.id);

      expect(albums).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: album.id,
            assetCount: 0,
            albumThumbnailAssetId: null,
            startDate: null,
            endDate: null,
          }),
        ]),
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: album.id,
          assetCount: 0,
          albumThumbnailAssetId: null,
          startDate: null,
          endDate: null,
          assetIds: [],
        }),
      );
    });

    it('returns null for deleted or inaccessible agent albums', async () => {
      const { ctx, sut } = setup();
      const { user: viewer } = await ctx.newUser();
      const { user: owner } = await ctx.newUser();
      const { album: inaccessible } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Private' });
      const { album: deleted } = await ctx.newAlbum({ ownerId: viewer.id, albumName: 'Deleted' });
      await ctx.softDeleteAlbum(deleted.id);

      await expect(sut.getAgentAlbumById(viewer.id, inaccessible.id)).resolves.toBeNull();
      await expect(sut.getAgentAlbumById(viewer.id, deleted.id)).resolves.toBeNull();
    });
  });
});
