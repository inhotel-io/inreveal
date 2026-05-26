import { buildFilterContext, type FilterState } from '$lib/components/filter-panel/filter-panel';
import type { TimelineGrouping, TimelineTemporalAnchor } from '$lib/managers/timeline-manager/types';
import { getTimelineZoomScopeOptions } from '$lib/utils/timeline-zoom-navigation';

export function buildTimelineRouteOptions(
  base: Record<string, unknown>,
  temporalFilters: FilterState,
  grouping: TimelineGrouping,
  zoomScope?: TimelineTemporalAnchor,
): Record<string, unknown> {
  const options: Record<string, unknown> = { ...base, ...getTimelineZoomScopeOptions(zoomScope), grouping };
  const context = buildFilterContext(temporalFilters);

  if (context?.takenAfter) {
    options.takenAfter = context.takenAfter;
  }
  if (context?.takenBefore) {
    options.takenBefore = context.takenBefore;
  }

  return options;
}
