import { BadRequestException } from '@nestjs/common';
import { AgentMessage, AgentSession, AgentToolCall } from 'src/database';
import {
  AgentApprovalMode,
  AgentMessageRole,
  AgentPermissionPreset,
  AgentProviderType,
  AgentSessionStatus,
  AgentToolApprovalDecision,
  AgentToolCallStatus,
  AgentToolName,
  AssetType,
  AssetVisibility,
} from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { AgentMessageRepository } from 'src/repositories/agent-message.repository';
import { AgentRunnerRepository } from 'src/repositories/agent-runner.repository';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { AgentToolCallRepository } from 'src/repositories/agent-tool-call.repository';
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { ConfigRepository } from 'src/repositories/config.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { MachineLearningRepository } from 'src/repositories/machine-learning.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { SystemMetadataRepository } from 'src/repositories/system-metadata.repository';
import { WebsocketRepository } from 'src/repositories/websocket.repository';
import { AgentMessageService } from 'src/services/agent-message.service';
import { AgentProviderCredentialService } from 'src/services/agent-provider-credential.service';
import { AgentRunnerToolTokenService } from 'src/services/agent-runner-tool-token.service';
import { AgentRunnerService } from 'src/services/agent-runner.service';
import { AgentSessionService } from 'src/services/agent-session.service';
import { AgentToolService } from 'src/services/agent-tool.service';
import { AgentMessageContent } from 'src/types/agent-message.types';
import { AgentAlbumSummary, AgentAssetMetadata, AgentSpaceSummary } from 'src/types/agent-tool.types';
import { AuthFactory } from 'test/factories/auth.factory';
import { newAccessRepositoryMock } from 'test/repositories/access.repository.mock';
import { newUuid } from 'test/small.factory';

const waitFor = async (assertion: () => void | Promise<void>) => {
  let lastError: unknown;

  for (let index = 0; index < 50; index++) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw lastError;
};

const now = () => new Date();

const album = (ownerId: string): AgentAlbumSummary => ({
  id: '00000000-0000-4000-8000-000000000301',
  albumName: 'Portugal',
  description: 'Summer trip',
  ownerId,
  assetCount: 1,
  startDate: new Date('2026-05-01T00:00:00.000Z'),
  endDate: new Date('2026-05-02T00:00:00.000Z'),
  albumThumbnailAssetId: null,
});

const space = (createdById: string): AgentSpaceSummary & { createdAt: Date; updatedAt: Date } => ({
  id: '00000000-0000-4000-8000-000000000401',
  name: 'Family',
  description: 'Shared family photos',
  color: 'blue',
  createdById,
  assetCount: 0,
  memberCount: 1,
  thumbnailAssetId: null,
  recentAssetIds: [],
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  updatedAt: new Date('2026-05-02T00:00:00.000Z'),
});

const resolveZero = () => Promise.resolve(0);

const metadata = (id: string): AgentAssetMetadata => ({
  id,
  ownerId: '00000000-0000-4000-8000-000000000101',
  type: AssetType.Image,
  originalFileName: `${id}.jpg`,
  localDateTime: new Date('2026-05-01T10:00:00.000Z'),
  fileCreatedAt: new Date('2026-05-01T10:00:00.000Z'),
  fileModifiedAt: new Date('2026-05-01T10:00:00.000Z'),
  isFavorite: false,
  visibility: AssetVisibility.Timeline,
  exifInfo: null,
  tags: [],
});

type AcceptanceSearchCase = {
  name: string;
  prompt: string;
  request: Parameters<AgentToolService['searchAssets']>[2];
  expectedRequestSummary: string;
  expectedRequestMetadata: Record<string, unknown>;
  expectedSearchPath: 'metadata' | 'smart';
};

const fixedAssetId = '00000000-0000-4000-8000-000000000501';
const alexPersonId = '00000000-0000-4000-8000-000000000601';
const familySpaceId = '00000000-0000-4000-8000-000000000401';
const acceptanceReferenceDate = '2026-05-21';
const berlinLastSummerStart = new Date('2025-06-01T00:00:00.000Z');
const berlinLastSummerEnd = new Date('2025-08-31T23:59:59.999Z');
const invoiceScreenshotsStart = new Date('2024-01-01T00:00:00.000Z');
const invoiceScreenshotsEnd = new Date('2024-12-31T23:59:59.999Z');
const sonyMayStart = new Date('2026-05-01T00:00:00.000Z');
const sonyMayEnd = new Date('2026-05-21T23:59:59.999Z');

class InMemoryAgentSessionRepository {
  sessions = new Map<string, AgentSession>();

  create = vi.fn((dto: Partial<AgentSession>) => {
    const session: AgentSession = {
      id: newUuid(),
      userId: dto.userId!,
      providerCredentialId: dto.providerCredentialId ?? null,
      credentialSnapshot: dto.credentialSnapshot!,
      modelSnapshot: dto.modelSnapshot!,
      permissionPreset: dto.permissionPreset!,
      permissionPlanSnapshot: dto.permissionPlanSnapshot!,
      approvalMode: dto.approvalMode!,
      runnerEndpoint: dto.runnerEndpoint ?? null,
      runnerSessionId: dto.runnerSessionId ?? null,
      runnerCapabilitiesSnapshot: dto.runnerCapabilitiesSnapshot ?? null,
      status: dto.status ?? AgentSessionStatus.Created,
      initialContextSnapshot: dto.initialContextSnapshot ?? {},
      title: dto.title ?? null,
      createdAt: now(),
      updatedAt: now(),
      endedAt: null,
      updateId: newUuid(),
    };
    this.sessions.set(session.id, session);
    return Promise.resolve(session);
  });

