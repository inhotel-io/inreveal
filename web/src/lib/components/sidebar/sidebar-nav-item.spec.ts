import { mdiImageMultiple } from '@mdi/js';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { reactiveProps } from '$lib/components/sidebar/reactive-props.svelte';
import SidebarNavItem from '$lib/components/sidebar/sidebar-nav-item.svelte';

const mocks = vi.hoisted(() => ({
  sidebarModeStore: { layout: 'expanded' as 'overlay' | 'rail' | 'expanded', hoverExpanded: false },
  page: { url: new URL('https://gallery.test/photos') },
}));

vi.mock('$lib/stores/sidebar-mode.svelte', () => ({ sidebarModeStore: mocks.sidebarModeStore }));
vi.mock('$app/state', () => ({ page: mocks.page }));

const setLayout = (layout: 'overlay' | 'rail' | 'expanded', hoverExpanded = false) => {
  mocks.sidebarModeStore.layout = layout;
  mocks.sidebarModeStore.hoverExpanded = hoverExpanded;
};

describe('sidebar-nav-item', () => {
  beforeEach(() => {
    setLayout('expanded');
    mocks.page.url = new URL('https://gallery.test/photos');
  });

  const link = () => screen.getByRole('link', { name: /photos/i });

  it('keeps the label in the accessibility tree when collapsed', () => {
    setLayout('rail');

    render(SidebarNavItem, { title: 'Photos', href: '/photos', icon: mdiImageMultiple });

    // Spec coverage 18. The label must stay mounted, so assert on the accessible NAME,
    // not on text presence - `getByText` would pass in both states and could never fail.
    expect(link()).toHaveAccessibleName(/photos/i);
  });

  it('marks itself collapsed only in rail mode', () => {
    render(SidebarNavItem, { title: 'Photos', href: '/photos', icon: mdiImageMultiple });
    expect(link()).toHaveAttribute('data-collapsed', 'false');
  });

  it('marks itself collapsed in rail mode', () => {
    setLayout('rail');

    render(SidebarNavItem, { title: 'Photos', href: '/photos', icon: mdiImageMultiple });

    expect(link()).toHaveAttribute('data-collapsed', 'true');
  });

  it('expands while hover-expanded even though layout is rail', () => {
    setLayout('rail', true);

    render(SidebarNavItem, { title: 'Photos', href: '/photos', icon: mdiImageMultiple });

    expect(link()).toHaveAttribute('data-collapsed', 'false');
  });

  it('adds a tooltip only when collapsed', () => {
    setLayout('rail');
    render(SidebarNavItem, { title: 'Photos', href: '/photos', icon: mdiImageMultiple });
    expect(link()).toHaveAttribute('title', 'Photos');
  });

  it('omits the tooltip when expanded', () => {
    render(SidebarNavItem, { title: 'Photos', href: '/photos', icon: mdiImageMultiple });
    expect(link()).not.toHaveAttribute('title');
  });

  // Spec coverage 17.
  it('reports the isActive override verdict', () => {
    render(SidebarNavItem, {
      title: 'Photos',
      href: '/photos',
      icon: mdiImageMultiple,
      isActive: () => false,
    });

    expect(link()).toHaveAttribute('data-active', 'false');
  });

  it('falls back to a prefix match when no isActive override is given', () => {
    mocks.page.url = new URL('https://gallery.test/photos/123');

    render(SidebarNavItem, { title: 'Photos', href: '/photos', icon: mdiImageMultiple });

    expect(link()).toHaveAttribute('data-active', 'true');
  });

  // Spec coverage 15.
  it('hides the sub-tree in rail mode', () => {
    setLayout('rail');

    render(SidebarNavItem, {
      title: 'Albums',
      href: '/albums',
      icon: mdiImageMultiple,
      expanded: true,
      items: createRawSnippet(() => ({ render: () => `<span data-testid="subtree">recent</span>` })),
    });

    expect(screen.queryByTestId('subtree')).not.toBeInTheDocument();
  });

  it('shows the sub-tree when expanded', () => {
    render(SidebarNavItem, {
      title: 'Albums',
      href: '/albums',
      icon: mdiImageMultiple,
      expanded: true,
      items: createRawSnippet(() => ({ render: () => `<span data-testid="subtree">recent</span>` })),
    });

    expect(screen.getByTestId('subtree')).toBeInTheDocument();
  });

  // Spec coverage 24: long DE/NL/PL labels must clip rather than widen the panel.
  it('truncates the label instead of wrapping', () => {
    render(SidebarNavItem, {
      title: 'Zuletzt hinzugefügte Fotos und Videos',
      href: '/recently-added',
      icon: mdiImageMultiple,
    });

    const label = screen.getByText('Zuletzt hinzugefügte Fotos und Videos');
    expect(label.className).toContain('truncate');
  });

  // Spec coverage 16: hiding is render-time only. Collapsing to the rail must not
  // write `false` back into the persisted recentAlbumsDropdown / recentSpacesDropdown flag.
  it('does not clobber the bound expanded flag when collapsed', () => {
    setLayout('rail');
    // `reactiveProps` (not a plain object, and not `$state(...)` inline - this is a plain
    // `.spec.ts` file, which the Svelte plugin does not compile, so `$state` would throw
    // `rune_outside_svelte`). Svelte's bindable-prop write-back only engages for an
    // imperatively mounted component when the props object carries `STATE_SYMBOL`, i.e. was
    // created via `$state(...)` - see `reactive-props.svelte.ts` for the full mechanism. A
    // plain object here would make this assertion pass unconditionally, whether or not the
    // component actually clobbers the bound flag.
    const props = reactiveProps({
      title: 'Albums',
      href: '/albums',
      icon: mdiImageMultiple,
      expanded: true,
      items: createRawSnippet(() => ({ render: () => `<span data-testid="subtree">recent</span>` })),
    });

    render(SidebarNavItem, props);

    expect(props.expanded).toBe(true);
  });
});
