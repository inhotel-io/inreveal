import { LibraryManifestController } from 'src/controllers/library-manifest.controller';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { LibraryManifestService } from 'src/services/library-manifest.service';
import request from 'supertest';
import { automock, ControllerContext, controllerSetup, mockBaseService } from 'test/utils';

describe(LibraryManifestController.name, () => {
  let ctx: ControllerContext;
  const service = mockBaseService(LibraryManifestService);

  beforeAll(async () => {
    ctx = await controllerSetup(LibraryManifestController, [
      { provide: LoggingRepository, useValue: automock(LoggingRepository, { strict: false }) },
      { provide: LibraryManifestService, useValue: service },
    ]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.resetAllMocks();
    ctx.reset();
  });

  describe('GET /admin/users/:id/library-manifest', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).get(`/admin/users/${'a'.repeat(8)}-0000-4000-8000-000000000000/library-manifest`);
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it('should reject a non-uuid :id with 400', async () => {
      const { status } = await request(ctx.getHttpServer()).get('/admin/users/not-a-uuid/library-manifest');
      expect(status).toBe(400);
    });

    it('rejects an invalid cursor with 400', async () => {
      const { status } = await request(ctx.getHttpServer()).get(
        `/admin/users/aaaaaaaa-0000-4000-8000-000000000000/library-manifest?cursor=not-a-uuid`,
      );
      expect(status).toBe(400);
    });
  });
});