  getById = vi.fn((userId: string, id: string) => {
    const session = this.sessions.get(id);
    return Promise.resolve(session?.userId === userId ? session : undefined);
  });

  update = vi.fn(async (userId: string, id: string, dto: Partial<AgentSession>) => {
    const session = await this.getById(userId, id);
    if (!session) {
      throw new BadRequestException('Agent session not found');
    }

    const updated = { ...session, ...dto, updatedAt: now(), updateId: newUuid() };
    this.sessions.set(id, updated);
    return updated;
  });

  markRunningFromCreated = vi.fn(async (userId: string, id: string, dto: Partial<AgentSession>) => {
    const session = await this.getById(userId, id);
    if (!session || session.status !== AgentSessionStatus.Created) {
      return;
    }

    const updated = { ...session, ...dto, updatedAt: now(), updateId: newUuid() };
    this.sessions.set(id, updated);
    return updated;
  });

  markInterruptedFromActive = vi.fn(async (userId: string, id: string) => {
    const session = await this.getById(userId, id);
    if (
      !session ||
      ![
        AgentSessionStatus.Running,
        AgentSessionStatus.WaitingForToolApproval,
        AgentSessionStatus.WaitingForPlanReview,
        AgentSessionStatus.Interrupted,
      ].includes(session.status)
    ) {
      return;
    }

    const updated = { ...session, status: AgentSessionStatus.Interrupted, updatedAt: now(), updateId: newUuid() };
    this.sessions.set(id, updated);
    return updated;
  });
}

class InMemoryAgentMessageRepository {
  messages: AgentMessage[] = [];

  create = vi.fn((dto: Partial<AgentMessage>) => {
    const message: AgentMessage = {
      id: newUuid(),
      sessionId: dto.sessionId!,
      role: dto.role!,
      content: dto.content!,
      providerMessageId: dto.providerMessageId ?? null,
      toolCallId: dto.toolCallId ?? null,
      createdAt: now(),
    };
    this.messages.push(message);
    return Promise.resolve(message);
  });

  getBySessionId = vi.fn((sessionId: string) =>
    Promise.resolve(
      this.messages
        .filter((message) => message.sessionId === sessionId)
        .toSorted(
          (first, second) =>
            first.createdAt.getTime() - second.createdAt.getTime() || first.id.localeCompare(second.id),
        ),
    ),
  );
}

class InMemoryAgentToolCallRepository {
  toolCalls: AgentToolCall[] = [];

  create = vi.fn((dto: Partial<AgentToolCall>) => {
    const toolCall: AgentToolCall = {
      id: newUuid(),
      sessionId: dto.sessionId!,
      toolName: dto.toolName!,
      status: dto.status!,
      approvalDecision: dto.approvalDecision ?? null,
      requestSummary: dto.requestSummary!,
      responseSummary: dto.responseSummary ?? null,
      redactedRequestMetadata: dto.redactedRequestMetadata!,
      redactedResponseMetadata: dto.redactedResponseMetadata ?? null,
      dataClass: dto.dataClass!,
      assetCount: dto.assetCount ?? 0,
      albumCount: dto.albumCount ?? 0,
      providerSnapshot: dto.providerSnapshot!,
      startedAt: now(),
      completedAt: dto.completedAt ?? null,
      error: dto.error ?? null,
    };
    this.toolCalls.push(toolCall);
    return Promise.resolve(toolCall);
  });

  createWithSessionLimit = vi.fn(async (dto: Partial<AgentToolCall>) => ({
    status: 'created' as const,
    toolCall: await this.create(dto),
  }));

  getBySessionId = vi.fn((sessionId: string) =>
    Promise.resolve(
      this.toolCalls
        .filter((toolCall) => toolCall.sessionId === sessionId)
        .toSorted(
          (first, second) =>
            second.startedAt.getTime() - first.startedAt.getTime() || second.id.localeCompare(first.id),
        ),
    ),
  );

  getByIdForSession = vi.fn((sessionId: string, id: string) =>
    Promise.resolve(this.toolCalls.find((toolCall) => toolCall.sessionId === sessionId && toolCall.id === id)),
  );

  getCountedAssetCountBySession = vi.fn(resolveZero);
  getCountedAssetCountBySessionAndDataClass = vi.fn(resolveZero);

  transition = vi.fn(
    (sessionId: string, id: string, expectedStatus: AgentToolCallStatus, dto: Partial<AgentToolCall>) => {
      const index = this.toolCalls.findIndex(
        (toolCall) => toolCall.sessionId === sessionId && toolCall.id === id && toolCall.status === expectedStatus,
      );
      if (index === -1) {
        return Promise.resolve();
      }

      const updated = { ...this.toolCalls[index], ...dto };
      this.toolCalls[index] = updated;
      return Promise.resolve(updated);
    },
  );

