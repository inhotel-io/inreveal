import type { FilterState } from '$lib/components/filter-panel/filter-panel';

/** Bounds the URL length when a long description is used as a filter (E13). */
export const DESCRIPTION_PARAM_MAX_LENGTH = 200;

export const FILTER_URL_PARAMS = [
  'people',
  'tags',
  'city',
  'state',
  'country',
  'make',
  'model',
  'lens',
  'description',
  'filename',
  'ocr',
  'type',
  'favorite',
  'album',
  'albumId',
  'owner',
  'rating',
  'from',
  'to',
] as const;

export type DecodedFilterState = Partial<
  Pick<
    FilterState,
    | 'personIds'
    | 'tagIds'
    | 'city'
    | 'state'
    | 'country'
    | 'make'
    | 'model'
    | 'lensModel'
    | 'albumId'
    | 'ownerId'
    | 'description'
    | 'originalFileName'
    | 'ocr'
    | 'mediaType'
    | 'isFavorite'
    | 'isNotInAlbum'
    | 'isInAlbum'
    | 'rating'
    | 'dateAfter'
    | 'dateBefore'
  >
>;

export function clearFilterParams(params: URLSearchParams) {
  for (const key of FILTER_URL_PARAMS) {
    params.delete(key);
  }
}

export function encodeFilterParams(params: URLSearchParams, filters: FilterState) {
  const setTrimmed = (key: string, value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) {
      params.set(key, trimmed);
    }
  };

  if (filters.personIds.length > 0) {
    params.set('people', filters.personIds.join(','));
  }
  if (filters.tagIds.length > 0) {
    params.set('tags', filters.tagIds.join(','));
  }
  setTrimmed('city', filters.city);
  setTrimmed('state', filters.state);
  setTrimmed('country', filters.country);
  setTrimmed('make', filters.make);
  setTrimmed('model', filters.model);
  setTrimmed('lens', filters.lensModel);
  setTrimmed('owner', filters.ownerId);
  setTrimmed('description', filters.description?.trim().slice(0, DESCRIPTION_PARAM_MAX_LENGTH));
  setTrimmed('filename', filters.originalFileName);
  setTrimmed('ocr', filters.ocr);

  if (filters.mediaType !== 'all') {
    params.set('type', filters.mediaType);
  }
  if (filters.isFavorite !== undefined) {
    params.set('favorite', String(filters.isFavorite));
  }

  // albumId takes precedence over the has/none album filter, mirroring the server
  // (asset.repository.ts guards isInAlbum/isNotInAlbum with `&& !options.albumId`). Emitting
  // both would be a contradiction the server silently resolves in albumId's favour anyway.
  const albumId = filters.albumId?.trim();
  if (albumId) {
    params.set('albumId', albumId);
  } else if (filters.isNotInAlbum === true) {
    params.set('album', 'none');
  } else if (filters.isInAlbum === true) {
    params.set('album', 'has');
  }

  if (filters.rating !== undefined) {
    params.set('rating', String(filters.rating));
  }
  if (filters.dateAfter) {
    params.set('from', filters.dateAfter);
  }
  if (filters.dateBefore) {
    params.set('to', filters.dateBefore);
  }
}

export function decodeFilterParams(url: URL): DecodedFilterState {
  const result: DecodedFilterState = {};
  const get = (key: string) => url.searchParams.get(key)?.trim() || undefined;

  const people = splitListParam(url.searchParams.get('people'));
  const tags = splitListParam(url.searchParams.get('tags'));
  if (people.length > 0) {
    result.personIds = people;
  }
  if (tags.length > 0) {
    result.tagIds = tags;
  }

  result.city = get('city');
  result.state = get('state');
  result.country = get('country');
  result.make = get('make');
  result.model = get('model');
  result.lensModel = get('lens');
  result.ownerId = get('owner');
  // Clamp on decode as well as encode: a hand-written or legacy URL can carry more than the
  // encoder would ever emit, and without this, encode(decode(url)) would rewrite the user's URL.
  result.description = get('description')?.slice(0, DESCRIPTION_PARAM_MAX_LENGTH);
  result.originalFileName = get('filename');
  result.ocr = get('ocr');
  result.albumId = get('albumId');

  const mediaType = parseMediaType(url.searchParams.get('type'));
  if (mediaType) {
    result.mediaType = mediaType;
  }
  const favorite = parseFavorite(url.searchParams.get('favorite'));
  if (favorite !== undefined) {
    result.isFavorite = favorite;
  }

  // Mirror the encoder + the server: albumId wins, so never surface a has/none flag beside it.
  if (!result.albumId) {
    const albumFilter = parseAlbumFilter(url.searchParams.get('album'));
    if (albumFilter === 'none') {
      result.isNotInAlbum = true;
    } else if (albumFilter === 'has') {
      result.isInAlbum = true;
    }
  }

  const rating = parseRating(url.searchParams.get('rating'));
  if (rating !== undefined) {
    result.rating = rating;
  }
  const from = parseDateParam(url.searchParams.get('from'));
  const to = parseDateParam(url.searchParams.get('to'));
  if (from) {
    result.dateAfter = from;
  }
  if (to) {
    result.dateBefore = to;
  }

  // Strip keys we set to `undefined` above so the object is a clean partial.
  for (const key of Object.keys(result) as Array<keyof DecodedFilterState>) {
    if (result[key] === undefined) {
      delete result[key];
    }
  }

  return result;
}

function splitListParam(value: string | null): string[] {
  return (
    value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function parseRating(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const rating = Number(value);
  return Number.isSafeInteger(rating) && rating >= 1 && rating <= 5 ? rating : undefined;
}

function parseMediaType(value: string | null): 'image' | 'video' | undefined {
  return value === 'image' || value === 'video' ? value : undefined;
}

function parseFavorite(value: string | null): boolean | undefined {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
}

function parseAlbumFilter(value: string | null): 'has' | 'none' | undefined {
  if (value === 'none') {
    return 'none';
  }
  if (value === 'has') {
    return 'has';
  }
  return undefined;
}

function parseDateParam(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return undefined;
  }

  return value;
}
