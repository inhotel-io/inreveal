import { Insertable, Kysely, Selectable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { FaceRepairScanTable } from 'src/schema/tables/face-repair-scan.table';

export type RepairScanStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface RepairScanParams {
  maxDistance: number;
  minFaces: number;
  voteWindow: number;
  voteMargin: number;
  maxAttributionDistance: number;
  maxFlaggedFraction: number;
  largeClusterThreshold: number;
  ownerId?: string;
}

export interface RepairScanSuspectedOwner {
  ownerPersonId: string;
  ownerName: string | null;
  thumbnailFaceId: string | null;
  count: number;
}

export interface RepairScanPerson {
  personId: string;
  ownerId: string;
  personName: string | null;
  faceCount: number;
  thumbnailFaceId: string | null;
  eligible: number;
  flagged: number;
  flaggedFraction: number;
  suspectedOwners: RepairScanSuspectedOwner[];
  recommendation: 'confident' | 'review-first';
  reviewReasons: string[];
}

export interface RepairScanTotals {
  eligibleFaces: number;
  flaggedFaces: number;
  toRepair: number;
  reviewOnlyFaces: number;
  reviewOnlyPersons: number;
  affectedPersons: number;
  reviewOnlyByReason: { overCap: number; badTarget: number; unAttributable: number };
}

export interface RepairScanProgress {
  scanned: number;
  total: number;
}

export type RepairScanRow = Selectable<FaceRepairScanTable>;

export class FaceRepairScanRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async createScan(input: { requestedBy: string | null; params: RepairScanParams }): Promise<RepairScanRow> {
    return this.db
      .insertInto('face_repair_scan')
      .values({ status: 'pending', requestedBy: input.requestedBy, params: input.params as unknown as Insertable<FaceRepairScanTable>['params'] })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  getLatestScan(): Promise<RepairScanRow | undefined> {
    return this.db.selectFrom('face_repair_scan').selectAll().orderBy('createdAt', 'desc').limit(1).executeTakeFirst();
  }

  getScanById(id: string): Promise<RepairScanRow | undefined> {
    return this.db.selectFrom('face_repair_scan').selectAll().where('id', '=', id).executeTakeFirst();
  }
}
