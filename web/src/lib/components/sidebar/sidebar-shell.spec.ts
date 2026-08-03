import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import SidebarShell from '$lib/components/sidebar/sidebar-shell.svelte';
import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';

const mocks = vi.hoisted(() => ({
  sidebarMedia: { isFullSidebar: true, isWideSidebar: false },
  sidebarStore: { isOpen: true, reset: vi.fn() },
  beforeNavigate: vi.fn(),
  // Deliberately not the real 'top-menu-button': the shell has to resolve the id through
  // the constant rather than hard-coding it. Mocked rather than imported because a .ts
  // file cannot name a .svelte module export - `declare module '*.svelte'` types only the
  // default export, so `tsc --noEmit` rejects it.
  menuButtonId: 'test-menu-button',
}));

vi.mock('$lib/stores/sidebar-media.svelte', () => ({ sidebarMedia: mocks.sidebarMedia }));
vi.mock('$lib/stores/sidebar.svelte', () => ({ sidebarStore: mocks.sidebarStore }));
vi.mock('$app/navigation', () => ({ beforeNavigate: mocks.beforeNavigate }));
vi.mock('$lib/components/shared-components/navigation-bar/NavigationBar.svelte', () => ({
  menuButtonId: mocks.menuButtonId,
}));

const nav = () => screen.getByTestId('sidebar-parent');

