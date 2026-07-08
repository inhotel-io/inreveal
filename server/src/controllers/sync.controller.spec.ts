import { SyncController } from 'src/controllers/sync.controller';
import { GlobalExceptionFilter } from 'src/middleware/global-exception.filter';
import { SyncService } from 'src/services/sync.service';
import request from 'supertest';
import { errorDto } from 'test/medium/responses';
import { ControllerContext, controllerSetup, mockBaseService } from 'test/utils';

describe(SyncController.name, () => {
  let ctx: ControllerContext;
  const syncService = mockBaseService(SyncService);
  const errorService = { handleError: vi.fn() };

  beforeAll(async () => {
    ctx = await controllerSetup(SyncController, [
      { provide: SyncService, useValue: syncService },
      { provide: GlobalExceptionFilter, useValue: errorService },
    ]);
    return () => ctx.close();
  });

  beforeEach(() => {
    syncService.resetAllMocks();
    errorService.handleError.mockReset();
    ctx.reset();
  });

  describe('POST /sync/stream', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).post('/sync/stream');
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it('should reject a non-array types field (structural validation still fires)', async () => {
      // Unknown enum VALUES are now dropped by the SyncStreamDto preprocess filter
      // (mobile-1 skew safety) rather than 400-ing the whole request. A structurally
      // invalid `types` (not an array) still fails validation cleanly.
      const { status, body } = await request(ctx.getHttpServer())
        .post('/sync/stream')
        .send({ types: 'invalid' });
      expect(status).toBe(400);
      expect(body).toEqual(
        errorDto.validationError([{ path: ['types'], message: expect.stringContaining('array') }]),
      );
      expect(ctx.authenticate).toHaveBeenCalled();
    });
  });

  describe('GET /sync/ack', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).get('/sync/ack');
      expect(ctx.authenticate).toHaveBeenCalled();
    });
  });

  describe('POST /sync/ack', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).post('/sync/ack');
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it('should not allow more than 1,000 entries', async () => {
      const acks = Array.from({ length: 1001 }, (_, i) => `ack-${i}`);
      const { status, body } = await request(ctx.getHttpServer()).post('/sync/ack').send({ acks });
      expect(status).toBe(400);
      expect(body).toEqual(
        errorDto.validationError([{ path: ['acks'], message: 'Too big: expected array to have <=1000 items' }]),
      );
      expect(ctx.authenticate).toHaveBeenCalled();
    });
  });

  describe('DELETE /sync/ack', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).delete('/sync/ack');
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it('should require sync response type enums', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .delete('/sync/ack')
        .send({ types: ['invalid'] });
      expect(status).toBe(400);
      expect(body).toEqual(
        errorDto.validationError([
          { path: ['types', 0], message: expect.stringContaining('Invalid option: expected one of') },
        ]),
      );
      expect(ctx.authenticate).toHaveBeenCalled();
    });
  });
});
