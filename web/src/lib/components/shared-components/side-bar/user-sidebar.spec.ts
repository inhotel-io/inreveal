import UserSidebar from '$lib/components/shared-components/side-bar/user-sidebar.svelte';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';

const mocks = vi.hoisted(() => ({
  authManager: {
    isDemo: false,
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

vi.mock('$lib/components/shared-components/side-bar/bottom-info.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/side-bar/recent-albums.svelte', async () => {
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
    localStorage.clear();
    mocks.authManager.isDemo = false;
    mocks.authManager.preferences.memories.enabled = true;
  });

  it('shows a memories link under Library when memories are enabled', () => {
    render(UserSidebar);

    expect(screen.getByRole('link', { name: /^memories$/i })).toHaveAttribute('href', '/memories');
  });

  it('hides the memories link when memories are disabled', () => {
    mocks.authManager.preferences.memories.enabled = false;

    render(UserSidebar);

    expect(screen.queryByRole('link', { name: /^memories$/i })).not.toBeInTheDocument();
  });

  it('highlights the memories link in demo mode until it is clicked', async () => {
    mocks.authManager.isDemo = true;

    render(UserSidebar);

    const memoriesLink = screen.getByRole('link', { name: /^memories$/i });
    expect(memoriesLink).toHaveClass('demo-memories-glow');

    await fireEvent.click(memoriesLink);

    expect(localStorage.getItem('demo-memories-clicked')).toBe('true');
  });
});