describe('sidebar-shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sidebarMedia.isFullSidebar = true;
    mocks.sidebarMedia.isWideSidebar = false;
    mocks.sidebarStore.isOpen = true;
    sidebarModeStore.mode = 'rail';
    sidebarModeStore.resetTransient();
  });

  it('reports the rail layout', () => {
    render(SidebarShell);
    expect(nav()).toHaveAttribute('data-layout', 'rail');
  });

  // The two props are the component's whole public surface, and `ariaLabel` is its only
  // accessible name. Kept in its own render: real focusable children change what the
  // focus trap would grab, which the trap tests below depend on.
  it('renders its children and exposes the aria label', () => {
    const children = createRawSnippet(() => ({
      render: () => `<button type="button">Photos</button>`,
    }));

    render(SidebarShell, { ariaLabel: 'Primary', children });

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBe(nav());
    expect(screen.getByRole('button', { name: 'Photos' })).toBeInTheDocument();
  });

  // Spec coverage 12. Upstream isOpen is permanently true above 850px, so a shell that
  // consulted it would render a permanently expanded rail.
  it('ignores upstream isOpen in rail mode', () => {
    mocks.sidebarStore.isOpen = true;

    render(SidebarShell);

    expect(nav()).toHaveAttribute('data-expanded', 'false');
  });

  // Spec coverage 6.
  it('expands on pointerenter and collapses on pointerleave', async () => {
    render(SidebarShell);

    await fireEvent.pointerEnter(nav());
    expect(nav()).toHaveAttribute('data-expanded', 'true');

    await fireEvent.pointerLeave(nav());
    expect(nav()).toHaveAttribute('data-expanded', 'false');
  });

  // Spec coverage 7: the grid slot must stay at rail width so the timeline never re-lays-out.
  // The nav is the grid item, so the no-reflow property is that *its own box* is unchanged
  // by hover - only the absolutely-positioned panel inside it grows. Assert the nav's class
  // list directly: any width utility that tracks expansion would widen the slot.
  it('does not resize its own grid slot while hover-expanded', async () => {
    render(SidebarShell);
    const collapsed = nav().className;

    await fireEvent.pointerEnter(nav());

    // Guards against a vacuous pass: the hover has to have actually taken effect.
    expect(nav()).toHaveAttribute('data-expanded', 'true');
    expect(nav().className).toBe(collapsed);
    // Deliberately not "the nav has no `w-` utility at all": a width that is constant per
    // layout is fine and Task 8 may add one. What must never happen is a width that
    // tracks expansion, which is exactly what the invariance above forbids.
  });

  // Spec coverage 8.
  it('expands on focusin and collapses on focusout', async () => {
    render(SidebarShell);

    await fireEvent.focusIn(nav());
    expect(nav()).toHaveAttribute('data-expanded', 'true');

    await fireEvent.focusOut(nav());
    expect(nav()).toHaveAttribute('data-expanded', 'false');
  });

  // Spec coverage 9.
  it('collapses on Escape', async () => {
    render(SidebarShell);
    await fireEvent.pointerEnter(nav());

    await fireEvent.keyDown(nav(), { key: 'Escape' });

    expect(nav()).toHaveAttribute('data-expanded', 'false');
  });

  // Spec coverage 10.
  it('dismisses the rail overlay on outside click', async () => {
    render(SidebarShell);
    sidebarModeStore.toggleRailOverlay();
    // A bare $state write is flushed to the DOM in a microtask, so the precondition
    // below only reads the new value after an explicit tick.
    await tick();
    expect(nav()).toHaveAttribute('data-expanded', 'true');

    await fireEvent.mouseDown(document.body);

    expect(sidebarModeStore.railOverlayOpen).toBe(false);
  });

  // The shell replaces upstream Sidebar, which dismissed the sub-850px overlay on both
  // Escape and outside click. That overlay is modal, so both must keep working.
  it.each([
    ['Escape', (element: HTMLElement) => fireEvent.keyDown(element, { key: 'Escape' })],
    ['outside click', () => fireEvent.mouseDown(document.body)],
  ])('closes the sub-850px overlay on %s', async (_, dismiss) => {
    mocks.sidebarMedia.isFullSidebar = false;
    mocks.sidebarStore.isOpen = true;
    render(SidebarShell);

    await dismiss(nav());

    expect(mocks.sidebarStore.reset).toHaveBeenCalled();
  });

  // Closing the overlay makes this nav inert while focus is still inside it (on the focus
  // trap's backup sentinel). Deactivating the trap does not destroy the action, so nothing
  // else puts focus back - the keyboard user would land on <body>.
  it('returns focus to the navbar menu button when the overlay closes', async () => {
    const menuButton = document.createElement('button');
    menuButton.id = mocks.menuButtonId;
    document.body.append(menuButton);
    mocks.sidebarMedia.isFullSidebar = false;
    mocks.sidebarStore.isOpen = true;
    render(SidebarShell);
    await tick();
    expect(nav().contains(document.activeElement)).toBe(true);

    await fireEvent.keyDown(nav(), { key: 'Escape' });

    expect(document.activeElement).toBe(menuButton);
    menuButton.remove();
  });

  // Spec coverage 11.
  it('registers a beforeNavigate handler that clears only the overlay flag', () => {
    render(SidebarShell);
    expect(mocks.beforeNavigate).toHaveBeenCalled();

    sidebarModeStore.hoverExpanded = true;
    sidebarModeStore.toggleRailOverlay();

    const handler = mocks.beforeNavigate.mock.calls[0][0] as () => void;
    handler();

    expect(sidebarModeStore.railOverlayOpen).toBe(false);
    // The pointer is still over the rail after clicking a link, so hover survives.
    expect(sidebarModeStore.hoverExpanded).toBe(true);
  });

  // Upstream Sidebar closed the mobile overlay from onMount, which fired on every
  // navigation because UserPageLayout remounts per page. Without this the overlay would
  // stay open on top of the page the user just navigated to.
  it('closes the sub-850px overlay on navigation', () => {
    mocks.sidebarMedia.isFullSidebar = false;
    mocks.sidebarStore.isOpen = true;
    render(SidebarShell);

    const handler = mocks.beforeNavigate.mock.calls[0][0] as () => void;
    handler();

    expect(mocks.sidebarStore.reset).toHaveBeenCalled();
  });

  // Spec coverage 13.
  it('never marks itself inert in rail mode', () => {
    render(SidebarShell);
    expect((nav() as HTMLElement).inert).toBe(false);
  });

  // Spec coverage 13. A hover-expanded rail is not modal, so the trap must stay inactive.
  // An active trap pulls focus to its first tabbable node - the backup sentinel when the
  // shell has no children - which is what makes activity observable at all.
  it.each([
    ['stays out of the way in rail mode', true, false],
    ['traps focus in the open sub-850px overlay', false, true],
  ])('%s', async (_, isFullSidebar, trapped) => {
    mocks.sidebarMedia.isFullSidebar = isFullSidebar;
    mocks.sidebarStore.isOpen = true;

    render(SidebarShell);
    await tick();

    expect(nav().contains(document.activeElement)).toBe(trapped);
  });

  // Spec coverage 14: the sub-850px overlay keeps today's modal behaviour.
  it('is inert when hidden below 850px', () => {
    mocks.sidebarMedia.isFullSidebar = false;
    mocks.sidebarStore.isOpen = false;

    render(SidebarShell);

    expect(nav()).toHaveAttribute('data-layout', 'overlay');
    expect((nav() as HTMLElement).inert).toBe(true);
  });

  it('is not inert when the sub-850px overlay is open', () => {
    mocks.sidebarMedia.isFullSidebar = false;
    mocks.sidebarStore.isOpen = true;

    render(SidebarShell);

    expect((nav() as HTMLElement).inert).toBe(false);
  });

  // Spec coverage 3. The reset runs in an $effect, which flushes in a post-render
  // microtask - await tick() explicitly rather than relying on rerender() to flush it.
  it('clears transient flags when the layout leaves rail', async () => {
    render(SidebarShell);
    await fireEvent.pointerEnter(nav());
    expect(sidebarModeStore.hoverExpanded).toBe(true);

    sidebarModeStore.mode = 'expanded';
    await tick();

    expect(sidebarModeStore.hoverExpanded).toBe(false);
    expect(sidebarModeStore.railOverlayOpen).toBe(false);
  });

  // Guards the resurface case: returning to rail must not restore a stale hover state.
  it('does not restore stale hover state when returning to rail', async () => {
    render(SidebarShell);
    await fireEvent.pointerEnter(nav());

    sidebarModeStore.mode = 'expanded';
    await tick();
    sidebarModeStore.mode = 'rail';
    await tick();

    expect(nav()).toHaveAttribute('data-expanded', 'false');
  });
});

