import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentMessage } from 'src/database';
import { AgentRunnerStatusDto } from 'src/dtos/agent-runner.dto';
import { AgentMessageRole, AgentSessionStatus } from 'src/enum';
import { AgentMessageRepository } from 'src/repositories/agent-message.repository';
import { AgentRunnerRepository } from 'src/repositories/agent-runner.repository';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { ConfigRepository } from 'src/repositories/config.repository';
import { WebsocketRepository } from 'src/repositories/websocket.repository';
import { AgentRunnerToolTokenService } from 'src/services/agent-runner-tool-token.service';
import { AgentMessageContent } from 'src/types/agent-message.types';
import { AgentRunnerCreateSessionInput, AgentRunnerStreamEvent } from 'src/types/agent-runner.types';

const RUNNER_STATUS_CACHE_MS = 15_000;

const buildMcpSessionUrl = (mcpGatewayBaseUrl: string, sessionId: string) =>
  new URL(`sessions/${encodeURIComponent(sessionId)}`, `${mcpGatewayBaseUrl.replace(/\/+$/, '')}/`).toString();

class RunnerReportedError extends Error {}

@Injectable()
export class AgentRunnerService {
  private static readonly completionActiveStatuses = [
    AgentSessionStatus.Running,
    AgentSessionStatus.WaitingForPlanReview,
  ];

  private statusCache?: { key: string; value: AgentRunnerStatusDto; expiresAt: number };
  private statusInFlight = new Map<string, Promise<AgentRunnerStatusDto>>();
  private sessionDispatches = new Map<string, Promise<void>>();

  constructor(
    private readonly configRepository: ConfigRepository,
    private readonly agentRunnerRepository: AgentRunnerRepository,
    private readonly messageRepository: AgentMessageRepository,
    private readonly sessionRepository: AgentSessionRepository,
    private readonly websocketRepository: WebsocketRepository,
    private readonly toolTokenService: AgentRunnerToolTokenService,
  ) {}

  async createSession(input: AgentRunnerCreateSessionInput) {
    const { userId, ...body } = input;
    const { runnerUrl, runnerHealthTimeoutMs, mcpGatewayUrl } = this.configRepository.getEnv().agent;
    if (!runnerUrl) {
      throw new BadRequestException('Agent runner is not configured');
    }
    if (!mcpGatewayUrl) {
      throw new BadRequestException('Agent MCP gateway is not configured');
    }

    const mcpGateway = {
      url: buildMcpSessionUrl(mcpGatewayUrl, body.gallerySessionId),
      token: this.toolTokenService.create({
        sessionId: body.gallerySessionId,
        userId,
        expiresAt: body.permissionPlan.limits.expiresInMinutes
          ? new Date(Date.now() + body.permissionPlan.limits.expiresInMinutes * 60_000)
          : new Date(Date.now() + 2 * 60 * 60_000),
      }),
    };

    const result = await this.agentRunnerRepository.createSession({
      url: runnerUrl,
      timeoutMs: runnerHealthTimeoutMs,
      body: { ...body, mcpGateway },
    });

    return {
      runnerEndpoint: runnerUrl,
      runnerSessionId: result.runnerSessionId,
      runnerCapabilitiesSnapshot: result.capabilities,
    };
  }

  async validateSession(input: AgentRunnerCreateSessionInput) {
    const { userId: _userId, ...body } = input;
    const { runnerUrl, runnerMessageStreamTimeoutMs } = this.configRepository.getEnv().agent;
    if (!runnerUrl) {
      throw new BadRequestException('Agent runner is not configured');
    }

    await this.agentRunnerRepository.validateSession({
      url: runnerUrl,
      timeoutMs: runnerMessageStreamTimeoutMs,
      body: { ...body, mcpGateway: null },
    });
  }

