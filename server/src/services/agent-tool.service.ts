import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentSession, AgentToolCall } from 'src/database';
import {
  AgentListAlbumsToolRequestDto,
  AgentListAlbumsToolResponseDto,
  AgentListSpacesToolRequestDto,
  AgentListSpacesToolResponseDto,
  AgentReadAlbumToolRequestDto,
  AgentReadAlbumToolResponseDto,
  AgentReadAssetMetadataToolRequestDto,
  AgentReadAssetMetadataToolResponseDto,
  AgentReadAssetOriginalsToolRequestDto,
  AgentReadAssetOriginalsToolResponseDto,
  AgentReadAssetPreviewsToolRequestDto,
  AgentReadAssetPreviewsToolResponseDto,
  AgentReadSpaceToolRequestDto,
  AgentReadSpaceToolResponseDto,
  AgentResolveAssetSearchFiltersToolRequestDto,
  AgentResolveAssetSearchFiltersToolResponseDto,
  AgentSearchAssetsToolRequestDto,
  AgentSearchAssetsToolResponseDto,
  AgentSearchUsersToolRequestDto,
  AgentSearchUsersToolResponseDto,
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
  AssetVisibility,
} from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { AgentToolCallRepository } from 'src/repositories/agent-tool-call.repository';
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { SearchRepository } from 'src/repositories/search.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { AgentRunnerService } from 'src/services/agent-runner.service';
import { buildAgentMetadataSearch } from 'src/services/agent-search-filter-mapper';
import { UserService } from 'src/services/user.service';
import { AgentPermissionPlanSnapshot } from 'src/types/agent-session.types';
import {
  AgentAlbumDetail,
  AgentAlbumSummary,
  AgentAssetMediaReference,
  AgentAssetMetadata,
  AgentResolvedAssetSearchFilterChoice,
  AgentResolvedAssetSearchFilterKind,
  AgentResolvedAssetSearchFilterResult,
  AgentSearchAssetsFilters,
  AgentSearchAssetsMode,
  AgentSearchAssetsOrder,
  AgentSpaceDetail,
  AgentSpaceMemberSummary,
  AgentSpaceSummary,
  AgentToolListAlbumsRequestMetadata,
  AgentToolListSpacesRequestMetadata,
  AgentToolReadAssetIdsRequestMetadata,
  AgentToolReadSpaceRequestMetadata,
  AgentToolResolveAssetSearchFiltersRequestMetadata,
  AgentToolResponseMetadata,
  AgentToolSearchAssetsRequestMetadata,
  AgentToolSearchUsersRequestMetadata,
  AgentUserLookupResult,
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

const maxAgentSpaceAssetIds = 10_000;

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
    private readonly searchRepository: SearchRepository,
    private readonly albumRepository: AlbumRepository,
    private readonly sharedSpaceRepository: SharedSpaceRepository,
    private readonly sessionRepository: AgentSessionRepository,
    private readonly toolCallRepository: AgentToolCallRepository,
    private readonly agentRunnerService: AgentRunnerService,
    private readonly userService: UserService,
  ) {}

  async searchAssets(
    auth: AuthDto,
    sessionId: string,
    dto: AgentSearchAssetsToolRequestDto,
  ): Promise<AgentSearchAssetsToolResponseDto> {
    return this.runReadTool(auth, sessionId, dto, this.searchAssetsDescriptor());
  }

  async resolveAssetSearchFilters(
    auth: AuthDto,
    sessionId: string,
    dto: AgentResolveAssetSearchFiltersToolRequestDto,
  ): Promise<AgentResolveAssetSearchFiltersToolResponseDto> {
    return this.runReadTool(auth, sessionId, dto, this.resolveAssetSearchFiltersDescriptor());
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

  async listSpaces(
    auth: AuthDto,
    sessionId: string,
    dto: AgentListSpacesToolRequestDto,
  ): Promise<AgentListSpacesToolResponseDto> {
    return this.runReadTool(auth, sessionId, dto, this.listSpacesDescriptor());
  }

  async readSpace(
    auth: AuthDto,
    sessionId: string,
    dto: AgentReadSpaceToolRequestDto,
  ): Promise<AgentReadSpaceToolResponseDto> {
    return this.runReadTool(auth, sessionId, dto, this.readSpaceDescriptor());
  }

  async searchUsers(
    auth: AuthDto,
    sessionId: string,
    dto: AgentSearchUsersToolRequestDto,
  ): Promise<AgentSearchUsersToolResponseDto> {
    return this.runReadTool(auth, sessionId, dto, this.searchUsersDescriptor());
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
      void this.resumeRunnerAfterApprovalDecision(auth, session, transitioned, dto.decision).catch(() =>
        this.sessionRepository.markInterruptedFromActive(auth.user.id, session.id).catch(() => {}),
      );
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
        ? await this.executeApprovedToolCallForRunner(auth, session, toolCall)
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

  private async executeApprovedToolCallForRunner(
    auth: AuthDto,
    session: AgentSession,
    toolCall: AgentToolCall,
  ): Promise<unknown> {
    try {
      return await this.executeApprovedToolCall(auth, session, toolCall);
    } catch {
      return {
        status: 'error',
        message: 'Approved tool call failed before returning a result.',
      };
    }
  }

  private executeApprovedToolCall(auth: AuthDto, session: AgentSession, toolCall: AgentToolCall): Promise<unknown> {
    switch (toolCall.toolName) {
      case AgentToolName.SearchAssets: {
        return this.searchAssets(auth, session.id, { toolCallId: toolCall.id });
      }
      case AgentToolName.ResolveAssetSearchFilters: {
        return this.resolveAssetSearchFilters(auth, session.id, { toolCallId: toolCall.id });
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
      case AgentToolName.ListSpaces: {
        return this.listSpaces(auth, session.id, { toolCallId: toolCall.id });
      }
      case AgentToolName.ReadSpace: {
        return this.readSpace(auth, session.id, { toolCallId: toolCall.id });
      }
      case AgentToolName.SearchUsers: {
        return this.searchUsers(auth, session.id, { toolCallId: toolCall.id });
      }
      default: {
        return Promise.resolve();
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
    {
      assets: AgentAssetMetadata[];
      returnedCount: number;
      hasMore: boolean;
      nextPage: string | null;
      totalCount?: number;
      approximateTotal?: number;
    }
  > {
    return {
      toolName: AgentToolName.SearchAssets,
      dataClass: AgentToolDataClass.Metadata,
      requestSummary: (request) =>
        `Search ${request.mode ?? 'metadata'} assets (limit ${this.getSearchLimit(request)})`,
      requestMetadata: (request) =>
        ({
          mode: request.mode ?? 'metadata',
          filters: request.filters ?? {},
          limit: this.getSearchLimit(request),
          page: request.page ?? 1,
          order: request.order ?? 'desc',
          ...(request.query === undefined ? {} : { query: request.query }),
        }) as AgentToolSearchAssetsRequestMetadata,
      requestedAssetCount: (request) => this.getSearchLimit(request),
      requestedAlbumCount: () => 0,
      perToolLimit: (plan) => plan.limits.maxAssetsPerToolCall,
      perSessionLimit: (plan) => plan.limits.maxAssetsPerSession,
      validateAccess: (auth, session, request) => this.validateSearchRequest(auth, session, request),
      execute: async (auth, session, request) => {
        const timelineSpaceIds = await this.getSearchTimelineSpaceIds(auth, session, request.filters ?? {});
        const search = buildAgentMetadataSearch({
          userId: auth.user.id,
          request,
          scope: {
            ...this.getRepositoryScope(auth, session.permissionPlanSnapshot),
            timelineSpaceIds,
          },
        });
        const result = await this.searchRepository.searchMetadata(search.pagination, search.options);
        const assetIds = result.items.map((asset) => asset.id);
        await this.assertReturnedAssetsAreAccessible(auth, session, assetIds);
        const assets = await this.getOrderedAgentMetadata(assetIds);
        return {
          assets,
          returnedCount: assets.length,
          hasMore: result.hasNextPage,
          nextPage: result.hasNextPage ? String((request.page ?? 1) + 1) : null,
        };
      },
      responseSummary: (result) => this.getReturnedMetadataSummary(result.assets.length),
      responseMetadata: (result) => ({ assetIds: result.assets.map((asset) => asset.id) }),
      resultAssetCount: (result) => result.assets.length,
      resultAlbumCount: () => 0,
      failedReason: 'Asset search failed',
    };
  }

  private getSearchLimit(request: AgentSearchAssetsToolRequestDto): number {
    return request.limit ?? 10_000;
  }

  private resolveAssetSearchFiltersDescriptor(): AgentReadToolDescriptor<
    AgentResolveAssetSearchFiltersToolRequestDto,
    {
      resolvedFilters: AgentSearchAssetsFilters;
      results: AgentResolvedAssetSearchFilterResult[];
    }
  > {
    return {
      toolName: AgentToolName.ResolveAssetSearchFilters,
      dataClass: AgentToolDataClass.Metadata,
      requestSummary: (request) => `Resolve asset search filters (${this.getResolverTermCount(request)} term(s))`,
      requestMetadata: (request) =>
        ({
          ...(request.people === undefined ? {} : { people: request.people }),
          ...(request.tags === undefined ? {} : { tags: request.tags }),
          ...(request.albums === undefined ? {} : { albums: request.albums }),
          ...(request.spaces === undefined ? {} : { spaces: request.spaces }),
          ...(request.cameraMakes === undefined ? {} : { cameraMakes: request.cameraMakes }),
          ...(request.cameraModels === undefined ? {} : { cameraModels: request.cameraModels }),
          ...(request.lensModels === undefined ? {} : { lensModels: request.lensModels }),
          ...(request.scope === undefined ? {} : { scope: request.scope }),
        }) as AgentToolResolveAssetSearchFiltersRequestMetadata,
      requestedAssetCount: () => 0,
      requestedAlbumCount: () => 0,
      perToolLimit: () => Number.MAX_SAFE_INTEGER,
      perSessionLimit: () => Number.MAX_SAFE_INTEGER,
      validateAccess: (auth, session, request) => this.validateResolveAssetSearchFiltersAccess(auth, session, request),
      execute: (auth, session, request) => this.executeResolveAssetSearchFilters(auth, session, request),
      responseSummary: (result) =>
        `Resolved ${result.results.filter((item) => item.status === 'matched').length} search filter(s)`,
      responseMetadata: (result) => ({
        ...(result.resolvedFilters.albumIds?.length ? { albumIds: result.resolvedFilters.albumIds } : {}),
        ...(result.resolvedFilters.spaceId ? { spaceIds: [result.resolvedFilters.spaceId] } : {}),
      }),
      resultAssetCount: () => 0,
      resultAlbumCount: () => 0,
      failedReason: 'Search filter resolution failed',
    };
  }

  private async validateResolveAssetSearchFiltersAccess(
    auth: AuthDto,
    session: AgentSession,
    request: AgentResolveAssetSearchFiltersToolRequestDto,
  ): Promise<string | null> {
    const requiresSharedSpaces =
      request.scope?.withSharedSpaces === true || request.scope?.spaceId || (request.spaces?.length ?? 0) > 0;
    if (requiresSharedSpaces && !session.permissionPlanSnapshot.assetScope.sharedSpaces) {
      return 'Shared spaces are not accessible for this session';
    }

    if (request.scope?.spaceId) {
      return this.validateSharedSpaceAccess(auth, session, request.scope.spaceId);
    }

    return null;
  }

  private async executeResolveAssetSearchFilters(
    auth: AuthDto,
    session: AgentSession,
    request: AgentResolveAssetSearchFiltersToolRequestDto,
  ): Promise<{
    resolvedFilters: AgentSearchAssetsFilters;
    results: AgentResolvedAssetSearchFilterResult[];
  }> {
    const resolvedFilters: AgentSearchAssetsFilters = {};
    const results: AgentResolvedAssetSearchFilterResult[] = [];
    const scope = request.scope ?? {};
    const needsRepositoryCandidates =
      (request.people?.length ?? 0) > 0 ||
      (request.tags?.length ?? 0) > 0 ||
      (request.cameraMakes?.length ?? 0) > 0 ||
      (request.cameraModels?.length ?? 0) > 0 ||
      (request.lensModels?.length ?? 0) > 0;
    const canUseRepositoryCandidates = this.canUseResolverRepositoryCandidates(session, scope);
    const shouldLoadTimelineSpaceIds =
      scope.withSharedSpaces === true ||
      (needsRepositoryCandidates &&
        !canUseRepositoryCandidates &&
        session.permissionPlanSnapshot.assetScope.sharedSpaces &&
        !scope.spaceId);
    const timelineSpaceRows = shouldLoadTimelineSpaceIds
      ? await this.sharedSpaceRepository.getSpaceIdsForTimeline(auth.user.id)
      : [];
    const timelineSpaceIds = timelineSpaceRows.map((row) => row.spaceId);
    const repositoryScope = {
      ...scope,
      ...(shouldLoadTimelineSpaceIds ? { timelineSpaceIds } : {}),
    };
    const needsSuggestions =
      (request.people?.length ?? 0) > 0 || (request.tags?.length ?? 0) > 0 || (request.cameraMakes?.length ?? 0) > 0;
    const suggestions =
      needsSuggestions && canUseRepositoryCandidates
        ? await this.searchRepository.getFilterSuggestions([auth.user.id], repositoryScope)
        : null;

    if (request.people?.length) {
      this.resolveIdFilters(
        results,
        resolvedFilters,
        'person',
        request.people,
        suggestions?.people.map((person) => ({ id: person.id, value: person.name })) ?? [],
        'personIds',
      );
    }

    if (request.tags?.length) {
      this.resolveIdFilters(
        results,
        resolvedFilters,
        'tag',
        request.tags,
        suggestions?.tags.map((tag) => ({ id: tag.id, value: tag.value })) ?? [],
        'tagIds',
      );
    }

    if (request.albums?.length) {
      const visibleAlbums = await this.albumRepository.getAgentAlbums(auth.user.id);
      const albums = visibleAlbums
        .filter((album) => {
          const isOwned = album.ownerId === auth.user.id;
          return isOwned
            ? session.permissionPlanSnapshot.assetScope.owned
            : session.permissionPlanSnapshot.assetScope.sharedSpaces;
        })
        .map((album) => ({ id: album.id, value: album.albumName }));
      this.resolveIdFilters(results, resolvedFilters, 'album', request.albums, albums, 'albumIds');
    }

    if (request.spaces?.length) {
      const visibleSpaces = await this.sharedSpaceRepository.getAllByUserId(auth.user.id);
      const spaces = visibleSpaces.map((space) => ({
        id: space.id,
        value: space.name,
      }));
      for (const query of request.spaces) {
        const matched = this.matchVisibleCandidates(spaces, query, 'space', (candidate) => ({
          spaceId: candidate.id,
        }));
        if (matched.status === 'matched') {
          if (resolvedFilters.spaceId) {
            results.push({
              ...matched,
              status: 'ambiguous',
              searchFilter: undefined,
              choices: [
                this.choiceForIdCandidate({ id: matched.id!, value: matched.value! }, 'space', { spaceId: matched.id }),
              ],
              message: 'Only one spaceId can be used in searchAssets',
            });
          } else {
            resolvedFilters.spaceId = matched.id;
            results.push(matched);
          }
        } else {
          results.push(matched);
        }
      }
    }

    if (request.cameraMakes?.length) {
      for (const query of request.cameraMakes) {
        const matched = this.matchVisibleCandidates(
          (suggestions?.cameraMakes ?? []).map((value) => ({ value })),
          query,
          'cameraMake',
          (candidate) => ({ make: candidate.value }),
        );
        if (matched.status === 'matched') {
          resolvedFilters.make = matched.value;
          const models = await this.searchRepository.getCameraModels([auth.user.id], {
            ...repositoryScope,
            make: matched.value,
          });
          matched.choices = models.slice(0, 5).map((model) => ({
            value: model,
            label: model,
            searchFilter: { make: matched.value, model },
          }));
        }
        results.push(matched);
      }
    }

    if (request.cameraModels?.length) {
      const models = canUseRepositoryCandidates
        ? await this.searchRepository.getCameraModels([auth.user.id], {
            ...repositoryScope,
            ...(resolvedFilters.make ? { make: resolvedFilters.make } : {}),
          })
        : [];
      for (const query of request.cameraModels) {
        const matched = this.matchVisibleCandidates(
          models.map((value) => ({ value })),
          query,
          'cameraModel',
          (candidate) => ({ model: candidate.value }),
        );
        if (matched.status === 'matched') {
          resolvedFilters.model = matched.value;
        }
        results.push(matched);
      }
    }

    if (request.lensModels?.length) {
      const lensModels = canUseRepositoryCandidates
        ? await this.searchRepository.getCameraLensModels([auth.user.id], {
            ...repositoryScope,
            ...(resolvedFilters.make ? { make: resolvedFilters.make } : {}),
            ...(resolvedFilters.model ? { model: resolvedFilters.model } : {}),
          })
        : [];
      for (const query of request.lensModels) {
        const matched = this.matchVisibleCandidates(
          lensModels.map((value) => ({ value })),
          query,
          'lensModel',
          (candidate) => ({ lensModel: candidate.value }),
        );
        if (matched.status === 'matched') {
          resolvedFilters.lensModel = matched.value;
        }
        results.push(matched);
      }
    }

    return { resolvedFilters, results };
  }

  private canUseResolverRepositoryCandidates(
    session: AgentSession,
    scope: AgentResolveAssetSearchFiltersToolRequestDto['scope'],
  ): boolean {
    return session.permissionPlanSnapshot.assetScope.owned || !!scope?.spaceId;
  }

  private resolveIdFilters(
    results: AgentResolvedAssetSearchFilterResult[],
    resolvedFilters: AgentSearchAssetsFilters,
    kind: Extract<AgentResolvedAssetSearchFilterKind, 'person' | 'tag' | 'album'>,
    queries: string[],
    candidates: Array<{ id: string; value: string }>,
    filterKey: 'personIds' | 'tagIds' | 'albumIds',
  ) {
    for (const query of queries) {
      const matched = this.matchVisibleCandidates(candidates, query, kind, (candidate) => ({
        [filterKey]: [candidate.id],
      }));
      if (matched.status === 'matched' && matched.id) {
        resolvedFilters[filterKey] = [...new Set([...(resolvedFilters[filterKey] ?? []), matched.id])];
      }
      results.push(matched);
    }
  }

  private matchVisibleCandidates<T extends { id?: string; value: string }>(
    candidates: T[],
    query: string,
    kind: AgentResolvedAssetSearchFilterKind,
    getSearchFilter: (candidate: T) => Partial<AgentSearchAssetsFilters>,
  ): AgentResolvedAssetSearchFilterResult {
    const exactMatches = candidates.filter((candidate) => this.isExactMatch(candidate.value, query));
    if (exactMatches.length === 1) {
      const candidate = exactMatches[0];
      return {
        kind,
        query,
        status: 'matched',
        id: candidate.id,
        value: candidate.value,
        searchFilter: getSearchFilter(candidate),
        choices: [],
        message: `Matched ${kind} "${query}"`,
      };
    }

    if (exactMatches.length > 1) {
      return {
        kind,
        query,
        status: 'ambiguous',
        choices: exactMatches.map((candidate) =>
          this.choiceForIdCandidate(candidate, kind, getSearchFilter(candidate)),
        ),
        message: `Multiple visible ${kind} matches found`,
      };
    }

    return {
      kind,
      query,
      status: 'not_found',
      choices: this.getNotFoundSuggestionCandidates(candidates, query)
        .slice(0, 5)
        .map((candidate) => this.choiceForIdCandidate(candidate, kind, getSearchFilter(candidate))),
      message: `No visible ${kind} match found`,
    };
  }

  private getResolverTermCount(request: AgentResolveAssetSearchFiltersToolRequestDto): number {
    return [
      request.people,
      request.tags,
      request.albums,
      request.spaces,
      request.cameraMakes,
      request.cameraModels,
      request.lensModels,
    ].reduce((total, terms) => total + (terms?.length ?? 0), 0);
  }

  private getNotFoundSuggestionCandidates<T extends { value: string }>(candidates: T[], query: string): T[] {
    const normalizedQuery = this.normalizeResolverTerm(query);
    const related = candidates.filter((candidate) => {
      const normalizedCandidate = this.normalizeResolverTerm(candidate.value);
      return normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate);
    });
    return related.length > 0 ? related : candidates;
  }

  private choiceForIdCandidate<T extends { id?: string; value: string }>(
    candidate: T,
    _kind: AgentResolvedAssetSearchFilterKind,
    searchFilter: Partial<AgentSearchAssetsFilters>,
  ): AgentResolvedAssetSearchFilterChoice {
    return {
      ...(candidate.id ? { id: candidate.id } : {}),
      value: candidate.value,
      label: candidate.value,
      searchFilter,
    };
  }

  private isExactMatch(candidate: string, query: string): boolean {
    return this.normalizeResolverTerm(candidate) === this.normalizeResolverTerm(query);
  }

  private normalizeResolverTerm(term: string): string {
    return term.trim().toLocaleLowerCase();
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
          throw this.getAgentMetadataHydrationError(
            assets.map((asset) => asset.id),
            'One or more assets were not found during metadata read',
          );
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

  private listSpacesDescriptor(): AgentReadToolDescriptor<
    AgentListSpacesToolRequestDto,
    { spaces: AgentSpaceSummary[] }
  > {
    return {
      toolName: AgentToolName.ListSpaces,
      dataClass: AgentToolDataClass.Metadata,
      requestSummary: () => 'List spaces',
      requestMetadata: () => ({}) as AgentToolListSpacesRequestMetadata,
      requestedAssetCount: () => 0,
      requestedAlbumCount: () => 0,
      perToolLimit: () => Number.MAX_SAFE_INTEGER,
      perSessionLimit: (plan) => plan.limits.maxAssetsPerSession,
      validateAccess: (_auth, session) =>
        Promise.resolve(
          session.permissionPlanSnapshot.assetScope.sharedSpaces
            ? null
            : 'Shared spaces are not accessible for this session',
        ),
      execute: async (auth) => {
        const spaces = await this.sharedSpaceRepository.getAllByUserId(auth.user.id);
        const summaries: AgentSpaceSummary[] = [];

        for (const space of spaces) {
          summaries.push(await this.mapAgentSpaceSummary(space));
        }

        return { spaces: summaries };
      },
      responseSummary: (result) => `Returned ${result.spaces.length} space(s)`,
      responseMetadata: (result) => ({ spaceIds: result.spaces.map((space) => space.id) }),
      resultAssetCount: () => 0,
      resultAlbumCount: () => 0,
      failedReason: 'Space list failed',
    };
  }

  private readSpaceDescriptor(): AgentReadToolDescriptor<AgentReadSpaceToolRequestDto, { space: AgentSpaceDetail }> {
    return {
      toolName: AgentToolName.ReadSpace,
      dataClass: AgentToolDataClass.Metadata,
      requestSummary: (request) => `Read space ${request.spaceId}`,
      requestMetadata: (request) => ({ spaceId: request.spaceId ?? '' }) as AgentToolReadSpaceRequestMetadata,
      requestedAssetCount: () => 0,
      requestedAlbumCount: () => 0,
      perToolLimit: () => Number.MAX_SAFE_INTEGER,
      perSessionLimit: (plan) => plan.limits.maxAssetsPerSession,
      validateAccess: (auth, session, request) => this.validateSharedSpaceAccess(auth, session, request.spaceId ?? ''),
      execute: async (auth, session, request, toolCallId) => {
        const spaceId = request.spaceId ?? '';
        const denialReason = await this.validateSharedSpaceAccess(auth, session, spaceId);
        if (denialReason) {
          throw new AgentToolDeniedError(denialReason);
        }

        const spaceRow = await this.sharedSpaceRepository.getById(spaceId);
        if (!spaceRow) {
          throw new AgentToolDeniedError('Space is not accessible');
        }

        const members = await this.sharedSpaceRepository.getMembers(spaceId);
        const assetCount = await this.sharedSpaceRepository.getAssetCount(spaceId);
        const recentAssets = await this.sharedSpaceRepository.getRecentAssets(spaceId);
        const assetRows = await this.sharedSpaceRepository.getAssetIdsInSpacePage(spaceId, {
          limit: maxAgentSpaceAssetIds + 1,
        });
        const assetIds = assetRows.slice(0, maxAgentSpaceAssetIds).map((row) => row.assetId);
        const assetIdsTruncated = assetRows.length > maxAgentSpaceAssetIds || assetCount > maxAgentSpaceAssetIds;

        const reservation = await this.toolCallRepository.transitionWithSessionLimit(
          session.id,
          toolCallId,
          AgentToolCallStatus.Executing,
          {
            status: AgentToolCallStatus.Executing,
            approvalDecision: AgentToolApprovalDecision.Approved,
            responseSummary: 'Tool call execution started',
            redactedResponseMetadata: null,
            assetCount: assetIds.length,
            albumCount: 0,
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

        return {
          space: {
            ...this.mapAgentSpaceSummaryFromParts(spaceRow, members.length, assetCount, recentAssets),
            members: members.map((member) => this.mapAgentSpaceMember(member)),
            assetIds,
            assetIdsReturned: assetIds.length,
            assetIdsTruncated,
          },
        };
      },
      responseSummary: (result) =>
        result.space.assetIdsTruncated
          ? `Returned space with ${result.space.assetIdsReturned} of ${result.space.assetCount} asset id(s)`
          : `Returned space with ${result.space.assetIdsReturned} asset id(s)`,
      responseMetadata: (result) => ({ spaceIds: [result.space.id], assetIds: result.space.assetIds }),
      resultAssetCount: (result) => result.space.assetIds.length,
      resultAlbumCount: () => 0,
      failedReason: 'Space read failed',
    };
  }

  private searchUsersDescriptor(): AgentReadToolDescriptor<
    AgentSearchUsersToolRequestDto,
    { users: AgentUserLookupResult[] }
  > {
    return {
      toolName: AgentToolName.SearchUsers,
      dataClass: AgentToolDataClass.Metadata,
      requestSummary: (request) => (request.query ? `Search users matching "${request.query}"` : 'Search users'),
      requestMetadata: (request) =>
        ({ query: request.query ?? '', limit: request.limit ?? 20 }) as AgentToolSearchUsersRequestMetadata,
      requestedAssetCount: () => 0,
      requestedAlbumCount: () => 0,
      perToolLimit: () => Number.MAX_SAFE_INTEGER,
      perSessionLimit: () => Number.MAX_SAFE_INTEGER,
      validateAccess: () => Promise.resolve(null),
      execute: async (auth, _session, request) => {
        const query = (request.query ?? '').toLocaleLowerCase();
        const visibleUsers = await this.userService.search(auth);
        const users = visibleUsers
          .filter((user) => {
            if (!query) {
              return true;
            }

            return user.name.toLocaleLowerCase().includes(query) || user.email.toLocaleLowerCase().includes(query);
          })
          .slice(0, request.limit ?? 20)
          .map((user) => ({
            userId: user.id,
            name: user.name,
            email: user.email ?? null,
            avatarColor: user.avatarColor ?? null,
            profileImagePath: user.profileImagePath || null,
          }));

        return { users };
      },
      responseSummary: (result) => `Returned ${result.users.length} user(s)`,
      responseMetadata: (result) => ({ userIds: result.users.map((user) => user.userId) }),
      resultAssetCount: () => 0,
      resultAlbumCount: () => 0,
      failedReason: 'User search failed',
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

  private async validateSharedSpaceAccess(
    auth: AuthDto,
    session: AgentSession,
    spaceId: string,
  ): Promise<string | null> {
    if (!session.permissionPlanSnapshot.assetScope.sharedSpaces) {
      return 'Shared spaces are not accessible for this session';
    }

    if (!spaceId) {
      return 'Space is not accessible';
    }

    const member = await this.sharedSpaceRepository.getMember(spaceId, auth.user.id);
    return member ? null : 'Space is not accessible';
  }

  private getUnsupportedSearchModeReason(mode: AgentSearchAssetsMode): string | null {
    return mode === 'metadata' ? null : `${mode} search is not available yet`;
  }

  private getUnsupportedSearchPagingReason(page: number, order: AgentSearchAssetsOrder): string | null {
    if (page !== 1) {
      return 'page search is not available yet';
    }

    if (order !== 'desc') {
      return `${order} order search is not available yet`;
    }

    return null;
  }

  private getUnsupportedSearchFilterReason(_filters: AgentSearchAssetsFilters): string | null {
    return null;
  }

  private async validateSearchRequest(
    auth: AuthDto,
    session: AgentSession,
    request: AgentSearchAssetsToolRequestDto,
  ): Promise<string | null> {
    const mode = request.mode ?? 'metadata';
    const page = request.page ?? 1;
    const order = request.order ?? 'desc';

    if (mode === 'metadata' && request.query !== undefined) {
      return 'query is only supported for smart, description, ocr, and filename search modes';
    }

    const modeReason = this.getUnsupportedSearchModeReason(mode);
    if (modeReason) {
      return modeReason;
    }

    const pagingReason = this.getUnsupportedSearchPagingReason(page, order);
    if (pagingReason) {
      return pagingReason;
    }

    const filterReason = this.getUnsupportedSearchFilterReason(request.filters ?? {});
    if (filterReason) {
      return filterReason;
    }

    const filters = request.filters ?? {};
    const spacePersonIds = filters.spacePersonIds ? new Set(filters.spacePersonIds) : new Set<string>();
    const hasSpacePersonIds = spacePersonIds.size > 0;
    if (hasSpacePersonIds && !filters.spaceId) {
      return 'spacePersonIds requires spaceId';
    }

    if (filters.spaceId && filters.withSharedSpaces === true) {
      return 'Cannot use both spaceId and withSharedSpaces';
    }

    const usesSharedFilters = filters.withSharedSpaces === true || Boolean(filters.spaceId) || hasSpacePersonIds;
    if (usesSharedFilters && !session.permissionPlanSnapshot.assetScope.sharedSpaces) {
      return 'Shared spaces are not accessible for this session';
    }

    const allowLockedAssets =
      session.permissionPlanSnapshot.assetScope.locked && auth.session?.hasElevatedPermission === true;
    if (filters.visibility === AssetVisibility.Locked && !allowLockedAssets) {
      return 'Locked photos require elevated permission';
    }

    if (filters.spaceId) {
      const member = await this.sharedSpaceRepository.getMember(filters.spaceId, auth.user.id);
      if (!member) {
        return 'One or more search filters are not accessible';
      }
    }

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

    const personIds = filters.personIds ? new Set(filters.personIds) : new Set<string>();
    if (personIds.size > 0) {
      const readablePersonIds = await this.getReadablePersonIds(auth, session.permissionPlanSnapshot, personIds);
      if (readablePersonIds.size !== personIds.size) {
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

    return readableIds;
  }

  private async getReadablePersonIds(
    auth: AuthDto,
    plan: AgentPermissionPlanSnapshot,
    personIds: Set<string>,
  ): Promise<Set<string>> {
    const readableIds = new Set<string>();

    if (plan.assetScope.owned) {
      const ownerIds = await this.accessRepository.person.checkOwnerAccess(auth.user.id, personIds);
      for (const id of ownerIds) {
        readableIds.add(id);
      }
    }

    if (plan.assetScope.sharedSpaces) {
      const sharedIds = await this.accessRepository.person.checkSharedSpaceAccess(auth.user.id, personIds);
      for (const id of sharedIds) {
        readableIds.add(id);
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

  private async getSearchTimelineSpaceIds(
    auth: AuthDto,
    session: AgentSession,
    filters: AgentSearchAssetsFilters,
  ): Promise<string[]> {
    const plan = session.permissionPlanSnapshot;
    const hasAlbumFilter = (filters.albumIds?.length ?? 0) > 0;
    const shouldLoadTimelineSpaceIds =
      !filters.spaceId &&
      plan.assetScope.sharedSpaces &&
      (filters.withSharedSpaces === true || !plan.assetScope.owned || hasAlbumFilter);

    if (!shouldLoadTimelineSpaceIds) {
      return [];
    }

    const spaceRows = await this.sharedSpaceRepository.getSpaceIdsForTimeline(auth.user.id);
    return spaceRows.map((row) => row.spaceId);
  }

  private async getOrderedAgentMetadata(assetIds: string[]): Promise<AgentAssetMetadata[]> {
    if (assetIds.length === 0) {
      return [];
    }

    const unorderedAssets = await this.assetRepository.getAgentMetadataByIds(assetIds);
    const assetsById = new Map(
      unorderedAssets.map((asset) => [asset.id, this.mapAssetMetadata(asset as AgentAssetMetadata)]),
    );
    const assets = assetIds.flatMap((id) => {
      const asset = assetsById.get(id);
      return asset ? [asset] : [];
    });

    if (assets.length !== assetIds.length) {
      throw this.getAgentMetadataHydrationError(
        assets.map((asset) => asset.id),
        'One or more search result assets were not found during metadata hydration',
      );
    }

    return assets;
  }

  private getAgentMetadataHydrationError(hydratedAssetIds: string[], message: string): AgentToolFailedError {
    const error = new AgentToolFailedError(message);
    (error as AgentToolFailedError & { metadata: AgentToolResponseMetadata }).metadata = {
      assetIds: hydratedAssetIds,
    };
    return error;
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

  private async mapAgentSpaceSummary(space: {
    id: string;
    name: string;
    description: string | null;
    color?: string | null;
    createdById: string;
    thumbnailAssetId?: string | null;
  }): Promise<AgentSpaceSummary> {
    const members = await this.sharedSpaceRepository.getMembers(space.id);
    const assetCount = await this.sharedSpaceRepository.getAssetCount(space.id);
    const recentAssets = await this.sharedSpaceRepository.getRecentAssets(space.id);
    return this.mapAgentSpaceSummaryFromParts(space, members.length, assetCount, recentAssets);
  }

  private mapAgentSpaceSummaryFromParts(
    space: {
      id: string;
      name: string;
      description: string | null;
      color?: string | null;
      createdById: string;
      thumbnailAssetId?: string | null;
    },
    memberCount: number,
    assetCount: number,
    recentAssets: Array<{ id: string }>,
  ): AgentSpaceSummary {
    return {
      id: space.id,
      name: space.name,
      description: space.description,
      color: space.color ?? 'primary',
      createdById: space.createdById,
      assetCount,
      memberCount,
      thumbnailAssetId: space.thumbnailAssetId ?? null,
      recentAssetIds: recentAssets.map((asset) => asset.id),
    };
  }

  private mapAgentSpaceMember(member: {
    userId: string;
    name: string;
    role: string;
    avatarColor: string | null;
    profileImagePath: string | null;
  }): AgentSpaceMemberSummary {
    return {
      userId: member.userId,
      name: member.name,
      role: member.role,
      avatarColor: member.avatarColor ?? null,
      profileImagePath: member.profileImagePath ?? null,
    };
  }
}
