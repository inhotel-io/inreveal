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
  // Real default: `false` under jsdom/happy-dom's static `matchMedia` mock in test-data/setup.ts.
  // Tests that need to simulate a specific viewport (e.g. the >=850px regression guard below)
  // set this explicitly.
  mediaQueryManager: { isFullSidebar: false },
}));

vi.mock('$lib/stores/sidebar-mode.svelte', () => ({ sidebarModeStore: mocks.sidebarModeStore }));
vi.mock('$lib/stores/sidebar.svelte', () => ({ sidebarStore: mocks.sidebarStore }));
vi.mock('$lib/stores/media-query-manager.svelte', () => ({ mediaQueryManager: mocks.mediaQueryManager }));

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
type NavigationBarProps = { railAware?: boolean };

const renderNavigationBar = (props: NavigationBarProps = {}) =>
  render(TestWrapper as Component<{ component: typeof NavigationBar; componentProps: NavigationBarProps }>, {
    component: NavigationBar,
    componentProps: props,
  });

const menuButton = () => screen.getByRole('button', { name: /main_menu/i });

// Cross-checks the real Logo component's own rendered class, not just the wrapper span's
// test-facing `data-variant` - a mutation that changes only Logo's `variant` prop while
// leaving the sibling attribute untouched must still fail here. Logo's `variant="icon"`
// applies `aspect-square`; `variant="inline"` does not (see Logo.svelte's `variantClasses`).
const expectLogoImg = (variant: 'icon' | 'inline') => {
  const logoImg = screen.getByTestId('navbar-logo').querySelector('img');
  if (variant === 'icon') {
    expect(logoImg).toHaveClass('aspect-square');
  } else {
    expect(logoImg).not.toHaveClass('aspect-square');
  }
};

describe('NavigationBar sidebar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sidebarModeStore.layout = 'expanded';
    mocks.mediaQueryManager.isFullSidebar = false;
  });

  // Spec coverage 25.
  it.each`
    layout        | hidden
    ${'expanded'} | ${true}
    ${'rail'}     | ${false}
    ${'overlay'}  | ${false}
  `('menu button hidden=$hidden for $layout', ({ layout, hidden }) => {
    mocks.sidebarModeStore.layout = layout;

    renderNavigationBar({ railAware: true });

    const button = menuButton();
    expect(button.dataset.hidden !== undefined).toBe(hidden);
    // The actual visibility mechanism, not just its test-facing echo: `data-hidden` and the
    // `hidden` class are two independent attributes on the same element, both driven from
    // `menuButtonHidden` - assert the real class too, or a mutation that decouples them
    // would pass silently.
    expect(button.classList.contains('hidden')).toBe(hidden);
  });

  // Spec coverage 26: rail must route to the real toggle, not upstream's open-only one.
  it('toggles the rail overlay rather than sidebarStore in rail mode', () => {
    mocks.sidebarModeStore.layout = 'rail';

    renderNavigationBar({ railAware: true });
    menuButton().click();

    expect(mocks.sidebarModeStore.toggleRailOverlay).toHaveBeenCalledOnce();
    expect(mocks.sidebarStore.toggle).not.toHaveBeenCalled();
  });

  it('falls back to sidebarStore.toggle below 850px', () => {
    mocks.sidebarModeStore.layout = 'overlay';

    renderNavigationBar({ railAware: true });
    menuButton().click();

    expect(mocks.sidebarStore.toggle).toHaveBeenCalledOnce();
    expect(mocks.sidebarModeStore.toggleRailOverlay).not.toHaveBeenCalled();
  });

  // Spec coverage 27: 4rem cannot hold the hamburger and the logo together.
  it.each`
    layout        | column      | columnClass
    ${'overlay'}  | ${'narrow'} | ${'grid-cols-[--spacing(32)_auto]'}
    ${'rail'}     | ${'narrow'} | ${'grid-cols-[--spacing(32)_auto]'}
    ${'expanded'} | ${'wide'}   | ${'grid-cols-[--spacing(64)_auto]'}
  `('navbar first column is $column for $layout', ({ layout, column, columnClass }) => {
    mocks.sidebarModeStore.layout = layout;

    renderNavigationBar({ railAware: true });

    const grid = screen.getByTestId('navbar-grid');
    expect(grid).toHaveAttribute('data-column', column);
    // The literal Tailwind class actually applied, not just the semantic label above - a
    // mutation that swaps which class maps to which label would otherwise pass unnoticed.
    expect(grid).toHaveClass(columnClass);
  });

  // Spec coverage 28.
  it.each`
    layout        | variant
    ${'overlay'}  | ${'icon'}
    ${'rail'}     | ${'icon'}
    ${'expanded'} | ${'inline'}
  `('logo variant is $variant for $layout', ({ layout, variant }) => {
    mocks.sidebarModeStore.layout = layout;

    renderNavigationBar({ railAware: true });

    expect(screen.getByTestId('navbar-logo')).toHaveAttribute('data-variant', variant);
    expectLogoImg(variant);
  });

  // Spec coverage 30: AdminPageLayout renders this same NavigationBar but never passes
  // `railAware`, and its own sidebar is bound only to `sidebarStore.isOpen` (pinned open
  // above 850px) with no rail concept. Without the flag, a hamburger that suddenly appears
  // and calls `toggleRailOverlay()` would be a functionally inert, newly-visible button on
  // every Admin page whenever `sidebarModeStore.layout` resolves to `rail` (the default
  // `auto` mode, common laptop widths 850-1279px). Simulate exactly that: the store resolves
  // 'rail' (as it would at 900px in auto mode), but the real viewport is >=850px, so the
  // pre-rail behaviour must win.
  it('keeps the old viewport-only behaviour without railAware, even at a rail-resolving layout', () => {
    mocks.sidebarModeStore.layout = 'rail';
    mocks.mediaQueryManager.isFullSidebar = true;

    renderNavigationBar();
    menuButton().click();

    const button = menuButton();
    expect(button.dataset.hidden !== undefined).toBe(true);
    expect(button.classList.contains('hidden')).toBe(true);
    expect(mocks.sidebarStore.toggle).toHaveBeenCalledOnce();
    expect(mocks.sidebarModeStore.toggleRailOverlay).not.toHaveBeenCalled();

    const grid = screen.getByTestId('navbar-grid');
    expect(grid).toHaveAttribute('data-column', 'wide');
    expect(grid).toHaveClass('grid-cols-[--spacing(64)_auto]');

    expect(screen.getByTestId('navbar-logo')).toHaveAttribute('data-variant', 'inline');
    expectLogoImg('inline');
  });
});
