import { Kysely } from 'kysely';
import { SharedSpaceActivityType } from 'src/enum';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { IdentityMergePropagationService } from 'src/services/identity-merge-propagation.service';
import { newMediumService } from 'test/medium.factory';
import { factory } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';
import { Mocked } from 'vitest';

let defaultDatabase: Kysely<DB>;

const setup = (db: Kysely<DB> = defaultDatabase) => {
  const { ctx } = newMediumService(BaseService, {
    database: db,
    real: [DatabaseRepository, FaceIdentityRepository, PersonRepository, SharedSpaceRepository],
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

  return { ctx, sut };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

const createIdentity = (db: Kysely<DB>) => {
  return db.insertInto('face_identity').values({ type: 'person' }).returningAll().executeTakeFirstOrThrow();
};

const setPersonIdentity = async (
  db: Kysely<DB>,
  input: { personId: string; identityId: string | null; faceAssetId?: string | null },
) => {
  await db
    .updateTable('person')
    .set({ identityId: input.identityId, faceAssetId: input.faceAssetId })
    .where('id', '=', input.personId)
    .execute();
};

const createPersonProfile = async (
  ctx: ReturnType<typeof setup>['ctx'],
  input: { ownerId: string; identityId?: string | null; name?: string },
) => {
  const { person } = await ctx.newPerson({ ownerId: input.ownerId, name: input.name ?? 'Person' });
  if (input.identityId !== undefined) {
    await setPersonIdentity(ctx.database, { personId: person.id, identityId: input.identityId });
  }
  return person;
};

const createSpacePerson = async (
  db: Kysely<DB>,
  input: { spaceId: string; identityId?: string | null; name?: string; type?: string },
) => {
  return db
    .insertInto('shared_space_person')
    .values({
      spaceId: input.spaceId,
      identityId: input.identityId ?? null,
      name: input.name ?? 'Space Person',
      type: input.type ?? 'person',
    })
    .returningAll()
    .executeTakeFirstOrThrow();
};

const createIdentityLinkedFace = async (
  ctx: ReturnType<typeof setup>['ctx'],
  input: { ownerId: string; identityId: string; personId?: string | null },
) => {
  const { asset } = await ctx.newAsset({ ownerId: input.ownerId });
  const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: input.personId ?? null });
  await ctx.database
    .insertInto('face_identity_face')
    .values({ assetFaceId: assetFace.id, identityId: input.identityId, source: 'manual' })
    .execute();
  return assetFace;
};

const getPeople = (db: Kysely<DB>, ids: string[]) => {
  return db.selectFrom('person').select(['id', 'identityId']).where('id', 'in', ids).orderBy('id').execute();
};

describe('IdentityMergePropagationService medium tests', () => {
  it('rolls back all profile and identity changes when one profile merge fails', async () => {
    const { ctx, sut } = setup();
    const personRepository = ctx.get(PersonRepository);
    const { user } = await ctx.newUser();
    const target = await createPersonProfile(ctx, { ownerId: user.id, name: 'Target' });
    const sourceA = await createPersonProfile(ctx, { ownerId: user.id, name: 'Source A' });
    const sourceB = await createPersonProfile(ctx, { ownerId: user.id, name: 'Source B' });
    const originalMerge = personRepository.mergePersonProfile.bind(personRepository);
    vi.spyOn(personRepository, 'mergePersonProfile')
      .mockImplementationOnce((input, db) => originalMerge(input, db))
      .mockRejectedValueOnce(new Error('profile merge failed'));

    await expect(sut.mergePersonalPeople(factory.auth({ user }), target.id, [sourceA.id, sourceB.id])).rejects.toThrow(
      'profile merge failed',
    );

    await expect(getPeople(ctx.database, [target.id, sourceA.id, sourceB.id])).resolves.toEqual(
      expect.arrayContaining([
        { id: target.id, identityId: null },
        { id: sourceA.id, identityId: null },
        { id: sourceB.id, identityId: null },
      ]),
    );
  });

  it('does not violate owner identity uniqueness while collapsing personal duplicates', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const targetIdentity = await createIdentity(ctx.database);
    const sourceIdentity = await createIdentity(ctx.database);
    const target = await createPersonProfile(ctx, { ownerId: user.id, identityId: targetIdentity.id, name: 'Target' });
    const source = await createPersonProfile(ctx, { ownerId: user.id, identityId: sourceIdentity.id, name: 'Source' });

    await expect(sut.mergePersonalPeople(factory.auth({ user }), target.id, [source.id])).resolves.toEqual([
      { id: source.id, success: true },
    ]);

    const people = await getPeople(ctx.database, [target.id, source.id]);
    expect(people).toEqual([{ id: target.id, identityId: targetIdentity.id }]);
  });

  it('does not violate space identity uniqueness while collapsing shared-space duplicates', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id });
    const targetIdentity = await createIdentity(ctx.database);
    const sourceIdentity = await createIdentity(ctx.database);
    const target = await createSpacePerson(ctx.database, { spaceId: space.id, identityId: targetIdentity.id });
    const source = await createSpacePerson(ctx.database, { spaceId: space.id, identityId: sourceIdentity.id });

    await expect(
      sut.mergeSpacePeople(factory.auth({ user }), space.id, target.id, [source.id]),
    ).resolves.toBeUndefined();

    const people = await ctx.database
      .selectFrom('shared_space_person')
      .select(['id', 'identityId'])
      .where('id', 'in', [target.id, source.id])
      .execute();
    expect(people).toEqual([{ id: target.id, identityId: targetIdentity.id }]);
  });

  it('collapses identity faces for identities that have no profile in a scope', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const targetIdentity = await createIdentity(ctx.database);
    const sourceIdentity = await createIdentity(ctx.database);
    const target = await createPersonProfile(ctx, { ownerId: user.id, identityId: targetIdentity.id, name: 'Target' });
    const source = await createPersonProfile(ctx, { ownerId: user.id, identityId: sourceIdentity.id, name: 'Source' });
    const orphanedSourceFace = await createIdentityLinkedFace(ctx, { ownerId: user.id, identityId: sourceIdentity.id });

    await sut.mergePersonalPeople(factory.auth({ user }), target.id, [source.id]);

    const faceLink = await ctx.database
      .selectFrom('face_identity_face')
      .select(['assetFaceId', 'identityId', 'source'])
      .where('assetFaceId', '=', orphanedSourceFace.id)
      .executeTakeFirstOrThrow();
    expect(faceLink).toEqual({ assetFaceId: orphanedSourceFace.id, identityId: targetIdentity.id, source: 'manual' });
  });

  it('handles concurrent overlapping merges with one success and one clean retry or failure', async () => {
    const db = await getKyselyDB();
    try {
      const { ctx, sut } = setup(db);
      const personRepository = ctx.get(PersonRepository);
      const { user } = await ctx.newUser();
      const targetIdentity = await createIdentity(ctx.database);
      const sourceIdentity = await createIdentity(ctx.database);
      const target = await createPersonProfile(ctx, {
        ownerId: user.id,
        identityId: targetIdentity.id,
        name: 'Target',
      });
      const source = await createPersonProfile(ctx, {
        ownerId: user.id,
        identityId: sourceIdentity.id,
        name: 'Source',
      });
      const originalMerge = personRepository.mergePersonProfile.bind(personRepository);
      let mergeAttempts = 0;
      let releaseBothAttempts!: () => void;
      const bothAttemptsReached = new Promise<void>((resolve) => {
        releaseBothAttempts = resolve;
      });
      vi.spyOn(personRepository, 'mergePersonProfile').mockImplementation(async (input, transaction) => {
        const attempt = ++mergeAttempts;
        if (attempt === 2) {
          releaseBothAttempts();
        }

        await bothAttemptsReached;
        return originalMerge(input, transaction);
      });

      const results = await Promise.allSettled([
        sut.mergePersonalPeople(factory.auth({ user }), target.id, [source.id]),
        sut.mergePersonalPeople(factory.auth({ user }), target.id, [source.id]),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(fulfilled[0]).toEqual({ status: 'fulfilled', value: [{ id: source.id, success: true }] });
      expect(rejected[0]).toMatchObject({
        status: 'rejected',
        reason: expect.any(Error),
      });
      expect(mergeAttempts).toBe(2);
      await expect(getPeople(ctx.database, [target.id, source.id])).resolves.toEqual([
        { id: target.id, identityId: targetIdentity.id },
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('rolls back when activity write fails inside the transaction', async () => {
    const { ctx, sut } = setup();
    const sharedSpaceRepository = ctx.get(SharedSpaceRepository);
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id });
    const targetIdentity = await createIdentity(ctx.database);
    const sourceIdentity = await createIdentity(ctx.database);
    const target = await createPersonProfile(ctx, { ownerId: user.id, identityId: targetIdentity.id, name: 'Target' });
    const source = await createPersonProfile(ctx, { ownerId: user.id, identityId: sourceIdentity.id, name: 'Source' });
    const spaceTarget = await createSpacePerson(ctx.database, { spaceId: space.id, identityId: targetIdentity.id });
    const spaceSource = await createSpacePerson(ctx.database, { spaceId: space.id, identityId: sourceIdentity.id });
    vi.spyOn(sharedSpaceRepository, 'logActivity').mockRejectedValueOnce(new Error('activity failed'));

    await expect(sut.mergePersonalPeople(factory.auth({ user }), target.id, [source.id])).rejects.toThrow(
      'activity failed',
    );

    await expect(getPeople(ctx.database, [target.id, source.id])).resolves.toEqual(
      expect.arrayContaining([
        { id: target.id, identityId: targetIdentity.id },
        { id: source.id, identityId: sourceIdentity.id },
      ]),
    );
    await expect(
      ctx.database
        .selectFrom('shared_space_person')
        .select(['id', 'identityId'])
        .where('id', 'in', [spaceTarget.id, spaceSource.id])
        .orderBy('id')
        .execute(),
    ).resolves.toEqual(
      expect.arrayContaining([
        { id: spaceTarget.id, identityId: targetIdentity.id },
        { id: spaceSource.id, identityId: sourceIdentity.id },
      ]),
    );
    await expect(
      ctx.database
        .selectFrom('shared_space_activity')
        .select('id')
        .where('spaceId', '=', space.id)
        .where('type', '=', SharedSpaceActivityType.PersonMerge)
        .execute(),
    ).resolves.toEqual([]);
  });
});
