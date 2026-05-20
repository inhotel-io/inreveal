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
} from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { AgentMessageRepository } from 'src/repositories/agent-message.repository';
import { AgentRunnerRepository } from 'src/repositories/agent-runner.repository';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { AgentToolCallRepository } from 'src/repositories/agent-tool-call.repository';
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { ConfigRepository } from 'src/repositories/config.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { WebsocketRepository } from 'src/repositories/websocket.repository';
import { AgentMessageService } from 'src/services/agent-message.service';
import { AgentProviderCredentialService } from 'src/services/agent-provider-credential.service';
import { AgentRunnerToolTokenService } from 'src/services/agent-runner-tool-token.service';
import { AgentRunnerService } from 'src/services/agent-runner.service';
import { AgentSessionService } from 'src/services/agent-session.service';
import { AgentToolService } from 'src/services/agent-tool.service';
import { AgentMessageContent } from 'src/types/agent-message.types';
import { AgentAlbumSummary, AgentSpaceSummary } from 'src/types/agent-tool.types';
import { AuthFactory } from 'test/factories/auth.factory';
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

  const runnerRepository = {
    createSession: vi.fn(() =>
      Promise.resolve({
        runnerSessionId: 'runner-session-1',
        capabilities: { protocolVersion: '2026-05-14', streaming: true, tools: ['gallery'], models: [] },
      }),
    ),
    streamMessage: vi.fn(async function* ({
      body,
    }: {
      body: { gallerySessionId: string; content: AgentMessageContent };
    }) {
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
    }),
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
    getAssetCount: vi.fn(() => Promise.resolve(0)),
    getRecentAssets: vi.fn(() => Promise.resolve([])),
  };
  const toolService = new AgentToolService(
    {} as AccessRepository,
    {} as AssetRepository,
    albumRepository as unknown as AlbumRepository,
    sharedSpaceRepository as unknown as SharedSpaceRepository,
    sessions as unknown as AgentSessionRepository,
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
    setResumeMode: (mode: 'success' | 'error') => {
      resumeMode = mode;
    },
    toolCalls,
    toolService,
    websocketEvents,
  };
};

describe('Pi agent runner flow harness', () => {
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
      expect(harness.toolCalls.toolCalls[0].redactedResponseMetadata).toEqual({
        spaceIds: ['00000000-0000-4000-8000-000000000401'],
      });
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
});
