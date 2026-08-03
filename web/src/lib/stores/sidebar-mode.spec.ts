import {
  parseSidebarMode,
  sidebarMode,
  sidebarModeStore,
  type SidebarLayout,
  type SidebarMode,
} from '$lib/stores/sidebar-mode.svelte';

const mocks = vi.hoisted(() => ({ sidebarMedia: { isFullSidebar: false, isWideSidebar: false } }));
vi.mock('$lib/stores/sidebar-media.svelte', () => ({ sidebarMedia: mocks.sidebarMedia }));

const setViewport = (width: 'phone' | 'medium' | 'wide') => {
  mocks.sidebarMedia.isFullSidebar = width !== 'phone';
  mocks.sidebarMedia.isWideSidebar = width === 'wide';
};

describe('sidebarModeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    sidebarMode.set('auto');
    sidebarModeStore.resetTransient();
    setViewport('phone');
  });

  // Spec coverage 1: the full 3 modes x 3 viewport bands resolution table.
  it.each`
    mode          | viewport    | expected
    ${'auto'}     | ${'phone'}  | ${'overlay'}
    ${'auto'}     | ${'medium'} | ${'rail'}
    ${'auto'}     | ${'wide'}   | ${'expanded'}
    ${'expanded'} | ${'phone'}  | ${'overlay'}
    ${'expanded'} | ${'medium'} | ${'expanded'}
    ${'expanded'} | ${'wide'}   | ${'expanded'}
    ${'rail'}     | ${'phone'}  | ${'overlay'}
    ${'rail'}     | ${'medium'} | ${'rail'}
    ${'rail'}     | ${'wide'}   | ${'rail'}
  `('resolves $mode at $viewport to $expected', ({ mode, viewport, expected }) => {
    sidebarMode.set(mode as SidebarMode);
    setViewport(viewport as 'phone' | 'medium' | 'wide');

    expect(sidebarModeStore.layout).toBe(expected as SidebarLayout);
  });

  // Spec coverage 2: rotation must re-resolve, not stick.
  it('re-resolves live when the viewport changes', () => {
    sidebarMode.set('auto');
    setViewport('wide');
    expect(sidebarModeStore.layout).toBe('expanded');

    setViewport('medium');
    expect(sidebarModeStore.layout).toBe('rail');

    setViewport('phone');
    expect(sidebarModeStore.layout).toBe('overlay');
  });

  // Spec coverage 4. Test the parser directly: writing to localStorage after the store
  // has been constructed does not re-run its subscriber, so asserting on
  // `sidebarModeStore.mode` afterwards would pass on the beforeEach value no matter what
  // the parser does - an assertion that cannot fail.
  it.each`
    raw             | expected
    ${'"rail"'}     | ${'rail'}
    ${'"expanded"'} | ${'expanded'}
    ${'"auto"'}     | ${'auto'}
    ${'"nonsense"'} | ${'auto'}
    ${'42'}         | ${'auto'}
    ${'null'}       | ${'auto'}
    ${''}           | ${'auto'}
    ${'{ broken'}   | ${'auto'}
  `('parses $raw to $expected', ({ raw, expected }) => {
    expect(parseSidebarMode(raw)).toBe(expected);
  });

  // Spec coverage 5: this is the bug upstream toggle() has - it must close as well as open.
  it('toggles the rail overlay both open and closed', () => {
    sidebarMode.set('rail');
    setViewport('medium');

    expect(sidebarModeStore.railOverlayOpen).toBe(false);
    sidebarModeStore.toggleRailOverlay();
    expect(sidebarModeStore.railOverlayOpen).toBe(true);
    sidebarModeStore.toggleRailOverlay();
    expect(sidebarModeStore.railOverlayOpen).toBe(false);
  });

  it('clears both transient flags on resetTransient', () => {
    sidebarMode.set('rail');
    setViewport('medium');
    sidebarModeStore.hoverExpanded = true;
    sidebarModeStore.toggleRailOverlay();

    sidebarModeStore.resetTransient();

    expect(sidebarModeStore.hoverExpanded).toBe(false);
    expect(sidebarModeStore.railOverlayOpen).toBe(false);
  });

  it('writes the mode through to the persisted store', () => {
    sidebarModeStore.mode = 'rail';

    expect(sidebarModeStore.mode).toBe('rail');
    expect(localStorage.getItem('sidebar-mode')).toContain('rail');
  });
});
