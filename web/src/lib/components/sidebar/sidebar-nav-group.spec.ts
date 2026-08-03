import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SidebarNavGroup from '$lib/components/sidebar/sidebar-nav-group.svelte';

const mocks = vi.hoisted(() => ({
  sidebarModeStore: { layout: 'expanded' as 'overlay' | 'rail' | 'expanded', hoverExpanded: false },
}));

vi.mock('$lib/stores/sidebar-mode.svelte', () => ({ sidebarModeStore: mocks.sidebarModeStore }));
vi.mock('@immich/ui', async () => {
  const navbarGroup = await import('@test-data/mocks/navbar-group.stub.svelte');
  return { NavbarGroup: navbarGroup.default };
});

describe('sidebar-nav-group', () => {
  beforeEach(() => {
    mocks.sidebarModeStore.layout = 'expanded';
    mocks.sidebarModeStore.hoverExpanded = false;
  });

  it('renders the text header when expanded', () => {
    render(SidebarNavGroup, { title: 'Library' });

    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-group-divider')).not.toBeInTheDocument();
  });

  it('renders a divider instead of the header in rail mode', () => {
    mocks.sidebarModeStore.layout = 'rail';

    render(SidebarNavGroup, { title: 'Library' });

    expect(screen.getByTestId('sidebar-group-divider')).toBeInTheDocument();
    expect(screen.queryByText('Library')).not.toBeInTheDocument();
  });

  it('restores the header while hover-expanded', () => {
    mocks.sidebarModeStore.layout = 'rail';
    mocks.sidebarModeStore.hoverExpanded = true;

    render(SidebarNavGroup, { title: 'Library' });

    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-group-divider')).not.toBeInTheDocument();
  });
});
