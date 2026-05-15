import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentSession, AgentToolCall } from 'src/database';
import {
  AgentOperationPlanResponseDto,
  AgentOperationPlanSummaryRequestDto,
  AgentOperationPlanToolResponseDto,
  AgentProposeAlbumOperationsDto,
  AgentReviseAlbumOperationsDto,
} from 'src/dtos/agent-operation.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  AgentOperationPlanStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  AgentSessionStatus,
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
  AlbumUserRole,
} from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import {
  AgentOperationPlanRepository,
  AgentOperationPlanWithOperations,
} from 'src/repositories/agent-operation-plan.repository';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { AgentToolCallRepository } from 'src/repositories/agent-tool-call.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { WebsocketRepository } from 'src/repositories/websocket.repository';
import { AgentAlbumOperationInput } from 'src/types/agent-operation.types';
import { AgentToolOperationPlanRequestMetadata } from 'src/types/agent-tool.types';

type PlanningRequest = {
  summary?: string;
  operations?: AgentAlbumOperationInput[];
  planId?: string;
  focus?: string;
};

type PlanningAuditResult = {
  status: AgentToolCallStatus.Completed | AgentToolCallStatus.Denied | AgentToolCallStatus.Failed;
  approvalDecision: AgentToolApprovalDecision;
  responseSummary: string | null;
  redactedResponseMetadata: { planId: string; operationIds: string[] } | null;
  error: string | null;
};

type PlanningAuditCreate = {
  status: AgentToolCallStatus.Executing;
  approvalDecision: AgentToolApprovalDecision.Approved;
  responseSummary: null;
  redactedResponseMetadata: null;
  error: null;
};

@Injectable()
export class AgentOperationPlanService {
  private static readonly activeStatuses = [
    AgentSessionStatus.Created,
    AgentSessionStatus.Running,
    AgentSessionStatus.WaitingForToolApproval,
    AgentSessionStatus.WaitingForPlanReview,
    AgentSessionStatus.Interrupted,
  ];

  constructor(
    private readonly accessRepository: AccessRepository,
    private readonly assetRepository: AssetRepository,
    private readonly sessionRepository: AgentSessionRepository,
    private readonly planRepository: AgentOperationPlanRepository,
    private readonly toolCallRepository: AgentToolCallRepository,
    private readonly websocketRepository: WebsocketRepository,
  ) {}

