import { Injectable } from '@nestjs/common';
import { AgentRunnerStatusDto } from 'src/dtos/agent-runner.dto';
import { AgentRunnerRepository } from 'src/repositories/agent-runner.repository';
import { ConfigRepository } from 'src/repositories/config.repository';

const RUNNER_STATUS_CACHE_MS = 15_000;

@Injectable()
export class AgentRunnerService {
  private statusCache?: { key: string; value: AgentRunnerStatusDto; expiresAt: number };
  private statusInFlight = new Map<string, Promise<AgentRunnerStatusDto>>();

  constructor(
    private readonly configRepository: ConfigRepository,
    private readonly agentRunnerRepository: AgentRunnerRepository,
  ) {}

  async getStatus(): Promise<AgentRunnerStatusDto> {
    const { runnerUrl, runnerHealthTimeoutMs } = this.configRepository.getEnv().agent;
    if (!runnerUrl) {
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
}
