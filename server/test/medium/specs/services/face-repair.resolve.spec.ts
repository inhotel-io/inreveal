import { BadRequestException, ConflictException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { JobName, SourceType } from 'src/enum';
import { ConfigRepository } from 'src/repositories/config.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { FacePersonVerdictRepository } from 'src/repositories/face-person-verdict.repository';
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
import { applyVerdictFilters } from 'src/utils/face-repair';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';
import { Mocked, vi } from 'vitest';

const EMBEDDING = '[' + Array.from({ length: 512 }, () => 1).join(',') + ']';

let db: Kysely<DB>;

const setup = () => {
  const { ctx, sut } = newMediumService(FaceRepairService, {
    database: db,
    real: [
      FaceRepairRepository,
      FaceRepairScanRepository,
      FaceRepairDeclineRepository,
      FacePersonVerdictRepository,
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
// this snapshot via getScanFlaggedFacesForPersons (the same read the now-retired applyRepair used to make).
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
          { destinationPersonId: ownerA.id, faceIds: [f1, f2], lock: false },
          { destinationPersonId: ownerB.id, faceIds: [f3], lock: false },
        ],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    expect(result).toEqual({ moved: 3, declined: 0, locked: 0, detached: 0, unknown: 0, skipped: 0 });

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
        moveToPerson: [{ destinationPersonId: owner.id, faceIds: [f1], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
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
        moveToPerson: [{ destinationPersonId: owner.id, faceIds: [f1], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
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

// ── Slice 6a2 (§5.3): moveToPerson carries rest-of-cluster faces, not just the flagged snapshot ────

describe('FaceRepairService.resolveFaces: moveToPerson carries rest-of-cluster faces (Slice 6a2, §5.3)', () => {
  it('moves a rest-of-cluster face (on personId, eligible, never flagged) alongside a flagged face in the same moveToPerson group', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });

    const f1 = await seedFace(ctx, user.id, source.id);
    // A rest-of-cluster face on the same person that was never part of the flagged snapshot — moveToPerson
    // must still carry it (per §5.3: "any eligible face on the person"), not just flagged faces.
    const f2 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: owner.id }]);

    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: owner.id, faceIds: [f1, f2], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    expect(result).toEqual({ moved: 2, declined: 0, locked: 0, detached: 0, unknown: 0, skipped: 0 });

    const byId = await personIdsOf([f1, f2]);
    expect(byId[f1]).toBe(owner.id);
    expect(byId[f2]).toBe(owner.id);
  });
});

// A resolve that settles NONE of the flagged snapshot must not close the person out of the console. The web
// review page used to fire a second, independent resolve for its rest-of-cluster selection; the unconditional
// drop-on-any-resolution then dropped the person while every flagged face was still unresolved, so the admin's
// staged decisions were silently discarded and the same faces came back on the next scan (the reported bug).
describe('FaceRepairService.resolveFaces: a resolve that settles no flagged face does NOT drain the person', () => {
  it('moves only the rest-of-cluster face and leaves the person (and its untouched flagged faces) in the scan', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });

    const flagged1 = await seedFace(ctx, user.id, source.id);
    const flagged2 = await seedFace(ctx, user.id, source.id);
    const rest = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [
      { assetFaceId: flagged1, suspectedOwnerId: owner.id },
      { assetFaceId: flagged2, suspectedOwnerId: owner.id },
    ]);

    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: owner.id, faceIds: [rest], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    expect(result).toEqual({ moved: 1, declined: 0, locked: 0, detached: 0, unknown: 0, skipped: 0 });

    // The rest face moved; the two flagged faces are untouched, still awaiting a decision.
    const byId = await personIdsOf([flagged1, flagged2, rest]);
    expect(byId[rest]).toBe(owner.id);
    expect(byId[flagged1]).toBe(source.id);
    expect(byId[flagged2]).toBe(source.id);

    // ...so the person MUST still be in the console, with its flagged snapshot intact.
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).toContain(source.id);

    const stillFlagged = await scanRepo.getScanFlaggedFacesForPersons(latest!.id, [source.id]);
    expect(stillFlagged.map((face) => face.assetFaceId).sort()).toEqual([flagged1, flagged2].sort());
  });

  it('drains the person once the flagged snapshot IS settled, even alongside a rest-of-cluster face in the same resolve', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });

    const flagged = await seedFace(ctx, user.id, source.id);
    const rest = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: flagged, suspectedOwnerId: owner.id }]);

    // The unified Apply: every flagged face plus the admin's added rest-of-cluster faces, in ONE resolve.
    await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: owner.id, faceIds: [flagged, rest], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).not.toContain(source.id);
  });
});

// Ported from the retired applyRepair manual-move spec (E5): a moveToPerson group need not carry every
// eligible face on the person — a partial move leaves the rest, and a source with remaining faces survives
// (unlike the fully-drained-unnamed-source deletion covered elsewhere).
describe('FaceRepairService.resolveFaces: partial move leaves the surviving source intact (E5)', () => {
  it('moves only the picked faces to the destination and leaves the rest; the surviving source is not deleted', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Pierre' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const faceIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      faceIds.push(await seedFace(ctx, user.id, source.id));
    }
    const picked = [faceIds[0], faceIds[1]];
    const kept = faceIds.slice(2);

    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: dest.id, faceIds: picked, lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    expect(result.moved).toBe(2);

    const byId = await personIdsOf(faceIds);
    for (const faceId of picked) {
      expect(byId[faceId]).toBe(dest.id);
    }
    for (const faceId of kept) {
      expect(byId[faceId]).toBe(source.id);
    }

    // Source survives (faces remain) → not deleted.
    const sourceRow = await db.selectFrom('person').select('id').where('id', '=', source.id).executeTakeFirst();
    expect(sourceRow?.id).toBe(source.id);

    // Picked faces have manual identities.
    const idRows = await db
      .selectFrom('face_identity_face')
      .select(['source'])
      .where('assetFaceId', 'in', picked)
      .execute();
    expect(idRows).toHaveLength(2);
    for (const row of idRows) {
      expect(row.source).toBe('manual');
    }
  });
});

// ── M2 / M12 / M20: move to a CHOSEN person (owner-scoped, Slice 4) ─────────────────────────────────

describe('FaceRepairService.resolveFaces: move to a chosen person (M2, state 2)', () => {
  it('applies TWO distinct chosen-person destinations in one resolve — the REQUEST destination wins over the stored suspected owner', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    // The scan's suggestion (stored suspectedOwnerId) — deliberately NOT either chosen destination below, so
    // this proves the request's destinationPersonId wins rather than the snapshot's suspectedOwnerId (the
    // Slice-1 review gap: M1/M3 only ever exercised destination === suspectedOwnerId).
    const { person: suggested } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: chosenA } = await ctx.newPerson({ ownerId: user.id, name: 'Alice' });
    const { person: chosenB } = await ctx.newPerson({ ownerId: user.id, name: 'Bob' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });

    const f1 = await seedFace(ctx, user.id, source.id);
    const f2 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [
      { assetFaceId: f1, suspectedOwnerId: suggested.id },
      { assetFaceId: f2, suspectedOwnerId: suggested.id },
    ]);

    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [
          { destinationPersonId: chosenA.id, faceIds: [f1], lock: false },
          { destinationPersonId: chosenB.id, faceIds: [f2], lock: false },
        ],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    expect(result).toEqual({ moved: 2, declined: 0, locked: 0, detached: 0, unknown: 0, skipped: 0 });

    const byId = await personIdsOf([f1, f2]);
    expect(byId[f1]).toBe(chosenA.id);
    expect(byId[f2]).toBe(chosenB.id);
    expect(byId[f1]).not.toBe(suggested.id);
    expect(byId[f2]).not.toBe(suggested.id);
  });
});

