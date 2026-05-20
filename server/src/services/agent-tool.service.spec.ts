import { BadRequestException } from '@nestjs/common';
import { AgentSession, AgentToolCall } from 'src/database';
import { AgentSearchAssetsToolRequestDto, AgentToolApprovalDto } from 'src/dtos/agent-tool.dto';
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
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { SearchRepository } from 'src/repositories/search.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { AgentRunnerService } from 'src/services/agent-runner.service';
import { AgentToolService } from 'src/services/agent-tool.service';
import { UserService } from 'src/services/user.service';
import { AgentPermissionPlanSnapshot } from 'src/types/agent-session.types';
import {
  AgentAlbumDetail,
  AgentAlbumSummary,
  AgentAssetMediaReference,
  AgentAssetMetadata,
  AgentSpaceDetail,
  AgentSpaceSummary,
  AgentUserLookupResult,
} from 'src/types/agent-tool.types';
import { AuthFactory } from 'test/factories/auth.factory';
import { newAccessRepositoryMock } from 'test/repositories/access.repository.mock';
import { newAssetRepositoryMock } from 'test/repositories/asset.repository.mock';
import { newUuid } from 'test/small.factory';
import { automock } from 'test/utils';

const now = new Date('2026-05-14T12:00:00.000Z');
const completedAt = new Date('2026-05-14T12:01:00.000Z');
const flushAsync = () => new Promise<void>((resolve) => setImmediate(resolve));

