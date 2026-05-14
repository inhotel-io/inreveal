const { authenticate, getFormatter } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getFormatter: vi.fn(),
}));

vi.mock('$lib/utils/auth', () => ({ authenticate }));
vi.mock('$lib/utils/i18n', () => ({ getFormatter }));

import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { AgentRunnerStatusReason, ProviderType } from '@immich/sdk';
import { load } from './+page';

const runnerStatus = {
  configured: false,
  healthy: false,
  reason: AgentRunnerStatusReason.NotConfigured,
  version: null,
  capabilities: null,
  checkedAt: '2026-05-14T00:00:00.000Z',
};

const credentials = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    providerType: ProviderType.Openai,
    label: 'OpenAI personal',
    baseUrl: null,
    models: ['gpt-5.1'],
    defaultModel: 'gpt-5.1',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    lastUsedAt: null,
  },
];

describe('/assistant load', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getFormatter.mockResolvedValue((key: string) => key);
    sdkMock.getAgentRunnerStatus.mockResolvedValue(runnerStatus);
    sdkMock.getAgentProviderCredentials.mockResolvedValue(credentials);
  });

  it('authenticates the user and returns translated metadata with runner status and credentials', async () => {
    const url = new URL('https://gallery.test/assistant');

    await expect(load({ url } as never)).resolves.toEqual({
      meta: { title: 'assistant' },
      runnerStatus,
      credentials,
    });

    expect(authenticate).toHaveBeenCalledWith(url);
    expect(sdkMock.getAgentRunnerStatus).toHaveBeenCalledWith();
    expect(sdkMock.getAgentProviderCredentials).toHaveBeenCalledWith();
  });

  it('returns an empty credential list', async () => {
    sdkMock.getAgentProviderCredentials.mockResolvedValue([]);

    await expect(load({ url: new URL('https://gallery.test/assistant') } as never)).resolves.toEqual(
      expect.objectContaining({ credentials: [] }),
    );
  });

  it('does not call agent APIs when authentication fails', async () => {
    const error = new Error('not authenticated');
    authenticate.mockRejectedValue(error);

    await expect(load({ url: new URL('https://gallery.test/assistant') } as never)).rejects.toBe(error);

    expect(sdkMock.getAgentRunnerStatus).not.toHaveBeenCalled();
    expect(sdkMock.getAgentProviderCredentials).not.toHaveBeenCalled();
  });

  it('does not swallow agent API failures', async () => {
    const error = new Error('runner status failed');
    sdkMock.getAgentRunnerStatus.mockRejectedValue(error);

    await expect(load({ url: new URL('https://gallery.test/assistant') } as never)).rejects.toBe(error);

    expect(sdkMock.getAgentProviderCredentials).toHaveBeenCalledWith();
  });
});
