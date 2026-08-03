import { persisted } from 'svelte-persisted-store';
import { sidebarMedia } from '$lib/stores/sidebar-media.svelte';

export const SIDEBAR_MODES = ['auto', 'expanded', 'rail'] as const;
export type SidebarMode = (typeof SIDEBAR_MODES)[number];
export type SidebarLayout = 'overlay' | 'rail' | 'expanded';

const isSidebarMode = (value: unknown): value is SidebarMode =>
  typeof value === 'string' && (SIDEBAR_MODES as readonly string[]).includes(value);

/**
 * Exported so the fallback is directly testable. Writing to localStorage after the store
 * is constructed does not re-run its subscriber, so this cannot be exercised through
 * `sidebarModeStore.mode`.
 */
export const parseSidebarMode = (text: string | null): SidebarMode => {
  try {
    const value: unknown = JSON.parse(text ?? 'null');
    return isSidebarMode(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
};

export const sidebarMode = persisted<SidebarMode>('sidebar-mode', 'auto', {
  serializer: {
    parse: parseSidebarMode,
    stringify: JSON.stringify,
  },
});

class SidebarModeStore {
  #mode = $state<SidebarMode>('auto');

  /** Pointer/focus expansion. Only meaningful while `layout === 'rail'`. */
  hoverExpanded = $state(false);

  /**
   * The touch and keyboard affordance, toggled by the navbar hamburger in rail mode.
   * Deliberately NOT upstream `sidebarStore.isOpen`: that is `$derived` from the 850px
   * query, so above 850px it is permanently true, and its `toggle()` only ever assigns
   * true - it can open the overlay but never dismiss it.
   */
  railOverlayOpen = $state(false);

  constructor() {
    sidebarMode.subscribe((value) => {
      this.#mode = isSidebarMode(value) ? value : 'auto';
    });
  }

  get mode(): SidebarMode {
    return this.#mode;
  }

  set mode(value: SidebarMode) {
    sidebarMode.set(value);
  }

  /**
   * A plain getter rather than `$derived.by`: `sidebarMedia`'s underlying media queries are
   * only reactive because they read Svelte `$state` internally. `$derived.by` only tracks
   * fine-grained reads of actual reactive primitives, not "this object's properties changed"
   * — so it would never re-run from a viewport change alone. A getter recomputes on every
   * access, which is correct here (cheap switch) and stays reactive when read from inside a
   * consuming component's own `$derived`/template, since Svelte's tracking follows the
   * underlying state reads through the call, not the getter itself.
   */
  get layout(): SidebarLayout {
    // A rail costs ~4rem, which a phone cannot spare, so below 850px every mode keeps
    // today's hidden-plus-overlay behaviour.
    if (!sidebarMedia.isFullSidebar) {
      return 'overlay';
    }

    switch (this.#mode) {
      case 'expanded': {
        return 'expanded';
      }
      case 'rail': {
        return 'rail';
      }
      default: {
        return sidebarMedia.isWideSidebar ? 'expanded' : 'rail';
      }
    }
  }

  toggleRailOverlay() {
    this.railOverlayOpen = !this.railOverlayOpen;
  }

  resetTransient() {
    this.hoverExpanded = false;
    this.railOverlayOpen = false;
  }
}

export const sidebarModeStore = new SidebarModeStore();
