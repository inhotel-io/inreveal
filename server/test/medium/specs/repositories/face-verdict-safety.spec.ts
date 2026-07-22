import { Kysely } from 'kysely';
import { SourceType } from 'src/enum';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { SearchRepository } from 'src/repositories/search.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { newEmbedding } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';

// Slice 6: the two source-of-truth safety fixes.
//   1. searchFaces must exclude soft-deleted faces (the "not a face" tombstone), so neither the suggestion
//      scan nor recognition ever picks a crop a human already declared not-a-face.
//   2. unassignFaces ("reset all people") must clear the human-placement record too, so a library-wide
//      reset does not leave every previously-confirmed face permanently excluded from both engines.
let db: Kysely<DB>;

const setup = () => {
  const { ctx } = newMediumService(BaseService, {
    database: db,
    real: [SearchRepository, PersonRepository, FaceIdentityRepository],
    mock: [LoggingRepository],
  });
  return {
    ctx,
    searchRepository: ctx.get(SearchRepository),
    personRepository: ctx.get(PersonRepository),
    faceIdentityRepository: ctx.get(FaceIdentityRepository),
  };
};

type Ctx = ReturnType<typeof setup>['ctx'];

beforeAll(async () => {
  db = await getKyselyDB();
});

// Seed a face with a real face_search embedding so it is a genuine searchFaces candidate.
const seedSearchableFace = async (
  ctx: Ctx,
  input: { ownerId: string; personId: string | null; embedding: string },
): Promise<string> => {
  const { asset } = await ctx.newAsset({ ownerId: input.ownerId });
  const { assetFace } = await ctx.newAssetFace({
    assetId: asset.id,
    personId: input.personId,
    sourceType: SourceType.MachineLearning,
  });
  await ctx.database.insertInto('face_search').values({ faceId: assetFace.id, embedding: input.embedding }).execute();
  return assetFace.id;
};

describe('searchFaces excludes soft-deleted faces', () => {
  it('does not return a face whose asset_face.deletedAt is set', async () => {
    const { ctx, searchRepository } = setup();
    const { user } = await ctx.newUser();
    const embedding = newEmbedding();

    const liveFace = await seedSearchableFace(ctx, { ownerId: user.id, personId: null, embedding });
    const tombstonedFace = await seedSearchableFace(ctx, { ownerId: user.id, personId: null, embedding });
    await ctx.database
      .updateTable('asset_face')
      .set({ deletedAt: new Date() })
      .where('id', '=', tombstonedFace)
      .execute();

    const results = await searchRepository.searchFaces({
      userIds: [user.id],
      embedding,
      numResults: 10,
      maxDistance: 2,
      hasPerson: false,
    });

    const ids = results.map((r) => r.id);
    expect(ids).toContain(liveFace);
    expect(ids).not.toContain(tombstonedFace);
  });
});

describe('unassignFaces clears human placements', () => {
  it('removes every manual identity link so no face stays falsely settled', async () => {
    const { ctx, personRepository, faceIdentityRepository } = setup();
    const { user } = await ctx.newUser();
    const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Anna' });
    const { asset } = await ctx.newAsset({ ownerId: user.id });
    const { assetFace } = await ctx.newAssetFace({
      assetId: asset.id,
      personId: person.id,
      sourceType: SourceType.MachineLearning,
    });

    const identity = await faceIdentityRepository.ensurePersonIdentity(person.id);
    await faceIdentityRepository.replaceFaceIdentity({
      assetFaceId: assetFace.id,
      identityId: identity.id,
      source: 'manual',
    });
    const linkedBefore = await faceIdentityRepository.getManualLinkedFaceIds([assetFace.id]);
    expect(linkedBefore.has(assetFace.id)).toBe(true);

    await personRepository.unassignFaces({ sourceType: SourceType.MachineLearning });

    // The face is unassigned AND no longer carries a human-placement record.
    const face = await db
      .selectFrom('asset_face')
      .select('personId')
      .where('id', '=', assetFace.id)
      .executeTakeFirstOrThrow();
    expect(face.personId).toBeNull();
    const linkedAfter = await faceIdentityRepository.getManualLinkedFaceIds([assetFace.id]);
    expect(linkedAfter.has(assetFace.id)).toBe(false);
  });

  it('is a no-op when there are no faces of the given source type', async () => {
    const { personRepository } = setup();
    await expect(personRepository.unassignFaces({ sourceType: SourceType.MachineLearning })).resolves.toBeUndefined();
  });
});
