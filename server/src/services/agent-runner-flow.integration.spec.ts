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
  AgentToolDataClass,
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
import { WebsocketRepository } from 'src/repositories/websocket.repository';
import { AgentMessageService } from 'src/services/agent-message.service';
import { AgentProviderCredentialService } from 'src/services/agent-provider-credential.service';
import { AgentRunnerToolTokenService } from 'src/services/agent-runner-tool-token.service';
import { AgentRunnerService } from 'src/services/agent-runner.service';
import { AgentSessionService } from 'src/services/agent-session.service';
import { AgentToolService } from 'src/services/agent-tool.service';
import { AgentMessageContent } from 'src/types/agent-message.types';
import { AgentPermissionPlanSnapshot } from 'src/types/agent-session.types';
import { AgentAlbumSummary } from 'src/types/agent-tool.types';
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

const permissionPlan: AgentPermissionPlanSnapshot = {
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
    maxPreviewsPerSession: 0,
    maxOriginalsPerToolCall: 0,
    maxOriginalsPerSession: 0,
    expiresInMinutes: 60,
  },
};

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

class InMemoryAgentSessionRepository {
  sessions = new Map<string, AgentSession>();

  create = vi.fn(async (dto: Partial<AgentSession>) => {
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
    return session;
  });

  getById = vi.fn(async (userId: string, id: string) => {
    const session = this.sessions.get(id);
    return session?.userId === userId ? session : undefined;
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
      return undefined;
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
      return undefined;
    }

    const updated = { ...session, status: AgentSessionStatus.Interrupted, updatedAt: now(), updateId: newUuid() };
    this.sessions.set(id, updated);
    return updated;
  });
}

class InMemoryAgentMessageRepository {
  messages: AgentMessage[] = [];

  create = vi.fn(async (dto: Partial<AgentMessage>) => {
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
    return message;
  });

  getBySessionId = vi.fn(async (sessionId: string) =>
    this.messages
      .filter((message) => message.sessionId === sessionId)
      .toSorted(
        (first, second) => first.createdAt.getTime() - second.createdAt.getTime() || first.id.localeCompare(second.id),
      ),
  );
}

class InMemoryAgentToolCallRepository {
  toolCalls: AgentToolCall[] = [];

  create = vi.fn(async (dto: Partial<AgentToolCall>) => {
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
    return toolCall;
  });

  createWithSessionLimit = vi.fn(async (dto: Partial<AgentToolCall>) => ({
    status: 'created' as const,
    toolCall: await this.create(dto),
  }));

  getBySessionId = vi.fn(async (sessionId: string) =>
    this.toolCalls
      .filter((toolCall) => toolCall.sessionId === sessionId)
      .toSorted(
        (first, second) => second.startedAt.getTime() - first.startedAt.getTime() || second.id.localeCompare(first.id),
      ),
  );

  getByIdForSession = vi.fn(async (sessionId: string, id: string) =>
    this.toolCalls.find((toolCall) => toolCall.sessionId === sessionId && toolCall.id === id),
  );

  getCountedAssetCountBySession = vi.fn(async () => 0);
  getCountedAssetCountBySessionAndDataClass = vi.fn(async () => 0);

  transition = vi.fn(
    async (sessionId: string, id: string, expectedStatus: AgentToolCallStatus, dto: Partial<AgentToolCall>) => {
      const index = this.toolCalls.findIndex(
        (toolCall) => toolCall.sessionId === sessionId && toolCall.id === id && toolCall.status === expectedStatus,
      );
      if (index === -1) {
        return undefined;
      }

      const updated = { ...this.toolCalls[index], ...dto };
      this.toolCalls[index] = updated;
      return updated;
    },
  );

  transitionWithSessionLimit = vi.fn(
    async (sessionId: string, id: string, expectedStatus: AgentToolCallStatus, dto: Partial<AgentToolCall>) => {
      const toolCall = await this.transition(sessionId, id, expectedStatus, dto);
      return toolCall ? { status: 'transitioned' as const, toolCall } : { status: 'stale' as const };
    },
  );
}

