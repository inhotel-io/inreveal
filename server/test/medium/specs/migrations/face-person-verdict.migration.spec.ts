import { Kysely, sql } from 'kysely';
import { FacePersonVerdictRepository } from 'src/repositories/face-person-verdict.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The unified branch authors `face_person_verdict` in its final shape in one migration
// (1787000000000-AddFacePersonVerdict), replacing three never-deployed fork migrations. This spec pins the
// resulting schema — especially the delete semantics, which are the subtle part: an identity-keyed verdict
// has to outlive the person row it was written against (people merge), which rules out CASCADE on the
// target columns, while a lower-bound check on "at least one key" would make that person's DELETE fail.
let db: Kysely<DB>;

beforeAll(async () => {
  db = await getKyselyDB();
});

afterAll(async () => {
  await db.destroy();
});

const setup = () => {
  const { ctx } = newMediumService(BaseService, {
    database: db,
    real: [FacePersonVerdictRepository],
    mock: [LoggingRepository],
  });
  return { ctx, sut: ctx.get(FacePersonVerdictRepository) };
};

describe('face_person_verdict migration', () => {
  it('creates the table with the expected columns', async () => {
    const rows = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'face_person_verdict'
    `.execute(db);
    expect(rows.rows.map((r) => r.column_name).toSorted()).toEqual(
      [
        'actorId',
        'assetFaceId',
        'createdAt',
        'distance',
        'id',
        'identityId',
        'personId',
        'source',
        'spacePersonId',
        'status',
        'updateId',
        'updatedAt',
      ].toSorted(),
    );
  });

  it('makes every key column except assetFaceId nullable', async () => {
    const columns = await sql<{ column_name: string; is_nullable: string }>`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'face_person_verdict'
        AND column_name IN ('personId', 'spacePersonId', 'identityId', 'assetFaceId', 'distance')
    `.execute(db);
    expect(Object.fromEntries(columns.rows.map((row) => [row.column_name, row.is_nullable]))).toEqual({
      personId: 'YES',
      spacePersonId: 'YES',
      identityId: 'YES',
      distance: 'YES',
      assetFaceId: 'NO',
    });
  });

  it('permits at most one target, and permits neither', async () => {
    const checks = await sql<{ def: string }>`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'face_person_verdict'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%num_nonnulls%'
    `.execute(db);
    expect(checks.rows).toHaveLength(1);
    // <= 1, never = 1: a verdict whose person was deleted keeps working via identityId.
    expect(checks.rows[0].def).toContain('<= 1');
  });

  it('constrains status and source to the shipped values', async () => {
    const checks = await sql<{ conname: string; def: string }>`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'face_person_verdict'::regclass AND contype = 'c'
    `.execute(db);
    const byName = Object.fromEntries(checks.rows.map((r) => [r.conname, r.def]));

    const status = byName['face_person_verdict_status_chk'];
    expect(status).toContain('pending');
    expect(status).toContain('rejected');
    expect(status).toContain('ignored');
    // The positive verdict lives in face_identity_face.source='manual', never here.
    expect(status).not.toContain('confirmed');

    const source = byName['face_person_verdict_source_chk'];
    expect(source).toContain('suggestion');
    expect(source).toContain('cleanup');
  });

  it('defines the target uniqueness, identity, and queue indexes', async () => {
    const indexes = await sql<{ indexname: string; indexdef: string }>`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'face_person_verdict'
    `.execute(db);
    const defs = Object.fromEntries(indexes.rows.map((row) => [row.indexname, row.indexdef]));

    expect(defs.face_person_verdict_personId_assetFaceId_uq).toContain('UNIQUE INDEX');
    expect(defs.face_person_verdict_personId_assetFaceId_uq).toContain('("personId", "assetFaceId")');
    expect(defs.face_person_verdict_personId_assetFaceId_uq).toContain('WHERE ("personId" IS NOT NULL)');

    expect(defs.face_person_verdict_spacePersonId_assetFaceId_uq).toContain('UNIQUE INDEX');
    expect(defs.face_person_verdict_spacePersonId_assetFaceId_uq).toContain('("spacePersonId", "assetFaceId")');
    expect(defs.face_person_verdict_spacePersonId_assetFaceId_uq).toContain('WHERE ("spacePersonId" IS NOT NULL)');

    // The cross-scope read path.
    expect(defs.face_person_verdict_identityId_assetFaceId_idx).toContain('("identityId", "assetFaceId")');
    expect(defs.face_person_verdict_identityId_assetFaceId_idx).toContain('WHERE ("identityId" IS NOT NULL)');

    expect(defs.face_person_verdict_personId_status_distance_idx).toContain('("personId", status, distance)');
    expect(defs.face_person_verdict_assetFaceId_idx).toBeDefined();
    expect(defs.face_person_verdict_updateId_idx).toBeDefined();
  });

  it('uses SET NULL on the targets and CASCADE on identity and face', async () => {
    const fks = await sql<{ conname: string; def: string }>`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'face_person_verdict'::regclass AND contype = 'f'
    `.execute(db);
    const byName = Object.fromEntries(fks.rows.map((r) => [r.conname, r.def]));

    expect(byName['face_person_verdict_personId_fkey']).toContain('ON DELETE SET NULL');
    expect(byName['face_person_verdict_spacePersonId_fkey']).toContain('ON DELETE SET NULL');
    expect(byName['face_person_verdict_actorId_fkey']).toContain('ON DELETE SET NULL');
    expect(byName['face_person_verdict_identityId_fkey']).toContain('ON DELETE CASCADE');
    expect(byName['face_person_verdict_assetFaceId_fkey']).toContain('ON DELETE CASCADE');
  });

  it('lets a person be deleted even when the verdict has no identity to fall back on', async () => {
    // The regression a `num_nonnulls(...) >= 1` check would cause: SET NULL would violate it and the
    // person DELETE would fail outright.
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { asset } = await ctx.newAsset({ ownerId: user.id });
    const { assetFace } = await ctx.newAssetFace({ assetId: asset.id });
    const { person } = await ctx.newPerson({ ownerId: user.id, name: 'Doomed' });

    await sut.markRejected(person.id, assetFace.id);

    await expect(db.deleteFrom('person').where('id', '=', person.id).execute()).resolves.toBeDefined();

    const row = await db
      .selectFrom('face_person_verdict')
      .selectAll()
      .where('assetFaceId', '=', assetFace.id)
      .executeTakeFirst();
    expect(row).toBeDefined();
    expect(row?.personId).toBeNull();
  });

  it('registered the updatedAt trigger override row', async () => {
    const rows = await sql<{ name: string }>`
      SELECT name FROM migration_overrides WHERE name = 'trigger_face_person_verdict_updatedAt'
    `.execute(db);
    expect(rows.rows).toHaveLength(1);
  });

  it('created the updatedAt trigger in the database', async () => {
    const rows = await sql<{ tgname: string }>`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'face_person_verdict'::regclass AND tgname = 'face_person_verdict_updatedAt'
    `.execute(db);
    expect(rows.rows).toHaveLength(1);
  });
});
