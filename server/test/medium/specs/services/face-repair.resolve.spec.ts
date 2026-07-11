import { BadRequestException, ConflictException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { SourceType } from 'src/enum';
import { ConfigRepository } from 'src/repositories/config.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { FaceRepairDeclineRepository } from 'src/repositories/face-repair-decline.repository';
import { FaceRepairLockRepository } from 'src/repositories/face-repair-lock.repository';
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
import { applyDeclineFilters } from 'src/utils/face-repair';
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
      FaceRepairLockRepository,
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

  it('keeps a drained NAMED source person after all its eligible faces move (M8)', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Jane Doe' });
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

    // A NAMED source is kept even though it's fully drained of eligible faces (unlike the unnamed case above).
    const sourceRow = await db
      .selectFrom('person')
      .select(['id', 'name'])
      .where('id', '=', source.id)
      .executeTakeFirst();
    expect(sourceRow).toBeDefined();
    expect(sourceRow?.name).toBe('Jane Doe');

    // Still drained from the console/scan even though the person row itself survives.
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).not.toContain(source.id);
  });
});

// ── M15: zero-override — the default owner group covers every flagged face (E10) ───────────────────

describe('FaceRepairService.resolveFaces: zero-override all-to-owner (M15, E10)', () => {
  it('moves every flagged face via the single default owner group and drains the (unnamed) person', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });

    const f1 = await seedFace(ctx, user.id, source.id);
    const f2 = await seedFace(ctx, user.id, source.id);
    const f3 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [
      { assetFaceId: f1, suspectedOwnerId: owner.id },
      { assetFaceId: f2, suspectedOwnerId: owner.id },
      { assetFaceId: f3, suspectedOwnerId: owner.id },
    ]);

    // The whole point of "zero-override": there is exactly ONE moveToPerson group — the default owner — and
    // it contains every flagged face on the person, i.e. the admin never touched the per-face destination.
    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: owner.id, faceIds: [f1, f2, f3] }],
        stay: [],
        lock: [],
        detach: [],
      },
      user.id,
    );

    expect(result).toEqual({ moved: 3, declined: 0, locked: 0, detached: 0, skipped: 0 });

    const byId = await personIdsOf([f1, f2, f3]);
    expect(byId[f1]).toBe(owner.id);
    expect(byId[f2]).toBe(owner.id);
    expect(byId[f3]).toBe(owner.id);

    // Unnamed source has zero remaining faces of any kind → auto-deleted (E6), and drained from the scan.
    const sourceRow = await db.selectFrom('person').select('id').where('id', '=', source.id).executeTakeFirst();
    expect(sourceRow).toBeUndefined();

    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).not.toContain(source.id);
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

// ── M19: an empty resolve is rejected outright, never drains the person (E16) ──────────────────────

describe('FaceRepairService.resolveFaces: empty resolve is rejected (M19, E16)', () => {
  it('throws BadRequestException when every bucket is empty and entireCluster is absent, and does not drain the person', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: owner.id }]);

    await expect(
      sut.resolveFaces(
        {
          personId: source.id,
          moveToPerson: [],
          stay: [],
          lock: [],
          detach: [],
        },
        user.id,
      ),
    ).rejects.toThrow(new BadRequestException('Resolve request has no faces to act on'));

    // The face is untouched...
    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(source.id);

    // ...and — unlike today's bug — the person is NOT drained from the latest scan.
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).toContain(source.id);

    const sourceRow = await db.selectFrom('person').select('id').where('id', '=', source.id).executeTakeFirst();
    expect(sourceRow).toBeDefined();
  });
});

// ── Slice 2: soft-stay ("Keep here") ────────────────────────────────────────────────────────────────

const declineRowsFor = (assetFaceId: string, suspectedOwnerId: string) =>
  db
    .selectFrom('face_repair_decline')
    .select(['id', 'declinedBy'])
    .where('type', '=', 'face')
    .where('assetFaceId', '=', assetFaceId)
    .where('suspectedOwnerId', '=', suspectedOwnerId)
    .execute();

