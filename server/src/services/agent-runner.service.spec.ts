import { AgentRunnerRepository } from 'src/repositories/agent-runner.repository';
import { ConfigRepository } from 'src/repositories/config.repository';
import { AgentRunnerService } from 'src/services/agent-runner.service';
import { automock } from 'test/utils';

describe(AgentRunnerService.name, () => {
  let sut: AgentRunnerService;
  let configRepository: ReturnType<typeof automock<ConfigRepository>>;
  let agentRunnerRepository: ReturnType<typeof automock<AgentRunnerRepository>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T10:00:00.000Z'));
    configRepository = automock(ConfigRepository);
    agentRunnerRepository = automock(AgentRunnerRepository);
    sut = new AgentRunnerService(configRepository, agentRunnerRepository);
  });

  afterEach(() => {
    vi.useRealTimers();
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
