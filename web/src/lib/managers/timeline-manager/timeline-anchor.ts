import type { TimelineManager } from './timeline-manager.svelte';
import type { TimelineBucketDate, TimelineTemporalAnchor } from './types';

function matchesAnchorDate(date: TimelineBucketDate, anchor: TimelineTemporalAnchor) {
  return date.year === anchor.year && (anchor.month === undefined || date.month === anchor.month);
}

export function scrollTimelineToTemporalAnchor(
  timelineManager: TimelineManager,
  anchor: TimelineTemporalAnchor,
): boolean {
  if (timelineManager.grouping === 'day' && anchor.month !== undefined) {
    const month = timelineManager.months.find(
      (month) => month.yearMonth.year === anchor.year && month.yearMonth.month === anchor.month,
    );

    if (!month) {
      return false;
    }

    timelineManager.scrollTo(month.top);
    return true;
  }

  const bucket = timelineManager.timelineBuckets.find((bucket) => matchesAnchorDate(bucket.date, anchor));
  if (!bucket) {
    return false;
  }

  timelineManager.scrollTo(bucket.top);
  return true;
}
