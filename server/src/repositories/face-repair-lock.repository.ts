import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

export class FaceRepairLockRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  // Lock a set of faces to `personId` (the person the admin confirmed them on for display/audit — the lock
  // itself is owner-agnostic). Idempotent via the plain unique index on `assetFaceId`: re-locking an
  // already-locked face, even under a different reviewed person, is a silent no-op rather than a
  // unique-violation. Returns the number of rows actually inserted.
  async insertLocks(assetFaceIds: string[], personId: string, createdBy: string | null): Promise<number> {
    if (assetFaceIds.length === 0) {
      return 0;
    }
    const inserted = await this.db
      .insertInto('face_repair_lock')
      .values(assetFaceIds.map((assetFaceId) => ({ assetFaceId, personId, createdBy })))
      .onConflict((oc) => oc.column('assetFaceId').doNothing())
      .returning('id')
      .execute();
    return inserted.length;
  }

  // Every locked face id, owner-agnostic (no scoping by person or suspected owner) — a face here is dropped
  // from a re-scan's flagged set no matter which owner the scan would next propose for it.
  async getLockedFaceIds(): Promise<Set<string>> {
    const rows = await this.db.selectFrom('face_repair_lock').select('assetFaceId').execute();
    return new Set(rows.map((row) => row.assetFaceId));
  }
}
