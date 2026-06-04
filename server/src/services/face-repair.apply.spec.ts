import { ConflictException } from '@nestjs/common';
import { FaceRepairService } from 'src/services/face-repair.service';
import { newTestService, ServiceMocks } from 'test/utils';

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
      expect(r).toEqual({ unassigned: 0, requeued: 0 });
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
      mocks.job.isActive.mockResolvedValue(false);
      mocks.faceRepairScan.getLatestScan.mockResolvedValue({ status: 'completed' } as any);
      vi.spyOn(sut, 'buildRepairPlan').mockResolvedValue({
        toRepair: [
          { assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'q' },
          { assetFaceId: 'f2', currentPersonId: 'p1', suspectedOwnerId: 'q' },
        ],
        reviewOnlyFaces: [],
        reviewOnlyPersonIds: [],
        unAttributableFaces: [],
        perPerson: [],
      } as any);
      const execSpy = vi.spyOn(sut, 'executeRepair').mockResolvedValue({ unassigned: 1, requeued: 1 });
      await sut.applyRepair({ approvedPersonIds: ['p1'], excludeFaceIds: ['f2'] });
      expect(execSpy).toHaveBeenCalledWith(
        expect.objectContaining({ toRepair: [expect.objectContaining({ assetFaceId: 'f1' })] }),
      );
    });
  });
});
