import { createFilterState, type FilterState } from '$lib/components/filter-panel/filter-panel';
import { clearFilterParams, decodeFilterParams, encodeFilterParams } from '$lib/utils/filter-url';

export type FilterTarget =
  | { kind: 'photos'; basePath: '/photos' }
  | { kind: 'space'; basePath: string; spaceId: string }
  | { kind: 'album'; basePath: string; albumId: string }
  | { kind: 'map'; basePath: '/map'; spaceId?: string };

/**
 * Which timeline surface is this URL on, for the purpose of contextual filtering?
 *
 * Deliberately SEPARATE from `getSearchablePageBasePath` in searchable-page-search.ts, which
 * answers a different question ("can ⌘K run a text query here?") and must not change.
 */
export function resolveFilterTarget(url: URL): FilterTarget | null {
  const parts = url.pathname.split('/').filter(Boolean);
  const [root, id, sub] = parts;

  if (root === 'photos') {
    return { kind: 'photos', basePath: '/photos' };
  }

  if (root === 'map') {
    const spaceId = url.searchParams.get('spaceId') ?? undefined;
    return { kind: 'map', basePath: '/map', spaceId };
  }

  // /spaces/{id}, /spaces/{id}/photos, /spaces/{id}/photos/{assetId}
  if (root === 'spaces' && id && (sub === undefined || sub === 'photos')) {
    return { kind: 'space', basePath: `/spaces/${id}`, spaceId: id };
  }

  // /albums/{id}, /albums/{id}/photos, /albums/{id}/photos/{assetId}
  if (root === 'albums' && id && (sub === undefined || sub === 'photos')) {
    return { kind: 'album', basePath: `/albums/${id}`, albumId: id };
  }

  return null;
}

/**
 * Merge one metadata patch into the current URL's filters and return the URL to navigate to.
 *
 * The result targets the surface's BASE path, which excludes any open assetId — so a single
 * goto() both closes the asset viewer and applies the filter.
 *
 * Merge semantics: the patched fields are SET; every other active filter is preserved. Array
 * fields (personIds, tagIds) are REPLACED, never appended — see the module docs and spec §5.6.
 */
export function buildContextualFilterUrl(url: URL, patch: Partial<FilterState>, opts?: { global?: boolean }): string {
  const target = opts?.global ? null : resolveFilterTarget(url);
  const basePath = target?.basePath ?? '/photos';

  // `global` (and the non-filterable-surface fallback) start from a CLEAN slate rather than
  // carrying the current context over. This replaces the old Route.search(...) link, which always
  // began a fresh search. It deliberately drops the active `q` and `sort` as well as the filters:
  // "search everywhere for THIS camera" is a new search, not the old one plus a camera. It also
  // avoids dragging a Space's `space-person:<uuid>` scoped tokens onto /photos, where a scoped
  // token matches nothing.
  const carryOver = target !== null;

  const params = new URLSearchParams(carryOver ? url.searchParams : undefined);

  // `at` is a one-shot grid scroll target left behind by closing the asset viewer. It must not
  // survive a filter change, or the timeline re-scrolls to a now-filtered-out asset.
  params.delete('at');
  clearFilterParams(params);

  const current: FilterState = {
    ...createFilterState(),
    ...(carryOver ? decodeFilterParams(url) : {}),
    ...patch,
  };

  encodeFilterParams(params, current);

  // The map keeps its viewport (zoom/lat/lng) in the URL HASH — `<Map hash>` on the map page, and
  // Route.map emits `#zoom/lat/lng`. Dropping it would silently reset the map's viewport every
  // time you filter from an asset opened on the map. No other surface uses the hash.
  const hash = target?.kind === 'map' ? url.hash : '';

  const search = params.toString();
  return basePath + (search ? `?${search}` : '') + hash;
}