describe('sidebar-shell direction and motion', () => {
  // Not `nav().firstElementChild`: focusTrap inserts its sentinel <div>s as the first and
  // last children of the container, so the first child is a class-less sentinel and every
  // className assertion against it would pass vacuously.
  const panel = () => screen.getByTestId('sidebar-panel');

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sidebarMedia.isFullSidebar = true;
    mocks.sidebarMedia.isWideSidebar = false;
    mocks.sidebarStore.isOpen = true;
    sidebarModeStore.mode = 'rail';
    sidebarModeStore.resetTransient();
  });

  // Spec coverage 23: the rail is anchored with a logical inset property, so the same
  // static class list is correct in both writing directions - there is no JS-level `dir`
  // branch here for a test to exercise. Setting `document.documentElement.dir` does not
  // change which classes this component emits, so real RTL placement is verified in e2e,
  // not here.
  it('anchors the panel to the inline-start with a logical inset utility', () => {
    render(SidebarShell);

    // `inset-s-0` is this codebase's canonical inset-inline-start utility.
    expect(panel().className).toContain('inset-s-0');
    expect(panel().className).not.toMatch(/\b(?:left|right)-0\b/);
  });

  // Spec coverage 22. Assert the pairing, not just the opt-out: a bare
  // `motion-reduce:transition-none` with nothing to suppress would be dead markup.
  it('opts out of the width transition under reduced motion', () => {
    render(SidebarShell);

    expect(panel().className).toContain('transition-[width]');
    expect(panel().className).toContain('motion-reduce:transition-none');
  });
});
