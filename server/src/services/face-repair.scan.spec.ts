import { EligibleFaceRow } from 'src/repositories/face-repair.repository';
import { FaceRepairService, RepairPlan } from 'src/services/face-repair.service';
import { newTestService, ServiceMocks } from 'test/utils';

/** Sync iterable that yields one eligible face row for the progress test. */
function* singleFaceStream(): Iterable<EligibleFaceRow> {
  yield { assetFaceId: 'face-1', ownerId: 'user-1', personId: 'P', embedding: '[0.1,0.2,0.3]' };
}

/** A minimal RepairPlan with one flagged person P → suspected owner Q */
const makePlan = (): RepairPlan => ({
  toRepair: [{ assetFaceId: 'face-1', currentPersonId: 'P', suspectedOwnerId: 'Q' }],
  reviewOnlyFaces: [],
  reviewOnlyPersonIds: [],
  unAttributableFaces: [],
  perPerson: [
    { personId: 'P', eligible: 5, flagged: 1, flaggedFraction: 0.2 },
    { personId: 'Q', eligible: 8, flagged: 0, flaggedFraction: 0 },
  ],
});

describe(FaceRepairService.name, () => {
  let sut: FaceRepairService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(FaceRepairService));

    // Default: no stored scan row → params come from config defaults
    mocks.systemMetadata.get.mockResolvedValue(null);
    mocks.faceRepairScan.getScanById.mockResolvedValue();
    mocks.faceRepairScan.updateScanProgress.mockResolvedValue();
    mocks.faceRepairScan.completeScan.mockResolvedValue();
    mocks.faceRepairScan.failScan.mockResolvedValue();
    mocks.faceRepairScan.pruneSupersededScans.mockResolvedValue();

    // Default eligible-face count
    mocks.faceRepair.countEligibleFaces.mockResolvedValue(5);

    // Default enriched persons — recommendation placeholder will be OVERWRITTEN by classifier
    mocks.faceRepairScan.enrichReportPersons.mockResolvedValue([
      {
        personId: 'P',
        ownerId: 'user-1',
        personName: 'Jula',
        faceCount: 5,
        thumbnailFaceId: null,
        eligible: 5,
        flagged: 1,
        flaggedFraction: 0.2,
        suspectedOwners: [{ ownerPersonId: 'Q', ownerName: null, thumbnailFaceId: null, count: 1 }],
        recommendation: 'confident', // placeholder — runScan overwrites this
        reviewReasons: [],
      },
    ]);
  });

  describe('runScan', () => {
    it('marks running, builds+classifies+enriches, persists completed, prunes', async () => {
      // Stub buildRepairPlan to return a fixed plan (avoids wiring streamEligibleFaces / searchFaces)
      vi.spyOn(sut, 'buildRepairPlan').mockResolvedValue(makePlan());

      await sut.runScan('scan-1');

      expect(mocks.faceRepairScan.updateScanProgress).toHaveBeenCalledWith(
        'scan-1',
        expect.objectContaining({ status: 'running' }),
      );

      // completeScan called with classified persons — 'Jula' is named → review-first
      expect(mocks.faceRepairScan.completeScan).toHaveBeenCalledWith(
        'scan-1',
        expect.objectContaining({
          totals: expect.any(Object),
          persons: expect.arrayContaining([
            expect.objectContaining({
              personId: 'P',
              recommendation: 'review-first',
              reviewReasons: expect.arrayContaining(['named']),
            }),
          ]),
        }),
      );

      expect(mocks.faceRepairScan.pruneSupersededScans).toHaveBeenCalled();
    });

    it('reports progress at least once during the stream', async () => {
      // Let buildRepairPlan run for real — mock its underlying repos so one candidate flows through.
      mocks.faceRepair.streamEligibleFaces.mockReturnValue(singleFaceStream());
      mocks.search.searchFaces.mockResolvedValue([]);

      await sut.runScan('scan-1');

      // updateScanProgress should have been called with a progress payload (onProgress fired)
      expect(mocks.faceRepairScan.updateScanProgress).toHaveBeenCalledWith(
        'scan-1',
        expect.objectContaining({ progress: expect.objectContaining({ total: expect.any(Number) }) }),
      );
    });

    it('marks the scan failed and rethrows on error', async () => {
      vi.spyOn(sut, 'buildRepairPlan').mockResolvedValue(makePlan());
      mocks.faceRepairScan.completeScan.mockRejectedValue(new Error('boom'));

      await expect(sut.runScan('scan-1')).rejects.toThrow('boom');

      expect(mocks.faceRepairScan.failScan).toHaveBeenCalledWith('scan-1', expect.stringContaining('boom'));
    });
  });
});
