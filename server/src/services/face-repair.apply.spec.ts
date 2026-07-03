import { BadRequestException, ConflictException } from '@nestjs/common';
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

// Async-iterable stub for streamEligibleFaces mocks (no async generator → satisfies require-await).
const asyncIterableOf = <T>(items: T[]): AsyncIterableIterator<T> => {
  let index = 0;
  const iterator: AsyncIterableIterator<T> = {
    next: () =>
      Promise.resolve(
        index < items.length
          ? { value: items[index++], done: false }
          : { value: undefined as unknown as T, done: true },
      ),
    [Symbol.asyncIterator]() {
      return iterator;
    },
  };
  return iterator;
};

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

    it('rejects a self-move (destination === source) with BadRequestException (E18)', async () => {
      await expect(
        sut.applyRepair({
          approvedPersonIds: [],
          manualMove: { personId: 'p1', destinationPersonId: 'p1', entireCluster: true },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mocks.job.isActive).not.toHaveBeenCalled();
    });

    it('entire-cluster (empty approvedPersonIds): still runs the 409 guard (E10)', async () => {
      mocks.job.isActive.mockResolvedValue(true);
      await expect(
        sut.applyRepair({
          approvedPersonIds: [],
          manualMove: { personId: 'p1', destinationPersonId: 'q', entireCluster: true },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('entire-cluster: enumerates eligible faces → routes all to destination; no flagged plan built (E4)', async () => {
      mocks.faceRepair.streamEligibleFaces.mockReturnValue(
        asyncIterableOf([
          { assetFaceId: 'a', personId: 'p1', ownerId: 'o', embedding: '' },
          { assetFaceId: 'b', personId: 'p1', ownerId: 'o', embedding: '' },
        ]),
      );
      const planSpy = vi.spyOn(sut, 'buildRepairPlan');
      const execSpy = vi.spyOn(sut, 'executeRepair').mockResolvedValue({ moved: 2, skipped: 0 });
      mocks.faceRepair.countEligibleFaces.mockResolvedValue(0);
      mocks.person.getById.mockResolvedValue({ id: 'p1', name: '' } as any);

      const r = await sut.applyRepair({
        approvedPersonIds: [],
        manualMove: { personId: 'p1', destinationPersonId: 'q', entireCluster: true },
      });

      expect(planSpy).not.toHaveBeenCalled();
      expect(execSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toRepair: [
            { assetFaceId: 'a', currentPersonId: 'p1', suspectedOwnerId: 'q' },
            { assetFaceId: 'b', currentPersonId: 'p1', suspectedOwnerId: 'q' },
          ],
        }),
      );
      expect(r).toEqual({ moved: 2, skipped: 0 });
    });

    it('entireCluster supersedes faceIds when both are supplied (E19)', async () => {
      mocks.faceRepair.streamEligibleFaces.mockReturnValue(
        asyncIterableOf([{ assetFaceId: 'a', personId: 'p1', ownerId: 'o', embedding: '' }]),
      );
      const execSpy = vi.spyOn(sut, 'executeRepair').mockResolvedValue({ moved: 1, skipped: 0 });
      mocks.faceRepair.countEligibleFaces.mockResolvedValue(0);
      mocks.person.getById.mockResolvedValue({ id: 'p1', name: '' } as any);

      await sut.applyRepair({
        approvedPersonIds: [],
        manualMove: { personId: 'p1', destinationPersonId: 'q', faceIds: ['ignored'], entireCluster: true },
      });

      expect(execSpy.mock.calls[0][0].toRepair).toEqual([
        { assetFaceId: 'a', currentPersonId: 'p1', suspectedOwnerId: 'q' },
      ]);
    });

    it('partial add: merges flagged (→ suspects) and manual picks (→ primary) into one executeRepair (E5)', async () => {
      mocks.faceRepairScan.getLatestScan.mockResolvedValue({ status: 'completed' } as any);
      vi.spyOn(sut, 'buildRepairPlan').mockResolvedValue(
        plan([{ assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'qsuspect' }]),
      );
      const execSpy = vi.spyOn(sut, 'executeRepair').mockResolvedValue({ moved: 2, skipped: 0 });
      mocks.faceRepair.countEligibleFaces.mockResolvedValue(5);

      await sut.applyRepair({
        approvedPersonIds: ['p1'],
        manualMove: { personId: 'p1', destinationPersonId: 'primary', faceIds: ['m1'] },
      });

      expect(execSpy).toHaveBeenCalledTimes(1);
      expect(execSpy.mock.calls[0][0].toRepair).toEqual([
        { assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'qsuspect' },
        { assetFaceId: 'm1', currentPersonId: 'p1', suspectedOwnerId: 'primary' },
      ]);
      expect(mocks.person.delete).not.toHaveBeenCalled(); // source survives (E5)
    });

    it('auto-deletes an emptied UNNAMED source and drops it from the snapshot (E4)', async () => {
      mocks.faceRepair.streamEligibleFaces.mockReturnValue(
        asyncIterableOf([{ assetFaceId: 'a', personId: 'p1', ownerId: 'o', embedding: '' }]),
      );
      vi.spyOn(sut, 'executeRepair').mockResolvedValue({ moved: 1, skipped: 0 });
      mocks.faceRepair.countEligibleFaces.mockResolvedValue(0);
      mocks.person.getById.mockResolvedValue({ id: 'p1', name: '' } as any);

      await sut.applyRepair({
        approvedPersonIds: [],
        manualMove: { personId: 'p1', destinationPersonId: 'q', entireCluster: true },
      });

      expect(mocks.person.delete).toHaveBeenCalledWith(['p1']);
      expect(mocks.faceRepairScan.removePersonsFromLatestScan).toHaveBeenCalledWith(['p1']);
    });

    it('keeps an emptied NAMED source (not deleted) but still drops it from the snapshot (E12)', async () => {
      mocks.faceRepair.streamEligibleFaces.mockReturnValue(
        asyncIterableOf([{ assetFaceId: 'a', personId: 'p1', ownerId: 'o', embedding: '' }]),
      );
      vi.spyOn(sut, 'executeRepair').mockResolvedValue({ moved: 1, skipped: 0 });
      mocks.faceRepair.countEligibleFaces.mockResolvedValue(0);
      mocks.person.getById.mockResolvedValue({ id: 'p1', name: 'Pierre' } as any);

      await sut.applyRepair({
        approvedPersonIds: [],
        manualMove: { personId: 'p1', destinationPersonId: 'q', entireCluster: true },
      });

      expect(mocks.person.delete).not.toHaveBeenCalled();
      expect(mocks.faceRepairScan.removePersonsFromLatestScan).toHaveBeenCalledWith(['p1']);
    });

    it('empty manualMove (no faceIds, entireCluster false) + empty approvedPersonIds → no-op, no guards (E11)', async () => {
      const r = await sut.applyRepair({
        approvedPersonIds: [],
        manualMove: { personId: 'p1', destinationPersonId: 'q' },
      });
      expect(r).toEqual({ moved: 0, skipped: 0 });
      expect(mocks.job.isActive).not.toHaveBeenCalled();
    });

    it('idempotency: person in approvedPersonIds AND entireCluster passes both sets to one executeRepair (E9)', async () => {
      mocks.faceRepairScan.getLatestScan.mockResolvedValue({ status: 'completed' } as any);
      vi.spyOn(sut, 'buildRepairPlan').mockResolvedValue(
        plan([{ assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'qsuspect' }]),
      );
      mocks.faceRepair.streamEligibleFaces.mockReturnValue(
        asyncIterableOf([
          { assetFaceId: 'f1', personId: 'p1', ownerId: 'o', embedding: '' },
          { assetFaceId: 'f2', personId: 'p1', ownerId: 'o', embedding: '' },
        ]),
      );
      const execSpy = vi.spyOn(sut, 'executeRepair').mockResolvedValue({ moved: 2, skipped: 0 });
      mocks.faceRepair.countEligibleFaces.mockResolvedValue(0);
      mocks.person.getById.mockResolvedValue({ id: 'p1', name: '' } as any);

      await sut.applyRepair({
        approvedPersonIds: ['p1'],
        manualMove: { personId: 'p1', destinationPersonId: 'q', entireCluster: true },
      });

      // applyRepair passes both sets to ONE executeRepair; the still-on-source re-check (real DB, Slice 4)
      // makes the duplicate f1 a no-op so it moves once.
      expect(execSpy).toHaveBeenCalledTimes(1);
      expect(execSpy.mock.calls[0][0].toRepair).toEqual([
        { assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'qsuspect' },
        { assetFaceId: 'f1', currentPersonId: 'p1', suspectedOwnerId: 'q' },
        { assetFaceId: 'f2', currentPersonId: 'p1', suspectedOwnerId: 'q' },
      ]);
    });
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

      expect(mocks.faceRepair.reattributeFaces).toHaveBeenCalledWith('p1', 'q', ['f1', 'f2']);
      expect(mocks.faceIdentity.replaceFaceIdentities).toHaveBeenCalledWith({
        assetFaceIds: ['f1', 'f2'],
        identityId: 'identQ',
        source: 'manual',
      });
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
