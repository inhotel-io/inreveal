import { UnauthorizedException } from '@nestjs/common';
import { AgentRunnerToolController } from 'src/controllers/agent-runner-tool.controller';
import { AgentToolCallResponseDto } from 'src/dtos/agent-tool.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { AgentToolCallStatus, AgentToolDataClass, AgentToolName } from 'src/enum';
import { AgentRunnerToolTokenService } from 'src/services/agent-runner-tool-token.service';
import { AgentToolService } from 'src/services/agent-tool.service';
import request from 'supertest';
import { factory } from 'test/small.factory';
import { automock, ControllerContext, controllerSetup } from 'test/utils';

describe(AgentRunnerToolController.name, () => {
  let ctx: ControllerContext;
  const service = automock(AgentToolService, {
    args: [{} as never, {} as never, {} as never, {} as never, {} as never],
    strict: false,
  });
  const tokenService = automock(AgentRunnerToolTokenService, {
    args: [{} as never],
    strict: false,
  });
  const sessionId = factory.uuid();
  const userId = factory.uuid();
  const token = 'runner-tool-token';
  const authorization = `Bearer ${token}`;
  const assetId = factory.uuid();
  const albumId = factory.uuid();
  const startedAt = new Date('2026-05-15T10:00:00.000Z');
  const toolCall: AgentToolCallResponseDto = {
    id: factory.uuid(),
    sessionId,
    toolName: AgentToolName.SearchAssets,
    status: AgentToolCallStatus.Completed,
    approvalDecision: null,
    requestSummary: 'Search assets',
    responseSummary: 'Found 0 assets',
    dataClass: AgentToolDataClass.Metadata,
    assetCount: 0,
    albumCount: 0,
    startedAt,
    completedAt: startedAt,
    error: null,
  };

  beforeAll(async () => {
    ctx = await controllerSetup(AgentRunnerToolController, [
      { provide: AgentRunnerToolTokenService, useValue: tokenService },
      { provide: AgentToolService, useValue: service },
    ]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.resetAllMocks();
    tokenService.resetAllMocks();
    ctx.reset();
    tokenService.verify.mockReturnValue({
      sessionId,
      userId,
      expiresAt: new Date('2026-05-15T12:00:00.000Z'),
    });
  });

  const expectRunnerAuth = () => {
    expect(service.searchAssets).toHaveBeenCalledWith(
      {
        user: { id: userId },
      } as AuthDto,
      sessionId,
      { filters: {}, limit: 10_000 },
    );
  };

  describe('POST /agent/internal/tools/sessions/:id/search-assets', () => {
    it('verifies bearer token and dispatches searchAssets with non-elevated auth', async () => {
      service.searchAssets.mockResolvedValue({ status: 'approval-required', toolCall });

      const { status, body } = await request(ctx.getHttpServer())
        .post(`/agent/internal/tools/sessions/${sessionId}/search-assets`)
        .set('Authorization', authorization)
        .send({});

      expect(status).toBe(201);
      expect(tokenService.verify).toHaveBeenCalledWith(token);
      expectRunnerAuth();
      expect(body).toEqual({
        status: 'approval-required',
        toolCall: {
          ...toolCall,
          startedAt: startedAt.toISOString(),
          completedAt: startedAt.toISOString(),
        },
      });
      expect(ctx.authenticate).not.toHaveBeenCalled();
    });

    it('rejects a token for a different session id without calling the service', async () => {
      tokenService.verify.mockReturnValue({
        sessionId: factory.uuid(),
        userId,
        expiresAt: new Date('2026-05-15T12:00:00.000Z'),
      });

      const { status, body } = await request(ctx.getHttpServer())
        .post(`/agent/internal/tools/sessions/${sessionId}/search-assets`)
        .set('Authorization', authorization)
        .send({});

      expect(status).toBe(401);
      expect(body).toMatchObject({
        error: 'Unauthorized',
        message: 'Invalid agent runner tool token',
        statusCode: 401,
      });
      expect(service.searchAssets).not.toHaveBeenCalled();
    });

    it.each([undefined, '', 'Basic abc', 'Bearer '])('rejects missing or invalid bearer auth %s', async (header) => {
      const requestBuilder = request(ctx.getHttpServer())
        .post(`/agent/internal/tools/sessions/${sessionId}/search-assets`)
        .send({});
      if (header !== undefined) {
        requestBuilder.set('Authorization', header);
      }

      const { status } = await requestBuilder;

      expect(status).toBe(401);
      expect(tokenService.verify).not.toHaveBeenCalled();
      expect(service.searchAssets).not.toHaveBeenCalled();
    });

    it('returns 401 when token verification fails', async () => {
      tokenService.verify.mockImplementation(() => {
        throw new UnauthorizedException('Invalid agent runner tool token');
      });

      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/internal/tools/sessions/${sessionId}/search-assets`)
        .set('Authorization', authorization)
        .send({});

      expect(status).toBe(401);
      expect(service.searchAssets).not.toHaveBeenCalled();
    });

    it('validates the request body before dispatch', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/internal/tools/sessions/${sessionId}/search-assets`)
        .set('Authorization', authorization)
        .send({ limit: 0 });

      expect(status).toBe(400);
      expect(service.searchAssets).not.toHaveBeenCalled();
    });
  });

  describe.each([
    {
      path: 'read-asset-metadata',
      method: 'readAssetMetadata' as const,
      body: { assetIds: [assetId] },
    },
    {
      path: 'read-asset-previews',
      method: 'readAssetPreviews' as const,
      body: { assetIds: [assetId] },
    },
    {
      path: 'read-asset-originals',
      method: 'readAssetOriginals' as const,
      body: { assetIds: [assetId] },
    },
    {
      path: 'list-albums',
      method: 'listAlbums' as const,
      body: {},
    },
    {
      path: 'read-album',
      method: 'readAlbum' as const,
      body: { albumId },
    },
  ])('POST /agent/internal/tools/sessions/:id/$path', ({ path, method, body }) => {
    it(`delegates to ${method}`, async () => {
      service[method].mockResolvedValue({ status: 'approval-required', toolCall } as never);

      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/internal/tools/sessions/${sessionId}/${path}`)
        .set('Authorization', authorization)
        .send(body);

      expect(status).toBe(201);
      expect(service[method]).toHaveBeenCalledWith({ user: { id: userId } }, sessionId, body);
      expect(ctx.authenticate).not.toHaveBeenCalled();
    });
  });
});
