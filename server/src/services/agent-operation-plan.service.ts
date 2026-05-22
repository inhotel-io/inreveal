import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { AgentSession, AgentToolCall } from 'src/database';
import {
  AgentOperationPlanApplyRequestDto,
  AgentOperationPlanApplyResponseDto,
  AgentOperationPlanResponseDto,
  AgentOperationPlanSummaryRequestDto,
  AgentOperationPlanToolResponseDto,
  AgentProposeAlbumOperationsDto,
  AgentReviseAlbumOperationsDto,
} from 'src/dtos/agent-operation.dto';
import { BulkIdResponseDto } from 'src/dtos/asset-ids.response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { AssetEditAction, AssetEditActionItem } from 'src/dtos/editing.dto';
import {
  AgentOperationApplyStatus,
  AgentOperationPlanStatus,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  AgentSessionActivityEventKind,
  AgentSessionActivityEventStatus,
  AgentSessionStatus,
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
  AlbumUserRole,
  AssetType,
  AssetVisibility,
  SharedSpaceRole,
  UserAvatarColor,
} from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import {
  AgentOperationApplyUpdate,
  AgentOperationPlanRepository,
  AgentOperationPlanWithOperations,
} from 'src/repositories/agent-operation-plan.repository';
import { AgentSelectionHandleRepository } from 'src/repositories/agent-selection-handle.repository';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { AgentToolCallRepository } from 'src/repositories/agent-tool-call.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { WebsocketRepository } from 'src/repositories/websocket.repository';
import {
  invalidSelectionHandleError,
  isAgentMcpRecoverableToolError,
  wrongIdDomainError,
} from 'src/services/agent-mcp-recoverable-tool-error';
import { AgentSessionActivityEventService } from 'src/services/agent-session-activity-event.service';
import { AlbumService } from 'src/services/album.service';
import { AssetService } from 'src/services/asset.service';
import { SharedSpaceService } from 'src/services/shared-space.service';
import { TagService } from 'src/services/tag.service';
import { AgentIdDomain } from 'src/types/agent-asset-source.types';
import { AgentAlbumOperationInput, AgentOperationResult } from 'src/types/agent-operation.types';
import {
  AgentSelectionHandleRecoveryHint,
  AgentSelectionHandleRecoveryMetadata,
  AgentToolOperationPlanRequestMetadata,
  AgentToolOperationPlanResponseMetadata,
  AgentWrongIdDomainRecoveryMetadata,
} from 'src/types/agent-tool.types';

const selectionHandleRecoveryLimit = 5;
const knownExampleSelectionHandleIds = new Set(['00000000-0000-4000-8000-000000000333']);
const knownAgentIdDomains = new Set<AgentIdDomain>([
  'asset',
  'person',
  'album',
  'space',
  'tag',
  'selectionHandle',
  'sourceRef',
  'unknown',
]);

type PlanningRequest = {
  summary?: string;
  operations?: AgentAlbumOperationInput[];
  planId?: string;
  focus?: string;
  selectionHandles?: PlanningSelectionAudit;
};

type PlanningSelectionAudit = Array<{
  id: string;
  assetCount: number;
  sampleAssetIds: string[];
}>;

type SelectionHandleRecoveryRow = {
  id: string;
  assetCount: number;
  sourceToolCallId: string | null;
  createdAt: Date;
  expiresAt: Date;
};

type PlanningAuditResult = {
  status: AgentToolCallStatus.Completed | AgentToolCallStatus.Denied | AgentToolCallStatus.Failed;
  approvalDecision: AgentToolApprovalDecision;
  responseSummary: string | null;
  redactedResponseMetadata: AgentToolOperationPlanResponseMetadata | null;
  error: string | null;
};

type PlanningAuditCreate = {
  status: AgentToolCallStatus.Executing;
  approvalDecision: AgentToolApprovalDecision.Approved;
  responseSummary: null;
  redactedResponseMetadata: null;
  error: null;
};

type SparseItemSelection = NonNullable<AgentOperationPlanApplyRequestDto['itemSelections']>[string];

type ApplySelection = {
  selectedOperationIds: Set<string>;
  selectedAssetIdsByOperationId: Map<string, string[]>;
  selectedItemIdsByOperationId: Map<string, string[]>;
  fieldOverridesByOperationId: Map<string, AgentOperationFieldOverride>;
};

type AgentOperationFieldOverride = {
  payload?: {
    albumName?: string;
    spaceName?: string;
    description?: string;
    color?: UserAvatarColor;
    angle?: 90 | 180 | 270;
  };
  albumThumbnailAssetId?: string;
  targetAlbumId?: string;
  targetSpaceId?: string;
};

@Injectable()
export class AgentOperationPlanService {
  private static readonly legacyWriteScopeDefaults = {
    removeAssets: false,
    createSpace: false,
    addAssetsToSpaces: false,
    removeAssetsFromSpaces: false,
    updateSpaceDetails: false,
    editAssets: false,
    favoriteAssets: false,
    archiveAssets: false,
    tagAssets: false,
  };

  private static readonly activeStatuses = [
    AgentSessionStatus.Created,
    AgentSessionStatus.Running,
    AgentSessionStatus.WaitingForToolApproval,
    AgentSessionStatus.WaitingForPlanReview,
    AgentSessionStatus.Interrupted,
  ];

  private static readonly maxAssetSelectionHandleAssets = 10_000;
  private static readonly maxCoverSelectionHandleAssets = 500;

  constructor(
    private readonly accessRepository: AccessRepository,
    private readonly assetRepository: AssetRepository,
    private readonly albumService: AlbumService,
    private readonly sessionRepository: AgentSessionRepository,
    private readonly selectionHandleRepository: AgentSelectionHandleRepository,
    private readonly planRepository: AgentOperationPlanRepository,
    private readonly toolCallRepository: AgentToolCallRepository,
    private readonly websocketRepository: WebsocketRepository,
    private readonly sharedSpaceService: SharedSpaceService,
    private readonly assetService: AssetService,
    private readonly tagService: TagService,
    @Optional()
    @Inject(AgentSessionActivityEventService)
    private readonly activityEventService?: Pick<AgentSessionActivityEventService, 'createSystemEvent'>,
  ) {}

