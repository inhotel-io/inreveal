import { Kysely } from 'kysely';
import { AssetVisibility, SharedSpaceRole } from 'src/enum';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { DB } from 'src/schema';
import { PersonService } from 'src/services/person.service';
import { newMediumService } from 'test/medium.factory';
import { factory } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

const setup = (db?: Kysely<DB>) => {
  const { ctx, sut } = newMediumService(PersonService, {
    database: db || defaultDatabase,
    real: [FaceIdentityRepository],
    mock: [LoggingRepository],
  });
  return { ctx, sut, faceIdentityRepository: ctx.get(FaceIdentityRepository) };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

const setupPeopleIdentityMatrix = async () => {
  const { ctx, sut, faceIdentityRepository } = setup();
  const { user: source } = await ctx.newUser();
  const { user: space1OnlyMember } = await ctx.newUser();
  const { user: userInBothSpaces } = await ctx.newUser();
  const { user: nonMember } = await ctx.newUser();
  const { user: adminNonMember } = await ctx.newUser({ isAdmin: true });

  const { space: space1 } = await ctx.newSharedSpace({ createdById: space1OnlyMember.id, name: 'Space One' });
  const { space: space2 } = await ctx.newSharedSpace({ createdById: userInBothSpaces.id, name: 'Space Two' });
  const { space: hiddenTimelineSpace } = await ctx.newSharedSpace({
    createdById: source.id,
    name: 'Hidden Timeline Space',
  });

  await ctx.newSharedSpaceMember({ spaceId: space1.id, userId: source.id, role: SharedSpaceRole.Viewer });
  await ctx.newSharedSpaceMember({ spaceId: space1.id, userId: space1OnlyMember.id, role: SharedSpaceRole.Owner });
  await ctx.newSharedSpaceMember({ spaceId: space1.id, userId: userInBothSpaces.id, role: SharedSpaceRole.Viewer });
  await ctx.newSharedSpaceMember({ spaceId: space2.id, userId: userInBothSpaces.id, role: SharedSpaceRole.Owner });
  await ctx.newSharedSpaceMember({ spaceId: hiddenTimelineSpace.id, userId: userInBothSpaces.id, role: SharedSpaceRole.Viewer });
  await ctx.database
    .updateTable('shared_space_member')
    .set({ showInTimeline: false })
    .where('spaceId', '=', hiddenTimelineSpace.id)
    .where('userId', '=', userInBothSpaces.id)
    .execute();

  const { result: alicePerson } = await ctx.newPerson({
    ownerId: source.id,
    name: 'Alice Source',
    birthDate: new Date('1990-01-01'),
    thumbnailPath: '/private/alice-thumbnail.jpg',
  });
  const aliceIdentity = await faceIdentityRepository.ensurePersonIdentity(alicePerson.id);

  const makeSharedFace = async (input: { spaceId: string; personName: string; ownerId?: string }) => {
    const { asset } = await ctx.newAsset({
      ownerId: input.ownerId ?? source.id,
      visibility: AssetVisibility.Timeline,
    });
    await ctx.newSharedSpaceAsset({ spaceId: input.spaceId, assetId: asset.id, addedById: input.ownerId ?? source.id });
    const { result: faceId } = await ctx.newAssetFace({ assetId: asset.id, personId: alicePerson.id });
    await faceIdentityRepository.linkFace({ assetFaceId: faceId, identityId: aliceIdentity.id, source: 'owner-person' });
    const spacePerson = await ctx.database
      .insertInto('shared_space_person')
      .values({
        spaceId: input.spaceId,
        identityId: aliceIdentity.id,
        name: input.personName,
        birthDate: '1990-01-01',
        representativeFaceId: faceId,
        type: 'person',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await ctx.database
      .insertInto('shared_space_person_face')
      .values({ personId: spacePerson.id, assetFaceId: faceId })
      .execute();
    return { asset, faceId, spacePerson };
  };

  const space1Alice = await makeSharedFace({ spaceId: space1.id, personName: 'Alice Source' });
  const space2Alice = await makeSharedFace({ spaceId: space2.id, personName: 'Space 2 Private Name' });
  const hiddenTimelineAlice = await makeSharedFace({
    spaceId: hiddenTimelineSpace.id,
    personName: 'Hidden Timeline Name',
  });

  return {
    sut,
    aliceIdentityId: aliceIdentity.id,
    source,
    space1,
    space2,
    hiddenTimelineSpace,
    space1Alice,
    space2Alice,
    hiddenTimelineAlice,
    space1OnlyMember,
    userInBothSpaces,
    nonMember,
    adminNonMember,
  };
};

describe('People identity RBAC projection', () => {
  it('returns one row per accessible identity for a member of multiple spaces', async () => {
    const fx = await setupPeopleIdentityMatrix();

    const result = await fx.sut.getAll(factory.auth({ user: fx.userInBothSpaces }), {
      withHidden: true,
      withSharedSpaces: true,
      page: 1,
      size: 50,
    } as any);

    expect(result.people.filter((person) => person.name === 'Alice Source')).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('does not let a Space 1 only member infer Space 2 metadata, counts, thumbnails, or ids', async () => {
    const fx = await setupPeopleIdentityMatrix();

    const result = await fx.sut.getAll(factory.auth({ user: fx.space1OnlyMember }), {
      withHidden: true,
      withSharedSpaces: true,
      page: 1,
      size: 50,
    } as any);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('Space 2 Private Name');
    expect(serialized).not.toContain(fx.space2.id);
    expect(serialized).not.toContain(fx.space2Alice.asset.id);
    expect(serialized).not.toContain('/private/alice-thumbnail.jpg');
    expect(result.people.find((person) => person.name === 'Alice Source')?.numberOfAssets).toBe(1);
  });

  it('does not expose raw face identity ids in people responses', async () => {
    const fx = await setupPeopleIdentityMatrix();

    const result = await fx.sut.getAll(factory.auth({ user: fx.userInBothSpaces }), {
      withHidden: true,
      withSharedSpaces: true,
      page: 1,
      size: 50,
    } as any);

    expect(JSON.stringify(result)).not.toContain(fx.aliceIdentityId);
    expect(JSON.stringify(result)).not.toContain('identityId');
  });

  it('does not use admin status to bypass shared-space timeline membership', async () => {
    const fx = await setupPeopleIdentityMatrix();

    const result = await fx.sut.getAll(factory.auth({ user: fx.adminNonMember }), {
      withHidden: true,
      withSharedSpaces: true,
      page: 1,
      size: 50,
    } as any);

    expect(result.people).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain(fx.space1Alice.spacePerson.id);
  });

  it('excludes shared spaces hidden from the viewer timeline', async () => {
    const fx = await setupPeopleIdentityMatrix();

    const result = await fx.sut.getAll(factory.auth({ user: fx.userInBothSpaces }), {
      withHidden: true,
      withSharedSpaces: true,
      page: 1,
      size: 50,
    } as any);

    expect(JSON.stringify(result)).not.toContain('Hidden Timeline Name');
    expect(JSON.stringify(result)).not.toContain(fx.hiddenTimelineSpace.id);
    expect(JSON.stringify(result)).not.toContain(fx.hiddenTimelineAlice.asset.id);
  });

  it('returns no shared people for non-members', async () => {
    const fx = await setupPeopleIdentityMatrix();

    const result = await fx.sut.getAll(factory.auth({ user: fx.nonMember }), {
      withHidden: true,
      withSharedSpaces: true,
      page: 1,
      size: 50,
    } as any);

    expect(result).toEqual({ people: [], total: 0, hidden: 0, hasNextPage: false });
  });
});