describe('FaceRepairService.resolveFaces: soft-stay (M4, E3)', () => {
  it('writes a face_repair_decline row for the stayed face and its stored suspected owner', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    const result = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [f1], lock: [], detach: [] },
      user.id,
    );

    expect(result).toEqual({ moved: 0, declined: 1, locked: 0, detached: 0, skipped: 0 });

    const rows = await declineRowsFor(f1, ownerA.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].declinedBy).toBe(user.id);

    // The face itself is untouched (soft-stay never moves anything).
    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(source.id);
  });

  it('a re-flagged pairing toward the SAME declined owner is silently skipped by move-to-owner, but a genuinely different owner still moves', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: ownerB } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);
    await sut.resolveFaces({ personId: source.id, moveToPerson: [], stay: [f1], lock: [], detach: [] }, user.id);

    // Simulate a later scan flagging the exact same (face, owner) pairing again (the real scan never would —
    // it consults declines before flagging — but resolveFaces re-applies the decline filter independently of
    // how the snapshot got there, so this exercises that seam directly).
    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);
    const skippedResult = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: ownerA.id, faceIds: [f1] }],
        stay: [],
        lock: [],
        detach: [],
      },
      user.id,
    );
    expect(skippedResult.moved).toBe(0);
    expect(skippedResult.skipped).toBe(1);
    const stillOnSource = await personIdsOf([f1]);
    expect(stillOnSource[f1]).toBe(source.id);

    // A genuinely different owner is a real new problem (E3) and still moves.
    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerB.id }]);
    const movedResult = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: ownerB.id, faceIds: [f1] }],
        stay: [],
        lock: [],
        detach: [],
      },
      user.id,
    );
    expect(movedResult.moved).toBe(1);
    const movedOwner = await personIdsOf([f1]);
    expect(movedOwner[f1]).toBe(ownerB.id);
  });
});

describe('FaceRepairService.resolveFaces: stay-only drains the person (M11, E13)', () => {
  it('removes the person from the latest scan snapshot even though nothing moved', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    const result = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [f1], lock: [], detach: [] },
      user.id,
    );

    expect(result.moved).toBe(0);

    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).not.toContain(source.id);

    // The (unnamed) source is not auto-deleted — the face is still there, just no longer flagged (E13 is
    // about draining from the CONSOLE, not deleting the person).
    const sourceRow = await db.selectFrom('person').select('id').where('id', '=', source.id).executeTakeFirst();
    expect(sourceRow).toBeDefined();
  });
});

describe('FaceRepairService.resolveFaces: disjoint buckets — stay overlapping move (M7, E7)', () => {
  it('throws BadRequestException when a face is present in both moveToPerson and stay', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    await expect(
      sut.resolveFaces(
        {
          personId: source.id,
          moveToPerson: [{ destinationPersonId: ownerA.id, faceIds: [f1] }],
          stay: [f1],
          lock: [],
          detach: [],
        },
        user.id,
      ),
    ).rejects.toThrow(new BadRequestException('A face cannot be resolved more than one way in the same request'));

    // No side effects: untouched, no decline written, person still in the scan snapshot.
    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(source.id);
    const rows = await declineRowsFor(f1, ownerA.id);
    expect(rows).toHaveLength(0);
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).toContain(source.id);
  });
});

describe('FaceRepairService.resolveFaces: stay on a non-flagged face (M14, E15)', () => {
  it('throws BadRequestException when a stay id is not in the flagged snapshot for this person', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);
    // A rest-of-cluster face on the same person that was never part of the flagged snapshot.
    const notFlagged = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    await expect(
      sut.resolveFaces({ personId: source.id, moveToPerson: [], stay: [notFlagged], lock: [], detach: [] }, user.id),
    ).rejects.toThrow(new BadRequestException('Some faces are not in the flagged snapshot for this person'));

    const byId = await personIdsOf([notFlagged]);
    expect(byId[notFlagged]).toBe(source.id);
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).toContain(source.id);
  });
});

