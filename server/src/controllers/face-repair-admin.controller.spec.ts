import { FaceRepairAdminController } from 'src/controllers/face-repair-admin.controller';
import { FaceRepairService } from 'src/services/face-repair.service';
import request from 'supertest';
import { errorDto } from 'test/medium/responses';
import { ControllerContext, controllerSetup, mockBaseService } from 'test/utils';

describe(FaceRepairAdminController.name, () => {
  let ctx: ControllerContext;
  const service = mockBaseService(FaceRepairService);

  beforeAll(async () => {
    ctx = await controllerSetup(FaceRepairAdminController, [{ provide: FaceRepairService, useValue: service }]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.resetAllMocks();
    ctx.reset();
  });

  describe('POST /admin/face-repair', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).post('/admin/face-repair');
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it('should call runRepair with dryRun: true by default', async () => {
      const result = {
        dryRun: true,
        mutated: false,
        report: {
          totals: {
            eligibleFaces: 0,
            flaggedFaces: 0,
            toRepair: 0,
            reviewOnlyFaces: 0,
            reviewOnlyPersons: 0,
            affectedPersons: 0,
          },
          persons: [],
        },
      };
      service.runRepair.mockResolvedValue(result);

      const { status, body } = await request(ctx.getHttpServer())
        .post('/admin/face-repair')
        .set('Authorization', 'Bearer token')
        .send({});
      expect(status).toBe(201);
      expect(service.runRepair).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
      expect(body).toMatchObject({ dryRun: true, mutated: false });
    });

    it('should reject maxFlaggedFraction > 1 with a 400', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/admin/face-repair')
        .set('Authorization', 'Bearer token')
        .send({ maxFlaggedFraction: 2 });
      expect(status).toBe(400);
      expect(body).toEqual(
        errorDto.badRequest(expect.arrayContaining([expect.stringContaining('maxFlaggedFraction')])),
      );
      expect(service.runRepair).not.toHaveBeenCalled();
    });
  });
});