  transitionWithSessionLimit = vi.fn(
    async (sessionId: string, id: string, expectedStatus: AgentToolCallStatus, dto: Partial<AgentToolCall>) => {
      const toolCall = await this.transition(sessionId, id, expectedStatus, dto);
      return toolCall ? { status: 'transitioned' as const, toolCall } : { status: 'stale' as const };
    },
  );
}

const setup = () => {
  const auth = AuthFactory.create();
  const sessions = new InMemoryAgentSessionRepository();
  const messages = new InMemoryAgentMessageRepository();
  const toolCalls = new InMemoryAgentToolCallRepository();
  const websocketEvents: Array<{ userId: string; event: Record<string, unknown> }> = [];
  const runnerResumeBodies: unknown[] = [];

  const toolServiceContainer = {} as { current: AgentToolService };
  let resumeMode: 'success' | 'error' = 'success';
  let runnerMessageHandler: (input: {
    body: { gallerySessionId: string; content: AgentMessageContent };
  }) => AsyncGenerator<Record<string, unknown>>;

  runnerMessageHandler = async function* ({ body }) {
    const result = await toolServiceContainer.current.listSpaces(auth, body.gallerySessionId, {});
    if (result.status !== 'approval-required') {
      throw new Error('Expected listSpaces to request approval');
    }

    yield {
      type: 'tool-approval-needed',
      sessionId: body.gallerySessionId,
      runnerSessionId: 'runner-session-1',
      toolCallId: result.toolCall.id,
    };
  };

  const runnerRepository = {
    createSession: vi.fn(() =>
      Promise.resolve({
        runnerSessionId: 'runner-session-1',
        capabilities: { protocolVersion: '2026-05-14', streaming: true, tools: ['gallery'], models: [] },
      }),
    ),
    streamMessage: vi.fn((input: { body: { gallerySessionId: string; content: AgentMessageContent } }) =>
      runnerMessageHandler(input),
    ),
    streamResume: vi.fn(async function* ({ body }: { body: { gallerySessionId: string } }) {
      await Promise.resolve();
      runnerResumeBodies.push(body);
      if (resumeMode === 'error') {
        yield {
          type: 'runner-error',
          sessionId: body.gallerySessionId,
          runnerSessionId: 'runner-session-1',
          message: 'Provider refused the resumed request.',
        };
        return;
      }

      yield {
        type: 'assistant-message-delta',
        sessionId: body.gallerySessionId,
        runnerSessionId: 'runner-session-1',
        delta: 'I found one space.',
        sequence: 1,
      };
      yield {
        type: 'assistant-message-completed',
        sessionId: body.gallerySessionId,
        runnerSessionId: 'runner-session-1',
        providerMessageId: 'provider-message-1',
        content: { blocks: [{ type: 'text', text: 'I found one space.' }] },
      };
    }),
  };

  const configRepository = {
    getEnv: vi.fn(() => ({
      agent: {
        runnerUrl: 'http://agent-runner:4477',
        mcpGatewayUrl: 'http://gallery:2283/api/agent/internal/mcp/',
        runnerHealthTimeoutMs: 3000,
        runnerMessageStreamTimeoutMs: 120_000,
      },
    })),
  };
  const websocketRepository = {
    clientSend: vi.fn((_eventName: string, userId: string, event: Record<string, unknown>) => {
      websocketEvents.push({ userId, event });
    }),
  };
  const toolTokenService = { create: vi.fn(() => 'runner-tool-token') };

  const runnerService = new AgentRunnerService(
    configRepository as unknown as ConfigRepository,
    runnerRepository as unknown as AgentRunnerRepository,
    messages as unknown as AgentMessageRepository,
    sessions as unknown as AgentSessionRepository,
    websocketRepository as unknown as WebsocketRepository,
    toolTokenService as unknown as AgentRunnerToolTokenService,
  );

  const credential = {
    id: '00000000-0000-4000-8000-000000000201',
    providerType: AgentProviderType.OpenAI,
    label: 'OpenAI personal',
    baseUrl: null,
    models: ['gpt-5.1'],
    defaultModel: 'gpt-5.1',
    createdAt: now(),
    updatedAt: now(),
    lastUsedAt: null,
  };
  const credentialService = {
    getById: vi.fn(() => Promise.resolve(credential)),
    getSecret: vi.fn(() => Promise.resolve('sk-test')),
  };

  const sessionService = new AgentSessionService(
    sessions as unknown as AgentSessionRepository,
    credentialService as unknown as AgentProviderCredentialService,
    runnerService,
  );
  const messageService = new AgentMessageService(
    messages as unknown as AgentMessageRepository,
    sessions as unknown as AgentSessionRepository,
    runnerService,
  );
  const albumRepository = { getAgentAlbums: vi.fn(() => Promise.resolve([album(auth.user.id)])) };
  const currentSpace = space(auth.user.id);
  const sharedSpaceRepository = {
    getAllByUserId: vi.fn(() => Promise.resolve([currentSpace])),
    getMembers: vi.fn(() =>
      Promise.resolve([
        {
          spaceId: currentSpace.id,
          userId: auth.user.id,
          role: 'owner',
          joinedAt: now(),
          showInTimeline: true,
          sharePersonMetadata: true,
          lastViewedAt: null,
          name: 'Pierre',
          email: 'pierre@example.com',
          profileImagePath: null,
          profileChangedAt: now(),
          avatarColor: null,
        },
      ]),
    ),
    getMember: vi.fn((spaceId: string, userId: string) =>
      Promise.resolve(
        spaceId === currentSpace.id && userId === auth.user.id ? { spaceId, userId, role: 'owner' } : null,
      ),
    ),
    getAssetCount: vi.fn(() => Promise.resolve(0)),
    getRecentAssets: vi.fn(() => Promise.resolve([])),
  };
  const accessRepository = newAccessRepositoryMock();
  const assetRepository = {
    getAgentReadableIds: vi.fn((assetIds: Set<string>) => Promise.resolve(new Set(assetIds))),
    getAgentLockedIds: vi.fn(() => Promise.resolve(new Set())),
    getAgentMetadataByIds: vi.fn((assetIds: string[]) => Promise.resolve(assetIds.map((assetId) => metadata(assetId)))),
  };
  const searchRepository = {
    searchMetadata: vi.fn(() => Promise.resolve({ items: [] as Array<{ id: string }>, hasNextPage: false })),
    searchSmart: vi.fn(() => Promise.resolve({ items: [] as Array<{ id: string }>, hasNextPage: false })),
  };
  const machineLearningRepository = { encodeText: vi.fn(() => Promise.resolve('[1, 2, 3]')) };
  const systemMetadataRepository = {
    get: vi.fn(() =>
      Promise.resolve({
        machineLearning: { clip: { enabled: true, modelName: 'ViT-Test', maxDistance: 0.42 } },
      }),
    ),
  };
  const toolService = new AgentToolService(
    accessRepository as unknown as AccessRepository,
    assetRepository as unknown as AssetRepository,
    searchRepository as never,
    { error: vi.fn(), warn: vi.fn() } as unknown as LoggingRepository,
    { getEnv: vi.fn(() => ({ configFile: undefined })) } as unknown as ConfigRepository,
    machineLearningRepository as unknown as MachineLearningRepository,
    systemMetadataRepository as unknown as SystemMetadataRepository,
    albumRepository as unknown as AlbumRepository,
    sharedSpaceRepository as unknown as SharedSpaceRepository,
    sessions as unknown as AgentSessionRepository,
    { create: vi.fn() } as never,
    toolCalls as unknown as AgentToolCallRepository,
    runnerService,
    { search: vi.fn(() => Promise.resolve([])) } as never,
  );
  toolServiceContainer.current = toolService;

  return {
    auth,
    messageService,
    runnerRepository,
    runnerResumeBodies,
    sessionService,
    sessions,
    configureRunnerMessage: (
      handler: (input: {
        body: { gallerySessionId: string; content: AgentMessageContent };
      }) => AsyncGenerator<Record<string, unknown>>,
    ) => {
      runnerMessageHandler = handler;
    },
    accessRepository,
    assetRepository,
    machineLearningRepository,
    searchRepository,
    systemMetadataRepository,
    setResumeMode: (mode: 'success' | 'error') => {
      resumeMode = mode;
    },
    toolCalls,
    toolService,
    websocketEvents,
  };
};