  async getCurrentPlan(auth: AuthDto, sessionId: string): Promise<AgentOperationPlanResponseDto | null> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: false });
    const plan = await this.planRepository.getCurrentBySessionId(session.id);

    return plan ? this.mapPlan(plan) : null;
  }

  async getAppliedPlans(auth: AuthDto, sessionId: string): Promise<AgentOperationPlanResponseDto[]> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: false });
    const plans = await this.planRepository.getAppliedBySessionId(session.id);

    return plans.map((plan) => this.mapPlan(plan));
  }

  async proposeAlbumOperations(
    auth: AuthDto,
    sessionId: string,
    dto: AgentProposeAlbumOperationsDto,
  ): Promise<AgentOperationPlanToolResponseDto> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: true });

    let prepared: { operations: AgentAlbumOperationInput[]; selectionAudit: PlanningSelectionAudit };
    try {
      prepared = await this.prepareOperations(auth, session, dto.operations);
    } catch (error) {
      await this.tryCreatePlanningPreparationDeniedAudit(session, AgentToolName.ProposeAlbumOperations, dto, error);
      throw error;
    }

    const { operations, selectionAudit } = prepared;

    return this.runPlanningTool(
      auth,
      session,
      AgentToolName.ProposeAlbumOperations,
      { ...dto, operations, selectionHandles: selectionAudit },
      async () => {
        await this.validateNormalAccess(auth, session, operations);
        const plan = await this.planRepository.createReplacementRevision(session.id, {
          plan: {
            sessionId: session.id,
            status: AgentOperationPlanStatus.Proposed,
            summary: dto.summary,
          },
          operations,
        });
        if (!plan) {
          throw new BadRequestException('Agent session is not accepting plan revisions');
        }

        await this.markWaitingForPlanReview(auth, session, plan);
        return { plan, summary: this.summarize(plan) };
      },
    );
  }

  async reviseProposedOperations(
    auth: AuthDto,
    sessionId: string,
    planId: string,
    dto: AgentReviseAlbumOperationsDto,
  ): Promise<AgentOperationPlanToolResponseDto> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: true });

    let prepared: { operations: AgentAlbumOperationInput[]; selectionAudit: PlanningSelectionAudit };
    try {
      prepared = await this.prepareOperations(auth, session, dto.operations);
    } catch (error) {
      await this.tryCreatePlanningPreparationDeniedAudit(
        session,
        AgentToolName.ReviseProposedOperations,
        {
          ...dto,
          planId,
        },
        error,
      );
      throw error;
    }

    const { operations, selectionAudit } = prepared;

    return this.runPlanningTool(
      auth,
      session,
      AgentToolName.ReviseProposedOperations,
      { ...dto, planId, operations, selectionHandles: selectionAudit },
      async () => {
        await this.requireCurrentProposedPlan(session.id, planId);
        await this.validateNormalAccess(auth, session, operations);
        const replacement = await this.planRepository.createReplacementRevision(session.id, {
          plan: {
            sessionId: session.id,
            status: AgentOperationPlanStatus.Proposed,
            summary: dto.summary,
          },
          operations,
        });
        if (!replacement) {
          throw new BadRequestException('Agent session is not accepting plan revisions');
        }

        await this.markWaitingForPlanReview(auth, session, replacement);
        return { plan: replacement, summary: this.summarize(replacement) };
      },
    );
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

  async applyApprovedOperations(
    auth: AuthDto,
    sessionId: string,
    planId: string,
    dto: AgentOperationPlanApplyRequestDto,
  ): Promise<AgentOperationPlanApplyResponseDto> {
    const session = await this.getOwnedSession(auth, sessionId, { requireActive: true });
    if (session.status !== AgentSessionStatus.WaitingForPlanReview) {
      throw new BadRequestException('Agent session is not waiting for plan review');
    }

    const currentPlan = await this.requireCurrentProposedPlan(session.id, planId);
    const applySelection = this.validateApplySelection(currentPlan, dto);

    const claimedPlan = await this.planRepository.claimCurrentForApply(session.id, planId);
    if (!claimedPlan) {
      throw new NotFoundException('Agent operation plan not found');
    }

    try {
      const applyUpdates = await this.applyClaimedPlan(auth, session, claimedPlan, applySelection);
      const appliedPlan = await this.planRepository.completeApply(claimedPlan.id, applyUpdates);
      const response = this.buildApplyResponse(this.mapPlan(appliedPlan), applySelection.selectedOperationIds);

      await this.sessionRepository.update(auth.user.id, session.id, {
        status: AgentSessionStatus.Running,
        endedAt: null,
      });
      this.websocketRepository.clientSend('on_agent_session_event', auth.user.id, {
        type: 'operation-plan-applied',
        sessionId: session.id,
        planId: appliedPlan.id,
        status: response.status,
        appliedCount: response.appliedOperationIds.length,
        skippedCount: response.skippedOperationIds.length,
        failedCount: response.failedOperationIds.length,
      });

      return response;
    } catch (error) {
      await this.tryMarkApplySessionFailed(auth, session);
      throw error;
    }
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

    return {
      ...session,
      permissionPlanSnapshot: this.normalizePermissionPlanSnapshot(session.permissionPlanSnapshot),
    };
  }

  private normalizePermissionPlanSnapshot(plan: AgentSession['permissionPlanSnapshot']) {
    return {
      ...plan,
      writeScope: {
        ...AgentOperationPlanService.legacyWriteScopeDefaults,
        ...plan.writeScope,
      },
      limits: {
        ...plan.limits,
        maxPreviewsPerSession: plan.limits.maxPreviewsPerSession ?? plan.limits.maxPreviewsPerToolCall,
        maxOriginalsPerSession: plan.limits.maxOriginalsPerSession ?? plan.limits.maxOriginalsPerToolCall,
      },
    };
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

    const ownerSpaceIds = new Set(
      operations
        .filter(
          (operation) =>
            this.requiresOwnerSpaceAccess(operation.type) &&
            operation.targetKind === AgentOperationTargetKind.ExistingSpace &&
            operation.targetId,
        )
        .map((operation) => operation.targetId as string),
    );

    if (ownerSpaceIds.size > 0) {
      const writableSpaceIds = await this.accessRepository.sharedSpace.checkRoleAccess(
        auth.user.id,
        ownerSpaceIds,
        SharedSpaceRole.Owner,
      );
      const requestedWritableSpaceIds = new Set([...writableSpaceIds].filter((id) => ownerSpaceIds.has(id)));
      if (requestedWritableSpaceIds.size !== ownerSpaceIds.size) {
        throw new BadRequestException('One or more target spaces are not accessible');
      }
    }

    const editorSpaceIds = new Set(
      operations
        .filter(
          (operation) =>
            !this.requiresOwnerSpaceAccess(operation.type) &&
            operation.targetKind === AgentOperationTargetKind.ExistingSpace &&
            operation.targetId,
        )
        .map((operation) => operation.targetId as string),
    );
    if (editorSpaceIds.size > 0) {
      const writableSpaceIds = await this.accessRepository.sharedSpace.checkRoleAccess(
        auth.user.id,
        editorSpaceIds,
        SharedSpaceRole.Editor,
      );
      const requestedWritableSpaceIds = new Set([...writableSpaceIds].filter((id) => editorSpaceIds.has(id)));
      if (requestedWritableSpaceIds.size !== editorSpaceIds.size) {
        throw new BadRequestException('One or more target spaces are not accessible');
      }
    }

    const assetIds = [...new Set(operations.flatMap((operation) => operation.assetIds ?? []))];
    if (assetIds.length > 0) {
      const readableAssetIds = await this.getReadableAssetIds(auth, session, assetIds);
      if (readableAssetIds.size !== assetIds.length) {
        throw new BadRequestException('One or more assets are not accessible');
      }
    }

    const writableAssetIds = [
      ...new Set(
        operations
          .filter((operation) => this.requiresWritableAssets(operation.type))
          .flatMap((operation) => operation.assetIds ?? []),
      ),
    ];
    if (writableAssetIds.length > 0) {
      const allowedAssetIds = await this.getWritableAssetIds(auth, session, writableAssetIds);
      if (allowedAssetIds.size !== writableAssetIds.length) {
        throw new BadRequestException('One or more assets are not editable');
      }
    }

    const tagIds = new Set(
      operations.flatMap((operation) => {
        const payload = this.requireObjectPayload(operation.payload);
        return typeof payload.tagId === 'string' ? [payload.tagId] : [];
      }),
    );
    if (tagIds.size > 0) {
      const writableTagIds = await this.accessRepository.tag.checkOwnerAccess(auth.user.id, tagIds);
      const requestedWritableTagIds = new Set([...writableTagIds].filter((id) => tagIds.has(id)));
      if (requestedWritableTagIds.size !== tagIds.size) {
        throw new BadRequestException('One or more tags are not accessible');
      }
    }
  }

  private requiresWritableAssets(type: AgentOperationType) {
    return [
      AgentOperationType.AssetRotate,
      AgentOperationType.AssetSetFavorite,
      AgentOperationType.AssetSetArchive,
      AgentOperationType.AssetAddTag,
      AgentOperationType.AssetRemoveTag,
    ].includes(type);
  }

  private requiresOwnerSpaceAccess(type: AgentOperationType) {
    return [
      AgentOperationType.SpaceUpdateDetails,
      AgentOperationType.SpaceAddMembers,
      AgentOperationType.SpaceRemoveMembers,
      AgentOperationType.SpaceUpdateMemberRole,
    ].includes(type);
  }

  private async getWritableAlbumIds(auth: AuthDto, session: AgentSession, albumIds: Set<string>) {
    const writableIds = new Set<string>();
    const plan = session.permissionPlanSnapshot;

    if (plan.assetScope.owned) {
      const ownerIds = await this.accessRepository.album.checkOwnerAccess(auth.user.id, albumIds);
      for (const id of ownerIds) {
        if (albumIds.has(id)) {
          writableIds.add(id);
        }
      }
    }

    if (plan.assetScope.sharedSpaces) {
      const sharedIds = await this.accessRepository.album.checkSharedAlbumAccess(
        auth.user.id,
        albumIds,
        AlbumUserRole.Editor,
      );
      for (const id of sharedIds) {
        if (albumIds.has(id)) {
          writableIds.add(id);
        }
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
        if (requestedIds.has(id)) {
          readableIds.add(id);
        }
      }
    }

    if (plan.assetScope.sharedSpaces) {
      const spaceIds = await this.accessRepository.asset.checkSpaceAccess(auth.user.id, requestedIds);
      for (const id of spaceIds) {
        if (requestedIds.has(id)) {
          readableIds.add(id);
        }
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

  private async getReadablePersonIds(auth: AuthDto, session: AgentSession, personIds: string[]) {
    const requestedIds = new Set(personIds);
    const readableIds = new Set<string>();
    const plan = session.permissionPlanSnapshot;

    if (plan.assetScope.owned) {
      const ownerIds = await this.accessRepository.person.checkOwnerAccess(auth.user.id, requestedIds);
      for (const id of ownerIds) {
        if (requestedIds.has(id)) {
          readableIds.add(id);
        }
      }
    }

    if (plan.assetScope.sharedSpaces) {
      const sharedIds = await this.accessRepository.person.checkSharedSpaceAccess(auth.user.id, requestedIds);
      for (const id of sharedIds) {
        if (requestedIds.has(id)) {
          readableIds.add(id);
        }
      }
    }

    return readableIds;
  }

  private async getWritableAssetIds(auth: AuthDto, session: AgentSession, assetIds: string[]) {
    const requestedIds = new Set(assetIds);
    const writableIds = new Set<string>();
    const plan = session.permissionPlanSnapshot;
    const allowLockedAssets = plan.assetScope.locked && auth.session?.hasElevatedPermission === true;

    if (plan.assetScope.owned) {
      const ownerIds = await this.accessRepository.asset.checkOwnerAccess(
        auth.user.id,
        requestedIds,
        allowLockedAssets,
      );
      for (const id of ownerIds) {
        if (requestedIds.has(id)) {
          writableIds.add(id);
        }
      }
    }

    if (plan.assetScope.sharedSpaces) {
      const spaceIds = await this.accessRepository.asset.checkSpaceEditAccess(auth.user.id, requestedIds);
      for (const id of spaceIds) {
        if (requestedIds.has(id)) {
          writableIds.add(id);
        }
      }

      if (!allowLockedAssets) {
        const lockedIds = await this.assetRepository.getAgentLockedIds(writableIds);
        for (const id of lockedIds) {
          writableIds.delete(id);
        }
      }
    }

    const agentReadableIds = await this.assetRepository.getAgentReadableIds(writableIds);
    for (const id of writableIds) {
      if (!agentReadableIds.has(id)) {
        writableIds.delete(id);
      }
    }

    return writableIds;
  }

  private async prepareOperations(auth: AuthDto, session: AgentSession, operations: AgentAlbumOperationInput[]) {
    const createTemporaryTargetIds = new Set<string>();
    const createSpaceTemporaryTargetIds = new Set<string>();
    const allCreateSpaceTemporaryTargetIds = new Set(
      operations
        .filter((operation) => operation.type === AgentOperationType.SpaceCreate && operation.temporaryTargetId)
        .map((operation) => operation.temporaryTargetId as string),
    );
    const preparedOperations: AgentAlbumOperationInput[] = [];
    const selectionAudit: PlanningSelectionAudit = [];

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

      if (operation.type === AgentOperationType.SpaceCreate) {
        if (!operation.temporaryTargetId) {
          throw new BadRequestException('space.create requires temporaryTargetId');
        }

        if (createSpaceTemporaryTargetIds.has(operation.temporaryTargetId)) {
          throw new BadRequestException(`Duplicate space.create temporaryTargetId: ${operation.temporaryTargetId}`);
        }

        createSpaceTemporaryTargetIds.add(operation.temporaryTargetId);
      }

      if (
        (operation.type === AgentOperationType.AlbumAddAssets || operation.type === AgentOperationType.AlbumSetCover) &&
        operation.targetKind === AgentOperationTargetKind.NewAlbum &&
        (!operation.temporaryTargetId || !createTemporaryTargetIds.has(operation.temporaryTargetId))
      ) {
        throw new BadRequestException(
          `No album.create operation found for temporaryTargetId: ${operation.temporaryTargetId}`,
        );
      }

      if (
        (operation.type === AgentOperationType.SpaceAddAssets ||
          operation.type === AgentOperationType.SpaceRemoveAssets) &&
        operation.targetKind === AgentOperationTargetKind.NewSpace &&
        (!operation.temporaryTargetId || !allCreateSpaceTemporaryTargetIds.has(operation.temporaryTargetId))
      ) {
        throw new BadRequestException(
          `No space.create operation found for temporaryTargetId: ${operation.temporaryTargetId}`,
        );
      }

      if (
        (operation.type === AgentOperationType.SpaceAddAssets ||
          operation.type === AgentOperationType.SpaceRemoveAssets) &&
        operation.targetKind === AgentOperationTargetKind.NewSpace &&
        operation.temporaryTargetId &&
        !createSpaceTemporaryTargetIds.has(operation.temporaryTargetId)
      ) {
        throw new BadRequestException(
          `${operation.type} references temporaryTargetId before its space.create operation`,
        );
      }

      const materializedAssetIds = operation.assetSelectionHandleId
        ? await this.resolveSelectionHandleAssetIds(auth, session, operation.assetSelectionHandleId, selectionAudit)
        : (operation.assetIds ?? []);
      this.validateMaterializedAssetSelection(operation, materializedAssetIds);

      preparedOperations.push({
        type: operation.type,
        summary: operation.summary,
        targetKind: operation.targetKind,
        targetId: operation.targetId,
        temporaryTargetId: operation.temporaryTargetId,
        assetIds: materializedAssetIds,
        assetSelectionHandleId: undefined,
        payload: operation.payload ?? {},
        dependencyIds: operation.dependencyIds ?? [],
        riskLevel: operation.riskLevel,
        enabled: operation.enabled,
      });
    }

    return { operations: preparedOperations, selectionAudit };
  }

  private validateMaterializedAssetSelection(operation: AgentAlbumOperationInput, assetIds: string[]) {
    if (!operation.assetSelectionHandleId) {
      return;
    }

    if (assetIds.length === 0) {
      throw new BadRequestException('Selection handle did not contain any assets');
    }

    if (
      operation.type === AgentOperationType.AlbumSetCover &&
      assetIds.length > AgentOperationPlanService.maxCoverSelectionHandleAssets
    ) {
      throw new BadRequestException('Selection handle contains too many cover candidates');
    }

    if (
      operation.type !== AgentOperationType.AlbumSetCover &&
      assetIds.length > AgentOperationPlanService.maxAssetSelectionHandleAssets
    ) {
      throw new BadRequestException('Selection handle contains too many assets');
    }
  }

  private async resolveSelectionHandleAssetIds(
    auth: AuthDto,
    session: AgentSession,
    id: string,
    selectionAudit: PlanningSelectionAudit,
  ) {
    const handle = await this.selectionHandleRepository.getValidForPlanning({
      id,
      sessionId: session.id,
      userId: auth.user.id,
      now: new Date(),
    });
    if (!handle) {
      throw await this.createInvalidSelectionHandleError(auth, session, id);
    }

    selectionAudit.push({
      id: handle.id,
      assetCount: handle.assetCount,
      sampleAssetIds: handle.sampleAssetIds,
    });

    return handle.assetIds;
  }

  private async createInvalidSelectionHandleError(auth: AuthDto, session: AgentSession, id: string) {
    const [readableAssetIds, readablePersonIds] = await Promise.all([
      this.getReadableAssetIds(auth, session, [id]),
      this.getReadablePersonIds(auth, session, [id]),
    ]);
    const receivedDomain = readableAssetIds.has(id) ? 'asset' : readablePersonIds.has(id) ? 'person' : null;
    if (receivedDomain) {
      return wrongIdDomainError({
        toolName: AgentToolName.ProposeAlbumOperations,
        field: 'operations[].assetSelectionHandleId',
        expectedDomain: 'selectionHandle',
        receivedDomain,
        instruction:
          'Use a same-session selection handle returned by searchAssets with createSelectionHandle true, or use assetSource.search once available.',
      });
    }

    const now = new Date();
    const [availableSelectionHandles, attemptedHandle] = await Promise.all([
      this.selectionHandleRepository.listValidForRecovery({
        sessionId: session.id,
        userId: auth.user.id,
        now,
        limit: selectionHandleRecoveryLimit,
      }),
      this.selectionHandleRepository.getForRecovery({
        id,
        sessionId: session.id,
        userId: auth.user.id,
      }),
    ]);
    const expiredSelectionHandle =
      attemptedHandle && attemptedHandle.expiresAt <= now
        ? this.toSelectionHandleRecoveryHint(attemptedHandle)
        : undefined;
    const recovery: AgentSelectionHandleRecoveryMetadata = {
      kind: 'invalid-selection-handle',
      attemptedSelectionHandleId: id,
      looksLikeExamplePlaceholder: knownExampleSelectionHandleIds.has(id),
      availableSelectionHandles: availableSelectionHandles.map((handle) => this.toSelectionHandleRecoveryHint(handle)),
      ...(expiredSelectionHandle ? { expiredSelectionHandle } : {}),
      instruction: 'Retry proposeAlbumOperations with a valid same-session selection handle, or rerun searchAssets.',
    };
    const error = 'Selection handle is expired or not available for this session';
    const hint = this.invalidSelectionHandleHint(recovery);

    return invalidSelectionHandleError({
      toolName: AgentToolName.ProposeAlbumOperations,
      error,
      hint,
      recovery,
    });
  }

  private toSelectionHandleRecoveryHint(handle: SelectionHandleRecoveryRow): AgentSelectionHandleRecoveryHint {
    return {
      id: handle.id,
      assetCount: handle.assetCount,
      sourceToolCallId: handle.sourceToolCallId,
      createdAt: handle.createdAt.toISOString(),
      expiresAt: handle.expiresAt.toISOString(),
    };
  }

  private invalidSelectionHandleHint(recovery: AgentSelectionHandleRecoveryMetadata) {
    if (recovery.expiredSelectionHandle) {
      return 'The attempted selection handle is expired. Rerun searchAssets with createSelectionHandle true, then retry proposeAlbumOperations with the returned selectionHandle.id.';
    }

    if (recovery.availableSelectionHandles.length === 1) {
      return `Retry proposeAlbumOperations with the exact handle ${recovery.availableSelectionHandles[0].id} if that is the intended search selection.`;
    }

    if (recovery.availableSelectionHandles.length > 1) {
      return 'Choose the intended same-session handle from availableSelectionHandles and retry proposeAlbumOperations with that exact id.';
    }

    return 'Rerun searchAssets with createSelectionHandle true, then retry proposeAlbumOperations with the returned selectionHandle.id.';
  }

  private validateWriteScope(session: AgentSession, type: AgentOperationType) {
    const writeScope = session.permissionPlanSnapshot.writeScope;
    if (type === AgentOperationType.AlbumCreate && !writeScope.createAlbum) {
      throw new BadRequestException('Agent permission policy does not allow creating albums');
    }

    if (type === AgentOperationType.AlbumAddAssets && !writeScope.addAssets) {
      throw new BadRequestException('Agent permission policy does not allow adding assets to albums');
    }

    if (type === AgentOperationType.AlbumRemoveAssets && !writeScope.removeAssets) {
      throw new BadRequestException('Agent permission policy does not allow removing assets from albums');
    }

    if (type === AgentOperationType.AlbumUpdateDetails && !writeScope.updateDetails) {
      throw new BadRequestException('Agent permission policy does not allow updating album details');
    }

    if (type === AgentOperationType.AlbumSetCover && !writeScope.setCover) {
      throw new BadRequestException('Agent permission policy does not allow setting album covers');
    }

    if (type === AgentOperationType.SpaceCreate && !writeScope.createSpace) {
      throw new BadRequestException('Agent permission policy does not allow creating spaces');
    }

    if (type === AgentOperationType.SpaceAddAssets && !writeScope.addAssetsToSpaces) {
      throw new BadRequestException('Agent permission policy does not allow adding assets to spaces');
    }

    if (type === AgentOperationType.SpaceRemoveAssets && !writeScope.removeAssetsFromSpaces) {
      throw new BadRequestException('Agent permission policy does not allow removing assets from spaces');
    }

    if (type === AgentOperationType.SpaceUpdateDetails && !writeScope.updateSpaceDetails) {
      throw new BadRequestException('Agent permission policy does not allow updating space details');
    }

    if (type === AgentOperationType.SpaceAddMembers && !writeScope.addMembersToSpaces) {
      throw new BadRequestException('Agent permission policy does not allow adding members to spaces');
    }

    if (type === AgentOperationType.SpaceRemoveMembers && !writeScope.removeMembersFromSpaces) {
      throw new BadRequestException('Agent permission policy does not allow removing members from spaces');
    }

    if (type === AgentOperationType.SpaceUpdateMemberRole && !writeScope.updateSpaceMemberRoles) {
      throw new BadRequestException('Agent permission policy does not allow updating space member roles');
    }

    if (type === AgentOperationType.AssetRotate && !writeScope.editAssets) {
      throw new BadRequestException('Agent permission policy does not allow editing assets');
    }

    if (type === AgentOperationType.AssetSetFavorite && !writeScope.favoriteAssets) {
      throw new BadRequestException('Agent permission policy does not allow changing asset favorites');
    }

    if (type === AgentOperationType.AssetSetArchive && !writeScope.archiveAssets) {
      throw new BadRequestException('Agent permission policy does not allow archiving assets');
    }

    if (
      (type === AgentOperationType.AssetAddTag || type === AgentOperationType.AssetRemoveTag) &&
      !writeScope.tagAssets
    ) {
      throw new BadRequestException('Agent permission policy does not allow tagging assets');
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

  private async tryMarkApplySessionFailed(auth: AuthDto, session: AgentSession) {
    try {
      await this.sessionRepository.update(auth.user.id, session.id, {
        status: AgentSessionStatus.Failed,
        endedAt: new Date(),
      });
    } catch {
      // Preserve the original post-claim apply error.
    }
  }

  private validateApplyOperationIds(plan: AgentOperationPlanWithOperations, operationIds: string[]) {
    const operationById = new Map(plan.operations.map((operation) => [operation.id, operation]));

    if (operationIds.some((operationId) => !operationById.has(operationId))) {
      throw new BadRequestException('One or more operation ids are not in the current plan');
    }

    if (operationIds.some((operationId) => operationById.get(operationId)?.enabled === false)) {
      throw new BadRequestException('One or more operation ids are disabled in the current plan');
    }
  }

  private validateApplySelection(
    plan: AgentOperationPlanWithOperations,
    dto: AgentOperationPlanApplyRequestDto,
  ): ApplySelection {
    if (dto.planRevision !== undefined && dto.planRevision !== plan.revision) {
      throw new BadRequestException('Agent operation plan revision is stale');
    }

    this.validateApplyOperationIds(plan, dto.operationIds);

    const selectedOperationIds = new Set(dto.operationIds);
    const operationById = new Map(plan.operations.map((operation) => [operation.id, operation]));
    const selectedAssetIdsByOperationId = new Map<string, string[]>();
    const selectedItemIdsByOperationId = new Map<string, string[]>();

    for (const [operationId, selection] of Object.entries(dto.itemSelections ?? {})) {
      if (!selectedOperationIds.has(operationId)) {
        throw new BadRequestException('One or more item selection operation ids are not selected');
      }

      const operation = operationById.get(operationId);
      if (!operation) {
        throw new BadRequestException('One or more item selection operation ids are not in the current plan');
      }

      const selectedItemIds = this.resolveSelectedItemIds(operation, selection);
      selectedItemIdsByOperationId.set(operationId, selectedItemIds);
      if (selection.itemKind === 'asset') {
        selectedAssetIdsByOperationId.set(operationId, selectedItemIds);
      }
    }

    const fieldOverridesByOperationId = this.validateFieldOverrides(
      dto.fieldOverrides ?? {},
      operationById,
      selectedOperationIds,
      selectedAssetIdsByOperationId,
    );

    return {
      selectedOperationIds,
      selectedAssetIdsByOperationId,
      selectedItemIdsByOperationId,
      fieldOverridesByOperationId,
    };
  }

  private validateFieldOverrides(
    fieldOverrides: NonNullable<AgentOperationPlanApplyRequestDto['fieldOverrides']>,
    operationById: Map<string, AgentOperationPlanWithOperations['operations'][number]>,
    selectedOperationIds: Set<string>,
    selectedAssetIdsByOperationId: Map<string, string[]>,
  ): Map<string, AgentOperationFieldOverride> {
    const fieldOverridesByOperationId = new Map<string, AgentOperationFieldOverride>();

    for (const [operationId, fields] of Object.entries(fieldOverrides)) {
      const operation = operationById.get(operationId);
      if (!operation) {
        throw new BadRequestException('One or more field override operation ids are not in the current plan');
      }

      if (!selectedOperationIds.has(operationId)) {
        throw new BadRequestException('One or more field override operation ids are not selected');
      }

      fieldOverridesByOperationId.set(
        operationId,
        this.normalizeFieldOverride(operation, fields, selectedAssetIdsByOperationId.get(operationId)),
      );
    }

    return fieldOverridesByOperationId;
  }

  private normalizeFieldOverride(
    operation: AgentOperationPlanWithOperations['operations'][number],
    fields: Record<string, unknown>,
    selectedAssetIds: string[] | undefined,
  ): AgentOperationFieldOverride {
    switch (operation.type) {
      case AgentOperationType.AlbumCreate:
      case AgentOperationType.AlbumUpdateDetails: {
        const payload: AgentOperationFieldOverride['payload'] = {};
        let targetAlbumId: string | undefined;
        for (const [field, value] of Object.entries(fields)) {
          if (field === 'targetAlbumId') {
            if (operation.type === AgentOperationType.AlbumCreate) {
              throw new BadRequestException('Target overrides are not supported for create operations');
            }
            if (typeof value !== 'string') {
              throw new BadRequestException('targetAlbumId must be a string');
            }

            targetAlbumId = value;
            continue;
          }

          if (field !== 'albumName' && field !== 'description') {
            throw new BadRequestException('Unsupported field override for operation type');
          }

          payload[field] = this.normalizeAlbumTextOverride(field, value);
        }

        return { payload, targetAlbumId };
      }

      case AgentOperationType.AlbumAddAssets:
      case AgentOperationType.AlbumRemoveAssets: {
        const fieldNames = Object.keys(fields);
        if (fieldNames.some((field) => field !== 'targetAlbumId')) {
          throw new BadRequestException('Unsupported field override for operation type');
        }

        const targetAlbumId = fields.targetAlbumId;
        if (typeof targetAlbumId !== 'string') {
          throw new BadRequestException('targetAlbumId must be a string');
        }

        return { targetAlbumId };
      }

      case AgentOperationType.SpaceCreate:
      case AgentOperationType.SpaceUpdateDetails: {
        const payload: AgentOperationFieldOverride['payload'] = {};
        let targetSpaceId: string | undefined;
        for (const [field, value] of Object.entries(fields)) {
          if (field === 'targetSpaceId') {
            if (operation.type === AgentOperationType.SpaceCreate) {
              throw new BadRequestException('Target overrides are not supported for create operations');
            }
            if (typeof value !== 'string') {
              throw new BadRequestException('targetSpaceId must be a string');
            }
            targetSpaceId = value;
            continue;
          }

          if (field === 'color') {
            payload.color = this.normalizeSpaceColorOverride(value);
            continue;
          }

          if (field !== 'spaceName' && field !== 'description') {
            throw new BadRequestException('Unsupported field override for operation type');
          }

          payload[field] = this.normalizeSpaceTextOverride(field, value);
        }

        return { payload, targetSpaceId };
      }

      case AgentOperationType.SpaceAddAssets:
      case AgentOperationType.SpaceRemoveAssets: {
        const fieldNames = Object.keys(fields);
        if (fieldNames.some((field) => field !== 'targetSpaceId')) {
          throw new BadRequestException('Unsupported field override for operation type');
        }

        const targetSpaceId = fields.targetSpaceId;
        if (typeof targetSpaceId !== 'string') {
          throw new BadRequestException('targetSpaceId must be a string');
        }

        return { targetSpaceId };
      }

      case AgentOperationType.AssetRotate: {
        const fieldNames = Object.keys(fields);
        if (fieldNames.some((field) => field !== 'rotationAngle')) {
          throw new BadRequestException('Unsupported field override for operation type');
        }

        const rotationAngle =
          typeof fields.rotationAngle === 'string' ? Number(fields.rotationAngle) : fields.rotationAngle;
        if (rotationAngle !== 90 && rotationAngle !== 180 && rotationAngle !== 270) {
          throw new BadRequestException('rotationAngle must be 90, 180, or 270');
        }

        return { payload: { angle: rotationAngle } };
      }

      case AgentOperationType.AlbumSetCover: {
        const fieldNames = Object.keys(fields);
        if (fieldNames.some((field) => field !== 'albumThumbnailAssetId')) {
          throw new BadRequestException('Unsupported field override for operation type');
        }

        const albumThumbnailAssetId = fields.albumThumbnailAssetId;
        if (typeof albumThumbnailAssetId !== 'string') {
          throw new BadRequestException('albumThumbnailAssetId must be a string');
        }

        const selectedCoverCandidateIds = selectedAssetIds ?? [...new Set(operation.assetIds)];
        if (!selectedCoverCandidateIds.includes(albumThumbnailAssetId)) {
          throw new BadRequestException('albumThumbnailAssetId must be one of the selected cover candidates');
        }

        return { albumThumbnailAssetId };
      }

      default: {
        throw new BadRequestException('Unsupported field override for operation type');
      }
    }
  }

  private normalizeAlbumTextOverride(field: 'albumName' | 'description', value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }

    const normalized = value.trim();
    if (field === 'albumName' && (normalized.length === 0 || normalized.length > 200)) {
      throw new BadRequestException('albumName must be 1-200 characters');
    }

    if (field === 'description' && normalized.length > 1000) {
      throw new BadRequestException('description must be 1000 characters or fewer');
    }

    return normalized;
  }

  private normalizeSpaceTextOverride(field: 'spaceName' | 'description', value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }

    const normalized = value.trim();
    if (field === 'spaceName' && (normalized.length === 0 || normalized.length > 100)) {
      throw new BadRequestException('spaceName must be 1-100 characters');
    }

    if (field === 'description' && normalized.length > 500) {
      throw new BadRequestException('description must be 500 characters or fewer');
    }

    return normalized;
  }

  private normalizeSpaceColorOverride(value: unknown): UserAvatarColor {
    if (typeof value !== 'string' || !Object.values(UserAvatarColor).includes(value as UserAvatarColor)) {
      throw new BadRequestException('color must be a valid space color');
    }

    return value as UserAvatarColor;
  }

  private resolveSelectedItemIds(
    operation: AgentOperationPlanWithOperations['operations'][number],
    selection: SparseItemSelection,
  ): string[] {
    const affectedItemIds =
      selection.itemKind === 'asset' ? [...new Set(operation.assetIds)] : this.getOperationUserIds(operation);

    if (affectedItemIds.length === 0) {
      throw new BadRequestException('Item selection is not supported for one or more operations');
    }

    const affectedItemIdSet = new Set(affectedItemIds);
    const itemIds = selection.itemIds ?? [];

    if (itemIds.some((itemId) => !affectedItemIdSet.has(itemId))) {
      throw new BadRequestException('One or more selected item ids are not affected by the operation');
    }

    switch (selection.mode) {
      case 'all': {
        return affectedItemIds;
      }
      case 'allExcept': {
        const excludedItemIds = new Set(itemIds);
        return affectedItemIds.filter((itemId) => !excludedItemIds.has(itemId));
      }
      case 'only': {
        return affectedItemIds.filter((itemId) => itemIds.includes(itemId));
      }
      case 'none': {
        return [];
      }
    }
  }

  private async applyClaimedPlan(
    auth: AuthDto,
    session: AgentSession,
    plan: AgentOperationPlanWithOperations,
    applySelection: ApplySelection,
  ): Promise<AgentOperationApplyUpdate[]> {
    const {
      selectedOperationIds,
      selectedAssetIdsByOperationId,
      selectedItemIdsByOperationId,
      fieldOverridesByOperationId,
    } = applySelection;
    const appliedOperationIds = new Set<string>();
    const createdAlbumIdByTemporaryTargetId = new Map<string, string>();
    const createdSpaceIdByTemporaryTargetId = new Map<string, string>();
    const updates: AgentOperationApplyUpdate[] = [];
    const selectedTotal = selectedOperationIds.size;
    let appliedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    await this.emitApplyProgress(auth, session.id, {
      status: AgentSessionActivityEventStatus.Running,
      total: selectedTotal,
      applied: appliedCount,
      skipped: skippedCount,
      failed: failedCount,
    });

    for (const operation of plan.operations) {
      if (!selectedOperationIds.has(operation.id)) {
        updates.push(this.skippedOperation(operation.id, 'Operation was not selected for apply'));
        continue;
      }

      const selectedAssetIds = selectedAssetIdsByOperationId.get(operation.id);
      const selectedItemIds = selectedItemIdsByOperationId.get(operation.id);
      const fieldOverride = fieldOverridesByOperationId.get(operation.id);
      const operationForApply =
        selectedAssetIds === undefined && selectedItemIds === undefined && !fieldOverride
          ? operation
          : this.applyOperationOverrides(operation, selectedAssetIds, fieldOverride, plan.operations, selectedItemIds);

      const dependencyApplied = operationForApply.dependencyIds.every((dependencyId) =>
        appliedOperationIds.has(dependencyId),
      );
      if (!dependencyApplied) {
        updates.push(this.skippedOperation(operation.id, 'Dependency was not applied'));
        skippedCount++;
        await this.emitApplyProgress(auth, session.id, {
          status: AgentSessionActivityEventStatus.Running,
          total: selectedTotal,
          applied: appliedCount,
          skipped: skippedCount,
          failed: failedCount,
        });
        continue;
      }

      if (selectedItemIds?.length === 0) {
        updates.push(this.skippedOperation(operation.id, 'No selected items for operation'));
        skippedCount++;
        await this.emitApplyProgress(auth, session.id, {
          status: AgentSessionActivityEventStatus.Running,
          total: selectedTotal,
          applied: appliedCount,
          skipped: skippedCount,
          failed: failedCount,
        });
        continue;
      }

      try {
        await this.validateApplyAccess(auth, session, operationForApply);
        const update = await this.applySingleOperation(
          auth,
          operationForApply,
          createdAlbumIdByTemporaryTargetId,
          createdSpaceIdByTemporaryTargetId,
        );
        updates.push(update);
        if (update.status === AgentOperationStatus.Applied) {
          appliedOperationIds.add(operation.id);
          appliedCount++;
        } else {
          skippedCount++;
        }
        await this.emitApplyProgress(auth, session.id, {
          status: AgentSessionActivityEventStatus.Running,
          total: selectedTotal,
          applied: appliedCount,
          skipped: skippedCount,
          failed: failedCount,
        });
      } catch (error) {
        updates.push({
          id: operation.id,
          status: AgentOperationStatus.Failed,
          result: null,
          error: error instanceof Error ? error.message : 'Agent operation apply failed',
        });
        failedCount++;
        await this.emitApplyProgress(auth, session.id, {
          status: AgentSessionActivityEventStatus.Running,
          total: selectedTotal,
          applied: appliedCount,
          skipped: skippedCount,
          failed: failedCount,
        });
      }
    }

    await this.emitApplyProgress(auth, session.id, {
      status: failedCount > 0 ? AgentSessionActivityEventStatus.Failed : AgentSessionActivityEventStatus.Completed,
      total: selectedTotal,
      applied: appliedCount,
      skipped: skippedCount,
      failed: failedCount,
    });

    return updates;
  }

  private async emitApplyProgress(
    auth: AuthDto,
    sessionId: string,
    progress: {
      status: AgentSessionActivityEventStatus;
      total: number;
      applied: number;
      skipped: number;
      failed: number;
    },
  ) {
    try {
      await this.activityEventService?.createSystemEvent(auth.user.id, sessionId, {
        kind: AgentSessionActivityEventKind.ApplyProgress,
        status: progress.status,
        counts: {
          total: progress.total,
          applied: progress.applied,
          skipped: progress.skipped,
          failed: progress.failed,
        },
      });
    } catch {
      // Activity events are visibility hints and must not block applying approved changes.
    }
  }

  private applyOperationOverrides(
    operation: AgentOperationPlanWithOperations['operations'][number],
    selectedAssetIds: string[] | undefined,
    fieldOverride: AgentOperationFieldOverride | undefined,
    operations: AgentOperationPlanWithOperations['operations'],
    selectedItemIds?: string[],
  ): AgentOperationPlanWithOperations['operations'][number] {
    const originalPayload = this.requireObjectPayload(operation.payload);
    const overriddenOperation: AgentOperationPlanWithOperations['operations'][number] = {
      ...operation,
      assetIds: fieldOverride?.albumThumbnailAssetId
        ? [fieldOverride.albumThumbnailAssetId]
        : (selectedAssetIds ?? operation.assetIds),
      payload: fieldOverride?.payload
        ? { ...originalPayload, ...fieldOverride.payload }
        : this.applySelectedUserIdsToPayload(operation.type, originalPayload, selectedItemIds),
    };

    if (fieldOverride?.targetAlbumId) {
      return {
        ...overriddenOperation,
        targetKind: AgentOperationTargetKind.ExistingAlbum,
        targetId: fieldOverride.targetAlbumId,
        temporaryTargetId: null,
        dependencyIds: this.retainNonTargetDependencies(operation, operations, AgentOperationType.AlbumCreate),
      };
    }

    if (fieldOverride?.targetSpaceId) {
      return {
        ...overriddenOperation,
        targetKind: AgentOperationTargetKind.ExistingSpace,
        targetId: fieldOverride.targetSpaceId,
        temporaryTargetId: null,
        dependencyIds: this.retainNonTargetDependencies(operation, operations, AgentOperationType.SpaceCreate),
      };
    }

    return overriddenOperation;
  }

  private retainNonTargetDependencies(
    operation: AgentOperationPlanWithOperations['operations'][number],
    operations: AgentOperationPlanWithOperations['operations'],
    createType: AgentOperationType.AlbumCreate | AgentOperationType.SpaceCreate,
  ) {
    if (!operation.temporaryTargetId || operation.dependencyIds.length === 0) {
      return operation.dependencyIds;
    }

    const operationById = new Map(operations.map((candidate) => [candidate.id, candidate]));
    return operation.dependencyIds.filter((dependencyId) => {
      const dependency = operationById.get(dependencyId);
      return dependency?.type !== createType || dependency.temporaryTargetId !== operation.temporaryTargetId;
    });
  }

  private applySelectedUserIdsToPayload(
    type: AgentOperationType,
    payload: Record<string, unknown>,
    selectedUserIds?: string[],
  ): Record<string, unknown> {
    if (selectedUserIds === undefined) {
      return payload;
    }

    const selectedUserIdSet = new Set(selectedUserIds);
    if (type === AgentOperationType.SpaceAddMembers) {
      const members = this.getMemberPayloads(payload).filter((member) => selectedUserIdSet.has(member.userId));
      return { ...payload, members };
    }

    if (type === AgentOperationType.SpaceRemoveMembers || type === AgentOperationType.SpaceUpdateMemberRole) {
      const userIds = this.getUserIdsPayload(payload).filter((userId) => selectedUserIdSet.has(userId));
      return { ...payload, userIds };
    }

    return payload;
  }

  private getOperationUserIds(operation: { type: AgentOperationType; payload?: unknown }): string[] {
    if (operation.type === AgentOperationType.SpaceAddMembers) {
      return [...new Set(this.getMemberPayloads(operation.payload).map((member) => member.userId))];
    }

    if (
      operation.type === AgentOperationType.SpaceRemoveMembers ||
      operation.type === AgentOperationType.SpaceUpdateMemberRole
    ) {
      return [...new Set(this.getUserIdsPayload(operation.payload))];
    }

    return [];
  }

  private async validateApplyAccess(
    auth: AuthDto,
    session: AgentSession,
    operation: AgentOperationPlanWithOperations['operations'][number],
  ) {
    this.validateWriteScope(session, operation.type);
    await this.validateNormalAccess(auth, session, [
      {
        type: operation.type,
        summary: operation.summary,
        targetKind: operation.targetKind,
        targetId: operation.targetId ?? undefined,
        temporaryTargetId: operation.temporaryTargetId ?? undefined,
        assetIds: operation.assetIds,
        payload: operation.payload,
        riskLevel: operation.riskLevel,
        enabled: operation.enabled,
      },
    ]);
  }

  private async applySingleOperation(
    auth: AuthDto,
    operation: AgentOperationPlanWithOperations['operations'][number],
    createdAlbumIdByTemporaryTargetId: Map<string, string>,
    createdSpaceIdByTemporaryTargetId: Map<string, string>,
  ): Promise<AgentOperationApplyUpdate> {
    switch (operation.type) {
      case AgentOperationType.AlbumCreate: {
        const payload = this.requireAlbumPayload(operation.payload, operation.summary);
        if (!payload.albumName) {
          throw new BadRequestException('album.create requires albumName');
        }

        const album = await this.albumService.create(auth, {
          albumName: payload.albumName,
          description: payload.description ?? '',
          assetIds: [],
        });
        if (operation.temporaryTargetId) {
          createdAlbumIdByTemporaryTargetId.set(operation.temporaryTargetId, album.id);
        }

        return this.appliedOperation(operation.id, { albumId: album.id });
      }

      case AgentOperationType.AlbumAddAssets: {
        const albumId = this.resolveTargetAlbumId(operation, createdAlbumIdByTemporaryTargetId);
        const results = await this.albumService.addAssets(auth, albumId, { ids: operation.assetIds });
        const successfulAssetIds = results.filter((result) => result.success).map((result) => result.id);
        const failedAssetCount = results.length - successfulAssetIds.length;

        if (failedAssetCount > 0) {
          return {
            id: operation.id,
            status: AgentOperationStatus.Failed,
            result: this.assetResult(albumId, successfulAssetIds, results),
            error: `Failed to add ${failedAssetCount} asset(s)`,
          };
        }

        return this.appliedOperation(operation.id, this.assetResult(albumId, successfulAssetIds, results));
      }

      case AgentOperationType.AlbumRemoveAssets: {
        const albumId = this.resolveTargetAlbumId(operation, createdAlbumIdByTemporaryTargetId);
        const results = await this.albumService.removeAssets(auth, albumId, { ids: operation.assetIds });
        return this.bulkAssetOperationResult(operation.id, { albumId }, 'remove', results);
      }

      case AgentOperationType.AlbumUpdateDetails: {
        const payload = this.requireAlbumPayload(operation.payload, operation.summary);
        const albumId = this.resolveTargetAlbumId(operation, createdAlbumIdByTemporaryTargetId);
        const album = await this.albumService.update(auth, albumId, {
          albumName: payload.albumName,
          description: payload.description,
        });

        return this.appliedOperation(operation.id, { albumId: album.id });
      }

      case AgentOperationType.AlbumSetCover: {
        const albumId = this.resolveTargetAlbumId(operation, createdAlbumIdByTemporaryTargetId);
        const [albumThumbnailAssetId] = operation.assetIds;
        if (!albumThumbnailAssetId) {
          throw new BadRequestException('album.setCover requires one asset id');
        }

        const album = await this.albumService.update(auth, albumId, { albumThumbnailAssetId });
        return this.appliedOperation(operation.id, { albumId: album.id, assetIds: [albumThumbnailAssetId] });
      }

      case AgentOperationType.SpaceCreate: {
        const payload = this.requireSpacePayload(operation.payload, operation.summary);
        if (!payload.spaceName) {
          throw new BadRequestException('space.create requires spaceName');
        }

        const dto: { name: string; description?: string; color?: UserAvatarColor } = { name: payload.spaceName };
        if (payload.description !== undefined) {
          dto.description = payload.description;
        }
        if (payload.color !== undefined) {
          dto.color = payload.color;
        }

        const space = await this.sharedSpaceService.create(auth, dto);
        if (operation.temporaryTargetId) {
          createdSpaceIdByTemporaryTargetId.set(operation.temporaryTargetId, space.id);
        }

        return this.appliedOperation(operation.id, { spaceId: space.id });
      }

      case AgentOperationType.SpaceAddAssets: {
        const spaceId = this.resolveTargetSpaceId(operation, createdSpaceIdByTemporaryTargetId);
        await this.sharedSpaceService.addAssets(auth, spaceId, { assetIds: operation.assetIds });
        return this.appliedOperation(operation.id, { spaceId, assetIds: operation.assetIds });
      }

      case AgentOperationType.SpaceRemoveAssets: {
        const spaceId = this.resolveTargetSpaceId(operation, createdSpaceIdByTemporaryTargetId);
        await this.sharedSpaceService.removeAssets(auth, spaceId, { assetIds: operation.assetIds });
        return this.appliedOperation(operation.id, { spaceId, assetIds: operation.assetIds });
      }

      case AgentOperationType.SpaceUpdateDetails: {
        const payload = this.requireSpaceUpdateDetailsPayload(operation.payload, operation.summary);
        const spaceId = this.resolveTargetSpaceId(operation, createdSpaceIdByTemporaryTargetId);
        const dto: { name?: string; description?: string; color?: UserAvatarColor } = {};
        if (payload.spaceName !== undefined) {
          dto.name = payload.spaceName;
        }
        if (payload.description !== undefined) {
          dto.description = payload.description;
        }
        if (payload.color !== undefined) {
          dto.color = payload.color;
        }

        const space = await this.sharedSpaceService.update(auth, spaceId, dto);

        return this.appliedOperation(operation.id, { spaceId: space.id });
      }

      case AgentOperationType.SpaceAddMembers: {
        const spaceId = this.resolveTargetSpaceId(operation, createdSpaceIdByTemporaryTargetId);
        const members = this.getMemberPayloads(operation.payload);
        const currentMembers = await this.sharedSpaceService.getMembers(auth, spaceId);
        const currentMemberIds = new Set(currentMembers.map((member) => member.userId));
        const appliedUserIds: string[] = [];
        const skippedUserIds: string[] = [];

        for (const member of members) {
          if (currentMemberIds.has(member.userId)) {
            skippedUserIds.push(member.userId);
            continue;
          }

          await this.sharedSpaceService.addMember(auth, spaceId, { userId: member.userId, role: member.role });
          currentMemberIds.add(member.userId);
          appliedUserIds.push(member.userId);
        }

        return this.appliedOperation(operation.id, { spaceId, userIds: appliedUserIds, skippedUserIds });
      }

      case AgentOperationType.SpaceRemoveMembers: {
        const spaceId = this.resolveTargetSpaceId(operation, createdSpaceIdByTemporaryTargetId);
        const userIds = this.getUserIdsPayload(operation.payload);
        const currentMembers = await this.sharedSpaceService.getMembers(auth, spaceId);
        this.assertSafeMemberRemovalOrRoleUpdate(auth.user.id, userIds, currentMembers);
        const currentMemberIds = new Set(currentMembers.map((member) => member.userId));
        const appliedUserIds: string[] = [];
        const skippedUserIds: string[] = [];

        for (const userId of userIds) {
          if (!currentMemberIds.has(userId)) {
            skippedUserIds.push(userId);
            continue;
          }

          await this.sharedSpaceService.removeMember(auth, spaceId, userId);
          currentMemberIds.delete(userId);
          appliedUserIds.push(userId);
        }

        return this.appliedOperation(operation.id, { spaceId, userIds: appliedUserIds, skippedUserIds });
      }

      case AgentOperationType.SpaceUpdateMemberRole: {
        const spaceId = this.resolveTargetSpaceId(operation, createdSpaceIdByTemporaryTargetId);
        const payload = this.requireMemberRolePayload(operation.payload);
        const currentMembers = await this.sharedSpaceService.getMembers(auth, spaceId);
        this.assertSafeMemberRemovalOrRoleUpdate(auth.user.id, payload.userIds, currentMembers);
        const currentMemberRoleById = new Map(currentMembers.map((member) => [member.userId, member.role]));
        const appliedUserIds: string[] = [];
        const skippedUserIds: string[] = [];

        for (const userId of payload.userIds) {
          const currentRole = currentMemberRoleById.get(userId);
          if (!currentRole || currentRole === payload.role) {
            skippedUserIds.push(userId);
            continue;
          }

          await this.sharedSpaceService.updateMember(auth, spaceId, userId, { role: payload.role });
          currentMemberRoleById.set(userId, payload.role);
          appliedUserIds.push(userId);
        }

        return this.appliedOperation(operation.id, { spaceId, userIds: appliedUserIds, skippedUserIds });
      }

      case AgentOperationType.AssetSetFavorite: {
        const payload = this.requireBooleanPayload(operation.payload, 'favorite');
        await this.assetService.updateAll(auth, { ids: operation.assetIds, isFavorite: payload.favorite });
        return this.appliedOperation(operation.id, { assetIds: operation.assetIds });
      }

      case AgentOperationType.AssetSetArchive: {
        const payload = this.requireBooleanPayload(operation.payload, 'archived');
        await this.assetService.updateAll(auth, {
          ids: operation.assetIds,
          visibility: payload.archived ? AssetVisibility.Archive : AssetVisibility.Timeline,
        });
        return this.appliedOperation(operation.id, { assetIds: operation.assetIds });
      }

      case AgentOperationType.AssetAddTag: {
        const payload = this.requireTagPayload(operation.payload);
        const tagId = payload.tagId ?? (await this.upsertTag(auth, payload.tagName));
        const results = await this.tagService.addAssets(auth, tagId, { ids: operation.assetIds });
        return this.bulkAssetOperationResult(operation.id, { tagId }, 'tag', results);
      }

      case AgentOperationType.AssetRemoveTag: {
        const payload = this.requireTagPayload(operation.payload);
        if (!payload.tagId) {
          throw new BadRequestException('asset.removeTag requires tagId');
        }

        const results = await this.tagService.removeAssets(auth, payload.tagId, { ids: operation.assetIds });
        return this.bulkAssetOperationResult(operation.id, { tagId: payload.tagId }, 'untag', results);
      }

      case AgentOperationType.AssetRotate: {
        return this.applyRotateOperation(auth, operation);
      }

      default: {
        throw new BadRequestException(`${operation.type} is not supported for apply yet`);
      }
    }
  }

  private skippedOperation(id: string, skippedReason: string): AgentOperationApplyUpdate {
    return {
      id,
      status: AgentOperationStatus.Skipped,
      result: { skippedReason },
      error: null,
    };
  }

  private appliedOperation(id: string, result: AgentOperationResult): AgentOperationApplyUpdate {
    return {
      id,
      status: AgentOperationStatus.Applied,
      result,
      error: null,
    };
  }

  private assetResult(albumId: string, assetIds: string[], assetResults: BulkIdResponseDto[]): AgentOperationResult {
    return {
      albumId,
      assetIds,
      assetResults: assetResults.map(({ id, success, error, errorMessage }) => ({ id, success, error, errorMessage })),
    };
  }

  private bulkAssetOperationResult(
    id: string,
    target: { albumId?: string; tagId?: string },
    verb: string,
    results: BulkIdResponseDto[],
  ): AgentOperationApplyUpdate {
    const successfulAssetIds = results.filter((result) => result.success).map((result) => result.id);
    const failedAssetCount = results.length - successfulAssetIds.length;
    const result = {
      ...target,
      assetIds: successfulAssetIds,
      assetResults: results.map(({ id, success, error, errorMessage }) => ({ id, success, error, errorMessage })),
    };

    if (failedAssetCount > 0) {
      return {
        id,
        status: AgentOperationStatus.Failed,
        result,
        error: `Failed to ${verb} ${failedAssetCount} asset(s)`,
      };
    }

    return this.appliedOperation(id, result);
  }

  private resolveTargetAlbumId(
    operation: AgentOperationPlanWithOperations['operations'][number],
    createdAlbumIdByTemporaryTargetId: Map<string, string>,
  ) {
    if (operation.targetId) {
      return operation.targetId;
    }

    if (operation.temporaryTargetId) {
      const albumId = createdAlbumIdByTemporaryTargetId.get(operation.temporaryTargetId);
      if (albumId) {
        return albumId;
      }
    }

    throw new BadRequestException(`No applied album exists for operation ${operation.id}`);
  }

  private resolveTargetSpaceId(
    operation: AgentOperationPlanWithOperations['operations'][number],
    createdSpaceIdByTemporaryTargetId: Map<string, string>,
  ) {
    if (operation.targetId) {
      return operation.targetId;
    }

    if (operation.temporaryTargetId) {
      const spaceId = createdSpaceIdByTemporaryTargetId.get(operation.temporaryTargetId);
      if (spaceId) {
        return spaceId;
      }
    }

    throw new BadRequestException(`No applied space exists for operation ${operation.id}`);
  }

  private requireAlbumPayload(payload: unknown, summary: string): { albumName?: string; description?: string } {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException(`Invalid album payload for ${summary}`);
    }

    const { albumName, description } = payload as { albumName?: unknown; description?: unknown };
    return {
      albumName: typeof albumName === 'string' ? albumName : undefined,
      description: typeof description === 'string' ? description : undefined,
    };
  }

  private requireSpacePayload(
    payload: unknown,
    summary: string,
  ): { spaceName?: string; description?: string; color?: UserAvatarColor } {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException(`Invalid space payload for ${summary}`);
    }

    const { spaceName, description, color } = payload as {
      spaceName?: unknown;
      description?: unknown;
      color?: unknown;
    };
    const normalizedSpaceName = typeof spaceName === 'string' ? spaceName.trim() : undefined;
    const normalizedDescription = typeof description === 'string' ? description : undefined;
    if (normalizedSpaceName !== undefined && (normalizedSpaceName.length === 0 || normalizedSpaceName.length > 100)) {
      throw new BadRequestException(`Invalid space payload for ${summary}`);
    }
    if (normalizedDescription !== undefined && normalizedDescription.length > 500) {
      throw new BadRequestException(`Invalid space payload for ${summary}`);
    }
    if (color !== undefined && !Object.values(UserAvatarColor).includes(color as UserAvatarColor)) {
      throw new BadRequestException(`Invalid space payload for ${summary}`);
    }

    return {
      spaceName: normalizedSpaceName,
      description: normalizedDescription,
      color: color as UserAvatarColor | undefined,
    };
  }

  private requireSpaceUpdateDetailsPayload(
    payload: unknown,
    summary: string,
  ): { spaceName?: string; description?: string; color?: UserAvatarColor } {
    const objectPayload = this.requireObjectPayload(payload);
    const unsupportedFields = Object.keys(objectPayload).filter(
      (field) => field !== 'spaceName' && field !== 'description' && field !== 'color',
    );
    if (unsupportedFields.length > 0) {
      throw new BadRequestException(`Invalid space payload for ${summary}`);
    }

    const updatePayload = this.requireSpacePayload(payload, summary);
    if (
      updatePayload.spaceName === undefined &&
      updatePayload.description === undefined &&
      updatePayload.color === undefined
    ) {
      throw new BadRequestException(`Invalid space payload for ${summary}`);
    }

    return updatePayload;
  }

  private requireBooleanPayload(
    payload: unknown,
    key: 'favorite' | 'archived',
  ): { favorite?: boolean; archived?: boolean } {
    const objectPayload = this.requireObjectPayload(payload);
    const value = objectPayload[key];
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`asset operation requires boolean ${key}`);
    }

    return { [key]: value };
  }

  private requireTagPayload(payload: unknown): { tagId?: string; tagName?: string } {
    const objectPayload = this.requireObjectPayload(payload);
    return {
      tagId: typeof objectPayload.tagId === 'string' ? objectPayload.tagId : undefined,
      tagName: typeof objectPayload.tagName === 'string' ? objectPayload.tagName : undefined,
    };
  }

  private getMemberPayloads(
    payload: unknown,
  ): Array<{ userId: string; role: SharedSpaceRole.Editor | SharedSpaceRole.Viewer }> {
    const objectPayload = this.requireObjectPayload(payload);
    return Array.isArray(objectPayload.members)
      ? objectPayload.members
          .filter((member): member is { userId: string; role: SharedSpaceRole.Editor | SharedSpaceRole.Viewer } => {
            if (!member || typeof member !== 'object' || Array.isArray(member)) {
              return false;
            }

            const candidate = member as Record<string, unknown>;
            return (
              typeof candidate.userId === 'string' &&
              (candidate.role === SharedSpaceRole.Editor || candidate.role === SharedSpaceRole.Viewer)
            );
          })
          .map((member) => ({ userId: member.userId, role: member.role }))
      : [];
  }

  private getUserIdsPayload(payload: unknown): string[] {
    const objectPayload = this.requireObjectPayload(payload);
    return Array.isArray(objectPayload.userIds)
      ? objectPayload.userIds.filter((userId): userId is string => typeof userId === 'string')
      : [];
  }

  private requireMemberRolePayload(payload: unknown): {
    userIds: string[];
    role: SharedSpaceRole.Editor | SharedSpaceRole.Viewer;
  } {
    const objectPayload = this.requireObjectPayload(payload);
    if (objectPayload.role !== SharedSpaceRole.Editor && objectPayload.role !== SharedSpaceRole.Viewer) {
      throw new BadRequestException('space.updateMemberRole requires viewer or editor role');
    }

    return {
      userIds: this.getUserIdsPayload(payload),
      role: objectPayload.role,
    };
  }

  private assertSafeMemberRemovalOrRoleUpdate(
    currentUserId: string,
    userIds: string[],
    currentMembers: Array<{ userId: string; role: string }>,
  ) {
    if (userIds.includes(currentUserId)) {
      throw new BadRequestException('Pi cannot remove or change your own space membership');
    }

    const currentMemberRoleById = new Map(currentMembers.map((member) => [member.userId, member.role]));
    const ownerIds = currentMembers
      .filter((member) => member.role === SharedSpaceRole.Owner)
      .map((member) => member.userId);
    const affectedOwnerIds = userIds.filter((userId) => currentMemberRoleById.get(userId) === SharedSpaceRole.Owner);
    const demotesOrRemovesOwners = affectedOwnerIds.length > 0;

    if (demotesOrRemovesOwners && ownerIds.length - affectedOwnerIds.length < 1) {
      throw new BadRequestException('Pi cannot remove or demote the last owner of a space');
    }
  }

  private async upsertTag(auth: AuthDto, tagName: string | undefined) {
    if (!tagName) {
      throw new BadRequestException('asset.addTag requires tagId or tagName');
    }

    const [tag] = await this.tagService.upsert(auth, { tags: [tagName] });
    if (!tag) {
      throw new BadRequestException('Tag upsert did not return a tag');
    }

    return tag.id;
  }

  private async applyRotateOperation(
    auth: AuthDto,
    operation: AgentOperationPlanWithOperations['operations'][number],
  ): Promise<AgentOperationApplyUpdate> {
    const angle = this.requireRotationPayload(operation.payload);
    const assetResults: BulkIdResponseDto[] = [];
    const successfulAssetIds: string[] = [];

    for (const assetId of operation.assetIds) {
      try {
        const editableAsset = await this.assetRepository.getForEdit(assetId);
        if (!editableAsset) {
          throw new BadRequestException('Asset not found');
        }
        if (editableAsset.type !== AssetType.Image) {
          throw new BadRequestException('Only images can be edited');
        }

        const { edits } = await this.assetService.getAssetEdits(auth, assetId);
        const mergedEdits = this.mergeRotationEdits(
          edits.map(({ action, parameters }) => ({ action, parameters }) as AssetEditActionItem),
          angle,
        );
        await (mergedEdits.length === 0
          ? this.assetService.removeAssetEdits(auth, assetId)
          : this.assetService.editAsset(auth, assetId, { edits: mergedEdits }));

        successfulAssetIds.push(assetId);
        assetResults.push({ id: assetId, success: true });
      } catch (error) {
        assetResults.push({
          id: assetId,
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Failed to rotate asset',
        });
      }
    }

    const failedAssetCount = assetResults.length - successfulAssetIds.length;
    const result = {
      assetIds: successfulAssetIds,
      assetResults: assetResults.map(({ id, success, error, errorMessage }) => ({ id, success, error, errorMessage })),
    };

    if (failedAssetCount > 0) {
      return {
        id: operation.id,
        status: AgentOperationStatus.Failed,
        result,
        error: `Failed to rotate ${failedAssetCount} asset(s)`,
      };
    }

    return this.appliedOperation(operation.id, result);
  }

  private requireRotationPayload(payload: unknown): 90 | 180 | 270 {
    const objectPayload = this.requireObjectPayload(payload);
    const angle = objectPayload.angle;
    if (angle !== 90 && angle !== 180 && angle !== 270) {
      throw new BadRequestException('asset.rotate requires angle 90, 180, or 270');
    }

    return angle;
  }

  private mergeRotationEdits(edits: AssetEditActionItem[], relativeAngle: 90 | 180 | 270): AssetEditActionItem[] {
    let inserted = false;
    const nextEdits: AssetEditActionItem[] = [];

    for (const edit of edits) {
      if (edit.action === AssetEditAction.Rotate) {
        const angle = edit.parameters.angle;
        const currentAngle = typeof angle === 'number' ? angle : 0;
        const netAngle = this.normalizeRotationAngle(currentAngle + relativeAngle);
        if (netAngle !== 0) {
          nextEdits.push({ action: AssetEditAction.Rotate, parameters: { angle: netAngle } });
        }
        inserted = true;
        continue;
      }

      nextEdits.push({ action: edit.action, parameters: edit.parameters } as AssetEditActionItem);
    }

    if (!inserted) {
      nextEdits.push({ action: AssetEditAction.Rotate, parameters: { angle: relativeAngle } });
    }

    return nextEdits;
  }

  private normalizeRotationAngle(angle: number) {
    return ((angle % 360) + 360) % 360;
  }

  private requireObjectPayload(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }

    return payload as Record<string, unknown>;
  }

  private createPlanningAudit(
    session: AgentSession,
    toolName: AgentToolName,
    request: PlanningRequest,
    result: PlanningAuditResult | PlanningAuditCreate,
  ) {
    const operations = request.operations ?? [];
    const assetIds = [...new Set(operations.flatMap((operation) => operation.assetIds ?? []))];
    const attemptedSelectionHandleIds = this.getAttemptedSelectionHandleIds(operations);
    const albumIds = [
      ...new Set(
        operations
          .filter((operation) => operation.targetKind === AgentOperationTargetKind.ExistingAlbum && operation.targetId)
          .map((operation) => operation.targetId as string),
      ),
    ];
    const spaceIds = [
      ...new Set(
        operations
          .filter((operation) => operation.targetKind === AgentOperationTargetKind.ExistingSpace && operation.targetId)
          .map((operation) => operation.targetId as string),
      ),
    ];
    const tagIds = [
      ...new Set(
        operations.flatMap((operation) => {
          const payload = this.requireObjectPayload(operation.payload);
          return typeof payload.tagId === 'string' ? [payload.tagId] : [];
        }),
      ),
    ];
    const userIds = [...new Set(operations.flatMap((operation) => this.getOperationUserIds(operation)))];

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
      redactedRequestMetadata: this.redactRequestMetadata(toolName, request, operations, {
        albumIds,
        spaceIds,
        tagIds,
        userIds,
        assetIds,
        attemptedSelectionHandleIds,
      }),
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

  private async tryCreatePlanningPreparationDeniedAudit(
    session: AgentSession,
    toolName: AgentToolName,
    request: PlanningRequest,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : 'Agent operation planning failed';
    const status =
      error instanceof BadRequestException || error instanceof NotFoundException
        ? AgentToolCallStatus.Denied
        : AgentToolCallStatus.Failed;
    const approvalDecision =
      status === AgentToolCallStatus.Denied ? AgentToolApprovalDecision.Denied : AgentToolApprovalDecision.Approved;
    const redactedResponseMetadata = isAgentMcpRecoverableToolError(error)
      ? this.recoverablePlanningResponseMetadata(error.content.recovery)
      : null;

    try {
      await this.createPlanningAudit(session, toolName, request, {
        status,
        approvalDecision,
        responseSummary: null,
        redactedResponseMetadata,
        error: message,
      });
    } catch {
      // Preserve the original preparation error.
    }
  }

  private isInvalidSelectionHandleRecoveryMetadata(
    recovery: Record<string, unknown>,
  ): recovery is AgentSelectionHandleRecoveryMetadata {
    return recovery.kind === 'invalid-selection-handle';
  }

  private sanitizeWrongIdDomainRecoveryMetadata(
    recovery: Record<string, unknown>,
  ): AgentWrongIdDomainRecoveryMetadata | null {
    if (
      recovery.kind !== 'wrong_id_domain' ||
      typeof recovery.field !== 'string' ||
      typeof recovery.instruction !== 'string' ||
      !this.isKnownAgentIdDomain(recovery.expectedDomain) ||
      !this.isKnownAgentIdDomain(recovery.receivedDomain)
    ) {
      return null;
    }

    return {
      kind: 'wrong_id_domain',
      field: recovery.field,
      expectedDomain: recovery.expectedDomain,
      receivedDomain: recovery.receivedDomain,
      instruction: recovery.instruction,
    };
  }

  private isKnownAgentIdDomain(value: unknown): value is AgentIdDomain {
    return typeof value === 'string' && knownAgentIdDomains.has(value as AgentIdDomain);
  }

  private recoverablePlanningResponseMetadata(
    recovery: Record<string, unknown>,
  ): AgentToolOperationPlanResponseMetadata | null {
    if (this.isInvalidSelectionHandleRecoveryMetadata(recovery)) {
      return { selectionHandleRecovery: recovery };
    }

    const wrongIdDomainRecovery = this.sanitizeWrongIdDomainRecoveryMetadata(recovery);
    if (wrongIdDomainRecovery) {
      return { wrongIdDomainRecovery };
    }

    return null;
  }

  private redactRequestMetadata(
    _toolName: AgentToolName,
    request: PlanningRequest,
    operations: AgentAlbumOperationInput[],
    ids: {
      albumIds: string[];
      spaceIds: string[];
      tagIds: string[];
      userIds: string[];
      assetIds: string[];
      attemptedSelectionHandleIds: string[];
    },
  ): AgentToolOperationPlanRequestMetadata {
    const handleDerived = (request.selectionHandles?.length ?? 0) > 0;
    const assetIdsForAudit = handleDerived ? ids.assetIds.slice(0, 25) : ids.assetIds;
    const metadata: AgentToolOperationPlanRequestMetadata = {
      planId: request.planId,
      operationCount: operations.length,
      operationTypes: operations.map((operation) => operation.type),
      albumIds: ids.albumIds,
      assetIds: assetIdsForAudit,
    };

    if (operations.length > 0 || handleDerived) {
      metadata.assetCount = ids.assetIds.length;
    }

    if (handleDerived) {
      metadata.assetIdsSample = assetIdsForAudit;
      metadata.selectionHandles = request.selectionHandles;
    }

    if (ids.attemptedSelectionHandleIds.length > 0) {
      metadata.attemptedSelectionHandleIds = ids.attemptedSelectionHandleIds;
    }

    if (ids.spaceIds.length > 0) {
      metadata.spaceIds = ids.spaceIds;
    }

    if (ids.tagIds.length > 0) {
      metadata.tagIds = ids.tagIds;
    }

    if (ids.userIds.length > 0) {
      metadata.userIds = ids.userIds;
    }

    return metadata;
  }

  private getAttemptedSelectionHandleIds(operations: AgentAlbumOperationInput[]) {
    return [
      ...new Set(
        operations.flatMap((operation) =>
          operation.assetSelectionHandleId && !operation.assetIds?.length ? [operation.assetSelectionHandleId] : [],
        ),
      ),
    ];
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

  private buildApplyResponse(
    plan: AgentOperationPlanResponseDto,
    selectedOperationIds: Set<string>,
  ): AgentOperationPlanApplyResponseDto {
    const appliedOperationIds = plan.operations
      .filter((operation) => operation.status === AgentOperationStatus.Applied)
      .map((operation) => operation.id);
    const skippedOperationIds = plan.operations
      .filter((operation) => operation.status === AgentOperationStatus.Skipped)
      .map((operation) => operation.id);
    const failedOperationIds = plan.operations
      .filter((operation) => operation.status === AgentOperationStatus.Failed)
      .map((operation) => operation.id);
    const selectedSkippedOperationIds = skippedOperationIds.filter((operationId) =>
      selectedOperationIds.has(operationId),
    );
    const status =
      appliedOperationIds.length === 0
        ? AgentOperationApplyStatus.Failed
        : failedOperationIds.length > 0 || selectedSkippedOperationIds.length > 0
          ? AgentOperationApplyStatus.PartiallyApplied
          : AgentOperationApplyStatus.Applied;

    return {
      status,
      plan,
      appliedOperationIds,
      skippedOperationIds,
      failedOperationIds,
      summary: `Applied ${appliedOperationIds.length} operation(s), skipped ${skippedOperationIds.length}, failed ${failedOperationIds.length}.`,
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
