import { Kysely } from 'kysely';
import { SharedSpaceRole, SourceType } from 'src/enum';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { FacePersonVerdictRepository } from 'src/repositories/face-person-verdict.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { IdentityMergePropagationService, MergeAuthorizer } from 'src/services/identity-merge-propagation.service';
import { newMediumService } from 'test/medium.factory';
import { factory } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';
import { Mocked } from 'vitest';

// The engine fails closed on a destructive plan (a same-space collapse) unless an authorizer ran (#733 review
// L3). The space fixtures below always merge within one space with an Editor actor, so the collapse is never
// actually unrepairable — this permissive authorizer is passed purely to match the production call sites,
// which always supply one; RBAC policy itself is covered elsewhere (merge-policy.spec.ts).
const ALLOW_MERGE: MergeAuthorizer = () => Promise.resolve();

let defaultDatabase: Kysely<DB>;

const setup = (db: Kysely<DB> = defaultDatabase) => {
  const { ctx } = newMediumService(BaseService, {
    database: db,
    real: [
      DatabaseRepository,
      FaceIdentityRepository,
      PersonRepository,
      SharedSpaceRepository,
      FacePersonVerdictRepository,
    ],
    mock: [JobRepository, LoggingRepository],
  });
  const jobRepository = ctx.getMock<JobRepository, Mocked<JobRepository>>(JobRepository);
  jobRepository.queue.mockResolvedValue();
  const sut = new IdentityMergePropagationService({
    databaseRepository: ctx.get(DatabaseRepository),
    faceIdentityRepository: ctx.get(FaceIdentityRepository),
    jobRepository,
    logger: ctx.getMock<LoggingRepository, Mocked<LoggingRepository>>(LoggingRepository),
    personRepository: ctx.get(PersonRepository),
    sharedSpaceRepository: ctx.get(SharedSpaceRepository),
  });
  return {
    ctx,
    sut,
    faceIdentityRepository: ctx.get(FaceIdentityRepository),
    facePersonVerdictRepository: ctx.get(FacePersonVerdictRepository),
  };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

const seedFace = async (ctx: Awaited<ReturnType<typeof setup>>['ctx'], ownerId: string) => {
  const { asset } = await ctx.newAsset({ ownerId });
  const { assetFace } = await ctx.newAssetFace({
    assetId: asset.id,
    personId: null,
    sourceType: SourceType.MachineLearning,
  });
  return assetFace.id;
};

const verdictRow = (assetFaceId: string) =>
  defaultDatabase
    .selectFrom('face_person_verdict')
    .select(['id', 'personId', 'spacePersonId', 'identityId', 'status'])
    .where('assetFaceId', '=', assetFaceId)
    .execute();

const newSpacePerson = (spaceId: string, name: string) =>
  defaultDatabase
    .insertInto('shared_space_person')
    .values({ spaceId, name, type: 'person' })
    .returningAll()
    .executeTakeFirstOrThrow();

/**
 * Space twin of {@link seedFace}: an editor-owned shared space with a space-reachable asset+face, and Bob/Robert
 * as two space-people in that space. Mirrors the fixture patterns in shared-space-face-suggestions.service.spec.ts
 * (`createSuggestionFixture`) and face-person-verdict.repository.spec.ts's space-person suggestion methods block.
 */
const seedSpaceMergeFixture = async (ctx: Awaited<ReturnType<typeof setup>>['ctx']) => {
  const { user: owner } = await ctx.newUser();
  const { user: editor } = await ctx.newUser();
  const { space } = await ctx.newSharedSpace({ createdById: owner.id });
  await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
  await ctx.newSharedSpaceMember({ spaceId: space.id, userId: editor.id, role: SharedSpaceRole.Editor });
  const { asset } = await ctx.newAsset({ ownerId: owner.id });
  await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: owner.id });
  const { assetFace } = await ctx.newAssetFace({
    assetId: asset.id,
    personId: null,
    sourceType: SourceType.MachineLearning,
  });
  const bob = await newSpacePerson(space.id, 'Bob');
  const robert = await newSpacePerson(space.id, 'Robert');
  return { editor, space, faceId: assetFace.id, bob, robert };
};

