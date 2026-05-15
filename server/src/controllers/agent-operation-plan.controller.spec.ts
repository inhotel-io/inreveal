import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { AgentOperationPlanController } from 'src/controllers/agent-operation-plan.controller';
import {
  AgentOperationPlanResponseDto,
  AgentOperationPlanSummaryRequestDto,
  AgentOperationPlanToolResponseDto,
  AgentProposeAlbumOperationsDto,
  AgentReviseAlbumOperationsDto,
} from 'src/dtos/agent-operation.dto';
import {
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  Permission,
} from 'src/enum';
import { AgentOperationPlanService } from 'src/services/agent-operation-plan.service';
import request from 'supertest';
import { AuthFactory } from 'test/factories/auth.factory';
import { factory } from 'test/small.factory';
import { automock, ControllerContext, controllerSetup } from 'test/utils';

describe(AgentOperationPlanController.name, () => {
  let ctx: ControllerContext;
  const service = automock(AgentOperationPlanService, {
    args: [{} as never, {} as never, {} as never, {} as never, {} as never, {} as never],
    strict: false,
  });
  const auth = AuthFactory.create();
  const sessionId = factory.uuid();
  const planId = factory.uuid();
  const operationId = factory.uuid();
  const createdAt = new Date('2026-05-15T12:00:00.000Z');
  const updatedAt = new Date('2026-05-15T12:00:01.000Z');
  const plan: AgentOperationPlanResponseDto = {
    id: planId,
    sessionId,
    revision: 1,
    status: AgentOperationPlanStatus.Proposed,
    summary: 'Portugal plan.',
    operations: [
      {
        id: operationId,
        planId,
        type: AgentOperationType.AlbumCreate,
        summary: 'Create Portugal.',
        targetKind: AgentOperationTargetKind.NewAlbum,
        targetId: null,
        temporaryTargetId: 'tmp-portugal',
        assetIds: [],
        payload: { albumName: 'Portugal' },
        dependencyIds: [],
        riskLevel: AgentOperationRiskLevel.Low,
        enabled: true,
        status: AgentOperationStatus.Proposed,
        result: null,
        error: null,
        createdAt,
        updatedAt,
      },
    ],
    createdAt,
    updatedAt,
  };

  beforeAll(async () => {
    ctx = await controllerSetup(AgentOperationPlanController, [
      { provide: AgentOperationPlanService, useValue: service },
    ]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.resetAllMocks();
    ctx.reset();
    ctx.authenticate.mockResolvedValue(auth);
  });

  const expectPermission = (permission: Permission) => {
    expect(ctx.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ permission }),
      }),
    );
  };

  it.each([
    ['proposeAlbumOperations', AgentOperationPlanToolResponseDto, 'AgentOperationPlanToolResponseDto', 201],
    ['reviseProposedOperations', AgentOperationPlanToolResponseDto, 'AgentOperationPlanToolResponseDto', 201],
    ['summarizePlan', AgentOperationPlanToolResponseDto, 'AgentOperationPlanToolResponseDto', 201],
  ] as const)('documents %s with a typed response DTO', (methodName, responseDto, schemaName, statusCode) => {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      AgentOperationPlanController.prototype[methodName],
    ) as Record<number, { type?: unknown }> | undefined;

    expect(responses?.[statusCode]?.type).toBe(responseDto);
    expect(responseDto.name).toBe(schemaName);
  });

  it('documents getCurrentOperationPlan as a nullable plan response', () => {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      AgentOperationPlanController.prototype.getCurrentOperationPlan,
    ) as Record<number, { schema?: unknown; type?: unknown }> | undefined;

    expect(responses?.[200]).toMatchObject({
      schema: {
        oneOf: [{ $ref: '#/components/schemas/AgentOperationPlanResponseDto' }, { type: 'null' }],
      },
    });
    expect(responses?.[200]?.type).toBeUndefined();
  });

  describe('GET /agent/sessions/:id/operation-plan', () => {
    it('gets the current operation plan with read permission and serializes dates', async () => {
      service.getCurrentPlan.mockResolvedValue(plan);

      const { status, body } = await request(ctx.getHttpServer()).get(`/agent/sessions/${sessionId}/operation-plan`);

      expect(status).toBe(200);
      expectPermission(Permission.AgentSessionRead);
      expect(service.getCurrentPlan).toHaveBeenCalledWith(auth, sessionId);
      expect(body).toEqual({
        ...plan,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        operations: [
          {
            ...plan.operations[0],
            createdAt: createdAt.toISOString(),
            updatedAt: updatedAt.toISOString(),
          },
        ],
      });
    });

    it('returns the current operation plan directly from the controller method', async () => {
      service.getCurrentPlan.mockResolvedValue(plan);
      const controller = new AgentOperationPlanController(service);

      await expect(controller.getCurrentOperationPlan(auth, { id: sessionId })).resolves.toBe(plan);
    });

    it('returns null directly from the controller method when no current operation plan exists', async () => {
      service.getCurrentPlan.mockResolvedValue(null);
      const controller = new AgentOperationPlanController(service);

      await expect(controller.getCurrentOperationPlan(auth, { id: sessionId })).resolves.toBeNull();
    });

    it('returns 200 when no current operation plan exists', async () => {
      service.getCurrentPlan.mockResolvedValue(null);

      const { status, text } = await request(ctx.getHttpServer()).get(`/agent/sessions/${sessionId}/operation-plan`);

      expect(status).toBe(200);
      expect(text).toBe('');
      expect(service.getCurrentPlan).toHaveBeenCalledWith(auth, sessionId);
    });
  });

  describe('POST /agent/sessions/:id/operation-plan/proposals', () => {
    const dto: AgentProposeAlbumOperationsDto = {
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

    it('proposes album operations with update permission', async () => {
      service.proposeAlbumOperations.mockResolvedValue({
        status: 'success',
        plan,
        toolCall: null,
        summary: 'Plan revision 1.',
      });

      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/sessions/${sessionId}/operation-plan/proposals`)
        .send(dto);

      expect(status).toBe(201);
      expectPermission(Permission.AgentSessionUpdate);
      expect(service.proposeAlbumOperations).toHaveBeenCalledWith(auth, sessionId, dto);
    });

    it('validates proposal bodies before calling the service', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/sessions/${sessionId}/operation-plan/proposals`)
        .send({ summary: 'Broken', operations: [] });

      expect(status).toBe(400);
      expect(service.proposeAlbumOperations).not.toHaveBeenCalled();
    });
  });

  describe('POST /agent/sessions/:id/operation-plan/:planId/revisions', () => {
    const dto: AgentReviseAlbumOperationsDto = {
      feedback: 'Use a shorter name.',
      summary: 'Revised Portugal plan.',
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

    it('revises a plan with update permission', async () => {
      service.reviseProposedOperations.mockResolvedValue({
        status: 'success',
        plan,
        toolCall: null,
        summary: 'Plan revision 2.',
      });

      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/sessions/${sessionId}/operation-plan/${planId}/revisions`)
        .send(dto);

      expect(status).toBe(201);
      expectPermission(Permission.AgentSessionUpdate);
      expect(service.reviseProposedOperations).toHaveBeenCalledWith(auth, sessionId, planId, dto);
    });

    it('validates revision params and body before calling the service', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/sessions/${sessionId}/operation-plan/not-a-uuid/revisions`)
        .send({ ...dto, operations: [] });

      expect(status).toBe(400);
      expect(service.reviseProposedOperations).not.toHaveBeenCalled();
    });
  });

  describe('POST /agent/sessions/:id/operation-plan/:planId/summary', () => {
    const dto: AgentOperationPlanSummaryRequestDto = { focus: 'risk' };

    it('summarizes a plan with read permission', async () => {
      service.summarizePlan.mockResolvedValue({
        status: 'success',
        plan,
        toolCall: null,
        summary: 'Plan revision 1.',
      });

      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/sessions/${sessionId}/operation-plan/${planId}/summary`)
        .send(dto);

      expect(status).toBe(201);
      expectPermission(Permission.AgentSessionRead);
      expect(service.summarizePlan).toHaveBeenCalledWith(auth, sessionId, planId, dto);
    });

    it('validates summary params and body before calling the service', async () => {
      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/sessions/${sessionId}/operation-plan/not-a-uuid/summary`)
        .send({ focus: '' });

      expect(status).toBe(400);
      expect(service.summarizePlan).not.toHaveBeenCalled();
    });
  });
});