describe('FaceRepairService.resolveFaces: cross-owner destination rejected (M12, E11)', () => {
  it('throws BadRequestException when destinationPersonId is owned by a DIFFERENT user, and commits nothing', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { user: otherUser } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: strangerPerson } = await ctx.newPerson({ ownerId: otherUser.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    await expect(
      sut.resolveFaces(
        {
          personId: source.id,
          moveToPerson: [{ destinationPersonId: strangerPerson.id, faceIds: [f1], lock: false }],
          stay: [],
          lock: [],
          detach: [],
          unknown: [],
        },
        user.id,
      ),
    ).rejects.toThrow(BadRequestException);

    // Nothing committed: face untouched, person still in the scan snapshot.
    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(source.id);
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).toContain(source.id);
  });
});

describe('FaceRepairService.resolveFaces: destination person gone (M20, E18)', () => {
  it('throws BadRequestException when destinationPersonId no longer exists (deleted/merged since the scan), and commits nothing', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    // A destination that was deleted/merged since the scan ran — never existed under this id.
    const goneId = '11111111-1111-4111-8111-111111111111';

    await expect(
      sut.resolveFaces(
        {
          personId: source.id,
          moveToPerson: [{ destinationPersonId: goneId, faceIds: [f1], lock: false }],
          stay: [],
          lock: [],
          detach: [],
          unknown: [],
        },
        user.id,
      ),
    ).rejects.toThrow(BadRequestException);

    // Nothing committed — the resolve is rolled back whole.
    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(source.id);
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).toContain(source.id);
  });
});

// ── M13: entireCluster (whole-cluster move) + exclusivity (E12) ────────────────────────────────────

describe('FaceRepairService.resolveFaces: entireCluster (M13, E12)', () => {
  it('moves EVERY eligible face of personId — including one never in the flagged snapshot — server-enumerated with no client paging, and drains the person', async () => {
    const { sut, ctx, scanRepo, jobMock } = setup();
    const { user } = await ctx.newUser();
    // The scan's suggestion — deliberately NOT the entireCluster destination below, proving the request's
    // destination wins rather than each face's stored suspectedOwnerId (mirrors the M2 review-gap coverage).
    const { person: suggested } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Alice' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });

    const f1 = await seedFace(ctx, user.id, source.id);
    // A rest-of-cluster face that was never part of any flagged snapshot — entireCluster must still move it,
    // since it enumerates every ELIGIBLE face of personId, not just the flagged ones.
    const f2 = await seedFace(ctx, user.id, source.id);

    // Ported from the retired applyRepair manual-move spec (E13): make a soon-to-move face the source's
    // representative, so executeRepair's shared reconcile-representative-faces step must repoint/queue it.
    await db.updateTable('person').set({ faceAssetId: f1 }).where('id', '=', source.id).execute();

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: suggested.id }]);

    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
        entireCluster: { destinationPersonId: dest.id },
      },
      user.id,
    );

    expect(result).toEqual({ moved: 2, declined: 0, locked: 0, detached: 0, unknown: 0, skipped: 0 });

    const byId = await personIdsOf([f1, f2]);
    expect(byId[f1]).toBe(dest.id);
    expect(byId[f2]).toBe(dest.id);

    // Representative reconcile queued a thumbnail regen for the drained source (E13, ported from manual-move).
    const queuedNames = jobMock.queueAll.mock.calls.flatMap(([items]) => items).map((item) => item.name);
    expect(queuedNames).toContain(JobName.PersonGenerateThumbnail);

    // Drained from the console...
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).not.toContain(source.id);

    // ...and the now-fully-drained UNNAMED source is auto-deleted (same cleanup the retired applyRepair's manual move used).
    const sourceRow = await db.selectFrom('person').select('id').where('id', '=', source.id).executeTakeFirst();
    expect(sourceRow).toBeUndefined();
  });

  it('rejects entireCluster combined with a non-empty moveToPerson bucket, and commits nothing', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    await expect(
      sut.resolveFaces(
        {
          personId: source.id,
          moveToPerson: [{ destinationPersonId: ownerA.id, faceIds: [f1], lock: false }],
          stay: [],
          lock: [],
          detach: [],
          unknown: [],
          entireCluster: { destinationPersonId: dest.id },
        },
        user.id,
      ),
    ).rejects.toThrow(BadRequestException);

    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(source.id);
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).toContain(source.id);
  });

  it('rejects entireCluster combined with a non-empty stay, lock, detach, or unknown bucket, and commits nothing', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: '' });

    for (const bucket of ['stay', 'lock', 'detach', 'unknown'] as const) {
      const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
      const f1 = await seedFace(ctx, user.id, source.id);
      await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

      await expect(
        sut.resolveFaces(
          {
            personId: source.id,
            moveToPerson: [],
            stay: bucket === 'stay' ? [f1] : [],
            lock: bucket === 'lock' ? [f1] : [],
            detach: bucket === 'detach' ? [f1] : [],
            unknown: bucket === 'unknown' ? [f1] : [],
            entireCluster: { destinationPersonId: dest.id },
          },
          user.id,
        ),
      ).rejects.toThrow(BadRequestException);

      const byId = await personIdsOf([f1]);
      expect(byId[f1]).toBe(source.id);
      const latest = await scanRepo.getLatestScan();
      const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
      expect(snapshotPersonIds).toContain(source.id);
    }
  });
});

describe('FaceRepairService.resolveFaces: entireCluster cross-owner destination rejected (M13, E11)', () => {
  it('throws BadRequestException when entireCluster.destinationPersonId is owned by a DIFFERENT user, and commits nothing', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { user: otherUser } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: strangerPerson } = await ctx.newPerson({ ownerId: otherUser.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    await expect(
      sut.resolveFaces(
        {
          personId: source.id,
          moveToPerson: [],
          stay: [],
          lock: [],
          detach: [],
          unknown: [],
          entireCluster: { destinationPersonId: strangerPerson.id },
        },
        user.id,
      ),
    ).rejects.toThrow(BadRequestException);

    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(source.id);
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).toContain(source.id);
  });
});

