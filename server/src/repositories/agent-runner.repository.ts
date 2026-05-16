import { Injectable } from '@nestjs/common';
import { AgentRunnerCapabilities, AgentRunnerStatusReason } from 'src/dtos/agent-runner.dto';
import type {
  AgentRunnerCreateSessionRequest,
  AgentRunnerCreateSessionResult,
  AgentRunnerMessageRequest,
  AgentRunnerResumeRequest,
  AgentRunnerStreamEvent,
  AgentRunnerValidateSessionResult,
} from 'src/types/agent-runner.types';

type RunnerHealthBody = {
  status?: unknown;
  version?: unknown;
  capabilities?: unknown;
};

type AgentRunnerProbeConfig = {
  url: string;
  timeoutMs: number;
};

export type AgentRunnerProbeResult = {
  healthy: boolean;
  reason: Exclude<AgentRunnerStatusReason, 'not-configured'>;
  version: string | null;
  capabilities: AgentRunnerCapabilities | null;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const objectRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const isRunnerHealthBody = (value: unknown): value is RunnerHealthBody =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeCapabilities = (value: unknown): AgentRunnerCapabilities => {
  const capabilities = objectRecord(value);
  return {
    protocolVersion: typeof capabilities.protocolVersion === 'string' ? capabilities.protocolVersion : null,
    streaming: capabilities.streaming === true,
    tools: stringArray(capabilities.tools),
    models: stringArray(capabilities.models),
  };
};

const unavailable = (
  reason: Exclude<AgentRunnerStatusReason, 'not-configured' | 'healthy'>,
): AgentRunnerProbeResult => ({
  healthy: false,
  reason,
  version: null,
  capabilities: null,
});

const getRunnerUrl = (url: string, path: string) => {
  const runnerUrl = new URL(url);
  runnerUrl.pathname = `${runnerUrl.pathname.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  return runnerUrl;
};

const isCreateSessionResult = (value: unknown): value is AgentRunnerCreateSessionResult => {
  const body = objectRecord(value);
  return typeof body.runnerSessionId === 'string' && objectRecord(body.capabilities) === body.capabilities;
};

const isValidateSessionResult = (value: unknown): value is AgentRunnerValidateSessionResult => {
  const body = objectRecord(value);
  return body.ok === true && objectRecord(body.capabilities) === body.capabilities;
};

const optionalString = (value: unknown): boolean => value === undefined || typeof value === 'string';

const isMessageBlock = (value: unknown): boolean => {
  const block = objectRecord(value);
  if (block.type === 'text') {
    return typeof block.text === 'string';
  }

  if (block.type === 'tool-call') {
    return typeof block.toolCallId === 'string' && optionalString(block.summary);
  }

  if (block.type === 'asset') {
    return typeof block.assetId === 'string' && optionalString(block.label);
  }

  if (block.type === 'plan') {
    return typeof block.planId === 'string' && optionalString(block.label);
  }

  return false;
};

const isMessageContent = (value: unknown): boolean => {
  const content = objectRecord(value);
  return Array.isArray(content.blocks) && content.blocks.every((block) => isMessageBlock(block));
};

const isStreamEvent = (value: unknown): value is AgentRunnerStreamEvent => {
  const body = objectRecord(value);
  if (body.type === 'assistant-message-delta') {
    return (
      typeof body.sessionId === 'string' &&
      typeof body.runnerSessionId === 'string' &&
      typeof body.delta === 'string' &&
      typeof body.sequence === 'number'
    );
  }

  if (body.type === 'assistant-message-completed') {
    return (
      typeof body.sessionId === 'string' &&
      typeof body.runnerSessionId === 'string' &&
      (typeof body.providerMessageId === 'string' || body.providerMessageId === null) &&
      isMessageContent(body.content)
    );
  }

  if (body.type === 'runner-error') {
    return (
      typeof body.sessionId === 'string' &&
      typeof body.runnerSessionId === 'string' &&
      typeof body.message === 'string' &&
      body.message.trim().length > 0
    );
  }

  if (body.type === 'tool-approval-needed') {
    return (
      typeof body.sessionId === 'string' &&
      typeof body.runnerSessionId === 'string' &&
      typeof body.toolCallId === 'string' &&
      body.toolCallId.trim().length > 0
    );
  }

  return false;
};

const parseSseFrame = (frame: string): AgentRunnerStreamEvent | null => {
  const dataLine = frame
    .replaceAll('\r\n', '\n')
    .split('\n')
    .find((line) => line.startsWith('data: '));
  if (!dataLine) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLine.slice('data: '.length));
  } catch {
    throw new Error('Agent runner returned an invalid stream event');
  }

  if (!isStreamEvent(parsed)) {
    throw new Error('Agent runner returned an invalid stream event');
  }

  return parsed;
};

async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<AgentRunnerStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replaceAll('\r\n', '\n');
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const event = parseSseFrame(frame);
        if (event) {
          yield event;
        }
      }
    }

    buffer += decoder.decode();

    if (buffer.trim().length > 0) {
      const event = parseSseFrame(buffer);
      if (event) {
        yield event;
      }
    }

    completed = true;
  } finally {
    try {
      if (!completed) {
        await reader.cancel().catch(() => {});
      }
    } finally {
      reader.releaseLock();
    }
  }
}

@Injectable()
export class AgentRunnerRepository {
  async getStatus({ url, timeoutMs }: AgentRunnerProbeConfig): Promise<AgentRunnerProbeResult> {
    try {
      const response = await fetch(getRunnerUrl(url, 'health'), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        return unavailable('unhealthy');
      }

      let body: RunnerHealthBody;
      try {
        const value = await response.json();
        if (!isRunnerHealthBody(value)) {
          return unavailable('invalid-response');
        }
        body = value;
      } catch (error) {
        return unavailable(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'invalid-response');
      }

      if (body.status !== 'ok') {
        return unavailable('invalid-response');
      }

      return {
        healthy: true,
        reason: 'healthy',
        version: typeof body.version === 'string' ? body.version : null,
        capabilities: normalizeCapabilities(body.capabilities),
      };
    } catch (error) {
      return unavailable(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unhealthy');
    }
  }

  async createSession({
    url,
    timeoutMs,
    body,
  }: {
    url: string;
    timeoutMs: number;
    body: AgentRunnerCreateSessionRequest;
  }): Promise<AgentRunnerCreateSessionResult> {
    const response = await fetch(getRunnerUrl(url, 'sessions'), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Agent runner session creation failed with status ${response.status}`);
    }

    const result = await response.json();
    if (!isCreateSessionResult(result)) {
      throw new Error('Agent runner returned an invalid session response');
    }

    return result;
  }

  async validateSession({
    url,
    timeoutMs,
    body,
  }: {
    url: string;
    timeoutMs: number;
    body: AgentRunnerCreateSessionRequest;
  }): Promise<AgentRunnerValidateSessionResult> {
    const response = await fetch(getRunnerUrl(url, 'validate-session'), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Agent runner model validation failed with status ${response.status}`);
    }

    const result = await response.json();
    if (!isValidateSessionResult(result)) {
      throw new Error('Agent runner returned an invalid validation response');
    }

    return result;
  }

  async *streamMessage({
    url,
    runnerSessionId,
    timeoutMs,
    body,
  }: {
    url: string;
    runnerSessionId: string;
    timeoutMs: number;
    body: AgentRunnerMessageRequest;
  }): AsyncGenerator<AgentRunnerStreamEvent> {
    const response = await fetch(getRunnerUrl(url, `sessions/${encodeURIComponent(runnerSessionId)}/messages`), {
      method: 'POST',
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Agent runner message stream failed with status ${response.status}`);
    }

    yield* parseSseStream(response.body);
  }

  async *streamResume({
    url,
    runnerSessionId,
    timeoutMs,
    body,
  }: {
    url: string;
    runnerSessionId: string;
    timeoutMs: number;
    body: AgentRunnerResumeRequest;
  }): AsyncGenerator<AgentRunnerStreamEvent> {
    const response = await fetch(getRunnerUrl(url, `sessions/${encodeURIComponent(runnerSessionId)}/continue`), {
      method: 'POST',
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Agent runner resume stream failed with status ${response.status}`);
    }

    yield* parseSseStream(response.body);
  }
}