describe('Pi agent runner flow harness', () => {
  it('returns truncated metadata results with omitted fields without leaking inaccessible assets', async () => {
    const harness = setup();
    const visibleAssetIds = [newUuid(), newUuid(), newUuid()];
    const inaccessibleAssetId = newUuid();
    const session = await harness.sessionService.create(harness.auth, {
      providerCredentialId: '00000000-0000-4000-8000-000000000201',
      model: 'gpt-5.1',
      permissionPreset: AgentPermissionPreset.VisualOrganizer,
      approvalMode: AgentApprovalMode.PlanOnly,
      initialContext: {},
    });

    harness.accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set(visibleAssetIds));
    harness.accessRepository.asset.checkSpaceAccess.mockResolvedValue(new Set());
    harness.assetRepository.getAgentReadableIds.mockResolvedValue(new Set(visibleAssetIds));
    harness.assetRepository.getAgentMetadataByIds.mockResolvedValue(visibleAssetIds.map((id) => metadata(id)) as never);
    vi.spyOn(
      harness.toolService as unknown as { getReadToolResponseBudgetBytes: () => number },
      'getReadToolResponseBudgetBytes',
    ).mockReturnValue(256);

    const result = await harness.toolService.readAssetMetadata(harness.auth, session.id, {
      assetIds: visibleAssetIds,
      detail: 'allSafe',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') {
      return;
    }

    expect(result.resultSize).toEqual(
      expect.objectContaining({
        truncated: true,
        omittedFields: ['assets'],
      }),
    );
    expect(JSON.stringify(result)).not.toContain(inaccessibleAssetId);

    const denied = await harness.toolService.readAssetMetadata(harness.auth, session.id, {
      assetIds: [visibleAssetIds[0], inaccessibleAssetId],
      detail: 'basic',
    });

    expect(denied.status).toBe('denied');
    expect(JSON.stringify(denied)).not.toContain(inaccessibleAssetId);
  });

  it('keeps stable paging order when multiple compact search pages accumulate size telemetry', async () => {
    const harness = setup();
    const pageOneIds = [newUuid(), newUuid()];
    const pageTwoIds = [newUuid()];
    const allAssetIds = [...pageOneIds, ...pageTwoIds];
    const session = await harness.sessionService.create(harness.auth, {
      providerCredentialId: '00000000-0000-4000-8000-000000000201',
      model: 'gpt-5.1',
      permissionPreset: AgentPermissionPreset.VisualOrganizer,
      approvalMode: AgentApprovalMode.PlanOnly,
      initialContext: {},
    });

    harness.searchRepository.searchMetadata
      .mockResolvedValueOnce({
        items: pageOneIds.map((id) => ({ id })) as never,
        hasNextPage: true,
      })
      .mockResolvedValueOnce({
        items: pageTwoIds.map((id) => ({ id })) as never,
        hasNextPage: false,
      });
    harness.accessRepository.asset.checkOwnerAccess.mockImplementation((_userId, assetIds: Set<string>) =>
      Promise.resolve(new Set([...assetIds].filter((id) => allAssetIds.includes(id)))),
    );
    harness.accessRepository.asset.checkSpaceAccess.mockResolvedValue(new Set());
    harness.assetRepository.getAgentReadableIds.mockResolvedValue(new Set(allAssetIds));

    const first = await harness.toolService.searchAssets(harness.auth, session.id, {
      filters: {},
      limit: 2,
      page: 1,
      detail: 'ids',
    });
    const second = await harness.toolService.searchAssets(harness.auth, session.id, {
      filters: {},
      limit: 2,
      page: 2,
      detail: 'ids',
    });

    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    if (first.status !== 'success' || second.status !== 'success') {
      return;
    }

    expect(first.assetIds).toEqual(pageOneIds);
    expect(first.resultSize).toMatchObject({ returnedItems: 2, hasMore: true, nextPage: '2' });
    expect(second.assetIds).toEqual(pageTwoIds);
    expect(second.resultSize).toMatchObject({ returnedItems: 1, hasMore: false, nextPage: null });
  });

  const expectAcceptanceSearchFlow = async (testCase: AcceptanceSearchCase) => {
    const harness = setup();
    const isSpaceScopedSearch = testCase.request.filters?.spaceId === familySpaceId;
    harness.accessRepository.asset.checkOwnerAccess.mockResolvedValue(
      isSpaceScopedSearch ? new Set() : new Set([fixedAssetId]),
    );
    harness.accessRepository.asset.checkSpaceAccess.mockResolvedValue(
      isSpaceScopedSearch ? new Set([fixedAssetId]) : new Set(),
    );
    harness.accessRepository.person.checkOwnerAccess.mockResolvedValue(new Set([alexPersonId]));
    harness.searchRepository.searchMetadata.mockResolvedValue({
      items: [{ id: fixedAssetId }] as never,
      hasNextPage: false,
    });
    harness.searchRepository.searchSmart.mockResolvedValue({
      items: [{ id: fixedAssetId }] as never,
      hasNextPage: false,
    });
    harness.assetRepository.getAgentMetadataByIds.mockResolvedValue([metadata(fixedAssetId)] as never);

    harness.configureRunnerMessage(async function* ({ body }) {
      expect(body.content).toEqual({ blocks: [{ type: 'text', text: testCase.prompt }] });
      const result = await harness.toolService.searchAssets(harness.auth, body.gallerySessionId, testCase.request);
      if (result.status !== 'approval-required') {
        throw new Error(`Expected searchAssets approval for ${testCase.name}`);
      }

      yield {
        type: 'tool-approval-needed',
        sessionId: body.gallerySessionId,
        runnerSessionId: 'runner-session-1',
        toolCallId: result.toolCall.id,
      };
    });

    const session = await harness.sessionService.create(harness.auth, {
      providerCredentialId: '00000000-0000-4000-8000-000000000201',
      model: 'gpt-5.1',
      permissionPreset: AgentPermissionPreset.VisualOrganizer,
      approvalMode: AgentApprovalMode.Strict,
      initialContext: {
        entrypoint: 'assistant-page',
        acceptancePrompt: testCase.name,
        acceptanceReferenceDate,
      },
    });

    const userMessage = await harness.messageService.appendUserMessage(harness.auth, session.id, {
      content: { blocks: [{ type: 'text', text: testCase.prompt }] },
    });

    expect(userMessage.role).toBe(AgentMessageRole.User);
    await waitFor(async () => {
      const [pendingToolCall] = await harness.toolService.getToolCalls(harness.auth, session.id);
      expect(pendingToolCall).toEqual(
        expect.objectContaining({
          toolName: AgentToolName.SearchAssets,
          status: AgentToolCallStatus.PendingApproval,
          requestSummary: testCase.expectedRequestSummary,
        }),
      );
    });

    const [pendingToolCall] = await harness.toolService.getToolCalls(harness.auth, session.id);
    expect(
      harness.toolCalls.toolCalls.find((toolCall) => toolCall.id === pendingToolCall.id)?.redactedRequestMetadata,
    ).toEqual(testCase.expectedRequestMetadata);

    await harness.toolService.approveToolCall(harness.auth, session.id, pendingToolCall.id, {
      decision: AgentToolApprovalDecision.Approved,
    });

    await waitFor(() => {
      expect(harness.runnerRepository.streamResume).toHaveBeenCalledTimes(1);
      expect(harness.runnerResumeBodies).toEqual([
        expect.objectContaining({
          gallerySessionId: session.id,
          toolCallId: pendingToolCall.id,
          approvalDecision: AgentToolApprovalDecision.Approved,
          toolResult: expect.objectContaining({
            status: 'success',
            returnedCount: 1,
            hasMore: false,
          }),
        }),
      ]);
    });

    if (testCase.expectedSearchPath === 'smart') {
      expect(harness.searchRepository.searchSmart).toHaveBeenCalledWith(
        { page: 1, size: 50 },
        expect.objectContaining({
          query: 'beach sunset',
          embedding: '[1, 2, 3]',
          maxDistance: 0.42,
          spaceId: familySpaceId,
        }),
      );
      expect(harness.searchRepository.searchMetadata).not.toHaveBeenCalled();
    } else {
      expect(harness.searchRepository.searchMetadata).toHaveBeenCalled();
      expect(harness.searchRepository.searchSmart).not.toHaveBeenCalled();
    }

    await waitFor(async () => {
      const messages = await harness.messageService.getMessages(harness.auth, session.id);
      const toolCalls = await harness.toolService.getToolCalls(harness.auth, session.id);
      const reloadedSession = await harness.sessions.getById(harness.auth.user.id, session.id);

      expect(messages).toEqual([
        expect.objectContaining({
          role: AgentMessageRole.User,
          content: { blocks: [{ type: 'text', text: testCase.prompt }] },
        }),
        expect.objectContaining({
          role: AgentMessageRole.Assistant,
          providerMessageId: 'provider-message-1',
        }),
      ]);
      expect(toolCalls).toEqual([
        expect.objectContaining({
          id: pendingToolCall.id,
          toolName: AgentToolName.SearchAssets,
          status: AgentToolCallStatus.Completed,
          approvalDecision: AgentToolApprovalDecision.Approved,
          responseSummary: 'Returned 1 asset id',
          assetCount: 1,
        }),
      ]);
      expect(reloadedSession?.status).toBe(AgentSessionStatus.Running);
    });

    expect(harness.websocketEvents.map(({ event }) => event.type)).toEqual([
      'tool-approval-needed',
      'assistant-message-delta',
      'assistant-message-created',
    ]);
  };

  it('persists and resumes the approval flow from reloadable state', async () => {
    const harness = setup();
    const session = await harness.sessionService.create(harness.auth, {
      providerCredentialId: '00000000-0000-4000-8000-000000000201',
      model: 'gpt-5.1',
      permissionPreset: AgentPermissionPreset.VisualOrganizer,
      approvalMode: AgentApprovalMode.Strict,
      initialContext: { entrypoint: 'assistant-page' },
    });

    expect(session.status).toBe(AgentSessionStatus.Running);

    const userMessage = await harness.messageService.appendUserMessage(harness.auth, session.id, {
      content: { blocks: [{ type: 'text', text: 'List my spaces.' }] },
    });

    expect(userMessage.role).toBe(AgentMessageRole.User);
    const initialMessages = await harness.messageService.getMessages(harness.auth, session.id);
    expect(initialMessages).toHaveLength(1);

    await waitFor(async () => {
      const pendingCalls = await harness.toolService.getToolCalls(harness.auth, session.id);
      const reloadedSession = await harness.sessions.getById(harness.auth.user.id, session.id);
      expect(pendingCalls).toEqual([
        expect.objectContaining({
          toolName: AgentToolName.ListSpaces,
          status: AgentToolCallStatus.PendingApproval,
          requestSummary: 'List spaces',
        }),
      ]);
      expect(reloadedSession?.status).toBe(AgentSessionStatus.WaitingForToolApproval);
    });

    expect(harness.websocketEvents).toEqual([
      expect.objectContaining({
        userId: harness.auth.user.id,
        event: expect.objectContaining({ type: 'tool-approval-needed', sessionId: session.id }),
      }),
    ]);

    const [pendingToolCall] = await harness.toolService.getToolCalls(harness.auth, session.id);
    await harness.toolService.approveToolCall(harness.auth, session.id, pendingToolCall.id, {
      decision: AgentToolApprovalDecision.Approved,
    });

    await waitFor(() => {
      expect(harness.runnerRepository.streamResume).toHaveBeenCalledTimes(1);
      expect(harness.runnerResumeBodies).toEqual([
        expect.objectContaining({
          gallerySessionId: session.id,
          toolCallId: pendingToolCall.id,
          approvalDecision: AgentToolApprovalDecision.Approved,
          toolResult: expect.objectContaining({ status: 'success' }),
        }),
      ]);
    });

    await waitFor(async () => {
      const messages = await harness.messageService.getMessages(harness.auth, session.id);
      const toolCalls = await harness.toolService.getToolCalls(harness.auth, session.id);
      const reloadedSession = await harness.sessions.getById(harness.auth.user.id, session.id);
      expect(messages).toEqual([
        expect.objectContaining({ role: AgentMessageRole.User }),
        expect.objectContaining({
          role: AgentMessageRole.Assistant,
          providerMessageId: 'provider-message-1',
          content: { blocks: [{ type: 'text', text: 'I found one space.' }] },
        }),
      ]);
      expect(toolCalls).toEqual([
        expect.objectContaining({
          id: pendingToolCall.id,
          status: AgentToolCallStatus.Completed,
          approvalDecision: AgentToolApprovalDecision.Approved,
          responseSummary: 'Returned 1 space(s)',
          albumCount: 0,
          assetCount: 0,
        }),
      ]);
      expect(harness.toolCalls.toolCalls[0].redactedResponseMetadata).toEqual(
        expect.objectContaining({
          spaceIds: ['00000000-0000-4000-8000-000000000401'],
        }),
      );
      expect(reloadedSession?.status).toBe(AgentSessionStatus.Running);
    });

    expect(harness.websocketEvents.map(({ event }) => event.type)).toEqual([
      'tool-approval-needed',
      'assistant-message-delta',
      'assistant-message-created',
    ]);

    await expect(
      harness.toolService.approveToolCall(harness.auth, session.id, pendingToolCall.id, {
        decision: AgentToolApprovalDecision.Approved,
      }),
    ).rejects.toThrow('Agent tool call is not pending approval');
    expect(harness.runnerRepository.streamResume).toHaveBeenCalledTimes(1);
  });

  it('keeps handled tool state reloadable when approval continuation reports a runner error', async () => {
    const harness = setup();
    harness.setResumeMode('error');
    const session = await harness.sessionService.create(harness.auth, {
      providerCredentialId: '00000000-0000-4000-8000-000000000201',
      model: 'gpt-5.1',
      permissionPreset: AgentPermissionPreset.VisualOrganizer,
      approvalMode: AgentApprovalMode.Strict,
      initialContext: {},
    });
    await harness.messageService.appendUserMessage(harness.auth, session.id, {
      content: { blocks: [{ type: 'text', text: 'List my spaces.' }] },
    });
    await waitFor(async () => {
      const toolCalls = await harness.toolService.getToolCalls(harness.auth, session.id);
      expect(toolCalls).toHaveLength(1);
    });

    const [pendingToolCall] = await harness.toolService.getToolCalls(harness.auth, session.id);
    await harness.toolService.approveToolCall(harness.auth, session.id, pendingToolCall.id, {
      decision: AgentToolApprovalDecision.Approved,
    });

    await waitFor(async () => {
      const reloadedSession = await harness.sessions.getById(harness.auth.user.id, session.id);
      const toolCalls = await harness.toolService.getToolCalls(harness.auth, session.id);
      const messages = await harness.messageService.getMessages(harness.auth, session.id);

      expect(reloadedSession?.status).toBe(AgentSessionStatus.Interrupted);
      expect(toolCalls).toEqual([
        expect.objectContaining({
          id: pendingToolCall.id,
          status: AgentToolCallStatus.Completed,
          responseSummary: 'Returned 1 space(s)',
        }),
      ]);
      expect(harness.websocketEvents.map(({ event }) => event.type)).toContain('runner-error');
      expect(messages).toEqual([expect.objectContaining({ role: AgentMessageRole.User })]);
    });
  });

  it('keeps a people-search assistant flow open after approval and resume', async () => {
    const harness = setup();
    const personId = newUuid();
    const assetId = newUuid();
    harness.accessRepository.person.checkOwnerAccess.mockResolvedValue(new Set([personId]));
    harness.accessRepository.asset.checkOwnerAccess.mockResolvedValue(new Set([assetId]));
    harness.searchRepository.searchMetadata.mockResolvedValue({ items: [{ id: assetId }], hasNextPage: false });
    harness.configureRunnerMessage(async function* ({ body }) {
      const result = await harness.toolService.searchAssets(harness.auth, body.gallerySessionId, {
        filters: { personIds: [personId] },
        limit: 25,
      });
      if (result.status !== 'approval-required') {
        throw new Error('Expected searchAssets to request approval');
      }

      yield {
        type: 'tool-approval-needed',
        sessionId: body.gallerySessionId,
        runnerSessionId: 'runner-session-1',
        toolCallId: result.toolCall.id,
      };
    });

    const session = await harness.sessionService.create(harness.auth, {
      providerCredentialId: '00000000-0000-4000-8000-000000000201',
      model: 'gpt-5.1',
      permissionPreset: AgentPermissionPreset.VisualOrganizer,
      approvalMode: AgentApprovalMode.Strict,
      initialContext: { entrypoint: 'assistant-page' },
    });

    const userMessage = await harness.messageService.appendUserMessage(harness.auth, session.id, {
      content: { blocks: [{ type: 'text', text: 'Find photos of Alex.' }] },
    });

    expect(userMessage.role).toBe(AgentMessageRole.User);
    await waitFor(async () => {
      const pendingCalls = await harness.toolService.getToolCalls(harness.auth, session.id);
      expect(pendingCalls).toEqual([
        expect.objectContaining({
          toolName: AgentToolName.SearchAssets,
          status: AgentToolCallStatus.PendingApproval,
          requestSummary: 'Search metadata assets (limit 25, ids)',
        }),
      ]);
    });

    const [pendingToolCall] = await harness.toolService.getToolCalls(harness.auth, session.id);
    await harness.toolService.approveToolCall(harness.auth, session.id, pendingToolCall.id, {
      decision: AgentToolApprovalDecision.Approved,
    });

    await waitFor(() => {
      expect(harness.runnerRepository.streamResume).toHaveBeenCalledTimes(1);
      expect(harness.runnerResumeBodies).toEqual([
        expect.objectContaining({
          gallerySessionId: session.id,
          toolCallId: pendingToolCall.id,
          approvalDecision: AgentToolApprovalDecision.Approved,
          toolResult: expect.objectContaining({ status: 'success' }),
        }),
      ]);
    });

    await waitFor(async () => {
      const messages = await harness.messageService.getMessages(harness.auth, session.id);
      const toolCalls = await harness.toolService.getToolCalls(harness.auth, session.id);
      const reloadedSession = await harness.sessions.getById(harness.auth.user.id, session.id);
      expect(messages).toEqual([
        expect.objectContaining({
          role: AgentMessageRole.User,
          content: { blocks: [{ type: 'text', text: 'Find photos of Alex.' }] },
        }),
        expect.objectContaining({
          role: AgentMessageRole.Assistant,
          providerMessageId: 'provider-message-1',
        }),
      ]);
      expect(toolCalls).toEqual([
        expect.objectContaining({
          id: pendingToolCall.id,
          toolName: AgentToolName.SearchAssets,
          status: AgentToolCallStatus.Completed,
          approvalDecision: AgentToolApprovalDecision.Approved,
          responseSummary: 'Returned 1 asset id',
          assetCount: 1,
        }),
      ]);
      expect(reloadedSession?.status).toBe(AgentSessionStatus.Running);
    });

    expect(harness.websocketEvents.map(({ event }) => event.type)).toEqual([
      'tool-approval-needed',
      'assistant-message-delta',
      'assistant-message-created',
    ]);
  });

  it.each([
    {
      name: 'alex berlin last summer unalbumed',
      prompt: 'Find photos of Alex in Berlin from last summer that are not in any album.',
      request: {
        mode: 'metadata',
        filters: {
          personIds: [alexPersonId],
          city: 'Berlin',
          takenAfter: berlinLastSummerStart,
          takenBefore: berlinLastSummerEnd,
          isNotInAlbum: true,
        },
        limit: 50,
        page: 1,
        order: 'desc',
      },
      expectedRequestSummary: 'Search metadata assets (limit 50, ids)',
      expectedRequestMetadata: {
        mode: 'metadata',
        filters: {
          personIds: [alexPersonId],
          city: 'Berlin',
          takenAfter: berlinLastSummerStart,
          takenBefore: berlinLastSummerEnd,
          isNotInAlbum: true,
        },
        limit: 50,
        page: 1,
        order: 'desc',
        detail: 'ids',
        fields: [],
      },
      expectedSearchPath: 'metadata',
    },
    {
      name: 'five-star Japan videos',
      prompt: 'Create an album from 5-star videos from Japan.',
      request: {
        filters: { rating: 5, type: AssetType.Video, country: 'Japan' },
        limit: 50,
      },
      expectedRequestSummary: 'Search metadata assets (limit 50, ids)',
      expectedRequestMetadata: {
        mode: 'metadata',
        filters: { rating: 5, type: AssetType.Video, country: 'Japan' },
        limit: 50,
        page: 1,
        order: 'desc',
        detail: 'ids',
        fields: [],
      },
      expectedSearchPath: 'metadata',
    },
    {
      name: 'invoice OCR screenshots',
      prompt: 'Find screenshots from 2024 that mention invoices.',
      request: {
        mode: 'ocr',
        query: 'invoice',
        filters: {
          takenAfter: invoiceScreenshotsStart,
          takenBefore: invoiceScreenshotsEnd,
          type: AssetType.Image,
        },
        limit: 50,
      },
      expectedRequestSummary: 'Search ocr assets (limit 50, ids)',
      expectedRequestMetadata: {
        mode: 'ocr',
        filters: {
          takenAfter: invoiceScreenshotsStart,
          takenBefore: invoiceScreenshotsEnd,
          type: AssetType.Image,
        },
        limit: 50,
        page: 1,
        order: 'desc',
        detail: 'ids',
        fields: [],
        query: 'invoice',
      },
      expectedSearchPath: 'metadata',
    },
    {
      name: 'family beach sunset smart search',
      prompt: 'Add beach sunset photos from the Family space to a new album.',
      request: {
        mode: 'smart',
        query: 'beach sunset',
        filters: { spaceId: familySpaceId },
        limit: 50,
        page: 1,
      },
      expectedRequestSummary: 'Search smart assets (limit 50, ids)',
      expectedRequestMetadata: {
        mode: 'smart',
        filters: { spaceId: familySpaceId },
        limit: 50,
        page: 1,
        detail: 'ids',
        fields: [],
        query: 'beach sunset',
      },
      expectedSearchPath: 'smart',
    },
    {
      name: 'Sony camera May',
      prompt: 'Find photos taken with my Sony camera in May.',
      request: {
        filters: {
          make: 'Sony',
          takenAfter: sonyMayStart,
          takenBefore: sonyMayEnd,
        },
        limit: 50,
      },
      expectedRequestSummary: 'Search metadata assets (limit 50, ids)',
      expectedRequestMetadata: {
        mode: 'metadata',
        filters: {
          make: 'Sony',
          takenAfter: sonyMayStart,
          takenBefore: sonyMayEnd,
        },
        limit: 50,
        page: 1,
        order: 'desc',
        detail: 'ids',
        fields: [],
      },
      expectedSearchPath: 'metadata',
    },
  ] satisfies AcceptanceSearchCase[])('supports Slice 8 acceptance prompt: $name', expectAcceptanceSearchFlow);
});
