import { Kysely } from 'kysely';
import { JobStatus, SharedSpaceRole } from 'src/enum';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { ConfigRepository } from 'src/repositories/config.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { SystemMetadataRepository } from 'src/repositories/system-metadata.repository';
import { DB } from 'src/schema';
import { SharedSpaceService } from 'src/services/shared-space.service';
import { asBirthDateString } from 'src/utils/date';
import { newMediumService } from 'test/medium.factory';
import { factory, newEmbedding } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';
import { Mocked } from 'vitest';

let defaultDatabase: Kysely<DB>;

const setup = (db?: Kysely<DB>) => {
  const { ctx, sut } = newMediumService(SharedSpaceService, {
    database: db || defaultDatabase,
    real: [SharedSpaceRepository, FaceIdentityRepository, ConfigRepository, SystemMetadataRepository],
    mock: [LoggingRepository, JobRepository],
  });
  const jobs = ctx.getMock<JobRepository, Mocked<JobRepository>>(JobRepository);
  jobs.queue.mockResolvedValue(undefined);
  jobs.queueAll.mockResolvedValue(undefined);
  return { ctx, sut, faceIdentityRepository: ctx.get(FaceIdentityRepository) };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

const createRecognizedFace = async (
  ctx: ReturnType<typeof setup>['ctx'],
  faceIdentityRepository: FaceIdentityRepository,
  input: { ownerId: string; personName: string; spaceId?: string; birthDate?: string; sharePersonMetadata?: boolean },
) => {
  const { result: person } = await ctx.newPerson({
    ownerId: input.ownerId,
    name: input.personName,
    birthDate: input.birthDate ? new Date(input.birthDate) : null,
  });
  const { asset } = await ctx.newAsset({ ownerId: input.ownerId });
  if (input.spaceId) {
    await ctx.newSharedSpaceAsset({ spaceId: input.spaceId, assetId: asset.id, addedById: input.ownerId });
  }

  const { result: faceId } = await ctx.newAssetFace({ assetId: asset.id, personId: person.id });
  await ctx.database.insertInto('face_search').values({ faceId, embedding: newEmbedding() }).execute();

  const identity = await faceIdentityRepository.ensurePersonIdentity(person.id);
  await faceIdentityRepository.linkFace({ assetFaceId: faceId, identityId: identity.id, source: 'owner-person' });

  if (input.sharePersonMetadata === false && input.spaceId) {
    await ctx.database
      .updateTable('shared_space_member')
      .set({ sharePersonMetadata: false })
      .where('spaceId', '=', input.spaceId)
      .where('userId', '=', input.ownerId)
      .execute();
  }

  return { asset, faceId, identity, person };
};

describe('SharedSpaceService shared-space person metadata RBAC', () => {
  it('matches by source identity and reuses one space person for multiple assets', async () => {
    const { ctx, sut, faceIdentityRepository } = setup();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: user.id, role: SharedSpaceRole.Owner });

    const first = await createRecognizedFace(ctx, faceIdentityRepository, {
      ownerId: user.id,
      spaceId: space.id,
      personName: 'Alice Source',
      birthDate: '1990-01-01',
    });
    const { asset: secondAsset } = await ctx.newAsset({ ownerId: user.id });
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: secondAsset.id, addedById: user.id });
    const { result: secondFaceId } = await ctx.newAssetFace({ assetId: secondAsset.id, personId: first.person.id });
    await ctx.database.insertInto('face_search').values({ faceId: secondFaceId, embedding: newEmbedding() }).execute();
    await faceIdentityRepository.replaceFaceIdentity({
      assetFaceId: secondFaceId,
      identityId: first.identity.id,
      source: 'manual',
    });

    await expect(sut.handleSharedSpaceFaceMatch({ spaceId: space.id, assetId: first.asset.id })).resolves.toBe(
      JobStatus.Success,
    );
    await expect(sut.handleSharedSpaceFaceMatch({ spaceId: space.id, assetId: secondAsset.id })).resolves.toBe(
      JobStatus.Success,
    );

    const people = await ctx.database
      .selectFrom('shared_space_person')
      .selectAll()
      .where('spaceId', '=', space.id)
      .execute();
    expect(people).toHaveLength(1);
    expect(people[0]).toEqual(
      expect.objectContaining({
        identityId: first.identity.id,
        name: 'Alice Source',
        nameSource: 'inherited',
        birthDateSource: 'inherited',
      }),
    );
    expect(asBirthDateString(people[0].birthDate)).toBe('1990-01-01');
    expect(people[0].faceCount).toBe(2);
  });

  it('does not create a space person for an asset outside the target space', async () => {
    const { ctx, sut, faceIdentityRepository } = setup();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: user.id, role: SharedSpaceRole.Owner });

    const face = await createRecognizedFace(ctx, faceIdentityRepository, {
      ownerId: user.id,
      personName: 'Private Alice',
    });

    await expect(sut.handleSharedSpaceFaceMatch({ spaceId: space.id, assetId: face.asset.id })).resolves.toBe(
      JobStatus.Success,
    );

    const people = await ctx.database
      .selectFrom('shared_space_person')
      .selectAll()
      .where('spaceId', '=', space.id)
      .execute();
    expect(people).toHaveLength(0);
  });

  it('does not inherit names or birth dates from a member who disabled contribution', async () => {
    const { ctx, sut, faceIdentityRepository } = setup();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: user.id, role: SharedSpaceRole.Owner });

    const face = await createRecognizedFace(ctx, faceIdentityRepository, {
      ownerId: user.id,
      spaceId: space.id,
      personName: 'Opted Out',
      birthDate: '1984-05-09',
      sharePersonMetadata: false,
    });

    await sut.handleSharedSpaceFaceMatch({ spaceId: space.id, assetId: face.asset.id });

    const person = await ctx.database
      .selectFrom('shared_space_person')
      .selectAll()
      .where('spaceId', '=', space.id)
      .executeTakeFirstOrThrow();
    expect(person.name).toBe('');
    expect(person.birthDate).toBeNull();
    expect(person.nameSource).toBe('none');
    expect(person.birthDateSource).toBe('none');
  });

  it('does not expose opted-out private person metadata through shared-space person APIs', async () => {
    const { ctx, sut, faceIdentityRepository } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: source } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { user: nonMember } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: source.id, role: SharedSpaceRole.Viewer });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: SharedSpaceRole.Viewer });

    const face = await createRecognizedFace(ctx, faceIdentityRepository, {
      ownerId: source.id,
      spaceId: space.id,
      personName: 'Private Source Name',
      birthDate: '1975-03-04',
      sharePersonMetadata: false,
    });
    await sut.handleSharedSpaceFaceMatch({ spaceId: space.id, assetId: face.asset.id });

    const spacePerson = await ctx.database
      .selectFrom('shared_space_person')
      .selectAll()
      .where('spaceId', '=', space.id)
      .executeTakeFirstOrThrow();
    const viewerAuth = factory.auth({ user: { id: viewer.id, name: viewer.name, email: viewer.email } });
    const visible = await sut.getSpacePerson(viewerAuth, space.id, spacePerson.id);
    expect(visible.name).toBe('');
    expect(visible.birthDate).toBeNull();
    expect(visible.thumbnailPath).toBe('');

    const nonMemberAuth = factory.auth({ user: { id: nonMember.id, name: nonMember.name, email: nonMember.email } });
    await expect(sut.getSpacePerson(nonMemberAuth, space.id, spacePerson.id)).rejects.toThrow('Not a member');
    await expect(sut.getSpacePersonThumbnail(nonMemberAuth, space.id, spacePerson.id)).rejects.toThrow('Not a member');
  });

  it('backfills existing space-person metadata in chunks while keeping manual locks', async () => {
    const { ctx, sut, faceIdentityRepository } = setup();
    const { user: owner } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    const face = await createRecognizedFace(ctx, faceIdentityRepository, {
      ownerId: owner.id,
      spaceId: space.id,
      personName: 'Backfill Source',
      birthDate: '1999-09-09',
    });

    const spacePerson = await ctx.database
      .insertInto('shared_space_person')
      .values({
        spaceId: space.id,
        identityId: face.identity.id,
        name: 'Manual Space Name',
        nameSource: 'manual',
        birthDate: null,
        birthDateSource: 'none',
        type: 'person',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const result = await sut.backfillSpacePersonMetadata({ limit: 1000 });
    expect(result.processed).toBeGreaterThan(0);
    expect(result.inherited).toBeGreaterThan(0);

    const updated = await ctx.database
      .selectFrom('shared_space_person')
      .selectAll()
      .where('id', '=', spacePerson.id)
      .executeTakeFirstOrThrow();
    expect(updated.name).toBe('Manual Space Name');
    expect(updated.nameSource).toBe('manual');
    expect(asBirthDateString(updated.birthDate)).toBe('1999-09-09');
    expect(updated.birthDateSource).toBe('inherited');
  });

  it('backfill respects owner-disabled metadata contribution for existing space people', async () => {
    const { ctx, sut, faceIdentityRepository } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: source } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: source.id, role: SharedSpaceRole.Viewer });
    const face = await createRecognizedFace(ctx, faceIdentityRepository, {
      ownerId: source.id,
      spaceId: space.id,
      personName: 'Disabled Source',
      birthDate: '2000-01-02',
    });

    const ownerAuth = factory.auth({ user: { id: owner.id, name: owner.name, email: owner.email } });
    await sut.updateMemberMetadataContribution(ownerAuth, space.id, source.id, { sharePersonMetadata: false });
    const spacePerson = await ctx.database
      .insertInto('shared_space_person')
      .values({ spaceId: space.id, identityId: face.identity.id, name: '', type: 'person' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const result = await sut.backfillSpacePersonMetadata({ limit: 1000 });
    expect(result.processed).toBeGreaterThan(0);
    const unchanged = await ctx.database
      .selectFrom('shared_space_person')
      .selectAll()
      .where('id', '=', spacePerson.id)
      .executeTakeFirstOrThrow();
    expect(unchanged.name).toBe('');
    expect(unchanged.birthDate).toBeNull();
  });

  it('lets owners disable but not enable another member metadata contribution', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Viewer });

    const auth = factory.auth({ user: { id: owner.id, name: owner.name, email: owner.email } });
    const disabled = await sut.updateMemberMetadataContribution(auth, space.id, member.id, {
      sharePersonMetadata: false,
    });
    expect(disabled.sharePersonMetadata).toBe(false);

    await expect(
      sut.updateMemberMetadataContribution(auth, space.id, member.id, { sharePersonMetadata: true } as never),
    ).rejects.toThrow('Cannot enable person metadata contribution');
  });
});
