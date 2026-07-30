import { Kysely } from 'kysely';
import { AssetVisibility, JobStatus, SharedSpaceRole, SourceType, SystemMetadataKey } from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { ConfigRepository } from 'src/repositories/config.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { FacePersonVerdictRepository } from 'src/repositories/face-person-verdict.repository';
import { FaceRepairDeclineRepository } from 'src/repositories/face-repair-decline.repository';
import { FaceRepairScanRepository } from 'src/repositories/face-repair-scan.repository';
import { FaceRepairRepository } from 'src/repositories/face-repair.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { SearchRepository } from 'src/repositories/search.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { SystemMetadataRepository } from 'src/repositories/system-metadata.repository';
import { DB } from 'src/schema';
import { FaceRepairService } from 'src/services/face-repair.service';
import { PersonService } from 'src/services/person.service';
import { SharedSpaceService } from 'src/services/shared-space.service';
import { clearConfigCache } from 'src/utils/config';
import { MediumTestContext, newMediumService } from 'test/medium.factory';
import { factory } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';
import { Mocked } from 'vitest';

// Slice 7 — cross-flow integration. This is the slice that would have caught every leak in the design's
// defect inventory: it drives BOTH engines against ONE database and asserts that a decision made in one is
// honoured by the other. Each half is unit/medium-tested on its own; here they meet.
//
// The Face Cleanup scan (buildRepairPlan) is a real embedding KNN scan, so "not flagged" means the shared
// verdict layer actually excluded the face, not that a fixture happened to omit it.

// Disjoint-axis embeddings (cosine distance ~1.0) stand in for genuinely different people. Mirrors
// face-repair-e2e.spec.ts.
const axisEmbedding = (axis: 'first' | 'second') => {
  const values = Array.from({ length: 512 }, (_, index) => {
    const inFirstHalf = index < 256;
    return (axis === 'first' ? inFirstHalf : !inFirstHalf) ? 1 : 0;
  });
  return '[' + values.join(',') + ']';
};

const repairParams = {
  dryRun: false as const,
  maxDistance: 0.6,
  voteWindow: 50,
  minFaces: 1,
  voteMargin: 2,
  maxAttributionDistance: 0.35,
  maxFlaggedFraction: 0.5,
};

const planParams = {
  maxDistance: 0.6,
  voteWindow: 50,
  minFaces: 1,
  voteMargin: 2,
  maxAttributionDistance: 0.35,
  maxFlaggedFraction: 0.5,
};

let db: Kysely<DB>;

beforeAll(async () => {
  db = await getKyselyDB();
});

const setupRepair = () => {
  const { ctx, sut } = newMediumService(FaceRepairService, {
    database: db,
    real: [
      FaceRepairRepository,
      FaceRepairScanRepository,
      FaceRepairDeclineRepository,
      FacePersonVerdictRepository,
      SearchRepository,
      PersonRepository,
      FaceIdentityRepository,
      ConfigRepository,
      DatabaseRepository,
      SystemMetadataRepository,
    ],
    mock: [LoggingRepository, JobRepository],
  });
  const jobMock = ctx.getMock<JobRepository, Mocked<JobRepository>>(JobRepository);
  jobMock.isActive.mockResolvedValue(false);
  jobMock.queueAll.mockResolvedValue();
  jobMock.queue.mockResolvedValue();
  return { sut, ctx };
};

const setupPerson = () => {
  const { ctx, sut } = newMediumService(PersonService, {
    database: db,
    real: [
      AccessRepository,
      ConfigRepository,
      DatabaseRepository,
      FaceIdentityRepository,
      FacePersonVerdictRepository,
      PersonRepository,
      SearchRepository,
      SharedSpaceRepository,
    ],
    mock: [JobRepository, LoggingRepository, SystemMetadataRepository],
  });
  const metadata = ctx.getMock<SystemMetadataRepository, Mocked<SystemMetadataRepository>>(SystemMetadataRepository);
  metadata.get.mockResolvedValue({ machineLearning: { facialRecognition: { minFaces: 1 } } } as any);
  const jobs = ctx.getMock<JobRepository, Mocked<JobRepository>>(JobRepository);
  jobs.queue.mockResolvedValue();
  jobs.queueAll.mockResolvedValue();
  return { sut, ctx };
};

