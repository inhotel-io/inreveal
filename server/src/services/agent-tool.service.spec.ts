import { BadRequestException } from '@nestjs/common';
import { AgentSession, AgentToolCall } from 'src/database';
import { AgentToolApprovalDto } from 'src/dtos/agent-tool.dto';
import {
  AgentApprovalMode,
  AgentPermissionPreset,
  AgentProviderType,
  AgentSessionStatus,
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolDataClass,
  AgentToolName,
  AssetType,
  AssetVisibility,
} from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { AgentToolCallRepository } from 'src/repositories/agent-tool-call.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { AgentToolService } from 'src/services/agent-tool.service';
import { AgentAssetMetadata } from 'src/types/agent-tool.types';
import { AgentPermissionPlanSnapshot } from 'src/types/agent-session.types';
import { AuthFactory } from 'test/factories/auth.factory';
import { newAccessRepositoryMock } from 'test/repositories/access.repository.mock';
import { newAssetRepositoryMock } from 'test/repositories/asset.repository.mock';
import { newUuid } from 'test/small.factory';
import { automock } from 'test/utils';

const now = new Date('2026-05-14T12:00:00.000Z');
const completedAt = new Date('2026-05-14T12:01:00.000Z');

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

const makePlan = (overrides: Partial<AgentPermissionPlanSnapshot> = {}): AgentPermissionPlanSnapshot => ({
  ...permissionPlanSnapshot,
  ...overrides,
  read: { ...permissionPlanSnapshot.read, ...overrides.read },
  providerExposure: { ...permissionPlanSnapshot.providerExposure, ...overrides.providerExposure },
  assetScope: { ...permissionPlanSnapshot.assetScope, ...overrides.assetScope },
  writeScope: { ...permissionPlanSnapshot.writeScope, ...overrides.writeScope },
  limits: { ...permissionPlanSnapshot.limits, ...overrides.limits },
});

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

const makeToolCall = (overrides: Partial<AgentToolCall> = {}): AgentToolCall => {
  const sessionId = newUuid();
  const assetIds = [newUuid()];

  return {
    id: newUuid(),
    sessionId,
    toolName: AgentToolName.ReadAssetMetadata,
    status: AgentToolCallStatus.PendingApproval,
    approvalDecision: null,
    requestSummary: `Read metadata for ${assetIds.length} asset(s)`,
    responseSummary: null,
    redactedRequestMetadata: { assetIds },
    redactedResponseMetadata: null,
    dataClass: AgentToolDataClass.Metadata,
    assetCount: assetIds.length,
    albumCount: 0,
    providerSnapshot: {
      providerCredentialId: newUuid(),
      providerType: AgentProviderType.OpenAI,
      label: 'OpenAI personal',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-5.1',
    },
    startedAt: now,
    completedAt: null,
    error: null,
    ...overrides,
  };
};

const makeMetadata = (id: string, overrides: Partial<AgentAssetMetadata> = {}): AgentAssetMetadata & { leaked?: string } => ({
  id,
  ownerId: newUuid(),
  type: AssetType.Image,
  originalFileName: `${id}.jpg`,
  localDateTime: now,
  fileCreatedAt: now,
  fileModifiedAt: now,
  isFavorite: false,
  visibility: AssetVisibility.Timeline,
  exifInfo: {
    dateTimeOriginal: now,
    city: 'Berlin',
    state: 'Berlin',
    country: 'Germany',
    make: 'Nikon',
    model: 'Zf',
    lensModel: '40mm',
    latitude: 52.52,
    longitude: 13.405,
    rating: 5,
  },
  tags: [{ id: newUuid(), value: 'travel', color: null }],
  ...overrides,
});

