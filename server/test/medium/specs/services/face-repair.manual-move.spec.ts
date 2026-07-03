import { ConflictException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { JobName, SourceType } from 'src/enum';
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

const seedCluster = async (
  ctx: Ctx,
  ownerId: string,
  count: number,
  name = '',
): Promise<{ personId: string; faceIds: string[] }> => {
  const { person } = await ctx.newPerson({ ownerId, name });
  const faceIds: string[] = [];
  for (let i = 0; i < count; i++) {
    faceIds.push(await seedFace(ctx, ownerId, person.id));
  }
  return { personId: person.id, faceIds };
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

const personIdsOf = async (faceIds: string[]): Promise<Record<string, string | null>> => {
  const rows = await db.selectFrom('asset_face').select(['id', 'personId']).where('id', 'in', faceIds).execute();
  return Object.fromEntries(rows.map((r) => [r.id, r.personId]));
};

beforeAll(async () => {
  db = await getKyselyDB();
});

afterEach(() => db.deleteFrom('face_repair_scan').execute());

describe('FaceRepairService.applyRepair: manual move (entire cluster, unnamed source)', () => {
  it('moves all faces to the destination (manual identities), deletes the source, reconciles + queues thumbnails, drops it from the snapshot (E4, E13, E20)', async () => {
    const { sut, ctx, jobMock, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Pierre' });
    const { personId: source, faceIds } = await seedCluster(ctx, user.id, 3, '');

    // Make a soon-to-move face the source's representative so reconcile must repoint it (E13).
    await db.updateTable('person').set({ faceAssetId: faceIds[0] }).where('id', '=', source).execute();

    // Seed a completed scan listing the source so we can assert the console-drop.
    const scan = await scanRepo.createScan({ requestedBy: user.id, params: scanParams() });
    await scanRepo.completeScan(scan.id, {
      totals: scanTotals(1, faceIds.length),
      persons: [scanPerson(source, user.id, faceIds.length)],
    });

    const result = await sut.applyRepair({
      approvedPersonIds: [],
      manualMove: { personId: source, destinationPersonId: dest.id, entireCluster: true },
    });

    expect(result.moved).toBe(3);

    const byId = await personIdsOf(faceIds);
    for (const faceId of faceIds) {
      expect(byId[faceId]).toBe(dest.id);
    }

    // Identities are manual.
    const idRows = await db
      .selectFrom('face_identity_face')
      .select(['assetFaceId', 'identityId', 'source'])
      .where('assetFaceId', 'in', faceIds)
      .execute();
    expect(idRows).toHaveLength(3);
    for (const row of idRows) {
      expect(row.source).toBe('manual');
      expect(row.identityId).not.toBeNull();
    }

    // Unnamed source row is deleted.
    const sourceRow = await db.selectFrom('person').select('id').where('id', '=', source).executeTakeFirst();
    expect(sourceRow).toBeUndefined();

    // Representative reconcile queued a thumbnail regen (E13).
    const queuedNames = jobMock.queueAll.mock.calls.flatMap(([items]) => items).map((item) => item.name);
    expect(queuedNames).toContain(JobName.PersonGenerateThumbnail);

    // Dropped from the scan snapshot.
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).not.toContain(source);
  });
});

describe('FaceRepairService.applyRepair: manual move (entire cluster, NAMED source)', () => {
  it('moves all faces but keeps the named source row, still dropping it from the snapshot (E12)', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Destination' });
    const { personId: source, faceIds } = await seedCluster(ctx, user.id, 2, 'Pierre (named)');

    const scan = await scanRepo.createScan({ requestedBy: user.id, params: scanParams() });
    await scanRepo.completeScan(scan.id, {
      totals: scanTotals(1, faceIds.length),
      persons: [scanPerson(source, user.id, faceIds.length)],
    });

    const result = await sut.applyRepair({
      approvedPersonIds: [],
      manualMove: { personId: source, destinationPersonId: dest.id, entireCluster: true },
    });

    expect(result.moved).toBe(2);

    // Named source row is KEPT.
    const sourceRow = await db.selectFrom('person').select('id').where('id', '=', source).executeTakeFirst();
    expect(sourceRow?.id).toBe(source);

    // But still dropped from the snapshot so the console no longer lists it.
    const latest = await scanRepo.getLatestScan();
    const snapshotPersonIds = ((latest!.persons as unknown as RepairScanPerson[]) ?? []).map((p) => p.personId);
    expect(snapshotPersonIds).not.toContain(source);
  });
});

describe('FaceRepairService.applyRepair: manual move (partial add)', () => {
  it('moves only the picked faces to the destination and leaves the rest; the surviving source is not deleted (E5)', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Pierre' });
    const { personId: source, faceIds } = await seedCluster(ctx, user.id, 5, '');
    const picked = [faceIds[0], faceIds[1]];
    const kept = faceIds.slice(2);

    const result = await sut.applyRepair({
      approvedPersonIds: [],
      manualMove: { personId: source, destinationPersonId: dest.id, faceIds: picked },
    });

    expect(result.moved).toBe(2);

    const byId = await personIdsOf(faceIds);
    for (const faceId of picked) {
      expect(byId[faceId]).toBe(dest.id);
    }
    for (const faceId of kept) {
      expect(byId[faceId]).toBe(source);
    }

    // Source survives (faces remain) → not deleted.
    const sourceRow = await db.selectFrom('person').select('id').where('id', '=', source).executeTakeFirst();
    expect(sourceRow?.id).toBe(source);

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

describe('FaceRepairService.applyRepair: manual move durability edges', () => {
  it('skips a face already moved off the source (still-on-source re-check) without erroring (E6)', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Pierre' });
    const { personId: source, faceIds } = await seedCluster(ctx, user.id, 2, '');

    // Simulate a concurrent move: face[0] is already on the destination at apply time.
    await db.updateTable('asset_face').set({ personId: dest.id }).where('id', '=', faceIds[0]).execute();

    const result = await sut.applyRepair({
      approvedPersonIds: [],
      manualMove: { personId: source, destinationPersonId: dest.id, faceIds },
    });

    expect(result.moved).toBe(1); // only face[1] still on source moved
    expect(result.skipped).toBe(1);
    const byId = await personIdsOf(faceIds);
    expect(byId[faceIds[0]]).toBe(dest.id);
    expect(byId[faceIds[1]]).toBe(dest.id);
  });

  it('skips the whole route when the destination no longer exists (E7)', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();
    const { personId: source, faceIds } = await seedCluster(ctx, user.id, 2, '');
    const missingDestId = '00000000-0000-4000-a000-0000000000ff';

    const result = await sut.applyRepair({
      approvedPersonIds: [],
      manualMove: { personId: source, destinationPersonId: missingDestId, faceIds },
    });

    expect(result.moved).toBe(0);
    const byId = await personIdsOf(faceIds);
    for (const faceId of faceIds) {
      expect(byId[faceId]).toBe(source); // nothing moved
    }
    // Source untouched → not deleted.
    const sourceRow = await db.selectFrom('person').select('id').where('id', '=', source).executeTakeFirst();
    expect(sourceRow?.id).toBe(source);
  });

  it('no-ops on face ids that are not on the source cluster (E8)', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Pierre' });
    const { personId: source, faceIds: sourceFaces } = await seedCluster(ctx, user.id, 1, '');
    const { personId: other, faceIds: otherFaces } = await seedCluster(ctx, user.id, 1, '');
    const stray = '00000000-0000-4000-a000-0000000000ee';

    const result = await sut.applyRepair({
      approvedPersonIds: [],
      manualMove: { personId: source, destinationPersonId: dest.id, faceIds: [otherFaces[0], stray] },
    });

    expect(result.moved).toBe(0);
    const otherRow = await db
      .selectFrom('asset_face')
      .select('personId')
      .where('id', '=', otherFaces[0])
      .executeTakeFirstOrThrow();
    expect(otherRow.personId).toBe(other); // the other person's face is untouched
    // Source's own face untouched too.
    const srcRow = await db
      .selectFrom('asset_face')
      .select('personId')
      .where('id', '=', sourceFaces[0])
      .executeTakeFirstOrThrow();
    expect(srcRow.personId).toBe(source);
  });

  it('moves a large cluster in one apply, proving batched identity writes + enumeration (E20)', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Pierre' });
    const { personId: source, faceIds } = await seedCluster(ctx, user.id, 120, '');

    const result = await sut.applyRepair({
      approvedPersonIds: [],
      manualMove: { personId: source, destinationPersonId: dest.id, entireCluster: true },
    });

    expect(result.moved).toBe(120);
    const movedCount = await db
      .selectFrom('asset_face')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('personId', '=', dest.id)
      .executeTakeFirstOrThrow();
    expect(Number(movedCount.count)).toBe(120);

    const identityCount = await db
      .selectFrom('face_identity_face')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('assetFaceId', 'in', faceIds)
      .where('source', '=', 'manual')
      .executeTakeFirstOrThrow();
    expect(Number(identityCount.count)).toBe(120);
  });

  it('refuses (409) while a scan is running and mutates nothing (E10)', async () => {
    const { sut, ctx, scanRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: dest } = await ctx.newPerson({ ownerId: user.id, name: 'Pierre' });
    const { personId: source, faceIds } = await seedCluster(ctx, user.id, 2, '');

    const scan = await scanRepo.createScan({ requestedBy: user.id, params: scanParams() });
    await scanRepo.updateScanProgress(scan.id, { status: 'running', progress: { scanned: 0, total: 10 } });

    await expect(
      sut.applyRepair({
        approvedPersonIds: [],
        manualMove: { personId: source, destinationPersonId: dest.id, entireCluster: true },
      }),
    ).rejects.toThrow(ConflictException);

    // Nothing moved.
    const byId = await personIdsOf(faceIds);
    for (const faceId of faceIds) {
      expect(byId[faceId]).toBe(source);
    }
  });
});
