import { AgentToolController } from 'src/controllers/agent-tool.controller';
import {
  AgentReadAssetMetadataToolRequestDto,
  AgentToolApprovalDto,
  AgentToolCallResponseDto,
} from 'src/dtos/agent-tool.dto';
import {
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
  Permission,
} from 'src/enum';
import { AgentToolService } from 'src/services/agent-tool.service';
import request from 'supertest';
import { AuthFactory } from 'test/factories/auth.factory';
import { factory } from 'test/small.factory';
import { automock, ControllerContext, controllerSetup } from 'test/utils';

describe(AgentToolController.name, () => {
  let ctx: ControllerContext;
  const service = automock(AgentToolService, { args: [{} as never, {} as never, {} as never, {} as never], strict: false });
  const auth = AuthFactory.create();
  const sessionId = factory.uuid();
  const toolCallId = factory.uuid();
  const assetId = factory.uuid();
  const startedAt = new Date('2026-05-14T12:00:00.000Z');
  const completedAt = new Date('2026-05-14T12:01:00.000Z');
  const metadataBody: AgentReadAssetMetadataToolRequestDto = {
    assetIds: [assetId],
  };
  const toolCall: AgentToolCallResponseDto = {
    id: toolCallId,
    sessionId,
    toolName: AgentToolName.ReadAssetMetadata,
    status: AgentToolCallStatus.PendingApproval,
    approvalDecision: null,
    requestSummary: 'Read metadata for 1 asset',
    responseSummary: null,
    dataClass: AgentToolDataClass.Metadata,
    assetCount: 1,
    albumCount: 0,
    startedAt,
    completedAt: null,
    error: null,
  };

  beforeAll(async () => {
    ctx = await controllerSetup(AgentToolController, [{ provide: AgentToolService, useValue: service }]);
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

  describe('POST /agent/sessions/:id/tools/read-asset-metadata', () => {
    it('should be an authenticated route with update permission', async () => {
      service.readAssetMetadata.mockResolvedValue({ status: 'approval-required', toolCall });

      await request(ctx.getHttpServer())
        .post(`/agent/sessions/${sessionId}/tools/read-asset-metadata`)
        .send(metadataBody);

      expect(ctx.authenticate).toHaveBeenCalled();
      expectPermission(Permission.AgentSessionUpdate);
    });

    it('should call the service and serialize tool call dates', async () => {
      service.readAssetMetadata.mockResolvedValue({ status: 'approval-required', toolCall });

      const { status, body: result } = await request(ctx.getHttpServer())
        .post(`/agent/sessions/${sessionId}/tools/read-asset-metadata`)
        .send(metadataBody);

      expect(status).toBe(201);
      expect(service.readAssetMetadata).toHaveBeenCalledWith(auth, sessionId, metadataBody);
      expect(result).toEqual({
        status: 'approval-required',
        toolCall: {
          ...toolCall,
          startedAt: startedAt.toISOString(),
          completedAt: null,
        },
      });
    });

    it('should validate body and require assetIds or toolCallId', async () => {
      const { status, body: result } = await request(ctx.getHttpServer())
        .post(`/agent/sessions/${sessionId}/tools/read-asset-metadata`)
        .send({});

      expect(status).toBe(400);
      expect(result).toEqual(
        factory.responses.badRequest(['Provide assetIds for a new tool request or toolCallId for an approved request']),
      );
    });
  });

  describe('GET /agent/sessions/:id/tool-calls', () => {
    it('should be an authenticated route with read permission', async () => {
      service.getToolCalls.mockResolvedValue([]);

      await request(ctx.getHttpServer()).get(`/agent/sessions/${sessionId}/tool-calls`);

      expect(ctx.authenticate).toHaveBeenCalled();
      expectPermission(Permission.AgentSessionRead);
    });

    it('should call getToolCalls with auth and session id', async () => {
      service.getToolCalls.mockResolvedValue([{ ...toolCall, completedAt }]);

      const { status, body: result } = await request(ctx.getHttpServer()).get(
        `/agent/sessions/${sessionId}/tool-calls`,
      );

      expect(status).toBe(200);
      expect(service.getToolCalls).toHaveBeenCalledWith(auth, sessionId);
      expect(result).toEqual([
        {
          ...toolCall,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
        },
      ]);
    });
  });

  describe('POST /agent/sessions/:id/tool-calls/:toolCallId/approval', () => {
    it('should be an authenticated route with update permission', async () => {
      service.approveToolCall.mockResolvedValue({
        ...toolCall,
        status: AgentToolCallStatus.Approved,
        approvalDecision: AgentToolApprovalDecision.Approved,
      });

      await request(ctx.getHttpServer())
        .post(`/agent/sessions/${sessionId}/tool-calls/${toolCallId}/approval`)
        .send({ decision: AgentToolApprovalDecision.Approved });

      expect(ctx.authenticate).toHaveBeenCalled();
      expectPermission(Permission.AgentSessionUpdate);
    });

    it('should call approveToolCall with an approved decision', async () => {
      const body: AgentToolApprovalDto = { decision: AgentToolApprovalDecision.Approved };
      service.approveToolCall.mockResolvedValue({
        ...toolCall,
        status: AgentToolCallStatus.Approved,
        approvalDecision: AgentToolApprovalDecision.Approved,
      });

      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/sessions/${sessionId}/tool-calls/${toolCallId}/approval`)
        .send(body);

      expect(status).toBe(201);
      expect(service.approveToolCall).toHaveBeenCalledWith(auth, sessionId, toolCallId, body);
    });

    it('should pass through denied decisions with a reason', async () => {
      const body: AgentToolApprovalDto = { decision: AgentToolApprovalDecision.Denied, reason: 'Too broad.' };
      service.approveToolCall.mockResolvedValue({
        ...toolCall,
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        error: body.reason,
        completedAt,
      });

      const { status } = await request(ctx.getHttpServer())
        .post(`/agent/sessions/${sessionId}/tool-calls/${toolCallId}/approval`)
        .send(body);

      expect(status).toBe(201);
      expect(service.approveToolCall).toHaveBeenCalledWith(auth, sessionId, toolCallId, body);
    });
  });
});
