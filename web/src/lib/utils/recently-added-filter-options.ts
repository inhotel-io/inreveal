import { AssetOrderBy, AssetTypeEnum } from '@immich/sdk';
import { buildFilterContext, type FilterState } from '$lib/components/filter-panel/filter-panel';
import { buildPhotosTimelineOptions } from '$lib/utils/photos-filter-options';

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

/**
 * Timeline query for the Recently Added view.
 *
 * Reuses Photos' predicate mapping, then applies the two invariants that define this view:
 *  1. never surface shared-space assets — `withSharedSpaces` is stripped in every case, so the
 *     view stays own + partner (and own-only under a Favorites filter, which Photos treats as
 *     a personal flag);
 *  2. always order and day-group by *added* date.
 *
 * Note the date filter still filters *taken* date (there is no created-at range predicate);
 * day-groups reflect added date. That mismatch is intentional — e.g. old photos just imported.
 */
export function buildRecentlyAddedTimelineOptions(filters: FilterState): Record<string, unknown> {
  const { withSharedSpaces: _, ...base } = buildPhotosTimelineOptions(filters);
  return { ...base, orderBy: AssetOrderBy.CreatedAt };
}

/**
 * Filter-suggestion request for the Recently Added panel. Deliberately carries no
 * `withSharedSpaces` / `albumId` / `spaceId` — suggestions must describe the same own+partner
 * set the timeline shows.
 */
export function buildRecentlyAddedSuggestionRequest(filters: FilterState) {
  const context = buildFilterContext(filters);
  return {
    personIds: filters.personIds.length > 0 ? filters.personIds : undefined,
    country: filters.country,
    city: filters.city,
    make: filters.make,
    model: filters.model,
    tagIds: filters.tagIds.length > 0 ? filters.tagIds : undefined,
    rating: filters.rating,
    isFavorite: filters.isFavorite,
    isNotInAlbum: filters.isNotInAlbum === true ? true : undefined,
    isInAlbum: filters.isInAlbum === true ? true : undefined,
    mediaType:
      filters.mediaType === 'all'
        ? undefined
        : filters.mediaType === 'image'
          ? AssetTypeEnum.Image
          : AssetTypeEnum.Video,
    takenAfter: context?.takenAfter,
    takenBefore: context?.takenBefore,
  };
}
