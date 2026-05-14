const { authenticate, getFormatter } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getFormatter: vi.fn(),
}));

vi.mock('$lib/utils/auth', () => ({ authenticate }));
vi.mock('$lib/utils/i18n', () => ({ getFormatter }));

import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { AgentRunnerStatusReason } from '@immich/sdk';
import { load } from './+page';

const runnerStatus = {
  configured: false,
  healthy: false,
  reason: AgentRunnerStatusReason.NotConfigured,
  version: null,
  capabilities: null,
  checkedAt: '2026-05-14T00:00:00.000Z',
};

describe('/assistant load', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getFormatter.mockResolvedValue((key: string) => key);
    sdkMock.getAgentRunnerStatus.mockResolvedValue(runnerStatus);
  });

  it('authenticates the user and returns translated metadata with runner status', async () => {
    const url = new URL('https://gallery.test/assistant');

    await expect(load({ url } as never)).resolves.toEqual({
      meta: { title: 'assistant' },
      runnerStatus,
    });

    expect(authenticate).toHaveBeenCalledWith(url);
    expect(sdkMock.getAgentRunnerStatus).toHaveBeenCalledWith();
  });
});