// D3 (defect 5) — the suggestion side of the cross-flow: PersonService's suggestion-scan handlers read
// `machineLearning.facialRecognition.{maxDistance,suggestions.maxDistance}` via cached getConfig(), which
// setupPerson's mock doesn't provide (it only stubs minFaces, for reassign/confirm's preference lookup).
// Wraps setupPerson unmodified with a full suggestion-band config and a cleared module-level config cache
// so it can't pick up a stale value from a preceding test's mock/DB config.
const SUGGESTION_BAND = { maxDistance: 0.5, minFaces: 1, suggestions: { enabled: true, maxDistance: 0.8 } };

const setupSuggestionPerson = () => {
  clearConfigCache();
  const { sut, ctx } = setupPerson();
  ctx
    .getMock<SystemMetadataRepository, Mocked<SystemMetadataRepository>>(SystemMetadataRepository)
    .get.mockResolvedValue({ machineLearning: { facialRecognition: SUGGESTION_BAND } } as any);
  return { sut, ctx };
};

const setupSpace = () =>
  newMediumService(SharedSpaceService, {
    database: db,
    real: [
      SharedSpaceRepository,
      FacePersonVerdictRepository,
      FaceIdentityRepository,
      ConfigRepository,
      SystemMetadataRepository,
    ],
    mock: [LoggingRepository, JobRepository],
  });

// SharedSpaceService reads config with `withCache: false` (always fresh from the DB), so writing the real
// row here is enough regardless of the personal side's mocked/cached config above.
const enableSpaceSuggestionBand = (ctx: MediumTestContext) =>
  ctx.get(SystemMetadataRepository).set(SystemMetadataKey.SystemConfig, {
    machineLearning: { facialRecognition: SUGGESTION_BAND },
  } as any);

// Bipolar embeddings give an EXACT, reproducible cosine distance (see face-suggestion-exclusions.spec.ts for
// the derivation): 0 flips is the shared "anchor" axis, 180 flips (distance ≈ 0.703) sits inside the open
// suggestion band (0.5, 0.8].
const bipolarEmbedding = (flips: number) =>
  '[' + Array.from({ length: 512 }, (_, index) => (index < flips ? -1 : 1)).join(',') + ']';
const SUGGESTION_ANCHOR = bipolarEmbedding(0);
const SUGGESTION_CANDIDATE = bipolarEmbedding(180);

const seedSuggestionFace = async (
  ctx: MediumTestContext,
  input: { ownerId: string; personId?: string | null; embedding: string },
) => {
  const { asset } = await ctx.newAsset({ ownerId: input.ownerId, visibility: AssetVisibility.Timeline });
  const { assetFace } = await ctx.newAssetFace({
    assetId: asset.id,
    personId: input.personId ?? null,
    sourceType: SourceType.MachineLearning,
  });
  await ctx.database.insertInto('face_search').values({ faceId: assetFace.id, embedding: input.embedding }).execute();
  return { asset, assetFace };
};

const newSuggestionAnchoredPerson = async (ctx: MediumTestContext, ownerId: string, name: string) => {
  const { person } = await ctx.newPerson({ ownerId, name });
  await seedSuggestionFace(ctx, { ownerId, personId: person.id, embedding: SUGGESTION_ANCHOR });
  return person;
};

const newSuggestionSpace = async (ctx: MediumTestContext, ownerId: string) => {
  const { space } = await ctx.newSharedSpace({ createdById: ownerId, faceRecognitionEnabled: true });
  await ctx.newSharedSpaceMember({ spaceId: space.id, userId: ownerId, role: SharedSpaceRole.Owner });
  return space;
};

