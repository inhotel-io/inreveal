/**
 * Whether the Recently Added header should display an item count.
 *
 * Hidden only when there is nothing to show *and* no filter is active: that state is either
 * "buckets have not loaded yet" or "empty account", and both are better served by the
 * EmptyPlaceholder than by a transient "0 items". With a filter active, "0 items" is
 * informative — it says the filter matched nothing.
 */
export function shouldShowRecentlyAddedCount(count: number, hasActiveFilters: boolean): boolean {
  return count > 0 || hasActiveFilters;
}
