import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE "agent_provider_credential" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL,
      "providerType" character varying NOT NULL,
      "label" character varying NOT NULL,
      "baseUrl" character varying,
      "encryptedSecret" text NOT NULL,
      "secretVersion" integer NOT NULL DEFAULT 1,
      "models" character varying[] NOT NULL,
      "defaultModel" character varying,
      "lastUsedAt" timestamp with time zone,
      "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
      "updateId" uuid NOT NULL DEFAULT immich_uuid_v7(),
      CONSTRAINT "PK_agent_provider_credential_id" PRIMARY KEY ("id"),
      CONSTRAINT "FK_agent_provider_credential_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON UPDATE CASCADE ON DELETE CASCADE
    )
  `.execute(db);

  await sql`CREATE INDEX "IDX_agent_provider_credential_userId" ON "agent_provider_credential" ("userId")`.execute(
    db,
  );
  await sql`CREATE INDEX "IDX_agent_provider_credential_updateId" ON "agent_provider_credential" ("updateId")`.execute(
    db,
  );
  await sql`
    CREATE OR REPLACE TRIGGER "agent_provider_credential_updatedAt"
    BEFORE UPDATE ON "agent_provider_credential"
    FOR EACH ROW
    EXECUTE FUNCTION updated_at()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS "agent_provider_credential_updatedAt" ON "agent_provider_credential"`.execute(db);
  await sql`DROP TABLE "agent_provider_credential"`.execute(db);
}