describe(AgentToolService.name, () => {
  let sut: AgentToolService;
  let accessRepository: ReturnType<typeof newAccessRepositoryMock>;
  let assetRepository: ReturnType<typeof newAssetRepositoryMock>;
  let sessionRepository: ReturnType<typeof automock<AgentSessionRepository>>;
  let toolCallRepository: ReturnType<typeof automock<AgentToolCallRepository>>;

  beforeEach(() => {
    accessRepository = newAccessRepositoryMock();
    assetRepository = newAssetRepositoryMock();
    sessionRepository = automock(AgentSessionRepository, { args: [{} as never] });
    toolCallRepository = automock(AgentToolCallRepository, { args: [{} as never] });
    sut = new AgentToolService(
      accessRepository as unknown as AccessRepository,
      assetRepository as unknown as AssetRepository,
      sessionRepository,
      toolCallRepository,
    );

    sessionRepository.update.mockImplementation((_userId, _id, dto) => Promise.resolve(makeSession(dto)));
    toolCallRepository.create.mockImplementation((dto) =>
      Promise.resolve(
        makeToolCall({
          ...dto,
          id: newUuid(),
          startedAt: now,
          completedAt: dto.completedAt ?? null,
        }),
      ),
    );
    toolCallRepository.transition.mockImplementation((_sessionId, _id, _expectedStatus, dto) =>
      Promise.resolve(makeToolCall({ ...dto, id: _id, sessionId: _sessionId })),
    );
    toolCallRepository.getCountedAssetCountBySession.mockResolvedValue(0);
  });

  it('returns approval-required and creates a pending audit row for strict metadata reads', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({ userId: auth.user.id });
    const pending = makeToolCall({
      sessionId: session.id,
      requestSummary: 'Read metadata for 2 asset(s)',
      redactedRequestMetadata: { assetIds },
      assetCount: 2,
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    toolCallRepository.create.mockResolvedValue(pending);

    const result = await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'approval-required',
      toolCall: expect.objectContaining({
        id: pending.id,
        sessionId: session.id,
        status: AgentToolCallStatus.PendingApproval,
        approvalDecision: null,
        requestSummary: 'Read metadata for 2 asset(s)',
        responseSummary: null,
        dataClass: AgentToolDataClass.Metadata,
        assetCount: 2,
        albumCount: 0,
        completedAt: null,
        error: null,
      }),
    });
    expect(toolCallRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        toolName: AgentToolName.ReadAssetMetadata,
        status: AgentToolCallStatus.PendingApproval,
        approvalDecision: null,
        requestSummary: 'Read metadata for 2 asset(s)',
        responseSummary: null,
        redactedRequestMetadata: { assetIds },
        redactedResponseMetadata: null,
        dataClass: AgentToolDataClass.Metadata,
        assetCount: 2,
        albumCount: 0,
        providerSnapshot: {
          providerCredentialId: session.credentialSnapshot.id,
          providerType: AgentProviderType.OpenAI,
          label: 'OpenAI personal',
          baseUrl: 'https://api.example.com/v1',
          model: 'gpt-5.1',
        },
        completedAt: null,
        error: null,
      }),
    );
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.WaitingForToolApproval,
    });
  });

  it('creates a denied audit row when read.metadata is disabled', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({ read: { metadata: false, previews: false, originals: false } }),
    });
    const denied = makeToolCall({
      sessionId: session.id,
      status: AgentToolCallStatus.Denied,
      approvalDecision: AgentToolApprovalDecision.Denied,
      error: 'Agent permission policy does not allow metadata reads',
      completedAt,
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.create.mockResolvedValue(denied);

    const result = await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Agent permission policy does not allow metadata reads',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied, error: denied.error }),
    });
    expect(toolCallRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        redactedRequestMetadata: { assetIds },
        completedAt: expect.any(Date),
        error: 'Agent permission policy does not allow metadata reads',
      }),
    );
    expect(accessRepository.asset.checkOwnerAccess).not.toHaveBeenCalled();
  });

  it('creates a denied audit row when providerExposure.metadata is disabled', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({
        providerExposure: {
          metadata: false,
          previews: false,
          originals: false,
          allowOriginalsForExternalProviders: false,
        },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.create.mockResolvedValue(
      makeToolCall({
        sessionId: session.id,
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        error: 'Agent provider exposure policy does not allow metadata reads',
        completedAt,
      }),
    );

    const result = await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Agent provider exposure policy does not allow metadata reads',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(accessRepository.asset.checkOwnerAccess).not.toHaveBeenCalled();
  });

  it('denies inaccessible assets before pending approval', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({ userId: auth.user.id });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetIds[0]]));

    const result = await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'denied',
      reason: 'One or more assets are not accessible',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(sessionRepository.update).not.toHaveBeenCalled();
  });

  it('denies per-tool asset limit before access checks', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({ limits: { ...permissionPlanSnapshot.limits, maxAssetsPerToolCall: 1 } }),
    });

    sessionRepository.getById.mockResolvedValue(session);

    const result = await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Requested asset count exceeds per-tool limit',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(accessRepository.asset.checkOwnerAccess).not.toHaveBeenCalled();
  });

  it('denies per-session asset limit before access checks', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({ limits: { ...permissionPlanSnapshot.limits, maxAssetsPerSession: 2 } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getCountedAssetCountBySession.mockResolvedValue(1);

    const result = await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Requested asset count exceeds per-session limit',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(toolCallRepository.getCountedAssetCountBySession).toHaveBeenCalledWith(session.id);
    expect(accessRepository.asset.checkOwnerAccess).not.toHaveBeenCalled();
  });

  it('shared-space-only scope checks space access, avoids album/partner checks, and filters locked ids when not elevated', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: false, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkSpaceAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentLockedIds.mockResolvedValue(new Set());

    await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(accessRepository.asset.checkOwnerAccess).not.toHaveBeenCalled();
    expect(accessRepository.asset.checkSpaceAccess).toHaveBeenCalledWith(auth.user.id, new Set(assetIds));
    expect(accessRepository.asset.checkAlbumAccess).not.toHaveBeenCalled();
    expect(accessRepository.asset.checkPartnerAccess).not.toHaveBeenCalled();
    expect(assetRepository.getAgentLockedIds).toHaveBeenCalledWith(new Set(assetIds));
  });

  it('denies locked shared-space assets without elevated locked access', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: false, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkSpaceAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentLockedIds.mockResolvedValue(new Set(assetIds));

    const result = await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'denied',
      reason: 'One or more assets are not accessible',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
  });

  it('allows locked shared-space assets when assetScope.locked is true and auth is elevated', async () => {
    const auth = AuthFactory.from().session({ hasElevatedPermission: true }).build();
    const assetIds = [newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: false, sharedSpaces: true, locked: true } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkSpaceAccess.mockResolvedValue(new Set(assetIds));

    const result = await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(result.status).toBe('approval-required');
    expect(assetRepository.getAgentLockedIds).not.toHaveBeenCalled();
  });

  it('passes elevated flag for owned locked access only when policy and auth allow it', async () => {
    const elevatedAuth = AuthFactory.from().session({ hasElevatedPermission: true }).build();
    const plainAuth = AuthFactory.create({ id: elevatedAuth.user.id });
    const assetIds = [newUuid()];
    const session = makeSession({
      userId: elevatedAuth.user.id,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: false, locked: true } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));

    await sut.readAssetMetadata(elevatedAuth, session.id, { assetIds });
    expect(accessRepository.asset.checkOwnerAccess).toHaveBeenLastCalledWith(elevatedAuth.user.id, new Set(assetIds), true);

    await sut.readAssetMetadata(plainAuth, session.id, { assetIds });
    expect(accessRepository.asset.checkOwnerAccess).toHaveBeenLastCalledWith(elevatedAuth.user.id, new Set(assetIds), false);
  });

  it('lists historical tool calls after completed session', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.Completed });
    const toolCall = makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Completed, completedAt });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getBySessionId.mockResolvedValue([toolCall]);

    const result = await sut.getToolCalls(auth, session.id);

    expect(result).toEqual([expect.objectContaining({ id: toolCall.id, status: AgentToolCallStatus.Completed })]);
    expect(toolCallRepository.getBySessionId).toHaveBeenCalledWith(session.id);
  });

  it.each([
    {
      decision: AgentToolApprovalDecision.Approved,
      expectedStatus: AgentToolCallStatus.Approved,
      responseSummary: 'Tool call approved by user',
      error: null,
      completedAt: null,
    },
    {
      decision: AgentToolApprovalDecision.Denied,
      reason: 'No thanks',
      expectedStatus: AgentToolCallStatus.Denied,
      responseSummary: null,
      error: 'No thanks',
      completedAt,
    },
  ])('records $decision approval decision and restores session running', async (caseData) => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForToolApproval });
    const pending = makeToolCall({ sessionId: session.id });
    const transitioned = makeToolCall({
      ...pending,
      status: caseData.expectedStatus,
      approvalDecision: caseData.decision,
      responseSummary: caseData.responseSummary,
      completedAt: caseData.completedAt,
      error: caseData.error,
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(pending);
    toolCallRepository.transition.mockResolvedValue(transitioned);

    const result = await sut.approveToolCall(auth, session.id, pending.id, {
      decision: caseData.decision,
      reason: caseData.reason,
    } as AgentToolApprovalDto);

    expect(result).toEqual(expect.objectContaining({ status: caseData.expectedStatus, error: caseData.error }));
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      pending.id,
      AgentToolCallStatus.PendingApproval,
      expect.objectContaining({
        status: caseData.expectedStatus,
        approvalDecision: caseData.decision,
        responseSummary: caseData.responseSummary,
        error: caseData.error,
      }),
    );
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, { status: AgentSessionStatus.Running });
  });

  it('rejects non-pending approval without transition', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id });
    const toolCall = makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Completed, completedAt });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(toolCall);

    await expect(
      sut.approveToolCall(auth, session.id, toolCall.id, { decision: AgentToolApprovalDecision.Approved }),
    ).rejects.toThrow('Agent tool call is not pending approval');
    expect(toolCallRepository.transition).not.toHaveBeenCalled();
  });

  it('executes approved metadata reads by claiming, revalidating, reading, completing audit, and returning ordered assets', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({ userId: auth.user.id });
    const approved = makeToolCall({
      sessionId: session.id,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      redactedRequestMetadata: { assetIds },
      assetCount: 2,
    });
    const executing = makeToolCall({ ...approved, status: AgentToolCallStatus.Executing });
    const secondAsset = makeMetadata(assetIds[1], { leaked: 'ignore me' });
    const firstAsset = makeMetadata(assetIds[0]);

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(approved);
    toolCallRepository.transition
      .mockResolvedValueOnce(executing)
      .mockResolvedValueOnce(makeToolCall({ ...approved, status: AgentToolCallStatus.Completed, completedAt }));
    toolCallRepository.getCountedAssetCountBySession.mockResolvedValue(0);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentMetadataByIds.mockResolvedValue([secondAsset, firstAsset]);

    const result = await sut.readAssetMetadata(auth, session.id, { toolCallId: approved.id });

    expect(toolCallRepository.transition).toHaveBeenNthCalledWith(1, session.id, approved.id, AgentToolCallStatus.Approved, {
      status: AgentToolCallStatus.Executing,
      error: null,
    });
    expect(toolCallRepository.getCountedAssetCountBySession).toHaveBeenCalledWith(session.id, approved.id);
    expect(assetRepository.getAgentMetadataByIds).toHaveBeenCalledWith(assetIds);
    expect(toolCallRepository.transition).toHaveBeenNthCalledWith(
      2,
      session.id,
      approved.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Completed,
        responseSummary: 'Returned metadata for 2 asset(s)',
        redactedResponseMetadata: { assetIds },
        completedAt: expect.any(Date),
        error: null,
      }),
    );
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, { status: AgentSessionStatus.Running });
    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      assets: [
        expect.objectContaining({ id: assetIds[0] }),
        expect.not.objectContaining({ leaked: 'ignore me' }),
      ],
    });
  });

  it('prevents asset read when execution claim loses a race', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({ userId: auth.user.id });
    const approved = makeToolCall({
      sessionId: session.id,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      redactedRequestMetadata: { assetIds },
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(approved);
    toolCallRepository.transition.mockResolvedValue();

    await expect(sut.readAssetMetadata(auth, session.id, { toolCallId: approved.id })).rejects.toThrow(
      'Agent tool call is already executing or completed',
    );
    expect(assetRepository.getAgentMetadataByIds).not.toHaveBeenCalled();
  });

  it('records denied and restores session when access drifts after approval', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({ userId: auth.user.id });
    const approved = makeToolCall({
      sessionId: session.id,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      redactedRequestMetadata: { assetIds },
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(approved);
    toolCallRepository.transition.mockResolvedValueOnce(makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set());

    const result = await sut.readAssetMetadata(auth, session.id, { toolCallId: approved.id });

    expect(result).toEqual({
      status: 'denied',
      reason: 'One or more assets are not accessible',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(toolCallRepository.transition).toHaveBeenLastCalledWith(
      session.id,
      approved.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({ status: AgentToolCallStatus.Denied, error: 'One or more assets are not accessible' }),
    );
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, { status: AgentSessionStatus.Running });
  });

  it('records denied and restores session when per-session limit drifts after approval', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({ limits: { ...permissionPlanSnapshot.limits, maxAssetsPerSession: 2 } }),
    });
    const approved = makeToolCall({
      sessionId: session.id,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      redactedRequestMetadata: { assetIds },
      assetCount: 2,
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(approved);
    toolCallRepository.transition.mockResolvedValueOnce(makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }));
    toolCallRepository.getCountedAssetCountBySession.mockResolvedValue(1);

    const result = await sut.readAssetMetadata(auth, session.id, { toolCallId: approved.id });

    expect(result.status).toBe('denied');
    expect(result.reason).toBe('Requested asset count exceeds per-session limit');
    expect(accessRepository.asset.checkOwnerAccess).not.toHaveBeenCalled();
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, { status: AgentSessionStatus.Running });
  });

  it('records failed and restores session when an asset disappears after revalidation', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({ userId: auth.user.id });
    const approved = makeToolCall({
      sessionId: session.id,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      redactedRequestMetadata: { assetIds },
      assetCount: 2,
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(approved);
    toolCallRepository.transition.mockResolvedValueOnce(makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentMetadataByIds.mockResolvedValue([makeMetadata(assetIds[0])]);

    const result = await sut.readAssetMetadata(auth, session.id, { toolCallId: approved.id });

    expect(result).toEqual({
      status: 'denied',
      reason: 'One or more assets were not found during metadata read',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Failed }),
    });
    expect(toolCallRepository.transition).toHaveBeenLastCalledWith(
      session.id,
      approved.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Failed,
        error: 'One or more assets were not found during metadata read',
      }),
    );
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, { status: AgentSessionStatus.Running });
  });

  it('records failed and restores session when metadata repository throws', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({ userId: auth.user.id });
    const approved = makeToolCall({
      sessionId: session.id,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      redactedRequestMetadata: { assetIds },
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(approved);
    toolCallRepository.transition.mockResolvedValueOnce(makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentMetadataByIds.mockRejectedValue(new Error('database unavailable'));

    const result = await sut.readAssetMetadata(auth, session.id, { toolCallId: approved.id });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Metadata read failed',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Failed }),
    });
    expect(toolCallRepository.transition).toHaveBeenLastCalledWith(
      session.id,
      approved.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({ status: AgentToolCallStatus.Failed, error: 'Metadata read failed' }),
    );
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, { status: AgentSessionStatus.Running });
  });

  it('throws BadRequestException when the session is missing', async () => {
    const auth = AuthFactory.create();

    sessionRepository.getById.mockResolvedValue();

    await expect(sut.readAssetMetadata(auth, newUuid(), { assetIds: [newUuid()] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
