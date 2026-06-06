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
    const removed = await sut.removeDeclines({ ids: [target.id] });
    expect(removed).toBe(1);
  });

  it('removes a face decline by its natural key (assetFaceId, suspectedOwnerId)', async () => {
    const { faceId, personQ, declinedBy } = await seedFaceAndPersons(db);
    await sut.createDeclines({ faces: [{ assetFaceId: faceId, suspectedOwnerId: personQ }], declinedBy });

    // Undo path used by the review screen: it knows the face/owner pair, not the row id.
    const removed = await sut.removeDeclines({ faces: [{ assetFaceId: faceId, suspectedOwnerId: personQ }] });
    expect(removed).toBe(1);

    const maps = await sut.getDeclineMaps();
    expect(maps.declinedFaceOwners.has(faceId)).toBe(false);
  });

  it('removeDeclines with neither ids nor faces is a no-op', async () => {
    const removed = await sut.removeDeclines({});
    expect(removed).toBe(0);
  });

  it('person re-dismiss replaces the stored fingerprint (one row per person, last-write-wins)', async () => {
    const { personP, personQ, declinedBy } = await seedFaceAndPersons(db);
    // Seed a third person to use as the expanded fingerprint
    const { ctx } = newMediumService(BaseService, {
      database: db,
      real: [FaceRepairDeclineRepository, PersonRepository],
      mock: [LoggingRepository],
    });
    const { user } = await ctx.newUser();
    const { person: personR } = await ctx.newPerson({ ownerId: user.id });

    // First dismiss: P suspected toward [Q]
    await sut.createDeclines({ persons: [{ personId: personP, suspectedOwnerIds: [personQ] }], declinedBy });
    // Second dismiss: P suspected toward [Q, R] — should replace, not duplicate
    await sut.createDeclines({
      persons: [{ personId: personP, suspectedOwnerIds: [personQ, personR.id] }],
      declinedBy,
    });

    const maps = await sut.getDeclineMaps();
    // Exactly one row for personP — latest fingerprint wins
    expect(maps.dismissedPersons.get(personP)).toEqual(new Set([personQ, personR.id]));
    // Confirm no duplicate rows exist for personP
    const list = await sut.listDeclines();
    const personPRows = list.filter((d) => d.personId === personP);
    expect(personPRows).toHaveLength(1);
  });
});