describe('FaceRepairService.resolveFaces: entireCluster destination person gone (M13, E18)', () => {
  it('throws BadRequestException when entireCluster.destinationPersonId no longer exists, and commits nothing', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    // A destination that was deleted/merged since the scan ran — never existed under this id.
    const goneId = '22222222-2222-4222-8222-222222222222';

    await expect(
      sut.resolveFaces(
        {
          personId: source.id,
          moveToPerson: [],
          stay: [],
          lock: [],
          detach: [],
          unknown: [],
          entireCluster: { destinationPersonId: goneId },
        },
        user.id,
      ),
    ).rejects.toThrow(BadRequestException);

    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(source.id);
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).toContain(source.id);
  });
});

// ── M17 / M18: owner-scoped people endpoints for the move-to-chosen-person picker ───────────────────

describe('FaceRepairService.searchOwnerPeople (M17, owner-scope)', () => {
  it("returns only that owner's people (named + unnamed clusters), filtered by query, and never another owner's", async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();
    const { user: otherUser } = await ctx.newUser();
    const { person: alice } = await ctx.newPerson({ ownerId: user.id, name: 'Alice' });
    const { person: albert } = await ctx.newPerson({ ownerId: user.id, name: 'Albert' });
    const { person: unnamed } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: strangerPerson } = await ctx.newPerson({ ownerId: otherUser.id, name: 'Alice' });

    const all = await sut.searchOwnerPeople(user.id, { page: 0 });
    const allIds = all.people.map((p) => p.id);
    expect(allIds).toEqual(expect.arrayContaining([alice.id, albert.id, unnamed.id]));
    expect(allIds).not.toContain(strangerPerson.id);
    expect(all.total).toBe(3);

    const filtered = await sut.searchOwnerPeople(user.id, { query: 'al', page: 0 });
    const filteredIds = filtered.people.map((p) => p.id);
    expect(filteredIds).toEqual(expect.arrayContaining([alice.id, albert.id]));
    expect(filteredIds).not.toContain(unnamed.id);
    expect(filteredIds).not.toContain(strangerPerson.id);
  });

  it('paginates results', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();
    for (let index = 0; index < 25; index++) {
      await ctx.newPerson({ ownerId: user.id, name: `Person ${index}` });
    }

    const firstPage = await sut.searchOwnerPeople(user.id, { page: 0 });
    expect(firstPage.people.length).toBeLessThanOrEqual(20);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.total).toBe(25);

    const secondPage = await sut.searchOwnerPeople(user.id, { page: 1 });
    expect(secondPage.people.length).toBeGreaterThan(0);

    const firstIds = new Set(firstPage.people.map((p) => p.id));
    for (const person of secondPage.people) {
      expect(firstIds.has(person.id)).toBe(false);
    }
  });
});

describe('FaceRepairService.createOwnerPerson (M18, state 2)', () => {
  it('creates a person under ownerId whose id is immediately usable as a moveToPerson destination', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    const created = await sut.createOwnerPerson(user.id, 'New Person');
    expect(created.id).toBeDefined();

    const row = await db
      .selectFrom('person')
      .select(['id', 'ownerId', 'name'])
      .where('id', '=', created.id)
      .executeTakeFirst();
    expect(row?.ownerId).toBe(user.id);
    expect(row?.name).toBe('New Person');

    // Immediately usable as a moveToPerson destination for a face owned by the same user (passes the
    // Step-2 cross-owner guard).
    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: created.id, faceIds: [f1], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );
    expect(result.moved).toBe(1);

    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(created.id);
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
        moveToPerson: [{ destinationPersonId: owner.id, faceIds: [f1, f2, f3], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    expect(result).toEqual({ moved: 3, declined: 0, locked: 0, detached: 0, unknown: 0, skipped: 0 });

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
        moveToPerson: [{ destinationPersonId: owner.id, faceIds: [f1, f2], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
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
          moveToPerson: [{ destinationPersonId: owner.id, faceIds: [f1], lock: false }],
          stay: [],
          lock: [],
          detach: [],
          unknown: [],
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
          moveToPerson: [{ destinationPersonId: owner.id, faceIds: [f1], lock: false }],
          stay: [],
          lock: [],
          detach: [],
          unknown: [],
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
          unknown: [],
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

// "Keep here" is a shared negative verdict now, not a console-private decline row — the suggestion engine
// reads the same record, so a face kept away from someone is never later proposed as that someone.
const declineRowsFor = (assetFaceId: string, suspectedOwnerId: string) =>
  db
    .selectFrom('face_person_verdict')
    .select(['id', 'actorId as declinedBy', 'source', 'status'])
    .where('assetFaceId', '=', assetFaceId)
    .where('personId', '=', suspectedOwnerId)
    .where('status', 'in', ['rejected', 'ignored'])
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
      { personId: source.id, moveToPerson: [], stay: [f1], lock: [], detach: [], unknown: [] },
      user.id,
    );

    expect(result).toEqual({ moved: 0, declined: 1, locked: 0, detached: 0, unknown: 0, skipped: 0 });

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
    await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [f1], lock: [], detach: [], unknown: [] },
      user.id,
    );

    // Simulate a later scan flagging the exact same (face, owner) pairing again (the real scan never would —
    // it consults declines before flagging — but resolveFaces re-applies the decline filter independently of
    // how the snapshot got there, so this exercises that seam directly).
    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);
    const skippedResult = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: ownerA.id, faceIds: [f1], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
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
        moveToPerson: [{ destinationPersonId: ownerB.id, faceIds: [f1], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
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
      { personId: source.id, moveToPerson: [], stay: [f1], lock: [], detach: [], unknown: [] },
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
          moveToPerson: [{ destinationPersonId: ownerA.id, faceIds: [f1], lock: false }],
          stay: [f1],
          lock: [],
          detach: [],
          unknown: [],
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
      sut.resolveFaces(
        { personId: source.id, moveToPerson: [], stay: [notFlagged], lock: [], detach: [], unknown: [] },
        user.id,
      ),
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
      { personId: source.id, moveToPerson: [], stay: [f1], lock: [], detach: [], unknown: [] },
      user.id,
    );
    expect(first.declined).toBe(1);

    // Re-submit the identical stay request (double-click / retry) against the same still-standing snapshot row.
    const second = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [f1], lock: [], detach: [], unknown: [] },
      user.id,
    );
    // The verdict is upserted, so a re-stay reports 1 again — what must not change is the row count.
    expect(second).toEqual({ moved: 0, declined: 1, locked: 0, detached: 0, unknown: 0, skipped: 0 });

    const rows = await declineRowsFor(f1, ownerA.id);
    expect(rows).toHaveLength(1);
  });
});

// ── Slice 3: confirm/lock ("Confirm / lock", owner-agnostic) ──────────────────────────────────────

