import { Kysely } from 'kysely';
import { JobStatus, SharedSpaceRole, SourceType, SystemMetadataKey } from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { ConfigRepository } from 'src/repositories/config.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { FacePersonVerdictRepository } from 'src/repositories/face-person-verdict.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { SearchRepository } from 'src/repositories/search.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { SystemMetadataRepository } from 'src/repositories/system-metadata.repository';
import { DB } from 'src/schema';
import { PersonService } from 'src/services/person.service';
import { SharedSpaceService } from 'src/services/shared-space.service';
import { clearConfigCache } from 'src/utils/config';
import { MediumTestContext, newMediumService } from 'test/medium.factory';
import { factory } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';
import { Mocked } from 'vitest';

// D3 (docs/superpowers/plans/2026-07-23-face-verdict-remediation-slice-3.md): the suggestion engine must
// consult the SAME shared verdict layer the Face Cleanup engine writes to. This suite drives the REAL
// suggestion-scan handlers (PersonService) and the REAL space-confirm handler (SharedSpaceService) against
// one database, with real face-embedding search (no ANN mocking), and proves a face already settled by
// EITHER engine — a manual link, a negative verdict, a keep-here decline, or a space confirm — is never
// re-proposed, in every scope that shares its identity, without needing a re-scan.

let db: Kysely<DB>;

beforeAll(async () => {
  db = await getKyselyDB();
});

// Bipolar embeddings give an EXACT, reproducible cosine distance: for two ±1-valued 512-dim vectors that
// differ in exactly `flips` positions, cosine distance = flips / 256 (dot product = 512 - 2*flips, and both
// vectors have magnitude sqrt(512)). 0 flips is the shared "anchor" axis every target in a scenario is
// assigned to; 180 flips (distance ≈ 0.703) sits comfortably inside the open suggestion band (0.5, 0.8],
// away from either edge so approximate ANN recall on a tiny fixture can't flip the result.
const bipolarEmbedding = (flips: number) =>
  '[' + Array.from({ length: 512 }, (_, index) => (index < flips ? -1 : 1)).join(',') + ']';
const ANCHOR = bipolarEmbedding(0);
const CANDIDATE = bipolarEmbedding(180);

const BAND = { maxDistance: 0.5, suggestionMaxDistance: 0.8, minFaces: 1 };
const CONFIG = {
  machineLearning: {
    facialRecognition: {
      maxDistance: BAND.maxDistance,
      minFaces: BAND.minFaces,
      suggestions: { enabled: true, maxDistance: BAND.suggestionMaxDistance },
    },
  },
};
const bandOpts = {
  maxDistance: BAND.maxDistance,
  suggestionMaxDistance: BAND.suggestionMaxDistance,
  page: 1,
  size: 50,
};

