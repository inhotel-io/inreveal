import { FaceRepairService } from 'src/services/face-repair.service';
import { newTestService } from 'test/utils';

describe(`${FaceRepairService.name}.getScanDefaults`, () => {
  it('returns config maxDistance/minFaces and the default flagged-fraction cap', async () => {
    const { sut } = newTestService(FaceRepairService);
    vi.spyOn(sut, 'getConfig').mockResolvedValue({
      machineLearning: { facialRecognition: { maxDistance: 0.5, minFaces: 3 } },
    } as any);

    const result = await sut.getScanDefaults();

    expect(result).toEqual({ maxDistance: 0.5, minFaces: 3, maxFlaggedFraction: 0.5 });
  });
});
