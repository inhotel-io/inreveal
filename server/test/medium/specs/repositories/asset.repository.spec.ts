import { Kysely } from 'kysely';
import { AssetFileType, AssetOrder, AssetVisibility, SharedSpaceRole } from 'src/enum';
import { AssetRepository } from 'src/repositories/asset.repository';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { TagRepository } from 'src/repositories/tag.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { mimeTypes } from 'src/utils/mime-types';
import { newMediumService } from 'test/medium.factory';
import { factory } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';

interface TimeBucketAssets {
  id: string[];
}

let defaultDatabase: Kysely<DB>;

const setup = (db?: Kysely<DB>) => {
  const { ctx } = newMediumService(BaseService, {
    database: db || defaultDatabase,
    real: [],
    mock: [LoggingRepository],
  });
  return { ctx, sut: ctx.get(AssetRepository) };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe(AssetRepository.name, () => {
  describe('getForThumbnail', () => {
    it('should fall back to the preview file when the thumbnail file is missing', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({
        ownerId: user.id,
        originalFileName: 'IMG_001.jpg',
        originalPath: '/uploads/IMG_001.jpg',
      });
      await ctx.newAssetFile({ assetId: asset.id, type: AssetFileType.Preview, path: 'preview.jpg' });

      await expect(sut.getForThumbnail(asset.id, AssetFileType.Thumbnail, true)).resolves.toMatchObject({
        path: 'preview.jpg',
      });
    });

    it('should prefer the requested thumbnail file when thumbnail and preview files exist', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({
        ownerId: user.id,
        originalFileName: 'IMG_002.jpg',
        originalPath: '/uploads/IMG_002.jpg',
      });
      await Promise.all([
        ctx.newAssetFile({ assetId: asset.id, type: AssetFileType.Preview, path: 'preview.jpg' }),
        ctx.newAssetFile({ assetId: asset.id, type: AssetFileType.Thumbnail, path: 'thumbnail.jpg' }),
      ]);

      await expect(sut.getForThumbnail(asset.id, AssetFileType.Thumbnail, true)).resolves.toMatchObject({
        path: 'thumbnail.jpg',
      });
    });
  });

  describe('getMemoryLocationClusters', () => {
    it('should group previewable timeline assets by country and city within the requested window', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();

      const addAsset = async ({
        localDateTime,
        country,
        city,
        withPreview = true,
      }: {
        localDateTime: Date;
        country: string | null;
        city: string | null;
        withPreview?: boolean;
      }) => {
        const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline, localDateTime });
        await Promise.all([
          ctx.newExif({ assetId: asset.id, country, city }),
          ctx.newJobStatus({ assetId: asset.id }),
          withPreview
            ? ctx.newAssetFile({ assetId: asset.id, type: AssetFileType.Preview, path: `${asset.id}.jpg` })
            : null,
        ]);
      };

      await addAsset({ localDateTime: new Date('2026-04-15T10:00:00Z'), country: 'France', city: 'Paris' });
      await addAsset({ localDateTime: new Date('2026-04-16T10:00:00Z'), country: 'France', city: 'Paris' });
      await addAsset({ localDateTime: new Date('2026-04-17T10:00:00Z'), country: 'France', city: 'Lyon' });
      await addAsset({ localDateTime: new Date('2026-04-18T10:00:00Z'), country: null, city: null });
      await addAsset({
        localDateTime: new Date('2026-04-19T10:00:00Z'),
        country: 'France',
        city: 'Paris',
        withPreview: false,
      });

      const result = await sut.getMemoryLocationClusters(user.id, {
        takenAfter: new Date('2026-04-01T00:00:00Z'),
        takenBefore: new Date('2026-04-30T23:59:59Z'),
      });

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ country: 'France', city: 'Paris', assetCount: 2, dayCount: 2 }),
          expect.objectContaining({ country: 'France', city: 'Lyon', assetCount: 1, dayCount: 1 }),
        ]),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('getMemoryAssetsForLocation', () => {
    it('should return previewable timeline assets for the requested country and city, including city=null', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const takenAfter = new Date('2026-04-01T00:00:00Z');
      const takenBefore = new Date('2026-04-30T23:59:59Z');

      const { asset: parisAsset } = await ctx.newAsset({
        ownerId: user.id,
        visibility: AssetVisibility.Timeline,
        localDateTime: new Date('2026-04-15T10:00:00Z'),
      });
      const { asset: countryOnlyAsset } = await ctx.newAsset({
        ownerId: user.id,
        visibility: AssetVisibility.Timeline,
        localDateTime: new Date('2026-04-16T10:00:00Z'),
      });
      const { asset: berlinAsset } = await ctx.newAsset({
        ownerId: user.id,
        visibility: AssetVisibility.Timeline,
        localDateTime: new Date('2026-04-17T10:00:00Z'),
      });

      await Promise.all([
        ctx.newExif({ assetId: parisAsset.id, country: 'France', city: 'Paris' }),
        ctx.newExif({ assetId: countryOnlyAsset.id, country: 'France', city: null }),
        ctx.newExif({ assetId: berlinAsset.id, country: 'Germany', city: 'Berlin' }),
        ctx.newAssetFile({ assetId: parisAsset.id, type: AssetFileType.Preview, path: 'paris.jpg' }),
        ctx.newAssetFile({ assetId: countryOnlyAsset.id, type: AssetFileType.Preview, path: 'france.jpg' }),
        ctx.newAssetFile({ assetId: berlinAsset.id, type: AssetFileType.Preview, path: 'berlin.jpg' }),
      ]);

      await expect(
        sut.getMemoryAssetsForLocation(user.id, {
          country: 'France',
          city: 'Paris',
          takenAfter,
          takenBefore,
        }),
      ).resolves.toEqual([expect.objectContaining({ id: parisAsset.id })]);

      await expect(
        sut.getMemoryAssetsForLocation(user.id, {
          country: 'France',
          city: null,
          takenAfter,
          takenBefore,
        }),
      ).resolves.toEqual([expect.objectContaining({ id: countryOnlyAsset.id })]);
    });
  });

  describe('getMemoryAssetsForPerson', () => {
    it('should return previewable timeline assets for the person before the cutoff and deduplicate multiple faces', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Alice' });
      const cutoff = new Date('2026-04-23T23:59:59Z');

      const { asset: matchingAsset } = await ctx.newAsset({
        ownerId: user.id,
        visibility: AssetVisibility.Timeline,
        localDateTime: new Date('2025-04-01T12:00:00Z'),
      });
      const { asset: duplicateFaceAsset } = await ctx.newAsset({
        ownerId: user.id,
        visibility: AssetVisibility.Timeline,
        localDateTime: new Date('2024-04-01T12:00:00Z'),
      });
      const { asset: hiddenFaceAsset } = await ctx.newAsset({
        ownerId: user.id,
        visibility: AssetVisibility.Timeline,
        localDateTime: new Date('2023-04-01T12:00:00Z'),
      });
      const { asset: missingPreviewAsset } = await ctx.newAsset({
        ownerId: user.id,
        visibility: AssetVisibility.Timeline,
        localDateTime: new Date('2022-04-01T12:00:00Z'),
      });
      const { asset: afterCutoffAsset } = await ctx.newAsset({
        ownerId: user.id,
        visibility: AssetVisibility.Timeline,
        localDateTime: new Date('2026-05-01T12:00:00Z'),
      });

      await Promise.all([
        ctx.newJobStatus({ assetId: matchingAsset.id }),
        ctx.newJobStatus({ assetId: duplicateFaceAsset.id }),
        ctx.newJobStatus({ assetId: hiddenFaceAsset.id }),
        ctx.newJobStatus({ assetId: missingPreviewAsset.id }),
        ctx.newJobStatus({ assetId: afterCutoffAsset.id }),
        ctx.newAssetFile({ assetId: matchingAsset.id, type: AssetFileType.Preview, path: 'matching-preview.jpg' }),
        ctx.newAssetFile({
          assetId: duplicateFaceAsset.id,
          type: AssetFileType.Preview,
          path: 'duplicate-preview.jpg',
        }),
        ctx.newAssetFile({ assetId: hiddenFaceAsset.id, type: AssetFileType.Preview, path: 'hidden-preview.jpg' }),
        ctx.newAssetFile({ assetId: afterCutoffAsset.id, type: AssetFileType.Preview, path: 'after-preview.jpg' }),
        ctx.newAssetFace({ assetId: matchingAsset.id, personId: person.id, isVisible: true }),
        ctx.newAssetFace({ assetId: duplicateFaceAsset.id, personId: person.id, isVisible: true }),
        ctx.newAssetFace({ assetId: duplicateFaceAsset.id, personId: person.id, isVisible: true }),
        ctx.newAssetFace({ assetId: hiddenFaceAsset.id, personId: person.id, isVisible: false }),
        ctx.newAssetFace({ assetId: missingPreviewAsset.id, personId: person.id, isVisible: true }),
        ctx.newAssetFace({ assetId: afterCutoffAsset.id, personId: person.id, isVisible: true }),
      ]);

      const result = await sut.getMemoryAssetsForPerson(user.id, person.id, cutoff);

      expect(result.map(({ id }) => id).toSorted()).toEqual([duplicateFaceAsset.id, matchingAsset.id].toSorted());
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: matchingAsset.id, localDateTime: new Date('2025-04-01T12:00:00Z') }),
          expect.objectContaining({ id: duplicateFaceAsset.id, localDateTime: new Date('2024-04-01T12:00:00Z') }),
        ]),
      );
    });
  });

  describe('getTimeBucket', () => {
    it('should order assets by local day first and fileCreatedAt within each day', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const auth = factory.auth({ user: { id: user.id } });

      const [{ asset: previousLocalDayAsset }, { asset: nextLocalDayEarlierAsset }, { asset: nextLocalDayLaterAsset }] =
        await Promise.all([
          ctx.newAsset({
            ownerId: user.id,
            fileCreatedAt: new Date('2026-03-09T00:30:00.000Z'),
            localDateTime: new Date('2026-03-08T22:30:00.000Z'),
          }),
          ctx.newAsset({
            ownerId: user.id,
            fileCreatedAt: new Date('2026-03-08T23:30:00.000Z'),
            localDateTime: new Date('2026-03-09T01:30:00.000Z'),
          }),
          ctx.newAsset({
            ownerId: user.id,
            fileCreatedAt: new Date('2026-03-08T23:45:00.000Z'),
            localDateTime: new Date('2026-03-09T01:45:00.000Z'),
          }),
        ]);

      await Promise.all([
        ctx.newExif({ assetId: previousLocalDayAsset.id, timeZone: 'UTC-2' }),
        ctx.newExif({ assetId: nextLocalDayEarlierAsset.id, timeZone: 'UTC+2' }),
        ctx.newExif({ assetId: nextLocalDayLaterAsset.id, timeZone: 'UTC+2' }),
      ]);

      const descendingBucket = await sut.getTimeBucket(
        '2026-03-01',
        { order: AssetOrder.Desc, userIds: [user.id], visibility: AssetVisibility.Timeline },
        auth,
      );
      expect(JSON.parse(descendingBucket.assets)).toEqual(
        expect.objectContaining({
          id: [nextLocalDayLaterAsset.id, nextLocalDayEarlierAsset.id, previousLocalDayAsset.id],
        }),
      );

      const ascendingBucket = await sut.getTimeBucket(
        '2026-03-01',
        { order: AssetOrder.Asc, userIds: [user.id], visibility: AssetVisibility.Timeline },
        auth,
      );
      expect(JSON.parse(ascendingBucket.assets)).toEqual(
        expect.objectContaining({
          id: [previousLocalDayAsset.id, nextLocalDayEarlierAsset.id, nextLocalDayLaterAsset.id],
        }),
      );
    });
  });

  describe('getAgentMetadataByIds', () => {
    it('returns only the redacted metadata shape for requested assets', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({
        ownerId: user.id,
        originalFileName: 'IMG_0001.jpg',
        originalPath: '/uploads/user/original/IMG_0001.jpg',
        isFavorite: true,
        visibility: AssetVisibility.Timeline,
      });
      const tag = await ctx.get(TagRepository).upsertValue({ userId: user.id, value: 'Portugal' });
      await Promise.all([
        ctx.newExif({
          assetId: asset.id,
          city: 'Lisbon',
          state: 'Lisbon',
          country: 'Portugal',
          description: 'private caption',
          fileSizeInByte: 123_456,
          make: 'Canon',
          model: 'R5',
          lensModel: 'RF 24-70',
          latitude: 38.7223,
          longitude: -9.1393,
          rating: 5,
          tags: ['private'],
          lockedProperties: ['description'],
        }),
        ctx.newTagAsset({ tagIds: [tag.id], assetIds: [asset.id] }),
        ctx.newAssetFile({ assetId: asset.id, type: AssetFileType.Preview, path: 'preview/IMG_0001.jpg' }),
      ]);

      const result = await sut.getAgentMetadataByIds([asset.id]);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: asset.id,
        ownerId: user.id,
        type: asset.type,
        originalFileName: 'IMG_0001.jpg',
        localDateTime: asset.localDateTime,
        fileCreatedAt: asset.fileCreatedAt,
        fileModifiedAt: asset.fileModifiedAt,
        isFavorite: true,
        visibility: AssetVisibility.Timeline,
        exifInfo: expect.objectContaining({
          city: 'Lisbon',
          state: 'Lisbon',
          country: 'Portugal',
          make: 'Canon',
          model: 'R5',
          lensModel: 'RF 24-70',
          latitude: 38.7223,
          longitude: -9.1393,
          rating: 5,
        }),
        tags: [expect.objectContaining({ id: tag.id, value: 'Portugal' })],
      });
      expect(result[0]).not.toHaveProperty('originalPath');
      expect(result[0]).not.toHaveProperty('checksum');
      expect(result[0]).not.toHaveProperty('files');
      expect(result[0]).not.toHaveProperty('faces');
      expect(result[0].exifInfo).not.toHaveProperty('description');
      expect(result[0].exifInfo).not.toHaveProperty('fileSizeInByte');
      expect(result[0].exifInfo).not.toHaveProperty('tags');
      expect(result[0].exifInfo).not.toHaveProperty('lockedProperties');
      expect(result[0].exifInfo).not.toHaveProperty('updatedAt');
      expect(result[0].exifInfo).not.toHaveProperty('updateId');
    });
  });

  describe('searchAgentMetadata', () => {
    const agentScope = { owned: true, sharedSpaces: false, locked: false };

    it('searches agent asset metadata without paths or media file rows', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({
        ownerId: user.id,
        originalFileName: 'lisbon.jpg',
        originalPath: '/uploads/user/original/lisbon.jpg',
      });
      const tag = await ctx.get(TagRepository).upsertValue({ userId: user.id, value: 'Lisbon' });
      await Promise.all([
        ctx.newExif({ assetId: asset.id, city: 'Lisbon', country: 'Portugal', make: 'Canon', model: 'R5' }),
        ctx.newTagAsset({ tagIds: [tag.id], assetIds: [asset.id] }),
        ctx.newAssetFile({ assetId: asset.id, type: AssetFileType.Preview, path: 'preview/lisbon.jpg' }),
      ]);

      const result = await sut.searchAgentMetadata({
        userId: user.id,
        filters: { city: 'Lisbon', country: 'Portugal' },
        limit: 10,
        scope: agentScope,
      });

      expect(result).toMatchObject({
        nextPage: null,
        assets: [
          expect.objectContaining({
            id: asset.id,
            ownerId: user.id,
            originalFileName: 'lisbon.jpg',
            exifInfo: expect.objectContaining({ city: 'Lisbon', country: 'Portugal' }),
            tags: [expect.objectContaining({ id: tag.id, value: 'Lisbon' })],
          }),
        ],
      });
      expect(JSON.stringify(result.assets)).not.toContain(asset.originalPath);
      expect(JSON.stringify(result.assets)).not.toContain('preview/lisbon.jpg');
    });

    it('enforces owned, shared-space, locked, deleted, and offline scope', async () => {
      const { ctx, sut } = setup();
      const { user: viewer } = await ctx.newUser();
      const { user: owner } = await ctx.newUser();
      const { asset: owned } = await ctx.newAsset({ ownerId: viewer.id, visibility: AssetVisibility.Timeline });
      const { asset: locked } = await ctx.newAsset({ ownerId: viewer.id, visibility: AssetVisibility.Locked });
      const { asset: deleted } = await ctx.newAsset({ ownerId: viewer.id, deletedAt: new Date() });
      const { asset: offline } = await ctx.newAsset({ ownerId: viewer.id, isOffline: true });
      const { asset: shared } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Timeline });
      const { space } = await ctx.newSharedSpace({ createdById: owner.id });
      await Promise.all([
        ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: SharedSpaceRole.Viewer }),
        ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: shared.id, addedById: owner.id }),
        ctx.newExif({ assetId: owned.id, country: 'Portugal' }),
        ctx.newExif({ assetId: locked.id, country: 'Portugal' }),
        ctx.newExif({ assetId: deleted.id, country: 'Portugal' }),
        ctx.newExif({ assetId: offline.id, country: 'Portugal' }),
        ctx.newExif({ assetId: shared.id, country: 'Portugal' }),
      ]);

      await expect(
        sut.searchAgentMetadata({
          userId: viewer.id,
          filters: { country: 'Portugal' },
          limit: 10,
          scope: { owned: true, sharedSpaces: false, locked: false },
        }),
      ).resolves.toMatchObject({ assets: [expect.objectContaining({ id: owned.id })] });

      const withShared = await sut.searchAgentMetadata({
        userId: viewer.id,
        filters: { country: 'Portugal' },
        limit: 10,
        scope: { owned: true, sharedSpaces: true, locked: false },
      });
      expect(withShared.assets.map(({ id }) => id).toSorted()).toEqual([owned.id, shared.id].toSorted());

      const withLocked = await sut.searchAgentMetadata({
        userId: viewer.id,
        filters: { country: 'Portugal' },
        limit: 10,
        scope: { owned: true, sharedSpaces: false, locked: true },
      });
      expect(withLocked.assets.map(({ id }) => id).toSorted()).toEqual([locked.id, owned.id].toSorted());
    });

    it('excludes hidden assets when locked assets are included in agent metadata search', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset: hidden } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Hidden });
      const { asset: locked } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Locked });
      await Promise.all([
        ctx.newExif({ assetId: hidden.id, country: 'Portugal' }),
        ctx.newExif({ assetId: locked.id, country: 'Portugal' }),
      ]);

      const result = await sut.searchAgentMetadata({
        userId: user.id,
        filters: { country: 'Portugal' },
        limit: 10,
        scope: { owned: true, sharedSpaces: false, locked: true },
      });

      expect(result.assets.map(({ id }) => id)).toEqual([locked.id]);
    });

    it('includes archived assets in normal agent metadata search', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Archive });
      await ctx.newExif({ assetId: asset.id, country: 'Portugal' });

      const result = await sut.searchAgentMetadata({
        userId: user.id,
        filters: { country: 'Portugal' },
        limit: 10,
        scope: agentScope,
      });

      expect(result.assets.map(({ id }) => id)).toEqual([asset.id]);
    });

    it('returns visible shared-space assets but not owned assets for shared-only scope', async () => {
      const { ctx, sut } = setup();
      const { user: viewer } = await ctx.newUser();
      const { user: owner } = await ctx.newUser();
      const { asset: owned } = await ctx.newAsset({ ownerId: viewer.id, visibility: AssetVisibility.Timeline });
      const { asset: shared } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Archive });
      const { asset: hiddenShared } = await ctx.newAsset({ ownerId: owner.id, visibility: AssetVisibility.Hidden });
      const { space } = await ctx.newSharedSpace({ createdById: owner.id });
      await Promise.all([
        ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: SharedSpaceRole.Viewer }),
        ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: shared.id, addedById: owner.id }),
        ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: hiddenShared.id, addedById: owner.id }),
        ctx.newExif({ assetId: owned.id, country: 'Portugal' }),
        ctx.newExif({ assetId: shared.id, country: 'Portugal' }),
        ctx.newExif({ assetId: hiddenShared.id, country: 'Portugal' }),
      ]);

      const result = await sut.searchAgentMetadata({
        userId: viewer.id,
        filters: { country: 'Portugal' },
        limit: 10,
        scope: { owned: false, sharedSpaces: true, locked: false },
      });

      expect(result.assets.map(({ id }) => id)).toEqual([shared.id]);
    });
  });

  describe('agent media references', () => {
    it('returns preview references in requested order without filesystem paths and omits missing ids', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset: first } = await ctx.newAsset({ ownerId: user.id, originalFileName: 'first.jpg' });
      const { asset: second } = await ctx.newAsset({ ownerId: user.id, originalFileName: 'second.jpg' });
      const { asset: missingPreview } = await ctx.newAsset({ ownerId: user.id, originalFileName: 'missing.jpg' });
      await Promise.all([
        ctx.newExif({ assetId: first.id, exifImageWidth: 100, exifImageHeight: 80 }),
        ctx.newExif({ assetId: second.id, exifImageWidth: 200, exifImageHeight: 160 }),
        ctx.newAssetFile({ assetId: first.id, type: AssetFileType.Preview, path: 'preview/first.jpg' }),
        ctx.newAssetFile({ assetId: second.id, type: AssetFileType.Preview, path: 'preview/second.jpg' }),
      ]);

      const result = await sut.getAgentPreviewReferencesByIds([second.id, missingPreview.id, factory.uuid(), first.id]);

      expect(result).toEqual([
        {
          assetId: second.id,
          mediaUrl: `/api/assets/${second.id}/thumbnail?size=preview`,
          mimeType: 'image/jpeg',
          fileName: 'second.jpg',
          width: 200,
          height: 160,
        },
        {
          assetId: first.id,
          mediaUrl: `/api/assets/${first.id}/thumbnail?size=preview`,
          mimeType: 'image/jpeg',
          fileName: 'first.jpg',
          width: 100,
          height: 80,
        },
      ]);
      expect(JSON.stringify(result)).not.toContain('preview/second.jpg');
    });

    it('returns original references in requested order without filesystem paths and omits missing ids', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset: first } = await ctx.newAsset({
        ownerId: user.id,
        originalFileName: 'first.jpg',
        originalPath: '/uploads/original/first.jpg',
      });
      const { asset: second } = await ctx.newAsset({
        ownerId: user.id,
        originalFileName: 'second.png',
        originalPath: '/uploads/original/second.png',
      });
      await Promise.all([
        ctx.newExif({ assetId: first.id, exifImageWidth: 300, exifImageHeight: 200 }),
        ctx.newExif({ assetId: second.id, exifImageWidth: 640, exifImageHeight: 480 }),
      ]);

      const result = await sut.getAgentOriginalReferencesByIds([second.id, factory.uuid(), first.id]);

      expect(result).toEqual([
        {
          assetId: second.id,
          mediaUrl: `/api/assets/${second.id}/original`,
          mimeType: 'image/png',
          fileName: 'second.png',
          width: 640,
          height: 480,
        },
        {
          assetId: first.id,
          mediaUrl: `/api/assets/${first.id}/original`,
          mimeType: 'image/jpeg',
          fileName: 'first.jpg',
          width: 300,
          height: 200,
        },
      ]);
      expect(JSON.stringify(result)).not.toContain(first.originalPath);
      expect(JSON.stringify(result)).not.toContain(second.originalPath);
    });

    it('infers original media reference MIME types from supported file names', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id, originalFileName: 'image.heic' });

      const result = await sut.getAgentOriginalReferencesByIds([asset.id]);

      expect(result[0]).toMatchObject({
        assetId: asset.id,
        mimeType: mimeTypes.lookup('image.heic'),
        fileName: 'image.heic',
      });
    });
  });

  describe('getAgentLockedIds', () => {
    it('returns only requested locked asset ids', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset: locked } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Locked });
      const { asset: timeline } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
      const { asset: nonRequestedLocked } = await ctx.newAsset({
        ownerId: user.id,
        visibility: AssetVisibility.Locked,
      });

      const result = await sut.getAgentLockedIds(new Set([locked.id, timeline.id]));

      expect(result).toEqual(new Set([locked.id]));
      expect(result).not.toContain(timeline.id);
      expect(result).not.toContain(nonRequestedLocked.id);
    });
  });

  describe('upsertExif', () => {
    it('should append to locked columns', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newExif({
        assetId: asset.id,
        dateTimeOriginal: '2023-11-19T18:11:00',
        lockedProperties: ['dateTimeOriginal'],
      });

      await expect(
        ctx.database
          .selectFrom('asset_exif')
          .select('lockedProperties')
          .where('assetId', '=', asset.id)
          .executeTakeFirstOrThrow(),
      ).resolves.toEqual({ lockedProperties: ['dateTimeOriginal'] });

      await sut.upsertExif(
        { assetId: asset.id, lockedProperties: ['description'] },
        { lockedPropertiesBehavior: 'append' },
      );

      await expect(
        ctx.database
          .selectFrom('asset_exif')
          .select('lockedProperties')
          .where('assetId', '=', asset.id)
          .executeTakeFirstOrThrow(),
      ).resolves.toEqual({ lockedProperties: ['description', 'dateTimeOriginal'] });
    });

    it('should deduplicate locked columns', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newExif({
        assetId: asset.id,
        dateTimeOriginal: '2023-11-19T18:11:00',
        lockedProperties: ['dateTimeOriginal', 'description'],
      });

      await expect(
        ctx.database
          .selectFrom('asset_exif')
          .select('lockedProperties')
          .where('assetId', '=', asset.id)
          .executeTakeFirstOrThrow(),
      ).resolves.toEqual({ lockedProperties: ['dateTimeOriginal', 'description'] });

      await sut.upsertExif(
        { assetId: asset.id, lockedProperties: ['description'] },
        { lockedPropertiesBehavior: 'append' },
      );

      await expect(
        ctx.database
          .selectFrom('asset_exif')
          .select('lockedProperties')
          .where('assetId', '=', asset.id)
          .executeTakeFirstOrThrow(),
      ).resolves.toEqual({ lockedProperties: ['description', 'dateTimeOriginal'] });
    });
  });

  describe('stale asset job writes', () => {
    it('should ignore job status upserts for assets deleted by another worker', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });

      await sut.remove(asset);

      await expect(sut.upsertJobStatus({ assetId: asset.id, metadataExtractedAt: new Date() })).resolves.toBe(
        undefined,
      );
      await expect(
        ctx.database
          .selectFrom('asset_job_status')
          .select('assetId')
          .where('assetId', '=', asset.id)
          .executeTakeFirst(),
      ).resolves.toBeUndefined();
    });

    it('should ignore file upserts for assets deleted by another worker', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });

      await sut.remove(asset);

      await expect(
        sut.upsertFile({ assetId: asset.id, type: AssetFileType.Preview, path: 'preview.jpg' }),
      ).resolves.toBe(undefined);
      await expect(
        ctx.database.selectFrom('asset_file').select('assetId').where('assetId', '=', asset.id).executeTakeFirst(),
      ).resolves.toBeUndefined();
    });

    it('should keep valid job status upserts when a bulk write includes a deleted asset', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset: deletedAsset } = await ctx.newAsset({ ownerId: user.id });
      const { asset: existingAsset } = await ctx.newAsset({ ownerId: user.id });
      const metadataExtractedAt = new Date();

      await sut.remove(deletedAsset);

      await expect(
        sut.upsertJobStatus(
          { assetId: deletedAsset.id, metadataExtractedAt },
          { assetId: existingAsset.id, metadataExtractedAt },
        ),
      ).resolves.toBe(undefined);
      await expect(
        ctx.database
          .selectFrom('asset_job_status')
          .select(['assetId', 'metadataExtractedAt'])
          .where('assetId', '=', existingAsset.id)
          .executeTakeFirst(),
      ).resolves.toEqual({ assetId: existingAsset.id, metadataExtractedAt });
    });

    it('should keep valid file upserts when a bulk write includes a deleted asset', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset: deletedAsset } = await ctx.newAsset({ ownerId: user.id });
      const { asset: existingAsset } = await ctx.newAsset({ ownerId: user.id });

      await sut.remove(deletedAsset);

      await expect(
        sut.upsertFiles([
          { assetId: deletedAsset.id, type: AssetFileType.Preview, path: 'deleted-preview.jpg' },
          { assetId: existingAsset.id, type: AssetFileType.Preview, path: 'existing-preview.jpg' },
        ]),
      ).resolves.toBe(undefined);
      await expect(
        ctx.database
          .selectFrom('asset_file')
          .select(['assetId', 'path'])
          .where('assetId', '=', existingAsset.id)
          .executeTakeFirst(),
      ).resolves.toEqual({ assetId: existingAsset.id, path: 'existing-preview.jpg' });
    });
  });

  describe('unlockProperties', () => {
    it('should unlock one property', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newExif({
        assetId: asset.id,
        dateTimeOriginal: '2023-11-19T18:11:00',
        lockedProperties: ['dateTimeOriginal', 'description'],
      });

      await expect(
        ctx.database
          .selectFrom('asset_exif')
          .select('lockedProperties')
          .where('assetId', '=', asset.id)
          .executeTakeFirstOrThrow(),
      ).resolves.toEqual({ lockedProperties: ['dateTimeOriginal', 'description'] });

      await sut.unlockProperties(asset.id, ['dateTimeOriginal']);

      await expect(
        ctx.database
          .selectFrom('asset_exif')
          .select('lockedProperties')
          .where('assetId', '=', asset.id)
          .executeTakeFirstOrThrow(),
      ).resolves.toEqual({ lockedProperties: ['description'] });
    });

    it('should unlock all properties', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newExif({
        assetId: asset.id,
        dateTimeOriginal: '2023-11-19T18:11:00',
        lockedProperties: ['dateTimeOriginal', 'description'],
      });

      await expect(
        ctx.database
          .selectFrom('asset_exif')
          .select('lockedProperties')
          .where('assetId', '=', asset.id)
          .executeTakeFirstOrThrow(),
      ).resolves.toEqual({ lockedProperties: ['dateTimeOriginal', 'description'] });

      await sut.unlockProperties(asset.id, ['description', 'dateTimeOriginal']);

      await expect(
        ctx.database
          .selectFrom('asset_exif')
          .select('lockedProperties')
          .where('assetId', '=', asset.id)
          .executeTakeFirstOrThrow(),
      ).resolves.toEqual({ lockedProperties: null });
    });
  });

  describe('getTimeBucket with spacePersonIds', () => {
    it('should only return assets whose matching face is visible and not deleted when filtering by spacePersonId', async () => {
      const { ctx, sut } = setup();
      const sharedSpaceRepo = ctx.get(SharedSpaceRepository);

      const { user } = await ctx.newUser();
      const auth = factory.auth({ user: { id: user.id } });
      const { space } = await ctx.newSharedSpace({ createdById: user.id });

      const bucketDate = new Date('2026-03-15T12:00:00.000Z');
      const assetInput = {
        ownerId: user.id,
        visibility: AssetVisibility.Timeline,
        fileCreatedAt: bucketDate,
        localDateTime: bucketDate,
      };

      const { asset: assetVisible } = await ctx.newAsset(assetInput);
      const { asset: assetInvisibleFace } = await ctx.newAsset(assetInput);
      const { asset: assetDeletedFace } = await ctx.newAsset(assetInput);

      await Promise.all([
        ctx.newExif({ assetId: assetVisible.id, timeZone: 'UTC' }),
        ctx.newExif({ assetId: assetInvisibleFace.id, timeZone: 'UTC' }),
        ctx.newExif({ assetId: assetDeletedFace.id, timeZone: 'UTC' }),
      ]);

      const { assetFace: visibleFace } = await ctx.newAssetFace({ assetId: assetVisible.id, isVisible: true });
      const { assetFace: invisibleFace } = await ctx.newAssetFace({
        assetId: assetInvisibleFace.id,
        isVisible: false,
      });
      const { assetFace: deletedFace } = await ctx.newAssetFace({
        assetId: assetDeletedFace.id,
        isVisible: true,
        deletedAt: new Date(),
      });

      const spacePerson = await sharedSpaceRepo.createPerson({
        spaceId: space.id,
        name: 'Test',
        representativeFaceId: visibleFace.id,
        type: 'person',
      });
      await sharedSpaceRepo.addPersonFaces(
        [
          { personId: spacePerson.id, assetFaceId: visibleFace.id },
          { personId: spacePerson.id, assetFaceId: invisibleFace.id },
          { personId: spacePerson.id, assetFaceId: deletedFace.id },
        ],
        { skipRecount: true },
      );

      const bucket = await sut.getTimeBucket(
        '2026-03-01',
        {
          userIds: [user.id],
          spacePersonIds: [spacePerson.id],
          visibility: AssetVisibility.Timeline,
        },
        auth,
      );

      const assets = JSON.parse(bucket.assets) as TimeBucketAssets;
      expect(assets.id.toSorted()).toEqual([assetVisible.id]);
    });

    it('should filter time bucket assets by face identity ids', async () => {
      const { ctx, sut } = setup();
      const faceIdentityRepository = ctx.get(FaceIdentityRepository);

      const { user } = await ctx.newUser();
      const auth = factory.auth({ user: { id: user.id } });

      const bucketDate = new Date('2026-03-15T12:00:00.000Z');
      const assetInput = {
        ownerId: user.id,
        visibility: AssetVisibility.Timeline,
        fileCreatedAt: bucketDate,
        localDateTime: bucketDate,
      };

      const { asset: matchingAsset } = await ctx.newAsset(assetInput);
      const { asset: nonMatchingAsset } = await ctx.newAsset(assetInput);
      await Promise.all([
        ctx.newExif({ assetId: matchingAsset.id, timeZone: 'UTC' }),
        ctx.newExif({ assetId: nonMatchingAsset.id, timeZone: 'UTC' }),
      ]);

      const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Alice' });
      const { assetFace } = await ctx.newAssetFace({ assetId: matchingAsset.id, personId: person.id, isVisible: true });
      const identity = await faceIdentityRepository.ensurePersonIdentity(person.id);
      await faceIdentityRepository.linkFace({ assetFaceId: assetFace.id, identityId: identity.id, source: 'manual' });

      const bucket = await sut.getTimeBucket(
        '2026-03-01',
        {
          userIds: [user.id],
          identityIds: [identity.id],
          visibility: AssetVisibility.Timeline,
        },
        auth,
      );

      const assets = JSON.parse(bucket.assets) as TimeBucketAssets;
      expect(assets.id).toEqual([matchingAsset.id]);
    });
  });
});
