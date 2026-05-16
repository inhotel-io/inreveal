import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentSession, AgentToolCall } from 'src/database';
import {
  AgentListAlbumsToolRequestDto,
  AgentListAlbumsToolResponseDto,
  AgentReadAlbumToolRequestDto,
  AgentReadAlbumToolResponseDto,
  AgentReadAssetMetadataToolRequestDto,
  AgentReadAssetMetadataToolResponseDto,
  AgentReadAssetOriginalsToolRequestDto,
  AgentReadAssetOriginalsToolResponseDto,
  AgentReadAssetPreviewsToolRequestDto,
  AgentReadAssetPreviewsToolResponseDto,
  AgentSearchAssetsToolRequestDto,
  AgentSearchAssetsToolResponseDto,
  AgentToolApprovalDto,
  AgentToolCallResponseDto,
} from 'src/dtos/agent-tool.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  AgentApprovalMode,
  AgentProviderType,
  AgentSessionStatus,
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
  AlbumUserRole,
} from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { AgentToolCallRepository } from 'src/repositories/agent-tool-call.repository';
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { AgentRunnerService } from 'src/services/agent-runner.service';
import { AgentPermissionPlanSnapshot } from 'src/types/agent-session.types';
import {
  AgentAlbumDetail,
  AgentAlbumSummary,
  AgentAssetMediaReference,
  AgentAssetMetadata,
  AgentSearchAssetsFilters,
  AgentToolListAlbumsRequestMetadata,
  AgentToolReadAssetIdsRequestMetadata,
  AgentToolResponseMetadata,
  AgentToolSearchAssetsRequestMetadata,
} from 'src/types/agent-tool.types';

type AgentReadToolResponse<TResult extends Record<string, unknown>> =
  | { status: 'approval-required'; toolCall: AgentToolCallResponseDto }
  | { status: 'denied'; reason: string; toolCall: AgentToolCallResponseDto }
  | ({ status: 'success'; toolCall: AgentToolCallResponseDto } & TResult);

type ToolCallCreate = Parameters<AgentToolCallRepository['create']>[0];

type AgentReadToolDescriptor<TRequest, TResult extends Record<string, unknown>> = {
  toolName: AgentToolName;
  dataClass: AgentToolDataClass;
  requestSummary: (request: TRequest) => string;
  requestMetadata: (request: TRequest) => AgentToolCall['redactedRequestMetadata'];
  requestedAssetCount: (request: TRequest) => number;
  requestedAlbumCount: (request: TRequest) => number;
  perToolLimit: (plan: AgentPermissionPlanSnapshot) => number;
  perSessionLimit: (plan: AgentPermissionPlanSnapshot) => number;
  validateAccess: (auth: AuthDto, session: AgentSession, request: TRequest) => Promise<string | null>;
  execute: (auth: AuthDto, session: AgentSession, request: TRequest, toolCallId: string) => Promise<TResult>;
  responseSummary: (result: TResult) => string;
  responseMetadata: (result: TResult) => AgentToolCall['redactedResponseMetadata'];
  resultAssetCount: (result: TResult) => number;
  resultAlbumCount: (result: TResult) => number;
  failedReason: string;
};

class AgentToolDeniedError extends Error {}

class AgentToolRecordedDeniedError extends Error {
  constructor(
    message: string,
    readonly toolCall: AgentToolCall,
  ) {
    super(message);
  }
}

class AgentToolFailedError extends Error {}

const isReadAssetIdsRequestMetadata = (
  metadata: AgentToolCall['redactedRequestMetadata'],
): metadata is AgentToolReadAssetIdsRequestMetadata =>
  'assetIds' in metadata && Array.isArray(metadata.assetIds) && metadata.assetIds.every((id) => typeof id === 'string');