const newSuggestionAnchoredSpacePerson = async (
  ctx: MediumTestContext,
  input: { spaceId: string; ownerId: string; name: string; identityId?: string | null },
) => {
  const spacePerson = await ctx.database
    .insertInto('shared_space_person')
    .values({
      spaceId: input.spaceId,
      name: input.name,
      type: 'person',
      isHidden: false,
      identityId: input.identityId ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const { assetFace: anchor } = await seedSuggestionFace(ctx, { ownerId: input.ownerId, embedding: SUGGESTION_ANCHOR });
  await ctx.get(SharedSpaceRepository).addPersonFaces([{ personId: spacePerson.id, assetFaceId: anchor.id }]);
  return spacePerson;
};

const newSuggestionCandidateFace = (ctx: MediumTestContext, ownerId: string) =>
  seedSuggestionFace(ctx, { ownerId, embedding: SUGGESTION_CANDIDATE });

const pendingFor = async (
  ctx: MediumTestContext,
  column: 'personId' | 'spacePersonId',
  targetId: string,
  assetFaceId: string,
) => {
  const row = await ctx.database
    .selectFrom('face_person_verdict')
    .select('id')
    .where(column, '=', targetId)
    .where('assetFaceId', '=', assetFaceId)
    .where('status', '=', 'pending')
    .executeTakeFirst();
  return row !== undefined;
};

type RepairCtx = ReturnType<typeof setupRepair>['ctx'];

// A named person with `faceCount` faces on `embedding`, each an ML face with a real face_search vector and
// an owner-person identity link — a clean, backfill-complete cluster.
const buildCluster = async (ctx: RepairCtx, ownerId: string, embedding: string, faceCount: number, name: string) => {
  const faceIdentityRepo = ctx.get(FaceIdentityRepository);
  const { person } = await ctx.newPerson({ ownerId, name });
  const identity = await faceIdentityRepo.ensurePersonIdentity(person.id);
  const faceIds: string[] = [];
  for (let index = 0; index < faceCount; index++) {
    const { asset } = await ctx.newAsset({ ownerId, visibility: AssetVisibility.Timeline });
    const { assetFace } = await ctx.newAssetFace({
      assetId: asset.id,
      personId: person.id,
      sourceType: SourceType.MachineLearning,
    });
    await ctx.database.insertInto('face_search').values({ faceId: assetFace.id, embedding }).execute();
    await faceIdentityRepo.linkFace({ assetFaceId: assetFace.id, identityId: identity.id, source: 'owner-person' });
    faceIds.push(assetFace.id);
  }
  return { person, identity, faceIds };
};

// Attach `count` faces of the given embedding to an existing person (contamination that a cleanup scan will
// flag toward whoever actually owns that embedding).
const leakFacesInto = async (
  ctx: RepairCtx,
  ownerId: string,
  person: { id: string; identityId?: string | null },
  embedding: string,
  count: number,
) => {
  const faceIdentityRepo = ctx.get(FaceIdentityRepository);
  const identity = await faceIdentityRepo.ensurePersonIdentity(person.id);
  const faceIds: string[] = [];
  for (let index = 0; index < count; index++) {
    const { asset } = await ctx.newAsset({ ownerId, visibility: AssetVisibility.Timeline });
    const { assetFace } = await ctx.newAssetFace({
      assetId: asset.id,
      personId: person.id,
      sourceType: SourceType.MachineLearning,
    });
    await ctx.database.insertInto('face_search').values({ faceId: assetFace.id, embedding }).execute();
    await faceIdentityRepo.linkFace({ assetFaceId: assetFace.id, identityId: identity.id, source: 'owner-person' });
    faceIds.push(assetFace.id);
  }
  return faceIds;
};

const flaggedFaceIds = async (repair: FaceRepairService, ownerId: string): Promise<Set<string>> => {
  const plan = await repair.buildRepairPlan({ ownerId, ...planParams });
  return new Set([...plan.toRepair, ...plan.reviewOnlyFaces].map((f) => f.assetFaceId));
};

describe('face review cross-flow: a decision in one engine is honoured by the other', () => {
  it('leak 1 — a confirmed suggestion is never re-flagged by the cleanup scan', async () => {
    const { sut: repair, ctx } = setupRepair();
    const { sut: person } = setupPerson();
    const { user } = await ctx.newUser();
    const auth = factory.auth({ user });
    const verdictRepo = ctx.get(FacePersonVerdictRepository);

    // Bob owns the "first-axis" look. Anna's cluster has been contaminated with three first-axis faces.
    await buildCluster(ctx, user.id, axisEmbedding('first'), 10, 'Bob');
    const { person: anna } = await buildCluster(ctx, user.id, axisEmbedding('second'), 5, 'Anna');
    const leaked = await leakFacesInto(ctx, user.id, anna, axisEmbedding('first'), 3);

    // Baseline: the cleanup scan flags all three leaked faces (toward Bob).
    expect(await flaggedFaceIds(repair, user.id)).toEqual(new Set(leaked));

    // Seed a genuine PENDING suggestion row for (Anna, leaked[0]) — the real precondition a confirm click
    // drains. Positive control: assert it exists before confirming, so the drain assertion below actually
    // means something.
    await verdictRepo.upsertPending([{ personId: anna.id, assetFaceId: leaked[0], distance: 0.55 }]);
    expect(await pendingFor(ctx, 'personId', anna.id, leaked[0])).toBe(true);

    // A user confirms ONE of those faces as Anna (it genuinely is a young/rare photo of her) via the REAL
    // confirm path only — no separate reassign call, so this drives exactly what a suggestion-review confirm
    // click does (the previous version of this test called reassignFacesById first, which drained the queue
    // row itself and made the confirm below a no-op — see the inline comment that used to sit here).
    await person.confirmFaceSuggestion(auth, anna.id, leaked[0]);

    // All three post-conditions of a real confirm: the face is reassigned, a manual identity link exists for
    // it, and the pending suggestion row is drained.
    const face = await db
      .selectFrom('asset_face')
      .select('personId')
      .where('id', '=', leaked[0])
      .executeTakeFirstOrThrow();
    expect(face.personId).toBe(anna.id);
    const link = await db
      .selectFrom('face_identity_face')
      .select('source')
      .where('assetFaceId', '=', leaked[0])
      .executeTakeFirst();
    expect(link?.source).toBe('manual');
    expect(await pendingFor(ctx, 'personId', anna.id, leaked[0])).toBe(false);

    // Re-scan: the confirmed face is no longer flagged; the other two still are. Before the unification this
    // was the ping-pong — an admin would be asked to move the user's confirmed face away, unrecoverably.
    const afterConfirm = await flaggedFaceIds(repair, user.id);
    expect(afterConfirm.has(leaked[0])).toBe(false);
    expect(afterConfirm.has(leaked[1])).toBe(true);
    expect(afterConfirm.has(leaked[2])).toBe(true);
  });

  it("leak 4/5 — a user's rejection suppresses a later cleanup flag toward that same person", async () => {
    const { sut: repair, ctx } = setupRepair();
    const { sut: person } = setupPerson();
    const { user } = await ctx.newUser();
    const auth = factory.auth({ user });

    const { person: bob } = await buildCluster(ctx, user.id, axisEmbedding('first'), 10, 'Bob');
    const { person: anna } = await buildCluster(ctx, user.id, axisEmbedding('second'), 5, 'Anna');
    const leaked = await leakFacesInto(ctx, user.id, anna, axisEmbedding('first'), 1);
    const face = leaked[0];

    // Baseline: cleanup flags the leaked face toward Bob.
    const flaggedBefore = await flaggedFaceIds(repair, user.id);
    expect(flaggedBefore.has(face)).toBe(true);

    // The user, reviewing Bob's suggestions, says "no, that face is NOT Bob". Recorded as a shared negative
    // verdict against Bob (with his identity).
    await person.rejectFaceSuggestion(auth, bob.id, face);

    // Re-scan: cleanup no longer flags the face toward Bob — the two engines now agree it is not his.
    const flaggedAfter = await flaggedFaceIds(repair, user.id);
    expect(flaggedAfter.has(face)).toBe(false);
  });

  it('leak 3 — a cleanup move leaves no stale pending suggestion for the moved face', async () => {
    const { sut: repair, ctx } = setupRepair();
    const { user } = await ctx.newUser();
    const verdictRepo = ctx.get(FacePersonVerdictRepository);

    const { person: bob } = await buildCluster(ctx, user.id, axisEmbedding('first'), 10, 'Bob');
    const { person: anna } = await buildCluster(ctx, user.id, axisEmbedding('second'), 5, 'Anna');
    const [face] = await leakFacesInto(ctx, user.id, anna, axisEmbedding('first'), 1);

    // A pending suggestion for this face exists for a THIRD person (Carol), left over from an earlier scan.
    const { person: carol } = await ctx.newPerson({ ownerId: user.id, name: 'Carol' });
    await verdictRepo.upsertPending([{ personId: carol.id, assetFaceId: face, distance: 0.62 }]);

    // The admin scans and moves the leaked face to its true owner, Bob.
    await repair.runRepair({ ownerId: user.id, ...repairParams });
    const moved = await db.selectFrom('asset_face').select('personId').where('id', '=', face).executeTakeFirstOrThrow();
    expect(moved.personId).toBe(bob.id);

    // The stale pending suggestion is gone — drained at the write path, not merely hidden by a read filter.
    const rows = await db
      .selectFrom('face_person_verdict')
      .select(['personId', 'status'])
      .where('assetFaceId', '=', face)
      .execute();
    expect(rows.filter((r) => r.status === 'pending')).toEqual([]);
  });

  it('leak 2 — a detached "not a face" is never re-proposed by a suggestion scan', async () => {
    const { sut: repair, ctx } = setupRepair();
    const { user } = await ctx.newUser();
    const searchRepo = ctx.get(SearchRepository);

    const { person: anna } = await buildCluster(ctx, user.id, axisEmbedding('second'), 5, 'Anna');
    const [face] = await leakFacesInto(ctx, user.id, anna, axisEmbedding('second'), 1);

    // Seed the latest scan snapshot so resolveFaces can act on this face, then detach it as "not a face".
    const scanRepo = ctx.get(FaceRepairScanRepository);
    const scan = await scanRepo.createScan({
      requestedBy: user.id,
      params: {
        maxDistance: 0.6,
        minFaces: 1,
        voteWindow: 50,
        voteMargin: 2,
        maxAttributionDistance: 0.35,
        maxFlaggedFraction: 0.5,
        largeClusterThreshold: 50,
      },
    });
    await scanRepo.replaceScanFlaggedFaces(scan.id, [
      { assetFaceId: face, personId: anna.id, suspectedOwnerId: anna.id },
    ]);
    await scanRepo.completeScan(scan.id, {
      totals: {
        eligibleFaces: 1,
        flaggedFaces: 1,
        toRepair: 1,
        reviewOnlyFaces: 0,
        reviewOnlyPersons: 0,
        affectedPersons: 1,
        reviewOnlyByReason: { overCap: 0, badTarget: 0, unAttributable: 0 },
      },
      persons: [
        {
          personId: anna.id,
          ownerId: user.id,
          personName: 'Anna',
          faceCount: 1,
          thumbnailFaceId: null,
          eligible: 1,
          flagged: 1,
          flaggedFraction: 1,
          suspectedOwners: [],
          recommendation: 'confident',
          reviewReasons: [],
        },
      ],
    });
    await repair.resolveFaces(
      { personId: anna.id, moveToPerson: [], stay: [], lock: [], detach: [face], unknown: [] },
      user.id,
    );

    // The face is tombstoned; a suggestion scan's candidate search must not return it for anyone.
    const results = await searchRepo.searchFaces({
      userIds: [user.id],
      embedding: axisEmbedding('second'),
      numResults: 20,
      maxDistance: 2,
      hasPerson: false,
    });
    expect(results.map((r) => r.id)).not.toContain(face);
  });

  // D3 (defect 5) — the suggestion engine's two scopes (personal, space) share ONE verdict layer: a
  // rejection recorded in either scope must be honoured by the other, in both directions, without a re-scan.
  it('one rejection answers personal and space scope (defect 5)', async () => {
    const { sut: person, ctx } = setupSuggestionPerson();
    const { sut: space, ctx: spaceCtx } = setupSpace();
    await enableSpaceSuggestionBand(spaceCtx);
    const { user } = await ctx.newUser();
    const auth = factory.auth({ user });

    const anna = await newSuggestionAnchoredPerson(ctx, user.id, 'Anna');
    const identity = await ctx.get(FaceIdentityRepository).ensurePersonIdentity(anna.id);
    const s = await newSuggestionSpace(ctx, user.id);
    const spaceAnna = await newSuggestionAnchoredSpacePerson(ctx, {
      spaceId: s.id,
      ownerId: user.id,
      name: 'Space Anna',
      identityId: identity.id,
    });

    // Forward: a PERSONAL rejection suppresses the SPACE scan. A CONTROL face — seeded identically but never
    // rejected — is picked up by the SAME scan call: its pending row is the positive control that this run
    // genuinely produces suggestions when nothing suppresses them (JobStatus.Success alone proves nothing —
    // handleSpacePersonSuggestionScan returns Success even when its candidate map ends up empty).
    const { assetFace: faceOne } = await newSuggestionCandidateFace(ctx, user.id);
    await ctx.newSharedSpaceAsset({ spaceId: s.id, assetId: faceOne.assetId, addedById: user.id });
    const { assetFace: faceOneControl } = await newSuggestionCandidateFace(ctx, user.id);
    await ctx.newSharedSpaceAsset({ spaceId: s.id, assetId: faceOneControl.assetId, addedById: user.id });
    await person.rejectFaceSuggestion(auth, anna.id, faceOne.id);
    await expect(person.handleSpacePersonSuggestionScan({ id: spaceAnna.id })).resolves.toBe(JobStatus.Success);
    expect(await pendingFor(ctx, 'spacePersonId', spaceAnna.id, faceOne.id)).toBe(false);
    expect(await pendingFor(ctx, 'spacePersonId', spaceAnna.id, faceOneControl.id)).toBe(true);

    // Reverse: a SPACE rejection suppresses the PERSONAL scan. Same control-face pattern.
    const { assetFace: faceTwo } = await newSuggestionCandidateFace(ctx, user.id);
    await ctx.newSharedSpaceAsset({ spaceId: s.id, assetId: faceTwo.assetId, addedById: user.id });
    const { assetFace: faceTwoControl } = await newSuggestionCandidateFace(ctx, user.id);
    await ctx.newSharedSpaceAsset({ spaceId: s.id, assetId: faceTwoControl.assetId, addedById: user.id });
    await space.rejectSpacePersonFaceSuggestion(auth, s.id, spaceAnna.id, faceTwo.id);
    await expect(person.handlePersonSuggestionScan({ id: anna.id })).resolves.toBe(JobStatus.Success);
    expect(await pendingFor(ctx, 'personId', anna.id, faceTwo.id)).toBe(false);
    expect(await pendingFor(ctx, 'personId', anna.id, faceTwoControl.id)).toBe(true);
  });

  it('keep-here suppresses a later suggestion', async () => {
    const { sut: repair, ctx } = setupRepair();
    const { sut: person } = setupSuggestionPerson();
    const { user } = await ctx.newUser();

    const o = await newSuggestionAnchoredPerson(ctx, user.id, 'O');
    // O's identity must exist BEFORE the keep-here write below — resolveFaces's stay bucket only reads an
    // owner's identity token, it never creates one, so the negative verdict would carry a null identityId
    // (personId-only) if O had never been identity-linked yet.
    const oIdentity = await ctx.get(FaceIdentityRepository).ensurePersonIdentity(o.id);
    const s = await newSuggestionSpace(ctx, user.id);
    const spaceO = await newSuggestionAnchoredSpacePerson(ctx, {
      spaceId: s.id,
      ownerId: user.id,
      name: 'Space O',
      identityId: oIdentity.id,
    });

    // Anna's cluster is contaminated with one face on O's axis — the classic leak the cleanup scan flags,
    // with O as the suspected owner.
    const { person: anna } = await ctx.newPerson({ ownerId: user.id, name: 'Anna' });
    const { assetFace: face } = await seedSuggestionFace(ctx, {
      ownerId: user.id,
      personId: anna.id,
      embedding: SUGGESTION_CANDIDATE,
    });

    const scanRepo = ctx.get(FaceRepairScanRepository);
    const scan = await scanRepo.createScan({
      requestedBy: user.id,
      params: {
        maxDistance: 0.6,
        minFaces: 1,
        voteWindow: 50,
        voteMargin: 2,
        maxAttributionDistance: 0.35,
        maxFlaggedFraction: 0.5,
        largeClusterThreshold: 50,
      },
    });
    await scanRepo.replaceScanFlaggedFaces(scan.id, [
      { assetFaceId: face.id, personId: anna.id, suspectedOwnerId: o.id },
    ]);
    await scanRepo.completeScan(scan.id, {
      totals: {
        eligibleFaces: 1,
        flaggedFaces: 1,
        toRepair: 1,
        reviewOnlyFaces: 0,
        reviewOnlyPersons: 0,
        affectedPersons: 1,
        reviewOnlyByReason: { overCap: 0, badTarget: 0, unAttributable: 0 },
      },
      persons: [
        {
          personId: anna.id,
          ownerId: user.id,
          personName: 'Anna',
          faceCount: 1,
          thumbnailFaceId: null,
          eligible: 1,
          flagged: 1,
          flaggedFraction: 1,
          suspectedOwners: [],
          recommendation: 'confident',
          reviewReasons: [],
        },
      ],
    });

    // The admin says "keep it here" — F stays on Anna, but a durable decline is recorded against O.
    await repair.resolveFaces(
      { personId: anna.id, moveToPerson: [], stay: [face.id], lock: [], detach: [], unknown: [] },
      user.id,
    );

    // Intermediate fact this whole test depends on — the "keep here" write actually produced a durable
    // NEGATIVE verdict against O, rather than the rest of the test just assuming it did.
    const stayedVerdict = await ctx.database
      .selectFrom('face_person_verdict')
      .select(['status'])
      .where('personId', '=', o.id)
      .where('assetFaceId', '=', face.id)
      .executeTakeFirst();
    expect(stayedVerdict?.status).toBe('rejected');

    // Later, the kept face is unassigned (e.g. a reset) — the exact shape a suggestion-scan candidate has.
    await ctx.database.updateTable('asset_face').set({ personId: null }).where('id', '=', face.id).execute();
    await ctx.newSharedSpaceAsset({ spaceId: s.id, assetId: face.assetId, addedById: user.id });

    // A CONTROL face, seeded identically (same embedding, same space) but never kept-here, is the positive
    // control: the same two scan calls below must still propose IT, proving the calls genuinely run a search
    // rather than vacuously returning Success with an empty candidate map.
    const { assetFace: control } = await seedSuggestionFace(ctx, {
      ownerId: user.id,
      personId: null,
      embedding: SUGGESTION_CANDIDATE,
    });
    await ctx.newSharedSpaceAsset({ spaceId: s.id, assetId: control.assetId, addedById: user.id });

    await expect(person.handlePersonSuggestionScan({ id: o.id })).resolves.toBe(JobStatus.Success);
    expect(await pendingFor(ctx, 'personId', o.id, face.id)).toBe(false);
    expect(await pendingFor(ctx, 'personId', o.id, control.id)).toBe(true);

    // The same keep-here decision, honoured in a DIFFERENT scope that shares O's identity — a space person
    // is a distinct (spacePersonId, assetFaceId) row from O's own, so this is not covered by the
    // same-target "never resurrect" upsert guard the personal assertion above could already pass on alone.
    await expect(person.handleSpacePersonSuggestionScan({ id: spaceO.id })).resolves.toBe(JobStatus.Success);
    expect(await pendingFor(ctx, 'spacePersonId', spaceO.id, face.id)).toBe(false);
    expect(await pendingFor(ctx, 'spacePersonId', spaceO.id, control.id)).toBe(true);
  });
});
