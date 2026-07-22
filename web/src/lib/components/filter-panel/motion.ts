import { quintOut } from 'svelte/easing';

/** Section expand/collapse duration (ms). */
export const SECTION_DURATION_MS = 300;

export interface SlideMotion {
  duration: number;
  easing?: (t: number) => number;
}

/**
 * Svelte `slide` config for section expand/collapse. Collapses to an instant
 * (duration 0) when the user prefers reduced motion.
 */
export function slideMotion(reducedMotion: boolean): SlideMotion {
  return reducedMotion ? { duration: 0 } : { duration: SECTION_DURATION_MS, easing: quintOut };
}
