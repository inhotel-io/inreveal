import { Kysely } from 'kysely';
import { SourceType } from 'src/enum';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

// Slice 1 of the face-review unification: the load-bearing assumption.
//
// The unified design retires `face_repair_lock` and treats `face_identity_face.source = 'manual'` as THE
// durable record that a human placed a face on a person. Both engines then exclude manually-linked faces
// from their queues. That is only sound if a manual link cannot be silently downgraded by background work.
//
// `FaceIdentityBackfill` is the risk: `realignFacesToPersonIdentity` writes
// `.set({ identityId, source: 'backfill' })` unconditionally, so any face whose link identity has drifted
// away from its person's identity gets its `source` rewritten — manual included. These tests pin the
// behaviour down. If they cannot be made to pass, retiring the lock table is invalid.
let db: Kysely<DB>;

const setup = () => {
  const { ctx } = newMediumService(BaseService, {
    database: db,
    real: [PersonRepository, FaceIdentityRepository],
    mock: [LoggingRepository],
  });
  return {
    ctx,
    personRepository: ctx.get(PersonRepository),
    faceIdentityRepository: ctx.get(FaceIdentityRepository),
  };
};

type Ctx = ReturnType<typeof setup>['ctx'];

beforeAll(async () => {
  db = await getKyselyDB();
});

const seedFace = async (ctx: Ctx, ownerId: string, personId: string): Promise<string> => {
  const { asset } = await ctx.newAsset({ ownerId });
  const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId, sourceType: SourceType.MachineLearning });
  return assetFace.id;
};

const linkRowFor = (assetFaceId: string) =>
  db
    .selectFrom('face_identity_face')
    .select(['assetFaceId', 'identityId', 'source'])
    .where('assetFaceId', '=', assetFaceId)
    .executeTakeFirst();

const linkRowsFor = (assetFaceId: string) =>
  db.selectFrom('face_identity_face').selectAll().where('assetFaceId', '=', assetFaceId).execute();

// Drain the personal backfill the way the job does — page until there is no cursor left.
const runPersonalBackfill = async (faceIdentityRepository: FaceIdentityRepository) => {
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const result = await faceIdentityRepository.backfillPersonalIdentities({ cursor, limit: 100 });
    if (!result.nextCursor) {
      return;
    }
    cursor = result.nextCursor;
  }
  throw new Error('personal backfill did not converge');
};

describe('face_identity_face.source=manual durability (Slice 1 — load-bearing assumption)', () => {
  it('survives a full FaceIdentityBackfill pass when the link is aligned with its person', async () => {
    const { ctx, faceIdentityRepository } = setup();
    const { user } = await ctx.newUser();
    const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Anna' });
    const faceId = await seedFace(ctx, user.id, person.id);

    const identity = await faceIdentityRepository.ensurePersonIdentity(person.id);
    await faceIdentityRepository.replaceFaceIdentity({
      assetFaceId: faceId,
      identityId: identity.id,
      source: 'manual',
    });

    await runPersonalBackfill(faceIdentityRepository);

    const row = await linkRowFor(faceId);
    expect(row).toBeDefined();
    expect(row?.identityId).toBe(identity.id);
    expect(row?.source).toBe('manual');
  });

  it('survives a backfill realign when the link identity has drifted from its person', async () => {
    // The direct probe at `realignFacesToPersonIdentity`: the face sits on `person` but its link points at
    // an unrelated identity that no person of this owner references, so the backfill takes the "stranded"
    // branch and realigns it. Realigning WHICH human the face is linked to is correct; erasing the fact
    // that a HUMAN placed it is not.
    const { ctx, faceIdentityRepository } = setup();
    const { user } = await ctx.newUser();
    const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Anna' });
    const faceId = await seedFace(ctx, user.id, person.id);

    const personIdentity = await faceIdentityRepository.ensurePersonIdentity(person.id);
    const stranded = await db
      .insertInto('face_identity')
      .values({ type: 'person' })
      .returningAll()
      .executeTakeFirstOrThrow();
    await faceIdentityRepository.replaceFaceIdentity({
      assetFaceId: faceId,
      identityId: stranded.id,
      source: 'manual',
    });

    await runPersonalBackfill(faceIdentityRepository);

    const row = await linkRowFor(faceId);
    expect(row).toBeDefined();
    // Realigned onto the person's own identity...
    expect(row?.identityId).toBe(personIdentity.id);
    // ...but the human placement must survive.
    expect(row?.source).toBe('manual');
  });

  it('survives a people merge followed by a backfill', async () => {
    const { ctx, personRepository, faceIdentityRepository } = setup();
    const { user } = await ctx.newUser();
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Anna' });
    const { person: target } = await ctx.newPerson({ ownerId: user.id, name: 'Anna dup' });
    const faceId = await seedFace(ctx, user.id, source.id);

    const sourceIdentity = await faceIdentityRepository.ensurePersonIdentity(source.id);
    await faceIdentityRepository.replaceFaceIdentity({
      assetFaceId: faceId,
      identityId: sourceIdentity.id,
      source: 'manual',
    });

    const targetIdentity = await faceIdentityRepository.ensurePersonIdentity(target.id);
    await personRepository.mergePersonProfile({
      sourcePersonId: source.id,
      targetPersonId: target.id,
      targetIdentityId: targetIdentity.id,
    });

    await runPersonalBackfill(faceIdentityRepository);

    const row = await linkRowFor(faceId);
    expect(row).toBeDefined();
    expect(row?.source).toBe('manual');
  });

  it('re-affirming an existing link is an idempotent source-only update', async () => {
    const { ctx, faceIdentityRepository } = setup();
    const { user } = await ctx.newUser();
    const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Anna' });
    const faceId = await seedFace(ctx, user.id, person.id);

    const identity = await faceIdentityRepository.ensurePersonIdentity(person.id);
    await faceIdentityRepository.replaceFaceIdentity({ assetFaceId: faceId, identityId: identity.id, source: 'ml' });

    await faceIdentityRepository.replaceFaceIdentity({
      assetFaceId: faceId,
      identityId: identity.id,
      source: 'manual',
    });

    const rows = await linkRowsFor(faceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].identityId).toBe(identity.id);
    expect(rows[0].source).toBe('manual');

    // ...and re-affirming again changes nothing.
    await faceIdentityRepository.replaceFaceIdentity({
      assetFaceId: faceId,
      identityId: identity.id,
      source: 'manual',
    });
    const again = await linkRowsFor(faceId);
    expect(again).toHaveLength(1);
    expect(again[0].source).toBe('manual');
  });
});
