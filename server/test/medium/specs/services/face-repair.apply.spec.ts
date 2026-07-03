import { Kysely } from 'kysely';
import { JobName, SourceType } from 'src/enum';
import { ConfigRepository } from 'src/repositories/config.repository';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { FaceRepairDeclineRepository } from 'src/repositories/face-repair-decline.repository';
import { FaceRepairScanRepository } from 'src/repositories/face-repair-scan.repository';
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

// Two clusters on disjoint embedding axes — cosine distance ~1.0 — standing in for genuinely different
// people.  newEmbedding() all-positive values leave two independent vectors ~0.75 similar, which is
// unusable for fixture clarity here.
const axisEmbedding = (axis: 'first' | 'second') => {
  const values = Array.from({ length: 512 }, (_, index) => {
    const inFirstHalf = index < 256;
    return (axis === 'first' ? inFirstHalf : !inFirstHalf) ? 1 : 0;
  });
  return '[' + values.join(',') + ']';
};

// A third distinct cluster used for P2 / "bad target Q" fixtures.
const thirdAxisEmbedding = () => {
  // Ones in the first 128 positions only — disjoint from both axis embeddings.
  const values = Array.from({ length: 512 }, (_, i) => (i < 128 ? 1 : 0));
  return '[' + values.join(',') + ']';
};

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
      SystemMetadataRepository,
    ],
    mock: [LoggingRepository, JobRepository],
  });
  const jobMock = ctx.getMock<JobRepository, Mocked<JobRepository>>(JobRepository);
  // Default: queue not active, queueAll is a no-op (captured for assertions).
  jobMock.isActive.mockResolvedValue(false);
  jobMock.queueAll.mockResolvedValue();
  return { sut, ctx, jobMock };
};

// Seeds an "over-cap" person: leakedCount faces on 'first' axis + genuineCount faces on 'second' axis.
// leakedCount / (leakedCount + genuineCount) must exceed maxFlaggedFraction to be over-cap.
// Also seeds the reference owner Q (10 faces on 'first' axis) if provided, so the detector votes
// toward Q.  Returns person + leaked face ids + reference owner person.
const seedOverCapPerson = async (
  ctx: ReturnType<typeof setup>['ctx'],
  ownerId: string,
  opts: { leakedCount: number; genuineCount: number; embedding?: string },
) => {
  const leakedEmbedding = opts.embedding ?? axisEmbedding('first');

  // Seed the reference owner Q with 10 faces so there's a visible cluster to vote toward.
  const ownerQData = { ownerId, name: '' };
  const { person: ownerQ } = await ctx.newPerson(ownerQData);
  for (let i = 0; i < 10; i++) {
    const { asset } = await ctx.newAsset({ ownerId });
    const { assetFace } = await ctx.newAssetFace({
      assetId: asset.id,
      personId: ownerQ.id,
      sourceType: SourceType.MachineLearning,
    });
    await db.insertInto('face_search').values({ faceId: assetFace.id, embedding: leakedEmbedding }).execute();
  }

  // Seed the person under test.
  const { person } = await ctx.newPerson({ ownerId, name: '' });
  const leakedFaceIds: string[] = [];
  for (let i = 0; i < opts.leakedCount; i++) {
    const { asset } = await ctx.newAsset({ ownerId });
    const { assetFace } = await ctx.newAssetFace({
      assetId: asset.id,
      personId: person.id,
      sourceType: SourceType.MachineLearning,
    });
    await db.insertInto('face_search').values({ faceId: assetFace.id, embedding: leakedEmbedding }).execute();
    leakedFaceIds.push(assetFace.id);
  }
  for (let i = 0; i < opts.genuineCount; i++) {
    const { asset } = await ctx.newAsset({ ownerId });
    const { assetFace } = await ctx.newAssetFace({
      assetId: asset.id,
      personId: person.id,
      sourceType: SourceType.MachineLearning,
    });
    await db
      .insertInto('face_search')
      .values({ faceId: assetFace.id, embedding: axisEmbedding('second') })
      .execute();
  }

  return { person, leakedFaceIds, ownerQ };
};

beforeAll(async () => {
  db = await getKyselyDB();
});

afterEach(() => db.deleteFrom('face_repair_scan').execute());

// ── Case 1: approve subset re-homes only approved; unapproved untouched ─────────────────────────