  async getStatus(): Promise<AgentRunnerStatusDto> {
    const { runnerUrl, runnerHealthTimeoutMs, mcpGatewayUrl } = this.configRepository.getEnv().agent;
    if (!runnerUrl || !mcpGatewayUrl) {
      return this.notConfigured();
    }

    const now = Date.now();
    const cacheKey = `${runnerUrl}:${runnerHealthTimeoutMs}`;
    if (this.statusCache && this.statusCache.key === cacheKey && this.statusCache.expiresAt > now) {
      return this.statusCache.value;
    }

    const statusInFlight = this.statusInFlight.get(cacheKey);
    if (statusInFlight) {
      return statusInFlight;
    }

    const nextStatusInFlight = (async () => {
      try {
        const probe = await this.agentRunnerRepository.getStatus({ url: runnerUrl, timeoutMs: runnerHealthTimeoutMs });
        const value: AgentRunnerStatusDto = {
          configured: true,
          healthy: probe.healthy,
          reason: probe.reason,
          version: probe.version,
          capabilities: probe.capabilities,
          checkedAt: new Date(),
        };
        this.statusCache = { key: cacheKey, value, expiresAt: Date.now() + RUNNER_STATUS_CACHE_MS };
        return value;
      } finally {
        this.statusInFlight.delete(cacheKey);
      }
    })();

    this.statusInFlight.set(cacheKey, nextStatusInFlight);
    return nextStatusInFlight;
  }

  private notConfigured(): AgentRunnerStatusDto {
    return {
      configured: false,
      healthy: false,
      reason: 'not-configured',
      version: null,
      capabilities: null,
      checkedAt: new Date(),
    };
  }

  async sendMessage({
    userId,
    sessionId,
    runnerSessionId,
    messageId,
    content,
  }: {
    userId: string;
    sessionId: string;
    runnerSessionId: string;
    messageId: string;
    content: AgentMessageContent;
  }) {
    const activeDispatch = this.sessionDispatches.get(sessionId);
    if (activeDispatch) {
      throw new BadRequestException('Agent session already has a message in progress');
    }

    const dispatch = this.sendMessageToRunner({ userId, sessionId, runnerSessionId, messageId, content });
    this.sessionDispatches.set(sessionId, dispatch);

    try {
      await dispatch;
    } finally {
      if (this.sessionDispatches.get(sessionId) === dispatch) {
        this.sessionDispatches.delete(sessionId);
      }
    }
  }

  async resumeAfterToolApproval({
    userId,
    sessionId,
    runnerSessionId,
    toolCallId,
    approvalDecision,
    toolResult,
  }: {
    userId: string;
    sessionId: string;
    runnerSessionId: string;
    toolCallId?: string;
    approvalDecision?: 'approved' | 'denied';
    toolResult?: unknown;
  }) {
    const activeDispatch = this.sessionDispatches.get(sessionId);
    if (activeDispatch) {
      throw new BadRequestException('Agent session already has a message in progress');
    }

    const dispatch = this.resumeRunnerSession({
      userId,
      sessionId,
      runnerSessionId,
      toolCallId,
      approvalDecision,
      toolResult,
    });
    this.sessionDispatches.set(sessionId, dispatch);

    try {
      await dispatch;
    } finally {
      if (this.sessionDispatches.get(sessionId) === dispatch) {
        this.sessionDispatches.delete(sessionId);
      }
    }
  }

  isSessionDispatchActive(sessionId: string) {
    return this.sessionDispatches.has(sessionId);
  }

  private async sendMessageToRunner({
    userId,
    sessionId,
    runnerSessionId,
    messageId,
    content,
  }: {
    userId: string;
    sessionId: string;
    runnerSessionId: string;
    messageId: string;
    content: AgentMessageContent;
  }) {
    try {
      const { runnerUrl, runnerMessageStreamTimeoutMs } = this.configRepository.getEnv().agent;
      if (!runnerUrl) {
        throw new BadRequestException('Agent runner is not configured');
      }

      await this.processRunnerStream({
        userId,
        sessionId,
        runnerSessionId,
        stream: this.agentRunnerRepository.streamMessage({
          url: runnerUrl,
          runnerSessionId,
          timeoutMs: runnerMessageStreamTimeoutMs,
          body: { gallerySessionId: sessionId, messageId, content },
        }),
        emptyStreamMessage: 'Agent runner message stream ended before completion',
      });
    } catch (error) {
      await this.emitRunnerFailure(userId, sessionId, error);
      throw error;
    }
  }

