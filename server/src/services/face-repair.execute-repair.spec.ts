import { JobName } from 'src/enum';
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

    // executeRepair wraps each route's writes in a transaction — run the callback with a stub trx.
    mocks.database.transaction.mockImplementation((cb: any) => cb({}));
  });

  describe('executeRepair', () => {
    it('direct-assigns each flagged face to its suspected owner with a manual identity link', async () => {
      mocks.person.getById.mockResolvedValue({ id: 'q' } as any);
      mocks.faceRepair.reattributeFaces.mockResolvedValue(['f1', 'f2']);
      mocks.faceRepair.reconcileRepresentativeFaces.mockResolvedValue([]);
      mocks.faceIdentity.ensurePersonIdentity.mockResolvedValue({ id: 'identQ' } as any);

      const r = await sut.executeRepair(
        plan([
          { assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'q' },
          { assetFaceId: 'f2', currentPersonId: 'p1', suspectedOwnerId: 'q' },
        ]),
      );

      // Called inside a transaction — the 4th/2nd arg is the trx handle.
      expect(mocks.faceRepair.reattributeFaces).toHaveBeenCalledWith('p1', 'q', ['f1', 'f2'], expect.anything());
      expect(mocks.faceIdentity.replaceFaceIdentities).toHaveBeenCalledWith(
        {
          assetFaceIds: ['f1', 'f2'],
          identityId: 'identQ',
          source: 'manual',
        },
        expect.anything(),
      );
      // Never re-queues facial recognition — that is what re-clustered faces back to the wrong person.
      // (queueAll is only used for thumbnail regen, and only when a representative face was repointed.)
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
      mocks.faceRepair.reconcileRepresentativeFaces.mockResolvedValue([]);
      mocks.faceIdentity.ensurePersonIdentity.mockResolvedValue({ id: 'identQ' } as any);

      await sut.executeRepair(plan([{ assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'q' }]));

      const reconciled = mocks.faceRepair.reconcileRepresentativeFaces.mock.calls[0][0] as string[];
      expect(reconciled.toSorted()).toEqual(['p1', 'q']);
    });

    it('queues a thumbnail regen for every person whose representative face was repointed', async () => {
      mocks.person.getById.mockResolvedValue({ id: 'q' } as any);
      mocks.faceRepair.reattributeFaces.mockResolvedValue(['f1']);
      mocks.faceRepair.reconcileRepresentativeFaces.mockResolvedValue(['p1']);
      mocks.faceIdentity.ensurePersonIdentity.mockResolvedValue({ id: 'identQ' } as any);

      await sut.executeRepair(plan([{ assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'q' }]));

      // Without this the source person's card keeps showing the crop of the face that just moved away.
      expect(mocks.job.queueAll).toHaveBeenCalledWith([{ name: JobName.PersonGenerateThumbnail, data: { id: 'p1' } }]);
    });
  });
});
