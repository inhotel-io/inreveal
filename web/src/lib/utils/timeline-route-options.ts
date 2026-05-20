import { buildFilterContext, type FilterState } from '$lib/components/filter-panel/filter-panel';
import type { TimelineGrouping } from '$lib/managers/timeline-manager/types';

export function buildTimelineRouteOptions(
  base: Record<string, unknown>,
  temporalFilters: FilterState,
  grouping: TimelineGrouping,
): Record<string, unknown> {
  const options: Record<string, unknown> = { ...base, grouping };
  const context = buildFilterContext(temporalFilters);

  if (context?.takenAfter) {
    options.takenAfter = context.takenAfter;
  }
  if (context?.takenBefore) {
    options.takenBefore = context.takenBefore;
  }

  return options;
}
