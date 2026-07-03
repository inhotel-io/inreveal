import { Insertable, Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { FaceRepairDeclineTable } from 'src/schema/tables/face-repair-decline.table';
import { DeclineMaps } from 'src/utils/face-repair';

export interface FaceDeclineInput {
  assetFaceId: string;
  suspectedOwnerId: string;
}
export interface PersonDeclineInput {
  personId: string;
  suspectedOwnerIds: string[];
}

export interface DeclineListRow {
  id: string;
  type: 'face' | 'person';
  assetFaceId: string | null;
  suspectedOwnerId: string | null;
  suspectedOwnerName: string | null;
  suspectedOwnerThumbnailFaceId: string | null;
  personId: string | null;
  personName: string | null;
  personThumbnailFaceId: string | null;
  createdAt: string;
}

export class FaceRepairDeclineRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  // Insert face and/or person declines. Face rows are idempotent on the (assetFaceId, suspectedOwnerId) partial
  // unique index — re-declining the same face/owner is a no-op. Person rows are last-write-wins: the dashboard
  // always sends the person's current full suspected-owner set, so re-dismissing replaces the stored fingerprint.
  // Returns the number of rows actually inserted.
  async createDeclines(input: {
    faces?: FaceDeclineInput[];
    persons?: PersonDeclineInput[];
    declinedBy: string | null;
  }): Promise<number> {
    const faceRows = (input.faces ?? []).map((f) => ({
      type: 'face' as const,
      assetFaceId: f.assetFaceId,
      suspectedOwnerId: f.suspectedOwnerId,
      personId: null,
      suspectedOwnerIds: null,
      declinedBy: input.declinedBy,
    }));
    const personRows = (input.persons ?? []).map((p) => ({
      type: 'person' as const,
      assetFaceId: null,
      suspectedOwnerId: null,
      personId: p.personId,
      suspectedOwnerIds: p.suspectedOwnerIds as unknown as Insertable<FaceRepairDeclineTable>['suspectedOwnerIds'],
      declinedBy: input.declinedBy,
    }));
    if (faceRows.length === 0 && personRows.length === 0) {
      return 0;
    }
    return this.db.transaction().execute(async (trx) => {
      let created = 0;
      if (faceRows.length > 0) {
        const inserted = await trx
          .insertInto('face_repair_decline')
          .values(faceRows)
          .onConflict((oc) => oc.columns(['assetFaceId', 'suspectedOwnerId']).doNothing())
          .returning('id')
          .execute();
        created += inserted.length;
      }
      if (personRows.length > 0) {
        const personIds = (input.persons ?? []).map((p) => p.personId);
        // last-write-wins: a re-dismiss replaces the person's stored suspected-owner fingerprint
        await trx
          .deleteFrom('face_repair_decline')
          .where('type', '=', 'person')
          .where('personId', 'in', personIds)
          .execute();
        const inserted = await trx.insertInto('face_repair_decline').values(personRows).returning('id').execute();
        created += inserted.length;
      }
      return created;
    });
  }

  // Load declines into the two lookup maps the planner consults. The full-library scan loads everything (no
  // scope). The review/apply read paths, which know exactly which persons and faces are in play, pass a scope so
  // the load stays bounded as `type='face'` rows accumulate over the instance's lifetime — a scoped read only
  // fetches the declines that can affect the faces/persons being planned.
  async getDeclineMaps(scope?: { personIds?: string[]; assetFaceIds?: string[] }): Promise<DeclineMaps> {
    const faceIds = scope?.assetFaceIds ?? [];
    const personIds = scope?.personIds ?? [];
    const rows = await this.db
      .selectFrom('face_repair_decline')
      .select(['type', 'assetFaceId', 'suspectedOwnerId', 'personId', 'suspectedOwnerIds'])
      .$if(scope !== undefined, (qb) =>
        qb.where((eb) => {
          const conditions = [];
          if (faceIds.length > 0) {
            conditions.push(eb.and([eb('type', '=', 'face'), eb('assetFaceId', 'in', faceIds)]));
          }
          if (personIds.length > 0) {
            conditions.push(eb.and([eb('type', '=', 'person'), eb('personId', 'in', personIds)]));
          }
          // Empty scope → match nothing (never load the whole table on an unscoped-looking read).
          return conditions.length > 0 ? eb.or(conditions) : sql<boolean>`false`;
        }),
      )
      .execute();
    const declinedFaceOwners = new Map<string, Set<string>>();
    const dismissedPersons = new Map<string, Set<string>>();
    for (const row of rows) {
      if (row.type === 'face' && row.assetFaceId && row.suspectedOwnerId) {
        const set = declinedFaceOwners.get(row.assetFaceId) ?? new Set<string>();
        set.add(row.suspectedOwnerId);
        declinedFaceOwners.set(row.assetFaceId, set);
      } else if (row.type === 'person' && row.personId) {
        dismissedPersons.set(row.personId, new Set(row.suspectedOwnerIds as unknown as string[]));
      }
    }
    return { declinedFaceOwners, dismissedPersons };
  }

  async listDeclines(): Promise<DeclineListRow[]> {
    const rows = await this.db
      .selectFrom('face_repair_decline')
      .select(['id', 'type', 'assetFaceId', 'suspectedOwnerId', 'personId', 'createdAt'])
      .orderBy('createdAt', 'desc')
      .execute();
    if (rows.length === 0) {
      return [];
    }
    const ids = [
      ...new Set(rows.flatMap((r) => [r.personId, r.suspectedOwnerId].filter((x): x is string => x !== null))),
    ];
    const people =
      ids.length > 0
        ? await this.db.selectFrom('person').select(['id', 'name', 'faceAssetId']).where('id', 'in', ids).execute()
        : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    const nameOf = (id: string | null) => (id && byId.get(id)?.name ? byId.get(id)!.name! : null);
    const thumbOf = (id: string | null) => (id ? (byId.get(id)?.faceAssetId ?? null) : null);
    return rows.map((r) => ({
      id: r.id,
      type: r.type as 'face' | 'person',
      assetFaceId: r.assetFaceId,
      suspectedOwnerId: r.suspectedOwnerId,
      suspectedOwnerName: nameOf(r.suspectedOwnerId),
      suspectedOwnerThumbnailFaceId: thumbOf(r.suspectedOwnerId),
      personId: r.personId,
      personName: nameOf(r.personId),
      personThumbnailFaceId: thumbOf(r.personId),
      createdAt: r.createdAt as unknown as string,
    }));
  }

  // Remove declines by row id and/or by face natural key. The declined-page "Undo" sends ids; the review
  // screen's in-place undecline sends faces (it knows the (assetFaceId, suspectedOwnerId) pair but not the
  // server-generated row id). Returns the total number of rows removed.
  async removeDeclines(input: { ids?: string[]; faces?: FaceDeclineInput[] }): Promise<number> {
    const ids = input.ids ?? [];
    const faces = input.faces ?? [];
    if (ids.length === 0 && faces.length === 0) {
      return 0;
    }
    return this.db.transaction().execute(async (trx) => {
      let removed = 0;
      if (ids.length > 0) {
        const rows = await trx.deleteFrom('face_repair_decline').where('id', 'in', ids).returning('id').execute();
        removed += rows.length;
      }
      for (const face of faces) {
        const rows = await trx
          .deleteFrom('face_repair_decline')
          .where('type', '=', 'face')
          .where('assetFaceId', '=', face.assetFaceId)
          .where('suspectedOwnerId', '=', face.suspectedOwnerId)
          .returning('id')
          .execute();
        removed += rows.length;
      }
      return removed;
    });
  }
}