@Injectable()
export class AgentToolService {
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
    private readonly albumRepository: AlbumRepository,
    private readonly sessionRepository: AgentSessionRepository,
    private readonly toolCallRepository: AgentToolCallRepository,
    private readonly agentRunnerService: AgentRunnerService,
  ) {}

  async searchAssets(
    auth: AuthDto,
    sessionId: string,
    dto: AgentSearchAssetsToolRequestDto,
  ): Promise<AgentSearchAssetsToolResponseDto> {
    return this.runReadTool(auth, sessionId, dto, this.searchAssetsDescriptor());
  }

  async readAssetMetadata(
    auth: AuthDto,
    sessionId: string,
    dto: AgentReadAssetMetadataToolRequestDto,
  ): Promise<AgentReadAssetMetadataToolResponseDto> {
    return this.runReadTool(auth, sessionId, dto, this.readAssetMetadataDescriptor());
  }

  async readAssetPreviews(
    auth: AuthDto,
    sessionId: string,
    dto: AgentReadAssetPreviewsToolRequestDto,
  ): Promise<AgentReadAssetPreviewsToolResponseDto> {
    return this.runReadTool(auth, sessionId, dto, this.readAssetPreviewsDescriptor());
  }

  async readAssetOriginals(
    auth: AuthDto,
    sessionId: string,
    dto: AgentReadAssetOriginalsToolRequestDto,
  ): Promise<AgentReadAssetOriginalsToolResponseDto> {
    return this.runReadTool(auth, sessionId, dto, this.readAssetOriginalsDescriptor());
  }

  async listAlbums(
    auth: AuthDto,
    sessionId: string,
    dto: AgentListAlbumsToolRequestDto,
  ): Promise<AgentListAlbumsToolResponseDto> {
    return this.runReadTool(auth, sessionId, dto, this.listAlbumsDescriptor());
  }

  async readAlbum(
    auth: AuthDto,
    sessionId: string,
    dto: AgentReadAlbumToolRequestDto,
  ): Promise<AgentReadAlbumToolResponseDto> {
    return this.runReadTool(auth, sessionId, dto, this.readAlbumDescriptor());
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
            redactedResponseMetadata: null,
            completedAt: null,
            error: null,
          }
        : {
            status: AgentToolCallStatus.Denied,
            approvalDecision: AgentToolApprovalDecision.Denied,
            responseSummary: null,
            redactedResponseMetadata: null,
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
    if (session.runnerSessionId) {
      void this.resumeRunnerAfterApprovalDecision(auth, session, transitioned, dto.decision).catch(() => {});
    }

    return this.mapToolCall(transitioned);
  }

  private async resumeRunnerAfterApprovalDecision(
    auth: AuthDto,
    session: AgentSession,
    toolCall: AgentToolCall,
    approvalDecision: AgentToolApprovalDecision,
  ) {
    const toolResult =
      approvalDecision === AgentToolApprovalDecision.Approved
        ? await this.executeApprovedToolCall(auth, session, toolCall)
        : undefined;

    await this.agentRunnerService.resumeAfterToolApproval({
      userId: auth.user.id,
      sessionId: session.id,
      runnerSessionId: session.runnerSessionId!,
      toolCallId: toolCall.id,
      approvalDecision,
      toolResult,
    });
  }

  private executeApprovedToolCall(auth: AuthDto, session: AgentSession, toolCall: AgentToolCall): Promise<unknown> {
    switch (toolCall.toolName) {
      case AgentToolName.SearchAssets: {
        return this.searchAssets(auth, session.id, { toolCallId: toolCall.id });
      }
      case AgentToolName.ReadAssetMetadata: {
        return this.readAssetMetadata(auth, session.id, { toolCallId: toolCall.id });
      }
      case AgentToolName.ReadAssetPreviews: {
        return this.readAssetPreviews(auth, session.id, { toolCallId: toolCall.id });
      }
      case AgentToolName.ReadAssetOriginals: {
        return this.readAssetOriginals(auth, session.id, { toolCallId: toolCall.id });
      }
      case AgentToolName.ListAlbums: {
        return this.listAlbums(auth, session.id, { toolCallId: toolCall.id });
      }
      case AgentToolName.ReadAlbum: {
        return this.readAlbum(auth, session.id, { toolCallId: toolCall.id });
      }
      default: {
        return Promise.resolve(undefined);
      }
    }
  }

  async getToolCalls(auth: AuthDto, sessionId: string): Promise<AgentToolCallResponseDto[]> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: false });
    const toolCalls = await this.toolCallRepository.getBySessionId(session.id);
    return toolCalls.map((toolCall) => this.mapToolCall(toolCall));
  }

  private async runReadTool<TRequest extends { toolCallId?: string }, TResult extends Record<string, unknown>>(
    auth: AuthDto,
    sessionId: string,
    dto: TRequest,
    descriptor: AgentReadToolDescriptor<TRequest, TResult>,
  ): Promise<AgentReadToolResponse<TResult>> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: true });

    if (dto.toolCallId) {
      return this.executeApprovedRead(auth, session, dto.toolCallId, descriptor);
    }

    return this.createOrExecuteRead(auth, session, dto, descriptor);
  }

  private async createOrExecuteRead<TRequest, TResult extends Record<string, unknown>>(
    auth: AuthDto,
    session: AgentSession,
    request: TRequest,
    descriptor: AgentReadToolDescriptor<TRequest, TResult>,
  ): Promise<AgentReadToolResponse<TResult>> {
    if (this.requiresApproval(session, descriptor.dataClass)) {
      const shouldUseAtomicSessionLimit = this.shouldUseAtomicSessionLimit(session, request, descriptor);
      const denialReason = await this.validateReadRequest(auth, session, request, descriptor, undefined, {
        validateSessionLimit: !shouldUseAtomicSessionLimit,
      });

      if (denialReason) {
        const toolCall = await this.createDeniedAudit(session, request, descriptor, denialReason);
        return { status: 'denied', reason: denialReason, toolCall: this.mapToolCall(toolCall) };
      }

      const result = await this.createPendingAudit(session, request, descriptor);
      if (result.status === 'limit-exceeded') {
        return { status: 'denied', reason: result.reason, toolCall: this.mapToolCall(result.toolCall) };
      }

      await this.sessionRepository.update(session.userId, session.id, {
        status: AgentSessionStatus.WaitingForToolApproval,
      });

      return { status: 'approval-required', toolCall: this.mapToolCall(result.toolCall) };
    }

    const shouldUseAtomicSessionLimit = this.shouldUseAtomicSessionLimit(session, request, descriptor);
    const denialReason = await this.validateReadRequest(auth, session, request, descriptor, undefined, {
      validateSessionLimit: !shouldUseAtomicSessionLimit,
    });
    if (denialReason) {
      const toolCall = await this.createDeniedAudit(session, request, descriptor, denialReason);
      return { status: 'denied', reason: denialReason, toolCall: this.mapToolCall(toolCall) };
    }

    const executingDto: ToolCallCreate = {
      ...this.baseToolCall(session, request, descriptor),
      status: AgentToolCallStatus.Executing,
      approvalDecision: AgentToolApprovalDecision.Approved,
      responseSummary: 'Tool call execution started',
      redactedResponseMetadata: null,
      completedAt: null,
      error: null,
    };
    const executing = shouldUseAtomicSessionLimit
      ? await this.createExecutingAuditWithSessionLimit(session, request, descriptor, executingDto)
      : await this.toolCallRepository.create(executingDto);

    if ('reason' in executing) {
      return { status: 'denied', reason: executing.reason, toolCall: this.mapToolCall(executing.toolCall) };
    }

    return this.executeClaimedRead(auth, session, executing.id, request, descriptor);
  }

  private async executeApprovedRead<TRequest, TResult extends Record<string, unknown>>(
    auth: AuthDto,
    session: AgentSession,
    toolCallId: string,
    descriptor: AgentReadToolDescriptor<TRequest, TResult>,
  ): Promise<AgentReadToolResponse<TResult>> {
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

    const request = this.getStoredRequest(toolCall, descriptor);

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

    let refreshedSession: AgentSession;
    try {
      refreshedSession = await this.getOwnedSession(auth, session.id, { requireActive: true });
    } catch (error) {
      await this.toolCallRepository.transition(session.id, toolCall.id, AgentToolCallStatus.Executing, {
        status: AgentToolCallStatus.Failed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        responseSummary: null,
        redactedResponseMetadata: null,
        completedAt: new Date(),
        error: 'Agent session not found',
      });
      throw error;
    }
    const denialReason = await this.validateReadRequest(auth, refreshedSession, request, descriptor, toolCall.id);
    if (denialReason) {
      const denied = await this.transitionExecuting(auth, refreshedSession, toolCall.id, {
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        responseSummary: null,
        redactedResponseMetadata: null,
        completedAt: new Date(),
        error: denialReason,
      });
      return { status: 'denied', reason: denialReason, toolCall: this.mapToolCall(denied) };
    }

    return this.executeClaimedRead(auth, refreshedSession, toolCall.id, request, descriptor);
  }

  private async executeClaimedRead<TRequest, TResult extends Record<string, unknown>>(
    auth: AuthDto,
    session: AgentSession,
    toolCallId: string,
    request: TRequest,
    descriptor: AgentReadToolDescriptor<TRequest, TResult>,
  ): Promise<AgentReadToolResponse<TResult>> {
    try {
      const result = await descriptor.execute(auth, session, request, toolCallId);
      const completed = await this.transitionExecuting(auth, session, toolCallId, {
        status: AgentToolCallStatus.Completed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        responseSummary: descriptor.responseSummary(result),
        redactedResponseMetadata: descriptor.responseMetadata(result),
        assetCount: descriptor.resultAssetCount(result),
        albumCount: descriptor.resultAlbumCount(result),
        completedAt: new Date(),
        error: null,
      });

      return { status: 'success', toolCall: this.mapToolCall(completed), ...result };
    } catch (error) {
      if (error instanceof AgentToolDeniedError) {
        const denied = await this.transitionExecuting(auth, session, toolCallId, {
          status: AgentToolCallStatus.Denied,
          approvalDecision: AgentToolApprovalDecision.Denied,
          responseSummary: null,
          redactedResponseMetadata: null,
          completedAt: new Date(),
          error: error.message,
        });
        return { status: 'denied', reason: error.message, toolCall: this.mapToolCall(denied) };
      }

      if (error instanceof AgentToolRecordedDeniedError) {
        return { status: 'denied', reason: error.message, toolCall: this.mapToolCall(error.toolCall) };
      }

      if (!(error instanceof AgentToolFailedError)) {
        await this.tryRecordUnexpectedReadFailure(auth, session, toolCallId, descriptor.failedReason);
        throw error;
      }

      const reason = error.message;
      const failed = await this.transitionExecuting(auth, session, toolCallId, {
        status: AgentToolCallStatus.Failed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        responseSummary: null,
        redactedResponseMetadata: 'metadata' in error ? (error.metadata as AgentToolResponseMetadata) : null,
        completedAt: new Date(),
        error: reason,
      });
      return { status: 'denied', reason, toolCall: this.mapToolCall(failed) };
    }
  }

  private searchAssetsDescriptor(): AgentReadToolDescriptor<
    AgentSearchAssetsToolRequestDto,
    { assets: AgentAssetMetadata[]; nextPage: string | null }
  > {
    return {
      toolName: AgentToolName.SearchAssets,
      dataClass: AgentToolDataClass.Metadata,
      requestSummary: (request) => `Search assets (limit ${request.limit ?? 0})`,
      requestMetadata: (request) =>
        ({ filters: request.filters ?? {}, limit: request.limit ?? 0 }) as AgentToolSearchAssetsRequestMetadata,
      requestedAssetCount: (request) => request.limit ?? 0,
      requestedAlbumCount: () => 0,
      perToolLimit: (plan) => plan.limits.maxAssetsPerToolCall,
      perSessionLimit: (plan) => plan.limits.maxAssetsPerSession,
      validateAccess: (auth, session, request) => this.validateSearchFilters(auth, session, request.filters ?? {}),
      execute: async (auth, session, request) => {
        const result = await this.assetRepository.searchAgentMetadata({
          userId: auth.user.id,
          filters: request.filters ?? {},
          limit: request.limit ?? 0,
          scope: this.getRepositoryScope(auth, session.permissionPlanSnapshot),
        });
        await this.assertReturnedAssetsAreAccessible(
          auth,
          session,
          result.assets.map((asset) => asset.id),
        );
        return { assets: result.assets.map((asset) => this.mapAssetMetadata(asset)), nextPage: result.nextPage };
      },
      responseSummary: (result) => this.getReturnedMetadataSummary(result.assets.length),
      responseMetadata: (result) => ({ assetIds: result.assets.map((asset) => asset.id) }),
      resultAssetCount: (result) => result.assets.length,
      resultAlbumCount: () => 0,
      failedReason: 'Asset search failed',
    };
  }

  private readAssetMetadataDescriptor(): AgentReadToolDescriptor<
    AgentReadAssetMetadataToolRequestDto,
    { assets: AgentAssetMetadata[] }
  > {
    return {
      toolName: AgentToolName.ReadAssetMetadata,
      dataClass: AgentToolDataClass.Metadata,
      requestSummary: (request) => `Read metadata for ${(request.assetIds ?? []).length} asset(s)`,
      requestMetadata: (request) => ({ assetIds: request.assetIds ?? [] }),
      requestedAssetCount: (request) => (request.assetIds ?? []).length,
      requestedAlbumCount: () => 0,
      perToolLimit: (plan) => plan.limits.maxAssetsPerToolCall,
      perSessionLimit: (plan) => plan.limits.maxAssetsPerSession,
      validateAccess: (auth, session, request) => this.validateAssetAccess(auth, session, request.assetIds ?? []),
      execute: async (_auth, _session, request) => {
        const assetIds = request.assetIds ?? [];
        const unorderedAssets = await this.assetRepository.getAgentMetadataByIds(assetIds);
        const assetsById = new Map(
          unorderedAssets.map((asset) => [asset.id, this.mapAssetMetadata(asset as AgentAssetMetadata)]),
        );
        const assets = assetIds.flatMap((id) => {
          const asset = assetsById.get(id);
          return asset ? [asset] : [];
        });

        if (assets.length !== assetIds.length) {
          const error = new AgentToolFailedError('One or more assets were not found during metadata read');
          (error as AgentToolFailedError & { metadata: AgentToolResponseMetadata }).metadata = {
            assetIds: assets.map((asset) => asset.id),
          };
          throw error;
        }

        return { assets };
      },
      responseSummary: (result) => this.getReturnedMetadataSummary(result.assets.length),
      responseMetadata: (result) => ({ assetIds: result.assets.map((asset) => asset.id) }),
      resultAssetCount: (result) => result.assets.length,
      resultAlbumCount: () => 0,
      failedReason: 'Metadata read failed',
    };
  }

  private readAssetPreviewsDescriptor(): AgentReadToolDescriptor<
    AgentReadAssetPreviewsToolRequestDto,
    { previews: AgentAssetMediaReference[] }
  > {
    return this.assetReferenceDescriptor({
      toolName: AgentToolName.ReadAssetPreviews,
      dataClass: AgentToolDataClass.Previews,
      requestSummary: (count) => `Read previews for ${count} asset(s)`,
      responseSummary: (count) => `Returned previews for ${count} asset(s)`,
      perToolLimit: (plan) => plan.limits.maxPreviewsPerToolCall,
      perSessionLimit: (plan) => plan.limits.maxPreviewsPerSession ?? plan.limits.maxPreviewsPerToolCall ?? 0,
      execute: (ids) => this.assetRepository.getAgentPreviewReferencesByIds(ids),
      resultKey: 'previews',
      failedReason: 'Preview read failed',
    });
  }

  private readAssetOriginalsDescriptor(): AgentReadToolDescriptor<
    AgentReadAssetOriginalsToolRequestDto,
    { originals: AgentAssetMediaReference[] }
  > {
    return this.assetReferenceDescriptor({
      toolName: AgentToolName.ReadAssetOriginals,
      dataClass: AgentToolDataClass.Originals,
      requestSummary: (count) => `Read originals for ${count} asset(s)`,
      responseSummary: (count) => `Returned originals for ${count} asset(s)`,
      perToolLimit: (plan) => plan.limits.maxOriginalsPerToolCall,
      perSessionLimit: (plan) => plan.limits.maxOriginalsPerSession ?? plan.limits.maxOriginalsPerToolCall ?? 0,
      execute: (ids) => this.assetRepository.getAgentOriginalReferencesByIds(ids),
      resultKey: 'originals',
      failedReason: 'Original read failed',
    });
  }

  private assetReferenceDescriptor<TKey extends 'previews' | 'originals'>(options: {
    toolName: AgentToolName;
    dataClass: AgentToolDataClass;
    requestSummary: (count: number) => string;
    responseSummary: (count: number) => string;
    perToolLimit: (plan: AgentPermissionPlanSnapshot) => number;
    perSessionLimit: (plan: AgentPermissionPlanSnapshot) => number;
    execute: (assetIds: string[]) => Promise<AgentAssetMediaReference[]>;
    resultKey: TKey;
    failedReason: string;
  }): AgentReadToolDescriptor<
    { assetIds?: string[]; toolCallId?: string },
    TKey extends 'previews' ? { previews: AgentAssetMediaReference[] } : { originals: AgentAssetMediaReference[] }
  > {
    type Result = TKey extends 'previews'
      ? { previews: AgentAssetMediaReference[] }
      : { originals: AgentAssetMediaReference[] };

    return {
      toolName: options.toolName,
      dataClass: options.dataClass,
      requestSummary: (request) => options.requestSummary((request.assetIds ?? []).length),
      requestMetadata: (request) => ({ assetIds: request.assetIds ?? [] }),
      requestedAssetCount: (request) => (request.assetIds ?? []).length,
      requestedAlbumCount: () => 0,
      perToolLimit: options.perToolLimit,
      perSessionLimit: options.perSessionLimit,
      validateAccess: (auth, session, request) => this.validateAssetAccess(auth, session, request.assetIds ?? []),
      execute: async (_auth, _session, request) => {
        const refs = await options.execute(request.assetIds ?? []);
        return { [options.resultKey]: refs } as Result;
      },
      responseSummary: (result) => options.responseSummary(this.getMediaReferences(result, options.resultKey).length),
      responseMetadata: (result) => ({
        assetIds: this.getMediaReferences(result, options.resultKey).map((reference) => reference.assetId),
      }),
      resultAssetCount: (result) => this.getMediaReferences(result, options.resultKey).length,
      resultAlbumCount: () => 0,
      failedReason: options.failedReason,
    };
  }

  private listAlbumsDescriptor(): AgentReadToolDescriptor<
    AgentListAlbumsToolRequestDto,
    { albums: AgentAlbumSummary[] }
  > {
    return {
      toolName: AgentToolName.ListAlbums,
      dataClass: AgentToolDataClass.Metadata,
      requestSummary: () => 'List albums',
      requestMetadata: () => ({}) as AgentToolListAlbumsRequestMetadata,
      requestedAssetCount: () => 0,
      requestedAlbumCount: () => 0,
      perToolLimit: () => Number.MAX_SAFE_INTEGER,
      perSessionLimit: (plan) => plan.limits.maxAssetsPerSession,
      validateAccess: () => Promise.resolve(null),
      execute: async (auth, session) => {
        const albums = await this.albumRepository.getAgentAlbums(auth.user.id);
        return {
          albums: albums.filter((album) => {
            const isOwned = album.ownerId === auth.user.id;
            return isOwned
              ? session.permissionPlanSnapshot.assetScope.owned
              : session.permissionPlanSnapshot.assetScope.sharedSpaces;
          }),
        };
      },
      responseSummary: (result) => `Returned ${result.albums.length} album(s)`,
      responseMetadata: (result) => ({ albumIds: result.albums.map((album) => album.id) }),
      resultAssetCount: () => 0,
      resultAlbumCount: (result) => result.albums.length,
      failedReason: 'Album list failed',
    };
  }

  private readAlbumDescriptor(): AgentReadToolDescriptor<AgentReadAlbumToolRequestDto, { album: AgentAlbumDetail }> {
    return {
      toolName: AgentToolName.ReadAlbum,
      dataClass: AgentToolDataClass.Metadata,
      requestSummary: (request) => `Read album ${request.albumId}`,
      requestMetadata: (request) => ({ albumId: request.albumId ?? '' }),
      requestedAssetCount: () => 0,
      requestedAlbumCount: () => 1,
      perToolLimit: () => Number.MAX_SAFE_INTEGER,
      perSessionLimit: (plan) => plan.limits.maxAssetsPerSession,
      validateAccess: (auth, session, request) => this.validateAlbumAccess(auth, session, request.albumId ?? ''),
      execute: async (auth, session, request, toolCallId) => {
        const album = await this.albumRepository.getAgentAlbumById(auth.user.id, request.albumId ?? '');
        if (!album) {
          throw new AgentToolDeniedError('Album is not accessible');
        }

        if (album.assetCount > session.permissionPlanSnapshot.limits.maxAssetsPerToolCall) {
          throw new AgentToolDeniedError('Requested asset count exceeds per-tool limit');
        }

        const reservation = await this.toolCallRepository.transitionWithSessionLimit(
          session.id,
          toolCallId,
          AgentToolCallStatus.Executing,
          {
            status: AgentToolCallStatus.Executing,
            approvalDecision: AgentToolApprovalDecision.Approved,
            responseSummary: 'Tool call execution started',
            redactedResponseMetadata: null,
            assetCount: album.assetCount,
            albumCount: 1,
            completedAt: null,
            error: null,
          },
          AgentToolDataClass.Metadata,
          session.permissionPlanSnapshot.limits.maxAssetsPerSession,
        );

        await this.sessionRepository.update(auth.user.id, session.id, { status: AgentSessionStatus.Running });

        if (reservation.status === 'stale') {
          throw new BadRequestException('Agent tool call is already executing or completed');
        }

        if (reservation.status === 'limit-exceeded') {
          throw new AgentToolRecordedDeniedError(
            this.getSessionLimitReason(session.permissionPlanSnapshot.limits.maxAssetsPerSession),
            reservation.toolCall,
          );
        }

        return { album };
      },
      responseSummary: (result) => `Returned album with ${result.album.assetCount} asset(s)`,
      responseMetadata: (result) => ({ albumIds: [result.album.id], assetIds: result.album.assetIds }),
      resultAssetCount: (result) => result.album.assetCount,
      resultAlbumCount: () => 1,
      failedReason: 'Album read failed',
    };
  }

  private async createExecutingAuditWithSessionLimit<TRequest, TResult extends Record<string, unknown>>(
    session: AgentSession,
    request: TRequest,
    descriptor: AgentReadToolDescriptor<TRequest, TResult>,
    executingDto: ToolCallCreate,
  ): Promise<AgentToolCall | { status: 'limit-exceeded'; toolCall: AgentToolCall; reason: string }> {
    const maxAssetsPerSession = descriptor.perSessionLimit(session.permissionPlanSnapshot);
    const reason = this.getSessionLimitReason(maxAssetsPerSession);
    const deniedDto: ToolCallCreate = {
      ...this.baseToolCall(session, request, descriptor),
      status: AgentToolCallStatus.Denied,
      approvalDecision: AgentToolApprovalDecision.Denied,
      responseSummary: null,
      redactedResponseMetadata: null,
      completedAt: new Date(),
      error: reason,
    };
    const result = await this.toolCallRepository.createWithSessionLimit(
      executingDto,
      deniedDto,
      descriptor.dataClass,
      maxAssetsPerSession,
    );
    return result.status === 'limit-exceeded'
      ? { status: 'limit-exceeded', toolCall: result.toolCall, reason }
      : result.toolCall;
  }

  private shouldUseAtomicSessionLimit<TRequest, TResult extends Record<string, unknown>>(
    session: AgentSession,
    request: TRequest,
    descriptor: AgentReadToolDescriptor<TRequest, TResult>,
  ): boolean {
    const requestedAssetCount = descriptor.requestedAssetCount(request);
    const maxAssetsPerSession = descriptor.perSessionLimit(session.permissionPlanSnapshot);
    return requestedAssetCount > 0 && maxAssetsPerSession !== Number.MAX_SAFE_INTEGER;
  }

  private getPolicyDenial(session: AgentSession, dataClass: AgentToolDataClass): string | null {
    const { read, providerExposure } = session.permissionPlanSnapshot;

    if (dataClass === AgentToolDataClass.Metadata && !read.metadata) {
      return 'Agent permission policy does not allow metadata reads';
    }
    if (dataClass === AgentToolDataClass.Previews && !read.previews) {
      return 'Agent permission policy does not allow preview reads';
    }
    if (dataClass === AgentToolDataClass.Originals && !read.originals) {
      return 'Agent permission policy does not allow original reads';
    }

    if (dataClass === AgentToolDataClass.Metadata && !providerExposure.metadata) {
      return 'Agent provider exposure policy does not allow metadata reads';
    }
    if (dataClass === AgentToolDataClass.Previews && !providerExposure.previews) {
      return 'Agent provider exposure policy does not allow preview reads';
    }
    if (dataClass === AgentToolDataClass.Originals && !providerExposure.originals) {
      return 'Agent provider exposure policy does not allow original reads';
    }

    if (
      dataClass === AgentToolDataClass.Originals &&
      !providerExposure.allowOriginalsForExternalProviders &&
      session.credentialSnapshot.providerType !== AgentProviderType.OpenAICompatible
    ) {
      return 'Agent provider exposure policy only allows originals for local or self-hosted providers';
    }

    return null;
  }

  private async validateReadRequest<TRequest, TResult extends Record<string, unknown>>(
    auth: AuthDto,
    session: AgentSession,
    request: TRequest,
    descriptor: AgentReadToolDescriptor<TRequest, TResult>,
    excludedToolCallId?: string,
    options?: { validateSessionLimit: boolean },
  ): Promise<string | null> {
    const plan = session.permissionPlanSnapshot;
    const policyDenial = this.getPolicyDenial(session, descriptor.dataClass);
    if (policyDenial) {
      return policyDenial;
    }

    if (descriptor.requestedAssetCount(request) > descriptor.perToolLimit(plan)) {
      return 'Requested asset count exceeds per-tool limit';
    }

    if (options?.validateSessionLimit ?? true) {
      const sessionLimitDenial = await this.getSessionLimitDenialReason(
        session,
        request,
        descriptor,
        excludedToolCallId,
      );
      if (sessionLimitDenial) {
        return sessionLimitDenial;
      }
    }

    return descriptor.validateAccess(auth, session, request);
  }

  private requiresApproval(session: AgentSession, dataClass: AgentToolDataClass): boolean {
    switch (session.approvalMode) {
      case AgentApprovalMode.Strict: {
        return true;
      }
      case AgentApprovalMode.AskOnEscalation: {
        return dataClass !== AgentToolDataClass.Metadata;
      }
      case AgentApprovalMode.PlanOnly: {
        return false;
      }
      case AgentApprovalMode.DangerouslySkipPermissions: {
        return false;
      }
      default: {
        return true;
      }
    }
  }

  private async createPendingAudit<TRequest, TResult extends Record<string, unknown>>(
    session: AgentSession,
    request: TRequest,
    descriptor: AgentReadToolDescriptor<TRequest, TResult>,
  ): Promise<
    | { status: 'created'; toolCall: AgentToolCall }
    | { status: 'limit-exceeded'; toolCall: AgentToolCall; reason: string }
  > {
    const pendingDto: ToolCallCreate = {
      ...this.baseToolCall(session, request, descriptor),
      status: AgentToolCallStatus.PendingApproval,
      approvalDecision: null,
      responseSummary: null,
      redactedResponseMetadata: null,
      completedAt: null,
      error: null,
    };
    const reason = this.getSessionLimitReason(descriptor.perSessionLimit(session.permissionPlanSnapshot));
    const deniedDto: ToolCallCreate = {
      ...this.baseToolCall(session, request, descriptor),
      status: AgentToolCallStatus.Denied,
      approvalDecision: AgentToolApprovalDecision.Denied,
      responseSummary: null,
      redactedResponseMetadata: null,
      completedAt: new Date(),
      error: reason,
    };

    if (this.shouldUseAtomicSessionLimit(session, request, descriptor)) {
      const result = await this.toolCallRepository.createWithSessionLimit(
        pendingDto,
        deniedDto,
        descriptor.dataClass,
        descriptor.perSessionLimit(session.permissionPlanSnapshot),
      );
      return result.status === 'limit-exceeded'
        ? { status: 'limit-exceeded', toolCall: result.toolCall, reason }
        : { status: 'created', toolCall: result.toolCall };
    }

    const limitReason = await this.getSessionLimitDenialReason(session, request, descriptor);
    if (limitReason) {
      const toolCall = await this.toolCallRepository.create({ ...deniedDto, error: limitReason });
      return { status: 'limit-exceeded', toolCall, reason: limitReason };
    }

    return { status: 'created', toolCall: await this.toolCallRepository.create(pendingDto) };
  }

  private async getSessionLimitDenialReason<TRequest, TResult extends Record<string, unknown>>(
    session: AgentSession,
    request: TRequest,
    descriptor: AgentReadToolDescriptor<TRequest, TResult>,
    excludedToolCallId?: string,
  ): Promise<string | null> {
    const maxCount = descriptor.perSessionLimit(session.permissionPlanSnapshot);
    const requestedCount = descriptor.requestedAssetCount(request);
    return this.getSessionLimitDenialReasonForCount(
      session,
      descriptor.dataClass,
      maxCount,
      requestedCount,
      excludedToolCallId,
    );
  }

  private async getSessionLimitDenialReasonForCount(
    session: AgentSession,
    dataClass: AgentToolDataClass,
    maxCount: number,
    requestedCount: number,
    excludedToolCallId?: string,
  ): Promise<string | null> {
    if (requestedCount === 0 || maxCount === Number.MAX_SAFE_INTEGER) {
      return null;
    }

    const countedAssetCount = await this.getCountedAssetCount(session, dataClass, excludedToolCallId);
    return countedAssetCount + requestedCount > maxCount ? this.getSessionLimitReason(maxCount) : null;
  }

  private getCountedAssetCount(
    session: AgentSession,
    dataClass: AgentToolDataClass,
    excludedToolCallId?: string,
  ): Promise<number> {
    return dataClass === AgentToolDataClass.Metadata
      ? this.toolCallRepository.getCountedAssetCountBySession(session.id, excludedToolCallId)
      : this.toolCallRepository.getCountedAssetCountBySessionAndDataClass(session.id, dataClass, excludedToolCallId);
  }

  private async validateAssetAccess(auth: AuthDto, session: AgentSession, assetIds: string[]): Promise<string | null> {
    const readableIds = await this.getReadableAssetIds(auth, session.permissionPlanSnapshot, assetIds);
    return readableIds.size === new Set(assetIds).size ? null : 'One or more assets are not accessible';
  }

  private async validateAlbumAccess(auth: AuthDto, session: AgentSession, albumId: string): Promise<string | null> {
    const albumIds = albumId ? new Set([albumId]) : new Set<string>();
    const readableIds = await this.getReadableAlbumIds(auth, session.permissionPlanSnapshot, albumIds);
    return readableIds.size === 1 ? null : 'Album is not accessible';
  }

  private async validateSearchFilters(
    auth: AuthDto,
    session: AgentSession,
    filters: AgentSearchAssetsFilters,
  ): Promise<string | null> {
    const albumIds = filters.albumIds ? new Set(filters.albumIds) : new Set<string>();
    if (albumIds.size > 0) {
      const readableAlbumIds = await this.getReadableAlbumIds(auth, session.permissionPlanSnapshot, albumIds);
      if (readableAlbumIds.size !== albumIds.size) {
        return 'One or more search filters are not accessible';
      }
    }

    const tagIds = filters.tagIds ? new Set(filters.tagIds) : new Set<string>();
    if (tagIds.size > 0) {
      const readableTagIds = await this.accessRepository.tag.checkOwnerAccess(auth.user.id, tagIds);
      if (readableTagIds.size !== tagIds.size) {
        return 'One or more search filters are not accessible';
      }
    }

    return null;
  }

  private async assertReturnedAssetsAreAccessible(
    auth: AuthDto,
    session: AgentSession,
    assetIds: string[],
  ): Promise<void> {
    if (assetIds.length === 0) {
      return;
    }

    const reason = await this.validateAssetAccess(auth, session, assetIds);
    if (reason) {
      throw new AgentToolDeniedError(reason);
    }
  }

  private async getReadableAlbumIds(
    auth: AuthDto,
    plan: AgentPermissionPlanSnapshot,
    albumIds: Set<string>,
  ): Promise<Set<string>> {
    const readableIds = new Set<string>();
    if (plan.assetScope.owned) {
      const ownerIds = await this.accessRepository.album.checkOwnerAccess(auth.user.id, albumIds);
      for (const id of ownerIds) {
        readableIds.add(id);
      }
    }

    if (plan.assetScope.sharedSpaces) {
      const sharedIds = await this.accessRepository.album.checkSharedAlbumAccess(
        auth.user.id,
        albumIds,
        AlbumUserRole.Viewer,
      );
      for (const id of sharedIds) {
        readableIds.add(id);
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

  private async getReadableAssetIds(
    auth: AuthDto,
    plan: AgentPermissionPlanSnapshot,
    assetIds: string[],
  ): Promise<Set<string>> {
    const requestedIds = new Set(assetIds);
    const readableIds = new Set<string>();
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

  private getRepositoryScope(auth: AuthDto, plan: AgentPermissionPlanSnapshot) {
    return {
      owned: plan.assetScope.owned,
      sharedSpaces: plan.assetScope.sharedSpaces,
      locked: plan.assetScope.locked && auth.session?.hasElevatedPermission === true,
    };
  }

  private async createDeniedAudit<TRequest, TResult extends Record<string, unknown>>(
    session: AgentSession,
    request: TRequest,
    descriptor: AgentReadToolDescriptor<TRequest, TResult>,
    reason: string,
  ): Promise<AgentToolCall> {
    return this.toolCallRepository.create({
      ...this.baseToolCall(session, request, descriptor),
      status: AgentToolCallStatus.Denied,
      approvalDecision: AgentToolApprovalDecision.Denied,
      responseSummary: null,
      redactedResponseMetadata: null,
      completedAt: new Date(),
      error: reason,
    });
  }

  private baseToolCall<TRequest, TResult extends Record<string, unknown>>(
    session: AgentSession,
    request: TRequest,
    descriptor: AgentReadToolDescriptor<TRequest, TResult>,
  ): Omit<
    ToolCallCreate,
    'status' | 'approvalDecision' | 'responseSummary' | 'redactedResponseMetadata' | 'completedAt' | 'error'
  > {
    return {
      sessionId: session.id,
      toolName: descriptor.toolName,
      requestSummary: descriptor.requestSummary(request),
      redactedRequestMetadata: descriptor.requestMetadata(request),
      dataClass: descriptor.dataClass,
      assetCount: descriptor.requestedAssetCount(request),
      albumCount: descriptor.requestedAlbumCount(request),
      providerSnapshot: {
        providerCredentialId: session.credentialSnapshot.id,
        providerType: session.credentialSnapshot.providerType,
        label: session.credentialSnapshot.label,
        baseUrl: session.credentialSnapshot.baseUrl,
        model: session.modelSnapshot.model,
      },
    };
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

  private async tryRecordUnexpectedReadFailure(
    auth: AuthDto,
    session: AgentSession,
    toolCallId: string,
    failedReason: string,
  ): Promise<void> {
    try {
      await this.toolCallRepository.transition(session.id, toolCallId, AgentToolCallStatus.Executing, {
        status: AgentToolCallStatus.Failed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        responseSummary: null,
        redactedResponseMetadata: null,
        completedAt: new Date(),
        error: failedReason,
      });
    } catch {
      // Preserve the original unexpected error.
    }

    try {
      await this.sessionRepository.update(auth.user.id, session.id, { status: AgentSessionStatus.Running });
    } catch {
      // Preserve the original unexpected error.
    }
  }

  private getStoredRequest<TRequest, TResult extends Record<string, unknown>>(
    toolCall: AgentToolCall,
    descriptor: AgentReadToolDescriptor<TRequest, TResult>,
  ): TRequest {
    if (toolCall.toolName !== descriptor.toolName) {
      throw new BadRequestException(`Agent tool call is not a ${descriptor.toolName} request`);
    }

    if (
      [AgentToolName.ReadAssetMetadata, AgentToolName.ReadAssetPreviews, AgentToolName.ReadAssetOriginals].includes(
        descriptor.toolName,
      ) &&
      !isReadAssetIdsRequestMetadata(toolCall.redactedRequestMetadata)
    ) {
      throw new BadRequestException(`Agent tool call is not a ${descriptor.toolName} request`);
    }

    return toolCall.redactedRequestMetadata as TRequest;
  }

  private getReturnedMetadataSummary(assetCount: number): string {
    return `Returned metadata for ${assetCount} ${assetCount === 1 ? 'asset' : 'assets'}`;
  }

  private getSessionLimitReason(maxAssetsPerSession: number): string {
    return `Session policy allows at most ${maxAssetsPerSession} assets per session`;
  }

  private getMediaReferences<TResult extends Record<string, unknown>>(
    result: TResult,
    key: 'previews' | 'originals',
  ): AgentAssetMediaReference[] {
    return result[key] as AgentAssetMediaReference[];
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

    return {
      ...session,
      permissionPlanSnapshot: this.normalizePermissionPlanSnapshot(session.permissionPlanSnapshot),
    };
  }

  private normalizePermissionPlanSnapshot(plan: AgentPermissionPlanSnapshot): AgentPermissionPlanSnapshot {
    return {
      ...plan,
      limits: {
        ...plan.limits,
        maxPreviewsPerSession: plan.limits.maxPreviewsPerSession ?? plan.limits.maxPreviewsPerToolCall ?? 0,
        maxOriginalsPerSession: plan.limits.maxOriginalsPerSession ?? plan.limits.maxOriginalsPerToolCall ?? 0,
      },
    };
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
