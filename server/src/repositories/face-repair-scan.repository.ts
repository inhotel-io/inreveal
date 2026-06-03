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
    return this.db.transaction().execute(async (trx) => {
      const inFlight = await trx
        .selectFrom('face_repair_scan')
        .select('id')
        .where('status', 'in', ['pending', 'running'])
        .executeTakeFirst();
      if (inFlight) {
        throw new Error('A face-repair scan is already in progress');
      }
      return trx
        .insertInto('face_repair_scan')
        .values({ status: 'pending', requestedBy: input.requestedBy, params: input.params as unknown as Insertable<FaceRepairScanTable>['params'] })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  getLatestScan(): Promise<RepairScanRow | undefined> {
    return this.db.selectFrom('face_repair_scan').selectAll().orderBy('createdAt', 'desc').limit(1).executeTakeFirst();
  }

  getScanById(id: string): Promise<RepairScanRow | undefined> {
    return this.db.selectFrom('face_repair_scan').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async updateScanProgress(
    id: string,
    input: { status?: RepairScanStatus; progress?: RepairScanProgress; startedAt?: Date },
  ): Promise<void> {
    await this.db
      .updateTable('face_repair_scan')
      .set({
        ...(input.status ? { status: input.status } : {}),
        ...(input.progress ? { progress: input.progress } : {}),
        ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      })
      .where('id', '=', id)
      .execute();
  }

  async completeScan(id: string, input: { totals: RepairScanTotals; persons: RepairScanPerson[] }): Promise<void> {
    await this.db
      .updateTable('face_repair_scan')
      .set({ status: 'completed', totals: input.totals, persons: input.persons, finishedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async failScan(id: string, error: string): Promise<void> {
    await this.db
      .updateTable('face_repair_scan')
      .set({ status: 'failed', error, finishedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async pruneSupersededScans(): Promise<void> {
    const latest = await this.db
      .selectFrom('face_repair_scan')
      .select('id')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (!latest) {
      return;
    }
    await this.db.deleteFrom('face_repair_scan').where('id', '!=', latest.id).execute();
  }
}
