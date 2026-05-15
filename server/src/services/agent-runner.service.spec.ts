import { AgentMessage } from 'src/database';
import {
  AgentApprovalMode,
  AgentMessageRole,
  AgentPermissionPreset,
  AgentProviderType,
  AgentSessionStatus,
} from 'src/enum';
import { AgentMessageRepository } from 'src/repositories/agent-message.repository';
import { AgentRunnerRepository } from 'src/repositories/agent-runner.repository';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { ConfigRepository } from 'src/repositories/config.repository';
import { WebsocketRepository } from 'src/repositories/websocket.repository';
import { AgentRunnerToolTokenService } from 'src/services/agent-runner-tool-token.service';
import { AgentRunnerService } from 'src/services/agent-runner.service';
import { AgentMessageContent } from 'src/types/agent-message.types';
import { AgentRunnerCreateSessionRequest, AgentRunnerStreamEvent } from 'src/types/agent-runner.types';
import { automock } from 'test/utils';

const userId = '00000000-0000-4000-8000-000000000001';

const makeCreateSessionBody = (): Omit<AgentRunnerCreateSessionRequest, 'toolGateway'> & { userId: string } => ({
  userId,
  gallerySessionId: '00000000-0000-4000-8000-000000000100',
  credential: {
    id: '00000000-0000-4000-8000-000000000001',
    providerType: AgentProviderType.OpenAI,
    label: 'OpenAI personal',
    baseUrl: null,
    models: ['gpt-5.1'],
    defaultModel: 'gpt-5.1',
    secret: 'sk-session-secret',
  },
  model: 'gpt-5.1',
  permissionPreset: AgentPermissionPreset.Careful,
  permissionPlan: {
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
      maxAssetsPerToolCall: 200,
      maxAssetsPerSession: 2000,
      maxPreviewsPerToolCall: 0,
      maxOriginalsPerToolCall: 0,
      expiresInMinutes: 120,
    },
  },
  approvalMode: AgentApprovalMode.Strict,
  initialContext: {},
});

const makeAssistantMessage = (overrides: Partial<AgentMessage> = {}): AgentMessage => ({
  id: '00000000-0000-4000-8000-000000000301',
  sessionId: '00000000-0000-4000-8000-000000000100',
  role: AgentMessageRole.Assistant,
  content: { blocks: [{ type: 'text', text: 'Done.' }] },
  providerMessageId: 'provider-message-1',
  toolCallId: null,
  createdAt: new Date('2026-05-14T10:00:01.000Z'),
  ...overrides,
});

const streamEvents = (events: AgentRunnerStreamEvent[]): AsyncGenerator<AgentRunnerStreamEvent> =>
  (async function* () {
    await Promise.resolve();
    for (const event of events) {
      yield event;
    }
  })();

const failingStream = (error: Error): AsyncGenerator<AgentRunnerStreamEvent> =>
  (async function* () {
    await Promise.resolve();
    throw error;
    yield undefined as never;
  })();

