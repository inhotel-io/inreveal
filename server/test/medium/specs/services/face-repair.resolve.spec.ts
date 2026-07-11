import { ConflictException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { SourceType } from 'src/enum';
import { ConfigRepository } from 'src/repositories/config.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { FaceRepairDeclineRepository } from 'src/repositories/face-repair-decline.repository';
import {
  FaceRepairScanRepository,
  RepairScanParams,
  RepairScanPerson,
  RepairScanTotals,
} from 'src/repositories/face-repair-scan.repository';
import { FaceRepairRepository } from 'src/repositories/face-repair.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { SearchRepository } from 'src/repositories/search.repository';
import { SystemMetadataRepository } from 'src/repositories/system-metadata.repository';
import { DB } from 'src/schema';
import { FaceRepairService } from 'src/services/face-repair.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';
import { Mocked } from 'vitest';

const EMBEDDING = '[' + Array.from({ length: 512 }, () => 1).join(',') + ']';

let db: Kysely<DB>;

const setup = () => {
  const { ctx, sut } = newMediumService(FaceRepairService, {
    database: db,
    real: [
      FaceRepairRepository,
      FaceRepairScanRepository,
      FaceRepairDeclineRepository,
      FaceIdentityRepository,
      SearchRepository,
      PersonRepository,
      ConfigRepository,
      DatabaseRepository,
      SystemMetadataRepository,
    ],
    mock: [LoggingRepository, JobRepository],
  });
  const jobMock = ctx.getMock<JobRepository, Mocked<JobRepository>>(JobRepository);
  jobMock.isActive.mockResolvedValue(false);
  jobMock.queueAll.mockResolvedValue();
  return { sut, ctx, jobMock, scanRepo: ctx.get(FaceRepairScanRepository) };
};

type Ctx = ReturnType<typeof setup>['ctx'];

const seedFace = async (ctx: Ctx, ownerId: string, personId: string): Promise<string> => {
  const { asset } = await ctx.newAsset({ ownerId });
  const { assetFace } = await ctx.newAssetFace({
    assetId: asset.id,
    personId,
    sourceType: SourceType.MachineLearning,
  });
  await db.insertInto('face_search').values({ faceId: assetFace.id, embedding: EMBEDDING }).execute();
  return assetFace.id;
};

const scanParams = (): RepairScanParams => ({
  maxDistance: 0.5,
  minFaces: 3,
  voteWindow: 200,
  voteMargin: 2,
  maxAttributionDistance: 0.35,
  maxFlaggedFraction: 0.5,
  largeClusterThreshold: 50,
});

const scanTotals = (affectedPersons: number, flaggedFaces: number): RepairScanTotals => ({
  eligibleFaces: flaggedFaces,
  flaggedFaces,
  toRepair: flaggedFaces,
  reviewOnlyFaces: 0,
  reviewOnlyPersons: 0,
  affectedPersons,
  reviewOnlyByReason: { overCap: 0, badTarget: 0, unAttributable: 0 },
});

const scanPerson = (personId: string, ownerId: string, flagged: number): RepairScanPerson => ({
  personId,
  ownerId,
  personName: null,
  faceCount: flagged,
  thumbnailFaceId: null,
  eligible: flagged,
  flagged,
  flaggedFraction: 1,
  suspectedOwners: [],
  recommendation: 'confident',
  reviewReasons: [],
});

// Seed a completed scan whose stored flagged-face snapshot points `faces` at their given suspected owners,
// bypassing the real ANN scan (which is exercised separately in face-repair.scan.spec.ts). resolveFaces reads
// this snapshot via getScanFlaggedFacesForPersons, exactly like applyRepair does today.
const seedFlaggedSnapshot = async (
  scanRepo: FaceRepairScanRepository,
  userId: string,
  personId: string,
  faces: { assetFaceId: string; suspectedOwnerId: string }[],
) => {
  const scan = await scanRepo.createScan({ requestedBy: userId, params: scanParams() });
  await scanRepo.replaceScanFlaggedFaces(
    scan.id,
    faces.map((f) => ({ assetFaceId: f.assetFaceId, personId, suspectedOwnerId: f.suspectedOwnerId })),
  );
  await scanRepo.completeScan(scan.id, {
    totals: scanTotals(1, faces.length),
    persons: [scanPerson(personId, userId, faces.length)],
  });
  return scan;
};

const personIdsOf = async (faceIds: string[]): Promise<Record<string, string | null>> => {
  const rows = await db.selectFrom('asset_face').select(['id', 'personId']).where('id', 'in', faceIds).execute();
  return Object.fromEntries(rows.map((r) => [r.id, r.personId]));
};

beforeAll(async () => {
  db = await getKyselyDB();
});

afterEach(() => db.deleteFrom('face_repair_scan').execute());

// ── M1 / M3: per-face owner move, multi-owner mixed cluster ────────────────────────────────────────

describe('FaceRepairService.resolveFaces: move-to-owner (M1, M3, E14)', () => {
  it('moves each flagged face to its OWN suspected owner (mixed cluster) and drains the person from the scan', async () => {
    const { sut, ctx, jobMock, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: ownerB } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });

    const f1 = await seedFace(ctx, user.id, source.id);
    const f2 = await seedFace(ctx, user.id, source.id);
    const f3 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [
      { assetFaceId: f1, suspectedOwnerId: ownerA.id },
      { assetFaceId: f2, suspectedOwnerId: ownerA.id },
      { assetFaceId: f3, suspectedOwnerId: ownerB.id },
    ]);

    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [
          { destinationPersonId: ownerA.id, faceIds: [f1, f2] },
          { destinationPersonId: ownerB.id, faceIds: [f3] },
        ],
        stay: [],
        lock: [],
        detach: [],
      },
      user.id,
    );

    expect(result).toEqual({ moved: 3, declined: 0, locked: 0, detached: 0, skipped: 0 });

    const byId = await personIdsOf([f1, f2, f3]);
    expect(byId[f1]).toBe(ownerA.id);
    expect(byId[f2]).toBe(ownerA.id);
    expect(byId[f3]).toBe(ownerB.id);

    // Identities are relinked manually (reuses executeRepair's transaction).
    const idRows = await db
      .selectFrom('face_identity_face')
      .select(['assetFaceId', 'source'])
      .where('assetFaceId', 'in', [f1, f2, f3])
      .execute();
    expect(idRows).toHaveLength(3);
    for (const row of idRows) {
      expect(row.source).toBe('manual');
    }

    // The source person drains from the latest scan snapshot (drop-on-any-resolution).
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).not.toContain(source.id);

    // Never re-queues facial recognition.
    const queuedJobNames = jobMock.queueAll.mock.calls.flatMap(([items]) => items).map((item) => item.name);
    expect(queuedJobNames).not.toContain('FacialRecognition');
  });

  it('deletes the drained UNNAMED source person once every eligible face has moved (E6)', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: owner.id }]);

    await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: owner.id, faceIds: [f1] }],
        stay: [],
        lock: [],
        detach: [],
      },
      user.id,
    );

    const sourceRow = await db.selectFrom('person').select('id').where('id', '=', source.id).executeTakeFirst();
    expect(sourceRow).toBeUndefined();
  });
});

