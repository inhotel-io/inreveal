import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import UserSidebar from '$lib/components/shared-components/side-bar/UserSidebar.svelte';

const mocks = vi.hoisted(() => ({
  authManager: {
    preferences: {
      folders: { enabled: false, sidebarWeb: false },
      memories: { enabled: true },
      people: { enabled: false, sidebarWeb: false },
      sharedLinks: { enabled: false, sidebarWeb: false },
      tags: { enabled: false, sidebarWeb: false },
    },
  },
  featureFlagsManager: {
    value: {
      map: false,
      search: false,
      trash: false,
    },
  },
}));

vi.mock('$lib/components/sidebar/sidebar.svelte', async () => {
  const module = await import('@test-data/mocks/sidebar.stub.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/side-bar/BottomInfo.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/side-bar/RecentAlbums.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/side-bar/recent-spaces.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: mocks.authManager,
}));

vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({
  featureFlagsManager: mocks.featureFlagsManager,
}));

vi.mock('@immich/ui', async () => {
  const navbarGroup = await import('@test-data/mocks/navbar-group.stub.svelte');
  const navbarItem = await import('@test-data/mocks/navbar-item.stub.svelte');
  return {
    NavbarGroup: navbarGroup.default,
    NavbarItem: navbarItem.default,
  };
});

describe('UserSidebar', () => {
  beforeEach(() => {
    mocks.authManager.preferences.memories.enabled = true;
    mocks.featureFlagsManager.value.map = false;
    mocks.featureFlagsManager.value.search = false;
  });

  it('shows a memories link under Library when memories are enabled', () => {
    render(UserSidebar);

    expect(screen.getByRole('link', { name: /^memories$/i })).toHaveAttribute('href', '/memories');
  });

  it('shows an assistant link', () => {
    render(UserSidebar);

    expect(screen.getByRole('link', { name: /^assistant$/i })).toHaveAttribute('href', '/assistant');
  });

  it('shows the assistant link after explore and before map', () => {
    mocks.featureFlagsManager.value.search = true;
    mocks.featureFlagsManager.value.map = true;

    render(UserSidebar);

    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/explore', '/assistant', '/map']),
    );
    expect(
      screen
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))
        .slice(2, 5),
    ).toEqual(['/explore', '/assistant', '/map']);
  });

  it('hides the memories link when memories are disabled', () => {
    mocks.authManager.preferences.memories.enabled = false;

    render(UserSidebar);

    expect(screen.queryByRole('link', { name: /^memories$/i })).not.toBeInTheDocument();
  });
});