  async getCurrentPlan(auth: AuthDto, sessionId: string): Promise<AgentOperationPlanResponseDto | null> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: false });
    const plan = await this.planRepository.getCurrentBySessionId(session.id);

    return plan ? this.mapPlan(plan) : null;
  }

  async proposeAlbumOperations(
    auth: AuthDto,
    sessionId: string,
    dto: AgentProposeAlbumOperationsDto,
  ): Promise<AgentOperationPlanToolResponseDto> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: true });

    return this.runPlanningTool(auth, session, AgentToolName.ProposeAlbumOperations, dto, async () => {
      await this.validateNormalAccess(auth, session, dto.operations);
      const operations = this.prepareOperations(session, dto.operations);
      const plan = await this.planRepository.createReplacementRevision(session.id, {
        plan: {
          sessionId: session.id,
          status: AgentOperationPlanStatus.Proposed,
          summary: dto.summary,
        },
        operations,
      });

      await this.markWaitingForPlanReview(auth, session, plan);
      return { plan, summary: this.summarize(plan) };
    });
  }

  async reviseProposedOperations(
    auth: AuthDto,
    sessionId: string,
    planId: string,
    dto: AgentReviseAlbumOperationsDto,
  ): Promise<AgentOperationPlanToolResponseDto> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: true });

    return this.runPlanningTool(auth, session, AgentToolName.ReviseProposedOperations, { ...dto, planId }, async () => {
      await this.requireCurrentProposedPlan(session.id, planId);
      await this.validateNormalAccess(auth, session, dto.operations);
      const operations = this.prepareOperations(session, dto.operations);
      const replacement = await this.planRepository.createReplacementRevision(session.id, {
        plan: {
          sessionId: session.id,
          status: AgentOperationPlanStatus.Proposed,
          summary: dto.summary,
        },
        operations,
      });

      await this.markWaitingForPlanReview(auth, session, replacement);
      return { plan: replacement, summary: this.summarize(replacement) };
    });
  }

  async summarizePlan(
    auth: AuthDto,
    sessionId: string,
    planId: string,
    dto: AgentOperationPlanSummaryRequestDto,
  ): Promise<AgentOperationPlanToolResponseDto> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: false });

    return this.runPlanningTool(auth, session, AgentToolName.SummarizePlan, { planId, focus: dto.focus }, async () => {
      const plan = await this.requireCurrentPlan(session.id, planId);
      return { plan, summary: this.summarize(plan) };
    });
  }

  private async runPlanningTool(
    auth: AuthDto,
    session: AgentSession,
    toolName: AgentToolName,
    request: PlanningRequest,
    operation: () => Promise<{ plan: AgentOperationPlanWithOperations; summary: string }>,
  ): Promise<AgentOperationPlanToolResponseDto> {
    const executingToolCall = await this.createPlanningAudit(session, toolName, request, {
      status: AgentToolCallStatus.Executing,
      approvalDecision: AgentToolApprovalDecision.Approved,
      responseSummary: null,
      redactedResponseMetadata: null,
      error: null,
    });

    try {
      const result = await operation();
      const toolCall = await this.transitionPlanningAudit(session, executingToolCall.id, {
        status: AgentToolCallStatus.Completed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        responseSummary: result.summary,
        redactedResponseMetadata: {
          planId: result.plan.id,
          operationIds: result.plan.operations.map((operation) => operation.id),
        },
        error: null,
      });

      return {
        status: 'success',
        plan: this.mapPlan(result.plan),
        toolCall: this.mapToolCall(toolCall),
        summary: result.summary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent operation planning failed';
      const status =
        error instanceof BadRequestException || error instanceof NotFoundException
          ? AgentToolCallStatus.Denied
          : AgentToolCallStatus.Failed;
      const approvalDecision =
        status === AgentToolCallStatus.Denied ? AgentToolApprovalDecision.Denied : AgentToolApprovalDecision.Approved;

      await this.tryTransitionPlanningAudit(session, executingToolCall.id, {
        status,
        approvalDecision,
        responseSummary: null,
        redactedResponseMetadata: null,
        error: message,
      });

      throw error;
    }
  }

  private async requireCurrentProposedPlan(sessionId: string, planId: string) {
    const plan = await this.requireCurrentPlan(sessionId, planId);

    if (plan.status !== AgentOperationPlanStatus.Proposed) {
      throw new NotFoundException('Agent operation plan not found');
    }

    return plan;
  }

  private async requireCurrentPlan(sessionId: string, planId: string) {
    const [plan, currentPlan] = await Promise.all([
      this.planRepository.getByIdForSession(sessionId, planId),
      this.planRepository.getCurrentBySessionId(sessionId),
    ]);

    if (!plan || currentPlan?.id !== plan.id) {
      throw new NotFoundException('Agent operation plan not found');
    }

    return plan;
  }

  private async getOwnedSession(auth: AuthDto, sessionId: string, options: { requireActive: boolean }) {
    const session = await this.sessionRepository.getById(auth.user.id, sessionId);
    if (!session) {
      throw new NotFoundException('Agent session not found');
    }

    if (options.requireActive && !AgentOperationPlanService.activeStatuses.includes(session.status)) {
      throw new BadRequestException('Agent session is not active');
    }

    return session;
  }

  private async validateNormalAccess(auth: AuthDto, session: AgentSession, operations: AgentAlbumOperationInput[]) {
    const albumIds = new Set(
      operations
        .filter((operation) => operation.targetKind === AgentOperationTargetKind.ExistingAlbum && operation.targetId)
        .map((operation) => operation.targetId as string),
    );
    if (albumIds.size > 0) {
      const writableAlbumIds = await this.getWritableAlbumIds(auth, session, albumIds);
      if (writableAlbumIds.size !== albumIds.size) {
        throw new BadRequestException('One or more target albums are not accessible');
      }
    }

    const assetIds = [...new Set(operations.flatMap((operation) => operation.assetIds ?? []))];
    if (assetIds.length > 0) {
      const readableAssetIds = await this.getReadableAssetIds(auth, session, assetIds);
      if (readableAssetIds.size !== assetIds.length) {
        throw new BadRequestException('One or more assets are not accessible');
      }
    }
  }

  private async getWritableAlbumIds(auth: AuthDto, session: AgentSession, albumIds: Set<string>) {
    const writableIds = new Set<string>();
    const plan = session.permissionPlanSnapshot;

    if (plan.assetScope.owned) {
      const ownerIds = await this.accessRepository.album.checkOwnerAccess(auth.user.id, albumIds);
      for (const id of ownerIds) {
        writableIds.add(id);
      }
    }

    if (plan.assetScope.sharedSpaces) {
      const sharedIds = await this.accessRepository.album.checkSharedAlbumAccess(
        auth.user.id,
        albumIds,
        AlbumUserRole.Editor,
      );
      for (const id of sharedIds) {
        writableIds.add(id);
      }
    }

    return writableIds;
  }

  private async getReadableAssetIds(auth: AuthDto, session: AgentSession, assetIds: string[]) {
    const requestedIds = new Set(assetIds);
    const readableIds = new Set<string>();
    const plan = session.permissionPlanSnapshot;
    const allowLockedAssets = plan.assetScope.locked && auth.session?.hasElevatedPermission === true;

    if (plan.assetScope.owned) {
      const ownerIds = await this.accessRepository.asset.checkOwnerAccess(
        auth.user.id,
        requestedIds,
        allowLockedAssets,
      );
      for (const id of ownerIds) {
        readableIds.add(id);
      }
    }

    if (plan.assetScope.sharedSpaces) {
      const spaceIds = await this.accessRepository.asset.checkSpaceAccess(auth.user.id, requestedIds);
      for (const id of spaceIds) {
        readableIds.add(id);
      }

      if (!allowLockedAssets) {
        const lockedIds = await this.assetRepository.getAgentLockedIds(readableIds);
        for (const id of lockedIds) {
          readableIds.delete(id);
        }
      }
    }

    const agentReadableIds = await this.assetRepository.getAgentReadableIds(readableIds);
    for (const id of readableIds) {
      if (!agentReadableIds.has(id)) {
        readableIds.delete(id);
      }
    }

    return readableIds;
  }

  private prepareOperations(session: AgentSession, operations: AgentAlbumOperationInput[]): AgentAlbumOperationInput[] {
    const createTemporaryTargetIds = new Set<string>();

    for (const operation of operations) {
      this.validateWriteScope(session, operation.type);

      if (operation.type === AgentOperationType.AlbumCreate) {
        if (!operation.temporaryTargetId) {
          throw new BadRequestException('album.create requires temporaryTargetId');
        }

        if (createTemporaryTargetIds.has(operation.temporaryTargetId)) {
          throw new BadRequestException(`Duplicate album.create temporaryTargetId: ${operation.temporaryTargetId}`);
        }

        createTemporaryTargetIds.add(operation.temporaryTargetId);
      }
    }

    return operations.map((operation) => {
      if (
        (operation.type === AgentOperationType.AlbumAddAssets || operation.type === AgentOperationType.AlbumSetCover) &&
        operation.targetKind === AgentOperationTargetKind.NewAlbum &&
        (!operation.temporaryTargetId || !createTemporaryTargetIds.has(operation.temporaryTargetId))
      ) {
        throw new BadRequestException(
          `No album.create operation found for temporaryTargetId: ${operation.temporaryTargetId}`,
        );
      }

      return {
        type: operation.type,
        summary: operation.summary,
        targetKind: operation.targetKind,
        targetId: operation.targetId,
        temporaryTargetId: operation.temporaryTargetId,
        assetIds: operation.assetIds ?? [],
        payload: operation.payload ?? {},
        dependencyIds: [],
        riskLevel: operation.riskLevel,
        enabled: operation.enabled,
      };
    });
  }

  private validateWriteScope(session: AgentSession, type: AgentOperationType) {
    const writeScope = session.permissionPlanSnapshot.writeScope;
    if (type === AgentOperationType.AlbumCreate && !writeScope.createAlbum) {
      throw new BadRequestException('Agent permission policy does not allow creating albums');
    }

    if (type === AgentOperationType.AlbumAddAssets && !writeScope.addAssets) {
      throw new BadRequestException('Agent permission policy does not allow adding assets to albums');
    }

    if (type === AgentOperationType.AlbumUpdateDetails && !writeScope.updateDetails) {
      throw new BadRequestException('Agent permission policy does not allow updating album details');
    }

    if (type === AgentOperationType.AlbumSetCover && !writeScope.setCover) {
      throw new BadRequestException('Agent permission policy does not allow setting album covers');
    }
  }

  private async markWaitingForPlanReview(auth: AuthDto, session: AgentSession, plan: AgentOperationPlanWithOperations) {
    await this.sessionRepository.update(auth.user.id, session.id, { status: AgentSessionStatus.WaitingForPlanReview });
    this.websocketRepository.clientSend('on_agent_session_event', auth.user.id, {
      type: 'operation-plan-ready',
      sessionId: session.id,
      planId: plan.id,
      revision: plan.revision,
    });
  }

  private createPlanningAudit(
    session: AgentSession,
    toolName: AgentToolName,
    request: PlanningRequest,
    result: PlanningAuditResult | PlanningAuditCreate,
  ) {
    const operations = request.operations ?? [];
    const assetIds = [...new Set(operations.flatMap((operation) => operation.assetIds ?? []))];
    const albumIds = [
      ...new Set(
        operations
          .filter((operation) => operation.targetKind === AgentOperationTargetKind.ExistingAlbum && operation.targetId)
          .map((operation) => operation.targetId as string),
      ),
    ];

    return this.toolCallRepository.create({
      sessionId: session.id,
      toolName,
      status: result.status,
      approvalDecision: result.approvalDecision,
      requestSummary:
        toolName === AgentToolName.SummarizePlan
          ? `Summarize operation plan ${request.planId}`
          : `Store ${operations.length} proposed album operation(s)`,
      responseSummary: result.responseSummary,
      redactedRequestMetadata: this.redactRequestMetadata(toolName, request, operations, albumIds, assetIds),
      redactedResponseMetadata: result.redactedResponseMetadata,
      dataClass: AgentToolDataClass.Plan,
      assetCount: assetIds.length,
      albumCount: albumIds.length,
      providerSnapshot: {
        providerCredentialId: session.credentialSnapshot.id,
        providerType: session.credentialSnapshot.providerType,
        label: session.credentialSnapshot.label,
        baseUrl: session.credentialSnapshot.baseUrl,
        model: session.modelSnapshot.model,
      },
      completedAt: result.status === AgentToolCallStatus.Executing ? null : new Date(),
      error: result.error,
    });
  }

  private async transitionPlanningAudit(session: AgentSession, toolCallId: string, result: PlanningAuditResult) {
    const toolCall = await this.toolCallRepository.transition(session.id, toolCallId, AgentToolCallStatus.Executing, {
      status: result.status,
      approvalDecision: result.approvalDecision,
      responseSummary: result.responseSummary,
      redactedResponseMetadata: result.redactedResponseMetadata,
      completedAt: new Date(),
      error: result.error,
    });

    if (!toolCall) {
      throw new BadRequestException('Agent planning tool call is already executing or completed');
    }

    return toolCall;
  }

  private async tryTransitionPlanningAudit(
    session: AgentSession,
    toolCallId: string,
    result: PlanningAuditResult,
  ): Promise<void> {
    try {
      await this.transitionPlanningAudit(session, toolCallId, result);
    } catch {
      // Preserve the original planning error.
    }
  }

  private redactRequestMetadata(
    _toolName: AgentToolName,
    request: PlanningRequest,
    operations: AgentAlbumOperationInput[],
    albumIds: string[],
    assetIds: string[],
  ): AgentToolOperationPlanRequestMetadata {
    return {
      planId: request.planId,
      operationCount: operations.length,
      operationTypes: operations.map((operation) => operation.type),
      albumIds,
      assetIds,
    };
  }

  private mapPlan(plan: AgentOperationPlanWithOperations): AgentOperationPlanResponseDto {
    return {
      id: plan.id,
      sessionId: plan.sessionId,
      revision: plan.revision,
      status: plan.status,
      summary: plan.summary,
      operations: plan.operations.map((operation) => this.mapOperation(operation)),
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  private mapOperation(operation: AgentOperationPlanWithOperations['operations'][number]) {
    return {
      id: operation.id,
      planId: operation.planId,
      type: operation.type,
      summary: operation.summary,
      targetKind: operation.targetKind,
      targetId: operation.targetId,
      temporaryTargetId: operation.temporaryTargetId,
      assetIds: operation.assetIds,
      payload: operation.payload,
      dependencyIds: operation.dependencyIds,
      riskLevel: operation.riskLevel,
      enabled: operation.enabled,
      status: operation.status,
      result: operation.result,
      error: operation.error,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
    };
  }

  private mapToolCall(toolCall: AgentToolCall) {
    return {
      id: toolCall.id,
      sessionId: toolCall.sessionId,
      toolName: toolCall.toolName,
      status: toolCall.status,
      approvalDecision: toolCall.approvalDecision,
      requestSummary: toolCall.requestSummary,
      responseSummary: toolCall.responseSummary,
      dataClass: toolCall.dataClass,
      assetCount: toolCall.assetCount,
      albumCount: toolCall.albumCount,
      startedAt: toolCall.startedAt,
      completedAt: toolCall.completedAt,
      error: toolCall.error,
    };
  }

  private summarize(plan: AgentOperationPlanWithOperations) {
    const createCount = plan.operations.filter((operation) => operation.type === AgentOperationType.AlbumCreate).length;
    const addCount = plan.operations.filter((operation) => operation.type === AgentOperationType.AlbumAddAssets).length;
    const updateCount = plan.operations.filter(
      (operation) => operation.type === AgentOperationType.AlbumUpdateDetails,
    ).length;
    const coverCount = plan.operations.filter(
      (operation) => operation.type === AgentOperationType.AlbumSetCover,
    ).length;

    return `Plan revision ${plan.revision}: ${createCount} album create, ${addCount} asset add, ${updateCount} detail update, ${coverCount} cover change operation(s).`;
  }
}
