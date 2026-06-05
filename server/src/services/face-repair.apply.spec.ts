import { ConflictException } from '@nestjs/common';
import { FaceRepairService } from 'src/services/face-repair.service';
import { newTestService, ServiceMocks } from 'test/utils';

const plan = (toRepair: { assetFaceId: string; currentPersonId: string; suspectedOwnerId: string }[]) =>
  ({
    toRepair,
    reviewOnlyFaces: [],
    reviewOnlyPersonIds: [],
    unAttributableFaces: [],
    perPerson: [],
  }) as any;

describe(FaceRepairService.name, () => {
  let sut: FaceRepairService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(FaceRepairService));

    mocks.systemMetadata.get.mockResolvedValue(null);
    mocks.job.isActive.mockResolvedValue(false);
    // eslint-disable-next-line unicorn/no-useless-undefined
    mocks.faceRepairScan.getLatestScan.mockResolvedValue(undefined);
  });

  describe('applyRepair', () => {
    it('empty approvedPersonIds → no-op, no plan built', async () => {
      const r = await sut.applyRepair({ approvedPersonIds: [] });
      expect(r).toEqual({ moved: 0, skipped: 0 });
      expect(mocks.job.isActive).not.toHaveBeenCalled();
    });

    it('refuses (409) while facial recognition is active — nothing mutated', async () => {
      mocks.job.isActive.mockResolvedValue(true);
      await expect(sut.applyRepair({ approvedPersonIds: ['p1'] })).rejects.toThrow(ConflictException);
    });

    it('refuses (409) while a scan is running', async () => {
      mocks.job.isActive.mockResolvedValue(false);
      mocks.faceRepairScan.getLatestScan.mockResolvedValue({ status: 'running' } as any);
      await expect(sut.applyRepair({ approvedPersonIds: ['p1'] })).rejects.toThrow(ConflictException);
    });

    it('drops excludeFaceIds from toRepair before executeRepair', async () => {
      mocks.faceRepairScan.getLatestScan.mockResolvedValue({ status: 'completed' } as any);
      vi.spyOn(sut, 'buildRepairPlan').mockResolvedValue(
        plan([
          { assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'q' },
          { assetFaceId: 'f2', currentPersonId: 'p1', suspectedOwnerId: 'q' },
        ]),
      );
      const execSpy = vi.spyOn(sut, 'executeRepair').mockResolvedValue({ moved: 1, skipped: 0 });
      await sut.applyRepair({ approvedPersonIds: ['p1'], excludeFaceIds: ['f2'] });
      expect(execSpy).toHaveBeenCalledWith(
        expect.objectContaining({ toRepair: [expect.objectContaining({ assetFaceId: 'f1' })] }),
      );
    });

    it('prunes the applied persons from the latest scan snapshot after a successful move', async () => {
      mocks.faceRepairScan.getLatestScan.mockResolvedValue({ status: 'completed' } as any);
      vi.spyOn(sut, 'buildRepairPlan').mockResolvedValue(
        plan([{ assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'q' }]),
      );
      vi.spyOn(sut, 'executeRepair').mockResolvedValue({ moved: 1, skipped: 0 });
      await sut.applyRepair({ approvedPersonIds: ['p1'] });
      expect(mocks.faceRepairScan.removePersonsFromLatestScan).toHaveBeenCalledWith(['p1']);
    });

    it('does not prune the scan when nothing moved', async () => {
      mocks.faceRepairScan.getLatestScan.mockResolvedValue({ status: 'completed' } as any);
      vi.spyOn(sut, 'buildRepairPlan').mockResolvedValue(
        plan([{ assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'gone' }]),
      );
      vi.spyOn(sut, 'executeRepair').mockResolvedValue({ moved: 0, skipped: 1 });
      await sut.applyRepair({ approvedPersonIds: ['p1'] });
      expect(mocks.faceRepairScan.removePersonsFromLatestScan).not.toHaveBeenCalled();
    });
  });

  describe('executeRepair', () => {
    it('direct-assigns each flagged face to its suspected owner with a manual identity link', async () => {
      mocks.person.getById.mockResolvedValue({ id: 'q' } as any);
      mocks.faceRepair.reattributeFaces.mockResolvedValue(['f1', 'f2']);
      mocks.faceIdentity.ensurePersonIdentity.mockResolvedValue({ id: 'identQ' } as any);

      const r = await sut.executeRepair(
        plan([
          { assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'q' },
          { assetFaceId: 'f2', currentPersonId: 'p1', suspectedOwnerId: 'q' },
        ]),
      );

      expect(mocks.faceRepair.reattributeFaces).toHaveBeenCalledWith('p1', 'q', ['f1', 'f2']);
      expect(mocks.faceIdentity.replaceFaceIdentity).toHaveBeenCalledWith({
        assetFaceId: 'f1',
        identityId: 'identQ',
        source: 'manual',
      });
      expect(mocks.faceIdentity.replaceFaceIdentity).toHaveBeenCalledWith({
        assetFaceId: 'f2',
        identityId: 'identQ',
        source: 'manual',
      });
      // Never re-queues facial recognition — that is what re-clustered faces back to the wrong person.
      expect(mocks.job.queueAll).not.toHaveBeenCalled();
      expect(r).toEqual({ moved: 2, skipped: 0 });
    });

    it('skips faces whose suspected owner no longer exists (deleted/merged since the scan)', async () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      mocks.person.getById.mockResolvedValue(undefined);

      const r = await sut.executeRepair(plan([{ assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'gone' }]));

      expect(mocks.faceRepair.reattributeFaces).not.toHaveBeenCalled();
      expect(r).toEqual({ moved: 0, skipped: 1 });
    });

    it('reconciles representative faces for both the source and the destination person', async () => {
      mocks.person.getById.mockResolvedValue({ id: 'q' } as any);
      mocks.faceRepair.reattributeFaces.mockResolvedValue(['f1']);
      mocks.faceIdentity.ensurePersonIdentity.mockResolvedValue({ id: 'identQ' } as any);

      await sut.executeRepair(plan([{ assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'q' }]));

      const reconciled = mocks.faceRepair.reconcileRepresentativeFaces.mock.calls[0][0] as string[];
      expect(reconciled.toSorted()).toEqual(['p1', 'q']);
    });
  });
});
