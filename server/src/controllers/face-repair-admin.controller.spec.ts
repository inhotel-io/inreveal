import { FaceRepairAdminController } from 'src/controllers/face-repair-admin.controller';
import { FaceRepairService } from 'src/services/face-repair.service';
import request from 'supertest';
import { factory } from 'test/small.factory';
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
            reviewOnlyByReason: { overCap: 0, badTarget: 0, unAttributable: 0 },
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
        factory.responses.validationError([
          { path: ['maxFlaggedFraction'], message: 'Too big: expected number to be <=1' },
        ]),
      );
      expect(service.runRepair).not.toHaveBeenCalled();
    });

    const invalidCases: Array<[string, Record<string, unknown>]> = [
      ['maxDistance: 0', { maxDistance: 0 }],
      ['maxDistance: 3', { maxDistance: 3 }],
      ['voteMargin: -1', { voteMargin: -1 }],
      ['minFaces: 0', { minFaces: 0 }],
      ['maxAttributionDistance: 0', { maxAttributionDistance: 0 }],
      ['maxAttributionDistance: 3', { maxAttributionDistance: 3 }],
    ];

    for (const [label, body] of invalidCases) {
      it(`should reject invalid param ${label} with a 400`, async () => {
        const { status } = await request(ctx.getHttpServer())
          .post('/admin/face-repair')
          .set('Authorization', 'Bearer token')
          .send(body);
        expect(status).toBe(400);
        expect(service.runRepair).not.toHaveBeenCalled();
      });
    }

    it('should pass through explicit params to service.runRepair', async () => {
      const result = {
        dryRun: false,
        mutated: true,
        executed: { moved: 3, skipped: 0 },
        report: {
          totals: {
            eligibleFaces: 50,
            flaggedFaces: 3,
            toRepair: 3,
            reviewOnlyFaces: 0,
            reviewOnlyPersons: 0,
            affectedPersons: 1,
            reviewOnlyByReason: { overCap: 0, badTarget: 0, unAttributable: 0 },
          },
          persons: [],
        },
      };
      service.runRepair.mockResolvedValue(result);

      const ownerId = '00000000-0000-4000-a000-000000000001';
      const { status } = await request(ctx.getHttpServer())
        .post('/admin/face-repair')
        .set('Authorization', 'Bearer token')
        .send({ dryRun: false, ownerId, maxDistance: 0.4, voteMargin: 3 });
      expect(status).toBe(201);
      expect(service.runRepair).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: false, ownerId, maxDistance: 0.4, voteMargin: 3 }),
      );
    });
  });

  describe('POST /admin/face-repair/scan', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).post('/admin/face-repair/scan');
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it('delegates a no-body scan (quick path) with undefined params', async () => {
      ctx.authenticate.mockResolvedValue({ user: { id: '00000000-0000-4000-a000-000000000001' } });
      service.triggerScan.mockResolvedValue({ scanId: 's1' });
      const { status } = await request(ctx.getHttpServer())
        .post('/admin/face-repair/scan')
        .set('Authorization', 'Bearer token')
        .send({});
      expect(status).toBe(201);
      expect(service.triggerScan).toHaveBeenCalledWith(expect.any(String), undefined);
    });

    it('delegates tuned params to the service', async () => {
      ctx.authenticate.mockResolvedValue({ user: { id: '00000000-0000-4000-a000-000000000001' } });
      service.triggerScan.mockResolvedValue({ scanId: 's2' });
      const params = { maxDistance: 0.4, minFaces: 5, maxFlaggedFraction: 0.3 };
      const { status } = await request(ctx.getHttpServer())
        .post('/admin/face-repair/scan')
        .set('Authorization', 'Bearer token')
        .send({ params });
      expect(status).toBe(201);
      expect(service.triggerScan).toHaveBeenCalledWith(expect.any(String), params);
    });

    it('rejects out-of-range params with 400', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post('/admin/face-repair/scan')
        .set('Authorization', 'Bearer token')
        .send({ params: { maxDistance: 9 } });
      expect(status).toBe(400);
      expect(service.triggerScan).not.toHaveBeenCalled();
    });
  });

  describe('GET /admin/face-repair/scan/defaults', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).get('/admin/face-repair/scan/defaults');
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it('delegates to service.getScanDefaults', async () => {
      service.getScanDefaults.mockResolvedValue({ maxDistance: 0.5, minFaces: 3, maxFlaggedFraction: 0.5 });
      const { status, body } = await request(ctx.getHttpServer())
        .get('/admin/face-repair/scan/defaults')
        .set('Authorization', 'Bearer token');
      expect(status).toBe(200);
      expect(body).toMatchObject({ maxDistance: 0.5, minFaces: 3, maxFlaggedFraction: 0.5 });
    });
  });

  describe('POST /admin/face-repair/decline', () => {
    const uuid1 = '00000000-0000-4000-a000-000000000001';
    const uuid2 = '00000000-0000-4000-a000-000000000002';
    const adminUserId = '00000000-0000-4000-a000-000000000099';

    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).post('/admin/face-repair/decline');
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it('should delegate to service.createDeclines with auth user id', async () => {
      ctx.authenticate.mockResolvedValue({ user: { id: adminUserId } });
      service.createDeclines.mockResolvedValue({ created: 1 });
      const { status } = await request(ctx.getHttpServer())
        .post('/admin/face-repair/decline')
        .set('Authorization', 'Bearer token')
        .send({ faces: [{ assetFaceId: uuid1, suspectedOwnerId: uuid2 }] });
      expect(status).toBe(201);
      expect(service.createDeclines).toHaveBeenCalledWith(
        expect.objectContaining({ faces: [{ assetFaceId: uuid1, suspectedOwnerId: uuid2 }], declinedBy: adminUserId }),
      );
    });

    it('should reject a non-uuid assetFaceId with 400', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post('/admin/face-repair/decline')
        .set('Authorization', 'Bearer token')
        .send({ faces: [{ assetFaceId: 'not-a-uuid', suspectedOwnerId: uuid2 }] });
      expect(status).toBe(400);
      expect(service.createDeclines).not.toHaveBeenCalled();
    });
  });

  describe('GET /admin/face-repair/decline', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).get('/admin/face-repair/decline');
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it('should delegate to service.listDeclines', async () => {
      service.listDeclines.mockResolvedValue({ declines: [] });
      const { status, body } = await request(ctx.getHttpServer())
        .get('/admin/face-repair/decline')
        .set('Authorization', 'Bearer token');
      expect(status).toBe(200);
      expect(service.listDeclines).toHaveBeenCalled();
      expect(body).toMatchObject({ declines: [] });
    });
  });

  describe('POST /admin/face-repair/scan/person/:personId/cluster-faces', () => {
    const personId = '00000000-0000-4000-a000-000000000010';
    const faceId = '00000000-0000-4000-a000-000000000011';

    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).post(`/admin/face-repair/scan/person/${personId}/cluster-faces`);
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it('delegates to service.getClusterFaces and returns the page', async () => {
      service.getClusterFaces.mockResolvedValue({ faces: [{ assetFaceId: faceId }], total: 1, hasMore: false });
      const { status, body } = await request(ctx.getHttpServer())
        .post(`/admin/face-repair/scan/person/${personId}/cluster-faces`)
        .set('Authorization', 'Bearer token')
        .send({ excludeFaceIds: [faceId], page: 0, size: 50 });
      expect(status).toBe(201);
      expect(service.getClusterFaces).toHaveBeenCalledWith(personId, {
        excludeFaceIds: [faceId],
        page: 0,
        size: 50,
      });
      expect(body).toMatchObject({ faces: [{ assetFaceId: faceId }], total: 1, hasMore: false });
    });

    it('rejects size out of range with 400 (E14)', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post(`/admin/face-repair/scan/person/${personId}/cluster-faces`)
        .set('Authorization', 'Bearer token')
        .send({ page: 0, size: 0 });
      expect(status).toBe(400);
      expect(service.getClusterFaces).not.toHaveBeenCalled();
    });

    it('rejects a negative page with 400 (E14)', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post(`/admin/face-repair/scan/person/${personId}/cluster-faces`)
        .set('Authorization', 'Bearer token')
        .send({ page: -1, size: 50 });
      expect(status).toBe(400);
      expect(service.getClusterFaces).not.toHaveBeenCalled();
    });

    it('rejects a non-uuid personId with 400', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post('/admin/face-repair/scan/person/not-a-uuid/cluster-faces')
        .set('Authorization', 'Bearer token')
        .send({ page: 0, size: 50 });
      expect(status).toBe(400);
      expect(service.getClusterFaces).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/face-repair/apply', () => {
    const personId = '00000000-0000-4000-a000-000000000020';
    const destId = '00000000-0000-4000-a000-000000000021';

    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).post('/admin/face-repair/apply');
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it('delegates the legacy flagged-only apply to service.applyRepair', async () => {
      service.applyRepair.mockResolvedValue({ moved: 2, skipped: 0 });
      const { status } = await request(ctx.getHttpServer())
        .post('/admin/face-repair/apply')
        .set('Authorization', 'Bearer token')
        .send({ approvedPersonIds: [personId] });
      expect(status).toBe(201);
      expect(service.applyRepair).toHaveBeenCalledWith(expect.objectContaining({ approvedPersonIds: [personId] }));
    });

    it('passes a manualMove block (empty approvedPersonIds) through to service.applyRepair', async () => {
      service.applyRepair.mockResolvedValue({ moved: 5, skipped: 0 });
      const manualMove = { personId, destinationPersonId: destId, entireCluster: true };
      const { status } = await request(ctx.getHttpServer())
        .post('/admin/face-repair/apply')
        .set('Authorization', 'Bearer token')
        .send({ approvedPersonIds: [], manualMove });
      expect(status).toBe(201);
      expect(service.applyRepair).toHaveBeenCalledWith(expect.objectContaining({ manualMove }));
    });

    it('rejects empty approvedPersonIds with no manualMove (400, refine)', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post('/admin/face-repair/apply')
        .set('Authorization', 'Bearer token')
        .send({ approvedPersonIds: [] });
      expect(status).toBe(400);
      expect(service.applyRepair).not.toHaveBeenCalled();
    });

    it('rejects a manualMove missing destinationPersonId with 400 (E17)', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post('/admin/face-repair/apply')
        .set('Authorization', 'Bearer token')
        .send({ approvedPersonIds: [], manualMove: { personId, entireCluster: true } });
      expect(status).toBe(400);
      expect(service.applyRepair).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /admin/face-repair/decline', () => {
    const uuid1 = '00000000-0000-4000-a000-000000000001';

    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).delete('/admin/face-repair/decline');
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it('should delegate to service.removeDeclines (by id)', async () => {
      service.removeDeclines.mockResolvedValue({ removed: 1 });
      const { status } = await request(ctx.getHttpServer())
        .delete('/admin/face-repair/decline')
        .set('Authorization', 'Bearer token')
        .send({ ids: [uuid1] });
      expect(status).toBe(200);
      expect(service.removeDeclines).toHaveBeenCalledWith({ ids: [uuid1] });
    });

    it('should accept a v7 row id (face_repair_decline.id is uuid v7)', async () => {
      // Regression: z.uuidv4() rejected v7 ids → the declined-page Undo 400'd. z.uuid() must accept them.
      const uuidV7 = '01890000-0000-7000-8000-000000000001';
      service.removeDeclines.mockResolvedValue({ removed: 1 });
      const { status } = await request(ctx.getHttpServer())
        .delete('/admin/face-repair/decline')
        .set('Authorization', 'Bearer token')
        .send({ ids: [uuidV7] });
      expect(status).toBe(200);
      expect(service.removeDeclines).toHaveBeenCalledWith({ ids: [uuidV7] });
    });

    it('should delegate to service.removeDeclines (by face natural key)', async () => {
      const uuid2 = '00000000-0000-4000-a000-000000000002';
      service.removeDeclines.mockResolvedValue({ removed: 1 });
      const { status } = await request(ctx.getHttpServer())
        .delete('/admin/face-repair/decline')
        .set('Authorization', 'Bearer token')
        .send({ faces: [{ assetFaceId: uuid1, suspectedOwnerId: uuid2 }] });
      expect(status).toBe(200);
      expect(service.removeDeclines).toHaveBeenCalledWith({ faces: [{ assetFaceId: uuid1, suspectedOwnerId: uuid2 }] });
    });

    it('should reject empty ids array with 400', async () => {
      const { status } = await request(ctx.getHttpServer())
        .delete('/admin/face-repair/decline')
        .set('Authorization', 'Bearer token')
        .send({ ids: [] });
      expect(status).toBe(400);
      expect(service.removeDeclines).not.toHaveBeenCalled();
    });
  });
});