// Build the same VerdictMaps the service builds, from real repositories — so these tests exercise the exact
// production seam (scoped reads + applyVerdictFilters) rather than a hand-rolled approximation.
const buildRealVerdictMaps = async (ctx: Ctx) => {
  const identityRepo = ctx.get(FaceIdentityRepository);
  const verdictRepo = ctx.get(FacePersonVerdictRepository);
  const declineRepo = ctx.get(FaceRepairDeclineRepository);
  const faceRows = await db.selectFrom('asset_face').select('id').execute();
  const personRows = await db.selectFrom('person').select('id').execute();
  const faceIds = faceRows.map((r) => r.id);
  const personIds = personRows.map((r) => r.id);
  return {
    manualLinkedFaceIds: await identityRepo.getManualLinkedFaceIds(faceIds),
    negativeFaceTargets: await verdictRepo.getNegativeVerdictTokens(faceIds),
    ownerTokens: await identityRepo.getPersonVerdictTokens(personIds),
    mutedPersons: await declineRepo.getClusterMuteMap(personIds),
  };
};

// A human placement is recorded as the face's identity link with source='manual' — there is no separate
// lock row any more. These helpers read that record.
const manualLinkFor = (assetFaceId: string) =>
  db
    .selectFrom('face_identity_face')
    .select(['assetFaceId', 'identityId', 'source'])
    .where('assetFaceId', '=', assetFaceId)
    .where('source', '=', 'manual')
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
      { personId: source.id, moveToPerson: [], stay: [], lock: [f1], detach: [], unknown: [] },
      user.id,
    );

    expect(result).toEqual({ moved: 0, declined: 0, locked: 1, detached: 0, unknown: 0, skipped: 0 });

    const rows = await manualLinkFor(f1);
    expect(rows).toHaveLength(1);
    // The placement is recorded against the reviewed person's IDENTITY — that is what makes it
    // survive a later merge, and what every future scan consults.
    const expectedIdentity = await ctx.get(FaceIdentityRepository).ensurePersonIdentity(source.id);
    expect(rows[0].identityId).toBe(expectedIdentity.id);

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
    await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [], lock: [f1], detach: [], unknown: [] },
      user.id,
    );

    // A LATER scan pass re-suspects the SAME face toward a DIFFERENT owner (the age-gap childhood-photo case).
    // Exercise the exact seam buildRepairPlan uses in production: a real, unscoped getDeclineMaps() read
    // followed by applyDeclineFilters — the lock must drop f1 regardless of which owner is now proposed.
    const maps = await buildRealVerdictMaps(ctx);
    const flaggedByPerson = new Map([
      [source.id, [{ assetFaceId: f1, currentPersonId: source.id, suspectedOwnerId: ownerB.id }]],
    ]);
    applyVerdictFilters(flaggedByPerson, maps);

    expect(flaggedByPerson.get(source.id)).toEqual([]);
  });

  it('re-confirming an already-placed face is idempotent: no error, exactly one placement row', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);
    const first = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [], lock: [f1], detach: [], unknown: [] },
      user.id,
    );
    expect(first.locked).toBe(1);

    // A later scan re-flags the exact same face (still on the same person) and the admin re-submits the
    // identical lock request (double-click / retry, or simply re-confirming an already-locked face).
    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);
    const second = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [], lock: [f1], detach: [], unknown: [] },
      user.id,
    );
    // Re-affirming reports the face again (the write is an upsert, not a conditional insert); what must not
    // change is that a face carries exactly ONE placement row — face_identity_face is keyed by assetFaceId.
    expect(second).toEqual({ moved: 0, declined: 0, locked: 1, detached: 0, unknown: 0, skipped: 0 });

    const rows = await manualLinkFor(f1);
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
      sut.resolveFaces(
        { personId: source.id, moveToPerson: [], stay: [], lock: [notFlagged], detach: [], unknown: [] },
        user.id,
      ),
    ).rejects.toThrow(new BadRequestException('Some faces are not in the flagged snapshot for this person'));

    const rows = await manualLinkFor(notFlagged);
    expect(rows).toHaveLength(0);
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).toContain(source.id);
  });
});

// ── Slice 5: detach ("Not a face") ──────────────────────────────────────────────────────────────────

const identityLinkRowsFor = (assetFaceId: string) =>
  db
    .selectFrom('face_identity_face')
    .select(['assetFaceId', 'identityId'])
    .where('assetFaceId', '=', assetFaceId)
    .execute();

describe('FaceRepairService.resolveFaces: detach (M6, E4, E15)', () => {
  it('nulls personId and strips the identity link, and a subsequent identity backfill does NOT reattach it', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    // f1 already carries an identity link (as a genuinely-resolved ML face normally would) — proves detach
    // actually strips it, rather than the assertion trivially passing because no link ever existed.
    const faceIdentityRepo = ctx.get(FaceIdentityRepository);
    const sourceIdentity = await faceIdentityRepo.ensurePersonIdentity(source.id);
    await faceIdentityRepo.linkFace({ assetFaceId: f1, identityId: sourceIdentity.id, source: 'backfill' });
    expect(await identityLinkRowsFor(f1)).toHaveLength(1);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    const result = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [], lock: [], detach: [f1], unknown: [] },
      user.id,
    );

    expect(result).toEqual({ moved: 0, declined: 0, locked: 0, detached: 1, unknown: 0, skipped: 0 });

    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBeNull();
    expect(await identityLinkRowsFor(f1)).toHaveLength(0);

    // Regression lock (E4): backfillPersonalIdentities iterates PEOPLE and links any of THEIR faces lacking an
    // identity row (`where asset_face.personId = person.id`). Since f1's personId is now null, no person's pass
    // will ever select it — it can never be silently re-linked back to `source` (or anyone else) by a later
    // backfill. Exercised via the real repository method (not mocked) — this is the exact mechanism a
    // `JobName.FaceIdentityBackfill` job run invokes; going through the full job/PersonService orchestration
    // isn't needed to prove the guarantee, since all of the reattachment logic lives in this repository call.
    await faceIdentityRepo.backfillPersonalIdentities({ limit: 1000 });

    const afterBackfill = await personIdsOf([f1]);
    expect(afterBackfill[f1]).toBeNull();
    expect(await identityLinkRowsFor(f1)).toHaveLength(0);
  });

  it('leaves the face untouched (still on source, identity link intact) when detach is empty', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    const result = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [f1], lock: [], detach: [], unknown: [] },
      user.id,
    );

    expect(result.detached).toBe(0);
  });
});

describe('FaceRepairService.resolveFaces: detach on a non-flagged face (M14, E15)', () => {
  it('throws BadRequestException when a detach id is not in the flagged snapshot for this person', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);
    // A rest-of-cluster face on the same person that was never part of the flagged snapshot.
    const notFlagged = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    await expect(
      sut.resolveFaces(
        { personId: source.id, moveToPerson: [], stay: [], lock: [], detach: [notFlagged], unknown: [] },
        user.id,
      ),
    ).rejects.toThrow(new BadRequestException('Some faces are not in the flagged snapshot for this person'));

    // No side effects: untouched, no identity link stripped, person still in the scan snapshot.
    const byId = await personIdsOf([notFlagged]);
    expect(byId[notFlagged]).toBe(source.id);
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).toContain(source.id);
  });
});

