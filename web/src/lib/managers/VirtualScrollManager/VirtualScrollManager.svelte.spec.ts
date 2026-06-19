import { describe, expect, it } from 'vitest';
import { VirtualScrollManager } from './VirtualScrollManager.svelte';

class TestScroller extends VirtualScrollManager {
  #dom = 0;
  override get domScrollTop() {
    return this.#dom;
  }
  setDomScrollTop(value: number) {
    this.#dom = value;
  }
}

function makeScroller({ body, viewport, cap }: { body: number; viewport: number; cap?: number }) {
  const scroller = new TestScroller();
  scroller.bodySectionHeight = body;
  scroller.viewportHeight = viewport;
  if (cap !== undefined) {
    scroller.maxScrollHeight = cap;
  }
  return scroller;
}

describe('VirtualScrollManager scaling', () => {
  it('1. is identity below the cap', () => {
    const s = makeScroller({ body: 10_000, viewport: 1000, cap: 1_000_000 });
    expect(s.domHeight).toBe(10_000); // == totalViewerHeight
    expect(s.scrollScale).toBe(1);
    expect(s.domToLogical(500)).toBe(500);
    expect(s.logicalToDom(500)).toBe(500);

    s.setDomScrollTop(500);
    s.updateSlidingWindow();
    expect(s.scrollTop).toBe(500); // logical
    expect(s.renderOffset).toBe(0);
  });

  it('2. leaves scale at 1 exactly at the cap', () => {
    const s = makeScroller({ body: 10_000, viewport: 1000, cap: 10_000 });
    expect(s.domHeight).toBe(10_000);
    expect(s.scrollScale).toBe(1);
  });

  it('3. clamps domHeight and scales above the cap', () => {
    const s = makeScroller({ body: 100_000, viewport: 1000, cap: 10_000 });
    expect(s.domHeight).toBe(10_000);
    expect(s.scrollScale).toBeGreaterThan(0);
    expect(s.scrollScale).toBeLessThan(1);
  });

  it('4. maps both endpoints so the tail is reachable', () => {
    const s = makeScroller({ body: 100_000, viewport: 1000, cap: 10_000 });
    expect(s.logicalToDom(0)).toBe(0);
    expect(s.logicalToDom(s.logicalScrollMax)).toBeCloseTo(s.domScrollMax, 6);
  });

  it('5. round-trips dom↔logical', () => {
    const s = makeScroller({ body: 100_000, viewport: 1000, cap: 10_000 });
    for (const x of [0, 50_000, s.logicalScrollMax]) {
      expect(s.domToLogical(s.logicalToDom(x))).toBeCloseTo(x, 6);
    }
  });

  it('6. keeps the bottom item bounded within the capped DOM height', () => {
    const s = makeScroller({ body: 100_000, viewport: 1000, cap: 10_000 });
    s.setDomScrollTop(s.domScrollMax);
    s.updateSlidingWindow();
    expect(s.scrollTop).toBeCloseTo(s.logicalScrollMax, 6); // 99_000
    expect(s.renderOffset).toBeCloseTo(-90_000, 6);
    // an item at logical top == total lands exactly at domHeight, not at 100_000px
    expect(s.totalViewerHeight + s.renderOffset).toBeCloseTo(s.domHeight, 6);
  });

  it('7. guards against divide-by-zero and NaN at the geometry edges', () => {
    // (a) content fits the viewport → logicalScrollMax == 0 (spec edge #4/#5)
    const fits = makeScroller({ body: 500, viewport: 1000, cap: 10_000 });
    expect(fits.logicalScrollMax).toBe(0);
    expect(fits.domToLogical(123)).toBe(0);
    expect(fits.logicalToDom(123)).toBe(0);
    expect(fits.scrollScale).toBe(1);
    expect(Number.isFinite(fits.domToLogical(123))).toBe(true);

    // (b) zero-height viewport (transient, before layout) → no NaN/Infinity (spec edge #6)
    const noViewport = makeScroller({ body: 100_000, viewport: 0, cap: 10_000 });
    expect(noViewport.domHeight).toBe(10_000);
    expect(Number.isFinite(noViewport.domToLogical(5000))).toBe(true);
    expect(Number.isFinite(noViewport.logicalToDom(50_000))).toBe(true);
    expect(Number.isFinite(noViewport.scrollScale)).toBe(true);
  });

  it('8. renderOffset reads cached state, updating only after updateSlidingWindow', () => {
    const s = makeScroller({ body: 100_000, viewport: 1000, cap: 10_000 });
    s.setDomScrollTop(s.domScrollMax);
    expect(s.renderOffset).toBe(0); // cached state not yet refreshed
    s.updateSlidingWindow();
    expect(s.renderOffset).toBeCloseTo(-90_000, 6);
  });
});
