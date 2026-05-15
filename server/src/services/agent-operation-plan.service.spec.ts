import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AgentSession, AgentToolCall } from 'src/database';
import {
  AgentApprovalMode,
  AgentOperationPlanStatus,
  AgentOperationRiskLevel,
  AgentOperationStatus,
  AgentOperationTargetKind,
  AgentOperationType,
  AgentPermissionPreset,
  AgentProviderType,
  AgentSessionStatus,
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
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
import { AgentOperationPlanService } from 'src/services/agent-operation-plan.service';
import { AgentPermissionPlanSnapshot } from 'src/types/agent-session.types';
import { AuthFactory } from 'test/factories/auth.factory';
import { newAccessRepositoryMock } from 'test/repositories/access.repository.mock';
import { newAssetRepositoryMock } from 'test/repositories/asset.repository.mock';
import { newUuid } from 'test/small.factory';
import { automock } from 'test/utils';

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
  let sessionRepository: ReturnType<typeof automock<AgentSessionRepository>>;
  let planRepository: ReturnType<typeof automock<AgentOperationPlanRepository>>;
  let toolCallRepository: ReturnType<typeof automock<AgentToolCallRepository>>;
  let websocketRepository: ReturnType<typeof automock<WebsocketRepository>>;

  beforeEach(() => {
    accessRepository = newAccessRepositoryMock();
    assetRepository = newAssetRepositoryMock();
    sessionRepository = automock(AgentSessionRepository, { args: [{} as never] });
    planRepository = automock(AgentOperationPlanRepository, { args: [{} as never] });
    toolCallRepository = automock(AgentToolCallRepository, { args: [{} as never] });
    websocketRepository = automock(WebsocketRepository, { args: [{} as never, { setContext: () => {} } as never] });
    websocketRepository.clientSend.mockImplementation(() => {});
    toolCallRepository.transition.mockImplementation((_sessionId, _id, _expectedStatus, dto) =>
      Promise.resolve(
        makeToolCall({
          ...dto,
          completedAt: dto.completedAt instanceof Date || dto.completedAt === null ? dto.completedAt : undefined,
        }),
      ),
    );
    sut = new AgentOperationPlanService(
      accessRepository as unknown as AccessRepository,
      assetRepository as unknown as AssetRepository,
      sessionRepository,
      planRepository,
      toolCallRepository,
      websocketRepository,
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
          dependencyIds: [newUuid()],
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
});
