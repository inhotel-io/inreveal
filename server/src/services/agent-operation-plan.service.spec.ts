import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AgentSession, AgentToolCall } from 'src/database';
import { BulkIdErrorReason } from 'src/dtos/asset-ids.response.dto';
import { AssetEditAction } from 'src/dtos/editing.dto';
import {
  AgentApprovalMode,
  AgentOperationApplyStatus,
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  AgentPermissionPreset,
  AgentProviderType,
  AgentSessionActivityEventKind,
  AgentSessionActivityEventStatus,
  AgentSessionStatus,
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
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
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { AgentToolCallRepository } from 'src/repositories/agent-tool-call.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { WebsocketRepository } from 'src/repositories/websocket.repository';
import { AgentOperationPlanService } from 'src/services/agent-operation-plan.service';
import { AgentSessionActivityEventService } from 'src/services/agent-session-activity-event.service';
import { AlbumService } from 'src/services/album.service';
import { AssetService } from 'src/services/asset.service';
import { SharedSpaceService } from 'src/services/shared-space.service';
import { TagService } from 'src/services/tag.service';
import { AgentPermissionPlanSnapshot } from 'src/types/agent-session.types';
import { AuthFactory } from 'test/factories/auth.factory';
import { newAccessRepositoryMock } from 'test/repositories/access.repository.mock';
import { newAssetRepositoryMock } from 'test/repositories/asset.repository.mock';
import { newUuid } from 'test/small.factory';
import { automock, mockBaseService } from 'test/utils';

const now = new Date('2026-05-15T12:00:00.000Z');

const permissionPlanSnapshot: AgentPermissionPlanSnapshot = {
  read: { metadata: true, previews: false, originals: false },
  providerExposure: {
    metadata: true,
    previews: false,
    originals: false,
    allowOriginalsForExternalProviders: false,
  },
  assetScope: { owned: true, sharedSpaces: false, locked: false },
  writeScope: { createAlbum: true, addAssets: true, updateDetails: true, setCover: true },
  limits: {
    maxAssetsPerToolCall: 100,
    maxAssetsPerSession: 1000,
    maxPreviewsPerToolCall: 0,
    maxOriginalsPerToolCall: 0,
    expiresInMinutes: 60,
  },
};

const expandedWriteScope = {
  ...permissionPlanSnapshot.writeScope,
  removeAssets: true,
  createSpace: true,
  addAssetsToSpaces: true,
  removeAssetsFromSpaces: true,
  updateSpaceDetails: true,
  editAssets: true,
  favoriteAssets: true,
  archiveAssets: true,
  tagAssets: true,
};

const expandedPermissionPlanSnapshot: AgentPermissionPlanSnapshot = {
  ...permissionPlanSnapshot,
  assetScope: { owned: true, sharedSpaces: true, locked: false },
  writeScope: expandedWriteScope,
};

const makeSession = (overrides: Partial<AgentSession> = {}): AgentSession => {
  const providerCredentialId = newUuid();
  return {
    id: newUuid(),
    userId: newUuid(),
    providerCredentialId,
    credentialSnapshot: {
      id: providerCredentialId,
      providerType: AgentProviderType.OpenAI,
      label: 'OpenAI personal',
      baseUrl: 'https://api.example.com/v1',
      models: ['gpt-5.1'],
      defaultModel: 'gpt-5.1',
    },
    modelSnapshot: { providerCredentialId, model: 'gpt-5.1' },
    permissionPreset: AgentPermissionPreset.Careful,
    permissionPlanSnapshot,
    approvalMode: AgentApprovalMode.Strict,
    runnerEndpoint: null,
    runnerSessionId: null,
    runnerCapabilitiesSnapshot: null,
    status: AgentSessionStatus.Running,
    initialContextSnapshot: {},
    title: null,
    createdAt: now,
    updatedAt: now,
    endedAt: null,
    updateId: newUuid(),
    ...overrides,
  };
};

const makeOperation = (
  overrides: Partial<AgentOperationPlanWithOperations['operations'][number]> = {},
): AgentOperationPlanWithOperations['operations'][number] => ({
  id: newUuid(),
  planId: overrides.planId ?? newUuid(),
  position: overrides.position ?? 0,
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
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const makePlan = (
  overrides: Partial<AgentOperationPlanWithOperations> & {
    operations?: AgentOperationPlanWithOperations['operations'];
  } = {},
): AgentOperationPlanWithOperations => {
  const plan: AgentOperationPlanWithOperations = {
    id: newUuid(),
    sessionId: newUuid(),
    revision: 1,
    status: AgentOperationPlanStatus.Proposed,
    summary: 'Portugal plan.',
    createdAt: now,
    updatedAt: now,
    operations: overrides.operations ?? [],
    ...overrides,
  };

  return { ...plan, operations: overrides.operations ?? [makeOperation({ planId: plan.id })] };
};

const applyUpdatesToPlan = (
  plan: AgentOperationPlanWithOperations,
  updates: AgentOperationApplyUpdate[],
): AgentOperationPlanWithOperations => ({
  ...plan,
  status: AgentOperationPlanStatus.Applied,
  operations: plan.operations.map((operation) => {
    const update = updates.find((candidate) => candidate.id === operation.id);
    return update ? { ...operation, ...update } : operation;
  }),
});

const makeAddAssetsPlan = (auth: ReturnType<typeof AuthFactory.create>, assetIds: string[]) => {
  const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
  const albumId = newUuid();
  const operation = makeOperation({
    id: newUuid(),
    planId: 'plan-id',
    type: AgentOperationType.AlbumAddAssets,
    targetKind: AgentOperationTargetKind.ExistingAlbum,
    targetId: albumId,
    temporaryTargetId: null,
    assetIds,
    payload: {},
  });
  const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [operation] });

  return { session, albumId, operation, plan };
};

const makeToolCall = (overrides: Partial<AgentToolCall> = {}): AgentToolCall => ({
  id: newUuid(),
  sessionId: newUuid(),
  toolName: AgentToolName.ProposeAlbumOperations,
  status: AgentToolCallStatus.Completed,
  approvalDecision: AgentToolApprovalDecision.Approved,
  requestSummary: 'Store 1 proposed album operation(s)',
  responseSummary: 'Plan revision 1.',
  redactedRequestMetadata: {},
  redactedResponseMetadata: {},
  dataClass: AgentToolDataClass.Plan,
  assetCount: 0,
  albumCount: 0,
  providerSnapshot: {
    providerCredentialId: newUuid(),
    providerType: AgentProviderType.OpenAI,
    label: 'OpenAI personal',
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-5.1',
  },
  startedAt: now,
  completedAt: now,
  error: null,
  ...overrides,
});

describe(AgentOperationPlanService.name, () => {
  let sut: AgentOperationPlanService;
  let accessRepository: ReturnType<typeof newAccessRepositoryMock>;
  let assetRepository: ReturnType<typeof newAssetRepositoryMock>;
  let albumService: ReturnType<typeof automock<AlbumService>>;
  let sharedSpaceService: ReturnType<typeof automock<SharedSpaceService>>;
  let assetService: ReturnType<typeof automock<AssetService>>;
  let tagService: ReturnType<typeof automock<TagService>>;
  let sessionRepository: ReturnType<typeof automock<AgentSessionRepository>>;
  let planRepository: ReturnType<typeof automock<AgentOperationPlanRepository>>;
  let toolCallRepository: ReturnType<typeof automock<AgentToolCallRepository>>;
  let websocketRepository: ReturnType<typeof automock<WebsocketRepository>>;
  let activityEventService: Pick<AgentSessionActivityEventService, 'createSystemEvent'>;

  beforeEach(() => {
    accessRepository = newAccessRepositoryMock();
    assetRepository = newAssetRepositoryMock();
    albumService = mockBaseService(AlbumService);
    sharedSpaceService = mockBaseService(SharedSpaceService);
    assetService = mockBaseService(AssetService);
    tagService = mockBaseService(TagService);
    sessionRepository = automock(AgentSessionRepository, { args: [{} as never] });
    planRepository = automock(AgentOperationPlanRepository, { args: [{} as never] });
    toolCallRepository = automock(AgentToolCallRepository, { args: [{} as never] });
    websocketRepository = automock(WebsocketRepository, { args: [{} as never, { setContext: () => {} } as never] });
    activityEventService = {
      createSystemEvent: vi.fn(() => Promise.resolve(null)),
    };
    sessionRepository.update.mockResolvedValue({} as never);
    websocketRepository.clientSend.mockImplementation(() => {});
    toolCallRepository.transition.mockImplementation((_sessionId, _id, _expectedStatus, dto) =>
      Promise.resolve(
        makeToolCall({
          ...dto,
          completedAt: dto.completedAt instanceof Date || dto.completedAt === null ? dto.completedAt : undefined,
        }),
      ),
    );
    sut = new (AgentOperationPlanService as unknown as new (...args: unknown[]) => AgentOperationPlanService)(
      accessRepository as unknown as AccessRepository,
      assetRepository as unknown as AssetRepository,
      albumService,
      sessionRepository,
      planRepository,
      toolCallRepository,
      websocketRepository,
      sharedSpaceService,
      assetService,
      tagService,
      activityEventService,
    );
  });

  it('stores a proposed plan, marks the session waiting for review, audits completion, and notifies clients', async () => {
    const auth = AuthFactory.create();
    const assetId = newUuid();
    const session = makeSession({ userId: auth.user.id });
    const plan = makePlan({
      sessionId: session.id,
      operations: [
        makeOperation({ id: newUuid(), planId: 'plan-id', position: 0 }),
        makeOperation({
          id: newUuid(),
          planId: 'plan-id',
          position: 1,
          type: AgentOperationType.AlbumAddAssets,
          summary: 'Add beach photo.',
          temporaryTargetId: 'tmp-portugal',
          assetIds: [assetId],
          payload: {},
        }),
      ],
    });
    const executingToolCall = makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Executing });
    const completedToolCall = makeToolCall({ sessionId: session.id });
    sessionRepository.getById.mockResolvedValue(session);
    sessionRepository.update.mockResolvedValue({ ...session, status: AgentSessionStatus.WaitingForPlanReview });
    planRepository.createReplacementRevision.mockResolvedValue(plan);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
    toolCallRepository.create.mockResolvedValue(executingToolCall);
    toolCallRepository.transition.mockResolvedValue(completedToolCall);

    const result = await sut.proposeAlbumOperations(auth, session.id, {
      summary: 'Portugal plan.',
      operations: [
        {
          type: AgentOperationType.AlbumCreate,
          summary: 'Create Portugal.',
          targetKind: AgentOperationTargetKind.NewAlbum,
          temporaryTargetId: 'tmp-portugal',
          payload: { albumName: 'Portugal', description: '' },
          enabled: true,
          riskLevel: AgentOperationRiskLevel.Low,
        },
        {
          type: AgentOperationType.AlbumAddAssets,
          summary: 'Add beach photo.',
          targetKind: AgentOperationTargetKind.NewAlbum,
          temporaryTargetId: 'tmp-portugal',
          assetIds: [assetId],
          payload: {},
          enabled: true,
          riskLevel: AgentOperationRiskLevel.Low,
        },
      ],
    });

    expect(result.status).toBe('success');
    expect(planRepository.createReplacementRevision).toHaveBeenCalledWith(session.id, {
      plan: { sessionId: session.id, status: AgentOperationPlanStatus.Proposed, summary: 'Portugal plan.' },
      operations: [
        expect.objectContaining({
          type: AgentOperationType.AlbumCreate,
          temporaryTargetId: 'tmp-portugal',
          dependencyIds: [],
        }),
        expect.objectContaining({
          type: AgentOperationType.AlbumAddAssets,
          temporaryTargetId: 'tmp-portugal',
          dependencyIds: [],
        }),
      ],
    });
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.WaitingForPlanReview,
    });
    expect(toolCallRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        toolName: AgentToolName.ProposeAlbumOperations,
        status: AgentToolCallStatus.Executing,
        approvalDecision: AgentToolApprovalDecision.Approved,
        dataClass: AgentToolDataClass.Plan,
        assetCount: 1,
        albumCount: 0,
        redactedResponseMetadata: null,
        completedAt: null,
        error: null,
        providerSnapshot: {
          providerCredentialId: session.credentialSnapshot.id,
          providerType: AgentProviderType.OpenAI,
          label: 'OpenAI personal',
          baseUrl: 'https://api.example.com/v1',
          model: 'gpt-5.1',
        },
      }),
    );
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      executingToolCall.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Completed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        redactedResponseMetadata: { planId: plan.id, operationIds: plan.operations.map((operation) => operation.id) },
        error: null,
      }),
    );
    expect(websocketRepository.clientSend).toHaveBeenCalledWith('on_agent_session_event', auth.user.id, {
      type: 'operation-plan-ready',
      sessionId: session.id,
      planId: plan.id,
      revision: plan.revision,
    });
  });

  it('rejects a new-album target without a matching album.create and does not persist', async () => {
    const auth = AuthFactory.create();
    const assetId = newUuid();
    const session = makeSession({ userId: auth.user.id });
    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
    const executingToolCall = makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Executing });
    toolCallRepository.create.mockResolvedValue(executingToolCall);

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Broken plan.',
        operations: [
          {
            type: AgentOperationType.AlbumAddAssets,
            summary: 'Add to missing new album.',
            targetKind: AgentOperationTargetKind.NewAlbum,
            temporaryTargetId: 'tmp-missing',
            assetIds: [assetId],
            payload: {},
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('No album.create operation found for temporaryTargetId: tmp-missing');
    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it('does not persist when creating the executing audit row fails', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id });
    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.create.mockRejectedValue(new Error('audit insert failed'));

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Portugal plan.',
        operations: [
          {
            type: AgentOperationType.AlbumCreate,
            summary: 'Create Portugal.',
            targetKind: AgentOperationTargetKind.NewAlbum,
            temporaryTargetId: 'tmp-portugal',
            payload: { albumName: 'Portugal', description: '' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('audit insert failed');
    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
    expect(sessionRepository.update).not.toHaveBeenCalled();
  });

  it('transitions the executing audit row to failed when repository persistence fails', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id });
    const executingToolCall = makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Executing });
    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.create.mockResolvedValue(executingToolCall);
    planRepository.createReplacementRevision.mockRejectedValue(new Error('database unavailable'));

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Portugal plan.',
        operations: [
          {
            type: AgentOperationType.AlbumCreate,
            summary: 'Create Portugal.',
            targetKind: AgentOperationTargetKind.NewAlbum,
            temporaryTargetId: 'tmp-portugal',
            payload: { albumName: 'Portugal', description: '' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('database unavailable');
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      executingToolCall.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Failed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        responseSummary: null,
        redactedResponseMetadata: null,
        error: 'database unavailable',
      }),
    );
    expect(sessionRepository.update).not.toHaveBeenCalled();
  });

  it('audits denied for inaccessible existing album targets', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const session = makeSession({ userId: auth.user.id });
    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set());
    const executingToolCall = makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Executing });
    toolCallRepository.create.mockResolvedValue(executingToolCall);

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Denied plan.',
        operations: [
          {
            type: AgentOperationType.AlbumUpdateDetails,
            summary: 'Rename inaccessible album.',
            targetKind: AgentOperationTargetKind.ExistingAlbum,
            targetId: albumId,
            payload: { albumName: 'Private album' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('One or more target albums are not accessible');
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      executingToolCall.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        error: 'One or more target albums are not accessible',
      }),
    );
    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it('audits denied for inaccessible asset ids', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const assetId = newUuid();
    const session = makeSession({ userId: auth.user.id });
    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set());
    const executingToolCall = makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Executing });
    toolCallRepository.create.mockResolvedValue(executingToolCall);

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Denied plan.',
        operations: [
          {
            type: AgentOperationType.AlbumAddAssets,
            summary: 'Add inaccessible asset.',
            targetKind: AgentOperationTargetKind.ExistingAlbum,
            targetId: albumId,
            assetIds: [assetId],
            payload: {},
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('One or more assets are not accessible');
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      executingToolCall.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        error: 'One or more assets are not accessible',
      }),
    );
    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it('rejects duplicate create temporary target ids', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id });
    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.create.mockResolvedValue(
      makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Denied }),
    );

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Broken plan.',
        operations: [
          {
            type: AgentOperationType.AlbumCreate,
            summary: 'Create one.',
            targetKind: AgentOperationTargetKind.NewAlbum,
            temporaryTargetId: 'tmp-dup',
            payload: { albumName: 'One', description: '' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
          {
            type: AgentOperationType.AlbumCreate,
            summary: 'Create two.',
            targetKind: AgentOperationTargetKind.NewAlbum,
            temporaryTargetId: 'tmp-dup',
            payload: { albumName: 'Two', description: '' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it('rejects a write-scope disabled operation type', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const assetId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: {
        ...permissionPlanSnapshot,
        writeScope: { ...permissionPlanSnapshot.writeScope, addAssets: false },
      },
    });
    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
    toolCallRepository.create.mockResolvedValue(
      makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Denied }),
    );

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Denied plan.',
        operations: [
          {
            type: AgentOperationType.AlbumAddAssets,
            summary: 'Add to existing album.',
            targetKind: AgentOperationTargetKind.ExistingAlbum,
            targetId: albumId,
            assetIds: [assetId],
            payload: {},
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('Agent permission policy does not allow adding assets to albums');
  });

  it('normalizes missing expanded write-scope keys to false before operation permission checks', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const assetId = newUuid();
    const legacyPermissionPlan: AgentPermissionPlanSnapshot = {
      ...permissionPlanSnapshot,
      writeScope: { createAlbum: true, addAssets: true, updateDetails: true, setCover: true },
    };
    const session = makeSession({ userId: auth.user.id, permissionPlanSnapshot: legacyPermissionPlan });
    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
    toolCallRepository.create.mockResolvedValue(
      makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Denied }),
    );

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Denied plan.',
        operations: [
          {
            type: AgentOperationType.AlbumRemoveAssets,
            summary: 'Remove from existing album.',
            targetKind: AgentOperationTargetKind.ExistingAlbum,
            targetId: albumId,
            assetIds: [assetId],
            payload: {},
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('Agent permission policy does not allow removing assets from albums');
    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it.each([
    {
      field: 'createSpace',
      operation: {
        type: AgentOperationType.SpaceCreate,
        summary: 'Create space.',
        targetKind: AgentOperationTargetKind.NewSpace,
        temporaryTargetId: 'tmp-space',
        payload: { spaceName: 'Trip' },
      },
      error: 'Agent permission policy does not allow creating spaces',
    },
    {
      field: 'addAssetsToSpaces',
      operation: {
        type: AgentOperationType.SpaceAddAssets,
        summary: 'Add to space.',
        targetKind: AgentOperationTargetKind.ExistingSpace,
        targetId: newUuid(),
        assetIds: [newUuid()],
        payload: {},
      },
      error: 'Agent permission policy does not allow adding assets to spaces',
    },
    {
      field: 'removeAssetsFromSpaces',
      operation: {
        type: AgentOperationType.SpaceRemoveAssets,
        summary: 'Remove from space.',
        targetKind: AgentOperationTargetKind.ExistingSpace,
        targetId: newUuid(),
        assetIds: [newUuid()],
        payload: {},
      },
      error: 'Agent permission policy does not allow removing assets from spaces',
    },
    {
      field: 'updateSpaceDetails',
      operation: {
        type: AgentOperationType.SpaceUpdateDetails,
        summary: 'Rename space.',
        targetKind: AgentOperationTargetKind.ExistingSpace,
        targetId: newUuid(),
        payload: { spaceName: 'Trip' },
      },
      error: 'Agent permission policy does not allow updating space details',
    },
    {
      field: 'editAssets',
      operation: {
        type: AgentOperationType.AssetRotate,
        summary: 'Rotate.',
        targetKind: AgentOperationTargetKind.ImageEditBatch,
        assetIds: [newUuid()],
        payload: { angle: 90 },
      },
      error: 'Agent permission policy does not allow editing assets',
    },
    {
      field: 'favoriteAssets',
      operation: {
        type: AgentOperationType.AssetSetFavorite,
        summary: 'Favorite.',
        targetKind: AgentOperationTargetKind.AssetBatch,
        assetIds: [newUuid()],
        payload: { favorite: true },
      },
      error: 'Agent permission policy does not allow changing asset favorites',
    },
    {
      field: 'archiveAssets',
      operation: {
        type: AgentOperationType.AssetSetArchive,
        summary: 'Archive.',
        targetKind: AgentOperationTargetKind.AssetBatch,
        assetIds: [newUuid()],
        payload: { archived: true },
      },
      error: 'Agent permission policy does not allow archiving assets',
    },
    {
      field: 'tagAssets',
      operation: {
        type: AgentOperationType.AssetAddTag,
        summary: 'Tag.',
        targetKind: AgentOperationTargetKind.AssetBatch,
        assetIds: [newUuid()],
        payload: { tagName: 'Receipts' },
      },
      error: 'Agent permission policy does not allow tagging assets',
    },
  ])('rejects %s write-scope disabled operation type', async ({ field, operation, error }) => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: {
        ...expandedPermissionPlanSnapshot,
        writeScope: { ...expandedWriteScope, [field]: false },
      },
    });
    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.create.mockResolvedValue(
      makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Denied }),
    );

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Denied plan.',
        operations: [{ ...operation, enabled: true, riskLevel: AgentOperationRiskLevel.Low } as never],
      }),
    ).rejects.toThrow(error);

    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it('revises only a proposed current plan owned by the session and stores a replacement revision', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id });
    const oldPlan = makePlan({ sessionId: session.id });
    const newPlan = makePlan({ sessionId: session.id, revision: 2 });
    sessionRepository.getById.mockResolvedValue(session);
    sessionRepository.update.mockResolvedValue({ ...session, status: AgentSessionStatus.WaitingForPlanReview });
    planRepository.getByIdForSession.mockResolvedValue(oldPlan);
    planRepository.getCurrentBySessionId.mockResolvedValue(oldPlan);
    planRepository.createReplacementRevision.mockResolvedValue(newPlan);
    toolCallRepository.create.mockResolvedValue(
      makeToolCall({ sessionId: session.id, toolName: AgentToolName.ReviseProposedOperations }),
    );

    await expect(
      sut.reviseProposedOperations(auth, session.id, oldPlan.id, {
        feedback: 'Rename it.',
        summary: 'Revised plan.',
        operations: [
          {
            type: AgentOperationType.AlbumCreate,
            summary: 'Create Portugal renamed.',
            targetKind: AgentOperationTargetKind.NewAlbum,
            temporaryTargetId: 'tmp-portugal',
            payload: { albumName: 'Portugal highlights', description: '' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).resolves.toMatchObject({ status: 'success', plan: { id: newPlan.id, revision: 2 } });
    expect(planRepository.createReplacementRevision).toHaveBeenCalledWith(
      session.id,
      expect.objectContaining({
        plan: { sessionId: session.id, status: AgentOperationPlanStatus.Proposed, summary: 'Revised plan.' },
      }),
    );
  });

  it('audits denied with plan metadata when revising a superseded plan', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id });
    const supersededPlan = makePlan({ sessionId: session.id, status: AgentOperationPlanStatus.Superseded });
    const executingToolCall = makeToolCall({
      sessionId: session.id,
      toolName: AgentToolName.ReviseProposedOperations,
      status: AgentToolCallStatus.Executing,
    });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(supersededPlan);
    planRepository.getCurrentBySessionId.mockResolvedValue(supersededPlan);
    toolCallRepository.create.mockResolvedValue(executingToolCall);

    await expect(
      sut.reviseProposedOperations(auth, session.id, supersededPlan.id, {
        summary: 'Invalid revision.',
        operations: [
          {
            type: AgentOperationType.AlbumCreate,
            summary: 'Create duplicate revision.',
            targetKind: AgentOperationTargetKind.NewAlbum,
            temporaryTargetId: 'tmp-invalid',
            payload: { albumName: 'Invalid', description: '' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(toolCallRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: AgentToolName.ReviseProposedOperations,
        status: AgentToolCallStatus.Executing,
        redactedRequestMetadata: expect.objectContaining({ planId: supersededPlan.id }),
      }),
    );
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      executingToolCall.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        error: 'Agent operation plan not found',
      }),
    );
    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it('accepts shared editor albums when shared-space scope is enabled', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: {
        ...permissionPlanSnapshot,
        assetScope: { ...permissionPlanSnapshot.assetScope, owned: false, sharedSpaces: true },
      },
    });
    const plan = makePlan({ sessionId: session.id });
    sessionRepository.getById.mockResolvedValue(session);
    sessionRepository.update.mockResolvedValue({ ...session, status: AgentSessionStatus.WaitingForPlanReview });
    accessRepository.album.checkSharedAlbumAccess.mockResolvedValue(new Set([albumId]));
    planRepository.createReplacementRevision.mockResolvedValue(plan);
    toolCallRepository.create.mockResolvedValue(makeToolCall({ sessionId: session.id }));

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Shared plan.',
        operations: [
          {
            type: AgentOperationType.AlbumUpdateDetails,
            summary: 'Rename shared album.',
            targetKind: AgentOperationTargetKind.ExistingAlbum,
            targetId: albumId,
            payload: { albumName: 'Shared album' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).resolves.toMatchObject({ status: 'success' });
    expect(accessRepository.album.checkSharedAlbumAccess).toHaveBeenCalled();
    expect(planRepository.createReplacementRevision).toHaveBeenCalled();
  });

  it('accepts shared assets when shared-space scope is enabled', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const assetId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: {
        ...permissionPlanSnapshot,
        assetScope: { ...permissionPlanSnapshot.assetScope, sharedSpaces: true },
      },
    });
    const plan = makePlan({ sessionId: session.id });
    sessionRepository.getById.mockResolvedValue(session);
    sessionRepository.update.mockResolvedValue({ ...session, status: AgentSessionStatus.WaitingForPlanReview });
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set());
    accessRepository.asset.checkSpaceAccess.mockResolvedValue(new Set([assetId]));
    assetRepository.getAgentLockedIds.mockResolvedValue(new Set());
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set([assetId]));
    planRepository.createReplacementRevision.mockResolvedValue(plan);
    toolCallRepository.create.mockResolvedValue(makeToolCall({ sessionId: session.id }));

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Shared asset plan.',
        operations: [
          {
            type: AgentOperationType.AlbumAddAssets,
            summary: 'Add shared asset.',
            targetKind: AgentOperationTargetKind.ExistingAlbum,
            targetId: albumId,
            assetIds: [assetId],
            payload: {},
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).resolves.toMatchObject({ status: 'success' });
    expect(accessRepository.asset.checkSpaceAccess).toHaveBeenCalled();
    expect(planRepository.createReplacementRevision).toHaveBeenCalled();
  });

  it('rejects proposed operations when the session stops accepting revisions after validation', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const assetId = newUuid();
    const session = makeSession({ userId: auth.user.id });
    const executingToolCall = makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Executing });
    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
    assetRepository.getAgentLockedIds.mockResolvedValue(new Set());
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set([assetId]));
    planRepository.createReplacementRevision.mockResolvedValue(null as unknown as AgentOperationPlanWithOperations);
    toolCallRepository.create.mockResolvedValue(executingToolCall);

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Late plan.',
        operations: [
          {
            type: AgentOperationType.AlbumAddAssets,
            summary: 'Add late asset.',
            targetKind: AgentOperationTargetKind.ExistingAlbum,
            targetId: albumId,
            assetIds: [assetId],
            payload: {},
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('Agent session is not accepting plan revisions');
    expect(sessionRepository.update).not.toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.WaitingForPlanReview,
    });
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      executingToolCall.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    );
  });

  it('denies locked assets without locked scope and elevated permission', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const assetId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: {
        ...permissionPlanSnapshot,
        assetScope: { owned: true, sharedSpaces: true, locked: false },
      },
    });
    const executingToolCall = makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Executing });
    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
    accessRepository.asset.checkSpaceAccess.mockResolvedValue(new Set([assetId]));
    assetRepository.getAgentLockedIds.mockResolvedValue(new Set([assetId]));
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set());
    toolCallRepository.create.mockResolvedValue(executingToolCall);

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Locked asset plan.',
        operations: [
          {
            type: AgentOperationType.AlbumAddAssets,
            summary: 'Add locked asset.',
            targetKind: AgentOperationTargetKind.ExistingAlbum,
            targetId: albumId,
            assetIds: [assetId],
            payload: {},
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('One or more assets are not accessible');
    expect(accessRepository.asset.checkOwnerAccess).toHaveBeenCalledWith(auth.user.id, new Set([assetId]), false);
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      executingToolCall.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    );
    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it('allows locked assets with locked scope and elevated permission', async () => {
    const auth = AuthFactory.from().session({ hasElevatedPermission: true }).build();
    const albumId = newUuid();
    const assetId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: {
        ...permissionPlanSnapshot,
        assetScope: { owned: true, sharedSpaces: false, locked: true },
      },
    });
    const plan = makePlan({ sessionId: session.id });
    sessionRepository.getById.mockResolvedValue(session);
    sessionRepository.update.mockResolvedValue({ ...session, status: AgentSessionStatus.WaitingForPlanReview });
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set([assetId]));
    planRepository.createReplacementRevision.mockResolvedValue(plan);
    toolCallRepository.create.mockResolvedValue(makeToolCall({ sessionId: session.id }));

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Locked asset plan.',
        operations: [
          {
            type: AgentOperationType.AlbumAddAssets,
            summary: 'Add locked asset.',
            targetKind: AgentOperationTargetKind.ExistingAlbum,
            targetId: albumId,
            assetIds: [assetId],
            payload: {},
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).resolves.toMatchObject({ status: 'success' });
    expect(accessRepository.asset.checkOwnerAccess).toHaveBeenCalledWith(auth.user.id, new Set([assetId]), true);
    expect(planRepository.createReplacementRevision).toHaveBeenCalled();
  });

  it('returns null when no current plan exists', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getCurrentBySessionId.mockImplementation(() => Promise.resolve(void 0));

    await expect(sut.getCurrentPlan(auth, session.id)).resolves.toBeNull();
  });

  it('returns applied plans through history while current plan remains proposed-only', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.Running });
    const appliedPlan = makePlan({
      sessionId: session.id,
      status: AgentOperationPlanStatus.Applied,
      operations: [makeOperation({ status: AgentOperationStatus.Applied, result: { albumId: newUuid() } })],
    });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getCurrentBySessionId.mockResolvedValue(void 0);
    planRepository.getAppliedBySessionId.mockResolvedValue([appliedPlan]);

    await expect(sut.getCurrentPlan(auth, session.id)).resolves.toBeNull();
    await expect(sut.getAppliedPlans(auth, session.id)).resolves.toEqual([
      expect.objectContaining({ id: appliedPlan.id, status: AgentOperationPlanStatus.Applied }),
    ]);
  });

  it('throws not found for sessions not owned by the user', async () => {
    const auth = AuthFactory.create();
    sessionRepository.getById.mockImplementation(() => Promise.resolve(void 0));

    await expect(sut.getCurrentPlan(auth, newUuid())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects proposal writes for terminal sessions', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.Completed });
    sessionRepository.getById.mockResolvedValue(session);

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Late plan.',
        operations: [
          {
            type: AgentOperationType.AlbumCreate,
            summary: 'Create too late.',
            targetKind: AgentOperationTargetKind.NewAlbum,
            temporaryTargetId: 'tmp-late',
            payload: { albumName: 'Too late', description: '' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('Agent session is not active');
    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it('proposes another plan after an applied plan without hiding applied history', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.Running });
    const appliedPlan = makePlan({ sessionId: session.id, status: AgentOperationPlanStatus.Applied, revision: 1 });
    const proposedPlan = makePlan({ sessionId: session.id, status: AgentOperationPlanStatus.Proposed, revision: 2 });
    const executingToolCall = makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Executing });
    const completedToolCall = makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Completed });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.createReplacementRevision.mockResolvedValue(proposedPlan);
    planRepository.getAppliedBySessionId.mockResolvedValue([appliedPlan]);
    toolCallRepository.create.mockResolvedValue(executingToolCall);
    toolCallRepository.transition.mockResolvedValue(completedToolCall);

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Follow-up plan.',
        operations: [
          {
            type: AgentOperationType.AlbumCreate,
            summary: 'Create the next album.',
            targetKind: AgentOperationTargetKind.NewAlbum,
            temporaryTargetId: 'tmp-next',
            payload: { albumName: 'Next album', description: '' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).resolves.toMatchObject({
      status: 'success',
      plan: { id: proposedPlan.id, status: AgentOperationPlanStatus.Proposed, revision: 2 },
    });
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.WaitingForPlanReview,
    });
    await expect(sut.getAppliedPlans(auth, session.id)).resolves.toEqual([
      expect.objectContaining({ id: appliedPlan.id, status: AgentOperationPlanStatus.Applied }),
    ]);
  });

  it('rejects revisions for superseded plans', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id });
    const supersededPlan = makePlan({ sessionId: session.id, status: AgentOperationPlanStatus.Superseded });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(supersededPlan);
    planRepository.getCurrentBySessionId.mockResolvedValue(supersededPlan);
    toolCallRepository.create.mockResolvedValue(
      makeToolCall({
        sessionId: session.id,
        toolName: AgentToolName.ReviseProposedOperations,
        status: AgentToolCallStatus.Executing,
      }),
    );

    await expect(
      sut.reviseProposedOperations(auth, session.id, supersededPlan.id, {
        summary: 'Invalid revision.',
        operations: [
          {
            type: AgentOperationType.AlbumCreate,
            summary: 'Create duplicate revision.',
            targetKind: AgentOperationTargetKind.NewAlbum,
            temporaryTargetId: 'tmp-invalid',
            payload: { albumName: 'Invalid', description: '' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it('audits denied with plan metadata when summarizing a missing or non-current plan', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id });
    const requestedPlanId = newUuid();
    const currentPlan = makePlan({ sessionId: session.id });
    const executingToolCall = makeToolCall({
      sessionId: session.id,
      toolName: AgentToolName.SummarizePlan,
      status: AgentToolCallStatus.Executing,
    });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(void 0);
    planRepository.getCurrentBySessionId.mockResolvedValue(currentPlan);
    toolCallRepository.create.mockResolvedValue(executingToolCall);

    await expect(sut.summarizePlan(auth, session.id, requestedPlanId, { focus: 'risk' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(toolCallRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: AgentToolName.SummarizePlan,
        status: AgentToolCallStatus.Executing,
        redactedRequestMetadata: expect.objectContaining({ planId: requestedPlanId }),
      }),
    );
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      executingToolCall.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        error: 'Agent operation plan not found',
      }),
    );
  });

  it('summarizes the current plan and writes a completed planning audit row', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id });
    const plan = makePlan({ sessionId: session.id });
    const executingToolCall = makeToolCall({
      sessionId: session.id,
      toolName: AgentToolName.SummarizePlan,
      status: AgentToolCallStatus.Executing,
    });
    const completedToolCall = makeToolCall({ sessionId: session.id, toolName: AgentToolName.SummarizePlan });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    toolCallRepository.create.mockResolvedValue(executingToolCall);
    toolCallRepository.transition.mockResolvedValue(completedToolCall);

    const result = await sut.summarizePlan(auth, session.id, plan.id, { focus: 'risk' });

    expect(result).toMatchObject({ status: 'success', plan: { id: plan.id }, toolCall: { id: completedToolCall.id } });
    expect(toolCallRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        toolName: AgentToolName.SummarizePlan,
        status: AgentToolCallStatus.Executing,
        approvalDecision: AgentToolApprovalDecision.Approved,
        dataClass: AgentToolDataClass.Plan,
        redactedRequestMetadata: { planId: plan.id, operationCount: 0, operationTypes: [], albumIds: [], assetIds: [] },
        redactedResponseMetadata: null,
      }),
    );
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      executingToolCall.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Completed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        redactedResponseMetadata: { planId: plan.id, operationIds: plan.operations.map((operation) => operation.id) },
        error: null,
      }),
    );
  });

  it('summarizes an already-applied current plan and writes a completed planning audit row', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.Completed });
    const plan = makePlan({ sessionId: session.id, status: AgentOperationPlanStatus.Applied });
    const executingToolCall = makeToolCall({
      sessionId: session.id,
      toolName: AgentToolName.SummarizePlan,
      status: AgentToolCallStatus.Executing,
    });
    const completedToolCall = makeToolCall({ sessionId: session.id, toolName: AgentToolName.SummarizePlan });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    toolCallRepository.create.mockResolvedValue(executingToolCall);
    toolCallRepository.transition.mockResolvedValue(completedToolCall);

    const result = await sut.summarizePlan(auth, session.id, plan.id, { focus: 'applied operations' });

    expect(result).toMatchObject({
      status: 'success',
      plan: { id: plan.id, status: AgentOperationPlanStatus.Applied },
      toolCall: { id: completedToolCall.id },
    });
    expect(toolCallRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        toolName: AgentToolName.SummarizePlan,
        status: AgentToolCallStatus.Executing,
        approvalDecision: AgentToolApprovalDecision.Approved,
        dataClass: AgentToolDataClass.Plan,
        redactedRequestMetadata: { planId: plan.id, operationCount: 0, operationTypes: [], albumIds: [], assetIds: [] },
        redactedResponseMetadata: null,
      }),
    );
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      executingToolCall.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Completed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        redactedResponseMetadata: { planId: plan.id, operationIds: plan.operations.map((operation) => operation.id) },
        error: null,
      }),
    );
  });

  it('rejects stale plan revisions before claiming the plan', async () => {
    const auth = AuthFactory.create();
    const { session, operation, plan } = makeAddAssetsPlan(auth, [newUuid()]);
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [operation.id],
        planRevision: plan.revision + 1,
      }),
    ).rejects.toThrow('Agent operation plan revision is stale');

    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
    expect(albumService.addAssets).not.toHaveBeenCalled();
  });

  it('rejects sparse selections for operation ids outside the selected operation set', async () => {
    const auth = AuthFactory.create();
    const assetId = newUuid();
    const { session, operation, plan } = makeAddAssetsPlan(auth, [assetId]);
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [operation.id],
        itemSelections: {
          [newUuid()]: { itemKind: 'asset', mode: 'allExcept', itemIds: [assetId] },
        },
      }),
    ).rejects.toThrow('One or more item selection operation ids are not selected');

    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
  });

  it('rejects field overrides for operation ids outside the current plan before selected-set validation', async () => {
    const auth = AuthFactory.create();
    const { session, operation, plan } = makeAddAssetsPlan(auth, [newUuid()]);
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [operation.id],
        fieldOverrides: {
          [newUuid()]: { albumName: 'Portugal highlights' },
        },
      }),
    ).rejects.toThrow('One or more field override operation ids are not in the current plan');

    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
  });

  it('rejects field overrides for operation ids outside the selected operation set', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const selectedOperation = makeOperation({ id: newUuid(), planId: 'plan-id' });
    const unselectedOperation = makeOperation({ id: newUuid(), planId: 'plan-id', position: 1 });
    const plan = makePlan({
      id: 'plan-id',
      sessionId: session.id,
      operations: [selectedOperation, unselectedOperation],
    });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [selectedOperation.id],
        fieldOverrides: {
          [unselectedOperation.id]: { albumName: 'Portugal highlights' },
        },
      }),
    ).rejects.toThrow('One or more field override operation ids are not selected');

    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
  });

  it('rejects sparse selections containing asset ids outside the operation affected set', async () => {
    const auth = AuthFactory.create();
    const assetId = newUuid();
    const { session, operation, plan } = makeAddAssetsPlan(auth, [assetId]);
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [operation.id],
        itemSelections: {
          [operation.id]: { itemKind: 'asset', mode: 'only', itemIds: [newUuid()] },
        },
      }),
    ).rejects.toThrow('One or more selected item ids are not affected by the operation');

    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
  });

  it('rejects sparse selections for operations without affected assets', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const createOperation = makeOperation({ id: newUuid(), planId: 'plan-id', temporaryTargetId: 'tmp-portugal' });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [createOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [createOperation.id],
        itemSelections: {
          [createOperation.id]: { itemKind: 'asset', mode: 'only', itemIds: [newUuid()] },
        },
      }),
    ).rejects.toThrow('Item selection is not supported for one or more operations');

    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
  });

  it('applies add-assets operations with filtered allExcept asset ids', async () => {
    const auth = AuthFactory.create();
    const keptAssetId = newUuid();
    const excludedAssetId = newUuid();
    const { session, albumId, operation, plan } = makeAddAssetsPlan(auth, [keptAssetId, excludedAssetId]);
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        {
          ...operation,
          status: AgentOperationStatus.Applied,
          result: { albumId, assetIds: [keptAssetId], assetResults: [{ id: keptAssetId, success: true }] },
        },
      ],
    });
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([keptAssetId]));
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set([keptAssetId]));
    albumService.addAssets.mockResolvedValue([{ id: keptAssetId, success: true }]);

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [operation.id],
      itemSelections: {
        [operation.id]: { itemKind: 'asset', mode: 'allExcept', itemIds: [excludedAssetId] },
      },
      planRevision: plan.revision,
    });

    expect(result.status).toBe(AgentOperationApplyStatus.Applied);
    expect(accessRepository.asset.checkOwnerAccess).toHaveBeenCalledWith(auth.user.id, new Set([keptAssetId]), false);
    expect(albumService.addAssets).toHaveBeenCalledWith(auth, albumId, { ids: [keptAssetId] });
  });

  it('skips an asset operation when sparse selection leaves no selected assets', async () => {
    const auth = AuthFactory.create();
    const assetId = newUuid();
    const { session, operation, plan } = makeAddAssetsPlan(auth, [assetId]);
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        {
          ...operation,
          status: AgentOperationStatus.Skipped,
          result: { skippedReason: 'No selected items for operation' },
        },
      ],
    });

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [operation.id],
      itemSelections: {
        [operation.id]: { itemKind: 'asset', mode: 'allExcept', itemIds: [assetId] },
      },
    });

    expect(result.status).toBe(AgentOperationApplyStatus.Failed);
    expect(result.skippedOperationIds).toEqual([operation.id]);
    expect(planRepository.completeApply).toHaveBeenCalledWith(plan.id, [
      expect.objectContaining({
        id: operation.id,
        status: AgentOperationStatus.Skipped,
        result: { skippedReason: 'No selected items for operation' },
      }),
    ]);
    expect(albumService.addAssets).not.toHaveBeenCalled();
  });

  it('skips a cover operation when its cover asset is excluded', async () => {
    const auth = AuthFactory.create();
    const assetId = newUuid();
    const albumId = newUuid();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const coverOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AlbumSetCover,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: albumId,
      temporaryTargetId: null,
      assetIds: [assetId],
      payload: {},
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [coverOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        {
          ...coverOperation,
          status: AgentOperationStatus.Skipped,
          result: { skippedReason: 'No selected items for operation' },
        },
      ],
    });

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [coverOperation.id],
      itemSelections: {
        [coverOperation.id]: { itemKind: 'asset', mode: 'allExcept', itemIds: [assetId] },
      },
    });

    expect(result.skippedOperationIds).toEqual([coverOperation.id]);
    expect(planRepository.completeApply).toHaveBeenCalledWith(plan.id, [
      expect.objectContaining({
        id: coverOperation.id,
        status: AgentOperationStatus.Skipped,
        result: { skippedReason: 'No selected items for operation' },
      }),
    ]);
    expect(albumService.update).not.toHaveBeenCalled();
  });

  it('skips a dependent operation when its dependency has no selected items', async () => {
    const auth = AuthFactory.create();
    const assetId = newUuid();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const addOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AlbumAddAssets,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: newUuid(),
      temporaryTargetId: null,
      assetIds: [assetId],
      payload: {},
    });
    const coverOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      position: 1,
      type: AgentOperationType.AlbumSetCover,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: addOperation.targetId,
      temporaryTargetId: null,
      assetIds: [assetId],
      payload: {},
      dependencyIds: [addOperation.id],
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [addOperation, coverOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        {
          ...addOperation,
          status: AgentOperationStatus.Skipped,
          result: { skippedReason: 'No selected items for operation' },
        },
        {
          ...coverOperation,
          status: AgentOperationStatus.Skipped,
          result: { skippedReason: 'Dependency was not applied' },
        },
      ],
    });

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [addOperation.id, coverOperation.id],
      itemSelections: {
        [addOperation.id]: { itemKind: 'asset', mode: 'none' },
      },
    });

    expect(result.skippedOperationIds).toEqual([addOperation.id, coverOperation.id]);
    expect(planRepository.completeApply).toHaveBeenCalledWith(plan.id, [
      expect.objectContaining({
        id: addOperation.id,
        status: AgentOperationStatus.Skipped,
        result: { skippedReason: 'No selected items for operation' },
      }),
      expect.objectContaining({
        id: coverOperation.id,
        status: AgentOperationStatus.Skipped,
        result: { skippedReason: 'Dependency was not applied' },
      }),
    ]);
    expect(albumService.addAssets).not.toHaveBeenCalled();
    expect(albumService.update).not.toHaveBeenCalled();
  });

  it('applies selected album operations in stored order and returns the session to running', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const albumId = newUuid();
    const assetId = newUuid();
    const createOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      position: 0,
      type: AgentOperationType.AlbumCreate,
      temporaryTargetId: 'tmp-portugal',
      payload: { albumName: 'Portugal', description: 'Lisbon and Porto' },
    });
    const addOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      position: 1,
      type: AgentOperationType.AlbumAddAssets,
      targetKind: AgentOperationTargetKind.NewAlbum,
      temporaryTargetId: 'tmp-portugal',
      assetIds: [assetId],
      payload: {},
      dependencyIds: [createOperation.id],
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [createOperation, addOperation] });
    const appliedPlan = makePlan({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        { ...createOperation, status: AgentOperationStatus.Applied, result: { albumId } },
        { ...addOperation, status: AgentOperationStatus.Applied, result: { albumId, assetIds: [assetId] } },
      ],
    });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue(appliedPlan);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set([assetId]));
    albumService.create.mockResolvedValue({ id: albumId } as never);
    albumService.addAssets.mockResolvedValue([{ id: assetId, success: true }]);

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [createOperation.id, addOperation.id],
    });

    expect(result).toMatchObject({
      status: AgentOperationApplyStatus.Applied,
      appliedOperationIds: [createOperation.id, addOperation.id],
      skippedOperationIds: [],
      failedOperationIds: [],
      plan: { id: plan.id, status: AgentOperationPlanStatus.Applied },
    });
    expect(albumService.create).toHaveBeenCalledWith(auth, {
      albumName: 'Portugal',
      description: 'Lisbon and Porto',
      assetIds: [],
    });
    expect(albumService.addAssets).toHaveBeenCalledWith(auth, albumId, { ids: [assetId] });
    expect(planRepository.completeApply).toHaveBeenCalledWith(plan.id, [
      expect.objectContaining({ id: createOperation.id, status: AgentOperationStatus.Applied }),
      expect.objectContaining({ id: addOperation.id, status: AgentOperationStatus.Applied }),
    ]);
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.Running,
      endedAt: null,
    });
    expect(sessionRepository.update).not.toHaveBeenCalledWith(
      auth.user.id,
      session.id,
      expect.objectContaining({ status: AgentSessionStatus.Completed }),
    );
    expect(websocketRepository.clientSend).toHaveBeenCalledWith('on_agent_session_event', auth.user.id, {
      type: 'operation-plan-applied',
      sessionId: session.id,
      planId: plan.id,
      status: AgentOperationApplyStatus.Applied,
      appliedCount: 2,
      skippedCount: 0,
      failedCount: 0,
    });
  });

  it('emits aggregate apply progress activity events without exposing operation or asset ids', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const assetId = newUuid();
    const albumId = newUuid();
    const createOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      payload: { albumName: 'Portugal' },
    });
    const addOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AlbumAddAssets,
      targetKind: AgentOperationTargetKind.NewAlbum,
      temporaryTargetId: 'tmp-portugal',
      assetIds: [assetId],
      payload: {},
      dependencyIds: [createOperation.id],
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [createOperation, addOperation] });
    const appliedPlan = applyUpdatesToPlan(plan, [
      { id: createOperation.id, status: AgentOperationStatus.Applied, result: { albumId }, error: null },
      {
        id: addOperation.id,
        status: AgentOperationStatus.Applied,
        result: { albumId, assetIds: [assetId] },
        error: null,
      },
    ]);
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue(appliedPlan);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set([assetId]));
    albumService.create.mockResolvedValue({ id: albumId } as never);
    albumService.addAssets.mockResolvedValue([{ id: assetId, success: true }]);

    await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [createOperation.id, addOperation.id],
    });

    expect(activityEventService.createSystemEvent).toHaveBeenCalledWith(auth.user.id, session.id, {
      kind: AgentSessionActivityEventKind.ApplyProgress,
      status: AgentSessionActivityEventStatus.Running,
      counts: { total: 2, applied: 0, skipped: 0, failed: 0 },
    });
    expect(activityEventService.createSystemEvent).toHaveBeenCalledWith(auth.user.id, session.id, {
      kind: AgentSessionActivityEventKind.ApplyProgress,
      status: AgentSessionActivityEventStatus.Completed,
      counts: { total: 2, applied: 2, skipped: 0, failed: 0 },
    });
    expect(activityEventService.createSystemEvent).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        operationIds: expect.anything(),
        assetIds: expect.anything(),
      }),
    );
  });

  it('applies normalized album create field overrides before calling AlbumService.create', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const albumId = newUuid();
    const createOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      payload: { albumName: 'Portugal', description: 'Original description' },
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [createOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [{ ...createOperation, status: AgentOperationStatus.Applied, result: { albumId } }],
    });
    albumService.create.mockResolvedValue({ id: albumId } as never);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [createOperation.id],
        fieldOverrides: {
          [createOperation.id]: { albumName: '  Portugal highlights  ', description: '  Lisbon and Porto  ' },
        },
      }),
    ).resolves.toMatchObject({ status: AgentOperationApplyStatus.Applied });

    expect(albumService.create).toHaveBeenCalledWith(auth, {
      albumName: 'Portugal highlights',
      description: 'Lisbon and Porto',
      assetIds: [],
    });
  });

  it('applies normalized album update detail field overrides before calling AlbumService.update', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const albumId = newUuid();
    const updateOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AlbumUpdateDetails,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: albumId,
      temporaryTargetId: null,
      payload: { albumName: 'Portugal', description: 'Original description' },
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [updateOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [{ ...updateOperation, status: AgentOperationStatus.Applied, result: { albumId } }],
    });
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    albumService.update.mockResolvedValue({ id: albumId } as never);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [updateOperation.id],
        fieldOverrides: {
          [updateOperation.id]: { albumName: '  Portugal highlights  ', description: '' },
        },
      }),
    ).resolves.toMatchObject({ status: AgentOperationApplyStatus.Applied });

    expect(albumService.update).toHaveBeenCalledWith(auth, albumId, {
      albumName: 'Portugal highlights',
      description: '',
    });
  });

  it('applies album update target and text overrides together', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const originalAlbumId = newUuid();
    const overrideAlbumId = newUuid();
    const updateOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AlbumUpdateDetails,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: originalAlbumId,
      temporaryTargetId: null,
      payload: { albumName: 'Original album', description: 'Original description' },
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [updateOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockImplementation((planId, updates) =>
      Promise.resolve(applyUpdatesToPlan({ ...plan, id: planId }, updates)),
    );
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([overrideAlbumId]));
    albumService.update.mockResolvedValue({ id: overrideAlbumId } as never);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [updateOperation.id],
        fieldOverrides: {
          [updateOperation.id]: {
            targetAlbumId: overrideAlbumId,
            albumName: '  Portugal highlights  ',
            description: '  Lisbon and Porto  ',
          },
        },
      }),
    ).resolves.toMatchObject({ status: AgentOperationApplyStatus.Applied });

    expect(albumService.update).toHaveBeenCalledWith(auth, overrideAlbumId, {
      albumName: 'Portugal highlights',
      description: 'Lisbon and Porto',
    });
  });

  it('applies set-cover field overrides after sparse item selections and uses the override for access checks', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const albumId = newUuid();
    const firstCandidateId = newUuid();
    const overrideCandidateId = newUuid();
    const coverOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AlbumSetCover,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: albumId,
      temporaryTargetId: null,
      assetIds: [firstCandidateId, overrideCandidateId],
      payload: {},
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [coverOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        {
          ...coverOperation,
          status: AgentOperationStatus.Applied,
          result: { albumId, assetIds: [overrideCandidateId] },
        },
      ],
    });
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([overrideCandidateId]));
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set([overrideCandidateId]));
    albumService.update.mockResolvedValue({ id: albumId } as never);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [coverOperation.id],
        itemSelections: {
          [coverOperation.id]: { itemKind: 'asset', mode: 'allExcept', itemIds: [firstCandidateId] },
        },
        fieldOverrides: {
          [coverOperation.id]: { albumThumbnailAssetId: overrideCandidateId },
        },
      }),
    ).resolves.toMatchObject({ status: AgentOperationApplyStatus.Applied });

    expect(accessRepository.asset.checkOwnerAccess).toHaveBeenCalledWith(
      auth.user.id,
      new Set([overrideCandidateId]),
      false,
    );
    expect(albumService.update).toHaveBeenCalledWith(auth, albumId, { albumThumbnailAssetId: overrideCandidateId });
  });

  it('rejects invalid field overrides before claiming the plan', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const createOperation = makeOperation({ id: newUuid(), planId: 'plan-id' });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [createOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [createOperation.id],
        fieldOverrides: {
          [createOperation.id]: { albumName: '   ' },
        },
      }),
    ).rejects.toThrow('albumName must be 1-200 characters');

    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
    expect(albumService.create).not.toHaveBeenCalled();
  });

  it('rejects set-cover overrides that are not selected cover candidates before claiming the plan', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const albumId = newUuid();
    const selectedCandidateId = newUuid();
    const excludedCandidateId = newUuid();
    const coverOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AlbumSetCover,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: albumId,
      temporaryTargetId: null,
      assetIds: [selectedCandidateId, excludedCandidateId],
      payload: {},
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [coverOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [coverOperation.id],
        itemSelections: {
          [coverOperation.id]: { itemKind: 'asset', mode: 'only', itemIds: [selectedCandidateId] },
        },
        fieldOverrides: {
          [coverOperation.id]: { albumThumbnailAssetId: excludedCandidateId },
        },
      }),
    ).rejects.toThrow('albumThumbnailAssetId must be one of the selected cover candidates');

    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
    expect(albumService.update).not.toHaveBeenCalled();
  });

  it('skips unselected operations and selected dependents whose dependency was not applied', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const createOperation = makeOperation({ id: newUuid(), planId: 'plan-id', temporaryTargetId: 'tmp-portugal' });
    const addOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      position: 1,
      type: AgentOperationType.AlbumAddAssets,
      targetKind: AgentOperationTargetKind.NewAlbum,
      temporaryTargetId: 'tmp-portugal',
      assetIds: [newUuid()],
      payload: {},
      dependencyIds: [createOperation.id],
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [createOperation, addOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        {
          ...createOperation,
          status: AgentOperationStatus.Skipped,
          result: { skippedReason: 'Operation was not selected for apply' },
        },
        {
          ...addOperation,
          status: AgentOperationStatus.Skipped,
          result: { skippedReason: 'Dependency was not applied' },
        },
      ],
    });

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [addOperation.id] });

    expect(result.status).toBe(AgentOperationApplyStatus.Failed);
    expect(result.appliedOperationIds).toEqual([]);
    expect(result.skippedOperationIds).toEqual([createOperation.id, addOperation.id]);
    expect(albumService.create).not.toHaveBeenCalled();
    expect(albumService.addAssets).not.toHaveBeenCalled();
  });

  it('keeps the overall apply status applied when only unselected operations are skipped', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const selectedOperation = makeOperation({ id: newUuid(), planId: 'plan-id', temporaryTargetId: 'tmp-selected' });
    const unselectedOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      position: 1,
      temporaryTargetId: 'tmp-unselected',
    });
    const albumId = newUuid();
    const plan = makePlan({
      id: 'plan-id',
      sessionId: session.id,
      operations: [selectedOperation, unselectedOperation],
    });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        { ...selectedOperation, status: AgentOperationStatus.Applied, result: { albumId } },
        {
          ...unselectedOperation,
          status: AgentOperationStatus.Skipped,
          result: { skippedReason: 'Operation was not selected for apply' },
        },
      ],
    });
    albumService.create.mockResolvedValue({ id: albumId } as never);

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [selectedOperation.id],
    });

    expect(result.status).toBe(AgentOperationApplyStatus.Applied);
    expect(result.appliedOperationIds).toEqual([selectedOperation.id]);
    expect(result.skippedOperationIds).toEqual([unselectedOperation.id]);
    expect(result.failedOperationIds).toEqual([]);
  });

  it('marks the session failed and rethrows when completing a claimed apply crashes', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const operation = makeOperation({ id: newUuid(), planId: 'plan-id', temporaryTargetId: 'tmp-portugal' });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [operation] });
    const error = new Error('complete apply failed');
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockRejectedValue(error);
    albumService.create.mockResolvedValue({ id: newUuid() } as never);

    await expect(sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [operation.id] })).rejects.toBe(
      error,
    );
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.Failed,
      endedAt: expect.any(Date),
    });
    expect(websocketRepository.clientSend).not.toHaveBeenCalledWith(
      'on_agent_session_event',
      auth.user.id,
      expect.objectContaining({ type: 'operation-plan-applied' }),
    );
  });

  it('rejects unknown operation ids before claiming the plan', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const plan = makePlan({ sessionId: session.id });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [newUuid()] })).rejects.toThrow(
      'One or more operation ids are not in the current plan',
    );
    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
    expect(albumService.create).not.toHaveBeenCalled();
  });

  it('rejects non-current plans before claiming the plan', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const staleOperation = makeOperation();
    const stalePlan = makePlan({ id: newUuid(), sessionId: session.id, operations: [staleOperation] });
    const currentPlan = makePlan({ id: newUuid(), sessionId: session.id, revision: 2 });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(stalePlan);
    planRepository.getCurrentBySessionId.mockResolvedValue(currentPlan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, stalePlan.id, { operationIds: [staleOperation.id] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
    expect(albumService.create).not.toHaveBeenCalled();
  });

  it('rejects stored-disabled operation ids before claiming the plan', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const disabledOperation = makeOperation({ enabled: false });
    const plan = makePlan({ sessionId: session.id, operations: [disabledOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [disabledOperation.id] }),
    ).rejects.toThrow('One or more operation ids are disabled in the current plan');
    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
    expect(albumService.create).not.toHaveBeenCalled();
  });

  it('rejects apply requests unless the session is waiting for plan review', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.Running });
    const operation = makeOperation();
    const plan = makePlan({ sessionId: session.id, operations: [operation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [operation.id] }),
    ).rejects.toThrow('Agent session is not waiting for plan review');
    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
    expect(albumService.create).not.toHaveBeenCalled();
  });

  it('does not mutate albums when the apply claim loses a race after validation', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const operation = makeOperation();
    const plan = makePlan({ sessionId: session.id, operations: [operation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue(void 0);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [operation.id] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sessionRepository.update).not.toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.Applying,
    });
    expect(albumService.create).not.toHaveBeenCalled();
    expect(planRepository.completeApply).not.toHaveBeenCalled();
  });

  it('applies existing-album detail and cover operations through AlbumService.update', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const albumId = newUuid();
    const coverAssetId = newUuid();
    const updateOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AlbumUpdateDetails,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: albumId,
      temporaryTargetId: null,
      payload: { albumName: 'Portugal highlights', description: 'Edited description' },
    });
    const coverOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      position: 1,
      type: AgentOperationType.AlbumSetCover,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: albumId,
      temporaryTargetId: null,
      assetIds: [coverAssetId],
      payload: {},
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [updateOperation, coverOperation] });
    const appliedPlan = makePlan({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        { ...updateOperation, status: AgentOperationStatus.Applied, result: { albumId } },
        { ...coverOperation, status: AgentOperationStatus.Applied, result: { albumId, assetIds: [coverAssetId] } },
      ],
    });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue(appliedPlan);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([coverAssetId]));
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set([coverAssetId]));
    albumService.update.mockResolvedValue({ id: albumId } as never);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [updateOperation.id, coverOperation.id],
      }),
    ).resolves.toMatchObject({ status: AgentOperationApplyStatus.Applied });
    expect(albumService.update).toHaveBeenNthCalledWith(1, auth, albumId, {
      albumName: 'Portugal highlights',
      description: 'Edited description',
    });
    expect(albumService.update).toHaveBeenNthCalledWith(2, auth, albumId, { albumThumbnailAssetId: coverAssetId });
  });

  it('reports partial success when one independent selected operation applies and another fails', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const albumId = newUuid();
    const createOperation = makeOperation({ id: newUuid(), planId: 'plan-id', temporaryTargetId: 'tmp-portugal' });
    const updateOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      position: 1,
      type: AgentOperationType.AlbumUpdateDetails,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: albumId,
      temporaryTargetId: null,
      payload: { albumName: 'Existing renamed' },
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [createOperation, updateOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        { ...createOperation, status: AgentOperationStatus.Applied, result: { albumId: newUuid() } },
        { ...updateOperation, status: AgentOperationStatus.Failed, error: 'album update failed' },
      ],
    });
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    albumService.create.mockResolvedValue({ id: newUuid() } as never);
    albumService.update.mockRejectedValue(new Error('album update failed'));

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [createOperation.id, updateOperation.id],
    });

    expect(result.status).toBe(AgentOperationApplyStatus.PartiallyApplied);
    expect(result.appliedOperationIds).toEqual([createOperation.id]);
    expect(result.failedOperationIds).toEqual([updateOperation.id]);
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.Running,
      endedAt: null,
    });
  });

  it('records album add-asset bulk failures without treating failed assets as applied', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const albumId = newUuid();
    const successfulAssetId = newUuid();
    const failedAssetId = newUuid();
    const addOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AlbumAddAssets,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: albumId,
      temporaryTargetId: null,
      assetIds: [successfulAssetId, failedAssetId],
      payload: {},
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [addOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        {
          ...addOperation,
          status: AgentOperationStatus.Failed,
          result: {
            albumId,
            assetIds: [successfulAssetId],
            assetResults: [
              { id: successfulAssetId, success: true },
              { id: failedAssetId, success: false, error: BulkIdErrorReason.DUPLICATE },
            ],
          },
          error: 'Failed to add 1 asset(s)',
        },
      ],
    });
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([successfulAssetId, failedAssetId]));
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set([successfulAssetId, failedAssetId]));
    albumService.addAssets.mockResolvedValue([
      { id: successfulAssetId, success: true },
      { id: failedAssetId, success: false, error: BulkIdErrorReason.DUPLICATE },
    ]);

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [addOperation.id] });

    expect(result.status).toBe(AgentOperationApplyStatus.Failed);
    expect(result.failedOperationIds).toEqual([addOperation.id]);
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.Running,
      endedAt: null,
    });
    expect(planRepository.completeApply).toHaveBeenCalledWith(plan.id, [
      expect.objectContaining({
        id: addOperation.id,
        status: AgentOperationStatus.Failed,
        result: expect.objectContaining({ assetIds: [successfulAssetId] }),
        error: 'Failed to add 1 asset(s)',
      }),
    ]);
  });

  it('persists a partial failure and skips dependents when an album mutation fails', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const createOperation = makeOperation({ id: newUuid(), planId: 'plan-id', temporaryTargetId: 'tmp-portugal' });
    const addOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      position: 1,
      type: AgentOperationType.AlbumAddAssets,
      targetKind: AgentOperationTargetKind.NewAlbum,
      temporaryTargetId: 'tmp-portugal',
      assetIds: [newUuid()],
      payload: {},
      dependencyIds: [createOperation.id],
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [createOperation, addOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        { ...createOperation, status: AgentOperationStatus.Failed, error: 'album create failed' },
        {
          ...addOperation,
          status: AgentOperationStatus.Skipped,
          result: { skippedReason: 'Dependency was not applied' },
        },
      ],
    });
    albumService.create.mockRejectedValue(new Error('album create failed'));

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [createOperation.id, addOperation.id],
    });

    expect(result.status).toBe(AgentOperationApplyStatus.Failed);
    expect(result.failedOperationIds).toEqual([createOperation.id]);
    expect(result.skippedOperationIds).toEqual([addOperation.id]);
    expect(planRepository.completeApply).toHaveBeenCalledWith(plan.id, [
      expect.objectContaining({
        id: createOperation.id,
        status: AgentOperationStatus.Failed,
        error: 'album create failed',
      }),
      expect.objectContaining({ id: addOperation.id, status: AgentOperationStatus.Skipped }),
    ]);
  });

  it('fails only the drifted operation when apply-time asset access no longer passes', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const assetId = newUuid();
    const albumId = newUuid();
    const addOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AlbumAddAssets,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: albumId,
      assetIds: [assetId],
      payload: {},
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [addOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        { ...addOperation, status: AgentOperationStatus.Failed, error: 'One or more assets are not accessible' },
      ],
    });
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set());

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [addOperation.id] });

    expect(result.status).toBe(AgentOperationApplyStatus.Failed);
    expect(albumService.addAssets).not.toHaveBeenCalled();
  });

  it('fails an apply-time asset check when a shared-space asset is locked by current policy', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: {
        ...permissionPlanSnapshot,
        assetScope: { owned: false, sharedSpaces: true, locked: false },
      },
    });
    const assetId = newUuid();
    const albumId = newUuid();
    const addOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AlbumAddAssets,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: albumId,
      assetIds: [assetId],
      payload: {},
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [addOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        { ...addOperation, status: AgentOperationStatus.Failed, error: 'One or more assets are not accessible' },
      ],
    });
    accessRepository.album.checkSharedAlbumAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.asset.checkSpaceAccess.mockResolvedValue(new Set([assetId]));
    assetRepository.getAgentLockedIds.mockResolvedValue(new Set([assetId]));
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set());

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [addOperation.id] });

    expect(result.status).toBe(AgentOperationApplyStatus.Failed);
    expect(albumService.addAssets).not.toHaveBeenCalled();
  });

  it('fails an existing-album operation when apply-time album access no longer passes', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });
    const albumId = newUuid();
    const updateOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AlbumUpdateDetails,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: albumId,
      temporaryTargetId: null,
      payload: { description: 'Should not apply' },
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [updateOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockResolvedValue({
      ...plan,
      status: AgentOperationPlanStatus.Applied,
      operations: [
        {
          ...updateOperation,
          status: AgentOperationStatus.Failed,
          error: 'One or more target albums are not accessible',
        },
      ],
    });
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set());

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [updateOperation.id],
    });

    expect(result.status).toBe(AgentOperationApplyStatus.Failed);
    expect(albumService.update).not.toHaveBeenCalled();
  });

  it('rejects duplicate space temporary ids and missing new-space dependencies before persisting', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, permissionPlanSnapshot: expandedPermissionPlanSnapshot });
    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.create.mockResolvedValue(makeToolCall({ sessionId: session.id }));

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Broken spaces.',
        operations: [
          {
            type: AgentOperationType.SpaceCreate,
            summary: 'Create one.',
            targetKind: AgentOperationTargetKind.NewSpace,
            temporaryTargetId: 'tmp-space',
            payload: { spaceName: 'One' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
          {
            type: AgentOperationType.SpaceCreate,
            summary: 'Create two.',
            targetKind: AgentOperationTargetKind.NewSpace,
            temporaryTargetId: 'tmp-space',
            payload: { spaceName: 'Two' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('Duplicate space.create temporaryTargetId: tmp-space');

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Missing space.',
        operations: [
          {
            type: AgentOperationType.SpaceAddAssets,
            summary: 'Add to missing space.',
            targetKind: AgentOperationTargetKind.NewSpace,
            temporaryTargetId: 'tmp-missing',
            assetIds: [newUuid()],
            payload: {},
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('No space.create operation found for temporaryTargetId: tmp-missing');

    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it('rejects new-space references before the corresponding create operation', async () => {
    const auth = AuthFactory.create();
    const assetId = newUuid();
    const session = makeSession({ userId: auth.user.id, permissionPlanSnapshot: expandedPermissionPlanSnapshot });
    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.create.mockResolvedValue(makeToolCall({ sessionId: session.id }));

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Out of order space plan.',
        operations: [
          {
            type: AgentOperationType.SpaceAddAssets,
            summary: 'Add too early.',
            targetKind: AgentOperationTargetKind.NewSpace,
            temporaryTargetId: 'tmp-space',
            assetIds: [assetId],
            payload: {},
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
          {
            type: AgentOperationType.SpaceCreate,
            summary: 'Create later.',
            targetKind: AgentOperationTargetKind.NewSpace,
            temporaryTargetId: 'tmp-space',
            payload: { spaceName: 'Later' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('space.addAssets references temporaryTargetId before its space.create operation');

    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it('validates existing spaces, tag ids, editable assets, and redacts expanded audit metadata', async () => {
    const auth = AuthFactory.create();
    const spaceId = newUuid();
    const tagId = newUuid();
    const assetId = newUuid();
    const session = makeSession({ userId: auth.user.id, permissionPlanSnapshot: expandedPermissionPlanSnapshot });
    const plan = makePlan({ sessionId: session.id });
    accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set([spaceId]));

    sessionRepository.getById.mockResolvedValue(session);
    sessionRepository.update.mockResolvedValue({ ...session, status: AgentSessionStatus.WaitingForPlanReview });
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
    accessRepository.asset.checkSpaceEditAccess.mockResolvedValue(new Set([assetId]));
    accessRepository.tag.checkOwnerAccess.mockResolvedValue(new Set([tagId]));
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set([assetId]));
    planRepository.createReplacementRevision.mockResolvedValue(plan);
    toolCallRepository.create.mockResolvedValue(makeToolCall({ sessionId: session.id }));

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Space and tag plan.',
        operations: [
          {
            type: AgentOperationType.SpaceUpdateDetails,
            summary: 'Rename space.',
            targetKind: AgentOperationTargetKind.ExistingSpace,
            targetId: spaceId,
            payload: { spaceName: 'Private trip', description: 'Do not leak me' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
          {
            type: AgentOperationType.AssetRemoveTag,
            summary: 'Remove tag.',
            targetKind: AgentOperationTargetKind.AssetBatch,
            assetIds: [assetId],
            payload: { tagId },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
          {
            type: AgentOperationType.AssetRotate,
            summary: 'Rotate.',
            targetKind: AgentOperationTargetKind.ImageEditBatch,
            assetIds: [assetId],
            payload: { angle: 90 },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).resolves.toMatchObject({ status: 'success' });

    expect(accessRepository.sharedSpace.checkRoleAccess).toHaveBeenCalledWith(
      auth.user.id,
      new Set([spaceId]),
      SharedSpaceRole.Owner,
    );
    expect(accessRepository.asset.checkSpaceEditAccess).toHaveBeenCalledWith(auth.user.id, new Set([assetId]));
    expect(accessRepository.tag.checkOwnerAccess).toHaveBeenCalledWith(auth.user.id, new Set([tagId]));
    expect(toolCallRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        redactedRequestMetadata: expect.objectContaining({
          spaceIds: [spaceId],
          tagIds: [tagId],
          assetIds: [assetId],
        }),
      }),
    );
    expect(toolCallRepository.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        redactedRequestMetadata: expect.objectContaining({ payload: expect.anything() }),
      }),
    );
  });

  it('denies existing space operations without editor or owner access', async () => {
    const auth = AuthFactory.create();
    const spaceId = newUuid();
    const session = makeSession({ userId: auth.user.id, permissionPlanSnapshot: expandedPermissionPlanSnapshot });
    accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set());

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.create.mockResolvedValue(
      makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Executing }),
    );

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Denied space.',
        operations: [
          {
            type: AgentOperationType.SpaceRemoveAssets,
            summary: 'Remove from inaccessible space.',
            targetKind: AgentOperationTargetKind.ExistingSpace,
            targetId: spaceId,
            assetIds: [newUuid()],
            payload: {},
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('One or more target spaces are not accessible');

    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it('requires owner access when changing existing space details', async () => {
    const auth = AuthFactory.create();
    const spaceId = newUuid();
    const session = makeSession({ userId: auth.user.id, permissionPlanSnapshot: expandedPermissionPlanSnapshot });
    accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set());
    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.create.mockResolvedValue(makeToolCall({ sessionId: session.id }));

    await expect(
      sut.proposeAlbumOperations(auth, session.id, {
        summary: 'Rename space.',
        operations: [
          {
            type: AgentOperationType.SpaceUpdateDetails,
            summary: 'Rename.',
            targetKind: AgentOperationTargetKind.ExistingSpace,
            targetId: spaceId,
            payload: { spaceName: 'Owners only' },
            enabled: true,
            riskLevel: AgentOperationRiskLevel.Low,
          },
        ],
      }),
    ).rejects.toThrow('One or more target spaces are not accessible');

    expect(accessRepository.sharedSpace.checkRoleAccess).toHaveBeenCalledWith(
      auth.user.id,
      new Set([spaceId]),
      SharedSpaceRole.Owner,
    );
    expect(planRepository.createReplacementRevision).not.toHaveBeenCalled();
  });

  it('applies existing-space add/remove operations with only selected asset ids', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: expandedPermissionPlanSnapshot,
    });
    const spaceId = newUuid();
    const keepAssetId = newUuid();
    const excludedAssetId = newUuid();
    const removeAssetId = newUuid();
    const removeExcludedAssetId = newUuid();

    accessRepository.asset.checkOwnerAccess.mockResolvedValue(
      new Set([keepAssetId, excludedAssetId, removeAssetId, removeExcludedAssetId]),
    );
    accessRepository.asset.checkSpaceEditAccess.mockResolvedValue(
      new Set([keepAssetId, excludedAssetId, removeAssetId, removeExcludedAssetId]),
    );
    accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set([spaceId]));

    const addOperation = makeOperation({
      id: newUuid(),
      type: AgentOperationType.SpaceAddAssets,
      summary: 'Add selected photos to Family.',
      targetKind: AgentOperationTargetKind.ExistingSpace,
      targetId: spaceId,
      temporaryTargetId: null,
      assetIds: [keepAssetId, excludedAssetId],
      payload: {},
    });
    const removeOperation = makeOperation({
      id: newUuid(),
      type: AgentOperationType.SpaceRemoveAssets,
      summary: 'Remove selected photos from Family.',
      targetKind: AgentOperationTargetKind.ExistingSpace,
      targetId: spaceId,
      temporaryTargetId: null,
      assetIds: [removeAssetId, removeExcludedAssetId],
      payload: {},
      position: 1,
    });
    const plan = makePlan({ sessionId: session.id, operations: [addOperation, removeOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockImplementation((planId, updates) =>
      Promise.resolve(applyUpdatesToPlan({ ...plan, id: planId }, updates)),
    );
    sharedSpaceService.addAssets.mockResolvedValue(undefined as never);
    sharedSpaceService.removeAssets.mockResolvedValue(undefined as never);

    await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [addOperation.id, removeOperation.id],
      itemSelections: {
        [addOperation.id]: { itemKind: 'asset', mode: 'only', itemIds: [keepAssetId] },
        [removeOperation.id]: {
          itemKind: 'asset',
          mode: 'allExcept',
          itemIds: [removeExcludedAssetId],
        },
      },
    });

    expect(sharedSpaceService.addAssets).toHaveBeenCalledWith(auth, spaceId, { assetIds: [keepAssetId] });
    expect(sharedSpaceService.removeAssets).toHaveBeenCalledWith(auth, spaceId, { assetIds: [removeAssetId] });
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.Running,
      endedAt: null,
    });
    expect(sessionRepository.update).not.toHaveBeenCalledWith(
      auth.user.id,
      session.id,
      expect.objectContaining({ status: AgentSessionStatus.Completed }),
    );
  });

  it('does not call shared-space mutation services for disabled or unselected existing-space operations', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: expandedPermissionPlanSnapshot,
    });
    const selectedId = newUuid();
    const disabledId = newUuid();
    const unselectedId = newUuid();
    const spaceId = newUuid();
    const assetId = newUuid();

    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
    accessRepository.asset.checkSpaceEditAccess.mockResolvedValue(new Set([assetId]));
    accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set([spaceId]));

    const selected = makeOperation({
      id: selectedId,
      type: AgentOperationType.SpaceAddAssets,
      targetKind: AgentOperationTargetKind.ExistingSpace,
      targetId: spaceId,
      temporaryTargetId: null,
      assetIds: [assetId],
      payload: {},
    });
    const disabled = makeOperation({
      id: disabledId,
      type: AgentOperationType.SpaceRemoveAssets,
      targetKind: AgentOperationTargetKind.ExistingSpace,
      targetId: spaceId,
      temporaryTargetId: null,
      assetIds: [assetId],
      payload: {},
      enabled: false,
      position: 1,
    });
    const unselected = makeOperation({
      id: unselectedId,
      type: AgentOperationType.SpaceRemoveAssets,
      targetKind: AgentOperationTargetKind.ExistingSpace,
      targetId: spaceId,
      temporaryTargetId: null,
      assetIds: [assetId],
      payload: {},
      position: 2,
    });
    const plan = makePlan({ sessionId: session.id, operations: [selected, disabled, unselected] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockImplementation((planId, updates) =>
      Promise.resolve(applyUpdatesToPlan({ ...plan, id: planId }, updates)),
    );
    sharedSpaceService.addAssets.mockResolvedValue(undefined as never);

    await sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [selected.id] });

    expect(sharedSpaceService.addAssets).toHaveBeenCalledTimes(1);
    expect(sharedSpaceService.removeAssets).not.toHaveBeenCalled();
  });

  it.each([AgentOperationType.SpaceAddAssets, AgentOperationType.SpaceRemoveAssets] as const)(
    'denies %s when the user cannot edit the existing space',
    async (operationType) => {
      const auth = AuthFactory.create();
      const session = makeSession({ userId: auth.user.id, permissionPlanSnapshot: expandedPermissionPlanSnapshot });
      const spaceId = newUuid();
      const assetId = newUuid();
      sessionRepository.getById.mockResolvedValue(session);
      toolCallRepository.create.mockResolvedValue(
        makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Executing }),
      );
      accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
      accessRepository.asset.checkSpaceEditAccess.mockResolvedValue(new Set([assetId]));
      accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set());

      await expect(
        sut.proposeAlbumOperations(auth, session.id, {
          summary: 'Change Family space.',
          operations: [
            {
              type: operationType,
              summary: 'Change Family space.',
              targetKind: AgentOperationTargetKind.ExistingSpace,
              targetId: spaceId,
              assetIds: [assetId],
              payload: {},
              enabled: true,
              riskLevel: AgentOperationRiskLevel.Low,
            },
          ],
        }),
      ).rejects.toThrow(/space/i);
    },
  );

  it('reports partial success when one existing-space operation applies and another becomes inaccessible', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: expandedPermissionPlanSnapshot,
    });
    const spaceId = newUuid();
    const allowedAssetId = newUuid();
    const staleAssetId = newUuid();

    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([allowedAssetId]));
    accessRepository.asset.checkSpaceEditAccess.mockResolvedValue(new Set([allowedAssetId]));
    accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set([spaceId]));

    const addOperation = makeOperation({
      id: newUuid(),
      type: AgentOperationType.SpaceAddAssets,
      targetKind: AgentOperationTargetKind.ExistingSpace,
      targetId: spaceId,
      temporaryTargetId: null,
      assetIds: [allowedAssetId],
      payload: {},
    });
    const removeOperation = makeOperation({
      id: newUuid(),
      type: AgentOperationType.SpaceRemoveAssets,
      targetKind: AgentOperationTargetKind.ExistingSpace,
      targetId: spaceId,
      temporaryTargetId: null,
      assetIds: [staleAssetId],
      payload: {},
      position: 1,
    });
    const plan = makePlan({ sessionId: session.id, operations: [addOperation, removeOperation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockImplementation((planId, updates) =>
      Promise.resolve(applyUpdatesToPlan({ ...plan, id: planId }, updates)),
    );
    sharedSpaceService.addAssets.mockResolvedValue(undefined as never);

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [addOperation.id, removeOperation.id],
    });

    expect(result.status).toBe(AgentOperationApplyStatus.PartiallyApplied);
    expect(result.appliedOperationIds).toEqual([addOperation.id]);
    expect(result.failedOperationIds).toEqual([removeOperation.id]);
    expect(sharedSpaceService.addAssets).toHaveBeenCalledWith(auth, spaceId, { assetIds: [allowedAssetId] });
    expect(sharedSpaceService.removeAssets).not.toHaveBeenCalled();
  });

  it('applies expanded album, space, asset, and tag operations with sparse selections and target overrides', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: expandedPermissionPlanSnapshot,
    });
    const existingAlbumId = newUuid();
    const overrideAlbumId = newUuid();
    const createdSpaceId = newUuid();
    const existingSpaceId = newUuid();
    const overrideSpaceId = newUuid();
    const tagId = newUuid();
    const upsertedTagId = newUuid();
    const assetA = newUuid();
    const assetB = newUuid();
    const assetC = newUuid();
    const operations = [
      makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        type: AgentOperationType.AlbumRemoveAssets,
        targetKind: AgentOperationTargetKind.ExistingAlbum,
        targetId: existingAlbumId,
        assetIds: [assetA, assetB],
        payload: {},
      }),
      makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        position: 1,
        type: AgentOperationType.SpaceCreate,
        targetKind: AgentOperationTargetKind.NewSpace,
        temporaryTargetId: 'tmp-space',
        payload: { spaceName: 'Original', description: 'Old' },
      }),
      makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        position: 2,
        type: AgentOperationType.SpaceAddAssets,
        targetKind: AgentOperationTargetKind.NewSpace,
        temporaryTargetId: 'tmp-space',
        assetIds: [assetA, assetB],
        payload: {},
        dependencyIds: [],
      }),
      makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        position: 3,
        type: AgentOperationType.SpaceRemoveAssets,
        targetKind: AgentOperationTargetKind.ExistingSpace,
        targetId: existingSpaceId,
        assetIds: [assetA],
        payload: {},
      }),
      makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        position: 4,
        type: AgentOperationType.SpaceUpdateDetails,
        targetKind: AgentOperationTargetKind.ExistingSpace,
        targetId: existingSpaceId,
        payload: { spaceName: 'Original space' },
      }),
      makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        position: 5,
        type: AgentOperationType.AssetSetFavorite,
        targetKind: AgentOperationTargetKind.AssetBatch,
        targetId: null,
        assetIds: [assetA],
        payload: { favorite: true },
      }),
      makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        position: 6,
        type: AgentOperationType.AssetSetArchive,
        targetKind: AgentOperationTargetKind.AssetBatch,
        targetId: null,
        assetIds: [assetB],
        payload: { archived: true },
      }),
      makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        position: 7,
        type: AgentOperationType.AssetAddTag,
        targetKind: AgentOperationTargetKind.AssetBatch,
        targetId: null,
        assetIds: [assetA],
        payload: { tagName: 'Receipts' },
      }),
      makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        position: 8,
        type: AgentOperationType.AssetAddTag,
        targetKind: AgentOperationTargetKind.AssetBatch,
        targetId: null,
        assetIds: [assetB],
        payload: { tagId },
      }),
      makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        position: 9,
        type: AgentOperationType.AssetRemoveTag,
        targetKind: AgentOperationTargetKind.AssetBatch,
        targetId: null,
        assetIds: [assetC],
        payload: { tagId },
      }),
    ];
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations });
    accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set([existingSpaceId, overrideSpaceId]));

    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockImplementation((planId, updates) =>
      Promise.resolve(applyUpdatesToPlan({ ...plan, id: planId }, updates)),
    );
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([existingAlbumId, overrideAlbumId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetA, assetB, assetC]));
    accessRepository.asset.checkSpaceEditAccess.mockResolvedValue(new Set([assetA, assetB, assetC]));
    accessRepository.tag.checkOwnerAccess.mockResolvedValue(new Set([tagId]));
    assetRepository.getAgentReadableIds.mockImplementation((ids: Set<string>) => Promise.resolve(new Set(ids)));
    albumService.removeAssets.mockResolvedValue([{ id: assetB, success: true }]);
    sharedSpaceService.create.mockResolvedValue({ id: createdSpaceId } as never);
    sharedSpaceService.addAssets.mockResolvedValue(undefined as never);
    sharedSpaceService.removeAssets.mockResolvedValue(undefined as never);
    sharedSpaceService.update.mockResolvedValue({ id: overrideSpaceId } as never);
    assetService.updateAll.mockResolvedValue(undefined as never);
    tagService.upsert.mockResolvedValue([{ id: upsertedTagId }] as never);
    tagService.addAssets.mockResolvedValue([{ id: assetA, success: true }] as never);
    tagService.removeAssets.mockResolvedValue([{ id: assetC, success: true }] as never);

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: operations.map((operation) => operation.id),
      itemSelections: {
        [operations[0].id]: { itemKind: 'asset', mode: 'only', itemIds: [assetB] },
        [operations[2].id]: { itemKind: 'asset', mode: 'allExcept', itemIds: [assetB] },
      },
      fieldOverrides: {
        [operations[0].id]: { targetAlbumId: overrideAlbumId },
        [operations[1].id]: { spaceName: '  New space  ', description: '  Fresh  ' },
        [operations[4].id]: {
          targetSpaceId: overrideSpaceId,
          description: 'Updated description',
          color: UserAvatarColor.Blue,
        },
      },
    });

    expect(result.status).toBe(AgentOperationApplyStatus.Applied);
    expect(albumService.removeAssets).toHaveBeenCalledWith(auth, overrideAlbumId, { ids: [assetB] });
    expect(sharedSpaceService.create).toHaveBeenCalledWith(auth, { name: 'New space', description: 'Fresh' });
    expect(sharedSpaceService.addAssets).toHaveBeenCalledWith(auth, createdSpaceId, { assetIds: [assetA] });
    expect(sharedSpaceService.removeAssets).toHaveBeenCalledWith(auth, existingSpaceId, { assetIds: [assetA] });
    expect(sharedSpaceService.update).toHaveBeenCalledWith(auth, overrideSpaceId, {
      name: 'Original space',
      description: 'Updated description',
      color: UserAvatarColor.Blue,
    });
    expect(assetService.updateAll).toHaveBeenNthCalledWith(1, auth, { ids: [assetA], isFavorite: true });
    expect(assetService.updateAll).toHaveBeenNthCalledWith(2, auth, {
      ids: [assetB],
      visibility: AssetVisibility.Archive,
    });
    expect(tagService.upsert).toHaveBeenCalledWith(auth, { tags: ['Receipts'] });
    expect(tagService.addAssets).toHaveBeenNthCalledWith(1, auth, upsertedTagId, { ids: [assetA] });
    expect(tagService.addAssets).toHaveBeenNthCalledWith(2, auth, tagId, { ids: [assetB] });
    expect(tagService.removeAssets).toHaveBeenCalledWith(auth, tagId, { ids: [assetC] });
  });

  it('applies existing-space detail updates using only shared-space update fields and preserving description clears', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: expandedPermissionPlanSnapshot,
    });
    const spaceId = newUuid();
    const operation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.SpaceUpdateDetails,
      targetKind: AgentOperationTargetKind.ExistingSpace,
      targetId: spaceId,
      temporaryTargetId: null,
      payload: {
        spaceName: ' Family 2026 ',
        description: '',
        color: UserAvatarColor.Blue,
      },
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [operation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockImplementation((planId, updates) =>
      Promise.resolve(applyUpdatesToPlan({ ...plan, id: planId }, updates)),
    );
    accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set([spaceId]));
    sharedSpaceService.update.mockResolvedValue({ id: spaceId } as never);

    await sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [operation.id] });

    expect(sharedSpaceService.update).toHaveBeenCalledWith(auth, spaceId, {
      name: 'Family 2026',
      description: '',
      color: UserAvatarColor.Blue,
    });
  });

  it.each(['thumbnailAssetId', 'petsEnabled', 'faceRecognitionEnabled', 'linkedLibraryIds', 'delete'])(
    'fails existing-space detail apply when persisted payload includes unsupported field %s',
    async (field) => {
      const auth = AuthFactory.create();
      const session = makeSession({
        userId: auth.user.id,
        status: AgentSessionStatus.WaitingForPlanReview,
        permissionPlanSnapshot: expandedPermissionPlanSnapshot,
      });
      const spaceId = newUuid();
      const operation = makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        type: AgentOperationType.SpaceUpdateDetails,
        targetKind: AgentOperationTargetKind.ExistingSpace,
        targetId: spaceId,
        temporaryTargetId: null,
        payload: { spaceName: 'Family 2026', [field]: field === 'linkedLibraryIds' ? [newUuid()] : true },
      });
      const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [operation] });
      sessionRepository.getById.mockResolvedValue(session);
      planRepository.getByIdForSession.mockResolvedValue(plan);
      planRepository.getCurrentBySessionId.mockResolvedValue(plan);
      planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
      planRepository.completeApply.mockImplementation((planId, updates) =>
        Promise.resolve(applyUpdatesToPlan({ ...plan, id: planId }, updates)),
      );
      accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set([spaceId]));

      const result = await sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [operation.id] });

      expect(result.status).toBe(AgentOperationApplyStatus.Failed);
      expect(result.failedOperationIds).toEqual([operation.id]);
      expect(sharedSpaceService.update).not.toHaveBeenCalled();
    },
  );

  it('merges sparse existing-space field overrides into the shared-space update payload', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: expandedPermissionPlanSnapshot,
    });
    const spaceId = newUuid();
    const operation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.SpaceUpdateDetails,
      targetKind: AgentOperationTargetKind.ExistingSpace,
      targetId: spaceId,
      temporaryTargetId: null,
      payload: { spaceName: 'Original', color: UserAvatarColor.Gray },
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [operation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockImplementation((planId, updates) =>
      Promise.resolve(applyUpdatesToPlan({ ...plan, id: planId }, updates)),
    );
    accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set([spaceId]));
    sharedSpaceService.update.mockResolvedValue({ id: spaceId } as never);

    await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [operation.id],
      fieldOverrides: { [operation.id]: { description: '' } },
    });

    expect(sharedSpaceService.update).toHaveBeenCalledWith(auth, spaceId, {
      name: 'Original',
      description: '',
      color: UserAvatarColor.Gray,
    });
  });

  it.each(['thumbnailAssetId', 'petsEnabled', 'faceRecognitionEnabled', 'linkedLibraryIds', 'delete'])(
    'rejects unsupported existing-space field override %s before claiming the plan',
    async (field) => {
      const auth = AuthFactory.create();
      const session = makeSession({
        userId: auth.user.id,
        status: AgentSessionStatus.WaitingForPlanReview,
        permissionPlanSnapshot: expandedPermissionPlanSnapshot,
      });
      const operation = makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        type: AgentOperationType.SpaceUpdateDetails,
        targetKind: AgentOperationTargetKind.ExistingSpace,
        targetId: newUuid(),
        payload: { spaceName: 'Original' },
      });
      const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [operation] });
      sessionRepository.getById.mockResolvedValue(session);
      planRepository.getByIdForSession.mockResolvedValue(plan);
      planRepository.getCurrentBySessionId.mockResolvedValue(plan);

      await expect(
        sut.applyApprovedOperations(auth, session.id, plan.id, {
          operationIds: [operation.id],
          fieldOverrides: { [operation.id]: { [field]: 'unsupported' } },
        }),
      ).rejects.toThrow('Unsupported field override for operation type');

      expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
    },
  );

  it('fails existing-space detail apply when the permission policy no longer allows updates', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: {
        ...expandedPermissionPlanSnapshot,
        writeScope: { ...expandedPermissionPlanSnapshot.writeScope, updateSpaceDetails: false },
      },
    });
    const spaceId = newUuid();
    const operation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.SpaceUpdateDetails,
      targetKind: AgentOperationTargetKind.ExistingSpace,
      targetId: spaceId,
      temporaryTargetId: null,
      payload: { spaceName: 'Blocked' },
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [operation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockImplementation((planId, updates) =>
      Promise.resolve(applyUpdatesToPlan({ ...plan, id: planId }, updates)),
    );
    accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set([spaceId]));

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [operation.id] });

    expect(result.status).toBe(AgentOperationApplyStatus.Failed);
    expect(result.failedOperationIds).toEqual([operation.id]);
    expect(sharedSpaceService.update).not.toHaveBeenCalled();
  });

  it('fails existing-space detail apply when owner access is lost before the update', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: expandedPermissionPlanSnapshot,
    });
    const spaceId = newUuid();
    const operation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.SpaceUpdateDetails,
      targetKind: AgentOperationTargetKind.ExistingSpace,
      targetId: spaceId,
      temporaryTargetId: null,
      payload: { spaceName: 'Stale' },
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [operation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockImplementation((planId, updates) =>
      Promise.resolve(applyUpdatesToPlan({ ...plan, id: planId }, updates)),
    );
    accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set());

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, { operationIds: [operation.id] });

    expect(result.status).toBe(AgentOperationApplyStatus.Failed);
    expect(result.failedOperationIds).toEqual([operation.id]);
    expect(sharedSpaceService.update).not.toHaveBeenCalled();
  });

  it('rejects invalid space field overrides before claiming the plan', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: expandedPermissionPlanSnapshot,
    });
    const operation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.SpaceUpdateDetails,
      targetKind: AgentOperationTargetKind.ExistingSpace,
      targetId: newUuid(),
      payload: { spaceName: 'Original' },
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [operation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [operation.id],
        fieldOverrides: { [operation.id]: { spaceName: 'x'.repeat(101) } },
      }),
    ).rejects.toThrow('spaceName must be 1-100 characters');

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [operation.id],
        fieldOverrides: { [operation.id]: { description: 'x'.repeat(501) } },
      }),
    ).rejects.toThrow('description must be 500 characters or fewer');

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [operation.id],
        fieldOverrides: { [operation.id]: { color: '#80c7ff' } },
      }),
    ).rejects.toThrow('color must be a valid space color');

    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
  });

  it('rejects unsupported new operation field overrides before claiming the plan', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: expandedPermissionPlanSnapshot,
    });
    const operation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AssetRotate,
      targetKind: AgentOperationTargetKind.ImageEditBatch,
      targetId: null,
      assetIds: [newUuid()],
      payload: { angle: 90 },
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [operation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [operation.id],
        fieldOverrides: { [operation.id]: { targetAlbumId: newUuid() } },
      }),
    ).rejects.toThrow('Unsupported field override for operation type');

    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
  });

  it.each([
    {
      type: AgentOperationType.AlbumCreate,
      targetKind: AgentOperationTargetKind.NewAlbum,
      temporaryTargetId: 'tmp-album',
      payload: { albumName: 'Trip' },
      fields: { targetAlbumId: newUuid() },
    },
    {
      type: AgentOperationType.SpaceCreate,
      targetKind: AgentOperationTargetKind.NewSpace,
      temporaryTargetId: 'tmp-space',
      payload: { spaceName: 'Trip' },
      fields: { targetSpaceId: newUuid() },
    },
  ])('rejects target overrides for create operations before claiming the plan', async (operationInput) => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: expandedPermissionPlanSnapshot,
    });
    const operation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      ...operationInput,
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [operation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);

    await expect(
      sut.applyApprovedOperations(auth, session.id, plan.id, {
        operationIds: [operation.id],
        fieldOverrides: { [operation.id]: operationInput.fields as unknown as Record<string, string> },
      }),
    ).rejects.toThrow('Target overrides are not supported for create operations');

    expect(planRepository.claimCurrentForApply).not.toHaveBeenCalled();
    expect(albumService.create).not.toHaveBeenCalled();
    expect(sharedSpaceService.create).not.toHaveBeenCalled();
  });

  it('keeps non-target dependencies when overriding a target', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: expandedPermissionPlanSnapshot,
    });
    const dependencyOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AlbumAddAssets,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: newUuid(),
      assetIds: [newUuid()],
      payload: {},
    });
    const targetOperation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      position: 1,
      type: AgentOperationType.AlbumAddAssets,
      targetKind: AgentOperationTargetKind.ExistingAlbum,
      targetId: newUuid(),
      assetIds: [newUuid()],
      payload: {},
      dependencyIds: [dependencyOperation.id],
    });
    const plan = makePlan({
      id: 'plan-id',
      sessionId: session.id,
      operations: [dependencyOperation, targetOperation],
    });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockImplementation((planId, updates) =>
      Promise.resolve(applyUpdatesToPlan({ ...plan, id: planId }, updates)),
    );

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [dependencyOperation.id, targetOperation.id],
      itemSelections: {
        [dependencyOperation.id]: { itemKind: 'asset', mode: 'only', itemIds: [] },
      },
      fieldOverrides: { [targetOperation.id]: { targetAlbumId: newUuid() } },
    });

    expect(result.skippedOperationIds).toEqual([dependencyOperation.id, targetOperation.id]);
    expect(albumService.addAssets).not.toHaveBeenCalled();
  });

  it('fails stale expanded apply targets before calling downstream services', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: expandedPermissionPlanSnapshot,
    });
    const spaceId = newUuid();
    const tagId = newUuid();
    const staleAssetId = newUuid();
    const inaccessibleAssetId = newUuid();
    const operations = [
      makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        type: AgentOperationType.SpaceUpdateDetails,
        targetKind: AgentOperationTargetKind.ExistingSpace,
        targetId: spaceId,
        payload: { spaceName: 'Stale' },
      }),
      makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        position: 1,
        type: AgentOperationType.AssetAddTag,
        targetKind: AgentOperationTargetKind.AssetBatch,
        targetId: null,
        assetIds: [inaccessibleAssetId],
        payload: { tagId },
      }),
      makeOperation({
        id: newUuid(),
        planId: 'plan-id',
        position: 2,
        type: AgentOperationType.AssetSetFavorite,
        targetKind: AgentOperationTargetKind.AssetBatch,
        targetId: null,
        assetIds: [staleAssetId],
        payload: { favorite: true },
      }),
    ];
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockImplementation((planId, updates) =>
      Promise.resolve(applyUpdatesToPlan({ ...plan, id: planId }, updates)),
    );
    accessRepository.sharedSpace.checkRoleAccess.mockResolvedValue(new Set());
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([inaccessibleAssetId, staleAssetId]));
    accessRepository.asset.checkSpaceEditAccess.mockResolvedValue(new Set([inaccessibleAssetId, staleAssetId]));
    accessRepository.tag.checkOwnerAccess.mockResolvedValue(new Set());
    assetRepository.getAgentReadableIds.mockImplementation((ids: Set<string>) =>
      Promise.resolve(new Set([...ids].filter((id) => id !== staleAssetId))),
    );

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: operations.map((operation) => operation.id),
    });

    expect(result.status).toBe(AgentOperationApplyStatus.Failed);
    expect(result.failedOperationIds).toEqual(operations.map((operation) => operation.id));
    expect(sharedSpaceService.update).not.toHaveBeenCalled();
    expect(tagService.addAssets).not.toHaveBeenCalled();
    expect(assetService.updateAll).not.toHaveBeenCalled();
  });

  it('rotates selected editable images by merging existing spatial edits and reporting per-asset failures', async () => {
    const auth = AuthFactory.create();
    const editableAssetId = newUuid();
    const netZeroAssetId = newUuid();
    const videoAssetId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForPlanReview,
      permissionPlanSnapshot: expandedPermissionPlanSnapshot,
    });
    const operation = makeOperation({
      id: newUuid(),
      planId: 'plan-id',
      type: AgentOperationType.AssetRotate,
      targetKind: AgentOperationTargetKind.ImageEditBatch,
      targetId: null,
      assetIds: [editableAssetId, netZeroAssetId, videoAssetId],
      payload: { angle: 90 },
    });
    const plan = makePlan({ id: 'plan-id', sessionId: session.id, operations: [operation] });
    sessionRepository.getById.mockResolvedValue(session);
    planRepository.getByIdForSession.mockResolvedValue(plan);
    planRepository.getCurrentBySessionId.mockResolvedValue(plan);
    planRepository.claimCurrentForApply.mockResolvedValue({ ...plan, status: AgentOperationPlanStatus.Applied });
    planRepository.completeApply.mockImplementation((planId, updates) =>
      Promise.resolve(applyUpdatesToPlan({ ...plan, id: planId }, updates)),
    );
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([editableAssetId, netZeroAssetId, videoAssetId]));
    accessRepository.asset.checkSpaceEditAccess.mockResolvedValue(
      new Set([editableAssetId, netZeroAssetId, videoAssetId]),
    );
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set([editableAssetId, netZeroAssetId, videoAssetId]));
    assetRepository.getForEdit.mockImplementation((id: string) =>
      Promise.resolve({
        type: id === videoAssetId ? AssetType.Video : AssetType.Image,
        livePhotoVideoId: null,
        originalPath: '/photos/image.jpg',
        originalFileName: 'image.jpg',
        duration: null,
        exifImageWidth: 400,
        exifImageHeight: 300,
        orientation: null,
        projectionType: null,
      }),
    );
    assetService.getAssetEdits.mockImplementation((_: typeof auth, id: string) =>
      Promise.resolve({
        assetId: id,
        edits:
          id === editableAssetId
            ? [
                { id: newUuid(), action: AssetEditAction.Crop, parameters: { x: 0, y: 0, width: 200, height: 200 } },
                { id: newUuid(), action: AssetEditAction.Rotate, parameters: { angle: 90 } },
                { id: newUuid(), action: AssetEditAction.Mirror, parameters: { axis: 'horizontal' } },
              ]
            : [{ id: newUuid(), action: AssetEditAction.Rotate, parameters: { angle: 180 } }],
      } as never),
    );
    assetService.editAsset.mockResolvedValue({ assetId: editableAssetId, edits: [] } as never);
    assetService.removeAssetEdits.mockResolvedValue(undefined as never);

    const result = await sut.applyApprovedOperations(auth, session.id, plan.id, {
      operationIds: [operation.id],
      fieldOverrides: { [operation.id]: { rotationAngle: '180' } },
      itemSelections: { [operation.id]: { itemKind: 'asset', mode: 'all', itemIds: [] } },
    });

    expect(result.status).toBe(AgentOperationApplyStatus.Failed);
    expect(assetService.editAsset).toHaveBeenCalledWith(auth, editableAssetId, {
      edits: [
        { action: AssetEditAction.Crop, parameters: { x: 0, y: 0, width: 200, height: 200 } },
        { action: AssetEditAction.Rotate, parameters: { angle: 270 } },
        { action: AssetEditAction.Mirror, parameters: { axis: 'horizontal' } },
      ],
    });
    expect(assetService.removeAssetEdits).toHaveBeenCalledWith(auth, netZeroAssetId);
    expect(planRepository.completeApply).toHaveBeenCalledWith(plan.id, [
      expect.objectContaining({
        id: operation.id,
        status: AgentOperationStatus.Failed,
        result: expect.objectContaining({
          assetIds: [editableAssetId, netZeroAssetId],
          assetResults: expect.arrayContaining([
            expect.objectContaining({ id: editableAssetId, success: true }),
            expect.objectContaining({ id: netZeroAssetId, success: true }),
            expect.objectContaining({ id: videoAssetId, success: false, errorMessage: 'Only images can be edited' }),
          ]),
        }),
        error: 'Failed to rotate 1 asset(s)',
      }),
    ]);
  });

  it('does not expose an apply path to the runner planning tools', () => {
    expect(Object.values(AgentToolName)).not.toContain('applyAlbumOperations');
  });
});
