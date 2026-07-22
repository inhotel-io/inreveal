import { quintOut } from 'svelte/easing';
import { describe, expect, it } from 'vitest';
import { SECTION_DURATION_MS, slideMotion } from '../motion';

describe('motion tokens', () => {
  it('exposes the agreed section duration', () => {
    expect(SECTION_DURATION_MS).toBe(300);
  });
});

describe('slideMotion', () => {
  it('returns an instant (zero-duration) config when reduced motion is requested', () => {
    expect(slideMotion(true)).toEqual({ duration: 0 });
  });

  it('returns the section duration and quintOut easing when motion is allowed', () => {
    const motion = slideMotion(false);
    expect(motion.duration).toBe(SECTION_DURATION_MS);
    expect(motion.easing).toBe(quintOut);
  });
});
