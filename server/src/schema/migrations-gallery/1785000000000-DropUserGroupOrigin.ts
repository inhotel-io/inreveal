import { Kysely, sql } from 'kysely';

// `user_group.origin` was introduced by 1774300000000-CreateUserGroupTables as a
// placeholder for OIDC-provisioned groups ("manual" or "oidc"). Nothing ever wrote
// anything other than the 'manual' default, and no client read it back, so the
// column and its DTO field are dropped. Re-add it here if OIDC group provisioning
// is implemented.

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "user_group" DROP COLUMN "origin";`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "user_group" ADD COLUMN "origin" character varying NOT NULL DEFAULT 'manual';`.execute(db);
}
