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

  streamEligibleFaces(options: { ownerId?: string; personId?: string }) {
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
      .$narrowType<{ personId: string }>()
      .stream();
  }
}
