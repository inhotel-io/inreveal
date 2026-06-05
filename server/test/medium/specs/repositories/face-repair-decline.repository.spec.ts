import { Kysely } from 'kysely';
import { SourceType } from 'src/enum';
import { FaceRepairDeclineRepository } from 'src/repositories/face-repair-decline.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

// NOTE: Docker is required to run these tests. They are not run locally (no Docker) but are validated in CI.

let defaultDatabase: Kysely<DB>;

async function seedFaceAndPersons(db: Kysely<DB>) {
  const { ctx } = newMediumService(BaseService, {
    database: db,
    real: [FaceRepairDeclineRepository, PersonRepository],
    mock: [LoggingRepository],
  });

  const { user } = await ctx.newUser();
  const { person: personP } = await ctx.newPerson({ ownerId: user.id });
  const { person: personQ } = await ctx.newPerson({ ownerId: user.id });
  const { asset } = await ctx.newAsset({ ownerId: user.id });
  const { assetFace } = await ctx.newAssetFace({
    assetId: asset.id,
    personId: personP.id,
    sourceType: SourceType.MachineLearning,
    isVisible: true,
  });

  return {
    faceId: assetFace.id,
    personP: personP.id,
    personQ: personQ.id,
    declinedBy: user.id,
  };
}

describe(FaceRepairDeclineRepository.name, () => {
  let sut: FaceRepairDeclineRepository;
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = await getKyselyDB();
    sut = new FaceRepairDeclineRepository(db);
  });

  afterEach(() => db.deleteFrom('face_repair_decline').execute());

  it('creates face + person declines and loads them into maps', async () => {
    const { faceId, personP, personQ, declinedBy } = await seedFaceAndPersons(db);

    await sut.createDeclines({ faces: [{ assetFaceId: faceId, suspectedOwnerId: personQ }], declinedBy });
    await sut.createDeclines({ persons: [{ personId: personP, suspectedOwnerIds: [personQ] }], declinedBy });

    const maps = await sut.getDeclineMaps();
    expect(maps.declinedFaceOwners.get(faceId)).toEqual(new Set([personQ]));
    expect(maps.dismissedPersons.get(personP)).toEqual(new Set([personQ]));
  });

  it('is idempotent on (assetFaceId, suspectedOwnerId)', async () => {
    const { faceId, personQ, declinedBy } = await seedFaceAndPersons(db);

    const first = await sut.createDeclines({ faces: [{ assetFaceId: faceId, suspectedOwnerId: personQ }], declinedBy });
    const second = await sut.createDeclines({
      faces: [{ assetFaceId: faceId, suspectedOwnerId: personQ }],
      declinedBy,
    });
    expect(first).toBe(1);
    expect(second).toBe(0);
  });

  it('cascades: deleting the face removes its decline rows', async () => {
    const { faceId, personQ, declinedBy } = await seedFaceAndPersons(db);
    await sut.createDeclines({ faces: [{ assetFaceId: faceId, suspectedOwnerId: personQ }], declinedBy });
    await db.deleteFrom('asset_face').where('id', '=', faceId).execute();
    const maps = await sut.getDeclineMaps();
    expect(maps.declinedFaceOwners.has(faceId)).toBe(false);
  });

  it('lists and removes declines by id', async () => {
    const { personP, personQ, declinedBy } = await seedFaceAndPersons(db);
    await sut.createDeclines({ persons: [{ personId: personP, suspectedOwnerIds: [personQ] }], declinedBy });
    const list = await sut.listDeclines();
    const target = list.find((d) => d.personId === personP)!;
    expect(target.type).toBe('person');
    const removed = await sut.removeDeclines([target.id]);
    expect(removed).toBe(1);
  });
});