const setupPerson = () => {
  clearConfigCache();
  const { sut, ctx } = newMediumService(PersonService, {
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
  ctx
    .getMock<SystemMetadataRepository, Mocked<SystemMetadataRepository>>(SystemMetadataRepository)
    .get.mockResolvedValue(CONFIG as any);
  const jobs = ctx.getMock<JobRepository, Mocked<JobRepository>>(JobRepository);
  jobs.queue.mockResolvedValue();
  jobs.queueAll.mockResolvedValue();
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
// row here is enough regardless of the personal side's mocked/cached config.
const enableSpaceBand = (ctx: MediumTestContext) =>
  ctx.get(SystemMetadataRepository).set(SystemMetadataKey.SystemConfig, CONFIG as any);

const authFor = (user: { id: string; name: string; email: string }) => factory.auth({ user });

const seedFace = async (
  ctx: MediumTestContext,
  input: { ownerId: string; personId?: string | null; embedding: string },
) => {
  const { asset } = await ctx.newAsset({ ownerId: input.ownerId });
  const { assetFace } = await ctx.newAssetFace({
    assetId: asset.id,
    personId: input.personId ?? null,
    sourceType: SourceType.MachineLearning,
  });
  await ctx.database.insertInto('face_search').values({ faceId: assetFace.id, embedding: input.embedding }).execute();
  return { asset, assetFace };
};

// A named personal person with an owned anchor face on the shared axis, so a scan for them has an embedding
// sample to search from.
const newAnchoredPerson = async (ctx: MediumTestContext, ownerId: string, name: string) => {
  const { person } = await ctx.newPerson({ ownerId, name });
  await seedFace(ctx, { ownerId, personId: person.id, embedding: ANCHOR });
  return person;
};

const newSpace = async (ctx: MediumTestContext, ownerId: string) => {
  const { space } = await ctx.newSharedSpace({ createdById: ownerId, faceRecognitionEnabled: true });
  await ctx.newSharedSpaceMember({ spaceId: space.id, userId: ownerId, role: SharedSpaceRole.Owner });
  return space;
};

// A named space person with an anchor face assigned via `shared_space_person_face` (the space-scan
// embedding source), optionally pre-linked to a personal identity to model "shares that identity".
const newAnchoredSpacePerson = async (
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
  const { assetFace: anchor } = await seedFace(ctx, { ownerId: input.ownerId, embedding: ANCHOR });
  await ctx.get(SharedSpaceRepository).addPersonFaces([{ personId: spacePerson.id, assetFaceId: anchor.id }]);
  return spacePerson;
};

const newCandidateFace = (ctx: MediumTestContext, ownerId: string) => seedFace(ctx, { ownerId, embedding: CANDIDATE });

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

describe('face suggestion engine reads the shared verdict layer (D3)', () => {
  it('a manual-linked face is proposed to no one, in personal scope or any space scope', async () => {
    const { sut: person, ctx } = setupPerson();
    const { user } = await ctx.newUser();
    const anna = await newAnchoredPerson(ctx, user.id, 'Anna');

    const spaceOne = await newSpace(ctx, user.id);
    const spaceAlice = await newAnchoredSpacePerson(ctx, {
      spaceId: spaceOne.id,
      ownerId: user.id,
      name: 'Space Alice',
    });
    const spaceTwo = await newSpace(ctx, user.id);
    const spaceCarl = await newAnchoredSpacePerson(ctx, { spaceId: spaceTwo.id, ownerId: user.id, name: 'Space Carl' });

    const { assetFace: face } = await newCandidateFace(ctx, user.id);
    await ctx.newSharedSpaceAsset({ spaceId: spaceOne.id, assetId: face.assetId, addedById: user.id });
    await ctx.newSharedSpaceAsset({ spaceId: spaceTwo.id, assetId: face.assetId, addedById: user.id });

    // The face is already settled — manually linked to a completely UNRELATED identity. Manual-link
    // exclusion is owner-agnostic: it doesn't matter who the face was linked to, only that a human already
    // placed it, so it must never surface as a suggestion again for anyone, anywhere.
    const { person: zed } = await ctx.newPerson({ ownerId: user.id, name: 'Zed' });
    const zedIdentity = await ctx.get(FaceIdentityRepository).ensurePersonIdentity(zed.id);
    await ctx
      .get(FaceIdentityRepository)
      .replaceFaceIdentity({ assetFaceId: face.id, identityId: zedIdentity.id, source: 'manual' });

    await expect(person.handlePersonSuggestionScan({ id: anna.id })).resolves.toBe(JobStatus.Success);
    await expect(person.handleSpacePersonSuggestionScan({ id: spaceAlice.id })).resolves.toBe(JobStatus.Success);
    await expect(person.handleSpacePersonSuggestionScan({ id: spaceCarl.id })).resolves.toBe(JobStatus.Success);

    expect(await pendingFor(ctx, 'personId', anna.id, face.id)).toBe(false);
    expect(await pendingFor(ctx, 'spacePersonId', spaceAlice.id, face.id)).toBe(false);
    expect(await pendingFor(ctx, 'spacePersonId', spaceCarl.id, face.id)).toBe(false);
  });

  it('a negative verdict toward I(Anna) is honoured in every scope sharing that identity', async () => {
    const { sut: person, ctx } = setupPerson();
    const { user } = await ctx.newUser();
    const auth = authFor(user);
    const anna = await newAnchoredPerson(ctx, user.id, 'Anna');
    const identity = await ctx.get(FaceIdentityRepository).ensurePersonIdentity(anna.id);

    const space = await newSpace(ctx, user.id);
    const spaceAnna = await newAnchoredSpacePerson(ctx, {
      spaceId: space.id,
      ownerId: user.id,
      name: 'Space Anna',
      identityId: identity.id,
    });

    // Q shares NEITHER Anna's person id nor her identity — the exclusion must be target-scoped, not global.
    const q = await newAnchoredPerson(ctx, user.id, 'Q');

    const { assetFace: face } = await newCandidateFace(ctx, user.id);
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: face.assetId, addedById: user.id });

    await person.rejectFaceSuggestion(auth, anna.id, face.id);

    await expect(person.handlePersonSuggestionScan({ id: anna.id })).resolves.toBe(JobStatus.Success);
    await expect(person.handleSpacePersonSuggestionScan({ id: spaceAnna.id })).resolves.toBe(JobStatus.Success);
    await expect(person.handlePersonSuggestionScan({ id: q.id })).resolves.toBe(JobStatus.Success);

    expect(await pendingFor(ctx, 'personId', anna.id, face.id)).toBe(false);
    expect(await pendingFor(ctx, 'spacePersonId', spaceAnna.id, face.id)).toBe(false);
    expect(await pendingFor(ctx, 'personId', q.id, face.id)).toBe(true);
  });

  it('an admin keep-here suppresses a later suggestion, even after the face is unassigned', async () => {
    const { sut: person, ctx } = setupPerson();
    const { user } = await ctx.newUser();
    const o = await newAnchoredPerson(ctx, user.id, 'O');
    const oIdentity = await ctx.get(FaceIdentityRepository).ensurePersonIdentity(o.id);

    const space = await newSpace(ctx, user.id);
    const spaceO = await newAnchoredSpacePerson(ctx, {
      spaceId: space.id,
      ownerId: user.id,
      name: 'Space O',
      identityId: oIdentity.id,
    });

    // F is unassigned when the scan runs — the same shape a "keep here" face has once later detached/reset.
    const { assetFace: face } = await newCandidateFace(ctx, user.id);
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: face.assetId, addedById: user.id });

    // Simulates the Face Cleanup "keep here" write: a durable decline recorded as a shared negative verdict
    // against the suspected owner (source: 'cleanup') — the exact write `resolveFaces`'s stay bucket performs
    // (face-repair.service.ts, soft-stay).
    await ctx.get(FacePersonVerdictRepository).markRejected(o.id, face.id, {
      identityId: oIdentity.id,
      source: 'cleanup',
      actorId: user.id,
    });

    await expect(person.handlePersonSuggestionScan({ id: o.id })).resolves.toBe(JobStatus.Success);
    await expect(person.handleSpacePersonSuggestionScan({ id: spaceO.id })).resolves.toBe(JobStatus.Success);

    expect(await pendingFor(ctx, 'personId', o.id, face.id)).toBe(false);
    expect(await pendingFor(ctx, 'spacePersonId', spaceO.id, face.id)).toBe(false);
  });

  it("space confirm makes the same space's next scan skip the face for every space person", async () => {
    const { sut: person, ctx } = setupPerson();
    const { sut: space, ctx: spaceCtx } = setupSpace();
    await enableSpaceBand(spaceCtx);
    const { user } = await ctx.newUser();
    const auth = authFor(user);

    const s = await newSpace(ctx, user.id);
    const alice = await newAnchoredSpacePerson(ctx, { spaceId: s.id, ownerId: user.id, name: 'Alice' });
    const bob = await newAnchoredSpacePerson(ctx, { spaceId: s.id, ownerId: user.id, name: 'Bob' });

    const { assetFace: face } = await newCandidateFace(ctx, user.id);
    await ctx.newSharedSpaceAsset({ spaceId: s.id, assetId: face.assetId, addedById: user.id });

    // Alice's scan proposes F.
    await expect(person.handleSpacePersonSuggestionScan({ id: alice.id })).resolves.toBe(JobStatus.Success);
    expect(await pendingFor(ctx, 'spacePersonId', alice.id, face.id)).toBe(true);

    // A reviewer confirms F for Alice.
    await space.confirmSpacePersonFaceSuggestion(auth, s.id, alice.id, face.id);

    const projection = await ctx.database
      .selectFrom('shared_space_person_face')
      .selectAll()
      .where('personId', '=', alice.id)
      .where('assetFaceId', '=', face.id)
      .executeTakeFirst();
    expect(projection).toBeDefined();

    // Bob's re-scan must skip F now — the space-wide assigned-face exclusion the confirm's projection feeds.
    await expect(person.handleSpacePersonSuggestionScan({ id: bob.id })).resolves.toBe(JobStatus.Success);
    expect(await pendingFor(ctx, 'spacePersonId', bob.id, face.id)).toBe(false);
  });

  it('a face settled after the scan leaves both pending reads, without a re-scan', async () => {
    const { sut: person, ctx } = setupPerson();
    const { user } = await ctx.newUser();
    const o = await newAnchoredPerson(ctx, user.id, 'O');

    const space = await newSpace(ctx, user.id);
    const spaceO = await newAnchoredSpacePerson(ctx, { spaceId: space.id, ownerId: user.id, name: 'Space O' });

    const { assetFace: face } = await newCandidateFace(ctx, user.id);
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: face.assetId, addedById: user.id });

    await expect(person.handlePersonSuggestionScan({ id: o.id })).resolves.toBe(JobStatus.Success);
    await expect(person.handleSpacePersonSuggestionScan({ id: spaceO.id })).resolves.toBe(JobStatus.Success);

    const verdictRepo = ctx.get(FacePersonVerdictRepository);
    const before = await verdictRepo.getPendingForPerson(o.id, bandOpts);
    expect(before.items.map((item) => item.assetFaceId)).toContain(face.id);
    const beforeSpace = await verdictRepo.getPendingForSpacePerson(space.id, spaceO.id, bandOpts);
    expect(beforeSpace.items.map((item) => item.assetFaceId)).toContain(face.id);

    // Settle the face OUTSIDE the confirm/reassign path (which would drain the pending rows itself) — a
    // bare manual link, the way a backfill or an out-of-band write might record one. This isolates the
    // READ's own self-heal from any write-path drain.
    const { person: zed } = await ctx.newPerson({ ownerId: user.id, name: 'Zed' });
    const zedIdentity = await ctx.get(FaceIdentityRepository).ensurePersonIdentity(zed.id);
    await ctx
      .get(FaceIdentityRepository)
      .replaceFaceIdentity({ assetFaceId: face.id, identityId: zedIdentity.id, source: 'manual' });

    const rows = await ctx.database
      .selectFrom('face_person_verdict')
      .select('status')
      .where('assetFaceId', '=', face.id)
      .execute();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.status === 'pending')).toBe(true); // the write path did NOT drain it

    const after = await verdictRepo.getPendingForPerson(o.id, bandOpts);
    expect(after.items.map((item) => item.assetFaceId)).not.toContain(face.id);
    const afterSpace = await verdictRepo.getPendingForSpacePerson(space.id, spaceO.id, bandOpts);
    expect(afterSpace.items.map((item) => item.assetFaceId)).not.toContain(face.id);
  });
});
