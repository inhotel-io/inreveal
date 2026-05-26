import { describe, expect, it, vi } from 'vitest';
import { scrollTimelineToTemporalAnchor } from './timeline-anchor';
import type { TimelineManager } from './timeline-manager.svelte';

function buildManager(timelineManager: Partial<TimelineManager>) {
  return timelineManager as TimelineManager;
}

describe('scrollTimelineToTemporalAnchor', () => {
  it('scrolls to matching representative year bucket when grouping month', () => {
    const scrollTo = vi.fn();
    let scrollTop = 0;
    const timelineManager = buildManager({
      grouping: 'month',
      timelineBuckets: [{ date: { year: 2015 }, top: 120, height: 296 }] as TimelineManager['timelineBuckets'],
      viewportHeight: 600,
      maxScroll: 1200,
      get scrollTop() {
        return scrollTop;
      },
      scrollTo: vi.fn((top: number) => {
        scrollTo(top);
        scrollTop = top;
      }),
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2015 });

    expect(didScroll).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(120);
  });

  it('scrolls to matching representative month bucket when grouping month', () => {
    const scrollTo = vi.fn();
    let scrollTop = 0;
    const timelineManager = buildManager({
      grouping: 'month',
      timelineBuckets: [
        { date: { year: 2015, month: 8 }, top: 240, height: 296 },
      ] as TimelineManager['timelineBuckets'],
      viewportHeight: 600,
      maxScroll: 1200,
      get scrollTop() {
        return scrollTop;
      },
      scrollTo: vi.fn((top: number) => {
        scrollTo(top);
        scrollTop = top;
      }),
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2015, month: 8 });

    expect(didScroll).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(240);
  });

  it('scrolls to detailed month container in day mode', () => {
    const scrollTo = vi.fn();
    let scrollTop = 0;
    const timelineManager = buildManager({
      grouping: 'day',
      months: [{ yearMonth: { year: 2015, month: 8 }, top: 360, height: 240 }] as TimelineManager['months'],
      viewportHeight: 600,
      maxScroll: 1200,
      get scrollTop() {
        return scrollTop;
      },
      scrollTo: vi.fn((top: number) => {
        scrollTo(top);
        scrollTop = top;
      }),
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2015, month: 8 });

    expect(didScroll).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(360);
  });

  it('does not report success when the scroll position remains outside the target month', () => {
    const scrollTo = vi.fn();
    const timelineManager = buildManager({
      grouping: 'day',
      months: [{ yearMonth: { year: 2015, month: 8 }, top: 1200, height: 240 }] as TimelineManager['months'],
      viewportHeight: 600,
      maxScroll: 2000,
      scrollTop: 0,
      scrollTo,
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2015, month: 8 });

    expect(didScroll).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith(1200);
  });

  it('returns false and does not scroll when target not loaded', () => {
    const scrollTo = vi.fn();
    const timelineManager = buildManager({
      grouping: 'month',
      timelineBuckets: [{ date: { year: 2015, month: 8 }, top: 240 }] as TimelineManager['timelineBuckets'],
      scrollTo,
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2016, month: 8 });

    expect(didScroll).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
