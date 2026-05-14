import { Injectable } from '@nestjs/common';
import { AgentRunnerCapabilities, AgentRunnerStatusReason } from 'src/dtos/agent-runner.dto';

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

const getRunnerHealthUrl = (url: string) => {
  const healthUrl = new URL(url);
  healthUrl.pathname = `${healthUrl.pathname.replace(/\/$/, '')}/health`;
  return healthUrl;
};

@Injectable()
export class AgentRunnerRepository {
  async getStatus({ url, timeoutMs }: AgentRunnerProbeConfig): Promise<AgentRunnerProbeResult> {
    try {
      const response = await fetch(getRunnerHealthUrl(url), {
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
}
