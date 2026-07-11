import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE "face_repair_lock" (
      "id" uuid NOT NULL DEFAULT immich_uuid_v7(),
      "assetFaceId" uuid NOT NULL,
      "personId" uuid NOT NULL,
      "createdBy" uuid,
      "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "face_repair_lock_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "face_repair_lock_assetFaceId_fkey" FOREIGN KEY ("assetFaceId") REFERENCES "asset_face" ("id") ON DELETE CASCADE,
      CONSTRAINT "face_repair_lock_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person" ("id") ON DELETE CASCADE
    )
  `.execute(db);
  await sql`CREATE INDEX "face_repair_lock_personId_idx" ON "face_repair_lock" ("personId")`.execute(db);
  await sql`CREATE UNIQUE INDEX "face_repair_lock_face_uq" ON "face_repair_lock" ("assetFaceId")`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS "face_repair_lock"`.execute(db);
}
