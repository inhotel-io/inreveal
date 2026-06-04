import { Kysely } from 'kysely';
import {
  FaceRepairScanRepository,
  RepairScanParams,
  RepairScanPerson,
} from 'src/repositories/face-repair-scan.repository';
import { DB } from 'src/schema';
import { mediumFactory } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const PARAMS: RepairScanParams = {
  maxDistance: 0.5,
  minFaces: 3,
  voteWindow: 200,
  voteMargin: 2,
  maxAttributionDistance: 0.35,
  maxFlaggedFraction: 0.5,
  largeClusterThreshold: 50,
};

const zeroTotals = () => ({
  eligibleFaces: 0,
  flaggedFaces: 0,
  toRepair: 0,
  reviewOnlyFaces: 0,
  reviewOnlyPersons: 0,
  affectedPersons: 0,
  reviewOnlyByReason: { overCap: 0, badTarget: 0, unAttributable: 0 },
});

describe(FaceRepairScanRepository.name, () => {
  let db: Kysely<DB>;
  let sut: FaceRepairScanRepository;

  beforeAll(async () => {
    db = await getKyselyDB();
    sut = new FaceRepairScanRepository(db);
  });

  afterEach(() => db.deleteFrom('face_repair_scan').execute());

  it('creates a pending scan and returns it as the latest', async () => {
    const scan = await sut.createScan({ requestedBy: null, params: PARAMS });
    expect(scan.status).toBe('pending');

    const latest = await sut.getLatestScan();
    expect(latest?.id).toBe(scan.id);
    expect(latest?.params).toEqual(PARAMS);
    expect(latest?.persons).toEqual([]);
  });

  it('advances progress, then completes with totals + persons and finishedAt', async () => {
    const scan = await sut.createScan({ requestedBy: null, params: PARAMS });

    await sut.updateScanProgress(scan.id, { status: 'running', progress: { scanned: 10, total: 100 } });
    let row = await sut.getScanById(scan.id);
    expect(row?.status).toBe('running');
    expect(row?.progress).toEqual({ scanned: 10, total: 100 });

    const totals = {
      eligibleFaces: 5,
      flaggedFaces: 2,
      toRepair: 0,
      reviewOnlyFaces: 2,
      reviewOnlyPersons: 1,
      affectedPersons: 1,
      reviewOnlyByReason: { overCap: 2, badTarget: 0, unAttributable: 0 },
    };
    await sut.completeScan(scan.id, { totals, persons: [] });
    row = await sut.getScanById(scan.id);
    expect(row?.status).toBe('completed');
    expect(row?.totals).toEqual(totals);
    expect(row?.finishedAt).not.toBeNull();
  });

  it('fails a scan with an error message and finishedAt, no half-written report', async () => {
    const scan = await sut.createScan({ requestedBy: null, params: PARAMS });
    await sut.failScan(scan.id, 'boom');
    const row = await sut.getScanById(scan.id);
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('boom');
    expect(row?.finishedAt).not.toBeNull();
    expect(row?.totals).toBeNull();
  });

  it('refuses a second scan while one is pending/running', async () => {
    await sut.createScan({ requestedBy: null, params: PARAMS });
    await expect(sut.createScan({ requestedBy: null, params: PARAMS })).rejects.toThrow(/scan .*in progress/i);
  });

  it('pruneSupersededScans keeps only the latest', async () => {
    const first = await sut.createScan({ requestedBy: null, params: PARAMS });
    await sut.completeScan(first.id, { totals: zeroTotals(), persons: [] });
    const second = await sut.createScan({ requestedBy: null, params: PARAMS });
    await sut.completeScan(second.id, { totals: zeroTotals(), persons: [] });

    await sut.pruneSupersededScans();
    expect(await sut.getScanById(first.id)).toBeUndefined();
    const latestAfterPrune = await sut.getLatestScan();
    expect(latestAfterPrune?.id).toBe(second.id);
  });

  describe('enrichReportPersons', () => {
    let ownerId: string;
    let p: { id: string; faceAssetId: string | null; name: string };
    let unnamed: { id: string; faceAssetId: string | null; name: string };
    let q: { id: string; faceAssetId: string | null; name: string };

    beforeAll(async () => {
      // Create owner user
      const user = mediumFactory.userInsert({});
      await db.insertInto('user').values(user).execute();
      ownerId = user.id;

      // Person p: named 'Jula', will get a faceAssetId via asset_face
      const pData = mediumFactory.personInsert({ ownerId, name: 'Jula' });
      await db.insertInto('person').values(pData).execute();

      // Create an asset + asset_face for p, then link faceAssetId
      const pAsset = mediumFactory.assetInsert({ ownerId });
      await db.insertInto('asset').values(pAsset).execute();
      const pFace = mediumFactory.assetFaceInsert({ assetId: pAsset.id, personId: pData.id });
      await db.insertInto('asset_face').values(pFace).execute();
      await db.updateTable('person').set({ faceAssetId: pFace.id }).where('id', '=', pData.id).execute();
      p = { id: pData.id, faceAssetId: pFace.id, name: 'Jula' };

      // Person unnamed: name = '' (empty string → null after enrich)
      const unnamedData = mediumFactory.personInsert({ ownerId, name: '' });
      // personInsert spreads `name: ''` last so it overrides the default 'Test Name'
      await db
        .insertInto('person')
        .values({ ...unnamedData, name: '' })
        .execute();
      unnamed = { id: unnamedData.id, faceAssetId: null, name: '' };

      // Person q: suspected owner, no faceAssetId
      const qData = mediumFactory.personInsert({ ownerId });
      await db.insertInto('person').values(qData).execute();
      q = { id: qData.id, faceAssetId: null, name: qData.name };
    });

    afterEach(async () => {
      await db.deleteFrom('face_repair_scan').execute();
    });

    it('enriches persons with names + thumbnails; null name and null thumbnail survive', async () => {
      const enriched = await sut.enrichReportPersons([
        { personId: p.id, eligible: 10, flagged: 8, flaggedFraction: 0.8, suspectedOwnerIds: [q.id] },
        { personId: unnamed.id, eligible: 4, flagged: 3, flaggedFraction: 0.75, suspectedOwnerIds: [] },
      ]);

      const enrichedP = enriched.find((row) => row.personId === p.id)!;
      expect(enrichedP.personName).toBe('Jula');
      expect(enrichedP.ownerId).toBe(ownerId);
      expect(enrichedP.thumbnailFaceId).toBe(p.faceAssetId);
      expect(enrichedP.suspectedOwners).toEqual([
        { ownerPersonId: q.id, ownerName: q.name ?? null, thumbnailFaceId: null, count: 1 },
      ]);

      const enrichedUnnamed = enriched.find((row) => row.personId === unnamed.id)!;
      expect(enrichedUnnamed.personName).toBeNull();
    });

    it('round-trips a 600+ person report through jsonb without loss', async () => {
      const persons: RepairScanPerson[] = Array.from({ length: 600 }, (_, i) => ({
        personId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        ownerId,
        personName: i % 2 === 0 ? `P${i}` : null,
        faceCount: i,
        thumbnailFaceId: null,
        eligible: i + 1,
        flagged: i,
        flaggedFraction: i / (i + 1),
        suspectedOwners: [],
        recommendation: 'confident',
        reviewReasons: [],
      }));
      const scan = await sut.createScan({ requestedBy: null, params: PARAMS });
      await sut.completeScan(scan.id, { totals: zeroTotals(), persons });
      const row = await sut.getScanById(scan.id);
      expect(row?.persons).toHaveLength(600);
      expect(row?.persons[599].personName).toBeNull();
    });
  });

  it('migration is reversible: down function exists and drops face_repair_scan', async () => {
    // Dynamic import of migration via path alias causes TS2307 under moduleResolution:node16,
    // so we assert reversibility by inspecting the migration source instead of executing it.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    // eslint-disable-next-line unicorn/prefer-module
    const thisDir = __dirname;
    const migrationPath = resolve(
      thisDir,
      '../../../../src/schema/migrations-gallery/1780000000000-AddFaceRepairScan.ts',
    );
    const source = readFileSync(migrationPath, 'utf8');
    expect(source).toContain('export async function down');
    expect(source).toContain('DROP TABLE');
    expect(source).toContain('face_repair_scan');
  });
});