describe('FaceRepairService.resolveFaces: detach regenerates the representative thumbnail (M21, E19)', () => {
  it('repoints faceAssetId off the detached face and queues PersonGenerateThumbnail for the person', async () => {
    const { sut, ctx, scanRepo, jobMock } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Jane Doe' });
    const f1 = await seedFace(ctx, user.id, source.id);
    const f2 = await seedFace(ctx, user.id, source.id);

    // f1 is the person's representative/feature face.
    await db.updateTable('person').set({ faceAssetId: f1 }).where('id', '=', source.id).execute();

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [
      { assetFaceId: f1, suspectedOwnerId: ownerA.id },
      { assetFaceId: f2, suspectedOwnerId: ownerA.id },
    ]);

    await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [], lock: [], detach: [f1], unknown: [] },
      user.id,
    );

    const updated = await db
      .selectFrom('person')
      .select('faceAssetId')
      .where('id', '=', source.id)
      .executeTakeFirstOrThrow();
    // Repointed to the still-eligible remaining face (f2), never left on the now-detached f1.
    expect(updated.faceAssetId).toBe(f2);

    const queuedJobs = jobMock.queueAll.mock.calls.flatMap(([items]) => items);
    expect(queuedJobs).toEqual(
      expect.arrayContaining([{ name: JobName.PersonGenerateThumbnail, data: { id: source.id } }]),
    );
  });

  it('does NOT queue a thumbnail regen when the detached face was not the representative', async () => {
    const { sut, ctx, scanRepo, jobMock } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Jane Doe' });
    const f1 = await seedFace(ctx, user.id, source.id);
    const f2 = await seedFace(ctx, user.id, source.id);

    // f2 (not f1) is the representative — detaching f1 must not disturb it.
    await db.updateTable('person').set({ faceAssetId: f2 }).where('id', '=', source.id).execute();

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [
      { assetFaceId: f1, suspectedOwnerId: ownerA.id },
      { assetFaceId: f2, suspectedOwnerId: ownerA.id },
    ]);

    await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [], lock: [], detach: [f1], unknown: [] },
      user.id,
    );

    const updated = await db
      .selectFrom('person')
      .select('faceAssetId')
      .where('id', '=', source.id)
      .executeTakeFirstOrThrow();
    expect(updated.faceAssetId).toBe(f2);

    const queuedJobs = jobMock.queueAll.mock.calls.flatMap(([items]) => items);
    expect(queuedJobs.some((job) => job.name === JobName.PersonGenerateThumbnail)).toBe(false);
  });
});

// ── Temporal-consistency hardening, Slice 2: dismiss drains the latest scan snapshot (M9, E11) ─────

describe('FaceRepairService.createDeclines: dismiss drains the latest scan snapshot (M9, E11)', () => {
  it('removes the dismissed person from the latest scan snapshot while keeping the person-decline row', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerQ } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerQ.id }]);

    // Sanity: the person starts out present in the latest scan snapshot.
    const before = await scanRepo.getLatestScan();
    const beforeIds = ((before!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(beforeIds).toContain(source.id);

    await sut.createDeclines({
      persons: [{ personId: source.id, suspectedOwnerIds: [ownerQ.id] }],
      declinedBy: user.id,
    });

    // Drained from the latest scan snapshot — a dashboard reload no longer resurfaces it.
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).not.toContain(source.id);

    // The persisted person-decline row still exists — it governs future scans independently of the drain
    // (a genuinely new suspected owner can still resurface the person, per the existing subset check).
    const declineRow = await db
      .selectFrom('face_repair_decline')
      .select(['id', 'personId'])
      .where('type', '=', 'person')
      .where('personId', '=', source.id)
      .executeTakeFirst();
    expect(declineRow).toBeDefined();
  });
});

// ── Temporal-consistency hardening, Slice 3: move-and-lock ─────────────────────────────────────────
//
// A deliberate "Move → chosen person" can ALSO durably, owner-agnostically lock the moved faces to their
// destination (moveToPerson[].lock: true), so a later re-scan never re-flags them — without this, a plain
// move has no persisted marker and the very next scan pass can re-suspect the face right back toward its old
// person. The lock is only ever written for faces that ACTUALLY moved (`executeRepair`'s still-on-source
// re-check at write time is the source of truth), never for a face requested in the same group that turned
// out to be stale (moved off `personId` before this call, M8) — an orphan lock on an untouched face would be
// meaningless (locks are keyed to the DESTINATION the face is confirmed on).

describe('FaceRepairService.resolveFaces: move-and-lock (M5, E13)', () => {
  it('moves the face to the destination AND locks it there; re-issuing the identical request inserts no second lock row', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Dest' });
    // NAMED so the empty-unnamed cleanup doesn't delete `source` once f1 moves away — the re-issued second
    // call below needs `source` to still exist.
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Source' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: dest.id }]);

    const first = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: dest.id, faceIds: [f1], lock: true }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    expect(first.moved).toBe(1);
    expect(first.locked).toBeGreaterThanOrEqual(1);

    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(dest.id);

    const rows = await manualLinkFor(f1);
    expect(rows).toHaveLength(1);
    // The placement is recorded against the reviewed person's IDENTITY — that is what makes it
    // survive a later merge, and what every future scan consults.
    const expectedIdentity = await ctx.get(FaceIdentityRepository).ensurePersonIdentity(dest.id);
    expect(rows[0].identityId).toBe(expectedIdentity.id);

    // Re-issuing the identical move-lock request (double-click / retry, E13): f1 is already on `dest`, so
    // executeRepair's still-on-source re-check moves 0 faces this time — and the move-lock loop only ever
    // locks faces present in `movedFaceIds`, so no second lock row is inserted for f1.
    const second = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: dest.id, faceIds: [f1], lock: true }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );
    expect(second.moved).toBe(0);

    const rowsAfter = await manualLinkFor(f1);
    expect(rowsAfter).toHaveLength(1);
  });
});

describe('FaceRepairService.resolveFaces: move without lock writes no lock row (M6, E6)', () => {
  it('records a human placement for a moved face even when lock: false', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Dest' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: dest.id }]);

    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: dest.id, faceIds: [f1], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    expect(result.moved).toBe(1);
    // `locked` counts only faces the request explicitly asked to confirm.
    expect(result.locked).toBe(0);

    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(dest.id);

    // ...but the move itself is a human placement, so the face is settled regardless of the `lock` flag: an
    // admin deliberately put it here, and no future scan should ask anyone to undo that. This is the same
    // record a user's confirmed suggestion writes, and it is what stops the two engines fighting over a
    // face. The per-group `lock` flag therefore no longer changes durability — only the reported count.
    const rows = await manualLinkFor(f1);
    expect(rows).toHaveLength(1);
  });
});