describe('FaceRepairService.resolveFaces: re-soft-stay is idempotent (M22, E20)', () => {
  it('re-staying an already-declined (face, suspectedOwner) succeeds with no error and exactly one decline row', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    const first = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [f1], lock: [], detach: [] },
      user.id,
    );
    expect(first.declined).toBe(1);

    // Re-submit the identical stay request (double-click / retry) against the same still-standing snapshot row.
    const second = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [f1], lock: [], detach: [] },
      user.id,
    );
    expect(second).toEqual({ moved: 0, declined: 0, locked: 0, detached: 0, skipped: 0 });

    const rows = await declineRowsFor(f1, ownerA.id);
    expect(rows).toHaveLength(1);
  });
});

// ── Slice 3: confirm/lock ("Confirm / lock", owner-agnostic) ──────────────────────────────────────

const lockRowsFor = (assetFaceId: string) =>
  db
    .selectFrom('face_repair_lock')
    .select(['id', 'personId', 'createdBy'])
    .where('assetFaceId', '=', assetFaceId)
    .execute();

describe('FaceRepairService.resolveFaces: confirm/lock (M5, E2)', () => {
  it('inserts a face_repair_lock row for the locked face, recording the reviewed person and admin', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    const result = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [], lock: [f1], detach: [] },
      user.id,
    );

    expect(result).toEqual({ moved: 0, declined: 0, locked: 1, detached: 0, skipped: 0 });

    const rows = await lockRowsFor(f1);
    expect(rows).toHaveLength(1);
    expect(rows[0].personId).toBe(source.id);
    expect(rows[0].createdBy).toBe(user.id);

    // The face itself is untouched (lock never moves anything).
    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(source.id);
  });

  it('drops a locked face for ANY future suspected owner via the real getDeclineMaps → applyDeclineFilters seam', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: ownerB } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);
    await sut.resolveFaces({ personId: source.id, moveToPerson: [], stay: [], lock: [f1], detach: [] }, user.id);

    // A LATER scan pass re-suspects the SAME face toward a DIFFERENT owner (the age-gap childhood-photo case).
    // Exercise the exact seam buildRepairPlan uses in production: a real, unscoped getDeclineMaps() read
    // followed by applyDeclineFilters — the lock must drop f1 regardless of which owner is now proposed.
    const declineRepo = ctx.get(FaceRepairDeclineRepository);
    const maps = await declineRepo.getDeclineMaps();
    const flaggedByPerson = new Map([
      [source.id, [{ assetFaceId: f1, currentPersonId: source.id, suspectedOwnerId: ownerB.id }]],
    ]);
    applyDeclineFilters(flaggedByPerson, maps);

    expect(flaggedByPerson.get(source.id)).toEqual([]);
  });

  it('re-locking an already-locked face is idempotent: no error, exactly one lock row', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);
    const first = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [], lock: [f1], detach: [] },
      user.id,
    );
    expect(first.locked).toBe(1);

    // A later scan re-flags the exact same face (still on the same person) and the admin re-submits the
    // identical lock request (double-click / retry, or simply re-confirming an already-locked face).
    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);
    const second = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [], lock: [f1], detach: [] },
      user.id,
    );
    expect(second).toEqual({ moved: 0, declined: 0, locked: 0, detached: 0, skipped: 0 });

    const rows = await lockRowsFor(f1);
    expect(rows).toHaveLength(1);
  });
});

describe('FaceRepairService.resolveFaces: lock on a non-flagged face (M14, E15)', () => {
  it('throws BadRequestException when a lock id is not in the flagged snapshot for this person', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);
    // A rest-of-cluster face on the same person that was never part of the flagged snapshot.
    const notFlagged = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    await expect(
      sut.resolveFaces({ personId: source.id, moveToPerson: [], stay: [], lock: [notFlagged], detach: [] }, user.id),
    ).rejects.toThrow(new BadRequestException('Some faces are not in the flagged snapshot for this person'));

    const rows = await lockRowsFor(notFlagged);
    expect(rows).toHaveLength(0);
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).toContain(source.id);
  });
});
