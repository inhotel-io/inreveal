import { Kysely, sql } from 'kysely';

// M2 — shared_space_album_delete_audit wrote TWO grant-revocation tombstones for the space
// creator, because the per-member arm and the per-creator arm were independent INSERTs and the
// creator is always also a member. Merge them into one UNION-deduplicated set. The creator arm is
// preserved (no schema constraint binds createdById to a member row), and DISTINCT also collapses
// the same user arriving via two links deleted in a single statement.
const OVERRIDE_NAME = 'function_shared_space_album_delete_audit';

// The merged body. Declared ONCE and reused for both the DDL and the override
// row, so the two can never disagree.
//
// This is byte-identical to `shared_space_album_delete_audit.expression` in src/schema/functions.ts
// — comments included. sql-tools compares `migration_overrides` rows against that generated
// expression by exact string equality (`haveEqualOverrides` / `compareOverrides.onCompare`), so a
// single differing character here makes `migrations:generate` emit a spurious FunctionCreate +
// OverrideUpdate and CI's "SQL Schema Checks" job go red.
const DEDUPED_SQL = `CREATE OR REPLACE FUNCTION shared_space_album_delete_audit()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
  AS $$
    BEGIN
      -- 1. Always record the (space, album) link delete (ungated) so clients drop the space-album.
      INSERT INTO shared_space_album_audit ("spaceId", "albumId")
      SELECT "spaceId", "albumId" FROM "old";

      -- 2. Gated grant revocation for every member AND the space creator, as ONE
      --    deduplicated set. They were two independent INSERTs, and the creator is
      --    always also a member (SharedSpaceService.create adds them as Owner and
      --    they cannot leave), so the creator received two tombstones per delete.
      --
      --    UNION (not UNION ALL) collapses creator-as-member. The creator arm is
      --    KEPT, not dropped: nothing in the schema binds createdById to a member
      --    row, so a creator without membership must still be revoked.
      --
      --    DISTINCT additionally collapses the same user arriving via two deleted
      --    links in one statement — the audit table has no "spaceId" to separate them.
      --
      --    INNER JOIN shared_space preserves the cascade guard the previous two arms
      --    had: during a shared_space delete the row is already gone, this yields
      --    nothing, and the BEFORE-row trigger on shared_space does the fan-out.
      INSERT INTO shared_space_album_user_audit ("albumId", "userId")
      SELECT DISTINCT o."albumId", u."userId"
      FROM "old" o
      INNER JOIN shared_space ss ON ss."id" = o."spaceId"
      CROSS JOIN LATERAL (
        SELECT ssm."userId" FROM shared_space_member ssm WHERE ssm."spaceId" = o."spaceId"
        UNION
        SELECT ss."createdById"
      ) u
      WHERE NOT user_has_album_path(o."albumId", u."userId", o."spaceId");

      RETURN NULL;
    END
  $$;`;

// The two-statement body this replaces, kept verbatim for down().
const ORIGINAL_SQL = `CREATE OR REPLACE FUNCTION shared_space_album_delete_audit()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
  AS $$
    BEGIN
      -- 1. Always record the (space, album) link delete (ungated) so clients drop the space-album.
      INSERT INTO shared_space_album_audit ("spaceId", "albumId")
      SELECT "spaceId", "albumId" FROM "old";

      -- 2. Gated grant revocation per member; skips during shared_space cascade (BEFORE-row handles it).
      INSERT INTO shared_space_album_user_audit ("albumId", "userId")
      SELECT o."albumId", ssm."userId"
      FROM "old" o
      INNER JOIN shared_space_member ssm ON ssm."spaceId" = o."spaceId"
      WHERE EXISTS (SELECT 1 FROM shared_space ss WHERE ss.id = o."spaceId")
        AND NOT user_has_album_path(o."albumId", ssm."userId", o."spaceId");

      -- 3. Gated grant revocation for the space creator.
      INSERT INTO shared_space_album_user_audit ("albumId", "userId")
      SELECT o."albumId", ss."createdById"
      FROM "old" o
      INNER JOIN shared_space ss ON ss."id" = o."spaceId"
      WHERE NOT user_has_album_path(o."albumId", ss."createdById", o."spaceId");

      RETURN NULL;
    END
  $$;`;

const applyFunction = async (db: Kysely<any>, functionSql: string) => {
  await sql.raw(functionSql).execute(db);
  const override = JSON.stringify({ type: 'function', name: 'shared_space_album_delete_audit', sql: functionSql });
  await sql`UPDATE "migration_overrides" SET "value" = ${override}::jsonb WHERE "name" = ${OVERRIDE_NAME};`.execute(db);
};

export async function up(db: Kysely<any>): Promise<void> {
  await applyFunction(db, DEDUPED_SQL);
}

export async function down(db: Kysely<any>): Promise<void> {
  await applyFunction(db, ORIGINAL_SQL);
}