describe('face verdict merge durability (D1)', () => {
  it('keep-here verdict survives Bob→Robert person merge, re-keyed to the survivor identity', async () => {
    const { ctx, sut, faceIdentityRepository, facePersonVerdictRepository } = setup();
    const { user } = await ctx.newUser();
    const { person: bob } = await ctx.newPerson({ ownerId: user.id, name: 'Bob' });
    const { person: robert } = await ctx.newPerson({ ownerId: user.id, name: 'Robert' });
    const faceId = await seedFace(ctx, user.id);
    const bobIdentity = await faceIdentityRepository.ensurePersonIdentity(bob.id);
    const robertIdentity = await faceIdentityRepository.ensurePersonIdentity(robert.id);
    // cleanup keep-here: (F, Bob, I(Bob), rejected, cleanup)
    await facePersonVerdictRepository.markRejected(bob.id, faceId, {
      identityId: bobIdentity.id,
      source: 'cleanup',
      actorId: user.id,
    });

    await sut.mergePersonalPeople(factory.auth({ user }), robert.id, [bob.id]);

    const rows = await verdictRow(faceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'rejected', personId: robert.id, identityId: robertIdentity.id });
    // honoured identity-first by the shared read
    const tokens = await facePersonVerdictRepository.getNegativeVerdictTokens([faceId]);
    expect([...(tokens.get(faceId) ?? [])]).toContain(`identity:${robertIdentity.id}`);
  });

  it('identity-null suggestion reject survives the merge via personId re-target', async () => {
    const { ctx, sut, faceIdentityRepository, facePersonVerdictRepository } = setup();
    const { user } = await ctx.newUser();
    const { person: bob } = await ctx.newPerson({ ownerId: user.id, name: 'Bob' });
    const { person: robert } = await ctx.newPerson({ ownerId: user.id, name: 'Robert' });
    const faceId = await seedFace(ctx, user.id);
    await faceIdentityRepository.ensurePersonIdentity(robert.id);
    // suggestion reject as it is written TODAY (pre-Slice-2): no identity, personId only.
    await facePersonVerdictRepository.markRejected(bob.id, faceId);

    await sut.mergePersonalPeople(factory.auth({ user }), robert.id, [bob.id]);

    const rows = await verdictRow(faceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'rejected', personId: robert.id });
  });

  it('identity-only merge re-keys the verdict instead of destroying it', async () => {
    const { ctx, faceIdentityRepository, facePersonVerdictRepository } = setup();
    const { user } = await ctx.newUser();
    const { person: bob } = await ctx.newPerson({ ownerId: user.id, name: 'Bob' });
    const faceId = await seedFace(ctx, user.id);
    const bobIdentity = await faceIdentityRepository.ensurePersonIdentity(bob.id);
    const target = await defaultDatabase
      .insertInto('face_identity')
      .values({ type: 'person' })
      .returningAll()
      .executeTakeFirstOrThrow();
    await facePersonVerdictRepository.markRejected(bob.id, faceId, {
      identityId: bobIdentity.id,
      source: 'cleanup',
      actorId: user.id,
    });

    // 'manual' source merges all sources without the embedding-consistency filter, exercising the
    // identical re-key statement; the shared-space-evidence production path is covered above.
    await faceIdentityRepository.mergeIdentities({
      targetIdentityId: target.id,
      sourceIdentityIds: [bobIdentity.id],
      source: 'manual',
    });

    const rows = await verdictRow(faceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].identityId).toBe(target.id);
    expect(rows[0].status).toBe('rejected');
  });

  // The next two are survivor-wins collision-handling locks (not D1 reproductions): the source row's CASCADE
  // at red masks the bug, so they guard against a naive UPDATE-only retarget rather than reproducing D1.
  it('survivor wins on collision: source verdict dropped, survivor untouched', async () => {
    const { ctx, sut, faceIdentityRepository, facePersonVerdictRepository } = setup();
    const { user } = await ctx.newUser();
    const { person: bob } = await ctx.newPerson({ ownerId: user.id, name: 'Bob' });
    const { person: robert } = await ctx.newPerson({ ownerId: user.id, name: 'Robert' });
    const faceId = await seedFace(ctx, user.id);
    const bobIdentity = await faceIdentityRepository.ensurePersonIdentity(bob.id);
    const robertIdentity = await faceIdentityRepository.ensurePersonIdentity(robert.id);
    // Bob IGNORED F, Robert (survivor) REJECTED F. Distinct statuses prove which row survives.
    await facePersonVerdictRepository.markIgnored(bob.id, faceId, {
      identityId: bobIdentity.id,
      source: 'suggestion',
      actorId: user.id,
    });
    await facePersonVerdictRepository.markRejected(robert.id, faceId, {
      identityId: robertIdentity.id,
      source: 'cleanup',
      actorId: user.id,
    });

    await sut.mergePersonalPeople(factory.auth({ user }), robert.id, [bob.id]);

    const rows = await verdictRow(faceId);
    expect(rows).toHaveLength(1); // no unique-violation, source row dropped
    // Survivor's row kept untouched: it is Robert's REJECTED row, not Bob's ignored one.
    expect(rows[0]).toMatchObject({ personId: robert.id, identityId: robertIdentity.id, status: 'rejected' });
  });

  it('survivor wins on collision regardless of which side is pending vs rejected', async () => {
    const { ctx, sut, faceIdentityRepository, facePersonVerdictRepository } = setup();
    const { user } = await ctx.newUser();
    const { person: bob } = await ctx.newPerson({ ownerId: user.id, name: 'Bob' });
    const { person: robert } = await ctx.newPerson({ ownerId: user.id, name: 'Robert' });
    const faceId = await seedFace(ctx, user.id);
    const bobIdentity = await faceIdentityRepository.ensurePersonIdentity(bob.id);
    const robertIdentity = await faceIdentityRepository.ensurePersonIdentity(robert.id);
    // Source (Bob) pending suggestion, survivor (Robert) already rejected — survivor's row wins regardless of status.
    await defaultDatabase
      .insertInto('face_person_verdict')
      .values({ personId: bob.id, assetFaceId: faceId, identityId: bobIdentity.id, status: 'pending', distance: 0.4 })
      .execute();
    await facePersonVerdictRepository.markRejected(robert.id, faceId, {
      identityId: robertIdentity.id,
      source: 'cleanup',
      actorId: user.id,
    });

    await sut.mergePersonalPeople(factory.auth({ user }), robert.id, [bob.id]);

    const rows = await verdictRow(faceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ personId: robert.id, identityId: robertIdentity.id, status: 'rejected' });
  });

  it('GC (deleteUnreferencedIdentities) degrades an identity-only verdict to SET NULL, never deletes', async () => {
    const { ctx, faceIdentityRepository, facePersonVerdictRepository } = setup();
    const { user } = await ctx.newUser();
    const { person: bob } = await ctx.newPerson({ ownerId: user.id, name: 'Bob' });
    const faceId = await seedFace(ctx, user.id);
    const bobIdentity = await faceIdentityRepository.ensurePersonIdentity(bob.id);
    await facePersonVerdictRepository.markRejected(bob.id, faceId, {
      identityId: bobIdentity.id,
      source: 'cleanup',
      actorId: user.id,
    });
    // remove the person so only the verdict references the identity, then GC
    await defaultDatabase.deleteFrom('person').where('id', '=', bob.id).execute();
    await faceIdentityRepository.deleteUnreferencedIdentities();

    const rows = await verdictRow(faceId);
    expect(rows).toHaveLength(1); // NOT cascade-deleted
    expect(rows[0].identityId).toBeNull(); // SET NULL degrade
    expect(rows[0].status).toBe('rejected');
  });

  it('space verdict survives a space-person merge, re-targeted to the survivor', async () => {
    const { ctx, sut, faceIdentityRepository, facePersonVerdictRepository } = setup();
    const { editor, space, faceId, bob, robert } = await seedSpaceMergeFixture(ctx);
    const bobIdentity = await faceIdentityRepository.ensureSpacePersonIdentity(bob.id);
    const robertIdentity = await faceIdentityRepository.ensureSpacePersonIdentity(robert.id);
    // space-cleanup keep-here: (F, Bob, I(Bob), rejected, cleanup)
    await facePersonVerdictRepository.markRejectedForSpacePerson(bob.id, faceId, {
      identityId: bobIdentity.id,
      source: 'cleanup',
      actorId: editor.id,
    });

    await sut.mergeSpacePeople(factory.auth({ user: editor }), space.id, robert.id, [bob.id], ALLOW_MERGE);

    const rows = await verdictRow(faceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'rejected', spacePersonId: robert.id, identityId: robertIdentity.id });
  });

  it('space collision: survivor wins, source row dropped (red-first)', async () => {
    const { ctx, sut, faceIdentityRepository, facePersonVerdictRepository } = setup();
    const { editor, space, faceId, bob, robert } = await seedSpaceMergeFixture(ctx);
    // Bob (source) has NO identity on its verdict row: an identity-null row is not touched by the identity-side
    // rekey/cascade, so if the retarget's survivor-wins delete is the thing that makes this pass, this test
    // is genuinely red without it — not accidentally green via a different removal path.
    await faceIdentityRepository.ensureSpacePersonIdentity(bob.id);
    const robertIdentity = await faceIdentityRepository.ensureSpacePersonIdentity(robert.id);
    await facePersonVerdictRepository.markRejectedForSpacePerson(bob.id, faceId);
    await facePersonVerdictRepository.markRejectedForSpacePerson(robert.id, faceId, {
      identityId: robertIdentity.id,
      source: 'cleanup',
      actorId: editor.id,
    });

    await sut.mergeSpacePeople(factory.auth({ user: editor }), space.id, robert.id, [bob.id], ALLOW_MERGE);

    const rows = await verdictRow(faceId);
    expect(rows).toHaveLength(1); // no unique-violation, source row dropped
    expect(rows[0]).toMatchObject({ spacePersonId: robert.id, identityId: robertIdentity.id, status: 'rejected' });
  });
});
