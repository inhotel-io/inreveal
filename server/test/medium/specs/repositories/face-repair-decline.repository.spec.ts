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

  // This table now records ONLY the console-local cluster mute ("stop showing me this whole person"). The
  // face-level "this face is not that person" fact moved to the shared `face_person_verdict` layer so the
  // suggestion engine can see it too — see face-person-verdict.repository.spec.ts.
  it('creates a cluster mute and loads it into the mute map', async () => {
    const { personP, personQ, declinedBy } = await seedFaceAndPersons(db);

    await sut.createClusterMutes({
      persons: [{ personId: personP, suspectedOwnerIds: [personQ] }],
      declinedBy,
    });

    const mutes = await sut.getClusterMuteMap([personP]);
    expect(mutes.get(personP)).toEqual(new Set([personQ]));
  });

  it('returns an empty map for an empty scope rather than reading the whole table', async () => {
    const { personP, personQ, declinedBy } = await seedFaceAndPersons(db);
    await sut.createClusterMutes({
      persons: [{ personId: personP, suspectedOwnerIds: [personQ] }],
      declinedBy,
    });

    expect(await sut.getClusterMuteMap([])).toEqual(new Map());
  });

  it('scopes the mute map to the persons asked for', async () => {
    const { personP, personQ, declinedBy } = await seedFaceAndPersons(db);
    const other = await seedFaceAndPersons(db);
    await sut.createClusterMutes({
      persons: [
        { personId: personP, suspectedOwnerIds: [personQ] },
        { personId: other.personP, suspectedOwnerIds: [other.personQ] },
      ],
      declinedBy,
    });

    const mutes = await sut.getClusterMuteMap([personP]);
    expect([...mutes.keys()]).toEqual([personP]);
  });

  it('re-muting a person replaces the stored fingerprint (one row per person, last-write-wins)', async () => {
    const { personP, personQ, declinedBy } = await seedFaceAndPersons(db);

    await sut.createClusterMutes({ persons: [{ personId: personP, suspectedOwnerIds: [personQ] }], declinedBy });
    await sut.createClusterMutes({ persons: [{ personId: personP, suspectedOwnerIds: [] }], declinedBy });

    const rows = await db.selectFrom('face_repair_decline').selectAll().where('personId', '=', personP).execute();
    expect(rows).toHaveLength(1);

    const mutes = await sut.getClusterMuteMap([personP]);
    expect(mutes.get(personP)).toEqual(new Set());
  });

  it('lists and removes cluster mutes by id', async () => {
    const { personP, personQ, declinedBy } = await seedFaceAndPersons(db);
    await sut.createClusterMutes({ persons: [{ personId: personP, suspectedOwnerIds: [personQ] }], declinedBy });

    const listed = await sut.listDeclines();
    expect(listed).toHaveLength(1);
    expect(listed[0].personId).toBe(personP);

    expect(await sut.removeClusterMutes({ ids: [listed[0].id] })).toBe(1);
    expect(await sut.listDeclines()).toEqual([]);
  });

  it('removeClusterMutes with no ids is a no-op', async () => {
    expect(await sut.removeClusterMutes({})).toBe(0);
  });

  it('cascades: deleting the person removes its cluster mute', async () => {
    const { personP, personQ, declinedBy } = await seedFaceAndPersons(db);
    await sut.createClusterMutes({ persons: [{ personId: personP, suspectedOwnerIds: [personQ] }], declinedBy });

    await db.deleteFrom('person').where('id', '=', personP).execute();

    expect(await sut.listDeclines()).toEqual([]);
  });
});