describe('Pi agent runner flow harness', () => {
  const setup = () => {
    const auth = AuthFactory.create();
    const sessions = new InMemoryAgentSessionRepository();
    const messages = new InMemoryAgentMessageRepository();
    const toolCalls = new InMemoryAgentToolCallRepository();
    const websocketEvents: Array<{ userId: string; event: Record<string, unknown> }> = [];
    const runnerResumeBodies: unknown[] = [];

    let toolService: AgentToolService;
    let resumeMode: 'success' | 'error' = 'success';

    const runnerRepository = {
      createSession: vi.fn(async () => ({
        runnerSessionId: 'runner-session-1',
        capabilities: { protocolVersion: '2026-05-14', streaming: true, tools: ['gallery'], models: [] },
      })),
      streamMessage: vi.fn(async function* ({
        body,
      }: {
        body: { gallerySessionId: string; content: AgentMessageContent };
      }) {
        const result = await toolService.listAlbums(auth, body.gallerySessionId, {});
        if (result.status !== 'approval-required') {
          throw new Error('Expected listAlbums to request approval');
        }

        yield {
          type: 'tool-approval-needed',
          sessionId: body.gallerySessionId,
          runnerSessionId: 'runner-session-1',
          toolCallId: result.toolCall.id,
        };
      }),
      streamResume: vi.fn(async function* ({ body }: { body: { gallerySessionId: string } }) {
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
          delta: 'I found one album.',
          sequence: 1,
        };
        yield {
          type: 'assistant-message-completed',
          sessionId: body.gallerySessionId,
          runnerSessionId: 'runner-session-1',
          providerMessageId: 'provider-message-1',
          content: { blocks: [{ type: 'text', text: 'I found one album.' }] },
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
      getById: vi.fn(async () => credential),
      getSecret: vi.fn(async () => 'sk-test'),
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
    const albumRepository = { getAgentAlbums: vi.fn(async () => [album(auth.user.id)]) };
    toolService = new AgentToolService(
      {} as AccessRepository,
      {} as AssetRepository,
      albumRepository as unknown as AlbumRepository,
      sessions as unknown as AgentSessionRepository,
      toolCalls as unknown as AgentToolCallRepository,
      runnerService,
    );

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
      toolService,
      websocketEvents,
    };
  };

  it('persists and resumes the approval flow from reloadable state', async () => {
    const harness = setup();
    const session = await harness.sessionService.create(harness.auth, {
      providerCredentialId: '00000000-0000-4000-8000-000000000201',
      model: 'gpt-5.1',
      permissionPreset: AgentPermissionPreset.Careful,
      approvalMode: AgentApprovalMode.Strict,
      initialContext: { entrypoint: 'assistant-page' },
    });

    expect(session.status).toBe(AgentSessionStatus.Running);

    const userMessage = await harness.messageService.appendUserMessage(harness.auth, session.id, {
      content: { blocks: [{ type: 'text', text: 'List my albums.' }] },
    });

    expect(userMessage.role).toBe(AgentMessageRole.User);
    expect(await harness.messageService.getMessages(harness.auth, session.id)).toHaveLength(1);

    await waitFor(async () => {
      const pendingCalls = await harness.toolService.getToolCalls(harness.auth, session.id);
      expect(pendingCalls).toEqual([
        expect.objectContaining({
          toolName: AgentToolName.ListAlbums,
          status: AgentToolCallStatus.PendingApproval,
          requestSummary: 'List albums',
        }),
      ]);
      expect((await harness.sessions.getById(harness.auth.user.id, session.id))?.status).toBe(
        AgentSessionStatus.WaitingForToolApproval,
      );
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
      expect(messages).toEqual([
        expect.objectContaining({ role: AgentMessageRole.User }),
        expect.objectContaining({
          role: AgentMessageRole.Assistant,
          providerMessageId: 'provider-message-1',
          content: { blocks: [{ type: 'text', text: 'I found one album.' }] },
        }),
      ]);
      expect(await harness.toolService.getToolCalls(harness.auth, session.id)).toEqual([
        expect.objectContaining({
          id: pendingToolCall.id,
          status: AgentToolCallStatus.Completed,
          approvalDecision: AgentToolApprovalDecision.Approved,
          responseSummary: 'Returned 1 album(s)',
          albumCount: 1,
        }),
      ]);
      expect((await harness.sessions.getById(harness.auth.user.id, session.id))?.status).toBe(
        AgentSessionStatus.Running,
      );
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
      permissionPreset: AgentPermissionPreset.Careful,
      approvalMode: AgentApprovalMode.Strict,
      initialContext: {},
    });
    await harness.messageService.appendUserMessage(harness.auth, session.id, {
      content: { blocks: [{ type: 'text', text: 'List my albums.' }] },
    });
    await waitFor(async () => {
      expect(await harness.toolService.getToolCalls(harness.auth, session.id)).toHaveLength(1);
    });

    const [pendingToolCall] = await harness.toolService.getToolCalls(harness.auth, session.id);
    await harness.toolService.approveToolCall(harness.auth, session.id, pendingToolCall.id, {
      decision: AgentToolApprovalDecision.Approved,
    });

    await waitFor(async () => {
      expect((await harness.sessions.getById(harness.auth.user.id, session.id))?.status).toBe(
        AgentSessionStatus.Interrupted,
      );
      expect(await harness.toolService.getToolCalls(harness.auth, session.id)).toEqual([
        expect.objectContaining({
          id: pendingToolCall.id,
          status: AgentToolCallStatus.Completed,
          responseSummary: 'Returned 1 album(s)',
        }),
      ]);
      expect(harness.websocketEvents.map(({ event }) => event.type)).toContain('runner-error');
      expect(await harness.messageService.getMessages(harness.auth, session.id)).toEqual([
        expect.objectContaining({ role: AgentMessageRole.User }),
      ]);
    });
  });
});