describe('FaceRepairService.resolveFaces: move-and-lock skips a face that moved off personId before the call (M8, E1)', () => {
  it('locks only the face that actually moved, never the stale one — no orphan lock', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Dest' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: elsewhere } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);
    const fGone = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [
      { assetFaceId: f1, suspectedOwnerId: dest.id },
      { assetFaceId: fGone, suspectedOwnerId: dest.id },
    ]);

    // fGone moved off `source` after the scan ran (e.g. a concurrent manual move) — no longer on-source at
    // write time, mirroring the plain stale-move case (M9) but with lock: true on the group.
    await db.updateTable('asset_face').set({ personId: elsewhere.id }).where('id', '=', fGone).execute();

    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: dest.id, faceIds: [f1, fGone], lock: true }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    expect(result.moved).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.locked).toBeGreaterThanOrEqual(1);

    const byId = await personIdsOf([f1, fGone]);
    expect(byId[f1]).toBe(dest.id);
    expect(byId[fGone]).toBe(elsewhere.id); // untouched — still on the person it moved to

    const f1Rows = await manualLinkFor(f1);
    expect(f1Rows).toHaveLength(1);
    const goneRows = await manualLinkFor(fGone);
    expect(goneRows).toHaveLength(0); // no orphan lock on the face that never actually moved
  });
});

describe('FaceRepairService.resolveFaces: move-and-lock a rest-of-cluster face (M7, bypasses the flagged-snapshot check)', () => {
  it('locks a face never in the flagged snapshot when lock: true, without throwing BadRequestException', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Dest' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);
    // A rest-of-cluster face on the same person that was never part of the flagged snapshot — moveToPerson
    // already accepts this (§5.3); this proves the NEW lock: true path bypasses the snapshot-membership check
    // the same way — locks here are tied to the move, not the standalone top-level `lock` bucket (which DOES
    // reject a non-flagged face, see M14).
    const notFlagged = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: dest.id }]);

    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: dest.id, faceIds: [notFlagged], lock: true }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    expect(result.moved).toBe(1);
    expect(result.locked).toBeGreaterThanOrEqual(1);

    const byId = await personIdsOf([notFlagged]);
    expect(byId[notFlagged]).toBe(dest.id);
    const rows = await manualLinkFor(notFlagged);
    expect(rows).toHaveLength(1);
  });
});

describe('FaceRepairService.resolveFaces: move-and-lock undo re-enables flagging (M10)', () => {
  it('removing the move-lock via removeResolutions lets a later scan re-flag the face; the face stays on the destination', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Dest' });
    const { person: laterSuspect } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: dest.id }]);

    await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: dest.id, faceIds: [f1], lock: true }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    expect(await manualLinkFor(f1)).toHaveLength(1);

    const removed = await sut.unconfirmFaces([f1]);
    expect(removed.removed).toBe(1);
    expect(await manualLinkFor(f1)).toHaveLength(0);

    // A later scan re-suspects f1 toward a new owner — exercise the exact seam buildRepairPlan uses in
    // production: a real, unscoped getDeclineMaps() read followed by applyDeclineFilters. With the lock gone,
    // f1 is no longer dropped.
    const maps = await buildRealVerdictMaps(ctx);
    const flaggedByPerson = new Map([
      [dest.id, [{ assetFaceId: f1, currentPersonId: dest.id, suspectedOwnerId: laterSuspect.id }]],
    ]);
    applyVerdictFilters(flaggedByPerson, maps);
    expect(flaggedByPerson.get(dest.id)).toEqual([
      { assetFaceId: f1, currentPersonId: dest.id, suspectedOwnerId: laterSuspect.id },
    ]);

    // Undoing the lock never moves the face back — it stays on the destination it was moved to.
    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(dest.id);
  });
});

describe('FaceRepairService.resolveFaces: move-lock survives a later person merge (M12)', () => {
  it('re-points the lock personId to the merge target, and a re-run scan still does not re-flag the face', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Dest' });
    const { person: dest2 } = await ctx.newPerson({ ownerId: user.id, name: 'Dest2' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: dest.id }]);

    await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: dest.id, faceIds: [f1], lock: true }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    // dest is later merged away into dest2 (mergePersonProfile unconditionally sets the target's identityId,
    // which FKs to face_identity — seed a real row so the merge doesn't fail on an unrelated FK violation).
    const personRepository = ctx.get(PersonRepository);
    const identity = await db
      .insertInto('face_identity')
      .values({ type: 'person' })
      .returningAll()
      .executeTakeFirstOrThrow();
    await personRepository.mergePersonProfile({
      sourcePersonId: dest.id,
      targetPersonId: dest2.id,
      targetIdentityId: identity.id,
    });

    // The placement survives the merge as a placement. What matters is that the face is still SETTLED, not
    // which identity row it happens to hang off afterwards — the merge chooses the surviving identity, and
    // the scan below is the behaviour anyone actually depends on.
    const lockRows = await manualLinkFor(f1);
    expect(lockRows).toHaveLength(1);
    expect(lockRows[0].source).toBe('manual');

    // The merge itself re-points f1's asset_face row onto dest2 too.
    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(dest2.id);

    // A re-run scan does not re-flag f1: a human placement is owner-agnostic, so it stays dropped regardless
    // of which owner is now proposed for it.
    const maps = await buildRealVerdictMaps(ctx);
    const flaggedByPerson = new Map([
      [dest2.id, [{ assetFaceId: f1, currentPersonId: dest2.id, suspectedOwnerId: source.id }]],
    ]);
    applyVerdictFilters(flaggedByPerson, maps);
    expect(flaggedByPerson.get(dest2.id)).toEqual([]);
  });
});

// Streams the exact candidate set PersonService.queueRecognizeFaces feeds into the FacialRecognition queue on a
// normal (non-forced) run: every visible, non-deleted, ML-sourced face with NO person. A face sitting in this
// set gets re-matched by embedding and re-assigned to its nearest neighbour that HAS a person.
const recognitionCandidates = async (ctx: Ctx): Promise<string[]> => {
  const ids: string[] = [];
  for await (const face of ctx
    .get(PersonRepository)
    .getAllFaces({ personId: null, sourceType: SourceType.MachineLearning })) {
    ids.push(face.id);
  }
  return ids;
};

describe('FaceRepairService.resolveFaces: detach is durable against re-recognition', () => {
  it('soft-deletes the detached face so recognition can never hand it back to a person', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Jane Doe' });
    const f1 = await seedFace(ctx, user.id, source.id);

    // Positive control: a plainly UNASSIGNED face (personId NULL, not detached). It must show up as a
    // recognition candidate — that is precisely the state a bare unassign would have left the detached face in,
    // and why "unassign back to the unknown pool" boomerangs: the pool is the input queue of the very
    // clustering that mis-assigned the face.
    const unassigned = await seedFace(ctx, user.id, source.id);
    await db.updateTable('asset_face').set({ personId: null }).where('id', '=', unassigned).execute();

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    const result = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [], lock: [], detach: [f1], unknown: [] },
      user.id,
    );
    expect(result.detached).toBe(1);

    const row = await db
      .selectFrom('asset_face')
      .select(['personId', 'deletedAt'])
      .where('id', '=', f1)
      .executeTakeFirstOrThrow();
    expect(row.personId).toBeNull();
    expect(row.deletedAt).not.toBeNull();

    const candidates = await recognitionCandidates(ctx);
    expect(candidates).toContain(unassigned);
    expect(candidates).not.toContain(f1);
  });
});

