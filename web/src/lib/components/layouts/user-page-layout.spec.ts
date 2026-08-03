import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
import UserPageLayoutDescriptionTrailingTestWrapper from './user-page-layout-description-trailing.test-wrapper.svelte';

const layoutMocks = vi.hoisted(() => ({
  sidebarModeStore: { layout: 'expanded' as 'overlay' | 'rail' | 'expanded' },
}));

vi.mock('$lib/stores/sidebar-mode.svelte', () => ({ sidebarModeStore: layoutMocks.sidebarModeStore }));

vi.mock('$lib/components/shared-components/navigation-bar/NavigationBar.svelte', async () => {
  const module = await import('@test-data/mocks/navigation-bar-rail-aware.stub.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/side-bar/UserSidebar.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

describe('UserPageLayout header', () => {
  it('keeps long people statistics visible beside a truncating title', () => {
    render(UserPageLayout, {
      props: {
        title: 'People',
        description: '(60) \u{B7} 2,901 faces',
      },
    });

    expect(screen.getByTestId('page-header-description')).toHaveTextContent('(60) \u{B7} 2,901 faces');
    expect(screen.getByTestId('page-header-title-row')).toHaveClass('min-w-0', 'overflow-hidden');
    expect(screen.getByTestId('page-header')).toHaveClass('min-w-0', 'truncate');
    expect(screen.getByTestId('page-header-description')).toHaveClass('shrink-0', 'whitespace-nowrap');
  });

  it('renders a non-collapsing description trailing action beside the description', () => {
    render(UserPageLayoutDescriptionTrailingTestWrapper);

    const titleRow = screen.getByTestId('page-header-title-row');
    const title = screen.getByTestId('page-header');
    const description = screen.getByTestId('page-header-description');
    const trailing = screen.getByTestId('page-header-description-trailing');
    const button = screen.getByRole('button', { name: 'Info' });

    expect(trailing).toContainElement(button);
    expect(titleRow).toHaveClass('min-w-0', 'overflow-hidden');
    expect(title).toHaveClass('min-w-0', 'truncate');
    expect(description).toHaveClass('whitespace-nowrap');
    expect(trailing).toHaveClass('shrink-0');
    expect(titleRow).toContainElement(description);
    expect(titleRow).toContainElement(trailing);
    expect(description.nextElementSibling).toBe(trailing);
  });
});

describe('UserPageLayout sidebar width', () => {
  it.each`
    layout        | width         | cssValue
    ${'overlay'}  | ${'0'}        | ${'0px'}
    ${'rail'}     | ${'rail'}     | ${'calc(var(--spacing) * 20)'}
    ${'expanded'} | ${'expanded'} | ${'calc(var(--spacing) * 64)'}
  `('sets the grid width to $width for $layout', ({ layout, width, cssValue }) => {
    layoutMocks.sidebarModeStore.layout = layout;

    render(UserPageLayout);

    const grid = screen.getByTestId('user-page-grid');
    expect(grid).toHaveAttribute('data-sidebar-width', width);
    // Guards the actual `--sidebar-width` custom property driving `grid-cols-[var(--sidebar-width)_auto]`,
    // not just the semantic label above - a rail/expanded value swap would otherwise pass unnoticed.
    expect(grid.style.getPropertyValue('--sidebar-width')).toBe(cssValue);
  });

  // Spec coverage 29: /tags and /folders pass their own tree-explorer sidebar wrapping
  // upstream Sidebar.svelte, which renders sidebar:w-64 regardless of our variable. Applying
  // the rail width there would put a 16rem sidebar in a 4rem column.
  it('keeps the expanded width when a custom sidebar snippet is supplied', () => {
    layoutMocks.sidebarModeStore.layout = 'rail';

    render(UserPageLayout, {
      props: { sidebar: createRawSnippet(() => ({ render: () => `<nav data-testid="tree">tree</nav>` })) },
    });

    expect(screen.getByTestId('user-page-grid')).toHaveAttribute('data-sidebar-width', 'expanded');
  });

  // Spec coverage 29 (navbar side). A custom sidebar snippet (/tags, /folders) keeps the
  // grid column at the expanded width above, but the navbar's own rail-aware sizing is
  // driven independently by the `railAware` prop - passing it unconditionally would still
  // shrink the navbar's logo/column and surface a hamburger that calls
  // `toggleRailOverlay()`, which those pages' upstream Sidebar.svelte has no wiring for.
  it('does not pass railAware to the navbar when a custom sidebar snippet is supplied', () => {
    render(UserPageLayout, {
      props: { sidebar: createRawSnippet(() => ({ render: () => `<nav data-testid="tree">tree</nav>` })) },
    });

    expect(screen.getByTestId('navigation-bar-stub')).toHaveAttribute('data-rail-aware', 'false');
  });

  it('passes railAware to the navbar by default', () => {
    render(UserPageLayout);

    expect(screen.getByTestId('navigation-bar-stub')).toHaveAttribute('data-rail-aware', 'true');
  });
});