  private async resumeRunnerSession({
    userId,
    sessionId,
    runnerSessionId,
    toolCallId,
    approvalDecision,
    toolResult,
  }: {
    userId: string;
    sessionId: string;
    runnerSessionId: string;
    toolCallId?: string;
    approvalDecision?: 'approved' | 'denied';
    toolResult?: unknown;
  }) {
    try {
      const { runnerUrl, runnerMessageStreamTimeoutMs } = this.configRepository.getEnv().agent;
      if (!runnerUrl) {
        throw new BadRequestException('Agent runner is not configured');
      }

      const body = {
        gallerySessionId: sessionId,
        ...(toolCallId ? { toolCallId } : {}),
        ...(approvalDecision ? { approvalDecision } : {}),
        ...(toolResult !== undefined ? { toolResult } : {}),
      };

      await this.processRunnerStream({
        userId,
        sessionId,
        runnerSessionId,
        stream: this.agentRunnerRepository.streamResume({
          url: runnerUrl,
          runnerSessionId,
          timeoutMs: runnerMessageStreamTimeoutMs,
          body,
        }),
        emptyStreamMessage: 'Agent runner resume stream ended before completion',
      });
    } catch (error) {
      await this.emitRunnerFailure(userId, sessionId, error);
      throw error;
    }
  }

  private async processRunnerStream({
    userId,
    sessionId,
    runnerSessionId,
    stream,
    emptyStreamMessage,
  }: {
    userId: string;
    sessionId: string;
    runnerSessionId: string;
    stream: AsyncGenerator<AgentRunnerStreamEvent>;
    emptyStreamMessage: string;
  }) {
    let completedEvent: Extract<AgentRunnerStreamEvent, { type: 'assistant-message-completed' }> | undefined;
    let suppressAssistantOutput = false;
    for await (const event of stream) {
      if (event.sessionId !== sessionId || event.runnerSessionId !== runnerSessionId) {
        continue;
      }

      if (event.type === 'assistant-message-delta') {
        suppressAssistantOutput ||= await this.isWaitingForToolApproval(userId, sessionId);
        if (suppressAssistantOutput) {
          continue;
        }

        this.websocketRepository.clientSend('on_agent_session_event', userId, {
          type: 'assistant-message-delta',
          sessionId,
          delta: event.delta,
          sequence: event.sequence,
          createdAt: this.toIsoNow(),
        });
        continue;
      }

      if (event.type === 'runner-error') {
        throw new RunnerReportedError(event.message);
      }

      completedEvent = event;
    }

    if (!completedEvent) {
      throw new Error(emptyStreamMessage);
    }

    const session = await this.sessionRepository.getById(userId, sessionId);
    if (!session || !AgentRunnerService.completionActiveStatuses.includes(session.status)) {
      return;
    }

    const message = await this.messageRepository.create({
      sessionId,
      role: AgentMessageRole.Assistant,
      content: completedEvent.content,
      providerMessageId: completedEvent.providerMessageId,
      toolCallId: null,
    });
    this.websocketRepository.clientSend('on_agent_session_event', userId, {
      type: 'assistant-message-created',
      sessionId,
      message: this.mapMessage(message),
      createdAt: this.toIsoNow(),
    });
  }

  private async isWaitingForToolApproval(userId: string, sessionId: string) {
    const session = await this.sessionRepository.getById(userId, sessionId);
    return session?.status === AgentSessionStatus.WaitingForToolApproval;
  }

  private async emitRunnerFailure(userId: string, sessionId: string, error: unknown) {
    await this.sessionRepository.markInterruptedFromActive(userId, sessionId).catch(() => {});
    this.websocketRepository.clientSend('on_agent_session_event', userId, {
      type: 'runner-error',
      sessionId,
      message:
        error instanceof RunnerReportedError && error.message.trim().length > 0
          ? error.message
          : 'The assistant runner stopped while processing the message.',
      createdAt: this.toIsoNow(),
    });
  }

  private mapMessage(message: AgentMessage) {
    return {
      id: message.id,
      sessionId: message.sessionId,
      role: message.role,
      content: message.content,
      providerMessageId: message.providerMessageId,
      toolCallId: message.toolCallId,
      createdAt: message.createdAt,
    };
  }

  private toIsoNow() {
    return new Date().toISOString();
  }
}
