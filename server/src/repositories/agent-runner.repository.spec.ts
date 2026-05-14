import { AgentRunnerRepository } from 'src/repositories/agent-runner.repository';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe(AgentRunnerRepository.name, () => {
  let sut: AgentRunnerRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = new AgentRunnerRepository();
  });

  it('probes the configured runner health endpoint and normalizes capabilities', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          version: '0.1.0',
          capabilities: {
            protocolVersion: '2026-05-14',
            streaming: true,
            tools: ['echo', 123, 'read_asset_metadata'],
            models: ['gpt-5.1', null],
          },
        }),
    });

    await expect(sut.getStatus({ url: 'http://agent-runner:4477', timeoutMs: 2500 })).resolves.toEqual({
      healthy: true,
      reason: 'healthy',
      version: '0.1.0',
      capabilities: {
        protocolVersion: '2026-05-14',
        streaming: true,
        tools: ['echo', 'read_asset_metadata'],
        models: ['gpt-5.1'],
      },
    });
    expect(mockFetch).toHaveBeenCalledWith(new URL('/health', 'http://agent-runner:4477'), {
      headers: { Accept: 'application/json' },
      signal: expect.any(AbortSignal),
    });
    expect(timeoutSpy).toHaveBeenCalledWith(2500);
  });

  it('preserves runner URL path prefixes when appending the health endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    await sut.getStatus({ url: 'https://gateway.local/pi-runner/', timeoutMs: 2500 });

    expect(mockFetch).toHaveBeenCalledWith(new URL('https://gateway.local/pi-runner/health'), {
      headers: { Accept: 'application/json' },
      signal: expect.any(AbortSignal),
    });
  });

  it('returns unhealthy for non-2xx responses', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    await expect(sut.getStatus({ url: 'http://agent-runner:4477', timeoutMs: 2500 })).resolves.toEqual({
      healthy: false,
      reason: 'unhealthy',
      version: null,
      capabilities: null,
    });
  });

  it('returns invalid-response when healthy response is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('invalid json')),
    });

    await expect(sut.getStatus({ url: 'http://agent-runner:4477', timeoutMs: 2500 })).resolves.toEqual({
      healthy: false,
      reason: 'invalid-response',
      version: null,
      capabilities: null,
    });
  });

  it('returns invalid-response when status is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'starting' }),
    });

    await expect(sut.getStatus({ url: 'http://agent-runner:4477', timeoutMs: 2500 })).resolves.toEqual({
      healthy: false,
      reason: 'invalid-response',
      version: null,
      capabilities: null,
    });
  });

  it('returns invalid-response when healthy response body is null', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null),
    });

    await expect(sut.getStatus({ url: 'http://agent-runner:4477', timeoutMs: 2500 })).resolves.toEqual({
      healthy: false,
      reason: 'invalid-response',
      version: null,
      capabilities: null,
    });
  });

  it('returns timeout for abort timeout errors', async () => {
    const error = new Error('Timeout');
    error.name = 'TimeoutError';
    mockFetch.mockRejectedValue(error);

    await expect(sut.getStatus({ url: 'http://agent-runner:4477', timeoutMs: 2500 })).resolves.toEqual({
      healthy: false,
      reason: 'timeout',
      version: null,
      capabilities: null,
    });
  });

  it('returns timeout for body read timeout errors', async () => {
    const error = new Error('Timeout');
    error.name = 'TimeoutError';
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(error),
    });

    await expect(sut.getStatus({ url: 'http://agent-runner:4477', timeoutMs: 2500 })).resolves.toEqual({
      healthy: false,
      reason: 'timeout',
      version: null,
      capabilities: null,
    });
  });

  it('returns unhealthy for network errors', async () => {
    mockFetch.mockRejectedValue(new Error('connection refused'));

    await expect(sut.getStatus({ url: 'http://agent-runner:4477', timeoutMs: 2500 })).resolves.toEqual({
      healthy: false,
      reason: 'unhealthy',
      version: null,
      capabilities: null,
    });
  });
});
