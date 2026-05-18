import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentSessionActivityEvent } from 'src/database';
import { AgentSessionActivityEventCreateDto } from 'src/dtos/agent-session-activity-event.dto';
import {
  AgentSessionActivityEventSource,
  AgentSessionActivityEventStatus,
  AgentSessionStatus,
} from 'src/enum';
import { AgentSessionActivityEventRepository } from 'src/repositories/agent-session-activity-event.repository';
import { AgentSessionRepository } from 'src/repositories/agent-session.repository';
import { AuthDto } from 'src/dtos/auth.dto';
import { WebsocketRepository } from 'src/repositories/websocket.repository';
import { AgentRunnerActivityStreamEvent } from 'src/types/agent-runner.types';

@Injectable()
export class AgentSessionActivityEventService {
  private static readonly terminalStatuses = new Set([
    AgentSessionStatus.Completed,
    AgentSessionStatus.Cancelled,
    AgentSessionStatus.Failed,
  ]);

  constructor(
    private readonly repository: AgentSessionActivityEventRepository,
    private readonly sessionRepository: AgentSessionRepository,
    private readonly websocketRepository: WebsocketRepository,
  ) {}

  async getHistory(auth: AuthDto, sessionId: string): Promise<AgentSessionActivityEvent[]> {
    const session = await this.sessionRepository.getById(auth.user.id, sessionId);
    if (!session) {
      throw new BadRequestException('Agent session not found');
    }

    return this.repository.getBySessionId(session.id);
  }

  async create(
    auth: AuthDto,
    sessionId: string,
    dto: AgentSessionActivityEventCreateDto,
  ): Promise<AgentSessionActivityEvent | null> {
    const session = await this.sessionRepository.getById(auth.user.id, sessionId);
    if (!session) {
      throw new BadRequestException('Agent session not found');
    }

    if (AgentSessionActivityEventService.terminalStatuses.has(session.status)) {
      return null;
    }

    const event = await this.repository.create({
      sessionId: session.id,
      kind: dto.kind,
      status: dto.status,
      source: dto.source,
      summary: this.sanitizeSummary(dto.summary),
      counts: dto.counts,
    });

    this.websocketRepository.clientSend('on_agent_session_event', auth.user.id, {
      type: 'activity',
      sessionId: session.id,
      event,
      createdAt: event.createdAt.toISOString(),
    });

    return event;
  }

  createSystemEvent(userId: string, sessionId: string, event: Record<string, unknown>) {
    return this.create({ user: { id: userId } } as AuthDto, sessionId, {
      kind: event.kind,
      status: event.status ?? AgentSessionActivityEventStatus.Running,
      source: event.source ?? AgentSessionActivityEventSource.Server,
      summary: event.summary,
      counts: event.counts,
    } as AgentSessionActivityEventCreateDto);
  }

  normalizeRunnerEvent(event: AgentRunnerActivityStreamEvent): AgentSessionActivityEventCreateDto | null {
    const parsed = AgentSessionActivityEventCreateDto.schema.safeParse({
      kind: event.kind,
      status: event.status ?? AgentSessionActivityEventStatus.Running,
      source: AgentSessionActivityEventSource.Runner,
      summary: event.summary,
      counts: event.counts,
    });

    return parsed.success ? parsed.data : null;
  }

  private sanitizeSummary(summary: string | null | undefined) {
    if (!summary) {
      return null;
    }

    const normalized = summary.trim();
    if (/chain[- ]of[- ]thought|hidden reasoning|raw prompt|system prompt|developer prompt/i.test(normalized)) {
      return 'Activity update';
    }

    const redacted = normalized
      .replaceAll(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replaceAll(/\b(sk|rk|pk|api)[-_][A-Za-z0-9_-]{8,}\b/gi, '[REDACTED]');

    return redacted.slice(0, 240);
  }
}
