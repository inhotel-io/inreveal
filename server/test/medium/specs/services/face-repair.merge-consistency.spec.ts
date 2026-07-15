import { Kysely } from 'kysely';
import { SourceType } from 'src/enum';
import { FaceRepairDeclineRepository } from 'src/repositories/face-repair-decline.repository';
import { FaceRepairLockRepository } from 'src/repositories/face-repair-lock.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

// Slice 1 of the Face Cleanup temporal-consistency hardening: a confirm/lock (`face_repair_lock`) or a
// soft-decline (`face_repair_decline`) must survive a person merge or hard delete. Before this slice, both
// tables FK `personId`/`suspectedOwnerId` to `person` with `ON DELETE CASCADE`, so `PersonRepository.delete`
// and `mergePersonProfile`'s source-person `DELETE` silently wipe the durable resolution rows — a locked or
// declined face resurfaces on the very next scan (the bug this slice fixes).
let db: Kysely<DB>;

const setup = () => {
  const { ctx } = newMediumService(BaseService, {
    database: db,
    real: [PersonRepository, FaceRepairLockRepository, FaceRepairDeclineRepository],
    mock: [LoggingRepository],
  });
  return {
    ctx,
    personRepository: ctx.get(PersonRepository),
    faceRepairLockRepository: ctx.get(FaceRepairLockRepository),
    faceRepairDeclineRepository: ctx.get(FaceRepairDeclineRepository),
  };
};

type Ctx = ReturnType<typeof setup>['ctx'];

beforeAll(async () => {
  db = await getKyselyDB();
});

// mergePersonProfile unconditionally sets the target's identityId, which FKs to face_identity — seed a real
// row rather than a random uuid so the merge doesn't fail on a foreign-key violation unrelated to this slice.
const createIdentity = () =>
  db.insertInto('face_identity').values({ type: 'person' }).returningAll().executeTakeFirstOrThrow();

const seedFace = async (ctx: Ctx, ownerId: string, personId: string): Promise<string> => {
  const { asset } = await ctx.newAsset({ ownerId });
  const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId, sourceType: SourceType.MachineLearning });
  return assetFace.id;
};

const lockRowFor = (assetFaceId: string) =>
  db
    .selectFrom('face_repair_lock')
    .select(['id', 'personId'])
    .where('assetFaceId', '=', assetFaceId)
    .executeTakeFirst();

const declineRowsFor = (assetFaceId: string) =>
  db
    .selectFrom('face_repair_decline')
    .select(['id', 'assetFaceId', 'suspectedOwnerId'])
    .where('type', '=', 'face')
    .where('assetFaceId', '=', assetFaceId)
    .execute();

describe('face_repair_lock survives person delete/merge (M1, M2, E1, E2)', () => {
  it('M1: SETs personId NULL (not CASCADE-deleted) when the reviewed person is hard-deleted, and the face stays locked', async () => {
    const { ctx, personRepository, faceRepairLockRepository } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, owner.id);
    await faceRepairLockRepository.insertLocks([f1], owner.id, user.id);

    await personRepository.delete([owner.id]);

    const row = await lockRowFor(f1);
    expect(row).toBeDefined();
    expect(row?.personId).toBeNull();

    const locked = await faceRepairLockRepository.getLockedFaceIds();
    expect(locked.has(f1)).toBe(true);
  });

  it('M2: re-points personId to the merge target when the reviewed person is merged away, and the face stays locked', async () => {
    const { ctx, personRepository, faceRepairLockRepository } = setup();
    const { user } = await ctx.newUser();
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: target } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);
    await faceRepairLockRepository.insertLocks([f1], source.id, user.id);

    const identity = await createIdentity();
    await personRepository.mergePersonProfile({
      sourcePersonId: source.id,
      targetPersonId: target.id,
      targetIdentityId: identity.id,
    });

    const row = await lockRowFor(f1);
    expect(row).toBeDefined();
    expect(row?.personId).toBe(target.id);

    const locked = await faceRepairLockRepository.getLockedFaceIds();
    expect(locked.has(f1)).toBe(true);
  });
});

describe('face_repair_decline survives suspected-owner merge (M3, M4, E3, E4)', () => {
  it('M3: re-points suspectedOwnerId to the merge target when the suspected owner is merged away', async () => {
    const { ctx, personRepository, faceRepairDeclineRepository } = setup();
    const { user } = await ctx.newUser();
    const { person: faceOwner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: suspectedOwner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: mergeTarget } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, faceOwner.id);

    await faceRepairDeclineRepository.createDeclines({
      faces: [{ assetFaceId: f1, suspectedOwnerId: suspectedOwner.id }],
      declinedBy: user.id,
    });

    const identity = await createIdentity();
    await personRepository.mergePersonProfile({
      sourcePersonId: suspectedOwner.id,
      targetPersonId: mergeTarget.id,
      targetIdentityId: identity.id,
    });

    const rows = await declineRowsFor(f1);
    expect(rows).toHaveLength(1);
    expect(rows[0].suspectedOwnerId).toBe(mergeTarget.id);

    const maps = await faceRepairDeclineRepository.getDeclineMaps({ assetFaceIds: [f1] });
    expect(maps.declinedFaceOwners.get(f1)).toEqual(new Set([mergeTarget.id]));
  });

  it('M4: conflict-safely dedups when the target already has its own decline for the same face', async () => {
    const { ctx, personRepository, faceRepairDeclineRepository } = setup();
    const { user } = await ctx.newUser();
    const { person: faceOwner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: suspectedOwner } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: mergeTarget } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, faceOwner.id);

    // Both (f1, suspectedOwner) and (f1, mergeTarget) already exist — the merge must not throw a unique
    // violation on the (assetFaceId, suspectedOwnerId) index when re-pointing the source's row onto the target.
    await faceRepairDeclineRepository.createDeclines({
      faces: [
        { assetFaceId: f1, suspectedOwnerId: suspectedOwner.id },
        { assetFaceId: f1, suspectedOwnerId: mergeTarget.id },
      ],
      declinedBy: user.id,
    });

    const identity = await createIdentity();
    await personRepository.mergePersonProfile({
      sourcePersonId: suspectedOwner.id,
      targetPersonId: mergeTarget.id,
      targetIdentityId: identity.id,
    });

    const rows = await declineRowsFor(f1);
    expect(rows).toHaveLength(1);
    expect(rows[0].suspectedOwnerId).toBe(mergeTarget.id);

    const maps = await faceRepairDeclineRepository.getDeclineMaps({ assetFaceIds: [f1] });
    expect(maps.declinedFaceOwners.get(f1)).toEqual(new Set([mergeTarget.id]));
  });
});