// ── M9: face moved off the person since the scan → skipped ─────────────────────────────────────────

describe('FaceRepairService.resolveFaces: skip stale moves (M9, E1)', () => {
  it('skips a face that moved off the person since the snapshot was taken, and counts it in skipped', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: elsewhere } = await ctx.newPerson({ ownerId: user.id, name: '' });

    const f1 = await seedFace(ctx, user.id, source.id);
    const f2 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [
      { assetFaceId: f1, suspectedOwnerId: owner.id },
      { assetFaceId: f2, suspectedOwnerId: owner.id },
    ]);

    // f1 moved off `source` after the scan ran (e.g. a concurrent manual move) — no longer on-source at write time.
    await db.updateTable('asset_face').set({ personId: elsewhere.id }).where('id', '=', f1).execute();

    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: owner.id, faceIds: [f1, f2] }],
        stay: [],
        lock: [],
        detach: [],
      },
      user.id,
    );

    expect(result.moved).toBe(1);
    expect(result.skipped).toBe(1);

    const byId = await personIdsOf([f1, f2]);
    expect(byId[f1]).toBe(elsewhere.id); // untouched — still on the person it moved to
    expect(byId[f2]).toBe(owner.id); // the still-eligible face moved as requested
  });
});

// ── M10: guard reuse — refuse while FacialRecognition/scan active ──────────────────────────────────

describe('FaceRepairService.resolveFaces: concurrency guards (M10, E9)', () => {
  it('throws ConflictException while FacialRecognition is active, with the review-page conflict message', async () => {
    const { sut, ctx, jobMock } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    jobMock.isActive.mockResolvedValue(true);

    await expect(
      sut.resolveFaces(
        {
          personId: source.id,
          moveToPerson: [{ destinationPersonId: owner.id, faceIds: [f1] }],
          stay: [],
          lock: [],
          detach: [],
        },
        user.id,
      ),
    ).rejects.toThrow(new ConflictException('Refusing to apply while facial recognition is active'));

    // Nothing moved.
    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(source.id);
  });

  it('throws ConflictException while a scan is pending/running, with the review-page conflict message', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: owner.id }]);
    // A second scan is now pending — getLatestScan sees it, not the completed one above.
    await scanRepo.createScan({ requestedBy: user.id, params: scanParams() });

    await expect(
      sut.resolveFaces(
        {
          personId: source.id,
          moveToPerson: [{ destinationPersonId: owner.id, faceIds: [f1] }],
          stay: [],
          lock: [],
          detach: [],
        },
        user.id,
      ),
    ).rejects.toThrow(new ConflictException('Refusing to apply while a scan is in progress'));

    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(source.id);
  });
});
