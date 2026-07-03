import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { SourceType } from 'src/enum';
import { DB } from 'src/schema';

export interface EligibleFaceRow {
  assetFaceId: string;
  personId: string;
  ownerId: string;
  embedding: string;
}

export class FaceRepairRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  // Non-Timeline faces (e.g. Archive) are intentionally eligible: they may be left unassigned
  // after repair if recognition cannot re-home them, which is the accepted outcome (blank > wrong).
  streamEligibleFaces(options: { ownerId?: string; personId?: string; personIds?: string[] }) {
    return this.db
      .selectFrom('asset_face')
      .innerJoin('asset', 'asset.id', 'asset_face.assetId')
      .innerJoin('face_search', 'face_search.faceId', 'asset_face.id')
      .select([
        'asset_face.id as assetFaceId',
        'asset_face.personId as personId',
        'asset.ownerId as ownerId',
        sql<string>`face_search.embedding`.as('embedding'),
      ])
      .where('asset_face.personId', 'is not', null)
      .where('asset_face.sourceType', '=', sql.lit(SourceType.MachineLearning))
      .where('asset_face.deletedAt', 'is', null)
      .where('asset_face.isVisible', '=', true)
      .where('asset.deletedAt', 'is', null)
      .$if(!!options.ownerId, (qb) => qb.where('asset.ownerId', '=', options.ownerId!))
      .$if(!!options.personId, (qb) => qb.where('asset_face.personId', '=', options.personId!))
      .$if(!!options.personIds && options.personIds.length > 0, (qb) =>
        qb.where('asset_face.personId', 'in', options.personIds!),
      )
      .$narrowType<{ personId: string }>()
      .stream();
  }

  async countEligibleFaces(options: { ownerId?: string; personId?: string }): Promise<number> {
    const { count } = await this.db
      .selectFrom('asset_face')
      .innerJoin('asset', 'asset.id', 'asset_face.assetId')
      .innerJoin('face_search', 'face_search.faceId', 'asset_face.id')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('asset_face.personId', 'is not', null)
      .where('asset_face.sourceType', '=', sql.lit(SourceType.MachineLearning))
      .where('asset_face.deletedAt', 'is', null)
      .where('asset_face.isVisible', '=', true)
      .where('asset.deletedAt', 'is', null)
      .$if(!!options.ownerId, (qb) => qb.where('asset.ownerId', '=', options.ownerId!))
      .$if(!!options.personId, (qb) => qb.where('asset_face.personId', '=', options.personId!))
      .executeTakeFirstOrThrow();
    return Number(count);
  }

  // Paginated list of a person's eligible faces minus a caller-supplied exclude list (the already-shown
  // flagged ids). Mirrors streamEligibleFaces' filter exactly — including the face_search join — so `total`
  // and the returned page are precisely the set an entire-cluster move enumerates and moves. Ordered by
  // asset_face.id for a stable offset cursor.
  async getClusterFacePage(
    personId: string,
    options: { excludeFaceIds: string[]; limit: number; offset: number },
  ): Promise<{ faces: { assetFaceId: string }[]; total: number; hasMore: boolean }> {
    const base = this.db
      .selectFrom('asset_face')
      .innerJoin('asset', 'asset.id', 'asset_face.assetId')
      .innerJoin('face_search', 'face_search.faceId', 'asset_face.id')
      .where('asset_face.personId', '=', personId)
      .where('asset_face.sourceType', '=', sql.lit(SourceType.MachineLearning))
      .where('asset_face.deletedAt', 'is', null)
      .where('asset_face.isVisible', '=', true)
      .where('asset.deletedAt', 'is', null)
      .$if(options.excludeFaceIds.length > 0, (qb) => qb.where('asset_face.id', 'not in', options.excludeFaceIds));

    const { count } = await base.select((eb) => eb.fn.countAll().as('count')).executeTakeFirstOrThrow();
    const total = Number(count);

    const rows = await base
      .select(['asset_face.id as assetFaceId'])
      .orderBy('asset_face.id')
      .limit(options.limit)
      .offset(options.offset)
      .execute();

    return {
      faces: rows.map((row) => ({ assetFaceId: row.assetFaceId })),
      total,
      hasMore: options.offset + rows.length < total,
    };
  }

  // Re-attribute the given faces from `fromPersonId` to `toPersonId` ONLY if they are still assigned to
  // `fromPersonId` and machine-learning-sourced (eligibility re-check at write — a face moved by a concurrent
  // job since planning is skipped). Returns the ids actually moved (so the caller links identities for exactly
  // those). Writing the destination directly is what makes the move durable: recognition re-clusters an
  // unassigned face to its nearest neighbour, which for a contaminated cluster is the original wrong person.
  async reattributeFaces(fromPersonId: string, toPersonId: string, assetFaceIds: string[]): Promise<string[]> {
    if (assetFaceIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .updateTable('asset_face')
      .set({ personId: toPersonId })
      .where('id', 'in', assetFaceIds)
      .where('personId', '=', fromPersonId)
      .where('sourceType', '=', sql.lit(SourceType.MachineLearning))
      .where('deletedAt', 'is', null)
      .where('isVisible', '=', true)
      .returning('id')
      .execute();
    return rows.map((row) => row.id);
  }

  // Repoint any dangling representative face: if a person's faceAssetId no longer belongs to it (or is null),
  // reset it to any remaining assigned, visible, non-deleted face (or null if none remain). Returns the ids of
  // persons whose representative face actually changed so callers can regenerate their thumbnails.
  async reconcileRepresentativeFaces(personIds: string[]): Promise<string[]> {
    if (personIds.length === 0) {
      return [];
    }
    const updated = await this.db
      .updateTable('person')
      .set((eb) => ({
        faceAssetId: eb
          .selectFrom('asset_face as remaining')
          .innerJoin('asset', 'asset.id', 'remaining.assetId')
          .select('remaining.id')
          .whereRef('remaining.personId', '=', 'person.id')
          .where('remaining.deletedAt', 'is', null)
          .where('remaining.isVisible', '=', true)
          .where('asset.deletedAt', 'is', null)
          .limit(1),
      }))
      .where('person.id', 'in', personIds)
      .where((eb) =>
        eb.or([
          eb('person.faceAssetId', 'is', null),
          eb.not(
            eb.exists(
              eb
                .selectFrom('asset_face as current')
                .select(sql`1`.as('one'))
                .whereRef('current.id', '=', 'person.faceAssetId')
                .whereRef('current.personId', '=', 'person.id'),
            ),
          ),
        ]),
      )
      .returning('person.id')
      .execute();
    return updated.map((row) => row.id);
  }
}
