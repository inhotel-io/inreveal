import { Kysely } from 'kysely';
import { FaceRepairScanRepository, RepairScanParams } from 'src/repositories/face-repair-scan.repository';
import { DB } from 'src/schema';
import { getKyselyDB } from 'test/utils';
import { beforeAll, describe, expect, it } from 'vitest';

const PARAMS: RepairScanParams = {
  maxDistance: 0.5,
  minFaces: 3,
  voteWindow: 200,
  voteMargin: 2,
  maxAttributionDistance: 0.35,
  maxFlaggedFraction: 0.5,
  largeClusterThreshold: 50,
};

describe(FaceRepairScanRepository.name, () => {
  let db: Kysely<DB>;
  let sut: FaceRepairScanRepository;

  beforeAll(async () => {
    db = await getKyselyDB();
    sut = new FaceRepairScanRepository(db);
  });

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
});
