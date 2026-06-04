import { Kysely } from 'kysely';
import { ConfigRepository } from 'src/repositories/config.repository';
import { FaceRepairScanRepository, RepairScanParams } from 'src/repositories/face-repair-scan.repository';
import { FaceRepairRepository } from 'src/repositories/face-repair.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { SearchRepository } from 'src/repositories/search.repository';
import { SystemMetadataRepository } from 'src/repositories/system-metadata.repository';
import { DB } from 'src/schema';
import { FaceRepairService } from 'src/services/face-repair.service';
import { mediumFactory, newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

// Two clusters on disjoint embedding axes — maximally dissimilar (cosine distance ~1.0),
// standing in for two genuinely different people.
const axisEmbedding = (axis: 'first' | 'second') => {
  const values = Array.from({ length: 512 }, (_, index) => {
    const inFirstHalf = index < 256;
    return (axis === 'first' ? inFirstHalf : !inFirstHalf) ? 1 : 0;
  });
  return '[' + values.join(',') + ']';
};

const PARAMS: RepairScanParams = {
  maxDistance: 0.6,
  minFaces: 3,
  voteWindow: 50,
  voteMargin: 2,
  maxAttributionDistance: 0.35,
  maxFlaggedFraction: 0.5,
  largeClusterThreshold: 50,
};

let db: Kysely<DB>;

const setup = () =>
  newMediumService(FaceRepairService, {
    database: db,
    real: [
      FaceRepairRepository,
      FaceRepairScanRepository,
      SearchRepository,
      PersonRepository,
      ConfigRepository,
      SystemMetadataRepository,
    ],
    mock: [LoggingRepository, JobRepository],
  });

beforeAll(async () => {
  db = await getKyselyDB();
});

afterEach(() => db.deleteFrom('face_repair_scan').execute());

describe('FaceRepairService.handleFaceRepairScan', () => {
  it('getLatestScan returns null when no scan row exists', async () => {
    const { sut } = setup();
    const result = await sut.getLatestScanStatus();
    expect(result).toBeNull();
  });

  it('clean instance: handleFaceRepairScan completes with empty report (no flagged faces), not failed', async () => {
    const { sut, ctx } = setup();
    const scanRepo = ctx.get(FaceRepairScanRepository);

    // Create a fresh user with no faces — nothing eligible → empty scan
    await ctx.newUser();

    const scan = await scanRepo.createScan({ requestedBy: null, params: PARAMS });

    await sut.handleFaceRepairScan({ scanId: scan.id });

    const latest = await sut.getLatestScanStatus();
    expect(latest).not.toBeNull();
    expect(latest!.status).toBe('completed');
    expect(latest!.persons).toEqual([]);
    expect(latest!.totals).not.toBeNull();
    expect(latest!.totals!.eligibleFaces).toBe(0);
    expect(latest!.totals!.flaggedFaces).toBe(0);
  });

  it('handleFaceRepairScan with flagged person: scan completes with persons having recommendation + reviewReasons', async () => {
    const { sut, ctx } = setup();
    const scanRepo = ctx.get(FaceRepairScanRepository);
    const { user } = await ctx.newUser();

    // Karina-main: 10 first-axis faces (the reference cluster)
    const karinaData = mediumFactory.personInsert({ ownerId: user.id, name: 'Karina' });
    await db.insertInto('person').values(karinaData).execute();
    for (let i = 0; i < 10; i++) {
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: karinaData.id });
      await db
        .insertInto('face_search')
        .values({ faceId: assetFace.id, embedding: axisEmbedding('first') })
        .execute();
    }

    // Alexia: 3 leaked first-axis faces + 8 genuine second-axis → under cap → toRepair
    // Named person → should get recommendation='review-first' with reason 'named'
    const alexiaData = mediumFactory.personInsert({ ownerId: user.id, name: 'Alexia' });
    await db.insertInto('person').values(alexiaData).execute();
    for (let i = 0; i < 3; i++) {
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: alexiaData.id });
      await db
        .insertInto('face_search')
        .values({ faceId: assetFace.id, embedding: axisEmbedding('first') })
        .execute();
    }
    for (let i = 0; i < 8; i++) {
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: alexiaData.id });
      await db
        .insertInto('face_search')
        .values({ faceId: assetFace.id, embedding: axisEmbedding('second') })
        .execute();
    }

    const scan = await scanRepo.createScan({ requestedBy: null, params: PARAMS });
    await sut.handleFaceRepairScan({ scanId: scan.id });

    const latest = await sut.getLatestScanStatus();
    expect(latest).not.toBeNull();
    expect(latest!.status).toBe('completed');
    expect(latest!.totals).not.toBeNull();
    expect(latest!.totals!.flaggedFaces).toBeGreaterThan(0);
    expect(latest!.persons.length).toBeGreaterThan(0);

    // Alexia is a named person with flagged faces → review-first with 'named' reason
    const alexiaPerson = latest!.persons.find((p) => p.personId === alexiaData.id);
    expect(alexiaPerson).toBeDefined();
    expect(alexiaPerson!.recommendation).toBe('review-first');
    expect(alexiaPerson!.reviewReasons).toContain('named');
    expect(alexiaPerson!.flagged).toBeGreaterThan(0);
    expect(alexiaPerson!.suspectedOwners.length).toBeGreaterThan(0);
  });
});
