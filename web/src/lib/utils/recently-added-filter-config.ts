import { getFilterSuggestions, getSearchSuggestions, SearchSuggestionType } from '@immich/sdk';
import type { FilterPanelConfig } from '$lib/components/filter-panel/filter-panel';
import { getPhotosPersonFilterId, getPhotosPersonFilterThumbnailUrl } from '$lib/utils/photos-filter-options';
import { buildRecentlyAddedSuggestionRequest } from '$lib/utils/recently-added-filter-options';

/**
 * Nine of the ten filter sections. `'text'` is intentionally absent until Slice 3 adds the
 * smart-search path alongside it, so the text input is never rendered without a working submit.
 */
const sections = [
  'timeline',
  'people',
  'location',
  'camera',
  'tags',
  'rating',
  'media',
  'favorites',
  'albums',
] as const;

function mapSuggestions(response: Awaited<ReturnType<typeof getFilterSuggestions>>) {
  return {
    countries: response.countries,
    cameraMakes: response.cameraMakes,
    tags: response.tags.map((tag) => ({ id: tag.id, name: tag.value })),
    people: response.people.map((person) => ({
      id: getPhotosPersonFilterId(person),
      name: person.name,
      thumbnailUrl: getPhotosPersonFilterThumbnailUrl(person),
    })),
    ratings: response.ratings,
    mediaTypes: response.mediaTypes,
    hasUnnamedPeople: response.hasUnnamedPeople,
  };
}

/**
 * Filter-panel config for the Recently Added view: own + partner scope only, so nothing here
 * carries `withSharedSpaces` / `albumId` / `spaceId`.
 */
export function buildRecentlyAddedFilterConfig(): FilterPanelConfig {
  return {
    sections: [...sections],
    suggestionsProvider: async (filters) =>
      mapSuggestions(await getFilterSuggestions(buildRecentlyAddedSuggestionRequest(filters))),
    providers: {
      cities: (country, context) => getSearchSuggestions({ $type: SearchSuggestionType.City, country, ...context }),
      cameraModels: (make, context) =>
        getSearchSuggestions({ $type: SearchSuggestionType.CameraModel, make, ...context }),
    },
  };
}
