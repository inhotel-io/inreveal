import { Kysely } from 'kysely';
import { SourceType } from 'src/enum';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { FacePersonVerdictRepository } from 'src/repositories/face-person-verdict.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

// Temporal consistency across a person merge or hard delete.
//
// This used to require bespoke re-pointing machinery in `mergePersonProfile`, because both durable Face
// Cleanup facts were keyed by `person` with ON DELETE CASCADE: merging a person away silently wiped the
// lock or decline, and the face resurfaced on the very next scan.
//
// The unified verdict layer removes that class of bug structurally rather than patching it:
//   - a human placement is `face_identity_face.source='manual'`, keyed by IDENTITY, which the merge
//     preserves (see face-identity.manual-durability.spec.ts);
//   - a negative verdict stores the target's identity alongside a `personId` that is ON DELETE SET NULL,
//     so the row survives its person and stays matchable by identity.
//
// These tests assert the survival directly, with no re-pointing step involved.
let db: Kysely<DB>;

const setup = () => {
  const { ctx } = newMediumService(BaseService, {
    database: db,
    real: [PersonRepository, FaceIdentityRepository, FacePersonVerdictRepository],
    mock: [LoggingRepository],
  });
  return {
    ctx,
    personRepository: ctx.get(PersonRepository),
    faceIdentityRepository: ctx.get(FaceIdentityRepository),
    facePersonVerdictRepository: ctx.get(FacePersonVerdictRepository),
  };
};

type Ctx = ReturnType<typeof setup>['ctx'];

beforeAll(async () => {
  db = await getKyselyDB();
});

const seedFace = async (ctx: Ctx, ownerId: string, personId: string | null): Promise<string> => {
  const { asset } = await ctx.newAsset({ ownerId });
  const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId, sourceType: SourceType.MachineLearning });
  return assetFace.id;
};

const verdictRowFor = (assetFaceId: string) =>
  db
    .selectFrom('face_person_verdict')
    .select(['id', 'personId', 'identityId', 'status'])
    .where('assetFaceId', '=', assetFaceId)
    .executeTakeFirst();

describe('face verdicts survive person delete/merge without re-pointing', () => {
  it('keeps a negative verdict, keyed by identity, when its target person is hard-deleted', async () => {
    const { ctx, personRepository, faceIdentityRepository, facePersonVerdictRepository } = setup();
    const { user } = await ctx.newUser();
    const { person: owner } = await ctx.newPerson({ ownerId: user.id, name: 'Suspected' });
    const faceId = await seedFace(ctx, user.id, null);

    const identity = await faceIdentityRepository.ensurePersonIdentity(owner.id);
    await facePersonVerdictRepository.markRejected(owner.id, faceId, {
      identityId: identity.id,
      source: 'cleanup',
      actorId: user.id,
    });

    await personRepository.delete([owner.id]);

    const row = await verdictRowFor(faceId);
    expect(row).toBeDefined();
    expect(row?.status).toBe('rejected');
    // The person reference falls away; the identity key is what keeps the verdict usable.
    expect(row?.personId).toBeNull();
    expect(row?.identityId).toBe(identity.id);

    const tokens = await facePersonVerdictRepository.getNegativeVerdictTokens([faceId]);
    expect(tokens.get(faceId)).toContain(`identity:${identity.id}`);
  });

  it('keeps a human placement through a merge, so the face is still settled afterwards', async () => {
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

    const settled = await faceIdentityRepository.getManualLinkedFaceIds([faceId]);
    expect(settled.has(faceId)).toBe(true);
  });

  it('keeps a negative verdict through a merge of its target person', async () => {
    const { ctx, personRepository, faceIdentityRepository, facePersonVerdictRepository } = setup();
    const { user } = await ctx.newUser();
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Bob' });
    const { person: target } = await ctx.newPerson({ ownerId: user.id, name: 'Bob dup' });
    const faceId = await seedFace(ctx, user.id, null);

    const sourceIdentity = await faceIdentityRepository.ensurePersonIdentity(source.id);
    await facePersonVerdictRepository.markRejected(source.id, faceId, {
      identityId: sourceIdentity.id,
      source: 'cleanup',
      actorId: user.id,
    });

    const targetIdentity = await faceIdentityRepository.ensurePersonIdentity(target.id);
    await personRepository.mergePersonProfile({
      sourcePersonId: source.id,
      targetPersonId: target.id,
      targetIdentityId: targetIdentity.id,
    });

    const row = await verdictRowFor(faceId);
    expect(row).toBeDefined();
    expect(row?.status).toBe('rejected');
  });
});
