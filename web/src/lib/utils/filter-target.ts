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

/**
 * Write a COMPLETE FilterState into the current URL and return the URL to navigate to.
 *
 * This is the WRITE half of the hydrate → write → react loop on the surfaces that are not
 * "searchable pages" — /albums/{id} and /map. `getSearchablePageBasePath` returns null for both
 * (searchable-page-search.ts:37-56), so `buildSearchablePageUrl` returns null there and cannot be
 * reused.
 *
 * Semantics, and how they differ from buildContextualFilterUrl:
 * - It REPLACES rather than merges. Every filter param is deleted, then re-emitted from `filters`
 *   alone. Do NOT reimplement this by passing a full FilterState as buildContextualFilterUrl's
 *   `patch`: that function decodes the URL first, so any key absent from the object would silently
 *   survive and the filter could never be cleared.
 * - It keeps the CURRENT pathname (including an open asset viewer), because the panel can write
 *   while the viewer is open. buildContextualFilterUrl deliberately targets the base path instead,
 *   so that one goto() both closes the viewer and applies the filter.
 * - Non-filter params (q, sort, spaceId, view, …) are preserved; the hash is preserved (the map
 *   keeps its viewport there); the one-shot `at` grid scroll target is dropped.
 */
export function buildFilterStateUrl(url: URL, filters: FilterState): string {
  const params = new URLSearchParams(url.searchParams);

  // `at` is a one-shot grid scroll target left behind by closing the asset viewer. It must not
  // survive a filter change, or the timeline re-scrolls to a now-filtered-out asset.
  params.delete('at');
  clearFilterParams(params);
  encodeFilterParams(params, filters);

  const search = params.toString();
  return url.pathname + (search ? `?${search}` : '') + url.hash;
}

/**
 * Order-insensitive canonical form of a query string: `a=1&b=2` and `b=2&a=1` collapse to one.
 *
 * Each entry is percent-encoded before it is joined. The free-text filters (description, filename,
 * ocr) can legitimately contain `&` and `=`, so joining raw values would let one entry impersonate
 * two — `description=x&make=Apple` as a single value would canonicalise identically to a separate
 * `description=x` plus `make=Apple`, and the guard below would call a real filter change a no-op.
 */
function canonicalizeParams(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([keyA, valueA], [keyB, valueB]) => keyA.localeCompare(keyB) || valueA.localeCompare(valueB))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * Would navigating to `nextUrl` actually change anything?
 *
 * This is the no-op guard for the write half of the hydrate → write → react loop, and it must NOT
 * be a raw string compare: buildFilterStateUrl deletes the filter params and re-appends them last,
 * so `/map?make=Apple&spaceId=s1` rebuilds as `/map?spaceId=s1&make=Apple` — same meaning, different
 * string. A string compare would report "changed" and fire a pointless replaceState (plus an extra
 * $effect pass) the first time the panel is touched on such a URL.
 *
 * Path and hash are compared verbatim; the query is compared as a canonicalised param set, so a
 * dropped `at` or any added/changed/removed filter still reads as a real change.
 */
export function isFilterStateUrlUnchanged(url: URL, nextUrl: string): boolean {
  const next = new URL(nextUrl, url);

  return (
    next.pathname === url.pathname &&
    next.hash === url.hash &&
    canonicalizeParams(next.searchParams) === canonicalizeParams(url.searchParams)
  );
}
