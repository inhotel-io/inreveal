import { Kysely } from 'kysely';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

const setup = (db?: Kysely<DB>) => {
  const { ctx } = newMediumService(BaseService, {
    database: db || defaultDatabase,
    real: [FaceIdentityRepository],
    mock: [LoggingRepository],
  });
  return { ctx, sut: ctx.get(FaceIdentityRepository) };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe(FaceIdentityRepository.name, () => {
  const newSpacePerson = async (ctx: ReturnType<typeof setup>['ctx'], spaceId: string) => {
    return ctx.database.insertInto('shared_space_person').values({ spaceId }).returningAll().executeTakeFirstOrThrow();
  };

  const linkSpaceFace = async (ctx: ReturnType<typeof setup>['ctx'], personId: string, assetFaceId: string) => {
    await ctx.database.insertInto('shared_space_person_face').values({ personId, assetFaceId }).execute();
  };

  it('enforces one identity per personal profile and one active identity per face', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Alice' });
    const { asset } = await ctx.newAsset({ ownerId: user.id });
    const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: person.id });

    const identity = await sut.ensurePersonIdentity(person.id);
    const linked = await sut.linkFace({ assetFaceId: assetFace.id, identityId: identity.id, source: 'owner-person' });
    const linkedAgain = await sut.linkFace({
      assetFaceId: assetFace.id,
      identityId: identity.id,
      source: 'owner-person',
    });
    const secondIdentity = await sut.ensurePersonIdentity(person.id);

    const updatedPerson = await ctx.database
      .selectFrom('person')
      .select(['identityId'])
      .where('id', '=', person.id)
      .executeTakeFirstOrThrow();

    expect(secondIdentity.id).toBe(identity.id);
    expect(updatedPerson.identityId).toBe(identity.id);
    expect(linked).toEqual(expect.objectContaining({ assetFaceId: assetFace.id, identityId: identity.id }));
    expect(linkedAgain).toEqual(expect.objectContaining({ assetFaceId: assetFace.id, identityId: identity.id }));
  });

  it('backfills personal identities idempotently and pages by cursor', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { person: firstPerson } = await ctx.newPerson({ ownerId: user.id });
    const { person: secondPerson } = await ctx.newPerson({ ownerId: user.id });
    const { asset } = await ctx.newAsset({ ownerId: user.id });
    const { assetFace: firstFace } = await ctx.newAssetFace({ assetId: asset.id, personId: firstPerson.id });
    const { assetFace: secondFace } = await ctx.newAssetFace({ assetId: asset.id, personId: firstPerson.id });

    const firstPage = await sut.backfillPersonalIdentities({ limit: 1 });
    const secondPage = await sut.backfillPersonalIdentities({ cursor: firstPage.nextCursor, limit: 1 });
    await sut.backfillPersonalIdentities({ limit: 100 });
    const firstIdentity = await ctx.database
      .selectFrom('person')
      .select('identityId')
      .where('id', '=', firstPerson.id)
      .executeTakeFirstOrThrow();
    await sut.backfillPersonalIdentities({ limit: 100 });

    const people = await ctx.database
      .selectFrom('person')
      .select(['id', 'identityId'])
      .where('id', 'in', [firstPerson.id, secondPerson.id])
      .orderBy('id')
      .execute();
    const links = await ctx.database
      .selectFrom('face_identity_face')
      .select(['assetFaceId', 'identityId'])
      .where('assetFaceId', 'in', [firstFace.id, secondFace.id])
      .orderBy('assetFaceId')
      .execute();

    expect(firstPage).toEqual({ processed: 1, nextCursor: expect.any(String) });
    expect(secondPage.processed).toBe(1);
    expect(people.every((person) => person.identityId)).toBe(true);
    expect(people.find((person) => person.id === firstPerson.id)?.identityId).toBe(firstIdentity.identityId);
    expect(links).toHaveLength(2);
    expect(new Set(links.map((link) => link.identityId))).toEqual(new Set([firstIdentity.identityId]));
  });

  it('does not backfill hidden or deleted faces as identity-linked faces', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { person } = await ctx.newPerson({ ownerId: user.id });
    const { asset } = await ctx.newAsset({ ownerId: user.id });
    const { assetFace: visibleFace } = await ctx.newAssetFace({ assetId: asset.id, personId: person.id });
    const { assetFace: hiddenFace } = await ctx.newAssetFace({
      assetId: asset.id,
      personId: person.id,
      isVisible: false,
    });
    const { assetFace: deletedFace } = await ctx.newAssetFace({
      assetId: asset.id,
      personId: person.id,
      deletedAt: new Date(),
    });

    await sut.backfillPersonalIdentities({ limit: 100 });

    const links = await ctx.database
      .selectFrom('face_identity_face')
      .select(['assetFaceId'])
      .where('assetFaceId', 'in', [visibleFace.id, hiddenFace.id, deletedFace.id])
      .execute();

    expect(links.map((link) => link.assetFaceId)).toEqual([visibleFace.id]);
  });

  it('infers shared-space person identity from linked personal faces and reports conflicts', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id });
    const { person: alice } = await ctx.newPerson({ ownerId: user.id, name: 'Alice' });
    const { person: bob } = await ctx.newPerson({ ownerId: user.id, name: 'Bob' });
    const { asset } = await ctx.newAsset({ ownerId: user.id });
    const { assetFace: aliceFace } = await ctx.newAssetFace({ assetId: asset.id, personId: alice.id });
    const { assetFace: bobFace } = await ctx.newAssetFace({ assetId: asset.id, personId: bob.id });
    const aliceIdentity = await sut.ensurePersonIdentity(alice.id);
    const bobIdentity = await sut.ensurePersonIdentity(bob.id);
    await sut.linkFace({ assetFaceId: aliceFace.id, identityId: aliceIdentity.id, source: 'backfill' });
    await sut.linkFace({ assetFaceId: bobFace.id, identityId: bobIdentity.id, source: 'backfill' });
    const singleIdentityPerson = await newSpacePerson(ctx, space.id);
    const conflictingPerson = await newSpacePerson(ctx, space.id);
    await linkSpaceFace(ctx, singleIdentityPerson.id, aliceFace.id);
    await linkSpaceFace(ctx, conflictingPerson.id, aliceFace.id);
    await linkSpaceFace(ctx, conflictingPerson.id, bobFace.id);

    const result = await sut.backfillSpacePersonIdentities({ limit: 100 });

    const spacePeople = await ctx.database
      .selectFrom('shared_space_person')
      .select(['id', 'identityId'])
      .where('id', 'in', [singleIdentityPerson.id, conflictingPerson.id])
      .execute();

    expect(result).toEqual({ processed: 2, conflictCount: 1 });
    expect(spacePeople.find((person) => person.id === singleIdentityPerson.id)?.identityId).toBe(aliceIdentity.id);
    expect(spacePeople.find((person) => person.id === conflictingPerson.id)?.identityId).toBeNull();
  });

  it('reports duplicate space-person rows for the same identity instead of violating uniqueness', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id });
    const { person } = await ctx.newPerson({ ownerId: user.id });
    const { asset } = await ctx.newAsset({ ownerId: user.id });
    const { assetFace: firstFace } = await ctx.newAssetFace({ assetId: asset.id, personId: person.id });
    const { assetFace: secondFace } = await ctx.newAssetFace({ assetId: asset.id, personId: person.id });
    const identity = await sut.ensurePersonIdentity(person.id);
    await sut.linkFace({ assetFaceId: firstFace.id, identityId: identity.id, source: 'backfill' });
    await sut.linkFace({ assetFaceId: secondFace.id, identityId: identity.id, source: 'backfill' });
    const firstSpacePerson = await newSpacePerson(ctx, space.id);
    const duplicateSpacePerson = await newSpacePerson(ctx, space.id);
    await linkSpaceFace(ctx, firstSpacePerson.id, firstFace.id);
    await linkSpaceFace(ctx, duplicateSpacePerson.id, secondFace.id);

    const result = await sut.backfillSpacePersonIdentities({ limit: 100 });

    const spacePeople = await ctx.database
      .selectFrom('shared_space_person')
      .select(['id', 'identityId'])
      .where('id', 'in', [firstSpacePerson.id, duplicateSpacePerson.id])
      .execute();

    expect(result.conflictCount).toBeGreaterThanOrEqual(1);
    expect(spacePeople.filter((person) => person.identityId === identity.id)).toHaveLength(1);
    expect(spacePeople.filter((person) => person.identityId === null)).toHaveLength(1);
  });

  it('replaces, unlinks, and merges identity face links without violating scoped profile uniqueness', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id });
    const { person: targetPerson } = await ctx.newPerson({ ownerId: user.id });
    const { person: sourcePerson } = await ctx.newPerson({ ownerId: user.id });
    const { asset } = await ctx.newAsset({ ownerId: user.id });
    const { assetFace: targetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: targetPerson.id });
    const { assetFace: sourceFace } = await ctx.newAssetFace({ assetId: asset.id, personId: sourcePerson.id });
    const targetIdentity = await sut.ensurePersonIdentity(targetPerson.id);
    const sourceIdentity = await sut.ensurePersonIdentity(sourcePerson.id);
    const sourceSpacePerson = await newSpacePerson(ctx, space.id);
    await ctx.database
      .updateTable('shared_space_person')
      .set({ identityId: sourceIdentity.id })
      .where('id', '=', sourceSpacePerson.id)
      .execute();

    await sut.linkFace({ assetFaceId: targetFace.id, identityId: targetIdentity.id, source: 'backfill' });
    await sut.replaceFaceIdentity({ assetFaceId: sourceFace.id, identityId: sourceIdentity.id, source: 'manual' });
    await sut.unlinkFaces([targetFace.id]);
    const result = await sut.mergeIdentities({
      targetIdentityId: targetIdentity.id,
      sourceIdentityIds: [sourceIdentity.id, sourceIdentity.id],
      source: 'manual',
    });

    const links = await ctx.database
      .selectFrom('face_identity_face')
      .select(['assetFaceId', 'identityId'])
      .where('assetFaceId', 'in', [targetFace.id, sourceFace.id])
      .execute();
    const sourceProfile = await ctx.database
      .selectFrom('person')
      .select('identityId')
      .where('id', '=', sourcePerson.id)
      .executeTakeFirstOrThrow();
    const sourceSpaceProfile = await ctx.database
      .selectFrom('shared_space_person')
      .select('identityId')
      .where('id', '=', sourceSpacePerson.id)
      .executeTakeFirstOrThrow();

    expect(result).toEqual({ personalProfileConflictCount: 1, spaceProfileConflictCount: 0 });
    expect(links).toEqual([{ assetFaceId: sourceFace.id, identityId: targetIdentity.id }]);
    expect(sourceProfile.identityId).toBe(sourceIdentity.id);
    expect(sourceSpaceProfile.identityId).toBe(targetIdentity.id);
  });
});
