import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import NavigationBar from '$lib/components/shared-components/navigation-bar/NavigationBar.svelte';

const mocks = vi.hoisted(() => ({
  sidebarModeStore: {
    layout: 'expanded' as 'overlay' | 'rail' | 'expanded',
    railOverlayOpen: false,
    toggleRailOverlay: vi.fn(),
  },
  sidebarStore: { isOpen: false, toggle: vi.fn() },
}));

vi.mock('$lib/stores/sidebar-mode.svelte', () => ({ sidebarModeStore: mocks.sidebarModeStore }));
vi.mock('$lib/stores/sidebar.svelte', () => ({ sidebarStore: mocks.sidebarStore }));

// NavigationBar pulls in the search trigger, notification and account panels, the avatar
// and theme button, and calls notificationManager.refresh() on mount - a network call.
// Everything not under test is stubbed out so this spec exercises only the sidebar wiring.
vi.mock('$lib/stores/notification-manager.svelte', () => ({
  notificationManager: { notifications: [], refresh: vi.fn().mockResolvedValue(undefined) },
}));

// `ActionButton`'s `action` prop is required (not optional) and immediately destructures
// it in `isEnabled`, so `Cast: undefined` crashes on mount. `$if: () => false` mirrors the
// real cast action's own gating and keeps it hidden without touching NavigationBar's markup.
vi.mock('$lib/services/app.service', () => ({
  getGlobalActions: () => ({ Cast: { title: 'Cast', onAction: vi.fn(), $if: () => false } }),
}));

vi.mock('$lib/managers/global-search-manager.svelte', () => ({ globalSearchManager: { open: vi.fn() } }));

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: { authenticated: true, user: { name: 'Test', email: 'test@example.com' } },
}));

// Written out one by one on purpose: vi.mock is hoisted to the top of the module and
// needs a literal path, so a loop over an array of paths silently fails to mock anything.
vi.mock('$lib/components/global-search/global-search-input-trigger.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/navigation-bar/NotificationPanel.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/navigation-bar/AccountInfoPanel.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/UserAvatar.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/ThemeButton.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

// NavigationBar mounts real @immich/ui IconButtons (menu, search, upload, notifications),
// which resolve a bits-ui Tooltip against a "Tooltip.Provider" context. TestWrapper supplies
// it (see other *.spec.ts files rendering real IconButton-based trees).
const renderNavigationBar = () =>
  render(TestWrapper as Component<{ component: typeof NavigationBar; componentProps: Record<string, never> }>, {
    component: NavigationBar,
    componentProps: {},
  });

const menuButton = () => screen.getByRole('button', { name: /main_menu/i });

describe('NavigationBar sidebar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sidebarModeStore.layout = 'expanded';
  });

  // Spec coverage 25.
  it.each`
    layout        | hidden
    ${'expanded'} | ${true}
    ${'rail'}     | ${false}
    ${'overlay'}  | ${false}
  `('menu button hidden=$hidden for $layout', ({ layout, hidden }) => {
    mocks.sidebarModeStore.layout = layout;

    renderNavigationBar();

    expect(menuButton().dataset.hidden !== undefined).toBe(hidden);
  });

  // Spec coverage 26: rail must route to the real toggle, not upstream's open-only one.
  it('toggles the rail overlay rather than sidebarStore in rail mode', () => {
    mocks.sidebarModeStore.layout = 'rail';

    renderNavigationBar();
    menuButton().click();

    expect(mocks.sidebarModeStore.toggleRailOverlay).toHaveBeenCalledOnce();
    expect(mocks.sidebarStore.toggle).not.toHaveBeenCalled();
  });

  it('falls back to sidebarStore.toggle below 850px', () => {
    mocks.sidebarModeStore.layout = 'overlay';

    renderNavigationBar();
    menuButton().click();

    expect(mocks.sidebarStore.toggle).toHaveBeenCalledOnce();
    expect(mocks.sidebarModeStore.toggleRailOverlay).not.toHaveBeenCalled();
  });

  // Spec coverage 27: 4rem cannot hold the hamburger and the logo together.
  it.each`
    layout        | column
    ${'overlay'}  | ${'narrow'}
    ${'rail'}     | ${'narrow'}
    ${'expanded'} | ${'wide'}
  `('navbar first column is $column for $layout', ({ layout, column }) => {
    mocks.sidebarModeStore.layout = layout;

    renderNavigationBar();

    expect(screen.getByTestId('navbar-grid')).toHaveAttribute('data-column', column);
  });

  // Spec coverage 28.
  it.each`
    layout        | variant
    ${'overlay'}  | ${'icon'}
    ${'rail'}     | ${'icon'}
    ${'expanded'} | ${'inline'}
  `('logo variant is $variant for $layout', ({ layout, variant }) => {
    mocks.sidebarModeStore.layout = layout;

    renderNavigationBar();

    expect(screen.getByTestId('navbar-logo')).toHaveAttribute('data-variant', variant);
  });
});