describe(AgentRunnerService.name, () => {
  let sut: AgentRunnerService;
  let configRepository: ReturnType<typeof automock<ConfigRepository>>;
  let agentRunnerRepository: ReturnType<typeof automock<AgentRunnerRepository>>;
  let messageRepository: ReturnType<typeof automock<AgentMessageRepository>>;
  let sessionRepository: ReturnType<typeof automock<AgentSessionRepository>>;
  let websocketRepository: ReturnType<typeof automock<WebsocketRepository>>;
  let toolTokenService: ReturnType<typeof automock<AgentRunnerToolTokenService>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T10:00:00.000Z'));
    configRepository = automock(ConfigRepository);
    agentRunnerRepository = automock(AgentRunnerRepository);
    messageRepository = automock(AgentMessageRepository, { args: [{} as never] });
    sessionRepository = automock(AgentSessionRepository, { args: [{} as never] });
    websocketRepository = automock(WebsocketRepository, {
      args: [{} as never, { setContext: vi.fn() } as never],
      strict: false,
    });
    toolTokenService = automock(AgentRunnerToolTokenService, { args: [{} as never] });
    sut = new AgentRunnerService(
      configRepository,
      agentRunnerRepository,
      messageRepository,
      sessionRepository,
      websocketRepository,
      toolTokenService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a runner session through the configured runner', async () => {
    configRepository.getEnv.mockReturnValue({
      agent: {
        runnerUrl: 'http://agent-runner:4477',
        runnerHealthTimeoutMs: 3000,
        runnerMessageStreamTimeoutMs: 120_000,
        toolGatewayUrl: undefined,
      },
    } as never);
    agentRunnerRepository.createSession.mockResolvedValue({
      runnerSessionId: 'stub-00000000-0000-4000-8000-000000000100',
      capabilities: { protocolVersion: '2026-05-14', streaming: true, tools: ['echo'], models: [] },
    });

    await expect(sut.createSession(makeCreateSessionBody())).resolves.toEqual({
      runnerEndpoint: 'http://agent-runner:4477',
      runnerSessionId: 'stub-00000000-0000-4000-8000-000000000100',
      runnerCapabilitiesSnapshot: { protocolVersion: '2026-05-14', streaming: true, tools: ['echo'], models: [] },
    });
    expect(agentRunnerRepository.createSession).toHaveBeenCalledWith({
      url: 'http://agent-runner:4477',
      timeoutMs: 3000,
      body: expect.objectContaining({
        gallerySessionId: '00000000-0000-4000-8000-000000000100',
        model: 'gpt-5.1',
        toolGateway: null,
      }),
    });
    expect(agentRunnerRepository.createSession.mock.calls[0][0].body).not.toHaveProperty('userId');
    expect(toolTokenService.create).not.toHaveBeenCalled();
  });

  it('passes configured tool gateway URL and short-lived token to the runner without returning the token', async () => {
    configRepository.getEnv.mockReturnValue({
      agent: {
        runnerUrl: 'http://agent-runner:4477',
        runnerHealthTimeoutMs: 3000,
        runnerMessageStreamTimeoutMs: 120_000,
        toolGatewayUrl: 'http://immich-server:2283/api/agent/internal/tools',
      },
    } as never);
    const body = makeCreateSessionBody();
    body.permissionPlan.limits.expiresInMinutes = 45;
    toolTokenService.create.mockReturnValue('tool-token');
    agentRunnerRepository.createSession.mockResolvedValue({
      runnerSessionId: 'stub-00000000-0000-4000-8000-000000000100',
      capabilities: { protocolVersion: '2026-05-14', streaming: true, tools: ['echo'], models: [] },
    });

    await expect(sut.createSession(body)).resolves.toEqual({
      runnerEndpoint: 'http://agent-runner:4477',
      runnerSessionId: 'stub-00000000-0000-4000-8000-000000000100',
      runnerCapabilitiesSnapshot: { protocolVersion: '2026-05-14', streaming: true, tools: ['echo'], models: [] },
    });

    expect(toolTokenService.create).toHaveBeenCalledWith({
      sessionId: '00000000-0000-4000-8000-000000000100',
      userId,
      expiresAt: new Date('2026-05-14T10:45:00.000Z'),
    });
    expect(agentRunnerRepository.createSession).toHaveBeenCalledWith({
      url: 'http://agent-runner:4477',
      timeoutMs: 3000,
      body: expect.objectContaining({
        gallerySessionId: '00000000-0000-4000-8000-000000000100',
        toolGateway: {
          url: 'http://immich-server:2283/api/agent/internal/tools',
          token: 'tool-token',
        },
      }),
    });
    expect(agentRunnerRepository.createSession.mock.calls[0][0].body).not.toHaveProperty('userId');
  });

  it('uses the default two-hour tool token expiry when the permission plan has no explicit expiry', async () => {
    const body = makeCreateSessionBody();
    body.permissionPlan.limits.expiresInMinutes = null;
    configRepository.getEnv.mockReturnValue({
      agent: {
        runnerUrl: 'http://agent-runner:4477',
        runnerHealthTimeoutMs: 3000,
        runnerMessageStreamTimeoutMs: 120_000,
        toolGatewayUrl: 'http://immich-server:2283/api/agent/internal/tools',
      },
    } as never);
    toolTokenService.create.mockReturnValue('tool-token');
    agentRunnerRepository.createSession.mockResolvedValue({
      runnerSessionId: 'stub-00000000-0000-4000-8000-000000000100',
      capabilities: { protocolVersion: '2026-05-14', streaming: true, tools: ['echo'], models: [] },
    });

    await sut.createSession(body);

    expect(toolTokenService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: new Date('2026-05-14T12:00:00.000Z'),
      }),
    );
  });

  it('rejects runner session creation when the runner is not configured', async () => {
    configRepository.getEnv.mockReturnValue({
      agent: { runnerHealthTimeoutMs: 2000 },
    } as never);

    await expect(sut.createSession(makeCreateSessionBody())).rejects.toThrow('Agent runner is not configured');
    expect(agentRunnerRepository.createSession).not.toHaveBeenCalled();
  });

  it('streams a user message to the runner, emits deltas, and persists the completed assistant message', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000100';
    const runnerSessionId = 'runner-session-1';
    const messageId = '00000000-0000-4000-8000-000000000200';
    const content: AgentMessageContent = { blocks: [{ type: 'text', text: 'Organize my photos.' }] };
    const assistantContent: AgentMessageContent = { blocks: [{ type: 'text', text: 'I can help with that.' }] };
    const assistantMessage = makeAssistantMessage({ sessionId, content: assistantContent });

    configRepository.getEnv.mockReturnValue({
      agent: {
        runnerUrl: 'http://agent-runner:4477',
        runnerHealthTimeoutMs: 3000,
        runnerMessageStreamTimeoutMs: 120_000,
      },
    } as never);
    agentRunnerRepository.streamMessage.mockReturnValue(
      streamEvents([
        {
          type: 'assistant-message-delta',
          sessionId,
          runnerSessionId,
          delta: 'I can',
          sequence: 1,
        },
        {
          type: 'assistant-message-completed',
          sessionId,
          runnerSessionId,
          providerMessageId: 'provider-message-1',
          content: assistantContent,
        },
      ]),
    );
    messageRepository.create.mockResolvedValue(assistantMessage);
    sessionRepository.getById.mockResolvedValue({ status: AgentSessionStatus.Running } as never);

    await sut.sendMessage({ userId, sessionId, runnerSessionId, messageId, content });

    expect(agentRunnerRepository.streamMessage).toHaveBeenCalledWith({
      url: 'http://agent-runner:4477',
      runnerSessionId,
      timeoutMs: 120_000,
      body: { gallerySessionId: sessionId, messageId, content },
    });
    expect(websocketRepository.clientSend).toHaveBeenNthCalledWith(1, 'on_agent_session_event', userId, {
      type: 'assistant-message-delta',
      sessionId,
      delta: 'I can',
      sequence: 1,
      createdAt: '2026-05-14T10:00:00.000Z',
    });
    expect(messageRepository.create).toHaveBeenCalledWith({
      sessionId,
      role: AgentMessageRole.Assistant,
      content: assistantContent,
      providerMessageId: 'provider-message-1',
      toolCallId: null,
    });
    expect(websocketRepository.clientSend).toHaveBeenNthCalledWith(2, 'on_agent_session_event', userId, {
      type: 'assistant-message-created',
      sessionId,
      message: {
        id: assistantMessage.id,
        sessionId,
        role: AgentMessageRole.Assistant,
        content: assistantContent,
        providerMessageId: 'provider-message-1',
        toolCallId: null,
        createdAt: new Date('2026-05-14T10:00:01.000Z'),
      },
      createdAt: '2026-05-14T10:00:00.000Z',
    });
  });

  it('marks the session interrupted and emits an error when runner message streaming fails', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000100';
    const runnerSessionId = 'runner-session-1';
    const messageId = '00000000-0000-4000-8000-000000000200';
    const content: AgentMessageContent = { blocks: [{ type: 'text', text: 'Organize my photos.' }] };
    const error = new Error('connection refused');

    configRepository.getEnv.mockReturnValue({
      agent: {
        runnerUrl: 'http://agent-runner:4477',
        runnerHealthTimeoutMs: 3000,
        runnerMessageStreamTimeoutMs: 120_000,
      },
    } as never);
    agentRunnerRepository.streamMessage.mockReturnValue(failingStream(error));
    sessionRepository.markInterruptedFromActive.mockResolvedValue({} as never);

    await expect(sut.sendMessage({ userId, sessionId, runnerSessionId, messageId, content })).rejects.toBe(error);

    expect(sessionRepository.markInterruptedFromActive).toHaveBeenCalledWith(userId, sessionId);
    expect(sessionRepository.update).not.toHaveBeenCalled();
    expect(websocketRepository.clientSend).toHaveBeenCalledWith('on_agent_session_event', userId, {
      type: 'runner-error',
      sessionId,
      message: 'The assistant runner stopped while processing the message.',
      createdAt: '2026-05-14T10:00:00.000Z',
    });
  });

  it('marks the session interrupted and emits an error when the runner stream ends empty', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000100';
    const runnerSessionId = 'runner-session-1';
    const messageId = '00000000-0000-4000-8000-000000000200';
    const content: AgentMessageContent = { blocks: [{ type: 'text', text: 'Organize my photos.' }] };

    configRepository.getEnv.mockReturnValue({
      agent: {
        runnerUrl: 'http://agent-runner:4477',
        runnerHealthTimeoutMs: 3000,
        runnerMessageStreamTimeoutMs: 120_000,
      },
    } as never);
    agentRunnerRepository.streamMessage.mockReturnValue(streamEvents([]));
    sessionRepository.markInterruptedFromActive.mockResolvedValue({} as never);

    await expect(sut.sendMessage({ userId, sessionId, runnerSessionId, messageId, content })).rejects.toThrow(
      'Agent runner message stream ended before completion',
    );

    expect(messageRepository.create).not.toHaveBeenCalled();
    expect(sessionRepository.markInterruptedFromActive).toHaveBeenCalledWith(userId, sessionId);
    expect(websocketRepository.clientSend).toHaveBeenCalledWith('on_agent_session_event', userId, {
      type: 'runner-error',
      sessionId,
      message: 'The assistant runner stopped while processing the message.',
      createdAt: '2026-05-14T10:00:00.000Z',
    });
  });

  it('marks the session interrupted and emits an error when the runner stream ends after deltas without completion', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000100';
    const runnerSessionId = 'runner-session-1';
    const messageId = '00000000-0000-4000-8000-000000000200';
    const content: AgentMessageContent = { blocks: [{ type: 'text', text: 'Organize my photos.' }] };

    configRepository.getEnv.mockReturnValue({
      agent: {
        runnerUrl: 'http://agent-runner:4477',
        runnerHealthTimeoutMs: 3000,
        runnerMessageStreamTimeoutMs: 120_000,
      },
    } as never);
    agentRunnerRepository.streamMessage.mockReturnValue(
      streamEvents([
        {
          type: 'assistant-message-delta',
          sessionId,
          runnerSessionId,
          delta: 'Partial',
          sequence: 1,
        },
      ]),
    );
    sessionRepository.markInterruptedFromActive.mockResolvedValue({} as never);

    await expect(sut.sendMessage({ userId, sessionId, runnerSessionId, messageId, content })).rejects.toThrow(
      'Agent runner message stream ended before completion',
    );

    expect(messageRepository.create).not.toHaveBeenCalled();
    expect(sessionRepository.markInterruptedFromActive).toHaveBeenCalledWith(userId, sessionId);
    expect(websocketRepository.clientSend).toHaveBeenLastCalledWith('on_agent_session_event', userId, {
      type: 'runner-error',
      sessionId,
      message: 'The assistant runner stopped while processing the message.',
      createdAt: '2026-05-14T10:00:00.000Z',
    });
  });

  it('marks the session interrupted with the runner-reported provider failure', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000100';
    const runnerSessionId = 'runner-session-1';
    const messageId = '00000000-0000-4000-8000-000000000200';
    const content: AgentMessageContent = { blocks: [{ type: 'text', text: 'Organize my photos.' }] };

    configRepository.getEnv.mockReturnValue({
      agent: {
        runnerUrl: 'http://agent-runner:4477',
        runnerHealthTimeoutMs: 3000,
        runnerMessageStreamTimeoutMs: 120_000,
      },
    } as never);
    agentRunnerRepository.streamMessage.mockReturnValue(
      streamEvents([
        {
          type: 'runner-error',
          sessionId,
          runnerSessionId,
          message: 'OpenAI rejected the request.',
        },
      ]),
    );
    sessionRepository.markInterruptedFromActive.mockResolvedValue({} as never);

    await expect(sut.sendMessage({ userId, sessionId, runnerSessionId, messageId, content })).rejects.toThrow(
      'OpenAI rejected the request.',
    );

    expect(sessionRepository.markInterruptedFromActive).toHaveBeenCalledWith(userId, sessionId);
    expect(messageRepository.create).not.toHaveBeenCalled();
    expect(websocketRepository.clientSend).toHaveBeenCalledWith('on_agent_session_event', userId, {
      type: 'runner-error',
      sessionId,
      message: 'OpenAI rejected the request.',
      createdAt: '2026-05-14T10:00:00.000Z',
    });
  });

  it('does not persist assistant completion when a later matching runner error arrives', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000100';
    const runnerSessionId = 'runner-session-1';
    const messageId = '00000000-0000-4000-8000-000000000200';
    const content: AgentMessageContent = { blocks: [{ type: 'text', text: 'Organize my photos.' }] };
    const assistantContent: AgentMessageContent = { blocks: [{ type: 'text', text: 'I started organizing.' }] };
    const assistantMessage = makeAssistantMessage({ sessionId, content: assistantContent });

    configRepository.getEnv.mockReturnValue({
      agent: {
        runnerUrl: 'http://agent-runner:4477',
        runnerHealthTimeoutMs: 3000,
        runnerMessageStreamTimeoutMs: 120_000,
      },
    } as never);
    agentRunnerRepository.streamMessage.mockReturnValue(
      streamEvents([
        {
          type: 'assistant-message-completed',
          sessionId,
          runnerSessionId,
          providerMessageId: 'provider-message-1',
          content: assistantContent,
        },
        {
          type: 'runner-error',
          sessionId,
          runnerSessionId,
          message: 'Provider failed after completion.',
        },
      ]),
    );
    sessionRepository.getById.mockResolvedValue({ status: AgentSessionStatus.Running } as never);
    messageRepository.create.mockResolvedValue(assistantMessage);
    sessionRepository.markInterruptedFromActive.mockResolvedValue({} as never);

    await expect(sut.sendMessage({ userId, sessionId, runnerSessionId, messageId, content })).rejects.toThrow(
      'Provider failed after completion.',
    );

    expect(messageRepository.create).not.toHaveBeenCalled();
    expect(sessionRepository.markInterruptedFromActive).toHaveBeenCalledWith(userId, sessionId);
    expect(websocketRepository.clientSend).toHaveBeenCalledWith('on_agent_session_event', userId, {
      type: 'runner-error',
      sessionId,
      message: 'Provider failed after completion.',
      createdAt: '2026-05-14T10:00:00.000Z',
    });
  });

  it.each([AgentSessionStatus.Cancelled, AgentSessionStatus.Interrupted])(
    'does not persist or emit assistant completion when the session is %s',
    async (status) => {
      const userId = '00000000-0000-4000-8000-000000000001';
      const sessionId = '00000000-0000-4000-8000-000000000100';
      const runnerSessionId = 'runner-session-1';
      const messageId = '00000000-0000-4000-8000-000000000200';
      const content: AgentMessageContent = { blocks: [{ type: 'text', text: 'Organize my photos.' }] };
      const assistantContent: AgentMessageContent = { blocks: [{ type: 'text', text: 'I can help with that.' }] };

      configRepository.getEnv.mockReturnValue({
        agent: {
          runnerUrl: 'http://agent-runner:4477',
          runnerHealthTimeoutMs: 3000,
          runnerMessageStreamTimeoutMs: 120_000,
        },
      } as never);
      agentRunnerRepository.streamMessage.mockReturnValue(
        streamEvents([
          {
            type: 'assistant-message-completed',
            sessionId,
            runnerSessionId,
            providerMessageId: 'provider-message-1',
            content: assistantContent,
          },
        ]),
      );
      sessionRepository.getById.mockResolvedValue({ status } as never);

      await sut.sendMessage({ userId, sessionId, runnerSessionId, messageId, content });

      expect(sessionRepository.getById).toHaveBeenCalledWith(userId, sessionId);
      expect(messageRepository.create).not.toHaveBeenCalled();
      expect(websocketRepository.clientSend).not.toHaveBeenCalledWith(
        'on_agent_session_event',
        userId,
        expect.objectContaining({ type: 'assistant-message-created' }),
      );
    },
  );

  it('emits a runner error and attempts conditional interruption when runner config is removed', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000100';
    const runnerSessionId = 'runner-session-1';
    const messageId = '00000000-0000-4000-8000-000000000200';
    const content: AgentMessageContent = { blocks: [{ type: 'text', text: 'Organize my photos.' }] };

    configRepository.getEnv.mockReturnValue({
      agent: { runnerHealthTimeoutMs: 3000 },
    } as never);
    sessionRepository.markInterruptedFromActive.mockResolvedValue({} as never);

    await expect(sut.sendMessage({ userId, sessionId, runnerSessionId, messageId, content })).rejects.toThrow(
      'Agent runner is not configured',
    );

    expect(agentRunnerRepository.streamMessage).not.toHaveBeenCalled();
    expect(sessionRepository.markInterruptedFromActive).toHaveBeenCalledWith(userId, sessionId);
    expect(sessionRepository.update).not.toHaveBeenCalled();
    expect(websocketRepository.clientSend).toHaveBeenCalledWith('on_agent_session_event', userId, {
      type: 'runner-error',
      sessionId,
      message: 'The assistant runner stopped while processing the message.',
      createdAt: '2026-05-14T10:00:00.000Z',
    });
  });

  it('still emits runner error and rethrows the stream error when conditional interruption fails', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000100';
    const runnerSessionId = 'runner-session-1';
    const messageId = '00000000-0000-4000-8000-000000000200';
    const content: AgentMessageContent = { blocks: [{ type: 'text', text: 'Organize my photos.' }] };
    const streamError = new Error('connection refused');

    configRepository.getEnv.mockReturnValue({
      agent: { runnerUrl: 'http://agent-runner:4477', runnerHealthTimeoutMs: 3000 },
    } as never);
    agentRunnerRepository.streamMessage.mockReturnValue(failingStream(streamError));
    sessionRepository.markInterruptedFromActive.mockRejectedValue(new Error('row update failed'));

    await expect(sut.sendMessage({ userId, sessionId, runnerSessionId, messageId, content })).rejects.toBe(streamError);

    expect(sessionRepository.markInterruptedFromActive).toHaveBeenCalledWith(userId, sessionId);
    expect(websocketRepository.clientSend).toHaveBeenCalledWith('on_agent_session_event', userId, {
      type: 'runner-error',
      sessionId,
      message: 'The assistant runner stopped while processing the message.',
      createdAt: '2026-05-14T10:00:00.000Z',
    });
  });

  it('ignores runner stream events for another Gallery or runner session', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000100';
    const runnerSessionId = 'runner-session-1';
    const messageId = '00000000-0000-4000-8000-000000000200';
    const content: AgentMessageContent = { blocks: [{ type: 'text', text: 'Organize my photos.' }] };

    configRepository.getEnv.mockReturnValue({
      agent: { runnerUrl: 'http://agent-runner:4477', runnerHealthTimeoutMs: 3000 },
    } as never);
    agentRunnerRepository.streamMessage.mockReturnValue(
      streamEvents([
        {
          type: 'assistant-message-delta',
          sessionId: '00000000-0000-4000-8000-000000000999',
          runnerSessionId,
          delta: 'wrong gallery session',
          sequence: 1,
        },
        {
          type: 'assistant-message-completed',
          sessionId,
          runnerSessionId: 'other-runner-session',
          providerMessageId: 'provider-message-1',
          content: { blocks: [{ type: 'text', text: 'Wrong runner session.' }] },
        },
      ]),
    );
    sessionRepository.markInterruptedFromActive.mockResolvedValue({} as never);

    await expect(sut.sendMessage({ userId, sessionId, runnerSessionId, messageId, content })).rejects.toThrow(
      'Agent runner message stream ended before completion',
    );

    expect(messageRepository.create).not.toHaveBeenCalled();
    expect(websocketRepository.clientSend).toHaveBeenCalledWith('on_agent_session_event', userId, {
      type: 'runner-error',
      sessionId,
      message: 'The assistant runner stopped while processing the message.',
      createdAt: '2026-05-14T10:00:00.000Z',
    });
  });

  it('ignores runner-reported errors for another Gallery or runner session', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000100';
    const runnerSessionId = 'runner-session-1';
    const messageId = '00000000-0000-4000-8000-000000000200';
    const content: AgentMessageContent = { blocks: [{ type: 'text', text: 'Organize my photos.' }] };

    configRepository.getEnv.mockReturnValue({
      agent: {
        runnerUrl: 'http://agent-runner:4477',
        runnerHealthTimeoutMs: 3000,
        runnerMessageStreamTimeoutMs: 120_000,
      },
    } as never);
    agentRunnerRepository.streamMessage.mockReturnValue(
      streamEvents([
        {
          type: 'runner-error',
          sessionId: '00000000-0000-4000-8000-000000000999',
          runnerSessionId,
          message: 'Wrong Gallery session error.',
        },
        {
          type: 'runner-error',
          sessionId,
          runnerSessionId: 'other-runner-session',
          message: 'Wrong runner session error.',
        },
      ]),
    );
    sessionRepository.markInterruptedFromActive.mockResolvedValue({} as never);

    await expect(sut.sendMessage({ userId, sessionId, runnerSessionId, messageId, content })).rejects.toThrow(
      'Agent runner message stream ended before completion',
    );

    expect(messageRepository.create).not.toHaveBeenCalled();
    expect(websocketRepository.clientSend).toHaveBeenCalledWith('on_agent_session_event', userId, {
      type: 'runner-error',
      sessionId,
      message: 'The assistant runner stopped while processing the message.',
      createdAt: '2026-05-14T10:00:00.000Z',
    });
  });

  it('tracks active runner dispatches per session while a stream is in flight', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000100';
    const runnerSessionId = 'runner-session-1';
    const messageId = '00000000-0000-4000-8000-000000000200';
    const content: AgentMessageContent = { blocks: [{ type: 'text', text: 'Organize my photos.' }] };
    const assistantContent: AgentMessageContent = { blocks: [{ type: 'text', text: 'Done.' }] };
    const assistantMessage = makeAssistantMessage({ sessionId, content: assistantContent });
    let finishStream!: () => void;
    async function* controlledStream(): AsyncGenerator<AgentRunnerStreamEvent> {
      await new Promise<void>((resolve) => {
        finishStream = resolve;
      });
      yield {
        type: 'assistant-message-completed',
        sessionId,
        runnerSessionId,
        providerMessageId: 'provider-message-1',
        content: assistantContent,
      };
    }

    configRepository.getEnv.mockReturnValue({
      agent: {
        runnerUrl: 'http://agent-runner:4477',
        runnerHealthTimeoutMs: 3000,
        runnerMessageStreamTimeoutMs: 120_000,
      },
    } as never);
    agentRunnerRepository.streamMessage.mockReturnValue(controlledStream());
    messageRepository.create.mockResolvedValue(assistantMessage);
    sessionRepository.getById.mockResolvedValue({ status: AgentSessionStatus.Running } as never);

    expect(sut.isSessionDispatchActive(sessionId)).toBe(false);
    const first = sut.sendMessage({ userId, sessionId, runnerSessionId, messageId, content });

    expect(sut.isSessionDispatchActive(sessionId)).toBe(true);
    expect(agentRunnerRepository.streamMessage).toHaveBeenCalledTimes(1);
    finishStream();
    await first;
    expect(sut.isSessionDispatchActive(sessionId)).toBe(false);
  });

  it('returns disabled status without probing when runner URL is missing', async () => {
    configRepository.getEnv.mockReturnValue({
      agent: { runnerHealthTimeoutMs: 2000 },
    } as never);

    await expect(sut.getStatus()).resolves.toEqual({
      configured: false,
      healthy: false,
      reason: 'not-configured',
      version: null,
      capabilities: null,
      checkedAt: new Date('2026-05-14T10:00:00.000Z'),
    });
    expect(agentRunnerRepository.getStatus).not.toHaveBeenCalled();
  });

  it('probes the configured runner and maps a healthy response', async () => {
    configRepository.getEnv.mockReturnValue({
      agent: { runnerUrl: 'http://agent-runner:4477', runnerHealthTimeoutMs: 3000 },
    } as never);
    agentRunnerRepository.getStatus.mockResolvedValue({
      healthy: true,
      reason: 'healthy',
      version: '0.1.0',
      capabilities: {
        protocolVersion: '2026-05-14',
        streaming: true,
        tools: ['echo'],
        models: [],
      },
    });

    await expect(sut.getStatus()).resolves.toEqual({
      configured: true,
      healthy: true,
      reason: 'healthy',
      version: '0.1.0',
      capabilities: {
        protocolVersion: '2026-05-14',
        streaming: true,
        tools: ['echo'],
        models: [],
      },
      checkedAt: new Date('2026-05-14T10:00:00.000Z'),
    });
    expect(agentRunnerRepository.getStatus).toHaveBeenCalledWith({
      url: 'http://agent-runner:4477',
      timeoutMs: 3000,
    });
  });

  it('maps unhealthy probes while preserving configured=true', async () => {
    configRepository.getEnv.mockReturnValue({
      agent: { runnerUrl: 'http://agent-runner:4477', runnerHealthTimeoutMs: 3000 },
    } as never);
    agentRunnerRepository.getStatus.mockResolvedValue({
      healthy: false,
      reason: 'timeout',
      version: null,
      capabilities: null,
    });

    await expect(sut.getStatus()).resolves.toMatchObject({
      configured: true,
      healthy: false,
      reason: 'timeout',
      version: null,
      capabilities: null,
    });
  });

  it('caches configured runner status briefly', async () => {
    configRepository.getEnv.mockReturnValue({
      agent: { runnerUrl: 'http://agent-runner:4477', runnerHealthTimeoutMs: 3000 },
    } as never);
    agentRunnerRepository.getStatus.mockResolvedValue({
      healthy: true,
      reason: 'healthy',
      version: null,
      capabilities: { protocolVersion: null, streaming: false, tools: [], models: [] },
    });

    await sut.getStatus();
    await sut.getStatus();

    expect(agentRunnerRepository.getStatus).toHaveBeenCalledTimes(1);
  });

  it('refreshes cached status when runner config changes', async () => {
    configRepository.getEnv
      .mockReturnValueOnce({
        agent: { runnerUrl: 'http://agent-runner-a:4477', runnerHealthTimeoutMs: 3000 },
      } as never)
      .mockReturnValueOnce({
        agent: { runnerUrl: 'http://agent-runner-b:4477', runnerHealthTimeoutMs: 5000 },
      } as never);
    agentRunnerRepository.getStatus.mockResolvedValue({
      healthy: true,
      reason: 'healthy',
      version: null,
      capabilities: { protocolVersion: null, streaming: false, tools: [], models: [] },
    });

    await sut.getStatus();
    await sut.getStatus();

    expect(agentRunnerRepository.getStatus).toHaveBeenCalledTimes(2);
    expect(agentRunnerRepository.getStatus).toHaveBeenLastCalledWith({
      url: 'http://agent-runner-b:4477',
      timeoutMs: 5000,
    });
  });

  it('deduplicates concurrent configured runner status probes', async () => {
    configRepository.getEnv.mockReturnValue({
      agent: { runnerUrl: 'http://agent-runner:4477', runnerHealthTimeoutMs: 3000 },
    } as never);

    let resolveProbe: (value: Awaited<ReturnType<AgentRunnerRepository['getStatus']>>) => void;
    agentRunnerRepository.getStatus.mockReturnValue(
      new Promise((resolve) => {
        resolveProbe = resolve;
      }),
    );

    const first = sut.getStatus();
    const second = sut.getStatus();

    expect(agentRunnerRepository.getStatus).toHaveBeenCalledTimes(1);

    resolveProbe!({
      healthy: true,
      reason: 'healthy',
      version: null,
      capabilities: { protocolVersion: null, streaming: false, tools: [], models: [] },
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        configured: true,
        healthy: true,
        reason: 'healthy',
        version: null,
        capabilities: { protocolVersion: null, streaming: false, tools: [], models: [] },
        checkedAt: new Date('2026-05-14T10:00:00.000Z'),
      },
      {
        configured: true,
        healthy: true,
        reason: 'healthy',
        version: null,
        capabilities: { protocolVersion: null, streaming: false, tools: [], models: [] },
        checkedAt: new Date('2026-05-14T10:00:00.000Z'),
      },
    ]);
  });

  it('does not deduplicate concurrent probes for different runner configs', async () => {
    configRepository.getEnv
      .mockReturnValueOnce({
        agent: { runnerUrl: 'http://agent-runner-a:4477', runnerHealthTimeoutMs: 3000 },
      } as never)
      .mockReturnValueOnce({
        agent: { runnerUrl: 'http://agent-runner-b:4477', runnerHealthTimeoutMs: 5000 },
      } as never);

    let resolveFirst: (value: Awaited<ReturnType<AgentRunnerRepository['getStatus']>>) => void;
    let resolveSecond: (value: Awaited<ReturnType<AgentRunnerRepository['getStatus']>>) => void;
    agentRunnerRepository.getStatus
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );

    const first = sut.getStatus();
    const second = sut.getStatus();

    expect(agentRunnerRepository.getStatus).toHaveBeenCalledTimes(2);
    expect(agentRunnerRepository.getStatus).toHaveBeenNthCalledWith(1, {
      url: 'http://agent-runner-a:4477',
      timeoutMs: 3000,
    });
    expect(agentRunnerRepository.getStatus).toHaveBeenNthCalledWith(2, {
      url: 'http://agent-runner-b:4477',
      timeoutMs: 5000,
    });

    resolveFirst!({
      healthy: true,
      reason: 'healthy',
      version: 'a',
      capabilities: { protocolVersion: null, streaming: false, tools: [], models: [] },
    });
    resolveSecond!({
      healthy: true,
      reason: 'healthy',
      version: 'b',
      capabilities: { protocolVersion: null, streaming: false, tools: [], models: [] },
    });

    await expect(first).resolves.toMatchObject({ version: 'a' });
    await expect(second).resolves.toMatchObject({ version: 'b' });
  });

  it('deduplicates matching runner configs when another config is also in flight', async () => {
    configRepository.getEnv
      .mockReturnValueOnce({
        agent: { runnerUrl: 'http://agent-runner-a:4477', runnerHealthTimeoutMs: 3000 },
      } as never)
      .mockReturnValueOnce({
        agent: { runnerUrl: 'http://agent-runner-b:4477', runnerHealthTimeoutMs: 5000 },
      } as never)
      .mockReturnValueOnce({
        agent: { runnerUrl: 'http://agent-runner-a:4477', runnerHealthTimeoutMs: 3000 },
      } as never);

    let resolveFirst: (value: Awaited<ReturnType<AgentRunnerRepository['getStatus']>>) => void;
    let resolveSecond: (value: Awaited<ReturnType<AgentRunnerRepository['getStatus']>>) => void;
    agentRunnerRepository.getStatus
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );

    const first = sut.getStatus();
    const second = sut.getStatus();
    const third = sut.getStatus();

    expect(agentRunnerRepository.getStatus).toHaveBeenCalledTimes(2);

    resolveFirst!({
      healthy: true,
      reason: 'healthy',
      version: 'a',
      capabilities: { protocolVersion: null, streaming: false, tools: [], models: [] },
    });
    resolveSecond!({
      healthy: true,
      reason: 'healthy',
      version: 'b',
      capabilities: { protocolVersion: null, streaming: false, tools: [], models: [] },
    });

    await expect(first).resolves.toMatchObject({ version: 'a' });
    await expect(second).resolves.toMatchObject({ version: 'b' });
    await expect(third).resolves.toMatchObject({ version: 'a' });
  });

  it('refreshes cached status after the cache window', async () => {
    configRepository.getEnv.mockReturnValue({
      agent: { runnerUrl: 'http://agent-runner:4477', runnerHealthTimeoutMs: 3000 },
    } as never);
    agentRunnerRepository.getStatus.mockResolvedValue({
      healthy: true,
      reason: 'healthy',
      version: null,
      capabilities: { protocolVersion: null, streaming: false, tools: [], models: [] },
    });

    await sut.getStatus();
    vi.advanceTimersByTime(15_001);
    await sut.getStatus();

    expect(agentRunnerRepository.getStatus).toHaveBeenCalledTimes(2);
  });
});
