import { describe, expect, it, vi } from 'vitest';
import { scrollTimelineToTemporalAnchor } from './timeline-anchor';
import type { TimelineManager } from './timeline-manager.svelte';

function buildManager(timelineManager: Partial<TimelineManager>) {
  return timelineManager as TimelineManager;
}

describe('scrollTimelineToTemporalAnchor', () => {
  it('scrolls to matching representative year bucket when grouping month', () => {
    const scrollTo = vi.fn();
    const timelineManager = buildManager({
      grouping: 'month',
      timelineBuckets: [{ date: { year: 2015 }, top: 120 }] as TimelineManager['timelineBuckets'],
      scrollTo,
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2015 });

    expect(didScroll).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(120);
  });

  it('scrolls to matching representative month bucket when grouping month', () => {
    const scrollTo = vi.fn();
    const timelineManager = buildManager({
      grouping: 'month',
      timelineBuckets: [{ date: { year: 2015, month: 8 }, top: 240 }] as TimelineManager['timelineBuckets'],
      scrollTo,
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2015, month: 8 });

    expect(didScroll).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(240);
  });

  it('scrolls to detailed month container in day mode', () => {
    const scrollTo = vi.fn();
    const timelineManager = buildManager({
      grouping: 'day',
      months: [{ yearMonth: { year: 2015, month: 8 }, top: 360 }] as TimelineManager['months'],
      scrollTo,
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2015, month: 8 });

    expect(didScroll).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(360);
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
