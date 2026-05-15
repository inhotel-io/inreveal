import { UnauthorizedException } from '@nestjs/common';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { AgentRunnerToolController, AgentRunnerToolGuard } from 'src/controllers/agent-runner-tool.controller';
import { AgentOperationPlanToolResponseDto, AgentProposeAlbumOperationsDto } from 'src/dtos/agent-operation.dto';
import {
  AgentListAlbumsToolResponseDto,
  AgentReadAlbumToolResponseDto,
  AgentReadAssetMetadataToolResponseDto,
  AgentReadAssetOriginalsToolResponseDto,
  AgentReadAssetPreviewsToolResponseDto,
  AgentSearchAssetsToolResponseDto,
  AgentToolCallResponseDto,
} from 'src/dtos/agent-tool.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  AgentOperationRiskLevel,
  AgentOperationTargetKind,
  AgentOperationType,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
} from 'src/enum';
import { AgentOperationPlanService } from 'src/services/agent-operation-plan.service';
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
  const operationPlanService = automock(AgentOperationPlanService, {
    args: [{} as never, {} as never, {} as never, {} as never, {} as never, {} as never],
    strict: false,
  });
  const sessionId = factory.uuid();
  const userId = factory.uuid();
  const token = 'runner-tool-token';
  const authorization = `Bearer ${token}`;
  const assetId = factory.uuid();
  const albumId = factory.uuid();
  const planId = factory.uuid();
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
  const runnerRoutes = [
    {
      path: 'search-assets',
      serviceMethod: 'searchAssets' as const,
      body: {},
      missingBearerBody: { limit: 0 },
    },
    {
      path: 'read-asset-metadata',
      serviceMethod: 'readAssetMetadata' as const,
      body: { assetIds: [assetId] },
      missingBearerBody: { assetIds: [assetId] },
    },
    {
      path: 'read-asset-previews',
      serviceMethod: 'readAssetPreviews' as const,
      body: { assetIds: [assetId] },
      missingBearerBody: { assetIds: [assetId] },
    },
    {
      path: 'read-asset-originals',
      serviceMethod: 'readAssetOriginals' as const,
      body: { assetIds: [assetId] },
      missingBearerBody: { assetIds: [assetId] },
    },
    {
      path: 'list-albums',
      serviceMethod: 'listAlbums' as const,
      body: {},
      missingBearerBody: {},
    },
    {
      path: 'read-album',
      serviceMethod: 'readAlbum' as const,
      body: { albumId },
      missingBearerBody: { albumId },
    },
  ];
  const planningBody: AgentProposeAlbumOperationsDto = {
    summary: 'Portugal plan.',
    operations: [
      {
        type: AgentOperationType.AlbumCreate,
        summary: 'Create Portugal.',
        targetKind: AgentOperationTargetKind.NewAlbum,
        temporaryTargetId: 'tmp-portugal',
        payload: { albumName: 'Portugal', description: '' },
        riskLevel: AgentOperationRiskLevel.Low,
        enabled: true,
      },
    ],
  };

  beforeAll(async () => {
    ctx = await controllerSetup(AgentRunnerToolController, [
      AgentRunnerToolGuard,
      { provide: AgentRunnerToolTokenService, useValue: tokenService },
      { provide: AgentToolService, useValue: service },
      { provide: AgentOperationPlanService, useValue: operationPlanService },
    ]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.resetAllMocks();
    operationPlanService.resetAllMocks();
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

  it('uses runner-prefixed method names for unique OpenAPI operation ids', () => {
    expect(Object.getOwnPropertyNames(AgentRunnerToolController.prototype)).toEqual(
      expect.arrayContaining([
        'runnerSearchAssets',
        'runnerReadAssetMetadata',
        'runnerReadAssetPreviews',
        'runnerReadAssetOriginals',
        'runnerListAlbums',
        'runnerReadAlbum',
        'runnerProposeAlbumOperations',
        'runnerReviseProposedOperations',
        'runnerSummarizePlan',
      ]),
    );
  });

  it.each([
    ['runnerSearchAssets', AgentSearchAssetsToolResponseDto, 'AgentSearchAssetsToolResponseDto'],
    ['runnerReadAssetMetadata', AgentReadAssetMetadataToolResponseDto, 'AgentReadAssetMetadataToolResponseDto'],
    ['runnerReadAssetPreviews', AgentReadAssetPreviewsToolResponseDto, 'AgentReadAssetPreviewsToolResponseDto'],
    ['runnerReadAssetOriginals', AgentReadAssetOriginalsToolResponseDto, 'AgentReadAssetOriginalsToolResponseDto'],
    ['runnerListAlbums', AgentListAlbumsToolResponseDto, 'AgentListAlbumsToolResponseDto'],
    ['runnerReadAlbum', AgentReadAlbumToolResponseDto, 'AgentReadAlbumToolResponseDto'],
    ['runnerProposeAlbumOperations', AgentOperationPlanToolResponseDto, 'AgentOperationPlanToolResponseDto'],
    ['runnerReviseProposedOperations', AgentOperationPlanToolResponseDto, 'AgentOperationPlanToolResponseDto'],
    ['runnerSummarizePlan', AgentOperationPlanToolResponseDto, 'AgentOperationPlanToolResponseDto'],
  ] as const)('documents %s with its typed tool response DTO', (methodName, responseDto, schemaName) => {
    const responses = Reflect.getMetadata(DECORATORS.API_RESPONSE, AgentRunnerToolController.prototype[methodName]) as
      | Record<number, { type?: unknown }>
      | undefined;

    expect(responses?.[201]?.type).toBe(responseDto);
    expect(responseDto.name).toBe(schemaName);
  });

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

    it.each([undefined, 'Basic abc'])(
      'rejects missing or invalid bearer auth %s before validating an invalid request body',
      async (header) => {
        const requestBuilder = request(ctx.getHttpServer())
          .post(`/agent/internal/tools/sessions/${sessionId}/search-assets`)
          .send({ limit: 0 });
        if (header !== undefined) {
          requestBuilder.set('Authorization', header);
        }

        const { status } = await requestBuilder;

        expect(status).toBe(401);
        expect(tokenService.verify).not.toHaveBeenCalled();
        expect(service.searchAssets).not.toHaveBeenCalled();
      },
    );

    it('returns 401 when token verification fails', async () => {
      tokenService.verify.mockImplementation(() => {
        throw new UnauthorizedException('Invalid agent runner tool token');
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

    it('validates the request body before dispatch', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/internal/tools/sessions/${sessionId}/search-assets`)
        .set('Authorization', authorization)
        .send({ limit: 0 });

      expect(status).toBe(400);
      expect(service.searchAssets).not.toHaveBeenCalled();
    });
  });

  describe.each(runnerRoutes)(
    'POST /agent/internal/tools/sessions/:id/$path auth',
    ({ path, serviceMethod, body, missingBearerBody }) => {
      it('rejects a token for a different session id without calling the service', async () => {
        tokenService.verify.mockReturnValue({
          sessionId: factory.uuid(),
          userId,
          expiresAt: new Date('2026-05-15T12:00:00.000Z'),
        });

        const { status } = await request(ctx.getHttpServer())
          .post(`/agent/internal/tools/sessions/${sessionId}/${path}`)
          .set('Authorization', authorization)
          .send(body);

        expect(status).toBe(401);
        expect(service[serviceMethod]).not.toHaveBeenCalled();
      });

      it('rejects invalid bearer auth without calling the service', async () => {
        const { status } = await request(ctx.getHttpServer())
          .post(`/agent/internal/tools/sessions/${sessionId}/${path}`)
          .set('Authorization', 'Basic abc')
          .send(body);

        expect(status).toBe(401);
        expect(tokenService.verify).not.toHaveBeenCalled();
        expect(service[serviceMethod]).not.toHaveBeenCalled();
      });

      it('rejects missing bearer auth before service delegation', async () => {
        const { status } = await request(ctx.getHttpServer())
          .post(`/agent/internal/tools/sessions/${sessionId}/${path}`)
          .send(missingBearerBody);

        expect(status).toBe(401);
        expect(tokenService.verify).not.toHaveBeenCalled();
        expect(service[serviceMethod]).not.toHaveBeenCalled();
      });
    },
  );

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

  describe.each([
    {
      path: 'propose-album-operations',
      serviceMethod: 'proposeAlbumOperations' as const,
      body: planningBody,
      expectedArguments: [{ user: { id: userId } }, sessionId, planningBody],
    },
    {
      path: `revise-proposed-operations/${planId}`,
      serviceMethod: 'reviseProposedOperations' as const,
      body: { ...planningBody, feedback: 'Use a shorter name.' },
      expectedArguments: [
        { user: { id: userId } },
        sessionId,
        planId,
        { ...planningBody, feedback: 'Use a shorter name.' },
      ],
    },
    {
      path: `summarize-plan/${planId}`,
      serviceMethod: 'summarizePlan' as const,
      body: { focus: 'risk' },
      expectedArguments: [{ user: { id: userId } }, sessionId, planId, { focus: 'risk' }],
    },
  ])(
    'POST /agent/internal/tools/sessions/:id/$path planning route',
    ({ path, serviceMethod, body, expectedArguments }) => {
      it(`delegates to ${serviceMethod} through bearer auth`, async () => {
        operationPlanService[serviceMethod].mockResolvedValue({
          status: 'success',
          plan: null,
          toolCall: null,
          summary: 'Plan revision 1.',
        } as never);

        const { status } = await request(ctx.getHttpServer())
          .post(`/agent/internal/tools/sessions/${sessionId}/${path}`)
          .set('Authorization', authorization)
          .send(body);

        expect(status).toBe(201);
        expect(tokenService.verify).toHaveBeenCalledWith(token);
        expect(operationPlanService[serviceMethod]).toHaveBeenCalledWith(...expectedArguments);
        expect(ctx.authenticate).not.toHaveBeenCalled();
      });

      it('rejects missing bearer auth before body validation', async () => {
        const { status } = await request(ctx.getHttpServer())
          .post(`/agent/internal/tools/sessions/${sessionId}/${path}`)
          .send({ summary: 'Broken', operations: [] });

        expect(status).toBe(401);
        expect(tokenService.verify).not.toHaveBeenCalled();
        expect(operationPlanService[serviceMethod]).not.toHaveBeenCalled();
      });
    },
  );

  describe('POST /agent/internal/tools/sessions/:id planning route validation', () => {
    it('rejects an invalid proposal body with bearer auth before calling the service', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/internal/tools/sessions/${sessionId}/propose-album-operations`)
        .set('Authorization', authorization)
        .send({ summary: 'Broken', operations: [] });

      expect(status).toBe(400);
      expect(tokenService.verify).toHaveBeenCalledWith(token);
      expect(operationPlanService.proposeAlbumOperations).not.toHaveBeenCalled();
    });

    it('rejects an invalid revise planId with bearer auth before calling the service', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/internal/tools/sessions/${sessionId}/revise-proposed-operations/not-a-uuid`)
        .set('Authorization', authorization)
        .send({ ...planningBody, feedback: 'Use a shorter name.' });

      expect(status).toBe(400);
      expect(tokenService.verify).toHaveBeenCalledWith(token);
      expect(operationPlanService.reviseProposedOperations).not.toHaveBeenCalled();
    });

    it('rejects an invalid summary body with bearer auth before calling the service', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/internal/tools/sessions/${sessionId}/summarize-plan/${planId}`)
        .set('Authorization', authorization)
        .send({ focus: '' });

      expect(status).toBe(400);
      expect(tokenService.verify).toHaveBeenCalledWith(token);
      expect(operationPlanService.summarizePlan).not.toHaveBeenCalled();
    });

    it('rejects an invalid summary planId with bearer auth before calling the service', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/internal/tools/sessions/${sessionId}/summarize-plan/not-a-uuid`)
        .set('Authorization', authorization)
        .send({ focus: 'risk' });

      expect(status).toBe(400);
      expect(tokenService.verify).toHaveBeenCalledWith(token);
      expect(operationPlanService.summarizePlan).not.toHaveBeenCalled();
    });
  });
});
