import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidebarShell from '$lib/components/sidebar/sidebar-shell.svelte';
import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';

const mocks = vi.hoisted(() => ({
  sidebarMedia: { isFullSidebar: true, isWideSidebar: false },
  sidebarStore: { isOpen: true, reset: vi.fn() },
  beforeNavigate: vi.fn(),
}));

vi.mock('$lib/stores/sidebar-media.svelte', () => ({ sidebarMedia: mocks.sidebarMedia }));
vi.mock('$lib/stores/sidebar.svelte', () => ({ sidebarStore: mocks.sidebarStore }));
vi.mock('$app/navigation', () => ({ beforeNavigate: mocks.beforeNavigate }));

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
  it('keeps the grid slot at rail width while hover-expanded', async () => {
    render(SidebarShell);
    expect(nav()).toHaveAttribute('data-slot-width', 'rail');

    await fireEvent.pointerEnter(nav());

    // The panel grows over the content, so the slot the nav occupies has to be invariant
    // under expansion - assert both halves, or the slot could simply track `data-expanded`.
    expect(nav()).toHaveAttribute('data-expanded', 'true');
    expect(nav()).toHaveAttribute('data-slot-width', 'rail');
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
    mocks.sidebarMedia.isFullSidebar = true;
    mocks.sidebarStore.isOpen = true;
    sidebarModeStore.mode = 'rail';
    sidebarModeStore.resetTransient();
  });

  afterEach(() => {
    document.documentElement.dir = 'ltr';
  });

  // Spec coverage 23: the rail is anchored with a logical property, so one class list has
  // to carry it to the inline-start in both directions. Asserting over both makes `dir`
  // load-bearing - an implementation that swapped `left-0`/`right-0` per direction would
  // fail one of the two cases.
  it.each(['ltr', 'rtl'])('anchors the panel to the inline-start in %s', (dir) => {
    document.documentElement.dir = dir;

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