const permissionPlanSnapshot: AgentPermissionPlanSnapshot = {
  read: { metadata: true, previews: false, originals: false },
  providerExposure: {
    metadata: true,
    previews: false,
    originals: false,
    allowOriginalsForExternalProviders: false,
  },
  assetScope: { owned: true, sharedSpaces: false, locked: false },
  writeScope: {
    createAlbum: true,
    addAssets: true,
    updateDetails: true,
    setCover: true,
    addMembersToSpaces: false,
    removeMembersFromSpaces: false,
    updateSpaceMemberRoles: false,
  },
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
    title: null,
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

const makeMetadata = (
  id: string,
  overrides: Partial<AgentAssetMetadata> & { leaked?: string } = {},
): AgentAssetMetadata & { leaked?: string } => ({
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

const makeMediaReference = (
  assetId: string,
  overrides: Partial<AgentAssetMediaReference> = {},
): AgentAssetMediaReference => ({
  assetId,
  mediaUrl: `/api/assets/${assetId}/thumbnail?size=preview`,
  mimeType: 'image/jpeg',
  fileName: `${assetId}.jpg`,
  width: 1024,
  height: 768,
  ...overrides,
});

const makeAlbumSummary = (overrides: Partial<AgentAlbumSummary> = {}): AgentAlbumSummary => ({
  id: newUuid(),
  albumName: 'Trip',
  description: 'Summer trip',
  ownerId: newUuid(),
  assetCount: 1,
  startDate: now,
  endDate: now,
  albumThumbnailAssetId: null,
  ...overrides,
});

const makeAlbumDetail = (overrides: Partial<AgentAlbumDetail> = {}): AgentAlbumDetail => {
  const assetIds = overrides.assetIds ?? [newUuid()];
  return {
    ...makeAlbumSummary({ assetCount: assetIds.length, ...overrides }),
    assetIds,
  };
};

const makeSpaceRow = (overrides: Partial<AgentSpaceSummary> = {}) => ({
  id: newUuid(),
  name: 'Family',
  description: null,
  color: 'primary',
  createdById: newUuid(),
  assetCount: 0,
  memberCount: 0,
  thumbnailAssetId: null,
  thumbnailCropY: null,
  faceRecognitionEnabled: true,
  petsEnabled: true,
  lastActivityAt: null,
  recentAssetIds: [],
  createdAt: now,
  updatedAt: now,
  createId: newUuid(),
  updateId: newUuid(),
  ...overrides,
});

const makeSpaceMember = (overrides: Record<string, unknown> = {}) => ({
  spaceId: newUuid(),
  userId: newUuid(),
  role: 'viewer',
  joinedAt: now,
  showInTimeline: true,
  sharePersonMetadata: true,
  lastViewedAt: null,
  name: 'Sam',
  email: 'sam@example.com',
  profileImagePath: '',
  profileChangedAt: now,
  avatarColor: null,
  ...overrides,
});

const makeUserResult = (overrides: Partial<AgentUserLookupResult> = {}): AgentUserLookupResult => ({
  userId: newUuid(),
  name: 'Sam Example',
  email: 'sam@example.com',
  avatarColor: null,
  profileImagePath: null,
  ...overrides,
});

const makeUserResponse = (overrides: Record<string, unknown> = {}) => ({
  id: newUuid(),
  name: 'Sam Example',
  email: 'sam@example.com',
  avatarColor: null,
  profileImagePath: '',
  profileChangedAt: '2026-05-14T12:00:00.000Z',
  ...overrides,
});

describe(AgentToolService.name, () => {
  let sut: AgentToolService;
  let accessRepository: ReturnType<typeof newAccessRepositoryMock>;
  let assetRepository: ReturnType<typeof newAssetRepositoryMock>;
  let searchRepository: ReturnType<typeof automock<SearchRepository>>;
  let albumRepository: ReturnType<typeof automock<AlbumRepository>>;
  let sharedSpaceRepository: ReturnType<typeof automock<SharedSpaceRepository>>;
  let sessionRepository: ReturnType<typeof automock<AgentSessionRepository>>;
  let toolCallRepository: ReturnType<typeof automock<AgentToolCallRepository>>;
  let agentRunnerService: ReturnType<typeof automock<AgentRunnerService>>;
  let userService: { search: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    accessRepository = newAccessRepositoryMock();
    assetRepository = newAssetRepositoryMock();
    searchRepository = automock(SearchRepository, { args: [{} as never] });
    albumRepository = automock(AlbumRepository, { args: [{} as never] });
    sharedSpaceRepository = automock(SharedSpaceRepository, { args: [{} as never] });
    sessionRepository = automock(AgentSessionRepository, { args: [{} as never] });
    toolCallRepository = automock(AgentToolCallRepository, { args: [{} as never] });
    agentRunnerService = automock(AgentRunnerService, { args: [] as never });
    userService = { search: vi.fn() };
    sut = new AgentToolService(
      accessRepository as unknown as AccessRepository,
      assetRepository as unknown as AssetRepository,
      searchRepository,
      albumRepository,
      sharedSpaceRepository,
      sessionRepository,
      toolCallRepository,
      agentRunnerService,
      userService as unknown as UserService,
    );

    sessionRepository.update.mockImplementation((_userId, _id, dto) =>
      Promise.resolve(makeSession(dto as Partial<AgentSession>)),
    );
    toolCallRepository.create.mockImplementation((dto) =>
      Promise.resolve(
        makeToolCall({
          ...(dto as Partial<AgentToolCall>),
          id: newUuid(),
          startedAt: now,
          completedAt: (dto.completedAt as Date | null | undefined) ?? null,
        }),
      ),
    );
    toolCallRepository.transition.mockImplementation((_sessionId, _id, _expectedStatus, dto) =>
      Promise.resolve(makeToolCall({ ...(dto as Partial<AgentToolCall>), id: _id, sessionId: _sessionId })),
    );
    toolCallRepository.createWithSessionLimit.mockImplementation((dto) =>
      Promise.resolve({
        status: 'created',
        toolCall: makeToolCall({
          ...(dto as Partial<AgentToolCall>),
          id: newUuid(),
          startedAt: now,
          completedAt: (dto.completedAt as Date | null | undefined) ?? null,
        }),
      }),
    );
    toolCallRepository.transitionWithSessionLimit.mockImplementation((_sessionId, _id, _expectedStatus, dto) =>
      Promise.resolve({
        status: 'transitioned',
        toolCall: makeToolCall({ ...(dto as Partial<AgentToolCall>), id: _id, sessionId: _sessionId }),
      }),
    );
    toolCallRepository.getCountedAssetCountBySession.mockResolvedValue(0);
    toolCallRepository.getCountedAssetCountBySessionAndDataClass.mockResolvedValue(0);
    albumRepository.getAgentAlbums.mockResolvedValue([]);
    albumRepository.getAgentAlbumById.mockResolvedValue(null);
    searchRepository.searchMetadata.mockResolvedValue({ items: [], hasNextPage: false });
    sharedSpaceRepository.getAllByUserId.mockResolvedValue([]);
    sharedSpaceRepository.getById.mockImplementation(() => Promise.resolve(void 0));
    sharedSpaceRepository.getMember.mockImplementation(() => Promise.resolve(void 0));
    sharedSpaceRepository.getMembers.mockResolvedValue([]);
    sharedSpaceRepository.getSpaceIdsForTimeline.mockResolvedValue([]);
    sharedSpaceRepository.getAssetCount.mockResolvedValue(0);
    sharedSpaceRepository.getRecentAssets.mockResolvedValue([]);
    sharedSpaceRepository.getAssetIdsInSpacePage.mockResolvedValue([]);
    agentRunnerService.resumeAfterToolApproval.mockResolvedValue();
    userService.search.mockResolvedValue([]);
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
    toolCallRepository.createWithSessionLimit.mockResolvedValue({
      status: 'created',
      toolCall: pending,
    });

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
    expect(toolCallRepository.createWithSessionLimit).toHaveBeenCalledWith(
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
      expect.objectContaining({
        sessionId: session.id,
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        redactedRequestMetadata: { assetIds },
        error: 'Session policy allows at most 1000 assets per session',
      }),
      AgentToolDataClass.Metadata,
      session.permissionPlanSnapshot.limits.maxAssetsPerSession,
    );
    expect(toolCallRepository.create).not.toHaveBeenCalled();
    expect(toolCallRepository.getCountedAssetCountBySession).not.toHaveBeenCalled();
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.WaitingForToolApproval,
    });
  });

  it('accepts metadata reads while the session is waiting for plan review', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({ userId: auth.user.id, status: AgentSessionStatus.WaitingForPlanReview });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));

    const result = await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(result.status).toBe('approval-required');
    expect(toolCallRepository.createWithSessionLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        status: AgentToolCallStatus.PendingApproval,
        redactedRequestMetadata: { assetIds },
      }),
      expect.objectContaining({
        sessionId: session.id,
        status: AgentToolCallStatus.Denied,
        redactedRequestMetadata: { assetIds },
        error: 'Session policy allows at most 1000 assets per session',
      }),
      AgentToolDataClass.Metadata,
      session.permissionPlanSnapshot.limits.maxAssetsPerSession,
    );
    expect(toolCallRepository.create).not.toHaveBeenCalled();
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

  it('executes metadata reads immediately when approval mode is plan-only', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({ userId: auth.user.id, approvalMode: AgentApprovalMode.PlanOnly });
    const asset = makeMetadata(assetIds[0]);

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentMetadataByIds.mockResolvedValue([asset] as never);
    toolCallRepository.create.mockResolvedValue(
      makeToolCall({
        sessionId: session.id,
        toolName: AgentToolName.ReadAssetMetadata,
        status: AgentToolCallStatus.Executing,
        approvalDecision: AgentToolApprovalDecision.Approved,
        redactedRequestMetadata: { assetIds },
        assetCount: 1,
      }),
    );

    const result = await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      assets: [expect.objectContaining({ id: assetIds[0] })],
    });
    expect(assetRepository.getAgentMetadataByIds).toHaveBeenCalledWith(assetIds);
  });

  it.each([
    {
      name: 'Strict + searchAssets',
      approvalMode: AgentApprovalMode.Strict,
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string) =>
        sut.searchAssets(auth, sessionId, { filters: {}, limit: 1 }),
      expectedStatus: 'approval-required',
    },
    {
      name: 'Strict + readAssetPreviews',
      approvalMode: AgentApprovalMode.Strict,
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetIds: string[]) =>
        sut.readAssetPreviews(auth, sessionId, { assetIds }),
      expectedStatus: 'approval-required',
    },
    {
      name: 'AskOnEscalation + searchAssets',
      approvalMode: AgentApprovalMode.AskOnEscalation,
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string) =>
        sut.searchAssets(auth, sessionId, { filters: {}, limit: 1 }),
      expectedStatus: 'success',
    },
    {
      name: 'AskOnEscalation + readAssetPreviews',
      approvalMode: AgentApprovalMode.AskOnEscalation,
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetIds: string[]) =>
        sut.readAssetPreviews(auth, sessionId, { assetIds }),
      expectedStatus: 'approval-required',
    },
    {
      name: 'PlanOnly + searchAssets',
      approvalMode: AgentApprovalMode.PlanOnly,
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string) =>
        sut.searchAssets(auth, sessionId, { filters: {}, limit: 1 }),
      expectedStatus: 'success',
    },
    {
      name: 'PlanOnly + readAssetPreviews',
      approvalMode: AgentApprovalMode.PlanOnly,
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetIds: string[]) =>
        sut.readAssetPreviews(auth, sessionId, { assetIds }),
      expectedStatus: 'success',
    },
  ])('$name follows the read-tool approval matrix', async ({ approvalMode, call, expectedStatus }) => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      approvalMode,
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: false },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: false,
          allowOriginalsForExternalProviders: false,
        },
        limits: { ...permissionPlanSnapshot.limits, maxPreviewsPerToolCall: 5 },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.searchAgentMetadata.mockResolvedValue({ assets: [makeMetadata(assetIds[0])], nextPage: null });
    assetRepository.getAgentPreviewReferencesByIds.mockResolvedValue([makeMediaReference(assetIds[0])]);

    const result = await call(auth, session.id, assetIds);

    expect(result.status).toBe(expectedStatus);
  });

  it('denies YOLO original reads for external providers unless explicitly allowed and skips access checks', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: true },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: true,
          allowOriginalsForExternalProviders: false,
        },
        limits: { ...permissionPlanSnapshot.limits, maxOriginalsPerToolCall: 5 },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);

    const result = await sut.readAssetOriginals(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Agent provider exposure policy only allows originals for local or self-hosted providers',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(accessRepository.asset.checkOwnerAccess).not.toHaveBeenCalled();
    expect(assetRepository.getAgentOriginalReferencesByIds).not.toHaveBeenCalled();
  });

  it('allows original reads for OpenAICompatible credentials when policy allows originals and plan-only mode', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      credentialSnapshot: {
        id: newUuid(),
        providerType: AgentProviderType.OpenAICompatible,
        label: 'Local compatible',
        baseUrl: 'http://localhost:11434/v1',
        models: ['local-model'],
        defaultModel: 'local-model',
      },
      modelSnapshot: { providerCredentialId: newUuid(), model: 'local-model' },
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: true },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: true,
          allowOriginalsForExternalProviders: false,
        },
        limits: { ...permissionPlanSnapshot.limits, maxOriginalsPerToolCall: 5, maxOriginalsPerSession: 5 },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentOriginalReferencesByIds.mockResolvedValue([makeMediaReference(assetIds[0])]);

    const result = await sut.readAssetOriginals(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      originals: [expect.objectContaining({ assetId: assetIds[0] })],
    });
  });

  it('auto-executes YOLO metadata reads with an executing audit row and completed transition', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: true },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: true,
          allowOriginalsForExternalProviders: true,
        },
        limits: { ...permissionPlanSnapshot.limits, maxPreviewsPerToolCall: 5, maxOriginalsPerToolCall: 5 },
      }),
    });
    const executing = makeToolCall({
      sessionId: session.id,
      toolName: AgentToolName.ReadAssetMetadata,
      status: AgentToolCallStatus.Executing,
      approvalDecision: AgentToolApprovalDecision.Approved,
      redactedRequestMetadata: { assetIds },
      dataClass: AgentToolDataClass.Metadata,
      assetCount: 1,
    });
    const completed = makeToolCall({
      ...executing,
      status: AgentToolCallStatus.Completed,
      responseSummary: 'Returned metadata for 1 asset',
      redactedResponseMetadata: { assetIds },
      completedAt,
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentMetadataByIds.mockResolvedValue([makeMetadata(assetIds[0])] as never);
    toolCallRepository.createWithSessionLimit.mockResolvedValue({ status: 'created', toolCall: executing });
    toolCallRepository.transition.mockResolvedValue(completed);

    const result = await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({
        id: executing.id,
        status: AgentToolCallStatus.Completed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        dataClass: AgentToolDataClass.Metadata,
        assetCount: 1,
        albumCount: 0,
      }),
      assets: [expect.objectContaining({ id: assetIds[0] })],
    });
    expect(toolCallRepository.createWithSessionLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        toolName: AgentToolName.ReadAssetMetadata,
        status: AgentToolCallStatus.Executing,
        approvalDecision: AgentToolApprovalDecision.Approved,
        redactedRequestMetadata: { assetIds },
        dataClass: AgentToolDataClass.Metadata,
        assetCount: 1,
        albumCount: 0,
      }),
      expect.objectContaining({
        sessionId: session.id,
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        redactedRequestMetadata: { assetIds },
        error: 'Session policy allows at most 1000 assets per session',
      }),
      AgentToolDataClass.Metadata,
      session.permissionPlanSnapshot.limits.maxAssetsPerSession,
    );
    expect(toolCallRepository.create).not.toHaveBeenCalled();
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      executing.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Completed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        responseSummary: 'Returned metadata for 1 asset',
        redactedResponseMetadata: { assetIds },
        assetCount: 1,
        albumCount: 0,
      }),
    );
    expect(sessionRepository.update).not.toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.WaitingForToolApproval,
    });
  });

  it.each([
    {
      name: 'searchAssets',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, _assetId: string) =>
        sut.searchAssets(auth, sessionId, { filters: {}, limit: 1 }),
      arrange: (assetId: string) => {
        assetRepository.searchAgentMetadata.mockResolvedValue({ assets: [makeMetadata(assetId)], nextPage: null });
        accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
      },
      resultKey: 'assets',
      dataClass: AgentToolDataClass.Metadata,
      assetCount: 1,
      albumCount: 0,
    },
    {
      name: 'readAssetMetadata',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetId: string) =>
        sut.readAssetMetadata(auth, sessionId, { assetIds: [assetId] }),
      arrange: (assetId: string) => {
        assetRepository.getAgentMetadataByIds.mockResolvedValue([makeMetadata(assetId)] as never);
        accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
      },
      resultKey: 'assets',
      dataClass: AgentToolDataClass.Metadata,
      assetCount: 1,
      albumCount: 0,
    },
    {
      name: 'readAssetPreviews',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetId: string) =>
        sut.readAssetPreviews(auth, sessionId, { assetIds: [assetId] }),
      arrange: (assetId: string) => {
        assetRepository.getAgentPreviewReferencesByIds.mockResolvedValue([makeMediaReference(assetId)]);
        accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
      },
      resultKey: 'previews',
      dataClass: AgentToolDataClass.Previews,
      assetCount: 1,
      albumCount: 0,
    },
    {
      name: 'readAssetOriginals',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetId: string) =>
        sut.readAssetOriginals(auth, sessionId, { assetIds: [assetId] }),
      arrange: (assetId: string) => {
        assetRepository.getAgentOriginalReferencesByIds.mockResolvedValue([makeMediaReference(assetId)]);
        accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
      },
      resultKey: 'originals',
      dataClass: AgentToolDataClass.Originals,
      assetCount: 1,
      albumCount: 0,
    },
    {
      name: 'listAlbums',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string) =>
        sut.listAlbums(auth, sessionId, {}),
      arrange: (_assetId: string, auth: ReturnType<typeof AuthFactory.create>) => {
        albumRepository.getAgentAlbums.mockResolvedValue([makeAlbumSummary({ ownerId: auth.user.id })]);
      },
      resultKey: 'albums',
      dataClass: AgentToolDataClass.Metadata,
      assetCount: 0,
      albumCount: 1,
    },
    {
      name: 'readAlbum',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetId: string, albumId: string) =>
        sut.readAlbum(auth, sessionId, { albumId }),
      arrange: (assetId: string, _auth: ReturnType<typeof AuthFactory.create>, albumId: string) => {
        accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
        albumRepository.getAgentAlbumById.mockResolvedValue(makeAlbumDetail({ id: albumId, assetIds: [assetId] }));
      },
      resultKey: 'album',
      dataClass: AgentToolDataClass.Metadata,
      assetCount: 1,
      albumCount: 1,
    },
  ])(
    '$name auto-executes in YOLO when policy allows without creating a pending approval row',
    async ({ call, arrange, resultKey, dataClass, assetCount, albumCount }) => {
      const auth = AuthFactory.create();
      const assetId = newUuid();
      const albumId = newUuid();
      const session = makeSession({
        userId: auth.user.id,
        approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
        credentialSnapshot: {
          id: newUuid(),
          providerType: AgentProviderType.OpenAICompatible,
          label: 'Local compatible',
          baseUrl: 'http://localhost:11434/v1',
          models: ['local-model'],
          defaultModel: 'local-model',
        },
        permissionPlanSnapshot: makePlan({
          read: { metadata: true, previews: true, originals: true },
          providerExposure: {
            metadata: true,
            previews: true,
            originals: true,
            allowOriginalsForExternalProviders: false,
          },
          limits: { ...permissionPlanSnapshot.limits, maxPreviewsPerToolCall: 5, maxOriginalsPerToolCall: 5 },
        }),
      });

      sessionRepository.getById.mockResolvedValue(session);
      arrange(assetId, auth, albumId);
      toolCallRepository.transition.mockImplementation((_sessionId, _id, _expectedStatus, dto) =>
        Promise.resolve(
          makeToolCall({
            ...(dto as Partial<AgentToolCall>),
            id: _id,
            sessionId: _sessionId,
            dataClass,
            assetCount,
            albumCount,
          }),
        ),
      );

      const result = await call(auth, session.id, assetId, albumId);

      expect(result.status).toBe('success');
      expect(result.toolCall).toEqual(
        expect.objectContaining({
          status: AgentToolCallStatus.Completed,
          approvalDecision: AgentToolApprovalDecision.Approved,
          dataClass,
          assetCount,
          albumCount,
        }),
      );
      expect(result).toHaveProperty(resultKey);
      expect(toolCallRepository.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: AgentToolCallStatus.PendingApproval }),
      );
      expect(toolCallRepository.createWithSessionLimit).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: AgentToolCallStatus.PendingApproval }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(sessionRepository.update).not.toHaveBeenCalledWith(auth.user.id, session.id, {
        status: AgentSessionStatus.WaitingForToolApproval,
      });
    },
  );

  it.each([
    {
      name: 'metadata read disabled',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetIds: string[]) =>
        sut.readAssetMetadata(auth, sessionId, { assetIds }),
      permissionPlanSnapshot: makePlan({ read: { metadata: false, previews: true, originals: true } }),
      reason: 'Agent permission policy does not allow metadata reads',
      repositoryRead: () => assetRepository.getAgentMetadataByIds,
    },
    {
      name: 'metadata provider exposure disabled',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetIds: string[]) =>
        sut.readAssetMetadata(auth, sessionId, { assetIds }),
      permissionPlanSnapshot: makePlan({
        providerExposure: {
          metadata: false,
          previews: true,
          originals: true,
          allowOriginalsForExternalProviders: true,
        },
      }),
      reason: 'Agent provider exposure policy does not allow metadata reads',
      repositoryRead: () => assetRepository.getAgentMetadataByIds,
    },
    {
      name: 'preview read disabled',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetIds: string[]) =>
        sut.readAssetPreviews(auth, sessionId, { assetIds }),
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: false, originals: true },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: true,
          allowOriginalsForExternalProviders: true,
        },
      }),
      reason: 'Agent permission policy does not allow preview reads',
      repositoryRead: () => assetRepository.getAgentPreviewReferencesByIds,
    },
    {
      name: 'preview provider exposure disabled',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetIds: string[]) =>
        sut.readAssetPreviews(auth, sessionId, { assetIds }),
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: true },
        providerExposure: {
          metadata: true,
          previews: false,
          originals: true,
          allowOriginalsForExternalProviders: true,
        },
      }),
      reason: 'Agent provider exposure policy does not allow preview reads',
      repositoryRead: () => assetRepository.getAgentPreviewReferencesByIds,
    },
    {
      name: 'original read disabled',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetIds: string[]) =>
        sut.readAssetOriginals(auth, sessionId, { assetIds }),
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: false },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: true,
          allowOriginalsForExternalProviders: true,
        },
      }),
      reason: 'Agent permission policy does not allow original reads',
      repositoryRead: () => assetRepository.getAgentOriginalReferencesByIds,
    },
    {
      name: 'original provider exposure disabled',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetIds: string[]) =>
        sut.readAssetOriginals(auth, sessionId, { assetIds }),
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: true },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: false,
          allowOriginalsForExternalProviders: true,
        },
      }),
      reason: 'Agent provider exposure policy does not allow original reads',
      repositoryRead: () => assetRepository.getAgentOriginalReferencesByIds,
    },
  ])(
    'YOLO still denies policy/provider-exposure case: $name',
    async ({ call, permissionPlanSnapshot, reason, repositoryRead }) => {
      const auth = AuthFactory.create();
      const assetIds = [newUuid()];
      const session = makeSession({
        userId: auth.user.id,
        approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
        permissionPlanSnapshot,
      });

      sessionRepository.getById.mockResolvedValue(session);

      const result = await call(auth, session.id, assetIds);

      expect(result).toEqual({
        status: 'denied',
        reason,
        toolCall: expect.objectContaining({
          status: AgentToolCallStatus.Denied,
          approvalDecision: AgentToolApprovalDecision.Denied,
          error: reason,
        }),
      });
      expect(toolCallRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AgentToolCallStatus.Denied,
          approvalDecision: AgentToolApprovalDecision.Denied,
          error: reason,
        }),
      );
      expect(repositoryRead()).not.toHaveBeenCalled();
    },
  );

  it('denies YOLO inaccessible assets before execution', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({ userId: auth.user.id, approvalMode: AgentApprovalMode.DangerouslySkipPermissions });

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

  it('denies YOLO per-tool asset limit before access checks', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
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

  it('denies YOLO per-session asset limit through atomic executing creation after access checks', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
      permissionPlanSnapshot: makePlan({ limits: { ...permissionPlanSnapshot.limits, maxAssetsPerSession: 2 } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    toolCallRepository.createWithSessionLimit.mockResolvedValue({
      status: 'limit-exceeded',
      toolCall: makeToolCall({
        sessionId: session.id,
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        redactedRequestMetadata: { assetIds },
        error: 'Session policy allows at most 2 assets per session',
        completedAt,
      }),
    });

    const result = await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Session policy allows at most 2 assets per session',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(accessRepository.asset.checkOwnerAccess).toHaveBeenCalledWith(auth.user.id, new Set(assetIds), false);
    expect(toolCallRepository.createWithSessionLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        status: AgentToolCallStatus.Executing,
        approvalDecision: AgentToolApprovalDecision.Approved,
        redactedRequestMetadata: { assetIds },
      }),
      expect.objectContaining({
        sessionId: session.id,
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        redactedRequestMetadata: { assetIds },
        error: 'Session policy allows at most 2 assets per session',
      }),
      AgentToolDataClass.Metadata,
      2,
    );
    expect(toolCallRepository.create).not.toHaveBeenCalled();
    expect(toolCallRepository.getCountedAssetCountBySession).not.toHaveBeenCalled();
  });

  it('uses atomic pending creation for strict preview reads with requested assets', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: false },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: false,
          allowOriginalsForExternalProviders: false,
        },
        limits: {
          ...permissionPlanSnapshot.limits,
          maxPreviewsPerToolCall: 5,
          maxPreviewsPerSession: 3,
        },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));

    const result = await sut.readAssetPreviews(auth, session.id, { assetIds });

    expect(result.status).toBe('approval-required');
    expect(toolCallRepository.createWithSessionLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        toolName: AgentToolName.ReadAssetPreviews,
        status: AgentToolCallStatus.PendingApproval,
        redactedRequestMetadata: { assetIds },
        dataClass: AgentToolDataClass.Previews,
        assetCount: assetIds.length,
      }),
      expect.objectContaining({
        sessionId: session.id,
        status: AgentToolCallStatus.Denied,
        redactedRequestMetadata: { assetIds },
        error: 'Session policy allows at most 3 assets per session',
      }),
      AgentToolDataClass.Previews,
      3,
    );
    expect(toolCallRepository.getCountedAssetCountBySessionAndDataClass).not.toHaveBeenCalled();
    expect(toolCallRepository.create).not.toHaveBeenCalled();
  });

  it('backfills legacy preview session limits to the preview per-tool limit during execution', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const legacyLimits = { ...permissionPlanSnapshot.limits, maxPreviewsPerToolCall: 5 };
    delete legacyLimits.maxPreviewsPerSession;
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: false },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: false,
          allowOriginalsForExternalProviders: false,
        },
        limits: legacyLimits,
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));

    await sut.readAssetPreviews(auth, session.id, { assetIds });

    expect(toolCallRepository.createWithSessionLimit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ error: 'Session policy allows at most 5 assets per session' }),
      AgentToolDataClass.Previews,
      5,
    );
  });

  it('backfills legacy original session limits to the original per-tool limit during execution', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const legacyLimits = { ...permissionPlanSnapshot.limits, maxOriginalsPerToolCall: 5 };
    delete legacyLimits.maxOriginalsPerSession;
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      credentialSnapshot: {
        id: newUuid(),
        providerType: AgentProviderType.OpenAICompatible,
        label: 'Local compatible',
        baseUrl: 'http://localhost:11434/v1',
        models: ['local-model'],
        defaultModel: 'local-model',
      },
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: true },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: true,
          allowOriginalsForExternalProviders: false,
        },
        limits: legacyLimits,
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));

    await sut.readAssetOriginals(auth, session.id, { assetIds });

    expect(toolCallRepository.createWithSessionLimit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ error: 'Session policy allows at most 5 assets per session' }),
      AgentToolDataClass.Originals,
      5,
    );
  });

  it('denies immediate preview execution through atomic creation without repository reads when the session limit is exceeded', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: false },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: false,
          allowOriginalsForExternalProviders: false,
        },
        limits: {
          ...permissionPlanSnapshot.limits,
          maxPreviewsPerToolCall: 5,
          maxPreviewsPerSession: 1,
        },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    toolCallRepository.createWithSessionLimit.mockResolvedValue({
      status: 'limit-exceeded',
      toolCall: makeToolCall({
        sessionId: session.id,
        toolName: AgentToolName.ReadAssetPreviews,
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        redactedRequestMetadata: { assetIds },
        dataClass: AgentToolDataClass.Previews,
        assetCount: assetIds.length,
        error: 'Session policy allows at most 1 assets per session',
        completedAt,
      }),
    });

    const result = await sut.readAssetPreviews(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Session policy allows at most 1 assets per session',
      toolCall: expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        error: 'Session policy allows at most 1 assets per session',
      }),
    });
    expect(toolCallRepository.createWithSessionLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        status: AgentToolCallStatus.Executing,
        approvalDecision: AgentToolApprovalDecision.Approved,
        redactedRequestMetadata: { assetIds },
        dataClass: AgentToolDataClass.Previews,
        assetCount: assetIds.length,
      }),
      expect.objectContaining({
        sessionId: session.id,
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        redactedRequestMetadata: { assetIds },
        error: 'Session policy allows at most 1 assets per session',
      }),
      AgentToolDataClass.Previews,
      1,
    );
    expect(toolCallRepository.getCountedAssetCountBySessionAndDataClass).not.toHaveBeenCalled();
    expect(assetRepository.getAgentPreviewReferencesByIds).not.toHaveBeenCalled();
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

  it('denies YOLO locked shared-space assets without elevated locked access', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
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

  it('denies agent-hidden assets even when generic access checks allow the ids', async () => {
    const auth = AuthFactory.create();
    const visibleId = newUuid();
    const hiddenId = newUuid();
    const assetIds = [visibleId, hiddenId];
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: false, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set([visibleId]));

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
    expect(accessRepository.asset.checkOwnerAccess).toHaveBeenLastCalledWith(
      elevatedAuth.user.id,
      new Set(assetIds),
      true,
    );

    await sut.readAssetMetadata(plainAuth, session.id, { assetIds });
    expect(accessRepository.asset.checkOwnerAccess).toHaveBeenLastCalledWith(
      elevatedAuth.user.id,
      new Set(assetIds),
      false,
    );
  });

  it('denies YOLO owned locked assets without elevated locked access', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: false, locked: true } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set());

    const result = await sut.readAssetMetadata(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'denied',
      reason: 'One or more assets are not accessible',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(accessRepository.asset.checkOwnerAccess).toHaveBeenCalledWith(auth.user.id, new Set(assetIds), false);
    expect(assetRepository.getAgentMetadataByIds).not.toHaveBeenCalled();
  });

  it('passes shared-space and locked scope to search only when permission plan and elevated auth allow it', async () => {
    const elevatedAuth = AuthFactory.from().session({ hasElevatedPermission: true }).build();
    const runnerAuth = AuthFactory.from({ id: elevatedAuth.user.id }).session({ hasElevatedPermission: false }).build();
    const session = makeSession({
      userId: elevatedAuth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: true, locked: true } }),
    });

    sessionRepository.getById.mockResolvedValue(session);

    await sut.searchAssets(elevatedAuth, session.id, { filters: {}, limit: 1 });
    expect(searchRepository.searchMetadata).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ userIds: [elevatedAuth.user.id] }),
    );

    await sut.searchAssets(runnerAuth, session.id, { filters: {}, limit: 1 });
    expect(searchRepository.searchMetadata).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ userIds: [elevatedAuth.user.id] }),
    );
  });

  it('returns shared-space search assets only when permission plan allows shared spaces', async () => {
    const auth = AuthFactory.create();
    const sharedAssetId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: false, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkSpaceAccess.mockResolvedValue(new Set([sharedAssetId]));
    sharedSpaceRepository.getSpaceIdsForTimeline.mockResolvedValue([{ spaceId: newUuid() }]);
    searchRepository.searchMetadata.mockResolvedValue({ items: [{ id: sharedAssetId }] as never, hasNextPage: false });
    assetRepository.getAgentMetadataByIds.mockResolvedValue([makeMetadata(sharedAssetId)] as never);

    const result = await sut.searchAssets(auth, session.id, { filters: {}, limit: 1 });

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      assets: [expect.objectContaining({ id: sharedAssetId })],
      returnedCount: 1,
      hasMore: false,
      nextPage: null,
    });
    expect(searchRepository.searchMetadata).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ userIds: [], timelineSpaceIds: expect.any(Array) }),
    );
  });

  it('returns search page metadata and stores defaulted request metadata without absent query', async () => {
    const auth = AuthFactory.create();
    const assetId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({
        limits: { ...permissionPlanSnapshot.limits, maxAssetsPerToolCall: 10_000, maxAssetsPerSession: 10_000 },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
    searchRepository.searchMetadata.mockResolvedValue({ items: [{ id: assetId }] as never, hasNextPage: true });
    assetRepository.getAgentMetadataByIds.mockResolvedValue([makeMetadata(assetId)] as never);

    const result = await sut.searchAssets(auth, session.id, {
      filters: { isFavorite: true },
      limit: 1,
    });

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      assets: [expect.objectContaining({ id: assetId })],
      returnedCount: 1,
      hasMore: true,
      nextPage: '2',
    });
    expect(toolCallRepository.createWithSessionLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        requestSummary: 'Search metadata assets (limit 1)',
        redactedRequestMetadata: expect.not.objectContaining({
          query: expect.anything(),
        }),
      }),
      expect.any(Object),
      AgentToolDataClass.Metadata,
      expect.any(Number),
    );
    expect(toolCallRepository.createWithSessionLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        redactedRequestMetadata: {
          mode: 'metadata',
          filters: { isFavorite: true },
          limit: 1,
          page: 1,
          order: 'desc',
        },
      }),
      expect.any(Object),
      AgentToolDataClass.Metadata,
      expect.any(Number),
    );
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      expect.any(String),
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Completed,
        redactedResponseMetadata: { assetIds: [assetId] },
        assetCount: 1,
      }),
    );
    expect(assetRepository.searchAgentMetadata).not.toHaveBeenCalled();
  });

  it('uses contract defaults for empty service-level search requests', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({
        limits: { ...permissionPlanSnapshot.limits, maxAssetsPerToolCall: 10_000, maxAssetsPerSession: 10_000 },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);

    const result = await sut.searchAssets(auth, session.id, {});

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      assets: [],
      returnedCount: 0,
      hasMore: false,
      nextPage: null,
    });
    expect(toolCallRepository.createWithSessionLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        requestSummary: 'Search metadata assets (limit 10000)',
        redactedRequestMetadata: {
          mode: 'metadata',
          filters: {},
          limit: 10_000,
          page: 1,
          order: 'desc',
        },
        assetCount: 10_000,
      }),
      expect.any(Object),
      AgentToolDataClass.Metadata,
      expect.any(Number),
    );
    expect(searchRepository.searchMetadata).toHaveBeenCalledWith({ page: 1, size: 10_000 }, expect.any(Object));
    expect(assetRepository.searchAgentMetadata).not.toHaveBeenCalled();
  });

  it.each([
    [
      { mode: 'smart', query: 'beach', filters: {}, limit: 5, page: 1, order: 'desc' },
      'smart search is not available yet',
    ],
    [
      { mode: 'description', query: 'birthday', filters: {}, limit: 5, page: 1, order: 'desc' },
      'description search is not available yet',
    ],
    [
      { mode: 'ocr', query: 'invoice', filters: {}, limit: 5, page: 1, order: 'desc' },
      'ocr search is not available yet',
    ],
    [
      { mode: 'filename', query: 'IMG_2026', filters: {}, limit: 5, page: 1, order: 'desc' },
      'filename search is not available yet',
    ],
    [
      { mode: 'metadata', query: 'beach', filters: {}, limit: 5, page: 1, order: 'desc' },
      'query is only supported for smart, description, ocr, and filename search modes',
    ],
    [{ mode: 'metadata', filters: {}, limit: 5, page: 2, order: 'desc' }, 'page search is not available yet'],
    [{ mode: 'metadata', filters: {}, limit: 5, page: 1, order: 'asc' }, 'asc order search is not available yet'],
    [
      { mode: 'metadata', filters: {}, limit: 5, page: 1, order: 'relevance' },
      'relevance order search is not available yet',
    ],
  ] satisfies Array<[AgentSearchAssetsToolRequestDto, string]>)(
    'denies future search contract fields before repository execution: %#',
    async (request, reason) => {
      const auth = AuthFactory.create();
      const session = makeSession({
        userId: auth.user.id,
        approvalMode: AgentApprovalMode.PlanOnly,
        permissionPlanSnapshot: makePlan(),
      });

      sessionRepository.getById.mockResolvedValue(session);

      const result = await sut.searchAssets(auth, session.id, request);

      expect(result).toEqual({
        status: 'denied',
        reason,
        toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied, error: reason }),
      });
      expect(assetRepository.searchAgentMetadata).not.toHaveBeenCalled();
    },
  );

  it('denies spacePersonIds without spaceId before repository execution', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);

    const result = await sut.searchAssets(auth, session.id, {
      mode: 'metadata',
      filters: { spacePersonIds: [newUuid()] },
      limit: 5,
      page: 1,
      order: 'desc',
    });

    expect(result).toEqual({
      status: 'denied',
      reason: 'spacePersonIds requires spaceId',
      toolCall: expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        error: 'spacePersonIds requires spaceId',
      }),
    });
    expect(assetRepository.searchAgentMetadata).not.toHaveBeenCalled();
  });

  it('denies conflicting spaceId and withSharedSpaces before repository execution', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);

    const result = await sut.searchAssets(auth, session.id, {
      mode: 'metadata',
      filters: { spaceId: newUuid(), withSharedSpaces: true },
      limit: 5,
      page: 1,
      order: 'desc',
    });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Cannot use both spaceId and withSharedSpaces',
      toolCall: expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        error: 'Cannot use both spaceId and withSharedSpaces',
      }),
    });
    expect(assetRepository.searchAgentMetadata).not.toHaveBeenCalled();
  });

  it('denies withSharedSpaces in owned-only permission plans before repository execution', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: false, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);

    const result = await sut.searchAssets(auth, session.id, {
      mode: 'metadata',
      filters: { withSharedSpaces: true },
      limit: 5,
      page: 1,
      order: 'desc',
    });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Shared spaces are not accessible for this session',
      toolCall: expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        error: 'Shared spaces are not accessible for this session',
      }),
    });
    expect(assetRepository.searchAgentMetadata).not.toHaveBeenCalled();
  });

  it('denies stale spaceId withSharedSpaces filters generically after checking membership before repository execution', async () => {
    const auth = AuthFactory.create();
    const spaceId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    sharedSpaceRepository.getMember.mockResolvedValue(null);

    const result = await sut.searchAssets(auth, session.id, {
      mode: 'metadata',
      filters: { spaceId },
      limit: 5,
      page: 1,
      order: 'desc',
    });

    expect(sharedSpaceRepository.getMember).toHaveBeenCalledWith(spaceId, auth.user.id);
    expect(result).toEqual({
      status: 'denied',
      reason: 'One or more search filters are not accessible',
      toolCall: expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        error: 'One or more search filters are not accessible',
      }),
    });
    expect(assetRepository.searchAgentMetadata).not.toHaveBeenCalled();
  });

  it('denies locked visibility unless permission plan and auth both allow locked assets before repository execution', async () => {
    const cases = [
      {
        plan: makePlan({ assetScope: { owned: true, sharedSpaces: false, locked: false } }),
        auth: AuthFactory.from().session({ hasElevatedPermission: true }).build(),
      },
      {
        plan: makePlan({ assetScope: { owned: true, sharedSpaces: false, locked: true } }),
        auth: AuthFactory.from().session({ hasElevatedPermission: false }).build(),
      },
    ];

    for (const testCase of cases) {
      vi.clearAllMocks();
      toolCallRepository.create.mockImplementation((dto) =>
        Promise.resolve(
          makeToolCall({
            ...(dto as Partial<AgentToolCall>),
            id: newUuid(),
            startedAt: now,
            completedAt: (dto.completedAt as Date | null | undefined) ?? null,
          }),
        ),
      );
      const session = makeSession({
        userId: testCase.auth.user.id,
        approvalMode: AgentApprovalMode.PlanOnly,
        permissionPlanSnapshot: testCase.plan,
      });

      sessionRepository.getById.mockResolvedValue(session);

      const result = await sut.searchAssets(testCase.auth, session.id, {
        mode: 'metadata',
        filters: { visibility: AssetVisibility.Locked },
        limit: 5,
        page: 1,
        order: 'desc',
      });

      expect(result).toEqual({
        status: 'denied',
        reason: 'Locked photos require elevated permission',
        toolCall: expect.objectContaining({
          status: AgentToolCallStatus.Denied,
          error: 'Locked photos require elevated permission',
        }),
      });
      expect(assetRepository.searchAgentMetadata).not.toHaveBeenCalled();
    }
  });

  it('allows locked visibility when permission plan and auth both allow locked assets', async () => {
    const auth = AuthFactory.from().session({ hasElevatedPermission: true }).build();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: false, locked: true } }),
    });

    sessionRepository.getById.mockResolvedValue(session);

    const result = await sut.searchAssets(auth, session.id, {
      mode: 'metadata',
      filters: { visibility: AssetVisibility.Locked },
      limit: 5,
      page: 1,
      order: 'desc',
    });

    expect(result).toEqual(expect.objectContaining({ status: 'success' }));
    expect(searchRepository.searchMetadata).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ visibility: AssetVisibility.Locked }),
    );
  });

  it('Gallery search semantics route metadata filters through searchMetadata and hydrate in search order', async () => {
    const auth = AuthFactory.create();
    const firstAssetId = newUuid();
    const secondAssetId = newUuid();
    const tagId = newUuid();
    const albumId = newUuid();
    const personId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({
        assetScope: { owned: true, sharedSpaces: false, locked: false },
        limits: { ...permissionPlanSnapshot.limits, maxAssetsPerToolCall: 10, maxAssetsPerSession: 10 },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.person.checkOwnerAccess.mockResolvedValue(new Set([personId]));
    accessRepository.tag.checkOwnerAccess.mockResolvedValue(new Set([tagId]));
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([firstAssetId, secondAssetId]));
    searchRepository.searchMetadata.mockResolvedValue({
      items: [{ id: secondAssetId }, { id: firstAssetId }] as never,
      hasNextPage: true,
    });
    assetRepository.getAgentMetadataByIds.mockResolvedValue([
      makeMetadata(firstAssetId),
      makeMetadata(secondAssetId),
    ] as never);

    const result = await sut.searchAssets(auth, session.id, {
      mode: 'metadata',
      filters: {
        createdAfter: new Date('2026-05-01T00:00:00.000Z'),
        createdBefore: new Date('2026-05-31T23:59:59.999Z'),
        rating: null,
        tagIds: [tagId],
        albumIds: [albumId],
        personIds: [personId],
      },
      limit: 2,
      page: 1,
      order: 'desc',
    });

    expect(searchRepository.searchMetadata).toHaveBeenCalledWith(
      { page: 1, size: 2 },
      expect.objectContaining({
        userIds: [auth.user.id],
        createdAfter: new Date('2026-05-01T00:00:00.000Z'),
        createdBefore: new Date('2026-05-31T23:59:59.999Z'),
        rating: null,
        tagIds: [tagId],
        albumIds: [albumId],
        personIds: [personId],
      }),
    );
    expect(assetRepository.getAgentMetadataByIds).toHaveBeenCalledWith([secondAssetId, firstAssetId]);
    expect(assetRepository.searchAgentMetadata).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        status: 'success',
        returnedCount: 2,
        hasMore: true,
        nextPage: '2',
        assets: [expect.objectContaining({ id: secondAssetId }), expect.objectContaining({ id: firstAssetId })],
      }),
    );
  });

  it('shared-space-only search uses empty user IDs and timeline space IDs from shared spaces', async () => {
    const auth = AuthFactory.create();
    const spaceId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: false, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    sharedSpaceRepository.getSpaceIdsForTimeline.mockResolvedValue([{ spaceId }]);

    await sut.searchAssets(auth, session.id, { mode: 'metadata', filters: {}, limit: 5, page: 1, order: 'desc' });

    expect(sharedSpaceRepository.getSpaceIdsForTimeline).toHaveBeenCalledWith(auth.user.id);
    expect(searchRepository.searchMetadata).toHaveBeenCalledWith(
      { page: 1, size: 5 },
      expect.objectContaining({ userIds: [], timelineSpaceIds: [spaceId] }),
    );
  });

  it('favorites with shared-space search includes owned user ID, timeline space IDs, and favorite filter', async () => {
    const auth = AuthFactory.create();
    const spaceId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    sharedSpaceRepository.getSpaceIdsForTimeline.mockResolvedValue([{ spaceId }]);

    await sut.searchAssets(auth, session.id, {
      mode: 'metadata',
      filters: { withSharedSpaces: true, isFavorite: true },
      limit: 5,
      page: 1,
      order: 'desc',
    });

    expect(searchRepository.searchMetadata).toHaveBeenCalledWith(
      { page: 1, size: 5 },
      expect.objectContaining({ userIds: [auth.user.id], timelineSpaceIds: [spaceId], isFavorite: true }),
    );
  });

  it('accessible people filters reach Gallery search', async () => {
    const auth = AuthFactory.create();
    const personId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.person.checkOwnerAccess.mockResolvedValue(new Set([personId]));
    accessRepository.person.checkSharedSpaceAccess.mockResolvedValue(new Set());

    await sut.searchAssets(auth, session.id, {
      mode: 'metadata',
      filters: { personIds: [personId] },
      limit: 5,
      page: 1,
      order: 'desc',
    });

    expect(searchRepository.searchMetadata).toHaveBeenCalledWith(
      { page: 1, size: 5 },
      expect.objectContaining({ personIds: [personId] }),
    );
  });

  it('space person filters use explicit space scope without broad timeline IDs', async () => {
    const auth = AuthFactory.create();
    const spaceId = newUuid();
    const spacePersonId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    sharedSpaceRepository.getMember.mockResolvedValue(makeSpaceMember({ spaceId, userId: auth.user.id }));

    await sut.searchAssets(auth, session.id, {
      mode: 'metadata',
      filters: { spaceId, spacePersonIds: [spacePersonId] },
      limit: 5,
      page: 1,
      order: 'desc',
    });

    expect(sharedSpaceRepository.getSpaceIdsForTimeline).not.toHaveBeenCalled();
    expect(searchRepository.searchMetadata).toHaveBeenCalledWith(
      { page: 1, size: 5 },
      expect.objectContaining({ spaceId, spacePersonIds: [spacePersonId] }),
    );
    expect(searchRepository.searchMetadata).toHaveBeenCalledWith(
      expect.any(Object),
      expect.not.objectContaining({ timelineSpaceIds: expect.anything() }),
    );
  });

  it('album filters include timeline shared spaces when permission plan allows shared spaces', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const spaceId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.album.checkSharedAlbumAccess.mockResolvedValue(new Set());
    sharedSpaceRepository.getSpaceIdsForTimeline.mockResolvedValue([{ spaceId }]);

    await sut.searchAssets(auth, session.id, {
      mode: 'metadata',
      filters: { albumIds: [albumId] },
      limit: 5,
      page: 1,
      order: 'desc',
    });

    expect(searchRepository.searchMetadata).toHaveBeenCalledWith(
      { page: 1, size: 5 },
      expect.objectContaining({ userIds: [auth.user.id], timelineSpaceIds: [spaceId], albumIds: [albumId] }),
    );
  });

  it('locked visibility search calls returned-asset owner access with elevated locked access after validation allows it', async () => {
    const auth = AuthFactory.from().session({ hasElevatedPermission: true }).build();
    const assetId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: false, locked: true } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    searchRepository.searchMetadata.mockResolvedValue({ items: [{ id: assetId }] as never, hasNextPage: false });
    assetRepository.getAgentMetadataByIds.mockResolvedValue([makeMetadata(assetId)] as never);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));

    const result = await sut.searchAssets(auth, session.id, {
      mode: 'metadata',
      filters: { visibility: AssetVisibility.Locked },
      limit: 5,
      page: 1,
      order: 'desc',
    });

    expect(result.status).toBe('success');
    expect(searchRepository.searchMetadata).toHaveBeenCalledWith(
      { page: 1, size: 5 },
      expect.objectContaining({ visibility: AssetVisibility.Locked }),
    );
    expect(accessRepository.asset.checkOwnerAccess).toHaveBeenCalledWith(auth.user.id, new Set([assetId]), true);
  });

  it('denies inaccessible people filters before repository execution', async () => {
    const auth = AuthFactory.create();
    const accessiblePersonId = newUuid();
    const inaccessiblePersonId = newUuid();
    const personIds = [accessiblePersonId, inaccessiblePersonId];
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.person.checkOwnerAccess.mockResolvedValue(new Set([accessiblePersonId]));
    accessRepository.person.checkSharedSpaceAccess.mockResolvedValue(new Set());

    const result = await sut.searchAssets(auth, session.id, {
      mode: 'metadata',
      filters: { personIds },
      limit: 5,
      page: 1,
      order: 'desc',
    });

    expect(accessRepository.person.checkOwnerAccess).toHaveBeenCalledWith(auth.user.id, new Set(personIds));
    expect(accessRepository.person.checkSharedSpaceAccess).toHaveBeenCalledWith(auth.user.id, new Set(personIds));
    expect(result).toEqual({
      status: 'denied',
      reason: 'One or more search filters are not accessible',
      toolCall: expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        error: 'One or more search filters are not accessible',
      }),
    });
    expect(assetRepository.searchAgentMetadata).not.toHaveBeenCalled();
  });

  it('listAlbums filters out owned albums when assetScope.owned is false', async () => {
    const auth = AuthFactory.create();
    const ownedAlbum = makeAlbumSummary({ ownerId: auth.user.id });
    const sharedAlbum = makeAlbumSummary({ ownerId: newUuid() });
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: false, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    albumRepository.getAgentAlbums.mockResolvedValue([ownedAlbum, sharedAlbum]);

    const result = await sut.listAlbums(auth, session.id, {});

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      albums: [sharedAlbum],
    });
  });

  it('listAlbums filters out shared albums when assetScope.sharedSpaces is false', async () => {
    const auth = AuthFactory.create();
    const ownedAlbum = makeAlbumSummary({ ownerId: auth.user.id });
    const sharedAlbum = makeAlbumSummary({ ownerId: newUuid() });
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: false, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    albumRepository.getAgentAlbums.mockResolvedValue([ownedAlbum, sharedAlbum]);

    const result = await sut.listAlbums(auth, session.id, {});

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      albums: [ownedAlbum],
    });
  });

  it.each([
    {
      name: 'readAssetMetadata',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetIds: string[]) =>
        sut.readAssetMetadata(auth, sessionId, { assetIds }),
      repositoryRead: () => assetRepository.getAgentMetadataByIds,
    },
    {
      name: 'readAssetPreviews',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetIds: string[]) =>
        sut.readAssetPreviews(auth, sessionId, { assetIds }),
      repositoryRead: () => assetRepository.getAgentPreviewReferencesByIds,
    },
    {
      name: 'readAssetOriginals',
      call: async (auth: ReturnType<typeof AuthFactory.create>, sessionId: string, assetIds: string[]) =>
        sut.readAssetOriginals(auth, sessionId, { assetIds }),
      repositoryRead: () => assetRepository.getAgentOriginalReferencesByIds,
    },
  ])('$name denies inaccessible asset ids before returning data', async ({ call, repositoryRead }) => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      credentialSnapshot: {
        id: newUuid(),
        providerType: AgentProviderType.OpenAICompatible,
        label: 'Local compatible',
        baseUrl: 'http://localhost:11434/v1',
        models: ['local-model'],
        defaultModel: 'local-model',
      },
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: true },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: true,
          allowOriginalsForExternalProviders: false,
        },
        limits: { ...permissionPlanSnapshot.limits, maxPreviewsPerToolCall: 5, maxOriginalsPerToolCall: 5 },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set());

    const result = await call(auth, session.id, assetIds);

    expect(result).toEqual({
      status: 'denied',
      reason: 'One or more assets are not accessible',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(repositoryRead()).not.toHaveBeenCalled();
  });

  it('denies inaccessible search result asset ids before returning data', async () => {
    const auth = AuthFactory.create();
    const assetId = newUuid();
    const session = makeSession({ userId: auth.user.id, approvalMode: AgentApprovalMode.PlanOnly });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set());
    searchRepository.searchMetadata.mockResolvedValue({ items: [{ id: assetId }] as never, hasNextPage: false });

    const result = await sut.searchAssets(auth, session.id, { filters: {}, limit: 1 });

    expect(result).toEqual({
      status: 'denied',
      reason: 'One or more assets are not accessible',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
  });

  it('YOLO readAlbum denies an owned album when assetScope.owned is false', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: false, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    accessRepository.album.checkSharedAlbumAccess.mockResolvedValue(new Set());
    albumRepository.getAgentAlbumById.mockResolvedValue(makeAlbumDetail({ id: albumId, ownerId: auth.user.id }));

    const result = await sut.readAlbum(auth, session.id, { albumId });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Album is not accessible',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(albumRepository.getAgentAlbumById).not.toHaveBeenCalled();
  });

  it('YOLO readAlbum denies a shared album when assetScope.sharedSpaces is false', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: false, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set());
    accessRepository.album.checkSharedAlbumAccess.mockResolvedValue(new Set([albumId]));

    const result = await sut.readAlbum(auth, session.id, { albumId });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Album is not accessible',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(albumRepository.getAgentAlbumById).not.toHaveBeenCalled();
  });

  it('YOLO readAlbum allows an owned album even when its album id is not an asset id', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const album = makeAlbumDetail({ id: albumId, ownerId: auth.user.id, assetIds: [newUuid()] });
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: false, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    assetRepository.getAgentReadableIds.mockResolvedValue(new Set());
    albumRepository.getAgentAlbumById.mockResolvedValue(album);

    const result = await sut.readAlbum(auth, session.id, { albumId });

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      album,
    });
    expect(assetRepository.getAgentReadableIds).not.toHaveBeenCalledWith(new Set([albumId]));
  });

  it('counts per-session limits by data class and excludes the current approved strict call during re-execution', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: false },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: false,
          allowOriginalsForExternalProviders: false,
        },
        limits: {
          ...permissionPlanSnapshot.limits,
          maxPreviewsPerToolCall: 5,
          maxPreviewsPerSession: 3,
        },
      }),
    });
    const approved = makeToolCall({
      sessionId: session.id,
      toolName: AgentToolName.ReadAssetPreviews,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      redactedRequestMetadata: { assetIds },
      dataClass: AgentToolDataClass.Previews,
      assetCount: assetIds.length,
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(approved);
    toolCallRepository.transition.mockResolvedValueOnce(
      makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }),
    );
    toolCallRepository.getCountedAssetCountBySessionAndDataClass.mockResolvedValue(1);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentPreviewReferencesByIds.mockResolvedValue(assetIds.map((id) => makeMediaReference(id)));

    await sut.readAssetPreviews(auth, session.id, { toolCallId: approved.id });

    expect(toolCallRepository.getCountedAssetCountBySessionAndDataClass).toHaveBeenCalledWith(
      session.id,
      AgentToolDataClass.Previews,
      approved.id,
    );
  });

  it('YOLO visibility-constrains album and tag search filters without leaking inaccessible ids through errors', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set());
    accessRepository.album.checkSharedAlbumAccess.mockResolvedValue(new Set());
    accessRepository.tag.checkOwnerAccess.mockResolvedValue(new Set());

    const result = await sut.searchAssets(auth, session.id, {
      filters: { albumIds: [newUuid()], tagIds: [newUuid()] },
      limit: 1,
    });

    expect(result).toEqual({
      status: 'denied',
      reason: 'One or more search filters are not accessible',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    if (result.status !== 'denied') {
      throw new Error(`Expected denied response, got ${result.status}`);
    }
    expect(result.reason).not.toContain('album');
    expect(result.reason).not.toContain('tag');
    expect(assetRepository.searchAgentMetadata).not.toHaveBeenCalled();
  });

  it('returns only available preview references and audits the returned count', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const returnedPreview = makeMediaReference(assetIds[0]);
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: false },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: false,
          allowOriginalsForExternalProviders: false,
        },
        limits: { ...permissionPlanSnapshot.limits, maxPreviewsPerToolCall: 5 },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentPreviewReferencesByIds.mockResolvedValue([returnedPreview]);

    const result = await sut.readAssetPreviews(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      previews: [returnedPreview],
    });
    expect(toolCallRepository.transition).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        assetCount: 1,
        redactedResponseMetadata: { assetIds: [assetIds[0]] },
      }),
    );
  });

  it('returns only available original references and audits the returned count', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const returnedOriginal = makeMediaReference(assetIds[1]);
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      credentialSnapshot: {
        id: newUuid(),
        providerType: AgentProviderType.OpenAICompatible,
        label: 'Local compatible',
        baseUrl: 'http://localhost:11434/v1',
        models: ['local-model'],
        defaultModel: 'local-model',
      },
      permissionPlanSnapshot: makePlan({
        read: { metadata: true, previews: true, originals: true },
        providerExposure: {
          metadata: true,
          previews: true,
          originals: true,
          allowOriginalsForExternalProviders: false,
        },
        limits: { ...permissionPlanSnapshot.limits, maxOriginalsPerToolCall: 5 },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentOriginalReferencesByIds.mockResolvedValue([returnedOriginal]);

    const result = await sut.readAssetOriginals(auth, session.id, { assetIds });

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      originals: [returnedOriginal],
    });
    expect(toolCallRepository.transition).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        assetCount: 1,
        redactedResponseMetadata: { assetIds: [assetIds[1]] },
      }),
    );
  });

  it('readAlbum denies albums whose asset count exceeds maxAssetsPerToolCall', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ limits: { ...permissionPlanSnapshot.limits, maxAssetsPerToolCall: 1 } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    albumRepository.getAgentAlbumById.mockResolvedValue(
      makeAlbumDetail({ id: albumId, assetIds: [newUuid(), newUuid()] }),
    );

    const result = await sut.readAlbum(auth, session.id, { albumId });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Requested asset count exceeds per-tool limit',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
  });

  it('readAlbum denies plan-only execution when album assets exceed remaining metadata session limit', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const album = makeAlbumDetail({ id: albumId, assetIds: [newUuid(), newUuid(), newUuid()] });
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ limits: { ...permissionPlanSnapshot.limits, maxAssetsPerSession: 5 } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    albumRepository.getAgentAlbumById.mockResolvedValue(album);
    toolCallRepository.transitionWithSessionLimit.mockResolvedValue({
      status: 'limit-exceeded',
      toolCall: makeToolCall({
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        error: 'Session policy allows at most 5 assets per session',
      }),
    });

    const result = await sut.readAlbum(auth, session.id, { albumId });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Session policy allows at most 5 assets per session',
      toolCall: expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        error: 'Session policy allows at most 5 assets per session',
      }),
    });
    expect(toolCallRepository.transitionWithSessionLimit).toHaveBeenCalledWith(
      session.id,
      expect.any(String),
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Executing,
        approvalDecision: AgentToolApprovalDecision.Approved,
        assetCount: album.assetCount,
        albumCount: 1,
      }),
      AgentToolDataClass.Metadata,
      5,
    );
    expect(toolCallRepository.transition).not.toHaveBeenCalledWith(
      session.id,
      expect.any(String),
      AgentToolCallStatus.Executing,
      expect.objectContaining({ status: AgentToolCallStatus.Completed }),
    );
  });

  it('readAlbum reserves the loaded asset count before completing plan-only execution', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const album = makeAlbumDetail({ id: albumId, assetIds: [newUuid(), newUuid()] });
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ limits: { ...permissionPlanSnapshot.limits, maxAssetsPerSession: 5 } }),
    });
    const executing = makeToolCall({
      sessionId: session.id,
      toolName: AgentToolName.ReadAlbum,
      status: AgentToolCallStatus.Executing,
      approvalDecision: AgentToolApprovalDecision.Approved,
      requestSummary: `Read album ${albumId}`,
      redactedRequestMetadata: { albumId },
      assetCount: 0,
      albumCount: 1,
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.create.mockResolvedValueOnce(executing);
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    albumRepository.getAgentAlbumById.mockResolvedValue(album);

    const result = await sut.readAlbum(auth, session.id, { albumId });

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      album,
    });
    expect(toolCallRepository.transitionWithSessionLimit).toHaveBeenCalledWith(
      session.id,
      executing.id,
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
      5,
    );
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      executing.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Completed,
        assetCount: album.assetCount,
        albumCount: 1,
      }),
    );
  });

  it('readAlbum excludes the current approved tool call when checking loaded album session limits', async () => {
    const auth = AuthFactory.create();
    const albumId = newUuid();
    const album = makeAlbumDetail({ id: albumId, assetIds: [newUuid(), newUuid()] });
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.Strict,
      permissionPlanSnapshot: makePlan({ limits: { ...permissionPlanSnapshot.limits, maxAssetsPerSession: 3 } }),
    });
    const approved = makeToolCall({
      sessionId: session.id,
      toolName: AgentToolName.ReadAlbum,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      requestSummary: `Read album ${albumId}`,
      redactedRequestMetadata: { albumId },
      assetCount: album.assetCount,
      albumCount: 1,
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(approved);
    toolCallRepository.transition.mockResolvedValueOnce(
      makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }),
    );
    accessRepository.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    albumRepository.getAgentAlbumById.mockResolvedValue(album);

    const result = await sut.readAlbum(auth, session.id, { toolCallId: approved.id });

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      album,
    });
    expect(toolCallRepository.transitionWithSessionLimit).toHaveBeenCalledWith(
      session.id,
      approved.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Executing,
        assetCount: album.assetCount,
        albumCount: 1,
      }),
      AgentToolDataClass.Metadata,
      3,
    );
    expect(toolCallRepository.transition).toHaveBeenNthCalledWith(
      2,
      session.id,
      approved.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Completed,
        assetCount: album.assetCount,
        albumCount: 1,
      }),
    );
  });

  it('listSpaces returns visible space summaries without full asset ids', async () => {
    const auth = AuthFactory.create();
    const first = makeSpaceRow({ name: 'Family', description: 'People', color: 'blue' });
    const second = makeSpaceRow({ name: 'Family!', description: 'Emoji ✨', color: 'green' });
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: false, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    sharedSpaceRepository.getAllByUserId.mockResolvedValue([first, second]);
    sharedSpaceRepository.getMembers
      .mockResolvedValueOnce([makeSpaceMember()])
      .mockResolvedValueOnce([makeSpaceMember(), makeSpaceMember()]);
    sharedSpaceRepository.getAssetCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    sharedSpaceRepository.getRecentAssets
      .mockResolvedValueOnce([{ id: newUuid(), thumbhash: null }])
      .mockResolvedValueOnce([]);

    const result = await sut.listSpaces(auth, session.id, {});

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({
        status: AgentToolCallStatus.Completed,
        responseSummary: 'Returned 2 space(s)',
        albumCount: 0,
        assetCount: 0,
      }),
      spaces: [
        expect.objectContaining({ id: first.id, name: 'Family', assetCount: 2, memberCount: 1 }),
        expect.objectContaining({ id: second.id, name: 'Family!', assetCount: 0, memberCount: 2 }),
      ],
    });
    if (result.status === 'success') {
      expect(result.spaces[0]).not.toHaveProperty('assetIds');
    }
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      expect.any(String),
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        redactedResponseMetadata: { spaceIds: [first.id, second.id] },
        albumCount: 0,
        assetCount: 0,
      }),
    );
  });

  it('listSpaces returns an empty list for zero visible spaces', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: false, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);

    const result = await sut.listSpaces(auth, session.id, {});

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ responseSummary: 'Returned 0 space(s)' }),
      spaces: [],
    });
  });

  it('listSpaces denies when shared spaces are disabled for the session', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: true, sharedSpaces: false, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);

    const result = await sut.listSpaces(auth, session.id, {});

    expect(result).toEqual({
      status: 'denied',
      reason: 'Shared spaces are not accessible for this session',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(sharedSpaceRepository.getAllByUserId).not.toHaveBeenCalled();
  });

  it('readSpace returns redacted members and bounded asset ids for a visible space', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid(), newUuid()];
    const space = makeSpaceRow({ id: newUuid(), name: 'Family', thumbnailAssetId: assetIds[0] });
    const member = makeSpaceMember({
      spaceId: space.id,
      userId: auth.user.id,
      name: 'Pierre',
      email: 'pierre@example.com',
      avatarColor: 'blue',
      profileImagePath: '/profile.jpg',
    });
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: false, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    sharedSpaceRepository.getMember.mockResolvedValue(member);
    sharedSpaceRepository.getById.mockResolvedValue(space);
    sharedSpaceRepository.getMembers.mockResolvedValue([member]);
    sharedSpaceRepository.getAssetCount.mockResolvedValue(assetIds.length);
    sharedSpaceRepository.getRecentAssets.mockResolvedValue([{ id: assetIds[0], thumbhash: null }]);
    sharedSpaceRepository.getAssetIdsInSpacePage.mockResolvedValue(assetIds.map((assetId) => ({ assetId })));

    const result = await sut.readSpace(auth, session.id, { spaceId: space.id });

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({
        status: AgentToolCallStatus.Completed,
        responseSummary: 'Returned space with 2 asset id(s)',
        assetCount: 2,
        albumCount: 0,
      }),
      space: expect.objectContaining({
        id: space.id,
        assetCount: 2,
        assetIds,
        assetIdsReturned: 2,
        assetIdsTruncated: false,
        members: [
          {
            userId: auth.user.id,
            name: 'Pierre',
            role: 'viewer',
            avatarColor: 'blue',
            profileImagePath: '/profile.jpg',
          },
        ],
      } satisfies Partial<AgentSpaceDetail>),
    });
    if (result.status === 'success') {
      expect(result.space.members[0]).not.toHaveProperty('email');
    }
    expect(sharedSpaceRepository.getAssetIdsInSpacePage).toHaveBeenCalledWith(space.id, { limit: 10_001 });
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      expect.any(String),
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        redactedResponseMetadata: { spaceIds: [space.id], assetIds },
        albumCount: 0,
        assetCount: 2,
      }),
    );
  });

  it('readSpace rejects inaccessible or removed-membership spaces', async () => {
    const auth = AuthFactory.create();
    const spaceId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: false, sharedSpaces: true, locked: false } }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    sharedSpaceRepository.getMember.mockImplementation(() => Promise.resolve(void 0));

    const result = await sut.readSpace(auth, session.id, { spaceId });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Space is not accessible',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(sharedSpaceRepository.getById).not.toHaveBeenCalled();
  });

  it('readSpace truncates many asset ids at 10000 without denying on total asset count', async () => {
    const auth = AuthFactory.create();
    const space = makeSpaceRow({ id: newUuid() });
    const member = makeSpaceMember({ spaceId: space.id, userId: auth.user.id });
    const returnedRows = Array.from({ length: 10_001 }, () => ({ assetId: newUuid() }));
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({
        assetScope: { owned: false, sharedSpaces: true, locked: false },
        limits: { ...permissionPlanSnapshot.limits, maxAssetsPerToolCall: 1, maxAssetsPerSession: 20_000 },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    sharedSpaceRepository.getMember.mockResolvedValue(member);
    sharedSpaceRepository.getById.mockResolvedValue(space);
    sharedSpaceRepository.getMembers.mockResolvedValue([member]);
    sharedSpaceRepository.getAssetCount.mockResolvedValue(10_005);
    sharedSpaceRepository.getAssetIdsInSpacePage.mockResolvedValue(returnedRows);

    const result = await sut.readSpace(auth, session.id, { spaceId: space.id });

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({
        responseSummary: 'Returned space with 10000 of 10005 asset id(s)',
        assetCount: 10_000,
      }),
      space: expect.objectContaining({
        assetIds: returnedRows.slice(0, 10_000).map((row) => row.assetId),
        assetIdsReturned: 10_000,
        assetIdsTruncated: true,
        assetCount: 10_005,
      }),
    });
  });

  it('readSpace denies when returned asset ids exceed the remaining metadata session limit', async () => {
    const auth = AuthFactory.create();
    const space = makeSpaceRow({ id: newUuid() });
    const member = makeSpaceMember({ spaceId: space.id, userId: auth.user.id });
    const assetIds = [newUuid(), newUuid()];
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.PlanOnly,
      permissionPlanSnapshot: makePlan({
        assetScope: { owned: false, sharedSpaces: true, locked: false },
        limits: { ...permissionPlanSnapshot.limits, maxAssetsPerSession: 1 },
      }),
    });

    sessionRepository.getById.mockResolvedValue(session);
    sharedSpaceRepository.getMember.mockResolvedValue(member);
    sharedSpaceRepository.getById.mockResolvedValue(space);
    sharedSpaceRepository.getMembers.mockResolvedValue([member]);
    sharedSpaceRepository.getAssetCount.mockResolvedValue(assetIds.length);
    sharedSpaceRepository.getAssetIdsInSpacePage.mockResolvedValue(assetIds.map((assetId) => ({ assetId })));
    toolCallRepository.transitionWithSessionLimit.mockResolvedValue({
      status: 'limit-exceeded',
      toolCall: makeToolCall({
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        error: 'Session policy allows at most 1 assets per session',
      }),
    });

    const result = await sut.readSpace(auth, session.id, { spaceId: space.id });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Session policy allows at most 1 assets per session',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(toolCallRepository.transitionWithSessionLimit).toHaveBeenCalledWith(
      session.id,
      expect.any(String),
      AgentToolCallStatus.Executing,
      expect.objectContaining({ assetCount: 2, albumCount: 0 }),
      AgentToolDataClass.Metadata,
      1,
    );
  });

  it('strict listSpaces creates pending approval and approved retry resumes stored empty metadata', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({ assetScope: { owned: false, sharedSpaces: true, locked: false } }),
    });
    const pending = makeToolCall({
      sessionId: session.id,
      toolName: AgentToolName.ListSpaces,
      status: AgentToolCallStatus.PendingApproval,
      redactedRequestMetadata: {},
      assetCount: 0,
      albumCount: 0,
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.create.mockResolvedValueOnce(pending);

    const pendingResult = await sut.listSpaces(auth, session.id, {});

    expect(pendingResult.status).toBe('approval-required');
    expect(toolCallRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: AgentToolName.ListSpaces, redactedRequestMetadata: {} }),
    );

    toolCallRepository.getByIdForSession.mockResolvedValue({ ...pending, status: AgentToolCallStatus.Approved });
    toolCallRepository.transition.mockResolvedValueOnce(
      makeToolCall({ ...pending, status: AgentToolCallStatus.Executing }),
    );

    const resumed = await sut.listSpaces(auth, session.id, { toolCallId: pending.id });

    expect(resumed.status).toBe('success');
    expect(sharedSpaceRepository.getAllByUserId).toHaveBeenCalledWith(auth.user.id);
  });

  it('strict readSpace approved retry revalidates membership and excludes the current tool call from session accounting', async () => {
    const auth = AuthFactory.create();
    const space = makeSpaceRow({ id: newUuid() });
    const member = makeSpaceMember({ spaceId: space.id, userId: auth.user.id });
    const assetId = newUuid();
    const session = makeSession({
      userId: auth.user.id,
      permissionPlanSnapshot: makePlan({
        assetScope: { owned: false, sharedSpaces: true, locked: false },
        limits: { ...permissionPlanSnapshot.limits, maxAssetsPerSession: 1 },
      }),
    });
    const approved = makeToolCall({
      sessionId: session.id,
      toolName: AgentToolName.ReadSpace,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      requestSummary: `Read space ${space.id}`,
      redactedRequestMetadata: { spaceId: space.id },
      assetCount: 0,
      albumCount: 0,
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(approved);
    toolCallRepository.transition.mockResolvedValueOnce(
      makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }),
    );
    sharedSpaceRepository.getMember.mockResolvedValue(member);
    sharedSpaceRepository.getById.mockResolvedValue(space);
    sharedSpaceRepository.getMembers.mockResolvedValue([member]);
    sharedSpaceRepository.getAssetCount.mockResolvedValue(1);
    sharedSpaceRepository.getAssetIdsInSpacePage.mockResolvedValue([{ assetId }]);

    const result = await sut.readSpace(auth, session.id, { toolCallId: approved.id });

    expect(result.status).toBe('success');
    expect(sharedSpaceRepository.getMember).toHaveBeenCalledWith(space.id, auth.user.id);
    expect(toolCallRepository.transitionWithSessionLimit).toHaveBeenCalledWith(
      session.id,
      approved.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({ assetCount: 1 }),
      AgentToolDataClass.Metadata,
      1,
    );
  });

  it('searchUsers returns visible users filtered by name or email without asset accounting', async () => {
    const auth = AuthFactory.create();
    const pierreId = newUuid();
    const session = makeSession({ userId: auth.user.id, approvalMode: AgentApprovalMode.PlanOnly });

    sessionRepository.getById.mockResolvedValue(session);
    userService.search.mockResolvedValue([
      makeUserResponse({ id: pierreId, name: 'Pierre Marais', email: 'pierre@example.com', avatarColor: 'blue' }),
      makeUserResponse({ name: 'Sam Example', email: 'sam@example.com' }),
    ] as never);
    toolCallRepository.transition.mockImplementation((_sessionId, _id, _expectedStatus, dto) =>
      Promise.resolve(
        makeToolCall({
          ...(dto as Partial<AgentToolCall>),
          id: _id,
          sessionId: _sessionId,
          toolName: AgentToolName.SearchUsers,
          dataClass: AgentToolDataClass.Metadata,
        }),
      ),
    );

    const result = await sut.searchUsers(auth, session.id, { query: 'pierre', limit: 10 });

    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({
        toolName: AgentToolName.SearchUsers,
        status: AgentToolCallStatus.Completed,
        responseSummary: 'Returned 1 user(s)',
        assetCount: 0,
        albumCount: 0,
      }),
      users: [
        makeUserResult({
          userId: pierreId,
          name: 'Pierre Marais',
          email: 'pierre@example.com',
          avatarColor: 'blue',
          profileImagePath: null,
        }),
      ],
    });
    expect(userService.search).toHaveBeenCalledWith(auth);
    expect(toolCallRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        redactedRequestMetadata: { query: 'pierre', limit: 10 },
        assetCount: 0,
        albumCount: 0,
      }),
    );
    expect(toolCallRepository.transition).toHaveBeenCalledWith(
      session.id,
      expect.any(String),
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        redactedResponseMetadata: { userIds: [pierreId] },
        assetCount: 0,
        albumCount: 0,
      }),
    );
  });

  it('searchUsers creates a pending approval in strict mode and resumes from stored request', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id });
    const pending = makeToolCall({
      sessionId: session.id,
      toolName: AgentToolName.SearchUsers,
      status: AgentToolCallStatus.PendingApproval,
      redactedRequestMetadata: { query: 'sam', limit: 2 },
      assetCount: 0,
      albumCount: 0,
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.create.mockResolvedValueOnce(pending);

    const pendingResult = await sut.searchUsers(auth, session.id, { query: 'sam', limit: 2 });

    expect(pendingResult.status).toBe('approval-required');
    expect(userService.search).not.toHaveBeenCalled();

    toolCallRepository.getByIdForSession.mockResolvedValue({ ...pending, status: AgentToolCallStatus.Approved });
    userService.search.mockResolvedValue([
      makeUserResponse({ name: 'Sam Example', email: 'sam@example.com' }),
    ] as never);

    const resumed = await sut.searchUsers(auth, session.id, { toolCallId: pending.id });

    expect(resumed.status).toBe('success');
    expect(userService.search).toHaveBeenCalledWith(auth);
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
      redactedResponseMetadata: null,
      error: null,
      completedAt: null,
    },
    {
      decision: AgentToolApprovalDecision.Denied,
      reason: 'No thanks',
      expectedStatus: AgentToolCallStatus.Denied,
      responseSummary: null,
      redactedResponseMetadata: null,
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
      {
        status: caseData.expectedStatus,
        approvalDecision: caseData.decision,
        responseSummary: caseData.responseSummary,
        redactedResponseMetadata: null,
        completedAt: caseData.completedAt === null ? null : expect.any(Date),
        error: caseData.error,
      },
    );
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.Running,
    });
  });

  it('resumes a runner-backed session after a denied approval decision', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForToolApproval,
      runnerSessionId: 'runner-session-1',
    });
    const pending = makeToolCall({ sessionId: session.id });
    const denied = makeToolCall({
      ...pending,
      status: AgentToolCallStatus.Denied,
      approvalDecision: AgentToolApprovalDecision.Denied,
      responseSummary: null,
      error: 'Use fewer photos',
      completedAt,
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(pending);
    toolCallRepository.transition.mockResolvedValue(denied);

    const result = await sut.approveToolCall(auth, session.id, pending.id, {
      decision: AgentToolApprovalDecision.Denied,
      reason: 'Use fewer photos',
    });
    await flushAsync();

    expect(result).toEqual(
      expect.objectContaining({
        id: pending.id,
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        error: 'Use fewer photos',
      }),
    );
    expect(agentRunnerService.resumeAfterToolApproval).toHaveBeenCalledTimes(1);
    expect(agentRunnerService.resumeAfterToolApproval).toHaveBeenCalledWith({
      userId: auth.user.id,
      sessionId: session.id,
      runnerSessionId: 'runner-session-1',
      toolCallId: pending.id,
      approvalDecision: AgentToolApprovalDecision.Denied,
      toolResult: undefined,
    });
  });

  it('executes an approved read tool before resuming a runner-backed session', async () => {
    const auth = AuthFactory.create();
    const album = makeAlbumSummary({ ownerId: auth.user.id });
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForToolApproval,
      runnerSessionId: 'runner-session-1',
    });
    const pending = makeToolCall({
      sessionId: session.id,
      toolName: AgentToolName.ListAlbums,
      requestSummary: 'List albums',
      redactedRequestMetadata: {},
      assetCount: 0,
      albumCount: 0,
    });
    const transitioned = makeToolCall({
      ...pending,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      responseSummary: 'Tool call approved by user',
    });
    const executing = makeToolCall({ ...transitioned, status: AgentToolCallStatus.Executing });
    const completed = makeToolCall({
      ...transitioned,
      status: AgentToolCallStatus.Completed,
      responseSummary: 'Returned 1 album(s)',
      redactedResponseMetadata: { albumIds: [album.id] },
      albumCount: 1,
      completedAt,
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValueOnce(pending).mockResolvedValueOnce(transitioned);
    toolCallRepository.transition
      .mockResolvedValueOnce(transitioned)
      .mockResolvedValueOnce(executing)
      .mockResolvedValueOnce(completed);
    albumRepository.getAgentAlbums.mockResolvedValue([album]);

    await sut.approveToolCall(auth, session.id, pending.id, { decision: AgentToolApprovalDecision.Approved });
    await flushAsync();
    await flushAsync();

    expect(agentRunnerService.resumeAfterToolApproval).toHaveBeenCalledWith({
      userId: auth.user.id,
      sessionId: session.id,
      runnerSessionId: 'runner-session-1',
      toolCallId: pending.id,
      approvalDecision: AgentToolApprovalDecision.Approved,
      toolResult: expect.objectContaining({
        status: 'success',
        albums: [album],
        toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      }),
    });
  });

  it('resumes the runner with an error tool result when an approved read tool fails', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForToolApproval,
      runnerSessionId: 'runner-session-1',
    });
    const pending = makeToolCall({
      sessionId: session.id,
      toolName: AgentToolName.ReadAssetMetadata,
      redactedRequestMetadata: { assetIds: [newUuid()] },
      assetCount: 1,
    });
    const approved = makeToolCall({
      ...pending,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      responseSummary: 'Tool call approved by user',
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValueOnce(pending).mockResolvedValueOnce(approved);
    toolCallRepository.transition.mockResolvedValueOnce(approved).mockRejectedValueOnce(new Error('asset read failed'));

    await sut.approveToolCall(auth, session.id, pending.id, { decision: AgentToolApprovalDecision.Approved });
    await flushAsync();
    await flushAsync();

    expect(agentRunnerService.resumeAfterToolApproval).toHaveBeenCalledTimes(1);
    expect(agentRunnerService.resumeAfterToolApproval).toHaveBeenCalledWith({
      userId: auth.user.id,
      sessionId: session.id,
      runnerSessionId: 'runner-session-1',
      toolCallId: pending.id,
      approvalDecision: AgentToolApprovalDecision.Approved,
      toolResult: {
        status: 'error',
        message: 'Approved tool call failed before returning a result.',
      },
    });
  });

  it('marks the session interrupted when runner continuation fails after approval', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForToolApproval,
      runnerSessionId: 'runner-session-1',
    });
    const pending = makeToolCall({ sessionId: session.id });
    const approved = makeToolCall({
      ...pending,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      responseSummary: 'Tool call approved by user',
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(pending);
    toolCallRepository.transition.mockResolvedValue(approved);
    sessionRepository.markInterruptedFromActive.mockResolvedValue({} as never);
    agentRunnerService.resumeAfterToolApproval.mockRejectedValue(
      new Error('Agent session already has a message in progress'),
    );

    await sut.approveToolCall(auth, session.id, pending.id, { decision: AgentToolApprovalDecision.Approved });
    await flushAsync();
    await flushAsync();

    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.Running,
    });
    expect(sessionRepository.markInterruptedFromActive).toHaveBeenCalledWith(auth.user.id, session.id);
  });

  it('does not try to resume a runner when approving a session without a runner session id', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      status: AgentSessionStatus.WaitingForToolApproval,
      runnerSessionId: null,
    });
    const pending = makeToolCall({ sessionId: session.id });
    const transitioned = makeToolCall({
      ...pending,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      responseSummary: 'Tool call approved by user',
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(pending);
    toolCallRepository.transition.mockResolvedValue(transitioned);

    await sut.approveToolCall(auth, session.id, pending.id, { decision: AgentToolApprovalDecision.Approved });

    expect(agentRunnerService.resumeAfterToolApproval).not.toHaveBeenCalled();
  });

  it('rejects non-pending approval without transition, session update, or runner continuation', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      runnerSessionId: 'runner-session-1',
    });
    const toolCall = makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.Completed, completedAt });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(toolCall);

    await expect(
      sut.approveToolCall(auth, session.id, toolCall.id, { decision: AgentToolApprovalDecision.Approved }),
    ).rejects.toThrow('Agent tool call is not pending approval');

    expect(toolCallRepository.transition).not.toHaveBeenCalled();
    expect(sessionRepository.update).not.toHaveBeenCalled();
    expect(agentRunnerService.resumeAfterToolApproval).not.toHaveBeenCalled();
  });

  it('returns denied without transition or asset read when executing an already-denied tool call', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id });
    const denied = makeToolCall({
      sessionId: session.id,
      status: AgentToolCallStatus.Denied,
      approvalDecision: AgentToolApprovalDecision.Denied,
      error: null,
      completedAt,
    });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(denied);

    const result = await sut.readAssetMetadata(auth, session.id, { toolCallId: denied.id });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Tool call was denied',
      toolCall: expect.objectContaining({ id: denied.id, status: AgentToolCallStatus.Denied }),
    });
    expect(toolCallRepository.transition).not.toHaveBeenCalled();
    expect(assetRepository.getAgentMetadataByIds).not.toHaveBeenCalled();
  });

  it('throws without transition or asset read when executing a non-approved and non-denied tool call', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({ userId: auth.user.id });
    const pending = makeToolCall({ sessionId: session.id, status: AgentToolCallStatus.PendingApproval });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(pending);

    await expect(sut.readAssetMetadata(auth, session.id, { toolCallId: pending.id })).rejects.toThrow(
      'Agent tool call has not been approved',
    );
    expect(toolCallRepository.transition).not.toHaveBeenCalled();
    expect(assetRepository.getAgentMetadataByIds).not.toHaveBeenCalled();
  });

  it('executes approved metadata reads by claiming, revalidating, reading, completing audit, and returning ordered assets', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({ userId: auth.user.id });
    const approved = makeToolCall({
      sessionId: session.id,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      redactedRequestMetadata: { assetIds },
      assetCount: 1,
    });
    const executing = makeToolCall({ ...approved, status: AgentToolCallStatus.Executing });
    const asset = makeMetadata(assetIds[0], { leaked: 'ignore me' });

    sessionRepository.getById.mockResolvedValue(session);
    toolCallRepository.getByIdForSession.mockResolvedValue(approved);
    toolCallRepository.transition
      .mockResolvedValueOnce(executing)
      .mockResolvedValueOnce(makeToolCall({ ...approved, status: AgentToolCallStatus.Completed, completedAt }));
    toolCallRepository.getCountedAssetCountBySession.mockResolvedValue(0);
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentMetadataByIds.mockResolvedValue([asset] as never);

    const result = await sut.readAssetMetadata(auth, session.id, { toolCallId: approved.id });

    expect(toolCallRepository.transition).toHaveBeenNthCalledWith(
      1,
      session.id,
      approved.id,
      AgentToolCallStatus.Approved,
      {
        status: AgentToolCallStatus.Executing,
        approvalDecision: AgentToolApprovalDecision.Approved,
        responseSummary: 'Tool call execution started',
        redactedResponseMetadata: null,
        completedAt: null,
        error: null,
      },
    );
    expect(toolCallRepository.getCountedAssetCountBySession).toHaveBeenCalledWith(session.id, approved.id);
    expect(assetRepository.getAgentMetadataByIds).toHaveBeenCalledWith(assetIds);
    expect(toolCallRepository.transition).toHaveBeenNthCalledWith(
      2,
      session.id,
      approved.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Completed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        responseSummary: 'Returned metadata for 1 asset',
        redactedResponseMetadata: { assetIds },
        assetCount: 1,
        albumCount: 0,
        completedAt: expect.any(Date),
        error: null,
      }),
    );
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.Running,
    });
    expect(result).toEqual({
      status: 'success',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Completed }),
      assets: [expect.objectContaining({ id: assetIds[0] })],
    });
    if (result.status !== 'success') {
      throw new Error(`Expected success response, got ${result.status}`);
    }
    expect(result.assets[0]).not.toHaveProperty('leaked');
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
    toolCallRepository.transition.mockImplementation(() =>
      Promise.resolve(null as unknown as AgentToolCall | undefined),
    );

    await expect(sut.readAssetMetadata(auth, session.id, { toolCallId: approved.id })).rejects.toThrow(
      'Agent tool call is already executing or completed',
    );
    expect(assetRepository.getAgentMetadataByIds).not.toHaveBeenCalled();
  });

  it('throws without repository reads when the session is inactive after execution claim', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({ userId: auth.user.id });
    const inactiveSession = makeSession({
      ...session,
      status: AgentSessionStatus.Completed,
      endedAt: completedAt,
    });
    const approved = makeToolCall({
      sessionId: session.id,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      redactedRequestMetadata: { assetIds },
    });

    sessionRepository.getById.mockResolvedValueOnce(session).mockResolvedValueOnce(inactiveSession);
    toolCallRepository.getByIdForSession.mockResolvedValue(approved);
    toolCallRepository.transition.mockResolvedValueOnce(
      makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }),
    );

    await expect(sut.readAssetMetadata(auth, session.id, { toolCallId: approved.id })).rejects.toThrow(
      'Agent session not found',
    );
    expect(sessionRepository.getById).toHaveBeenCalledTimes(2);
    expect(toolCallRepository.transition).toHaveBeenNthCalledWith(
      2,
      session.id,
      approved.id,
      AgentToolCallStatus.Executing,
      {
        status: AgentToolCallStatus.Failed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        responseSummary: null,
        redactedResponseMetadata: null,
        completedAt: expect.any(Date),
        error: 'Agent session not found',
      },
    );
    expect(toolCallRepository.getCountedAssetCountBySession).not.toHaveBeenCalled();
    expect(accessRepository.asset.checkOwnerAccess).not.toHaveBeenCalled();
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
    toolCallRepository.transition.mockResolvedValueOnce(
      makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }),
    );
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
      {
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        responseSummary: null,
        redactedResponseMetadata: null,
        completedAt: expect.any(Date),
        error: 'One or more assets are not accessible',
      },
    );
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.Running,
    });
  });

  it('records denied using the refreshed permission plan after execution claim', async () => {
    const auth = AuthFactory.create();
    const assetIds = [newUuid()];
    const session = makeSession({ userId: auth.user.id });
    const refreshedSession = makeSession({
      ...session,
      permissionPlanSnapshot: makePlan({ read: { metadata: false, previews: false, originals: false } }),
    });
    const approved = makeToolCall({
      sessionId: session.id,
      status: AgentToolCallStatus.Approved,
      approvalDecision: AgentToolApprovalDecision.Approved,
      redactedRequestMetadata: { assetIds },
    });

    sessionRepository.getById.mockResolvedValueOnce(session).mockResolvedValueOnce(refreshedSession);
    toolCallRepository.getByIdForSession.mockResolvedValue(approved);
    toolCallRepository.transition.mockResolvedValueOnce(
      makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }),
    );

    const result = await sut.readAssetMetadata(auth, session.id, { toolCallId: approved.id });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Agent permission policy does not allow metadata reads',
      toolCall: expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        error: 'Agent permission policy does not allow metadata reads',
      }),
    });
    expect(toolCallRepository.transition).toHaveBeenLastCalledWith(
      refreshedSession.id,
      approved.id,
      AgentToolCallStatus.Executing,
      expect.objectContaining({
        status: AgentToolCallStatus.Denied,
        approvalDecision: AgentToolApprovalDecision.Denied,
        error: 'Agent permission policy does not allow metadata reads',
      }),
    );
    expect(accessRepository.asset.checkOwnerAccess).not.toHaveBeenCalled();
    expect(assetRepository.getAgentMetadataByIds).not.toHaveBeenCalled();
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
    toolCallRepository.transition.mockResolvedValueOnce(
      makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }),
    );
    toolCallRepository.getCountedAssetCountBySession.mockResolvedValue(1);

    const result = await sut.readAssetMetadata(auth, session.id, { toolCallId: approved.id });

    expect(result).toEqual({
      status: 'denied',
      reason: 'Session policy allows at most 2 assets per session',
      toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied }),
    });
    expect(accessRepository.asset.checkOwnerAccess).not.toHaveBeenCalled();
    expect(toolCallRepository.getCountedAssetCountBySession).toHaveBeenCalledWith(session.id, approved.id);
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.Running,
    });
  });

  it.each([
    {
      name: 'read.metadata disabled',
      sessionOverrides: {
        permissionPlanSnapshot: makePlan({ read: { metadata: false, previews: false, originals: false } }),
      },
      reason: 'Agent permission policy does not allow metadata reads',
    },
    {
      name: 'providerExposure.metadata disabled',
      sessionOverrides: {
        permissionPlanSnapshot: makePlan({
          providerExposure: {
            metadata: false,
            previews: false,
            originals: false,
            allowOriginalsForExternalProviders: false,
          },
        }),
      },
      reason: 'Agent provider exposure policy does not allow metadata reads',
    },
  ])(
    'records denied and restores session when approval-time policy drifts: $name',
    async ({ sessionOverrides, reason }) => {
      const auth = AuthFactory.create();
      const assetIds = [newUuid()];
      const session = makeSession({ userId: auth.user.id, ...sessionOverrides });
      const approved = makeToolCall({
        sessionId: session.id,
        status: AgentToolCallStatus.Approved,
        approvalDecision: AgentToolApprovalDecision.Approved,
        redactedRequestMetadata: { assetIds },
      });

      sessionRepository.getById.mockResolvedValue(session);
      toolCallRepository.getByIdForSession.mockResolvedValue(approved);
      toolCallRepository.transition.mockResolvedValueOnce(
        makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }),
      );

      const result = await sut.readAssetMetadata(auth, session.id, { toolCallId: approved.id });

      expect(result).toEqual({
        status: 'denied',
        reason,
        toolCall: expect.objectContaining({ status: AgentToolCallStatus.Denied, error: reason }),
      });
      expect(toolCallRepository.transition).toHaveBeenNthCalledWith(
        1,
        session.id,
        approved.id,
        AgentToolCallStatus.Approved,
        {
          status: AgentToolCallStatus.Executing,
          approvalDecision: AgentToolApprovalDecision.Approved,
          responseSummary: 'Tool call execution started',
          redactedResponseMetadata: null,
          completedAt: null,
          error: null,
        },
      );
      expect(toolCallRepository.transition).toHaveBeenNthCalledWith(
        2,
        session.id,
        approved.id,
        AgentToolCallStatus.Executing,
        {
          status: AgentToolCallStatus.Denied,
          approvalDecision: AgentToolApprovalDecision.Denied,
          responseSummary: null,
          redactedResponseMetadata: null,
          completedAt: expect.any(Date),
          error: reason,
        },
      );
      expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
        status: AgentSessionStatus.Running,
      });
      expect(assetRepository.getAgentMetadataByIds).not.toHaveBeenCalled();
    },
  );

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
    toolCallRepository.transition.mockResolvedValueOnce(
      makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }),
    );
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentMetadataByIds.mockResolvedValue([makeMetadata(assetIds[0])] as never);

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
      {
        status: AgentToolCallStatus.Failed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        responseSummary: null,
        redactedResponseMetadata: { assetIds: [assetIds[0]] },
        completedAt: expect.any(Date),
        error: 'One or more assets were not found during metadata read',
      },
    );
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.Running,
    });
  });

  it('records failed, restores session, and rethrows when metadata repository throws', async () => {
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
    toolCallRepository.transition.mockResolvedValueOnce(
      makeToolCall({ ...approved, status: AgentToolCallStatus.Executing }),
    );
    accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(assetIds));
    assetRepository.getAgentMetadataByIds.mockRejectedValue(new Error('database unavailable'));

    await expect(sut.readAssetMetadata(auth, session.id, { toolCallId: approved.id })).rejects.toThrow(
      'database unavailable',
    );
    expect(toolCallRepository.transition).toHaveBeenLastCalledWith(
      session.id,
      approved.id,
      AgentToolCallStatus.Executing,
      {
        status: AgentToolCallStatus.Failed,
        approvalDecision: AgentToolApprovalDecision.Approved,
        responseSummary: null,
        redactedResponseMetadata: null,
        completedAt: expect.any(Date),
        error: 'Metadata read failed',
      },
    );
    expect(sessionRepository.update).toHaveBeenCalledWith(auth.user.id, session.id, {
      status: AgentSessionStatus.Running,
    });
  });

  it('rejects YOLO reads for inactive sessions without creating audit rows', async () => {
    const auth = AuthFactory.create();
    const session = makeSession({
      userId: auth.user.id,
      approvalMode: AgentApprovalMode.DangerouslySkipPermissions,
      status: AgentSessionStatus.Completed,
      endedAt: completedAt,
    });

    sessionRepository.getById.mockResolvedValue(session);

    await expect(sut.readAssetMetadata(auth, session.id, { assetIds: [newUuid()] })).rejects.toThrow(
      'Agent session not found',
    );
    expect(toolCallRepository.create).not.toHaveBeenCalled();
    expect(toolCallRepository.createWithSessionLimit).not.toHaveBeenCalled();
    expect(assetRepository.getAgentMetadataByIds).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the session is missing', async () => {
    const auth = AuthFactory.create();

    sessionRepository.getById.mockImplementation(() => Promise.resolve(null as unknown as AgentSession | undefined));

    await expect(sut.readAssetMetadata(auth, newUuid(), { assetIds: [newUuid()] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
