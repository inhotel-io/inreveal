import { AssetTypeEnum, AssetVisibility, MapMediaType } from '@immich/sdk';
import { applyTextFilters, buildFilterContext, type FilterState } from '$lib/components/filter-panel/filter-panel';

type MapTimelineSettings = {
  onlyFavorites?: boolean;
  withPartners?: boolean;
};

function applyCommonMapFilters(base: Record<string, unknown>, filters: FilterState, includePersonIds = true) {
  if (includePersonIds && filters.personIds.length > 0) {
    base.personIds = filters.personIds;
  }
  if (filters.make) {
    base.make = filters.make;
  }
  if (filters.model) {
    base.model = filters.model;
  }
  if (filters.tagIds.length > 0) {
    base.tagIds = filters.tagIds;
  }
  if (filters.rating !== undefined) {
    base.rating = filters.rating;
  }
  if (filters.isFavorite !== undefined) {
    base.isFavorite = filters.isFavorite;
  }
  if (filters.isNotInAlbum === true) {
    base.isNotInAlbum = true;
  }
  if (filters.isInAlbum === true) {
    base.isInAlbum = true;
  }
  if (filters.city) {
    base.city = filters.city;
  }
  if (filters.country) {
    base.country = filters.country;
  }
  // #767 fresh instance: a Space filtered by description/filename/OCR carries those filters to the
  // map (encodeFilterParams), which hydrates them, counts them, and shows a removable chip for
  // each — but until now the marker/time-bucket queries never sent them, so the map showed every
  // pin in the space while claiming the filter was active. Mirror buildPhotosTimelineOptions.
  if (filters.description?.trim()) {
    base.description = filters.description.trim();
  }
  if (filters.originalFileName?.trim()) {
    base.originalFileName = filters.originalFileName.trim();
  }
  if (filters.ocr?.trim()) {
    base.ocr = filters.ocr.trim();
  }

  applyTextFilters(base, filters);

  const context = buildFilterContext(filters);
  if (context?.takenAfter) {
    base.takenAfter = context.takenAfter;
  }
  if (context?.takenBefore) {
    base.takenBefore = context.takenBefore;
  }

  return base;
}

export function buildMapMarkerOptions(filters: FilterState, spaceId?: string): Record<string, unknown> {
  const base = applyCommonMapFilters(spaceId ? { spaceId } : { withSharedSpaces: true }, filters);

  if (filters.lensModel) {
    base.lensModel = filters.lensModel;
  }
  if (filters.state) {
    base.state = filters.state;
  }
  if (filters.ownerId) {
    base.ownerId = filters.ownerId;
  }
  if (filters.albumId) {
    base.albumId = filters.albumId;
  }

  if (filters.mediaType !== 'all') {
    base.$type = filters.mediaType === 'image' ? MapMediaType.Image : MapMediaType.Video;
  }

  return base;
}

export function buildMapTimeBucketOptions(filters: FilterState, spaceId?: string): Record<string, unknown> {
  const base = applyCommonMapFilters(
    spaceId ? { spaceId } : { visibility: AssetVisibility.Timeline, withSharedSpaces: true },
    filters,
    !spaceId,
  );

  if (spaceId && filters.personIds.length > 0) {
    base.spacePersonIds = filters.personIds;
  }

  if (filters.lensModel) {
    base.lensModel = filters.lensModel;
  }
  if (filters.state) {
    base.state = filters.state;
  }
  if (filters.ownerId) {
    base.ownerId = filters.ownerId;
  }
  if (filters.albumId) {
    base.albumId = filters.albumId;
  }

  if (filters.mediaType !== 'all') {
    base.$type = filters.mediaType === 'image' ? AssetTypeEnum.Image : AssetTypeEnum.Video;
  }

  return base;
}

/**
 * Markers for ONE album, honouring that album's active filters.
 *
 * No `withSharedSpaces` and no owner scope: album ACCESS is the scope. The server checks AlbumRead
 * and then leaves `userIds` unset so searchAssetBuilder takes its album branch — owner-scoping an
 * album query hides the album owner's pins from a viewer of a shared album (issue #656).
 */
export function buildAlbumMapMarkerOptions(albumId: string, filters: FilterState): Record<string, unknown> {
  const base = applyCommonMapFilters({ albumId }, filters);

  if (filters.lensModel) {
    base.lensModel = filters.lensModel;
  }
  if (filters.state) {
    base.state = filters.state;
  }
  if (filters.ownerId) {
    base.ownerId = filters.ownerId;
  }

  if (filters.mediaType !== 'all') {
    base.$type = filters.mediaType === 'image' ? MapMediaType.Image : MapMediaType.Video;
  }

  return base;
}

export function buildMapTimelineOptions(
  filters: FilterState | undefined,
  bbox: string,
  selectedClusterIds: Set<string>,
  spaceId?: string,
  settings: MapTimelineSettings = {},
): Record<string, unknown> {
  const base = applyCommonMapFilters(
    {
      bbox,
      ...(spaceId ? { spaceId } : { visibility: AssetVisibility.Timeline, withSharedSpaces: true }),
      assetFilter: selectedClusterIds,
    },
    filters ?? {
      personIds: [],
      tagIds: [],
      mediaType: 'all',
      sortOrder: 'desc',
    },
    false,
  );

  if (filters?.personIds && filters.personIds.length > 0) {
    if (spaceId) {
      base.spacePersonIds = filters.personIds;
    } else {
      base.personIds = filters.personIds;
    }
  }

  if (!spaceId) {
    const isFavorite = filters?.isFavorite ?? (settings.onlyFavorites || undefined);

    if (isFavorite !== undefined) {
      base.isFavorite = isFavorite;
    }
    if (isFavorite === undefined && settings.withPartners) {
      base.withPartners = true;
    }
  }

  if (filters?.mediaType && filters.mediaType !== 'all') {
    base.$type = filters.mediaType === 'image' ? AssetTypeEnum.Image : AssetTypeEnum.Video;
  }

  return base;
}
