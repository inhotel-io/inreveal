import { Kysely, sql } from 'kysely';

// Face Cleanup temporal-consistency hardening, Slice 1: a confirm/lock must survive the reviewed person being
// merged away or hard-deleted. `face_repair_lock.personId` was NOT NULL with `ON DELETE CASCADE` (see
// 1785000000000-AddFaceRepairLock.ts), which silently drops the lock row (and re-exposes the face to future
// scans) whenever the reviewed person is deleted. `personId` is audit-only — the lock check itself
// (`getLockedFaceIds`) is keyed on `assetFaceId` alone — so switching to `ON DELETE SET NULL` keeps the lock
// alive while merely losing the (non-load-bearing) reviewed-person reference. `mergePersonProfile` separately
// re-points `personId` to the merge target so the audit trail stays accurate across a merge.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "face_repair_lock" ALTER COLUMN "personId" DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE "face_repair_lock" DROP CONSTRAINT IF EXISTS "face_repair_lock_personId_fkey"`.execute(db);
  await sql`ALTER TABLE "face_repair_lock" ADD CONSTRAINT "face_repair_lock_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "person" ("id") ON UPDATE NO ACTION ON DELETE SET NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "face_repair_lock" DROP CONSTRAINT IF EXISTS "face_repair_lock_personId_fkey"`.execute(db);
  await sql`ALTER TABLE "face_repair_lock" ADD CONSTRAINT "face_repair_lock_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "person" ("id") ON UPDATE NO ACTION ON DELETE CASCADE`.execute(db);
  await sql`ALTER TABLE "face_repair_lock" ALTER COLUMN "personId" SET NOT NULL`.execute(db);
}
