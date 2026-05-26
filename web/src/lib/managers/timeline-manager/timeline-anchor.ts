import type { TimelineManager } from './timeline-manager.svelte';
import type { TimelineBucketDate, TimelineTemporalAnchor } from './types';

type TimelineTemporalAnchorTarget = {
  top: number;
  height: number;
};

function matchesAnchorDate(date: TimelineBucketDate, anchor: TimelineTemporalAnchor) {
  return date.year === anchor.year && (anchor.month === undefined || date.month === anchor.month);
}

function targetIsInViewport(timelineManager: TimelineManager, target: TimelineTemporalAnchorTarget): boolean {
  const viewportTop = timelineManager.scrollTop;
  const viewportBottom = viewportTop + timelineManager.viewportHeight;
  const targetBottom = target.top + target.height;

  return targetBottom > viewportTop && target.top < viewportBottom;
}

function getScrollTopForTarget(timelineManager: TimelineManager, target: TimelineTemporalAnchorTarget): number {
  return Math.min(target.top, Math.max(0, timelineManager.maxScroll));
}

export function getTimelineTemporalAnchorTarget(
  timelineManager: TimelineManager,
  anchor: TimelineTemporalAnchor,
): TimelineTemporalAnchorTarget | undefined {
  if (timelineManager.grouping === 'day' && anchor.month !== undefined) {
    const month = timelineManager.months.find(
      (month) => month.yearMonth.year === anchor.year && month.yearMonth.month === anchor.month,
    );

    if (!month) {
      return;
    }

    return { top: month.top, height: month.height };
  }

  const bucket = timelineManager.timelineBuckets.find((bucket) => matchesAnchorDate(bucket.date, anchor));
  if (!bucket) {
    return;
  }

  return { top: bucket.top, height: bucket.height };
}

export function scrollTimelineToTemporalAnchor(
  timelineManager: TimelineManager,
  anchor: TimelineTemporalAnchor,
): boolean {
  const target = getTimelineTemporalAnchorTarget(timelineManager, anchor);
  if (!target) {
    return false;
  }

  timelineManager.scrollTo(getScrollTopForTarget(timelineManager, target));
  return targetIsInViewport(timelineManager, target);
}
