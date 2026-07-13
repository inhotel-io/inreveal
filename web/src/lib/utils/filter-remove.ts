import type { FilterState } from '$lib/components/filter-panel/filter-panel';
import { clearTimelineTemporalFilter } from '$lib/utils/timeline-temporal-filters';

/**
 * The single shared "remove one active filter chip" reducer, used by every surface that renders
 * the active-filters bar (`/photos`, `/albums`, `/map` via `handlePhotosRemoveFilter`, and
 * `/spaces` via `handleSpaceRemoveFilter`). Both of those were previously byte-for-byte identical
 * copies of this switch — keeping one copy means a new chip type can no longer be wired into one
 * surface and forgotten on the other.
 *
 * Some cases clear more than the field their chip label shows, because the chip represents a
 * GROUP of sibling fields that all narrow the same dimension:
 *  - `location` clears `city` + `state` + `country` (`getActiveFilterCount` already counts all
 *    three as one filter; the chip must remove all three or the count drops while the query
 *    doesn't change).
 *  - `camera` clears `make` + `model` + `lensModel` for the same reason.
 *  - `albums` clears `isInAlbum` + `isNotInAlbum` + `albumId` for the same reason.
 */
export function handleRemoveFilter(filters: FilterState, type: string, id?: string): FilterState {
  switch (type) {
    case 'person': {
      return { ...filters, personIds: filters.personIds.filter((p) => p !== id) };
    }
    case 'location': {
      return { ...filters, city: undefined, state: undefined, country: undefined };
    }
    case 'camera': {
      return { ...filters, make: undefined, model: undefined, lensModel: undefined };
    }
    case 'lens': {
      return { ...filters, lensModel: undefined };
    }
    case 'album': {
      return { ...filters, albumId: undefined };
    }
    case 'owner': {
      return { ...filters, ownerId: undefined };
    }
    case 'tag': {
      return { ...filters, tagIds: filters.tagIds.filter((t) => t !== id) };
    }
    case 'rating': {
      return { ...filters, rating: undefined };
    }
    case 'media':
    case 'mediaType': {
      return { ...filters, mediaType: 'all' };
    }
    case 'favorites':
    case 'isFavorite': {
      return { ...filters, isFavorite: undefined };
    }
    case 'albums': {
      return { ...filters, isNotInAlbum: undefined, isInAlbum: undefined, albumId: undefined };
    }
    case 'isNotInAlbum': {
      return { ...filters, isNotInAlbum: undefined };
    }
    case 'isInAlbum': {
      return { ...filters, isInAlbum: undefined };
    }
    case 'timeline': {
      return clearTimelineTemporalFilter(filters);
    }
    case 'description': {
      return { ...filters, description: undefined };
    }
    case 'filename': {
      return { ...filters, originalFileName: undefined };
    }
    case 'ocr': {
      return { ...filters, ocr: undefined };
    }
    default: {
      return filters;
    }
  }
}
