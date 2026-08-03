import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import RailStorage from '$lib/components/shared-components/side-bar/rail-storage.svelte';

const mocks = vi.hoisted(() => ({
  authManager: { authenticated: true, user: { quotaSizeInBytes: null as number | null, quotaUsageInBytes: 0 } },
  userInteraction: {
    serverInfo: { diskSizeRaw: 0, diskUseRaw: 0 } as { diskSizeRaw: number; diskUseRaw: number } | undefined,
  },
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.authManager }));
vi.mock('$lib/stores/user.svelte', () => ({ userInteraction: mocks.userInteraction }));
vi.mock('$lib/utils/auth', () => ({ requestServerInfo: vi.fn() }));

const bytes = () => {
  const node = screen.getByTestId('rail-storage');
  return { used: Number(node.dataset.used), available: Number(node.dataset.available) };
};

describe('rail-storage', () => {
  beforeEach(() => {
    mocks.authManager.authenticated = true;
    mocks.authManager.user = { quotaSizeInBytes: null, quotaUsageInBytes: 0 };
    mocks.userInteraction.serverInfo = { diskSizeRaw: 50_000_000_000, diskUseRaw: 12_000_000_000 };
  });

  it('renders the storage icon with an accessible label', () => {
    render(RailStorage);

    expect(screen.getByTestId('rail-storage')).toBeInTheDocument();
  });

  // Spec coverage 21. This must assert NUMBERS, not the tooltip: under test $t() returns
  // the raw key, so the title is the literal string 'storage_usage' for any byte values -
  // a title comparison would pass no matter how wrong the derivation got.
  it.each`
    scenario                    | quotaSize         | quotaUsed        | diskSize          | diskUse           | used              | available
    ${'no quota, server disk'}  | ${null}           | ${0}             | ${50_000_000_000} | ${12_000_000_000} | ${12_000_000_000} | ${50_000_000_000}
    ${'quota overrides disk'}   | ${20_000_000_000} | ${5_000_000_000} | ${50_000_000_000} | ${12_000_000_000} | ${5_000_000_000}  | ${20_000_000_000}
    ${'zero quota is honoured'} | ${0}              | ${0}             | ${50_000_000_000} | ${12_000_000_000} | ${0}              | ${0}
  `('derives bytes for $scenario', ({ quotaSize, quotaUsed, diskSize, diskUse, used, available }) => {
    mocks.authManager.user = { quotaSizeInBytes: quotaSize, quotaUsageInBytes: quotaUsed };
    mocks.userInteraction.serverInfo = { diskSizeRaw: diskSize, diskUseRaw: diskUse };

    render(RailStorage);

    expect(bytes()).toEqual({ used, available });
  });

  it('falls back to zero when the server info has not arrived', () => {
    mocks.userInteraction.serverInfo = undefined;

    render(RailStorage);

    expect(bytes()).toEqual({ used: 0, available: 0 });
  });

  it('uses server disk figures when unauthenticated even if a quota exists', () => {
    mocks.authManager.authenticated = false;
    mocks.authManager.user = { quotaSizeInBytes: 20_000_000_000, quotaUsageInBytes: 5_000_000_000 };

    render(RailStorage);

    expect(bytes()).toEqual({ used: 12_000_000_000, available: 50_000_000_000 });
  });
});
