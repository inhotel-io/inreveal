import { MediaQuery } from 'svelte/reactivity';
import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';

// Above this width `auto` mode shows the full sidebar; between here and the 850px
// `--breakpoint-sidebar` it shows the rail. Declared here rather than in upstream
// `media-query-manager.svelte.ts` to keep the change fork-only.
const wideSidebar = new MediaQuery('min-width: 1280px');

export const sidebarMedia = {
  get isFullSidebar() {
    return mediaQueryManager.isFullSidebar;
  },
  get isWideSidebar() {
    return wideSidebar.current;
  },
};
