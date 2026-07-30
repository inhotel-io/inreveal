import { Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import { AssetVisibility } from 'src/enum';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { FacePersonVerdictRepository } from 'src/repositories/face-person-verdict.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { DB } from 'src/schema';
import { FacePersonVerdictStatus } from 'src/schema/tables/face-person-verdict.table';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let defaultDatabase: Kysely<DB>;

const getRowOrUndefined = (pId: string, afId: string) =>
  defaultDatabase
    .selectFrom('face_person_verdict')
    .selectAll()
    .where('personId', '=', pId)
    .where('assetFaceId', '=', afId)
    .executeTakeFirst();

const getRow = (pId: string, afId: string) =>
  defaultDatabase
    .selectFrom('face_person_verdict')
    .selectAll()
    .where('personId', '=', pId)
    .where('assetFaceId', '=', afId)
    .executeTakeFirstOrThrow();

const getSpaceRow = (spacePersonId: string, assetFaceId: string) =>
  defaultDatabase
    .selectFrom('face_person_verdict')
    .selectAll()
    .where('spacePersonId', '=', spacePersonId)
    .where('assetFaceId', '=', assetFaceId)
    .executeTakeFirstOrThrow();

// Status-only helpers for the Slice 3 eligibility tests below, which assert `status` after a claim attempt.
const getRowStatus = async (pId: string, afId: string) => {
  const row = await getRow(pId, afId);
  return row.status;
};

const getSpaceRowStatus = async (spacePersonId: string, assetFaceId: string) => {
  const row = await getSpaceRow(spacePersonId, assetFaceId);
  return row.status;
};

const countRows = (assetFaceId: string, status: FacePersonVerdictStatus) =>
  defaultDatabase
    .selectFrom('face_person_verdict')
    .select((eb) => eb.fn.countAll<string>().as('c'))
    .where('assetFaceId', '=', assetFaceId)
    .where('status', '=', status)
    .executeTakeFirstOrThrow()
    .then((r) => Number(r.c));

// S3.6 fixture: a bare space + space person, reused across the claimPendingForSpacePerson eligibility tests.
const makeSpaceFixture = async (ctx: ReturnType<typeof setup>['ctx']) => {
  const { user } = await ctx.newUser();
  const { space } = await ctx.newSharedSpace({ createdById: user.id });
  const spacePerson = await ctx.database
    .insertInto('shared_space_person')
    .values({ spaceId: space.id, name: 'Alice' })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { user, space, spacePerson };
};

const setup = (db?: Kysely<DB>) => {
  const { ctx } = newMediumService(BaseService, {
    database: db || defaultDatabase,
    real: [FacePersonVerdictRepository],
    mock: [LoggingRepository],
  });
  return { ctx, sut: ctx.get(FacePersonVerdictRepository) };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

afterAll(async () => {
  await defaultDatabase.destroy();
});

describe('FacePersonVerdictRepository', () => {
  it('is constructible via the medium service container', () => {
    const { sut } = setup();
    expect(sut).toBeInstanceOf(FacePersonVerdictRepository);
  });

  describe('upsertPending', () => {
    let personId: string;
    let assetFaceId: string;

    beforeAll(async () => {
      const { ctx } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Test Person', isHidden: false });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      personId = person.id;
      assetFaceId = assetFace.id;
    });

    beforeEach(async () => {
      // Ensure each test starts with no existing suggestion row for this pair.
      await defaultDatabase
        .deleteFrom('face_person_verdict')
        .where('personId', '=', personId)
        .where('assetFaceId', '=', assetFaceId)
        .execute();
    });

    afterEach(async () => {
      // Clean up after each test.
      await defaultDatabase
        .deleteFrom('face_person_verdict')
        .where('personId', '=', personId)
        .where('assetFaceId', '=', assetFaceId)
        .execute();
    });

    it('inserts a new pending row', async () => {
      const { sut } = setup();
      await sut.upsertPending([{ personId, assetFaceId, distance: 0.6 }]);
      const row = await getRow(personId, assetFaceId);
      expect(row).toMatchObject({ status: 'pending', distance: 0.6 });
    });

    it('refreshes distance for a still-pending row', async () => {
      const { sut } = setup();
      await sut.upsertPending([{ personId, assetFaceId, distance: 0.6 }]);
      await sut.upsertPending([{ personId, assetFaceId, distance: 0.55 }]);
      const row = await getRow(personId, assetFaceId);
      expect(row).toMatchObject({ status: 'pending', distance: 0.55 });
    });

    it.each(['rejected', 'ignored'] as const)('NEVER resurrects a %s row', async (status) => {
      const { sut } = setup();
      await sut.upsertPending([{ personId, assetFaceId, distance: 0.6 }]);
      await defaultDatabase
        .updateTable('face_person_verdict')
        .set({ status })
        .where('personId', '=', personId)
        .where('assetFaceId', '=', assetFaceId)
        .execute();
      await sut.upsertPending([{ personId, assetFaceId, distance: 0.4 }]);
      const row = await getRow(personId, assetFaceId);
      expect(row.status).toBe(status);
      expect(row.distance).toBe(0.6); // unchanged
    });

    it('leaves a cleanup-sourced verdict untouched', async () => {
      // The cross-engine half of never-reappear: an admin's "keep here" recorded from the Face Cleanup
      // console must not be resurrected by the suggestion scan either.
      const { sut } = setup();
      await sut.markRejected(personId, assetFaceId, { source: 'cleanup' });

      await sut.upsertPending([{ personId, assetFaceId, distance: 0.4 }]);

      const row = await getRow(personId, assetFaceId);
      expect(row.status).toBe('rejected');
      expect(row.source).toBe('cleanup');
      expect(row.distance).toBeNull();
    });
  });

  describe('getPendingForPerson', () => {
    // P: named, visible, type=person — the main subject
    let personPId: string;
    // U: unnamed person — excluded by read gate
    let unnamedPersonId: string;
    // H: hidden person — excluded by read gate
    let hiddenPersonId: string;
    // X: pet person — excluded by read gate
    let petPersonId: string;

    // F1 at 0.45  — below or at maxDistance: excluded by band
    // F2 at 0.62  — rejected: excluded by status
    // F3 at 0.60  — in band, pending: included
    // F4 at 0.70  — in band, pending: included
    // F5 at 0.90  — above suggestionMaxDistance: excluded by band
    // F6 at 0.65  — in band, pending, but face becomes assigned: excluded by af.personId IS NULL
    let f6Id: string;

    const opts = { maxDistance: 0.5, suggestionMaxDistance: 0.8, page: 1, size: 10 };

    beforeAll(async () => {
      const { ctx } = setup();

      const { user } = await ctx.newUser();

      const { person: personP } = await ctx.newPerson({
        ownerId: user.id,
        name: 'Alice',
        isHidden: false,
        type: 'person',
      });
      personPId = personP.id;

      const { person: personU } = await ctx.newPerson({
        ownerId: user.id,
        name: '',
        isHidden: false,
        type: 'person',
      });
      unnamedPersonId = personU.id;

      const { person: personH } = await ctx.newPerson({
        ownerId: user.id,
        name: 'Hidden Hannah',
        isHidden: true,
        type: 'person',
      });
      hiddenPersonId = personH.id;

      const { person: personX } = await ctx.newPerson({
        ownerId: user.id,
        name: 'Fluffy',
        isHidden: false,
        type: 'pet',
      });
      petPersonId = personX.id;

      // Create asset faces (unassigned, i.e. personId = null)
      const { asset } = await ctx.newAsset({ ownerId: user.id });

      const { assetFace: f1 } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { assetFace: f2 } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { assetFace: f3 } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { assetFace: f4 } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { assetFace: f5 } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      // Asset faces for gate-excluded persons
      const { assetFace: fU } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { assetFace: fH } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { assetFace: fX } = await ctx.newAssetFace({ assetId: asset.id, personId: null });

      const { sut } = setup();

      // F1: distance 0.45 — at/below maxDistance (excluded by band lower bound)
      await sut.upsertPending([{ personId: personPId, assetFaceId: f1.id, distance: 0.45 }]);

      // F2: insert at 0.62 then reject — excluded because status='rejected'
      await sut.upsertPending([{ personId: personPId, assetFaceId: f2.id, distance: 0.62 }]);
      await defaultDatabase
        .updateTable('face_person_verdict')
        .set({ status: 'rejected' })
        .where('personId', '=', personPId)
        .where('assetFaceId', '=', f2.id)
        .execute();

      // F3: distance 0.60 — in band, pending (included)
      await sut.upsertPending([{ personId: personPId, assetFaceId: f3.id, distance: 0.6 }]);

      // F4: distance 0.70 — in band, pending (included)
      await sut.upsertPending([{ personId: personPId, assetFaceId: f4.id, distance: 0.7 }]);

      // F5: distance 0.90 — above suggestionMaxDistance (excluded by band upper bound)
      await sut.upsertPending([{ personId: personPId, assetFaceId: f5.id, distance: 0.9 }]);

      // F6: in band (0.65) but face becomes assigned mid-review — excluded by af.personId IS NULL
      const { assetFace: f6 } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      f6Id = f6.id;
      await sut.upsertPending([{ personId: personPId, assetFaceId: f6Id, distance: 0.65 }]);
      await defaultDatabase.updateTable('asset_face').set({ personId: personPId }).where('id', '=', f6Id).execute();

      // Read-gate persons each get one in-band pending suggestion
      await sut.upsertPending([{ personId: unnamedPersonId, assetFaceId: fU.id, distance: 0.65 }]);
      await sut.upsertPending([{ personId: hiddenPersonId, assetFaceId: fH.id, distance: 0.65 }]);
      await sut.upsertPending([{ personId: petPersonId, assetFaceId: fX.id, distance: 0.65 }]);
    });

    it('returns only pending rows strictly inside the band (maxDistance, suggestionMaxDistance], ordered by distance, with total', async () => {
      const { sut } = setup();
      const res = await sut.getPendingForPerson(personPId, opts);
      expect(res.total).toBe(2);
      expect(res.items.map((i) => i.distance)).toEqual([0.6, 0.7]);
    });

    it('excludes a pending row at exactly distance == maxDistance (lower bound is exclusive, `>` semantics)', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({
        ownerId: user.id,
        name: 'Boundary Low',
        isHidden: false,
        type: 'person',
      });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });

      await sut.upsertPending([{ personId: person.id, assetFaceId: assetFace.id, distance: opts.maxDistance }]);

      const res = await sut.getPendingForPerson(person.id, opts);
      expect(res).toEqual({ total: 0, items: [] });
    });

    it('includes a pending row at exactly distance == suggestionMaxDistance (upper bound is inclusive, `<=` semantics)', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({
        ownerId: user.id,
        name: 'Boundary High',
        isHidden: false,
        type: 'person',
      });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });

      await sut.upsertPending([
        { personId: person.id, assetFaceId: assetFace.id, distance: opts.suggestionMaxDistance },
      ]);

      const res = await sut.getPendingForPerson(person.id, opts);
      expect(res.total).toBe(1);
      expect(res.items.map((i) => i.assetFaceId)).toEqual([assetFace.id]);
      expect(res.items[0].distance).toBe(opts.suggestionMaxDistance);
    });

    it('returns empty for an unnamed person (read gate)', async () => {
      const { sut } = setup();
      const res = await sut.getPendingForPerson(unnamedPersonId, opts);
      expect(res).toEqual({ total: 0, items: [] });
    });

    it('returns empty for a hidden person (read gate)', async () => {
      const { sut } = setup();
      const res = await sut.getPendingForPerson(hiddenPersonId, opts);
      expect(res).toEqual({ total: 0, items: [] });
    });

    it('returns empty for a pet person (read gate)', async () => {
      const { sut } = setup();
      const res = await sut.getPendingForPerson(petPersonId, opts);
      expect(res).toEqual({ total: 0, items: [] });
    });

    it('returns empty when feature is disabled (suggestionMaxDistance <= maxDistance)', async () => {
      const { sut } = setup();
      const res = await sut.getPendingForPerson(personPId, { ...opts, suggestionMaxDistance: 0.5 });
      expect(res).toEqual({ total: 0, items: [] });
    });

    it('excludes a pending suggestion whose face was assigned between scan and read (af.personId IS NULL guard)', async () => {
      const { sut } = setup();
      const res = await sut.getPendingForPerson(personPId, opts);
      // F6 (0.65) has a pending suggestion but asset_face.personId was set — must be excluded.
      // F3 (0.60) and F4 (0.70) are still unassigned: total stays 2.
      expect(res.total).toBe(2);
      expect(res.items.map((i) => i.assetFaceId)).not.toContain(f6Id);
    });

    it('returns the asset id, bounding box and dimensions for each in-band pending item', async () => {
      const { sut } = setup();
      const res = await sut.getPendingForPerson(personPId, opts);

      expect(res.total).toBe(2);
      for (const item of res.items) {
        expect(item.assetId).toEqual(expect.any(String));
        expect(item.imageWidth).toBeGreaterThan(0);
        expect(item.imageHeight).toBeGreaterThan(0);
        expect(typeof item.boundingBoxX1).toBe('number');
        expect(typeof item.boundingBoxX2).toBe('number');
        expect(typeof item.boundingBoxY1).toBe('number');
        expect(typeof item.boundingBoxY2).toBe('number');
      }
      // still ordered by distance ascending (Phase-1 contract preserved)
      expect(res.items.map((i) => i.distance)).toEqual([0.6, 0.7]);
    });

    it('excludes pending rows on trashed / hidden / offline / locked assets and invisible faces (D11)', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Bob', isHidden: false, type: 'person' });

      const { asset: normalAsset } = await ctx.newAsset({ ownerId: user.id });
      const { asset: trashedAsset } = await ctx.newAsset({ ownerId: user.id, deletedAt: new Date() });
      const { asset: hiddenAsset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Hidden });
      const { asset: lockedAsset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Locked });
      const { asset: offlineAsset } = await ctx.newAsset({ ownerId: user.id, isOffline: true });

      const { assetFace: normalFace } = await ctx.newAssetFace({ assetId: normalAsset.id, personId: null });
      const { assetFace: trashedFace } = await ctx.newAssetFace({ assetId: trashedAsset.id, personId: null });
      const { assetFace: hiddenFace } = await ctx.newAssetFace({ assetId: hiddenAsset.id, personId: null });
      const { assetFace: lockedFace } = await ctx.newAssetFace({ assetId: lockedAsset.id, personId: null });
      const { assetFace: offlineFace } = await ctx.newAssetFace({ assetId: offlineAsset.id, personId: null });
      const { assetFace: invisibleFace } = await ctx.newAssetFace({ assetId: normalAsset.id, personId: null });
      await defaultDatabase
        .updateTable('asset_face')
        .set({ isVisible: false })
        .where('id', '=', invisibleFace.id)
        .execute();

      await sut.upsertPending([
        { personId: person.id, assetFaceId: normalFace.id, distance: 0.6 },
        { personId: person.id, assetFaceId: trashedFace.id, distance: 0.61 },
        { personId: person.id, assetFaceId: hiddenFace.id, distance: 0.62 },
        { personId: person.id, assetFaceId: lockedFace.id, distance: 0.63 },
        { personId: person.id, assetFaceId: offlineFace.id, distance: 0.64 },
        { personId: person.id, assetFaceId: invisibleFace.id, distance: 0.65 },
      ]);

      const result = await sut.getPendingForPerson(person.id, opts);

      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.assetFaceId)).toEqual([normalFace.id]);

      // Read-time gate: rows are never deleted, so restoring the trashed asset resurfaces its row.
      await defaultDatabase.updateTable('asset').set({ deletedAt: null }).where('id', '=', trashedAsset.id).execute();

      const afterUntrash = await sut.getPendingForPerson(person.id, opts);
      expect(afterUntrash.total).toBe(2);
      expect(afterUntrash.items.map((item) => item.assetFaceId)).toEqual(
        expect.arrayContaining([normalFace.id, trashedFace.id]),
      );
    });
  });

  describe('claimPending / markRejected / markIgnored', () => {
    let personId: string;
    let assetFaceId: string;
    const opts = { maxDistance: 0.5, suggestionMaxDistance: 0.8 };

    beforeAll(async () => {
      const { ctx } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Suggestion Person', isHidden: false });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      personId = person.id;
      assetFaceId = assetFace.id;
    });

    beforeEach(async () => {
      await defaultDatabase.deleteFrom('face_person_verdict').where('assetFaceId', '=', assetFaceId).execute();
    });

    afterEach(async () => {
      await defaultDatabase.deleteFrom('face_person_verdict').where('assetFaceId', '=', assetFaceId).execute();
    });

    it('claimPending removes the queue row once and reports 0 on a double-submit', async () => {
      // Confirm has no status of its own — the durable positive verdict is the face's manual identity link.
      // All this layer does is drain the queue, exactly once, so a double-submit is a benign no-op.
      const { sut } = setup();
      await sut.upsertPending([{ personId, assetFaceId, distance: 0.6 }]);

      expect(await sut.claimPending(personId, assetFaceId, opts)).toBe(1);
      expect(await getRowOrUndefined(personId, assetFaceId)).toBeUndefined();

      expect(await sut.claimPending(personId, assetFaceId, opts)).toBe(0);
    });

    it.each([
      ['markRejected', 'rejected'],
      ['markIgnored', 'ignored'],
    ] as const)('%s records %s over a pending row and is idempotent', async (method, status) => {
      const { sut } = setup();
      await sut.upsertPending([{ personId, assetFaceId, distance: 0.6 }]);

      expect(await sut[method](personId, assetFaceId)).toBe(1);
      let row = await getRow(personId, assetFaceId);
      expect(row.status).toBe(status);

      // Verdicts are UPSERTED, not flipped from a pending row: the cleanup console records them for faces
      // that never had a suggestion queued. Re-running is therefore a no-op write, not a no-op.
      expect(await sut[method](personId, assetFaceId)).toBe(1);
      row = await getRow(personId, assetFaceId);
      expect(row.status).toBe(status);
    });

    it.each([
      ['markRejected', 'rejected'],
      ['markIgnored', 'ignored'],
    ] as const)('%s records %s with no pending row present', async (method, status) => {
      const { sut } = setup();

      expect(await sut[method](personId, assetFaceId)).toBe(1);

      const row = await getRow(personId, assetFaceId);
      expect(row.status).toBe(status);
      expect(row.distance).toBeNull();
    });

    it.each([
      ['markRejected', 'rejected'],
      ['markIgnored', 'ignored'],
    ] as const)('%s drains the queue row so claimPending can no longer claim it', async (method, status) => {
      const { sut } = setup();
      await sut.upsertPending([{ personId, assetFaceId, distance: 0.6 }]);

      expect(await sut[method](personId, assetFaceId)).toBe(1);

      // The row is no longer 'pending', so a confirm arriving afterwards finds nothing to claim.
      expect(await sut.claimPending(personId, assetFaceId, opts)).toBe(0);
      const row = await getRow(personId, assetFaceId);
      expect(row.status).toBe(status);
    });

    it('a later resolution overwrites an earlier one (last human wins)', async () => {
      // Deliberate: re-resolving is a human changing their mind. The invariant that matters is that the
      // SCAN cannot resurrect a resolved row — that is upsertPending's `WHERE status = 'pending'` guard,
      // covered above — not that a person is locked out of their own earlier answer.
      const { sut } = setup();
      await sut.upsertPending([{ personId, assetFaceId, distance: 0.6 }]);

      await sut.markRejected(personId, assetFaceId);
      await sut.markIgnored(personId, assetFaceId);

      const row = await getRow(personId, assetFaceId);
      expect(row.status).toBe('ignored');
    });

    it('reject and ignore racing for the same row leave exactly one row', async () => {
      const { sut } = setup();
      await sut.upsertPending([{ personId, assetFaceId, distance: 0.6 }]);

      await Promise.all([sut.markRejected(personId, assetFaceId), sut.markIgnored(personId, assetFaceId)]);

      const rows = await defaultDatabase
        .selectFrom('face_person_verdict')
        .selectAll()
        .where('personId', '=', personId)
        .where('assetFaceId', '=', assetFaceId)
        .execute();
      expect(rows).toHaveLength(1);
      expect(['rejected', 'ignored']).toContain(rows[0].status);
    });

    it.each([
      ['markRejected', 'rejected'],
      ['markIgnored', 'ignored'],
    ] as const)('%s resolves only the target row and leaves sibling suggestions pending', async (method, status) => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person: siblingPerson } = await ctx.newPerson({
        ownerId: user.id,
        name: 'Sibling Suggestion Person',
        isHidden: false,
      });
      await sut.upsertPending([
        { personId, assetFaceId, distance: 0.6 },
        { personId: siblingPerson.id, assetFaceId, distance: 0.65 },
      ]);

      expect(await sut[method](personId, assetFaceId)).toBe(1);

      const target = await getRow(personId, assetFaceId);
      const sibling = await getRow(siblingPerson.id, assetFaceId);
      expect(target.status).toBe(status);
      expect(sibling.status).toBe('pending');
    });

    it('claimPending returns 0 for a pair that has no row (benign idempotent)', async () => {
      const { sut } = setup();
      expect(await sut.claimPending(personId, assetFaceId, opts)).toBe(0);
    });

    it('reject over an existing keep-here row preserves identityId, updates status/source/actor (D10)', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { user: admin } = await ctx.newUser();
      const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Coalesce Person', isHidden: false });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const identity = await ctx.get(FaceIdentityRepository).ensurePersonIdentity(person.id);

      // A cleanup keep-here (rejected) row WITH identityId + actorId — the stronger existing key.
      await sut.markRejected(person.id, assetFace.id, {
        identityId: identity.id,
        source: 'cleanup',
        actorId: admin.id,
      });
      let row = await getRow(person.id, assetFace.id);
      expect(row).toMatchObject({ identityId: identity.id, status: 'rejected', source: 'cleanup', actorId: admin.id });

      // A degenerate caller reject WITHOUT opts must never null the stronger existing identityId.
      await sut.markRejected(person.id, assetFace.id);
      row = await getRow(person.id, assetFace.id);
      expect(row.identityId).toBe(identity.id);
      expect(row.status).toBe('rejected');

      // A subsequent human reject WITH opts overwrites status/source/actor and keeps identityId.
      await sut.markRejected(person.id, assetFace.id, {
        identityId: identity.id,
        source: 'suggestion',
        actorId: user.id,
      });
      row = await getRow(person.id, assetFace.id);
      expect(row).toMatchObject({
        identityId: identity.id,
        status: 'rejected',
        source: 'suggestion',
        actorId: user.id,
      });
    });
  });

  // S3.10 (pin): the refactor's safety net. This mirrors PersonService#confirmFaceSuggestion's write chain
  // (claim -> reassign -> resolveAssignedFace -> identity-relink) directly against the repositories, so it
  // exercises exactly what the Slice 3 eligibility refactor touches without pulling in the service's access
  // checks. Written and run FIRST, against the pre-refactor `claimPending`, to prove the happy path is green
  // before anything changes; kept green throughout the refactor.
  describe('S3.10 — happy path safety net (pin)', () => {
    it('an eligible pending row confirms, reassigns, drains and manual-links end to end', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Happy Path', isHidden: false, type: 'person' });
      const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });

      await sut.upsertPending([{ personId: person.id, assetFaceId: assetFace.id, distance: 0.6 }]);

      // Confirm flow order: claim BEFORE reassign/resolve/relink (mirrors person.service.ts).
      const claimed = await sut.claimPending(person.id, assetFace.id, { maxDistance: 0.5, suggestionMaxDistance: 0.8 });
      expect(claimed).toBe(1);

      const personRepository = ctx.get(PersonRepository);
      const faceIdentityRepository = ctx.get(FaceIdentityRepository);

      await personRepository.reassignFace(assetFace.id, person.id);
      await sut.resolveAssignedFace(assetFace.id);
      const identity = await faceIdentityRepository.ensurePersonIdentity(person.id);
      await faceIdentityRepository.replaceFaceIdentity({
        assetFaceId: assetFace.id,
        identityId: identity.id,
        source: 'manual',
      });

      const face = await defaultDatabase
        .selectFrom('asset_face')
        .select(['personId'])
        .where('id', '=', assetFace.id)
        .executeTakeFirstOrThrow();
      expect(face.personId).toBe(person.id); // reassigned

      const verdictRow = await getRowOrUndefined(person.id, assetFace.id);
      expect(verdictRow).toBeUndefined(); // drained

      const link = await defaultDatabase
        .selectFrom('face_identity_face')
        .select(['identityId', 'source'])
        .where('assetFaceId', '=', assetFace.id)
        .executeTakeFirstOrThrow();
      expect(link).toEqual({ identityId: identity.id, source: 'manual' }); // manual-linked
    });
  });

  // Slice 3 (F5): claimPending is now gated by the SAME eligibility getPendingForPerson already applies to the
  // read. A pending row the queue would not show must not be confirmable through it.
  describe('claimPending eligibility gate (Slice 3, F5)', () => {
    const opts = { maxDistance: 0.5, suggestionMaxDistance: 0.8 };

    it('S3.1: returns 0 and leaves the row pending when the asset became Locked after the row was written; 1 for an eligible control', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({
        ownerId: user.id,
        name: 'S3.1 Person',
        isHidden: false,
        type: 'person',
      });

      const { asset: controlAsset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
      const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: controlAsset.id, personId: null });
      await sut.upsertPending([{ personId: person.id, assetFaceId: controlFace.id, distance: 0.6 }]);

      const { asset: lockedAsset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
      const { assetFace: lockedFace } = await ctx.newAssetFace({ assetId: lockedAsset.id, personId: null });
      await sut.upsertPending([{ personId: person.id, assetFaceId: lockedFace.id, distance: 0.6 }]);
      // The asset moves to the Locked folder AFTER the pending row was written — the queue read would no
      // longer show it, so the claim must refuse it too.
      await defaultDatabase
        .updateTable('asset')
        .set({ visibility: AssetVisibility.Locked })
        .where('id', '=', lockedAsset.id)
        .execute();

      expect(await sut.claimPending(person.id, lockedFace.id, opts)).toBe(0);
      expect(await getRowStatus(person.id, lockedFace.id)).toBe('pending'); // row intact, not claimed

      expect(await sut.claimPending(person.id, controlFace.id, opts)).toBe(1); // positive control
    });

    describe('S3.2: table-driven ineligible mutations', () => {
      it.each([
        [
          'trashed asset',
          async (assetId: string) =>
            defaultDatabase.updateTable('asset').set({ deletedAt: new Date() }).where('id', '=', assetId).execute(),
        ],
        [
          'offline asset',
          async (assetId: string) =>
            defaultDatabase.updateTable('asset').set({ isOffline: true }).where('id', '=', assetId).execute(),
        ],
        [
          'hidden asset',
          async (assetId: string) =>
            defaultDatabase
              .updateTable('asset')
              .set({ visibility: AssetVisibility.Hidden })
              .where('id', '=', assetId)
              .execute(),
        ],
      ] as const)(
        '%s: claimPending returns 0, row stays pending; eligible control still claims',
        async (_label, mutateAsset) => {
          const { ctx, sut } = setup();
          const { user } = await ctx.newUser();
          const { person } = await ctx.newPerson({
            ownerId: user.id,
            name: `S3.2 ${_label}`,
            isHidden: false,
            type: 'person',
          });

          const { asset: controlAsset } = await ctx.newAsset({
            ownerId: user.id,
            visibility: AssetVisibility.Timeline,
          });
          const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: controlAsset.id, personId: null });
          await sut.upsertPending([{ personId: person.id, assetFaceId: controlFace.id, distance: 0.6 }]);

          const { asset: targetAsset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
          const { assetFace: targetFace } = await ctx.newAssetFace({ assetId: targetAsset.id, personId: null });
          await sut.upsertPending([{ personId: person.id, assetFaceId: targetFace.id, distance: 0.6 }]);
          await mutateAsset(targetAsset.id);

          expect(await sut.claimPending(person.id, targetFace.id, opts)).toBe(0);
          expect(await getRowStatus(person.id, targetFace.id)).toBe('pending');

          expect(await sut.claimPending(person.id, controlFace.id, opts)).toBe(1); // positive control
        },
      );

      it.each([
        [
          'af.deletedAt set',
          async (faceId: string) =>
            defaultDatabase.updateTable('asset_face').set({ deletedAt: new Date() }).where('id', '=', faceId).execute(),
        ],
        [
          'af.isVisible=false',
          async (faceId: string) =>
            defaultDatabase.updateTable('asset_face').set({ isVisible: false }).where('id', '=', faceId).execute(),
        ],
      ] as const)(
        '%s: claimPending returns 0, row stays pending; eligible control still claims',
        async (_label, mutateFace) => {
          const { ctx, sut } = setup();
          const { user } = await ctx.newUser();
          const { person } = await ctx.newPerson({
            ownerId: user.id,
            name: `S3.2 ${_label}`,
            isHidden: false,
            type: 'person',
          });
          const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });

          const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
          await sut.upsertPending([{ personId: person.id, assetFaceId: controlFace.id, distance: 0.6 }]);

          const { assetFace: targetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
          await sut.upsertPending([{ personId: person.id, assetFaceId: targetFace.id, distance: 0.6 }]);
          await mutateFace(targetFace.id);

          expect(await sut.claimPending(person.id, targetFace.id, opts)).toBe(0);
          expect(await getRowStatus(person.id, targetFace.id)).toBe('pending');

          expect(await sut.claimPending(person.id, controlFace.id, opts)).toBe(1); // positive control
        },
      );

      it('af.personId already set: claimPending returns 0, row stays pending; eligible control still claims', async () => {
        const { ctx, sut } = setup();
        const { user } = await ctx.newUser();
        const { person } = await ctx.newPerson({
          ownerId: user.id,
          name: 'S3.2 assigned',
          isHidden: false,
          type: 'person',
        });
        const { person: otherPerson } = await ctx.newPerson({
          ownerId: user.id,
          name: 'S3.2 other',
          isHidden: false,
          type: 'person',
        });
        const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });

        const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPending([{ personId: person.id, assetFaceId: controlFace.id, distance: 0.6 }]);

        const { assetFace: targetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPending([{ personId: person.id, assetFaceId: targetFace.id, distance: 0.6 }]);
        await defaultDatabase
          .updateTable('asset_face')
          .set({ personId: otherPerson.id })
          .where('id', '=', targetFace.id)
          .execute();

        expect(await sut.claimPending(person.id, targetFace.id, opts)).toBe(0);
        expect(await getRowStatus(person.id, targetFace.id)).toBe('pending');

        expect(await sut.claimPending(person.id, controlFace.id, opts)).toBe(1); // positive control
      });
    });

    it('S3.3: returns 0 when the face has acquired a manual link for another identity; 1 for an eligible control', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({
        ownerId: user.id,
        name: 'S3.3 Person',
        isHidden: false,
        type: 'person',
      });
      const { person: otherPerson } = await ctx.newPerson({
        ownerId: user.id,
        name: 'S3.3 Other',
        isHidden: false,
        type: 'person',
      });
      const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });

      const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      await sut.upsertPending([{ personId: person.id, assetFaceId: controlFace.id, distance: 0.6 }]);

      const { assetFace: targetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      await sut.upsertPending([{ personId: person.id, assetFaceId: targetFace.id, distance: 0.6 }]);

      const faceIdentityRepository = ctx.get(FaceIdentityRepository);
      const otherIdentity = await faceIdentityRepository.ensurePersonIdentity(otherPerson.id);
      await faceIdentityRepository.replaceFaceIdentity({
        assetFaceId: targetFace.id,
        identityId: otherIdentity.id,
        source: 'manual',
      });

      expect(await sut.claimPending(person.id, targetFace.id, opts)).toBe(0);
      expect(await getRowStatus(person.id, targetFace.id)).toBe('pending');

      expect(await sut.claimPending(person.id, controlFace.id, opts)).toBe(1); // positive control
    });

    describe('S3.4: negative-verdict anti-join', () => {
      it('matched by personId: returns 0 once the target itself has recorded a negative verdict for the face; 1 for an eligible control', async () => {
        // The unique (personId, assetFaceId) index means a negative verdict "for the same target" can only
        // ever be recorded on the SAME row a pending claim would target — upsertPending's own conflict guard
        // (never resurrects a resolved row) makes that row's terminal state observable here. Whichever clause
        // is doing the excluding, the contract under test holds: once the target has answered, the claim is a
        // no-op and the row is never silently reset.
        const { ctx, sut } = setup();
        const { user } = await ctx.newUser();
        const { person } = await ctx.newPerson({
          ownerId: user.id,
          name: 'S3.4a Person',
          isHidden: false,
          type: 'person',
        });
        const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });

        const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPending([{ personId: person.id, assetFaceId: controlFace.id, distance: 0.6 }]);

        const { assetFace: targetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPending([{ personId: person.id, assetFaceId: targetFace.id, distance: 0.6 }]);
        await sut.markRejected(person.id, targetFace.id);

        expect(await sut.claimPending(person.id, targetFace.id, opts)).toBe(0);
        expect(await getRowStatus(person.id, targetFace.id)).toBe('rejected');

        expect(await sut.claimPending(person.id, controlFace.id, opts)).toBe(1); // positive control
      });

      it('matched by identityId: returns 0 when a DIFFERENT person sharing the same identity already rejected the face; 1 for an eligible control', async () => {
        const { ctx, sut } = setup();
        const { user } = await ctx.newUser();
        const { person } = await ctx.newPerson({
          ownerId: user.id,
          name: 'S3.4b Person',
          isHidden: false,
          type: 'person',
        });
        const { person: otherPerson } = await ctx.newPerson({
          ownerId: user.id,
          name: 'S3.4b Other',
          isHidden: false,
          type: 'person',
        });
        const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });

        const faceIdentityRepository = ctx.get(FaceIdentityRepository);
        const identity = await faceIdentityRepository.ensurePersonIdentity(person.id);

        const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPending([{ personId: person.id, assetFaceId: controlFace.id, distance: 0.6 }]);

        const { assetFace: targetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPending([{ personId: person.id, assetFaceId: targetFace.id, distance: 0.6 }]);
        // A DIFFERENT person, sharing `person`'s identity, has already said "not this" about the face.
        await sut.markRejected(otherPerson.id, targetFace.id, { identityId: identity.id });

        expect(await sut.claimPending(person.id, targetFace.id, opts)).toBe(0);
        expect(await getRowStatus(person.id, targetFace.id)).toBe('pending'); // the row itself untouched

        expect(await sut.claimPending(person.id, controlFace.id, opts)).toBe(1); // positive control
      });
    });

    it('S3.5: returns 0 at both band boundaries (== maxDistance and > suggestionMaxDistance); 1 for a mid-band control', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({
        ownerId: user.id,
        name: 'S3.5 Person',
        isHidden: false,
        type: 'person',
      });
      const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });

      const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      await sut.upsertPending([{ personId: person.id, assetFaceId: controlFace.id, distance: 0.6 }]);

      const { assetFace: lowBoundaryFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      await sut.upsertPending([{ personId: person.id, assetFaceId: lowBoundaryFace.id, distance: opts.maxDistance }]);

      const { assetFace: aboveUpperFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      await sut.upsertPending([{ personId: person.id, assetFaceId: aboveUpperFace.id, distance: 0.9 }]);

      expect(await sut.claimPending(person.id, lowBoundaryFace.id, opts)).toBe(0);
      expect(await getRowStatus(person.id, lowBoundaryFace.id)).toBe('pending');

      expect(await sut.claimPending(person.id, aboveUpperFace.id, opts)).toBe(0);
      expect(await getRowStatus(person.id, aboveUpperFace.id)).toBe('pending');

      expect(await sut.claimPending(person.id, controlFace.id, opts)).toBe(1); // positive control
    });

    it('S3.11: honours a passed transaction — a rollback leaves the row untouched', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({
        ownerId: user.id,
        name: 'S3.11 Person',
        isHidden: false,
        type: 'person',
      });
      const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });

      await sut.upsertPending([{ personId: person.id, assetFaceId: assetFace.id, distance: 0.6 }]);

      await expect(
        defaultDatabase.transaction().execute(async (trx) => {
          const claimed = await sut.claimPending(person.id, assetFace.id, opts, trx);
          expect(claimed).toBe(1);
          throw new Error('force rollback');
        }),
      ).rejects.toThrow('force rollback');

      const row = await getRow(person.id, assetFace.id);
      expect(row.status).toBe('pending'); // rolled back — the claim never committed
    });
  });

  // The set-at-a-time form the cleanup console's "keep here" bucket uses. It replaced a per-face loop once the
  // resolve DTO's ceiling rose to 25 000 faces, so what has to hold is that batching changed only the number of
  // round-trips — never the per-row semantics the loop had.
  describe('markRejectedMany', () => {
    it('writes one rejected row per pair and matches what the per-face path would have written', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { user: admin } = await ctx.newUser();
      const { person: p1 } = await ctx.newPerson({ ownerId: user.id, name: 'Bulk P1' });
      const { person: p2 } = await ctx.newPerson({ ownerId: user.id, name: 'Bulk P2' });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace: fA } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { assetFace: fB } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const identity = await ctx.get(FaceIdentityRepository).ensurePersonIdentity(p1.id);

      const written = await sut.markRejectedMany(
        [
          { personId: p1.id, assetFaceId: fA.id, identityId: identity.id },
          { personId: p2.id, assetFaceId: fB.id },
        ],
        { source: 'cleanup', actorId: admin.id },
      );

      expect(written).toBe(2);
      expect(await getRow(p1.id, fA.id)).toMatchObject({
        identityId: identity.id,
        status: 'rejected',
        source: 'cleanup',
        actorId: admin.id,
      });
      expect(await getRow(p2.id, fB.id)).toMatchObject({ identityId: null, status: 'rejected', source: 'cleanup' });
    });

    // Postgres refuses an ON CONFLICT DO UPDATE that touches the same row twice in one statement. The per-face
    // loop absorbed a repeated face silently (two upserts), so the batch must too — otherwise a client that
    // sends a face twice turns a working resolve into a 500.
    it('tolerates a repeated (person, face) pair instead of failing the whole statement', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Bulk Dup' });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });

      const written = await sut.markRejectedMany(
        [
          { personId: person.id, assetFaceId: assetFace.id },
          { personId: person.id, assetFaceId: assetFace.id },
        ],
        { source: 'cleanup' },
      );

      expect(written).toBe(1);
      expect(await getRow(person.id, assetFace.id)).toMatchObject({ status: 'rejected' });
    });

    it('upserts over a pending row and preserves a stronger existing identityId (D10)', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Bulk Coalesce' });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const identity = await ctx.get(FaceIdentityRepository).ensurePersonIdentity(person.id);

      await sut.upsertPending([{ personId: person.id, assetFaceId: assetFace.id, distance: 0.6 }]);
      await sut.markRejectedMany([{ personId: person.id, assetFaceId: assetFace.id, identityId: identity.id }], {
        source: 'cleanup',
      });
      // A later batch WITHOUT an identity must not null the stronger existing key.
      await sut.markRejectedMany([{ personId: person.id, assetFaceId: assetFace.id }], { source: 'cleanup' });

      const rows = await defaultDatabase
        .selectFrom('face_person_verdict')
        .selectAll()
        .where('personId', '=', person.id)
        .where('assetFaceId', '=', assetFace.id)
        .execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'rejected', identityId: identity.id });
    });

    it('is a no-op on an empty bucket', async () => {
      const { sut } = setup();
      expect(await sut.markRejectedMany([], { source: 'cleanup' })).toBe(0);
    });

    // The chunking guard: past 1000 rows this must span multiple statements and still write every row. A cluster
    // this size is exactly the case the DTO ceiling was raised for.
    it('writes every row when the bucket spans more than one chunk', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Bulk Chunked' });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const faces: string[] = [];
      for (let index = 0; index < 1200; index++) {
        const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        faces.push(assetFace.id);
      }

      const written = await sut.markRejectedMany(
        faces.map((assetFaceId) => ({ personId: person.id, assetFaceId })),
        { source: 'cleanup' },
      );

      expect(written).toBe(1200);
      expect(await countRows(faces[0], 'rejected')).toBe(1);
      expect(await countRows(faces.at(-1)!, 'rejected')).toBe(1);
    });
  });

  describe('drainPendingForFaces', () => {
    it('deletes pending rows for the given faces across all targets, keeps verdicts, ignores other faces', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace: fA } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { assetFace: fB } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { person: p1 } = await ctx.newPerson({ ownerId: user.id, name: 'P1' });
      const { person: p2 } = await ctx.newPerson({ ownerId: user.id, name: 'P2' });

      await sut.upsertPending([
        { personId: p1.id, assetFaceId: fA.id, distance: 0.6 },
        { personId: p2.id, assetFaceId: fA.id, distance: 0.62 },
        { personId: p1.id, assetFaceId: fB.id, distance: 0.63 },
      ]);
      // A durable negative verdict on fA must survive the drain.
      await sut.markRejected(p2.id, fA.id, { source: 'cleanup' });

      const drained = await sut.drainPendingForFaces([fA.id]);
      expect(drained).toBe(1); // only p1's still-pending fA row (p2's fA row is now 'rejected')

      const rows = await defaultDatabase
        .selectFrom('face_person_verdict')
        .select(['assetFaceId', 'personId', 'status'])
        .orderBy('status')
        .execute();
      // fA keeps its rejected verdict; fB's pending row is untouched.
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ assetFaceId: fA.id, personId: p2.id, status: 'rejected' }),
          expect.objectContaining({ assetFaceId: fB.id, personId: p1.id, status: 'pending' }),
        ]),
      );
      expect(rows.filter((r) => r.assetFaceId === fA.id && r.status === 'pending')).toEqual([]);
    });

    it('is a no-op for an empty list', async () => {
      const { sut } = setup();
      expect(await sut.drainPendingForFaces([])).toBe(0);
    });
  });

  describe('resolveAssignedFace', () => {
    let faceXId: string;

    beforeAll(async () => {
      const { ctx } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      faceXId = assetFace.id;

      const { person: p1 } = await ctx.newPerson({ ownerId: user.id, name: 'Person One', isHidden: false });
      const { person: p2 } = await ctx.newPerson({ ownerId: user.id, name: 'Person Two', isHidden: false });
      const { person: p3 } = await ctx.newPerson({ ownerId: user.id, name: 'Rejected Person', isHidden: false });
      const { person: p4 } = await ctx.newPerson({ ownerId: user.id, name: 'Ignored Person', isHidden: false });
      const { person: p5 } = await ctx.newPerson({ ownerId: user.id, name: 'Confirmed Person', isHidden: false });
      const p1Id = p1.id;
      const p2Id = p2.id;

      const { sut } = setup();

      // faceX pending for P1 (distance 0.6) and P2 (distance 0.65)
      await sut.upsertPending([{ personId: p1Id, assetFaceId: faceXId, distance: 0.6 }]);
      await sut.upsertPending([{ personId: p2Id, assetFaceId: faceXId, distance: 0.65 }]);

      // faceX rejected for P3 — insert pending then set rejected via raw updateTable
      await sut.upsertPending([{ personId: p3.id, assetFaceId: faceXId, distance: 0.7 }]);
      await defaultDatabase
        .updateTable('face_person_verdict')
        .set({ status: 'rejected' })
        .where('personId', '=', p3.id)
        .where('assetFaceId', '=', faceXId)
        .execute();

      // faceX ignored for P4 — insert pending then set ignored via raw updateTable
      await sut.upsertPending([{ personId: p4.id, assetFaceId: faceXId, distance: 0.75 }]);
      await defaultDatabase
        .updateTable('face_person_verdict')
        .set({ status: 'ignored' })
        .where('personId', '=', p4.id)
        .where('assetFaceId', '=', faceXId)
        .execute();

      // faceX rejected for P5 by the CLEANUP console (no pending row ever existed for it)
      await sut.markRejected(p5.id, faceXId, { source: 'cleanup' });

      // Now resolve: deletes pending rows for faceX, leaves every negative verdict alone
      await sut.resolveAssignedFace(faceXId);
    });

    it('deletes all pending rows for that face across all persons', async () => {
      expect(await countRows(faceXId, 'pending')).toBe(0);
    });

    it('preserves every negative verdict for that face, from either engine', async () => {
      // P3 suggestion-rejected, P5 cleanup-rejected — both durable.
      expect(await countRows(faceXId, 'rejected')).toBe(2);
      expect(await countRows(faceXId, 'ignored')).toBe(1);
    });
  });

  describe("edge 12 — confirming for one person resolves the other person's pending row", () => {
    let p1Id: string;
    let p2Id: string;
    let assetFaceId: string;

    beforeAll(async () => {
      const { ctx } = setup();
      const { user } = await ctx.newUser();
      const { person: person1 } = await ctx.newPerson({ ownerId: user.id, name: 'Edge12 Person1', isHidden: false });
      const { person: person2 } = await ctx.newPerson({ ownerId: user.id, name: 'Edge12 Person2', isHidden: false });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      p1Id = person1.id;
      p2Id = person2.id;
      assetFaceId = assetFace.id;
    });

    beforeEach(async () => {
      await defaultDatabase.deleteFrom('face_person_verdict').where('assetFaceId', '=', assetFaceId).execute();
    });

    afterEach(async () => {
      await defaultDatabase.deleteFrom('face_person_verdict').where('assetFaceId', '=', assetFaceId).execute();
    });

    it("drains the confirmed person's queue row and the sibling person's pending row for the same face", async () => {
      const { sut } = setup();
      // Seed pending rows for BOTH persons pointing at the same assetFaceId
      await sut.upsertPending([
        { personId: p1Id, assetFaceId, distance: 0.6 },
        { personId: p2Id, assetFaceId, distance: 0.65 },
      ]);

      // Confirm flow order: claimPending BEFORE resolveAssignedFace
      expect(await sut.claimPending(p1Id, assetFaceId, { maxDistance: 0.5, suggestionMaxDistance: 0.8 })).toBe(1);
      await sut.resolveAssignedFace(assetFaceId); // pending-only delete across ALL persons

      // No row survives for the confirming person: the positive verdict lives in the face's manual
      // identity link, not here.
      expect(await getRowOrUndefined(p1Id, assetFaceId)).toBeUndefined();
      const p2Rows = await defaultDatabase
        .selectFrom('face_person_verdict')
        .selectAll()
        .where('personId', '=', p2Id)
        .where('assetFaceId', '=', assetFaceId)
        .execute();
      expect(p2Rows).toEqual([]); // sibling pending row deleted
    });
  });

  describe('edge 8 — merge cannot strand a cross-person pending row', () => {
    let p1Id: string;
    let assetFaceId: string;

    beforeAll(async () => {
      const { ctx } = setup();
      const { user } = await ctx.newUser();
      const { person: person1 } = await ctx.newPerson({ ownerId: user.id, name: 'Edge8 Person1', isHidden: false });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      p1Id = person1.id;
      assetFaceId = assetFace.id;
    });

    afterEach(async () => {
      // Restore face to unassigned after each test
      await defaultDatabase.updateTable('asset_face').set({ personId: null }).where('id', '=', assetFaceId).execute();
      await defaultDatabase.deleteFrom('face_person_verdict').where('assetFaceId', '=', assetFaceId).execute();
    });

    it('half 1: assigning the face makes getPendingForPerson exclude it (pending row references unassigned face only)', async () => {
      const { sut } = setup();
      await sut.upsertPending([{ personId: p1Id, assetFaceId, distance: 0.6 }]);
      // Simulate: face assigned to someone (like what a merge does to its faces)
      await defaultDatabase.updateTable('asset_face').set({ personId: p1Id }).where('id', '=', assetFaceId).execute();

      const res = await sut.getPendingForPerson(p1Id, {
        maxDistance: 0.5,
        suggestionMaxDistance: 0.8,
        page: 1,
        size: 10,
      });
      expect(res.items.find((i) => i.assetFaceId === assetFaceId)).toBeUndefined();
    });

    it('half 2: removing the candidate person (what removeAllPeople does in a merge) SET NULLs the row — it survives, degraded, not deleted', async () => {
      const { ctx } = setup();
      // Create a fresh person specifically for this test so we can delete it
      const { user } = await ctx.newUser();
      const { person: tempPerson } = await ctx.newPerson({
        ownerId: user.id,
        name: 'Edge8 Temp Person',
        isHidden: false,
      });
      const tempPersonId = tempPerson.id;

      const { sut } = setup();
      await sut.upsertPending([{ personId: tempPersonId, assetFaceId, distance: 0.6 }]);
      const before = await getRow(tempPersonId, assetFaceId);
      expect(before).toBeTruthy();

      // mergePerson → removeAllPeople([mergedAwayPerson]) deletes the person row
      await defaultDatabase.deleteFrom('person').where('id', '=', tempPersonId).execute();

      // personId is ON DELETE SET NULL (post-Slice-1 semantics), not CASCADE: the row survives the person
      // delete with personId nulled out. Querying by the row's own id — not by personId, which is now null —
      // so this assertion can't vacuously pass the way `WHERE personId = tempPersonId` would (that predicate
      // returns no rows whether the row was SET NULL or actually deleted).
      const survivor = await defaultDatabase
        .selectFrom('face_person_verdict')
        .selectAll()
        .where('id', '=', before.id)
        .executeTakeFirst();
      expect(survivor).toBeDefined();
      expect(survivor!.personId).toBeNull();
    });
  });

  describe('space-person suggestion methods', () => {
    it.each([
      ['markRejectedForSpacePerson', 'rejected'],
      ['markIgnoredForSpacePerson', 'ignored'],
    ] as const)('upserts pending rows by spacePersonId and never resurrects %s rows', async (method, status) => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: user.id });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const spacePerson = await ctx.database
        .insertInto('shared_space_person')
        .values({ spaceId: space.id, name: 'Alice' })
        .returningAll()
        .executeTakeFirstOrThrow();

      await sut.upsertPendingForSpacePerson([
        { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.7 },
      ]);
      expect(await sut[method](spacePerson.id, assetFace.id)).toBe(1);
      await sut.upsertPendingForSpacePerson([
        { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.6 },
      ]);

      const row = await getSpaceRow(spacePerson.id, assetFace.id);
      expect(row.status).toBe(status);
      expect(row.distance).toBe(0.7);
    });

    it('claimPendingForSpacePerson removes the queue row once', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: user.id });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const spacePerson = await ctx.database
        .insertInto('shared_space_person')
        .values({ spaceId: space.id, name: 'Alice' })
        .returningAll()
        .executeTakeFirstOrThrow();

      await sut.upsertPendingForSpacePerson([
        { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.7 },
      ]);

      const opts = { maxDistance: 0.5, suggestionMaxDistance: 0.8 };
      expect(await sut.claimPendingForSpacePerson(spacePerson.id, assetFace.id, opts)).toBe(1);
      expect(await sut.claimPendingForSpacePerson(spacePerson.id, assetFace.id, opts)).toBe(0);

      const row = await defaultDatabase
        .selectFrom('face_person_verdict')
        .selectAll()
        .where('spacePersonId', '=', spacePerson.id)
        .where('assetFaceId', '=', assetFace.id)
        .executeTakeFirst();
      expect(row).toBeUndefined();
    });

    // S3.6: claimPendingForSpacePerson mirrors S3.1-S3.5 — the same eligibility gate the personal claim now
    // applies, keyed by spacePersonId instead of personId.
    describe('claimPendingForSpacePerson eligibility gate (Slice 3, F5/F6)', () => {
      const opts = { maxDistance: 0.5, suggestionMaxDistance: 0.8 };

      it('S3.1/S3.2 mirror: returns 0 and leaves the row pending for a Locked, trashed, offline or hidden asset; 1 for an eligible control', async () => {
        const { ctx, sut } = setup();
        const { user, space, spacePerson } = await makeSpaceFixture(ctx);

        const { asset: controlAsset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
        await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: controlAsset.id, addedById: user.id });
        const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: controlAsset.id, personId: null });
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: controlFace.id, distance: 0.6 },
        ]);

        const mutations: Array<[string, () => Promise<unknown>]> = [
          [
            'locked',
            async () => {
              const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
              await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
              const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
              await sut.upsertPendingForSpacePerson([
                { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.6 },
              ]);
              await defaultDatabase
                .updateTable('asset')
                .set({ visibility: AssetVisibility.Locked })
                .where('id', '=', asset.id)
                .execute();
              expect(await sut.claimPendingForSpacePerson(spacePerson.id, assetFace.id, opts)).toBe(0);
              expect(await getSpaceRowStatus(spacePerson.id, assetFace.id)).toBe('pending');
            },
          ],
          [
            'trashed',
            async () => {
              const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
              await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
              const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
              await sut.upsertPendingForSpacePerson([
                { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.6 },
              ]);
              await defaultDatabase
                .updateTable('asset')
                .set({ deletedAt: new Date() })
                .where('id', '=', asset.id)
                .execute();
              expect(await sut.claimPendingForSpacePerson(spacePerson.id, assetFace.id, opts)).toBe(0);
              expect(await getSpaceRowStatus(spacePerson.id, assetFace.id)).toBe('pending');
            },
          ],
          [
            'offline',
            async () => {
              const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
              await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
              const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
              await sut.upsertPendingForSpacePerson([
                { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.6 },
              ]);
              await defaultDatabase.updateTable('asset').set({ isOffline: true }).where('id', '=', asset.id).execute();
              expect(await sut.claimPendingForSpacePerson(spacePerson.id, assetFace.id, opts)).toBe(0);
              expect(await getSpaceRowStatus(spacePerson.id, assetFace.id)).toBe('pending');
            },
          ],
          [
            'hidden',
            async () => {
              const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
              await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
              const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
              await sut.upsertPendingForSpacePerson([
                { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.6 },
              ]);
              await defaultDatabase
                .updateTable('asset')
                .set({ visibility: AssetVisibility.Hidden })
                .where('id', '=', asset.id)
                .execute();
              expect(await sut.claimPendingForSpacePerson(spacePerson.id, assetFace.id, opts)).toBe(0);
              expect(await getSpaceRowStatus(spacePerson.id, assetFace.id)).toBe('pending');
            },
          ],
        ];
        for (const [, run] of mutations) {
          await run();
        }

        expect(await sut.claimPendingForSpacePerson(spacePerson.id, controlFace.id, opts)).toBe(1); // positive control
      });

      it('S3.3 mirror: returns 0 when the face has acquired a manual link for another identity; 1 for an eligible control', async () => {
        const { ctx, sut } = setup();
        const { user, space, spacePerson } = await makeSpaceFixture(ctx);
        const { person: otherPerson } = await ctx.newPerson({ ownerId: user.id, name: 'S3.6c Other' });
        const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
        await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });

        const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: controlFace.id, distance: 0.6 },
        ]);

        const { assetFace: targetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: targetFace.id, distance: 0.6 },
        ]);
        const faceIdentityRepository = ctx.get(FaceIdentityRepository);
        const otherIdentity = await faceIdentityRepository.ensurePersonIdentity(otherPerson.id);
        await faceIdentityRepository.replaceFaceIdentity({
          assetFaceId: targetFace.id,
          identityId: otherIdentity.id,
          source: 'manual',
        });

        expect(await sut.claimPendingForSpacePerson(spacePerson.id, targetFace.id, opts)).toBe(0);
        expect(await getSpaceRowStatus(spacePerson.id, targetFace.id)).toBe('pending');

        expect(await sut.claimPendingForSpacePerson(spacePerson.id, controlFace.id, opts)).toBe(1); // positive control
      });

      it('S3.4 mirror: returns 0 when a different space person sharing the same identity already rejected the face; 1 for an eligible control', async () => {
        const { ctx, sut } = setup();
        const { user, space, spacePerson } = await makeSpaceFixture(ctx);
        const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
        await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });

        const faceIdentityRepository = ctx.get(FaceIdentityRepository);
        const identity = await faceIdentityRepository.ensureSpacePersonIdentity(spacePerson.id);
        const otherSpacePerson = await ctx.database
          .insertInto('shared_space_person')
          .values({ spaceId: space.id, name: 'Bob' })
          .returningAll()
          .executeTakeFirstOrThrow();

        const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: controlFace.id, distance: 0.6 },
        ]);

        const { assetFace: targetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: targetFace.id, distance: 0.6 },
        ]);
        await sut.markRejectedForSpacePerson(otherSpacePerson.id, targetFace.id, { identityId: identity.id });

        expect(await sut.claimPendingForSpacePerson(spacePerson.id, targetFace.id, opts)).toBe(0);
        expect(await getSpaceRowStatus(spacePerson.id, targetFace.id)).toBe('pending');

        expect(await sut.claimPendingForSpacePerson(spacePerson.id, controlFace.id, opts)).toBe(1); // positive control
      });

      it('S3.5 mirror: returns 0 at both band boundaries; 1 for a mid-band control', async () => {
        const { ctx, sut } = setup();
        const { user, space, spacePerson } = await makeSpaceFixture(ctx);
        const { asset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Timeline });
        await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });

        const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: controlFace.id, distance: 0.6 },
        ]);

        const { assetFace: lowBoundaryFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: lowBoundaryFace.id, distance: opts.maxDistance },
        ]);

        const { assetFace: aboveUpperFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: aboveUpperFace.id, distance: 0.9 },
        ]);

        expect(await sut.claimPendingForSpacePerson(spacePerson.id, lowBoundaryFace.id, opts)).toBe(0);
        expect(await sut.claimPendingForSpacePerson(spacePerson.id, aboveUpperFace.id, opts)).toBe(0);
        expect(await sut.claimPendingForSpacePerson(spacePerson.id, controlFace.id, opts)).toBe(1); // positive control
      });
    });

    it.each([
      ['markRejectedForSpacePerson', 'rejected'],
      ['markIgnoredForSpacePerson', 'ignored'],
    ] as const)('%s records %s and drains the queue row', async (method, status) => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: user.id });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const spacePerson = await ctx.database
        .insertInto('shared_space_person')
        .values({ spaceId: space.id, name: 'Alice' })
        .returningAll()
        .executeTakeFirstOrThrow();

      await sut.upsertPendingForSpacePerson([
        { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.7 },
      ]);

      expect(await sut[method](spacePerson.id, assetFace.id)).toBe(1);
      // The row is no longer pending, so a confirm arriving afterwards has nothing to claim.
      expect(
        await sut.claimPendingForSpacePerson(spacePerson.id, assetFace.id, {
          maxDistance: 0.5,
          suggestionMaxDistance: 0.8,
        }),
      ).toBe(0);

      const row = await getSpaceRow(spacePerson.id, assetFace.id);
      expect(row.status).toBe(status);
    });

    it('space-person reject and ignore racing for the same row leave exactly one row', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: user.id });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const spacePerson = await ctx.database
        .insertInto('shared_space_person')
        .values({ spaceId: space.id, name: 'Alice' })
        .returningAll()
        .executeTakeFirstOrThrow();

      await sut.upsertPendingForSpacePerson([
        { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.7 },
      ]);

      await Promise.all([
        sut.markRejectedForSpacePerson(spacePerson.id, assetFace.id),
        sut.markIgnoredForSpacePerson(spacePerson.id, assetFace.id),
      ]);

      // The partial unique index on (spacePersonId, assetFaceId) is what makes the race safe: whichever
      // write lands second upserts onto the same row rather than creating a duplicate verdict.
      const rows = await defaultDatabase
        .selectFrom('face_person_verdict')
        .selectAll()
        .where('spacePersonId', '=', spacePerson.id)
        .where('assetFaceId', '=', assetFace.id)
        .execute();
      expect(rows).toHaveLength(1);
      expect(['rejected', 'ignored']).toContain(rows[0].status);
    });

    it.each([
      ['markRejectedForSpacePerson', 'rejected'],
      ['markIgnoredForSpacePerson', 'ignored'],
    ] as const)('%s resolves only the target row and leaves sibling suggestions pending', async (method, status) => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: user.id });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const [spacePerson, siblingSpacePerson] = await ctx.database
        .insertInto('shared_space_person')
        .values([
          { spaceId: space.id, name: 'Alice' },
          { spaceId: space.id, name: 'Bob' },
        ])
        .returningAll()
        .execute();

      await sut.upsertPendingForSpacePerson([
        { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.7 },
        { spacePersonId: siblingSpacePerson.id, assetFaceId: assetFace.id, distance: 0.75 },
      ]);

      expect(await sut[method](spacePerson.id, assetFace.id)).toBe(1);

      const target = await getSpaceRow(spacePerson.id, assetFace.id);
      const sibling = await getSpaceRow(siblingSpacePerson.id, assetFace.id);
      expect(target.status).toBe(status);
      expect(sibling.status).toBe('pending');
    });

    it('getPendingForSpacePerson filters unshared stale rows at read time', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
      const { asset: keptAsset } = await ctx.newAsset({ ownerId: user.id });
      const { asset: unsharedAsset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: keptAsset.id, addedById: user.id });
      const { assetFace: keptFace } = await ctx.newAssetFace({ assetId: keptAsset.id, personId: null });
      const { assetFace: staleFace } = await ctx.newAssetFace({ assetId: unsharedAsset.id, personId: null });
      const spacePerson = await ctx.database
        .insertInto('shared_space_person')
        .values({ spaceId: space.id, name: 'Alice', type: 'person', isHidden: false })
        .returningAll()
        .executeTakeFirstOrThrow();
      await sut.upsertPendingForSpacePerson([
        { spacePersonId: spacePerson.id, assetFaceId: keptFace.id, distance: 0.6 },
        { spacePersonId: spacePerson.id, assetFaceId: staleFace.id, distance: 0.7 },
      ]);

      const result = await sut.getPendingForSpacePerson(space.id, spacePerson.id, {
        maxDistance: 0.5,
        suggestionMaxDistance: 0.8,
        page: 1,
        size: 10,
      });

      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.assetFaceId)).toEqual([keptFace.id]);
    });

    it('getPendingForSpacePerson includes linked-library rows and excludes ineligible asset and face rows', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
      const { library } = await ctx.newLibrary({ ownerId: user.id });
      await ctx.newSharedSpaceLibrary({ spaceId: space.id, libraryId: library.id, addedById: user.id });
      const { asset } = await ctx.newAsset({ ownerId: user.id, libraryId: library.id });
      const { asset: hiddenAsset } = await ctx.newAsset({
        ownerId: user.id,
        libraryId: library.id,
        visibility: AssetVisibility.Hidden,
      });
      const { asset: lockedAsset } = await ctx.newAsset({
        ownerId: user.id,
        libraryId: library.id,
        visibility: AssetVisibility.Locked,
      });
      const { asset: offlineAsset } = await ctx.newAsset({ ownerId: user.id, libraryId: library.id, isOffline: true });
      const { assetFace: includedFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { assetFace: assignedFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { assetFace: deletedFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { assetFace: invisibleFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { assetFace: outOfBandFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const { assetFace: hiddenAssetFace } = await ctx.newAssetFace({ assetId: hiddenAsset.id, personId: null });
      const { assetFace: lockedAssetFace } = await ctx.newAssetFace({ assetId: lockedAsset.id, personId: null });
      const { assetFace: offlineAssetFace } = await ctx.newAssetFace({ assetId: offlineAsset.id, personId: null });
      const { person } = await ctx.newPerson({ ownerId: user.id });
      await ctx.database
        .updateTable('asset_face')
        .set({ personId: person.id })
        .where('id', '=', assignedFace.id)
        .execute();
      await ctx.database
        .updateTable('asset_face')
        .set({ deletedAt: new Date() })
        .where('id', '=', deletedFace.id)
        .execute();
      await ctx.database
        .updateTable('asset_face')
        .set({ isVisible: false })
        .where('id', '=', invisibleFace.id)
        .execute();
      const spacePerson = await ctx.database
        .insertInto('shared_space_person')
        .values({ spaceId: space.id, name: 'Alice', type: 'person', isHidden: false })
        .returningAll()
        .executeTakeFirstOrThrow();
      await sut.upsertPendingForSpacePerson([
        { spacePersonId: spacePerson.id, assetFaceId: includedFace.id, distance: 0.6 },
        { spacePersonId: spacePerson.id, assetFaceId: assignedFace.id, distance: 0.61 },
        { spacePersonId: spacePerson.id, assetFaceId: deletedFace.id, distance: 0.62 },
        { spacePersonId: spacePerson.id, assetFaceId: invisibleFace.id, distance: 0.63 },
        { spacePersonId: spacePerson.id, assetFaceId: outOfBandFace.id, distance: 0.9 },
        { spacePersonId: spacePerson.id, assetFaceId: hiddenAssetFace.id, distance: 0.64 },
        { spacePersonId: spacePerson.id, assetFaceId: lockedAssetFace.id, distance: 0.65 },
        { spacePersonId: spacePerson.id, assetFaceId: offlineAssetFace.id, distance: 0.66 },
      ]);

      const result = await sut.getPendingForSpacePerson(space.id, spacePerson.id, {
        maxDistance: 0.5,
        suggestionMaxDistance: 0.8,
        page: 1,
        size: 10,
      });

      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.assetFaceId)).toEqual([includedFace.id]);
    });

    it('getPendingForSpacePerson returns empty for whitespace name, hidden person, pet person, disabled space, and disabled band', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
      const { space: disabledSpace } = await ctx.newSharedSpace({
        createdById: user.id,
        faceRecognitionEnabled: false,
      });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const rows = await ctx.database
        .insertInto('shared_space_person')
        .values([
          { spaceId: space.id, name: 'Valid', type: 'person', isHidden: false },
          { spaceId: space.id, name: '   ', type: 'person', isHidden: false },
          { spaceId: space.id, name: 'Hidden', type: 'person', isHidden: true },
          { spaceId: space.id, name: 'Pet', type: 'pet', isHidden: false },
          { spaceId: disabledSpace.id, name: 'Disabled', type: 'person', isHidden: false },
        ])
        .returningAll()
        .execute();

      for (const person of rows.slice(1)) {
        await sut.upsertPendingForSpacePerson([{ spacePersonId: person.id, assetFaceId: assetFace.id, distance: 0.6 }]);
        await expect(
          sut.getPendingForSpacePerson(person.spaceId, person.id, {
            maxDistance: 0.5,
            suggestionMaxDistance: 0.8,
            page: 1,
            size: 10,
          }),
        ).resolves.toEqual({ total: 0, items: [] });
      }

      await sut.upsertPendingForSpacePerson([{ spacePersonId: rows[0].id, assetFaceId: assetFace.id, distance: 0.6 }]);
      await expect(
        sut.getPendingForSpacePerson(space.id, rows[0].id, {
          maxDistance: 0.5,
          suggestionMaxDistance: 0.5,
          page: 1,
          size: 10,
        }),
      ).resolves.toEqual({ total: 0, items: [] });
    });

    describe('hasPendingForSpacePerson', () => {
      const opts = { maxDistance: 0.5, suggestionMaxDistance: 0.8 };

      it('returns true for an in-band pending suggestion on a directly shared asset', async () => {
        const { ctx, sut } = setup();
        const { user } = await ctx.newUser();
        const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
        const { asset } = await ctx.newAsset({ ownerId: user.id });
        await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
        const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        const spacePerson = await ctx.database
          .insertInto('shared_space_person')
          .values({ spaceId: space.id, name: 'Alice', type: 'person', isHidden: false })
          .returningAll()
          .executeTakeFirstOrThrow();
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.6 },
        ]);

        await expect(sut.hasPendingForSpacePerson(space.id, spacePerson.id, assetFace.id, opts)).resolves.toBe(true);
      });

      it('returns false when the suggestion band is disabled', async () => {
        const { ctx, sut } = setup();
        const { user } = await ctx.newUser();
        const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
        const { asset } = await ctx.newAsset({ ownerId: user.id });
        await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
        const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        const spacePerson = await ctx.database
          .insertInto('shared_space_person')
          .values({ spaceId: space.id, name: 'Alice', type: 'person', isHidden: false })
          .returningAll()
          .executeTakeFirstOrThrow();
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.6 },
        ]);

        await expect(
          sut.hasPendingForSpacePerson(space.id, spacePerson.id, assetFace.id, {
            maxDistance: 0.5,
            suggestionMaxDistance: 0.5,
          }),
        ).resolves.toBe(false);
      });

      it('returns false for a pending suggestion on an asset no longer shared with the space', async () => {
        const { ctx, sut } = setup();
        const { user } = await ctx.newUser();
        const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
        const { asset } = await ctx.newAsset({ ownerId: user.id });
        await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
        const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        const spacePerson = await ctx.database
          .insertInto('shared_space_person')
          .values({ spaceId: space.id, name: 'Alice', type: 'person', isHidden: false })
          .returningAll()
          .executeTakeFirstOrThrow();
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.6 },
        ]);

        await expect(sut.hasPendingForSpacePerson(space.id, spacePerson.id, assetFace.id, opts)).resolves.toBe(true);

        await ctx.database
          .deleteFrom('shared_space_asset')
          .where('spaceId', '=', space.id)
          .where('assetId', '=', asset.id)
          .execute();

        await expect(sut.hasPendingForSpacePerson(space.id, spacePerson.id, assetFace.id, opts)).resolves.toBe(false);
      });

      it('returns false when the candidate face has already been assigned', async () => {
        const { ctx, sut } = setup();
        const { user } = await ctx.newUser();
        const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Personal' });
        const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
        const { asset } = await ctx.newAsset({ ownerId: user.id });
        await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
        const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        const spacePerson = await ctx.database
          .insertInto('shared_space_person')
          .values({ spaceId: space.id, name: 'Alice', type: 'person', isHidden: false })
          .returningAll()
          .executeTakeFirstOrThrow();
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.6 },
        ]);
        await ctx.database
          .updateTable('asset_face')
          .set({ personId: person.id })
          .where('id', '=', assetFace.id)
          .execute();

        await expect(sut.hasPendingForSpacePerson(space.id, spacePerson.id, assetFace.id, opts)).resolves.toBe(false);
      });

      it('returns false for whitespace, hidden, pet, and disabled-space people', async () => {
        const { ctx, sut } = setup();
        const { user } = await ctx.newUser();
        const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
        const { space: disabledSpace } = await ctx.newSharedSpace({
          createdById: user.id,
          faceRecognitionEnabled: false,
        });
        const { asset } = await ctx.newAsset({ ownerId: user.id });
        await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
        await ctx.newSharedSpaceAsset({ spaceId: disabledSpace.id, assetId: asset.id, addedById: user.id });
        const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        const rows = await ctx.database
          .insertInto('shared_space_person')
          .values([
            { spaceId: space.id, name: '   ', type: 'person', isHidden: false },
            { spaceId: space.id, name: 'Hidden', type: 'person', isHidden: true },
            { spaceId: space.id, name: 'Pet', type: 'pet', isHidden: false },
            { spaceId: disabledSpace.id, name: 'Disabled', type: 'person', isHidden: false },
          ])
          .returningAll()
          .execute();

        for (const person of rows) {
          await sut.upsertPendingForSpacePerson([
            { spacePersonId: person.id, assetFaceId: assetFace.id, distance: 0.6 },
          ]);
          await expect(sut.hasPendingForSpacePerson(person.spaceId, person.id, assetFace.id, opts)).resolves.toBe(
            false,
          );
        }
      });

      it('returns false after a linked library is unlinked from the space', async () => {
        const { ctx, sut } = setup();
        const { user } = await ctx.newUser();
        const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
        const { library } = await ctx.newLibrary({ ownerId: user.id });
        await ctx.newSharedSpaceLibrary({ spaceId: space.id, libraryId: library.id, addedById: user.id });
        const { asset } = await ctx.newAsset({ ownerId: user.id, libraryId: library.id });
        const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        const spacePerson = await ctx.database
          .insertInto('shared_space_person')
          .values({ spaceId: space.id, name: 'Alice', type: 'person', isHidden: false })
          .returningAll()
          .executeTakeFirstOrThrow();
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.6 },
        ]);

        await expect(sut.hasPendingForSpacePerson(space.id, spacePerson.id, assetFace.id, opts)).resolves.toBe(true);

        await ctx.database
          .deleteFrom('shared_space_library')
          .where('spaceId', '=', space.id)
          .where('libraryId', '=', library.id)
          .execute();

        await expect(sut.hasPendingForSpacePerson(space.id, spacePerson.id, assetFace.id, opts)).resolves.toBe(false);
      });

      // S3.7 (F6): hasPendingForSpacePerson reproduces the display gates its read twin applies but historically
      // OMITTED the two anti-joins (manual-link, negative-verdict) — this closes that gap.
      it('S3.7: returns false for a face carrying a manual link, and for one carrying a negative verdict for the space person identity; true for the control', async () => {
        const { ctx, sut } = setup();
        const { user } = await ctx.newUser();
        const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
        const { asset } = await ctx.newAsset({ ownerId: user.id });
        await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
        const spacePerson = await ctx.database
          .insertInto('shared_space_person')
          .values({ spaceId: space.id, name: 'Alice', type: 'person', isHidden: false })
          .returningAll()
          .executeTakeFirstOrThrow();

        const faceIdentityRepository = ctx.get(FaceIdentityRepository);
        const identity = await faceIdentityRepository.ensureSpacePersonIdentity(spacePerson.id);

        const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: controlFace.id, distance: 0.6 },
        ]);

        const { assetFace: manualLinkFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: manualLinkFace.id, distance: 0.6 },
        ]);
        const { person: otherPerson } = await ctx.newPerson({ ownerId: user.id, name: 'S3.7 Other' });
        const otherIdentity = await faceIdentityRepository.ensurePersonIdentity(otherPerson.id);
        await faceIdentityRepository.replaceFaceIdentity({
          assetFaceId: manualLinkFace.id,
          identityId: otherIdentity.id,
          source: 'manual',
        });

        const { assetFace: negativeFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
        await sut.upsertPendingForSpacePerson([
          { spacePersonId: spacePerson.id, assetFaceId: negativeFace.id, distance: 0.6 },
        ]);
        const otherSpacePerson = await ctx.database
          .insertInto('shared_space_person')
          .values({ spaceId: space.id, name: 'Bob', type: 'person', isHidden: false })
          .returningAll()
          .executeTakeFirstOrThrow();
        await sut.markRejectedForSpacePerson(otherSpacePerson.id, negativeFace.id, { identityId: identity.id });

        await expect(sut.hasPendingForSpacePerson(space.id, spacePerson.id, controlFace.id, opts)).resolves.toBe(true); // positive control
        await expect(sut.hasPendingForSpacePerson(space.id, spacePerson.id, manualLinkFace.id, opts)).resolves.toBe(
          false,
        );
        await expect(sut.hasPendingForSpacePerson(space.id, spacePerson.id, negativeFace.id, opts)).resolves.toBe(
          false,
        );
      });
    });

    it('resolveAssignedFace deletes pending personal and space-person rows for the same face', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Personal' });
      const { space } = await ctx.newSharedSpace({ createdById: user.id });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });
      const spacePerson = await ctx.database
        .insertInto('shared_space_person')
        .values({ spaceId: space.id, name: 'Space' })
        .returningAll()
        .executeTakeFirstOrThrow();

      await sut.upsertPending([{ personId: person.id, assetFaceId: assetFace.id, distance: 0.65 }]);
      await sut.upsertPendingForSpacePerson([
        { spacePersonId: spacePerson.id, assetFaceId: assetFace.id, distance: 0.7 },
      ]);
      await sut.resolveAssignedFace(assetFace.id);

      const pending = await defaultDatabase
        .selectFrom('face_person_verdict')
        .selectAll()
        .where('assetFaceId', '=', assetFace.id)
        .where('status', '=', 'pending')
        .execute();
      expect(pending).toEqual([]);
    });
  });

  describe('isFaceReachableInSpace', () => {
    it('true for a face whose asset is in the space, false when it is not', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: user.id });
      const { asset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: asset.id, addedById: user.id });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });

      await expect(sut.isFaceReachableInSpace(space.id, assetFace.id)).resolves.toBe(true);

      await ctx.database
        .deleteFrom('shared_space_asset')
        .where('spaceId', '=', space.id)
        .where('assetId', '=', asset.id)
        .execute();

      await expect(sut.isFaceReachableInSpace(space.id, assetFace.id)).resolves.toBe(false);
    });

    it('true when reachable only via the album-contribution branch', async () => {
      const { ctx, sut } = setup();
      const { user: owner } = await ctx.newUser();
      const { user: contributor } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: owner.id });
      const { result: album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'ContribAlbum' });
      await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id });

      // The asset reaches the space ONLY via a contribution into the linked album — no
      // shared_space_asset row, no album_asset row, no library link.
      const { asset } = await ctx.newAsset({ ownerId: contributor.id });
      await ctx.newAlbumSpaceAsset({
        albumId: album.id,
        assetId: asset.id,
        spaceId: space.id,
        addedById: contributor.id,
      });
      const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: null });

      await expect(sut.isFaceReachableInSpace(space.id, assetFace.id)).resolves.toBe(true);
    });

    // Slice 1 (F3): isFaceReachableInSpace applied no visibility / trash / face-state gate at all — a face
    // is only "reachable" if a human could actually be shown it, matching the sibling gates
    // getPendingForSpacePerson already applies. S1.11: every non-reachable case, plus a positive control.
    it('S1.11: false for a locked asset, trashed asset, offline asset, soft-deleted face, invisible face — true for a reachable control', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: user.id });

      const { asset: controlAsset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: controlAsset.id, addedById: user.id });
      const { assetFace: controlFace } = await ctx.newAssetFace({ assetId: controlAsset.id, personId: null });

      const { asset: lockedAsset } = await ctx.newAsset({ ownerId: user.id, visibility: AssetVisibility.Locked });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: lockedAsset.id, addedById: user.id });
      const { assetFace: lockedFace } = await ctx.newAssetFace({ assetId: lockedAsset.id, personId: null });

      const { asset: trashedAsset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: trashedAsset.id, addedById: user.id });
      const { assetFace: trashedFace } = await ctx.newAssetFace({ assetId: trashedAsset.id, personId: null });
      await ctx.softDeleteAsset(trashedAsset.id);

      const { asset: offlineAsset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: offlineAsset.id, addedById: user.id });
      const { assetFace: offlineFace } = await ctx.newAssetFace({ assetId: offlineAsset.id, personId: null });
      await ctx.database.updateTable('asset').set({ isOffline: true }).where('id', '=', offlineAsset.id).execute();

      const { asset: deletedFaceAsset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: deletedFaceAsset.id, addedById: user.id });
      const { assetFace: deletedFace } = await ctx.newAssetFace({ assetId: deletedFaceAsset.id, personId: null });
      await ctx.database
        .updateTable('asset_face')
        .set({ deletedAt: new Date() })
        .where('id', '=', deletedFace.id)
        .execute();

      const { asset: invisibleFaceAsset } = await ctx.newAsset({ ownerId: user.id });
      await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: invisibleFaceAsset.id, addedById: user.id });
      const { assetFace: invisibleFace } = await ctx.newAssetFace({
        assetId: invisibleFaceAsset.id,
        personId: null,
        isVisible: false,
      });

      await expect(sut.isFaceReachableInSpace(space.id, controlFace.id)).resolves.toBe(true); // positive control
      await expect(sut.isFaceReachableInSpace(space.id, lockedFace.id)).resolves.toBe(false);
      await expect(sut.isFaceReachableInSpace(space.id, trashedFace.id)).resolves.toBe(false);
      await expect(sut.isFaceReachableInSpace(space.id, offlineFace.id)).resolves.toBe(false);
      await expect(sut.isFaceReachableInSpace(space.id, deletedFace.id)).resolves.toBe(false);
      await expect(sut.isFaceReachableInSpace(space.id, invisibleFace.id)).resolves.toBe(false);
    });
  });

  // S10.3 (F20): the resolutions-remove DTO's verdictIds now goes up to MAX_RESOLVE_FACES (25 000), and
  // removeVerdicts was completely unchunked. The filler below is far larger than Postgres's 65 535
  // bind-parameter ceiling (non-existent ids — the bind count is a function of list length, not of whether
  // rows match) so the test genuinely fails today, before chunking.
  describe('removeVerdicts (F20)', () => {
    it('removes only the requested negative verdicts, chunked, without a bind-parameter error on a huge request', async () => {
      const { ctx, sut } = setup();
      const { user } = await ctx.newUser();
      const { person: personA } = await ctx.newPerson({ ownerId: user.id });
      const { person: personB } = await ctx.newPerson({ ownerId: user.id });
      const { asset: assetA } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace: faceA } = await ctx.newAssetFace({ assetId: assetA.id, personId: null });
      const { asset: assetB } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace: faceB } = await ctx.newAssetFace({ assetId: assetB.id, personId: null });
      const { asset: assetC } = await ctx.newAsset({ ownerId: user.id });
      const { assetFace: faceC } = await ctx.newAssetFace({ assetId: assetC.id, personId: null });

      await sut.markRejected(personA.id, faceA.id);
      await sut.markIgnored(personA.id, faceB.id);
      await sut.markRejected(personB.id, faceC.id); // positive control: not in the removal request

      const rowA = await getRow(personA.id, faceA.id);
      const rowB = await getRow(personA.id, faceB.id);
      const rowC = await getRow(personB.id, faceC.id);

      const filler = Array.from({ length: 70_000 }, () => randomUUID());
      const removed = await sut.removeVerdicts([rowA.id, rowB.id, ...filler]);

      expect(removed).toBe(2);
      expect(await getRowOrUndefined(personA.id, faceA.id)).toBeUndefined();
      expect(await getRowOrUndefined(personA.id, faceB.id)).toBeUndefined();
      expect(await getRowOrUndefined(personB.id, faceC.id)).toEqual(rowC); // positive control: untouched
    });
  });
});