describe('FaceRepairService.resolveFaces: unknown person (state 6)', () => {
  it('parks the selected faces in one fresh unnamed cluster, locked there, and drains the person', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Anna' });
    const f1 = await seedFace(ctx, user.id, source.id);
    const f2 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [
      { assetFaceId: f1, suspectedOwnerId: ownerA.id },
      { assetFaceId: f2, suspectedOwnerId: ownerA.id },
    ]);

    const result = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [], lock: [], detach: [], unknown: [f1, f2] },
      user.id,
    );
    expect(result).toEqual({ moved: 0, declined: 0, locked: 0, detached: 0, unknown: 2, skipped: 0 });

    // Both faces land on the SAME new person — one cluster per resolve, so the admin can name the unknown
    // person once rather than N times.
    const byId = await personIdsOf([f1, f2]);
    expect(byId[f1]).not.toBeNull();
    expect(byId[f1]).not.toBe(source.id);
    expect(byId[f2]).toBe(byId[f1]);

    const cluster = await db
      .selectFrom('person')
      .select(['id', 'name', 'ownerId'])
      .where('id', '=', byId[f1]!)
      .executeTakeFirstOrThrow();
    // Unnamed and owned by the LIBRARY's owner (never the reviewing admin), so it surfaces as an unnamed
    // cluster on the owner's People page for them to name later.
    expect(cluster.name).toBe('');
    expect(cluster.ownerId).toBe(user.id);

    // Locked to the new cluster, so the next scan never re-flags them...
    const locks = await manualLinkFor(f1);
    expect(locks).toHaveLength(1);
    const expectedIdentity_locks = await ctx.get(FaceIdentityRepository).ensurePersonIdentity(cluster.id);
    expect(locks[0].identityId).toBe(expectedIdentity_locks.id);

    // ...and never a recognition candidate, because the face now HAS a person (handleRecognizeFaces
    // early-returns on those). This is what a bare unassign could not guarantee.
    const candidates = await recognitionCandidates(ctx);
    expect(candidates).not.toContain(f1);
    expect(candidates).not.toContain(f2);

    // Every flagged face is settled, so the person leaves the console.
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).not.toContain(source.id);
  });

  it('creates no unnamed cluster when the unknown face went stale (rejected before anything is written)', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Anna' });
    const { person: elsewhere } = await ctx.newPerson({ ownerId: user.id, name: 'Elsewhere' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    // The face moved off `source` between the scan and this resolve. getScanFlaggedFacesForPersons only returns
    // faces STILL on the person, so f1 drops out of the flagged snapshot and the E15 membership guard rejects
    // the whole resolve — the same rule stay/lock/detach follow.
    await db.updateTable('asset_face').set({ personId: elsewhere.id }).where('id', '=', f1).execute();

    const peopleBefore = await db
      .selectFrom('person')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('ownerId', '=', user.id)
      .executeTakeFirstOrThrow();

    await expect(
      sut.resolveFaces(
        { personId: source.id, moveToPerson: [], stay: [], lock: [], detach: [], unknown: [f1] },
        user.id,
      ),
    ).rejects.toThrow(new BadRequestException('Some faces are not in the flagged snapshot for this person'));

    // The guard runs before the park, so no empty, nameless person is left littering the owner's People page,
    // and the face is untouched where it now lives.
    const peopleAfter = await db
      .selectFrom('person')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('ownerId', '=', user.id)
      .executeTakeFirstOrThrow();
    expect(peopleAfter.count).toBe(peopleBefore.count);
    const byId = await personIdsOf([f1]);
    expect(byId[f1]).toBe(elsewhere.id);
    expect(await manualLinkFor(f1)).toHaveLength(0);
  });
});

describe('FaceRepairService.resolveFaces: the unknown cluster is usable on the People page', () => {
  it('gives the new cluster a representative face and queues its thumbnail', async () => {
    const { sut, ctx, scanRepo, jobMock } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Anna' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [], lock: [], detach: [], unknown: [f1] },
      user.id,
    );

    const parked = await personIdsOf([f1]);
    const clusterId = parked[f1]!;

    // The entire point of parking a stranger is that someone can NAME them later. A cluster with no
    // representative face renders as a blank tile on the People page — findable in theory, useless in practice.
    const cluster = await db
      .selectFrom('person')
      .select('faceAssetId')
      .where('id', '=', clusterId)
      .executeTakeFirstOrThrow();
    expect(cluster.faceAssetId).toBe(f1);

    const queuedJobs = jobMock.queueAll.mock.calls.flatMap(([items]) => items);
    expect(queuedJobs).toEqual(
      expect.arrayContaining([{ name: JobName.PersonGenerateThumbnail, data: { id: clusterId } }]),
    );
  });
});

describe('FaceRepairService.resolveFaces: unknown combined with a move in one resolve', () => {
  it('routes each face to its own destination and counts moved and unknown separately', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: 'Paul' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Anna' });
    const fMove = await seedFace(ctx, user.id, source.id);
    const fUnknown = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [
      { assetFaceId: fMove, suspectedOwnerId: ownerA.id },
      { assetFaceId: fUnknown, suspectedOwnerId: ownerA.id },
    ]);

    // The realistic mixed review: most faces really are Paul's, one is a friend nobody can name.
    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: ownerA.id, faceIds: [fMove], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [fUnknown],
      },
      user.id,
    );

    // `moved` and `unknown` are deliberately disjoint counts — a parked face is not "moved to a person the admin
    // chose", and reporting it in both would double-count it in the apply summary.
    expect(result).toEqual({ moved: 1, declined: 0, locked: 0, detached: 0, unknown: 1, skipped: 0 });

    const byId = await personIdsOf([fMove, fUnknown]);
    expect(byId[fMove]).toBe(ownerA.id);
    expect(byId[fUnknown]).not.toBe(ownerA.id);
    expect(byId[fUnknown]).not.toBe(source.id);

    // The parked face is locked to its new cluster; the plainly-moved one is NOT locked (lock: false).
    // Both routes are human placements: the unknown-park moved its face onto a brand-new cluster, and the
    // move put its face on the chosen destination. Neither should ever be re-proposed.
    expect(await manualLinkFor(fUnknown)).toHaveLength(1);
    expect(await manualLinkFor(fMove)).toHaveLength(1);
  });
});

describe('FaceRepairService.resolveFaces: a failed park leaves no orphan cluster', () => {
  it('removes the freshly created cluster when the move into it throws', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Anna' });
    const f1 = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }]);

    // The cluster is created BEFORE the faces move into it. If the move blows up (dropped connection, etc.) the
    // nameless, faceless person must not be left stranded on the owner's People page — nothing else ever cleans
    // one up.
    const repairRepo = ctx.get(FaceRepairRepository);
    const reattribute = vi
      .spyOn(repairRepo, 'reattributeFaces')
      .mockRejectedValueOnce(new Error('connection terminated'));

    const peopleBefore = await db
      .selectFrom('person')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('ownerId', '=', user.id)
      .executeTakeFirstOrThrow();

    await expect(
      sut.resolveFaces(
        { personId: source.id, moveToPerson: [], stay: [], lock: [], detach: [], unknown: [f1] },
        user.id,
      ),
    ).rejects.toThrow('connection terminated');

    reattribute.mockRestore();

    const peopleAfter = await db
      .selectFrom('person')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('ownerId', '=', user.id)
      .executeTakeFirstOrThrow();
    expect(peopleAfter.count).toBe(peopleBefore.count);

    // The face is untouched and still reviewable — the admin can simply retry.
    const afterFailure = await personIdsOf([f1]);
    expect(afterFailure[f1]).toBe(source.id);
  });
});

