import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE "face_repair_scan" (
      "id" uuid NOT NULL DEFAULT immich_uuid_v7(),
      "status" character varying NOT NULL DEFAULT 'pending',
      "requestedBy" uuid,
      "params" jsonb,
      "totals" jsonb,
      "persons" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "progress" jsonb,
      "error" text,
      "startedAt" timestamp with time zone,
      "finishedAt" timestamp with time zone,
      "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "face_repair_scan_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "face_repair_scan_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "users" ("id") ON DELETE SET NULL
    )
  `.execute(db);

  await sql`CREATE INDEX "face_repair_scan_createdAt_idx" ON "face_repair_scan" ("createdAt")`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS "face_repair_scan"`.execute(db);
}
