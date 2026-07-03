import { FaceRepairService } from 'src/services/face-repair.service';
import { newTestService, ServiceMocks } from 'test/utils';

describe(FaceRepairService.name, () => {
  let sut: FaceRepairService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(FaceRepairService));
    mocks.systemMetadata.get.mockResolvedValue(null);
  });

  describe('getPersonFlaggedFaces', () => {
    it('returns flaggedFaces combining toRepair and reviewOnlyFaces for the given personId', async () => {
      vi.spyOn(sut, 'buildRepairPlan').mockResolvedValue({
        toRepair: [{ assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'q1' }],
        reviewOnlyFaces: [{ assetFaceId: 'f2', currentPersonId: 'p1', suspectedOwnerId: 'q2', reason: 'over-cap' }],
        reviewOnlyPersonIds: [],
        unAttributableFaces: [],
        perPerson: [],
      } as any);

      const result = await sut.getPersonFlaggedFaces('p1');

      expect(result).toEqual({
        personId: 'p1',
        flaggedFaces: [
          { assetFaceId: 'f1', suspectedOwnerId: 'q1' },
          { assetFaceId: 'f2', suspectedOwnerId: 'q2' },
        ],
      });
    });

    it('returns empty flaggedFaces when the person has no flagged faces', async () => {
      vi.spyOn(sut, 'buildRepairPlan').mockResolvedValue({
        toRepair: [],
        reviewOnlyFaces: [],
        reviewOnlyPersonIds: [],
        unAttributableFaces: [],
        perPerson: [],
      } as any);

      const result = await sut.getPersonFlaggedFaces('p-clean');

      expect(result).toEqual({ personId: 'p-clean', flaggedFaces: [] });
    });

    it('scopes buildRepairPlan to the given personId only', async () => {
      const spy = vi.spyOn(sut, 'buildRepairPlan').mockResolvedValue({
        toRepair: [],
        reviewOnlyFaces: [],
        reviewOnlyPersonIds: [],
        unAttributableFaces: [],
        perPerson: [],
      } as any);

      await sut.getPersonFlaggedFaces('person-xyz');

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ personIds: ['person-xyz'] }));
    });
  });
});
