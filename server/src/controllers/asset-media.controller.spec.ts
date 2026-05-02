import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { AssetMediaController } from 'src/controllers/asset-media.controller';
import { AssetMediaStatus } from 'src/dtos/asset-media-response.dto';
import { AssetMediaSize } from 'src/dtos/asset-media.dto';
import { AssetMetadataKey, CacheControl } from 'src/enum';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { AssetMediaService } from 'src/services/asset-media.service';
import { ImmichStreamResponse } from 'src/utils/file';
import request from 'supertest';
import { factory } from 'test/small.factory';
import { automock, ControllerContext, controllerSetup, mockBaseService } from 'test/utils';

const makeUploadDto = (options?: { omit: string }): Record<string, any> => {
  const dto: Record<string, any> = {
    fileCreatedAt: new Date().toISOString(),
    fileModifiedAt: new Date().toISOString(),
    isFavorite: 'false',
  };

  const omit = options?.omit;
  if (omit) {
    delete dto[omit];
  }

  return dto;
};

describe(AssetMediaController.name, () => {
  let ctx: ControllerContext;
  const assetData = Buffer.from('123');
  const filename = 'example.png';
  const service = mockBaseService(AssetMediaService);

  beforeAll(async () => {
    ctx = await controllerSetup(AssetMediaController, [
      { provide: LoggingRepository, useValue: automock(LoggingRepository, { strict: false }) },
      { provide: AssetMediaService, useValue: service },
    ]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.resetAllMocks();
    service.uploadAsset.mockResolvedValue({ status: AssetMediaStatus.DUPLICATE, id: factory.uuid() });

    ctx.reset();
  });

  describe('POST /assets', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).post(`/assets`);
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it('should accept metadata', async () => {
      const mobileMetadata = { key: AssetMetadataKey.MobileApp, value: { iCloudId: '123' } };
      const { status } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field({
          ...makeUploadDto(),
          metadata: JSON.stringify([mobileMetadata]),
        });

      expect(service.uploadAsset).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ metadata: [mobileMetadata] }),
        expect.objectContaining({ originalName: 'example.png' }),
        undefined,
      );

      expect(status).toBe(200);
    });

    it('should handle invalid metadata json', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field({
          ...makeUploadDto(),
          metadata: 'not-a-string-string',
        });

      expect(status).toBe(400);
      expect(body).toEqual(
        factory.responses.badRequest(['[metadata] Invalid input: expected JSON string, received string']),
      );
    });

    it('should require `fileCreatedAt`', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field({ ...makeUploadDto({ omit: 'fileCreatedAt' }) });
      expect(status).toBe(400);
      expect(body).toEqual(
        factory.responses.badRequest([
          '[fileCreatedAt] Invalid input: expected ISO 8601 datetime string, received undefined',
        ]),
      );
    });

    it('should require `fileModifiedAt`', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field(makeUploadDto({ omit: 'fileModifiedAt' }));
      expect(status).toBe(400);
      expect(body).toEqual(
        factory.responses.badRequest([
          '[fileModifiedAt] Invalid input: expected ISO 8601 datetime string, received undefined',
        ]),
      );
    });

    it('should throw if `isFavorite` is not a boolean', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field({ ...makeUploadDto(), isFavorite: 'not-a-boolean' });
      expect(status).toBe(400);
      expect(body).toEqual(
        factory.responses.badRequest(['[isFavorite] Invalid option: expected one of "true"|"false"']),
      );
    });

    it('should throw if `visibility` is not an enum', async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post('/assets')
        .attach('assetData', assetData, filename)
        .field({ ...makeUploadDto(), visibility: 'not-an-option' });
      expect(status).toBe(400);
      expect(body).toEqual(
        factory.responses.badRequest([expect.stringContaining('[visibility] Invalid option: expected one of')]),
      );
    });

    // TODO figure out how to deal with `sendFile`
    describe.skip('GET /assets/:id/original', () => {
      it('should be an authenticated route', async () => {
        await request(ctx.getHttpServer()).get(`/assets/${factory.uuid()}/original`);
        expect(ctx.authenticate).toHaveBeenCalled();
      });
    });

    // TODO figure out how to deal with `sendFile`
    describe('GET /assets/:id/thumbnail', () => {
      it.skip('should be an authenticated route', async () => {
        await request(ctx.getHttpServer()).get(`/assets/${factory.uuid()}/thumbnail`);
        expect(ctx.authenticate).toHaveBeenCalled();
      });

      it('should redirect if size=original is requested', async () => {
        const { status } = await request(ctx.getHttpServer()).get(`/assets/${factory.uuid()}/thumbnail?size=original`);
        expect(status).toBe(302);
      });

      it('should abort pending thumbnail work when the response closes before the thumbnail is ready', async () => {
        const logger = automock(LoggingRepository, { strict: false });
        const controller = new AssetMediaController(logger, service);
        let capturedSignal: AbortSignal | undefined;
        let resolveThumbnail!: (response: ImmichStreamResponse) => void;
        service.viewThumbnail.mockImplementation((_auth, _id, _dto, signal?: AbortSignal) => {
          capturedSignal = signal;
          return new Promise((resolve) => {
            resolveThumbnail = resolve;
          });
        });
        const res = Object.assign(new EventEmitter(), {
          set: vi.fn(),
          header: vi.fn(),
          headersSent: false,
          writableEnded: false,
        }) as any;
        const next = vi.fn();
        const stream = new Readable({
          read() {
            // keep the stream open so cleanup is observable
          },
        });
        stream.pipe = vi.fn().mockReturnValue(res);

        const sendPromise = controller.viewAsset(
          {} as any,
          { id: factory.uuid() },
          { size: AssetMediaSize.THUMBNAIL },
          { url: '/assets/id/thumbnail?size=thumbnail' } as any,
          res,
          next,
        );
        await Promise.resolve();

        expect(capturedSignal).toBeInstanceOf(AbortSignal);
        res.emit('close');
        expect(capturedSignal?.aborted).toBe(true);

        resolveThumbnail(
          new ImmichStreamResponse({
            stream,
            contentType: 'image/webp',
            cacheControl: CacheControl.PrivateWithCache,
          }),
        );
        await sendPromise;

        expect(stream.pipe).not.toHaveBeenCalled();
      });
    });
  });
});