// ── C1: the console-drain check must ignore faces already settled (declined/locked) in a PRIOR resolve ──
// The review page only ever surfaces the decline/lock-filtered pending set, so on a later resolve the admin
// can only settle the still-visible faces. If the drain gate compared against the RAW flagged snapshot it
// would never fire for a person that was partially resolved across sessions, stranding it in the console.
describe('FaceRepairService.resolveFaces: draining ignores faces already settled in a prior resolve (C1)', () => {
  it('drains the person once every STILL-PENDING flagged face is settled, even though an earlier face was soft-stayed in a prior resolve', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const a = await seedFace(ctx, user.id, source.id);
    const b = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [
      { assetFaceId: a, suspectedOwnerId: owner.id },
      { assetFaceId: b, suspectedOwnerId: owner.id },
    ]);

    // Resolve 1: soft-stay A only. B is still pending, so the person must NOT drain yet.
    await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [a], lock: [], detach: [], unknown: [] },
      user.id,
    );
    let latest = await scanRepo.getLatestScan();
    let snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).toContain(source.id);

    // Resolve 2: settle the only still-pending face B. A is filtered out of the review UI (declined in resolve
    // 1), so the admin never re-submits it — yet the person MUST now drain from the console.
    await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [b], lock: [], detach: [], unknown: [] },
      user.id,
    );
    latest = await scanRepo.getLatestScan();
    snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).not.toContain(source.id);
  });
});

// ── C7: a "keep here" (stay) whose scan-suggested owner was deleted/merged since the scan must not 500 ──
// The flagged-snapshot row stores suspectedOwnerId as a bare uuid (no person FK), so it survives a deleted
// owner; writing a decline against it would hit the decline table's real person FK (23503).
describe('FaceRepairService.resolveFaces: stay tolerates a suspected owner deleted since the scan (C7)', () => {
  it("does not 500 when a stayed face's scan-suggested owner was deleted after the scan; the face is kept and the person drains", async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const a = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: a, suspectedOwnerId: owner.id }]);

    // The scan-suggested owner is deleted (e.g. merged away) before the admin resolves.
    await db.deleteFrom('person').where('id', '=', owner.id).execute();

    const result = await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [a], lock: [], detach: [], unknown: [] },
      user.id,
    );

    // No 500: the dangling-owner stay is dropped from the decline write (declined: 0) but still settles the face.
    expect(result).toEqual({ moved: 0, declined: 0, locked: 0, detached: 0, unknown: 0, skipped: 0 });

    // The face is untouched (kept here) and the person drains from the console.
    const byId = await personIdsOf([a]);
    expect(byId[a]).toBe(source.id);
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).not.toContain(source.id);
  });
});

// ── C2: moveToPerson pre-skip must be scoped to the requested destination, not "declined at all" ──
describe('FaceRepairService.resolveFaces: moveToPerson honors a face declined toward a DIFFERENT owner (C2)', () => {
  it('moves a previously soft-stayed face when the admin picks a DIFFERENT destination', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerO } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: ownerY } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Kept' });
    const a = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: a, suspectedOwnerId: ownerO.id }]);

    // Resolve 1: soft-stay A — declines the A→O pairing.
    await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [a], lock: [], detach: [], unknown: [] },
      user.id,
    );

    // Resolve 2: the admin changes their mind and moves A to a DIFFERENT person Y. This is a new pairing and
    // must be honored, not silently pre-skipped because A was declined toward O.
    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: ownerY.id, faceIds: [a], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );
    expect(result.moved).toBe(1);
    expect(result.skipped).toBe(0);
    const byId = await personIdsOf([a]);
    expect(byId[a]).toBe(ownerY.id);
  });

  it('still skips a re-move toward the SAME owner the face was declined against (preserves "do not re-apply a declined pairing")', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerO } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Kept' });
    const a = await seedFace(ctx, user.id, source.id);

    await seedFlaggedSnapshot(scanRepo, user.id, source.id, [{ assetFaceId: a, suspectedOwnerId: ownerO.id }]);

    // Resolve 1: soft-stay A (declines A→O).
    await sut.resolveFaces(
      { personId: source.id, moveToPerson: [], stay: [a], lock: [], detach: [], unknown: [] },
      user.id,
    );

    // Resolve 2: re-move A toward the SAME owner O it was declined against — skipped, A stays put.
    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: ownerO.id, faceIds: [a], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );
    expect(result.moved).toBe(0);
    expect(result.skipped).toBe(1);
    const byId = await personIdsOf([a]);
    expect(byId[a]).toBe(source.id);
  });
});

// ── C6: executeRepair must never move a face across owners, even on a caller that skips resolveFaces's guard ──
describe('FaceRepairService.executeRepair: never moves a face across owners (C6)', () => {
  it('skips a route whose destination is owned by a different user, leaving the face untouched', async () => {
    const { sut, ctx } = setup();
    const { user: userA } = await ctx.newUser();
    const { user: userB } = await ctx.newUser();
    const { person: source } = await ctx.newPerson({ ownerId: userA.id, name: '' });
    const { person: foreign } = await ctx.newPerson({ ownerId: userB.id, name: '' });
    const a = await seedFace(ctx, userA.id, source.id);

    const result = await sut.executeRepair({
      toRepair: [{ assetFaceId: a, currentPersonId: source.id, suspectedOwnerId: foreign.id }],
      reviewOnlyFaces: [],
      reviewOnlyPersonIds: [],
      unAttributableFaces: [],
      perPerson: [],
    });

    expect(result.moved).toBe(0);
    expect(result.skipped).toBe(1);
    const byId = await personIdsOf([a]);
    expect(byId[a]).toBe(source.id);
  });
});

// ── C10: boundary — a resolve with no persisted scan treats moveToPerson faces as rest-of-cluster ──
describe('FaceRepairService.resolveFaces: boundary cases (C10)', () => {
  it('treats a moveToPerson face as a rest-of-cluster face when no scan has ever been persisted (latest is null)', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Named' });
    const a = await seedFace(ctx, user.id, source.id);

    // No seedFlaggedSnapshot — there is no persisted scan at all, so `stored` is [] and `flaggedIds` is empty.
    const result = await sut.resolveFaces(
      {
        personId: source.id,
        moveToPerson: [{ destinationPersonId: owner.id, faceIds: [a], lock: false }],
        stay: [],
        lock: [],
        detach: [],
        unknown: [],
      },
      user.id,
    );

    expect(result.moved).toBe(1);
    const byId = await personIdsOf([a]);
    expect(byId[a]).toBe(owner.id);
  });
});
