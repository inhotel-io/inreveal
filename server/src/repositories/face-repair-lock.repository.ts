import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

export interface LockListRow {
  id: string;
  assetFaceId: string;
  // Nullable since Slice 1 (Face Cleanup temporal-consistency hardening): the reviewed person can be
  // hard-deleted, in which case the FK's `ON DELETE SET NULL` clears this audit-only reference while the lock
  // itself survives.
  personId: string | null;
  personName: string | null;
  personThumbnailFaceId: string | null;
  createdAt: string;
}

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

  // List every lock for the unified resolutions manage page (Slice 7), newest first, joined against `person`
  // for display (reviewed-person name + thumbnail). Mirrors `FaceRepairDeclineRepository.listDeclines()`.
  async listLocks(): Promise<LockListRow[]> {
    const rows = await this.db
      .selectFrom('face_repair_lock')
      .select(['id', 'assetFaceId', 'personId', 'createdAt'])
      .orderBy('createdAt', 'desc')
      .execute();
    if (rows.length === 0) {
      return [];
    }
    const personIds = [...new Set(rows.map((row) => row.personId).filter((id): id is string => id !== null))];
    const people =
      personIds.length > 0
        ? await this.db
            .selectFrom('person')
            .select(['id', 'name', 'faceAssetId'])
            .where('id', 'in', personIds)
            .execute()
        : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return rows.map((r) => ({
      id: r.id,
      assetFaceId: r.assetFaceId,
      personId: r.personId,
      personName: (r.personId && byId.get(r.personId)?.name) || null,
      personThumbnailFaceId: (r.personId && byId.get(r.personId)?.faceAssetId) ?? null,
      createdAt: r.createdAt as unknown as string,
    }));
  }

  // Remove locks by row id and/or by natural key (assetFaceId — a lock's uniqueness is keyed on the face
  // alone, unlike a decline's (assetFaceId, suspectedOwnerId) pairing). Undoing a lock this way re-enables
  // flagging: the face drops out of `getLockedFaceIds()` and the next scan can suspect it again. Mirrors
  // `FaceRepairDeclineRepository.removeDeclines()`. Returns the total number of rows removed.
  async removeLocks(input: { ids?: string[]; faces?: string[] }): Promise<number> {
    const ids = input.ids ?? [];
    const faces = input.faces ?? [];
    if (ids.length === 0 && faces.length === 0) {
      return 0;
    }
    return this.db.transaction().execute(async (trx) => {
      let removed = 0;
      if (ids.length > 0) {
        const rows = await trx.deleteFrom('face_repair_lock').where('id', 'in', ids).returning('id').execute();
        removed += rows.length;
      }
      if (faces.length > 0) {
        const rows = await trx
          .deleteFrom('face_repair_lock')
          .where('assetFaceId', 'in', faces)
          .returning('id')
          .execute();
        removed += rows.length;
      }
      return removed;
    });
  }
}
