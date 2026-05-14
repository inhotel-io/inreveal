import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentSession, AgentToolCall } from 'src/database';
import {
  AgentReadAssetMetadataToolRequestDto,
  AgentToolApprovalDto,
  AgentToolCallResponseDto,
} from 'src/dtos/agent-tool.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  AgentApprovalMode,
  AgentSessionStatus,
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
} from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { AgentToolCallRepository } from 'src/repositories/agent-tool-call.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { AgentAssetMetadata } from 'src/types/agent-tool.types';
import { AgentPermissionPlanSnapshot } from 'src/types/agent-session.types';

type ReadAssetMetadataResponse =
  | { status: 'approval-required'; toolCall: AgentToolCallResponseDto }
  | { status: 'denied'; reason: string; toolCall: AgentToolCallResponseDto }
  | { status: 'success'; toolCall: AgentToolCallResponseDto; assets: AgentAssetMetadata[] };

type AgentToolCallCreate = Parameters<AgentToolCallRepository['create']>[0];

@Injectable()
export class AgentToolService {
  private static readonly strictModeReason = 'Only strict approval mode is supported for metadata tools in this slice';

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
    private readonly toolCallRepository: AgentToolCallRepository,
  ) {}

  async readAssetMetadata(
    auth: AuthDto,
    sessionId: string,
    dto: AgentReadAssetMetadataToolRequestDto,
  ): Promise<ReadAssetMetadataResponse> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: true });

    if (dto.toolCallId) {
      return this.executeApprovedRead(auth, session, dto.toolCallId);
    }

    const assetIds = dto.assetIds ?? [];
    const denialReason = await this.validateReadRequest(auth, session, assetIds);

    if (denialReason) {
      const toolCall = await this.createDeniedAudit(session, assetIds, denialReason);
      return { status: 'denied', reason: denialReason, toolCall: this.mapToolCall(toolCall) };
    }

    const toolCall = await this.toolCallRepository.create({
      ...this.baseToolCall(session, assetIds),
      status: AgentToolCallStatus.PendingApproval,
      approvalDecision: null,
      responseSummary: null,
      redactedResponseMetadata: null,
      completedAt: null,
      error: null,
    });

    await this.sessionRepository.update(auth.user.id, session.id, { status: AgentSessionStatus.WaitingForToolApproval });

    return { status: 'approval-required', toolCall: this.mapToolCall(toolCall) };
  }

  async approveToolCall(
    auth: AuthDto,
    sessionId: string,
    toolCallId: string,
    dto: AgentToolApprovalDto,
  ): Promise<AgentToolCallResponseDto> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: true });
    const toolCall = await this.getToolCallForSession(session.id, toolCallId);

    if (toolCall.status !== AgentToolCallStatus.PendingApproval) {
      throw new BadRequestException('Agent tool call is not pending approval');
    }

    const update =
      dto.decision === AgentToolApprovalDecision.Approved
        ? {
            status: AgentToolCallStatus.Approved,
            approvalDecision: AgentToolApprovalDecision.Approved,
            responseSummary: 'Tool call approved by user',
            completedAt: null,
            error: null,
          }
        : {
            status: AgentToolCallStatus.Denied,
            approvalDecision: AgentToolApprovalDecision.Denied,
            responseSummary: null,
            completedAt: new Date(),
            error: dto.reason ?? 'Denied by user',
          };

    const transitioned = await this.toolCallRepository.transition(
      session.id,
      toolCall.id,
      AgentToolCallStatus.PendingApproval,
      update,
    );

    if (!transitioned) {
      throw new BadRequestException('Agent tool call is not pending approval');
    }

    await this.sessionRepository.update(auth.user.id, session.id, { status: AgentSessionStatus.Running });

    return this.mapToolCall(transitioned);
  }

  async getToolCalls(auth: AuthDto, sessionId: string): Promise<AgentToolCallResponseDto[]> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: false });
    const toolCalls = await this.toolCallRepository.getBySessionId(session.id);
    return toolCalls.map((toolCall) => this.mapToolCall(toolCall));
  }

  private async executeApprovedRead(
    auth: AuthDto,
    session: AgentSession,
    toolCallId: string,
  ): Promise<ReadAssetMetadataResponse> {
    const toolCall = await this.getToolCallForSession(session.id, toolCallId);

    if (toolCall.status === AgentToolCallStatus.Denied) {
      return {
        status: 'denied',
        reason: toolCall.error ?? 'Tool call was denied',
        toolCall: this.mapToolCall(toolCall),
      };
    }

    if (toolCall.status !== AgentToolCallStatus.Approved) {
      throw new BadRequestException('Agent tool call has not been approved');
    }

    const executing = await this.toolCallRepository.transition(session.id, toolCall.id, AgentToolCallStatus.Approved, {
      status: AgentToolCallStatus.Executing,
      approvalDecision: AgentToolApprovalDecision.Approved,
      responseSummary: 'Tool call execution started',
      redactedResponseMetadata: null,
      completedAt: null,
      error: null,
    });

    if (!executing) {
      throw new BadRequestException('Agent tool call is already executing or completed');
    }

    const assetIds = toolCall.redactedRequestMetadata.assetIds;

    try {
      const denialReason = await this.validateReadRequest(auth, session, assetIds, toolCall.id);

      if (denialReason) {
        const denied = await this.transitionExecuting(auth, session, toolCall.id, {
          status: AgentToolCallStatus.Denied,
          approvalDecision: AgentToolApprovalDecision.Denied,
          responseSummary: null,
          redactedResponseMetadata: null,
          completedAt: new Date(),
          error: denialReason,
        });
        return { status: 'denied', reason: denialReason, toolCall: this.mapToolCall(denied) };
      }

      const unorderedAssets = await this.assetRepository.getAgentMetadataByIds(assetIds);
      const assetsById = new Map(unorderedAssets.map((asset) => [asset.id, this.mapAssetMetadata(asset)]));
      const assets = assetIds.flatMap((id) => {
        const asset = assetsById.get(id);
        return asset ? [asset] : [];
      });

      if (assets.length !== assetIds.length) {
        const reason = 'One or more assets were not found during metadata read';
        const failed = await this.transitionExecuting(auth, session, toolCall.id, {
          status: AgentToolCallStatus.Failed,
          approvalDecision: AgentToolApprovalDecision.Approved,
          responseSummary: null,
          redactedResponseMetadata: { assetIds: assets.map((asset) => asset.id) },
          completedAt: new Date(),
          error: reason,
        });
        return { status: 'denied', reason, toolCall: this.mapToolCall(failed) };
      }

      const completed = await this.transitionExecuting(auth, session, toolCall.id, {
        status: AgentToolCallStatus.Completed,
        responseSummary: `Returned metadata for ${assetIds.length} asset(s)`,
        redactedResponseMetadata: { assetIds },
        completedAt: new Date(),
        error: null,
      });

      return { status: 'success', toolCall: this.mapToolCall(completed), assets };
    } catch {
      const reason = 'Metadata read failed';
      const failed = await this.transitionExecuting(auth, session, toolCall.id, {
        status: AgentToolCallStatus.Failed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        responseSummary: null,
        redactedResponseMetadata: null,
        completedAt: new Date(),
        error: reason,
      });
      return { status: 'denied', reason, toolCall: this.mapToolCall(failed) };
    }
  }

  private async transitionExecuting(
    auth: AuthDto,
    session: AgentSession,
    toolCallId: string,
    update: Parameters<AgentToolCallRepository['transition']>[3],
  ): Promise<AgentToolCall> {
    const transitioned = await this.toolCallRepository.transition(
      session.id,
      toolCallId,
      AgentToolCallStatus.Executing,
      update,
    );

    await this.sessionRepository.update(auth.user.id, session.id, { status: AgentSessionStatus.Running });

    if (!transitioned) {
      throw new BadRequestException('Agent tool call is already executing or completed');
    }

    return transitioned;
  }

  private async validateReadRequest(
    auth: AuthDto,
    session: AgentSession,
    assetIds: string[],
    excludedToolCallId?: string,
  ): Promise<string | null> {
    const plan = session.permissionPlanSnapshot;

    if (session.approvalMode !== AgentApprovalMode.Strict) {
      return AgentToolService.strictModeReason;
    }

    if (!plan.read.metadata) {
      return 'Agent permission policy does not allow metadata reads';
    }

    if (!plan.providerExposure.metadata) {
      return 'Agent provider exposure policy does not allow metadata reads';
    }

    if (assetIds.length > plan.limits.maxAssetsPerToolCall) {
      return 'Requested asset count exceeds per-tool limit';
    }

    const countedAssetCount = excludedToolCallId
      ? await this.toolCallRepository.getCountedAssetCountBySession(session.id, excludedToolCallId)
      : await this.toolCallRepository.getCountedAssetCountBySession(session.id);
    if (countedAssetCount + assetIds.length > plan.limits.maxAssetsPerSession) {
      return 'Requested asset count exceeds per-session limit';
    }

    const readableIds = await this.getReadableAssetIds(auth, plan, assetIds);
    if (readableIds.size !== assetIds.length) {
      return 'One or more assets are not accessible';
    }

    return null;
  }

  private async getReadableAssetIds(
    auth: AuthDto,
    plan: AgentPermissionPlanSnapshot,
    assetIds: string[],
  ): Promise<Set<string>> {
    const requestedIds = new Set(assetIds);
    const readableIds = new Set<string>();
    const allowLockedAssets = plan.assetScope.locked && auth.session?.hasElevatedPermission === true;

    if (plan.assetScope.owned) {
      const ownerIds = await this.accessRepository.asset.checkOwnerAccess(auth.user.id, requestedIds, allowLockedAssets);
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

    return readableIds;
  }

  private async createDeniedAudit(session: AgentSession, assetIds: string[], reason: string): Promise<AgentToolCall> {
    return this.toolCallRepository.create({
      ...this.baseToolCall(session, assetIds),
      status: AgentToolCallStatus.Denied,
      approvalDecision: AgentToolApprovalDecision.Denied,
      responseSummary: null,
      redactedResponseMetadata: null,
      completedAt: new Date(),
      error: reason,
    });
  }

  private baseToolCall(session: AgentSession, assetIds: string[]): Omit<
    AgentToolCallCreate,
    'status' | 'approvalDecision' | 'responseSummary' | 'redactedResponseMetadata' | 'completedAt' | 'error'
  > {
    return {
      sessionId: session.id,
      toolName: AgentToolName.ReadAssetMetadata,
      requestSummary: `Read metadata for ${assetIds.length} asset(s)`,
      redactedRequestMetadata: { assetIds },
      dataClass: AgentToolDataClass.Metadata,
      assetCount: assetIds.length,
      albumCount: 0,
      providerSnapshot: {
        providerCredentialId: session.credentialSnapshot.id,
        providerType: session.credentialSnapshot.providerType,
        label: session.credentialSnapshot.label,
        baseUrl: session.credentialSnapshot.baseUrl,
        model: session.modelSnapshot.model,
      },
    };
  }

  private async getOwnedSession(
    auth: AuthDto,
    sessionId: string,
    options: { requireActive: boolean },
  ): Promise<AgentSession> {
    const session = await this.sessionRepository.getById(auth.user.id, sessionId);

    if (!session || (options.requireActive && !AgentToolService.activeStatuses.includes(session.status))) {
      throw new BadRequestException('Agent session not found');
    }

    return session;
  }

  private async getToolCallForSession(sessionId: string, toolCallId: string): Promise<AgentToolCall> {
    const toolCall = await this.toolCallRepository.getByIdForSession(sessionId, toolCallId);
    if (!toolCall) {
      throw new BadRequestException('Agent tool call not found');
    }

    return toolCall;
  }

  private mapToolCall(toolCall: AgentToolCall): AgentToolCallResponseDto {
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

  private mapAssetMetadata(asset: AgentAssetMetadata): AgentAssetMetadata {
    return {
      id: asset.id,
      ownerId: asset.ownerId,
      type: asset.type,
      originalFileName: asset.originalFileName,
      localDateTime: asset.localDateTime,
      fileCreatedAt: asset.fileCreatedAt,
      fileModifiedAt: asset.fileModifiedAt,
      isFavorite: asset.isFavorite,
      visibility: asset.visibility,
      exifInfo: asset.exifInfo
        ? {
            dateTimeOriginal: asset.exifInfo.dateTimeOriginal,
            city: asset.exifInfo.city,
            state: asset.exifInfo.state,
            country: asset.exifInfo.country,
            make: asset.exifInfo.make,
            model: asset.exifInfo.model,
            lensModel: asset.exifInfo.lensModel,
            latitude: asset.exifInfo.latitude,
            longitude: asset.exifInfo.longitude,
            rating: asset.exifInfo.rating,
          }
        : null,
      tags: asset.tags.map((tag) => ({ id: tag.id, value: tag.value, color: tag.color })),
    };
  }
}