describe('FaceRepairService.applyRepair: approve subset', () => {
  it('approving P1 only re-homes P1 flagged faces to their suspected owner; P2 faces are untouched', async () => {
    const { sut, ctx, jobMock } = setup();
    const { user } = await ctx.newUser();

    // P1 and P2 are both over-cap (6 leaked / 10 total = 60% > maxFlaggedFraction 50%).
    // P1 uses first-axis leaks, P2 uses third-axis leaks (each with their own owner reference cluster).
    const {
      person: p1,
      leakedFaceIds: p1Leaked,
      ownerQ: ownerQ1,
    } = await seedOverCapPerson(ctx, user.id, {
      leakedCount: 6,
      genuineCount: 4,
      embedding: axisEmbedding('first'),
    });
    const { person: p2, leakedFaceIds: p2Leaked } = await seedOverCapPerson(ctx, user.id, {
      leakedCount: 6,
      genuineCount: 4,
      embedding: thirdAxisEmbedding(),
    });

    const result = await sut.applyRepair({ approvedPersonIds: [p1.id] });

    // P1's flagged faces should have been moved to their suspected owner.
    expect(result.moved).toBe(p1Leaked.length);

    // P1's flagged faces now belong to the suspected owner Q1 — durably (not unassigned, not boomeranged).
    const p1Rows = await db.selectFrom('asset_face').select(['id', 'personId']).where('id', 'in', p1Leaked).execute();
    for (const row of p1Rows) {
      expect(row.personId).toBe(ownerQ1.id);
    }

    // P2's faces are unchanged — still assigned to P2.
    const p2Rows = await db.selectFrom('asset_face').select(['id', 'personId']).where('id', 'in', p2Leaked).execute();
    for (const row of p2Rows) {
      expect(row.personId).toBe(p2.id);
    }

    // The apply never re-queues facial recognition (that is what previously re-clustered faces back).
    const queuedJobNames = jobMock.queueAll.mock.calls.flatMap(([items]) => items).map((item) => item.name);
    expect(queuedJobNames).not.toContain(JobName.FacialRecognition);
  });
});

// ── Stored scan params govern apply ─────────────────────────────────────────────────────────────

describe('FaceRepairService.applyRepair: honors stored scan params', () => {
  it("re-plans with the latest scan's stored params, not config defaults", async () => {
    const { sut, ctx, jobMock } = setup();
    jobMock.queue.mockResolvedValue(); // triggerScan enqueues the scan job; we run it inline below
    const { user } = await ctx.newUser();
    const { person, leakedFaceIds } = await seedOverCapPerson(ctx, user.id, { leakedCount: 6, genuineCount: 4 });

    // Tuned scan: voteMargin 1000 — the leaked faces' owner cluster (10) cannot out-vote ownCount (5) by
    // 1000, and ownCount (5) >= minFaces (3), so NOTHING is flagged under these params.
    const { scanId } = await sut.triggerScan(user.id, { voteMargin: 1000 });
    await sut.handleFaceRepairScan({ scanId });
    const tuned = await sut.getLatestScanStatus();
    expect(tuned!.status).toBe('completed');
    expect(tuned!.totals!.flaggedFaces).toBe(0); // sanity: the tuned params flag nothing

    // Apply must compute under the SAME stored params -> nothing moves. With config defaults
    // (voteMargin 2) it would move all 6 leaked faces — the pre-fix regression.
    const result = await sut.applyRepair({ approvedPersonIds: [person.id] });
    expect(result.moved).toBe(0);

    const rows = await db.selectFrom('asset_face').select(['personId']).where('id', 'in', leakedFaceIds).execute();
    for (const row of rows) {
      expect(row.personId).toBe(person.id);
    }
  });
});

// ── Case 2: excludeFaceIds end-to-end ────────────────────────────────────────────────────────────

describe('FaceRepairService.applyRepair: excludeFaceIds', () => {
  it('excludes the specified face ids — only remaining approved faces are re-homed', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();

    // P1 over-cap: 6 leaked faces.
    const {
      person: p1,
      leakedFaceIds: p1Leaked,
      ownerQ,
    } = await seedOverCapPerson(ctx, user.id, {
      leakedCount: 6,
      genuineCount: 4,
    });

    const excludedFaceId = p1Leaked[0];
    const result = await sut.applyRepair({
      approvedPersonIds: [p1.id],
      excludeFaceIds: [excludedFaceId],
    });

    // One face was excluded → moved = flaggedCount - 1.
    expect(result.moved).toBe(p1Leaked.length - 1);

    // The excluded face still belongs to P1.
    const excludedRow = await db
      .selectFrom('asset_face')
      .select('personId')
      .where('id', '=', excludedFaceId)
      .executeTakeFirstOrThrow();
    expect(excludedRow.personId).toBe(p1.id);

    // All other leaked faces now belong to the suspected owner Q.
    const otherFaceIds = p1Leaked.slice(1);
    const otherRows = await db
      .selectFrom('asset_face')
      .select(['id', 'personId'])
      .where('id', 'in', otherFaceIds)
      .execute();
    for (const row of otherRows) {
      expect(row.personId).toBe(ownerQ.id);
    }
  });
});

// ── Case 3: idempotent re-apply ──────────────────────────────────────────────────────────────────

describe('FaceRepairService.applyRepair: idempotent re-apply', () => {
  it('second applyRepair with same approvedPersonIds returns moved: 0 (faces already re-homed)', async () => {
    const { sut, ctx } = setup();
    const { user } = await ctx.newUser();

    const { person: p1 } = await seedOverCapPerson(ctx, user.id, {
      leakedCount: 6,
      genuineCount: 4,
    });

    // First apply: should move the over-cap faces to their suspected owner.
    const first = await sut.applyRepair({ approvedPersonIds: [p1.id] });
    expect(first.moved).toBeGreaterThan(0);

    // Second apply: scoped to the same personIds, but the faces no longer belong to P1 → nothing to re-home.
    const second = await sut.applyRepair({ approvedPersonIds: [p1.id] });
    expect(second.moved).toBe(0);
    expect(second.skipped).toBe(0);
  });
});
