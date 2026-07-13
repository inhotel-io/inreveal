import { describe, expect, it } from 'vitest';
import { createFilterState, type FilterState } from '$lib/components/filter-panel/filter-panel';
import {
  buildContextualFilterUrl,
  buildFilterStateUrl,
  isFilterStateUrlUnchanged,
  resolveFilterTarget,
} from '$lib/utils/filter-target';

const u = (path: string) => new URL(`https://g.test${path}`);

describe('resolveFilterTarget', () => {
  it('resolves /photos, with or without an open asset', () => {
    expect(resolveFilterTarget(u('/photos'))).toMatchObject({ kind: 'photos', basePath: '/photos' });
    expect(resolveFilterTarget(u('/photos/asset-1'))).toMatchObject({ kind: 'photos', basePath: '/photos' });
  });

  it('resolves a space, with or without an open asset', () => {
    expect(resolveFilterTarget(u('/spaces/s1'))).toMatchObject({ kind: 'space', spaceId: 's1' });
    expect(resolveFilterTarget(u('/spaces/s1/photos/a1'))).toMatchObject({ kind: 'space', spaceId: 's1' });
  });

  it('resolves an album, with or without an open asset', () => {
    expect(resolveFilterTarget(u('/albums/al1'))).toMatchObject({ kind: 'album', albumId: 'al1' });
    expect(resolveFilterTarget(u('/albums/al1/photos/a1'))).toMatchObject({ kind: 'album', albumId: 'al1' });
  });

  // E23 — /map is a filter target too
  it('E23: resolves the map, carrying its spaceId', () => {
    expect(resolveFilterTarget(u('/map'))).toMatchObject({ kind: 'map', basePath: '/map' });
    expect(resolveFilterTarget(u('/map/photos/a1?spaceId=s1'))).toMatchObject({ kind: 'map', spaceId: 's1' });
  });

  // E3 — non-filterable surfaces
  it('E3: returns null for surfaces with no filterable timeline', () => {
    for (const path of [
      '/favorites',
      '/archive',
      '/trash',
      '/folders',
      '/memories',
      '/search',
      '/people/p1',
      '/tags/x',
    ]) {
      expect(resolveFilterTarget(u(path)), path).toBeNull();
    }
  });
});

describe('buildContextualFilterUrl', () => {
  it('merges the patch into the current filters, preserving the others', () => {
    const url = buildContextualFilterUrl(u('/spaces/s1/photos/a1?people=person:p1'), {
      make: 'Apple',
      model: 'iPhone 17 Pro Max',
    });

    expect(url).toContain('/spaces/s1');
    expect(url).toContain('people=person%3Ap1');
    expect(url).toContain('make=Apple');
  });

  it('closes the asset viewer by targeting the base path', () => {
    expect(buildContextualFilterUrl(u('/photos/asset-1'), { make: 'Apple' })).not.toContain('asset-1');
  });

  it('preserves an active search query and sort', () => {
    const url = buildContextualFilterUrl(u('/photos?q=beach&sort=asc'), { make: 'Apple' });

    expect(url).toContain('q=beach');
    expect(url).toContain('sort=asc');
  });

  // E25 — arrays replace, never append
  it('E25: replaces the tag array rather than appending', () => {
    const url = buildContextualFilterUrl(u('/photos?tags=beach'), { tagIds: ['sunset'] });

    expect(url).toContain('tags=sunset');
    expect(url).not.toContain('beach');
  });

  it('E25: replaces the person array rather than appending', () => {
    const url = buildContextualFilterUrl(u('/photos?people=person:anna'), { personIds: ['person:ben'] });

    expect(url).toContain('people=person%3Aben');
    expect(url).not.toContain('anna');
  });

  // E24 — clicking the same value twice is a no-op.
  //
  // Assert the IDEMPOTENCE PROPERTY f(f(u)) === f(u), not string equality against the original
  // URL. The encoder re-emits filter params in its own canonical order, so `/photos?model=X&make=Y`
  // legitimately normalises to `/photos?make=Y&model=X`. A string-equality test against the raw
  // input would only pass when the fixture happens to already be in canonical order — it would be
  // green by luck, not by design.
  it('E24: applying the same patch twice is idempotent', () => {
    const patch = { make: 'Apple', model: 'iPhone 17 Pro Max' };
    const once = buildContextualFilterUrl(u('/photos?model=iPhone%2017%20Pro%20Max&make=Apple'), patch);
    const twice = buildContextualFilterUrl(new URL(`https://g.test${once}`), patch);

    expect(twice).toBe(once);
  });

  it('drops the one-shot `at` scroll target', () => {
    expect(buildContextualFilterUrl(u('/photos?at=asset-9'), { make: 'Apple' })).not.toContain('at=');
  });

  it('preserves non-filter params such as view and panel', () => {
    const url = buildContextualFilterUrl(u('/photos?view=timeline'), { make: 'Apple' });

    expect(url).toContain('view=timeline');
    expect(url).toContain('make=Apple');
  });

  // D2 — a behaviour change that falls out of putting year/month in the codec. buildContextualFilterUrl
  // merges decodeFilterParams(url) under the patch, so the picked year is now carried over by a
  // contextual-filter click (e.g. "show me this camera") where it used to be silently dropped.
  it('D2: preserves an active year/month when applying a contextual patch', () => {
    const url = buildContextualFilterUrl(u('/photos?year=2023&month=6'), { make: 'Apple' });

    expect(url).toContain('year=2023');
    expect(url).toContain('month=6');
    expect(url).toContain('make=Apple');
  });

  it('D2: a patch that sets an explicit date range evicts the year (from/to wins)', () => {
    const url = buildContextualFilterUrl(u('/photos?year=2023'), { dateAfter: '2024-01-01' });

    expect(url).toContain('from=2024-01-01');
    expect(url).not.toContain('year=');
  });

  it('D2: global: true does not carry the year over', () => {
    const url = buildContextualFilterUrl(u('/photos?year=2023'), { make: 'Apple' }, { global: true });

    expect(url).not.toContain('year=');
    expect(url).toContain('make=Apple');
  });

  // E5 / global — escape the current context, starting from a clean slate
  it('global: true targets /photos and carries NOTHING over — not filters, not the query', () => {
    const url = buildContextualFilterUrl(
      u('/spaces/s1/photos/a1?q=beach&sort=asc&people=space-person:p1&city=Berlin'),
      { make: 'Apple' },
      { global: true },
    );

    expect(url).toContain('/photos');
    expect(url).not.toContain('/spaces');
    expect(url).toContain('make=Apple');
    // A space-scoped person token matches nothing on /photos.
    expect(url).not.toContain('space-person');
    expect(url).not.toContain('city=Berlin');
    // "Search everywhere for THIS camera" is a NEW search, not the old one plus a camera.
    expect(url).not.toContain('q=');
  });

  // E3 — fallback
  it('E3: falls back to /photos from a non-filterable surface', () => {
    const url = buildContextualFilterUrl(u('/favorites/a1'), { make: 'Apple' });

    expect(url).toContain('/photos');
    expect(url).toContain('make=Apple');
  });

  it('keeps the map on the map, preserving its spaceId', () => {
    const url = buildContextualFilterUrl(u('/map/photos/a1?spaceId=s1'), { make: 'Apple' });

    expect(url).toContain('/map');
    expect(url).toContain('spaceId=s1');
    expect(url).toContain('make=Apple');
  });

  // The map stores its viewport in the hash. Losing it resets the map on every filter click.
  it('preserves the map viewport hash', () => {
    const url = buildContextualFilterUrl(u('/map/photos/a1?spaceId=s1#12.5/52.52/13.40'), { make: 'Apple' });

    expect(url).toContain('#12.5/52.52/13.40');
  });

  it('does not leak a hash onto non-map surfaces', () => {
    expect(buildContextualFilterUrl(u('/photos/a1#foo'), { make: 'Apple' })).not.toContain('#');
  });
});

describe('buildFilterStateUrl', () => {
  const state = (overrides: Partial<FilterState> = {}): FilterState => ({ ...createFilterState(), ...overrides });

  it('writes the complete state into the current path', () => {
    const url = buildFilterStateUrl(new URL('https://g.test/albums/al1'), state({ make: 'Apple', rating: 4 }));

    expect(url).toContain('/albums/al1');
    expect(url).toContain('make=Apple');
    expect(url).toContain('rating=4');
  });

  // THE anti-merge test. buildContextualFilterUrl would keep `rating=4` here, because it decodes
  // the URL first and merges. A complete state must REPLACE: a field the caller cleared has to
  // disappear from the URL, or a filter could never be removed.
  it('drops filter params that are absent from the state (replace, never merge)', () => {
    const url = buildFilterStateUrl(new URL('https://g.test/albums/al1?make=Apple&rating=4'), state({ make: 'Apple' }));

    expect(url).toContain('make=Apple');
    expect(url).not.toContain('rating');
  });

  it('clears every filter param for an empty state', () => {
    const url = buildFilterStateUrl(new URL('https://g.test/albums/al1?make=Apple&people=person:p1'), state());

    expect(url).toBe('/albums/al1');
  });

  it('keeps non-filter params (q, sort, spaceId, view)', () => {
    const url = buildFilterStateUrl(
      new URL('https://g.test/map?spaceId=s1&q=ski&sort=asc&view=timeline'),
      state({ make: 'Apple' }),
    );

    expect(url).toContain('spaceId=s1');
    expect(url).toContain('q=ski');
    expect(url).toContain('sort=asc');
    expect(url).toContain('view=timeline');
    expect(url).toContain('make=Apple');
  });

  it('drops the one-shot `at` scroll target', () => {
    const url = buildFilterStateUrl(new URL('https://g.test/albums/al1?at=asset-9'), state({ make: 'Apple' }));

    expect(url).not.toContain('at=');
  });

  // The map stores its viewport in the hash. Losing it re-centres the map on every filter change.
  it('preserves the hash', () => {
    const url = buildFilterStateUrl(new URL('https://g.test/map?spaceId=s1#12.5/52.52/13.4'), state({ make: 'Apple' }));

    expect(url).toBe('/map?spaceId=s1&make=Apple#12.5/52.52/13.4');
  });

  // The write-back loop can fire while the asset viewer is open; it must not close it. (This is the
  // deliberate difference from buildContextualFilterUrl, which targets the BASE path precisely so a
  // single goto() both closes the viewer and applies the filter.)
  it('keeps the current path, including an open asset viewer', () => {
    const url = buildFilterStateUrl(new URL('https://g.test/albums/al1/photos/asset-1'), state({ make: 'Apple' }));

    expect(url).toBe('/albums/al1/photos/asset-1?make=Apple');
  });

  it('is idempotent', () => {
    const filters = state({ make: 'Apple', model: 'iPhone 17 Pro Max', tagIds: ['t1'] });
    const once = buildFilterStateUrl(new URL('https://g.test/albums/al1?rating=4'), filters);
    const twice = buildFilterStateUrl(new URL(`https://g.test${once}`), filters);

    expect(twice).toBe(once);
  });
});

describe('isFilterStateUrlUnchanged', () => {
  const state = (overrides: Partial<FilterState> = {}): FilterState => ({ ...createFilterState(), ...overrides });

  it('is true when the rebuilt URL is identical', () => {
    const url = new URL('https://g.test/map?spaceId=s1&make=Apple');

    expect(isFilterStateUrlUnchanged(url, buildFilterStateUrl(url, state({ make: 'Apple' })))).toBe(true);
  });

  // THE reason this function exists. buildFilterStateUrl deletes the filter params and re-appends
  // them last, so `?make=Apple&spaceId=s1` comes back as `?spaceId=s1&make=Apple` — a different
  // string with the same meaning. A raw string compare would report "changed" and burn a spurious
  // replaceState on the first panel interaction.
  it('is true when only the param ORDER differs', () => {
    const url = new URL('https://g.test/map?make=Apple&spaceId=s1');
    const next = buildFilterStateUrl(url, state({ make: 'Apple' }));

    expect(next).toBe('/map?spaceId=s1&make=Apple'); // re-ordered, on purpose
    expect(next).not.toBe(url.pathname + url.search + url.hash); // …so a string compare would lie
    expect(isFilterStateUrlUnchanged(url, next)).toBe(true);
  });

  it('is false when a filter param is added, changed or removed', () => {
    const url = new URL('https://g.test/map?spaceId=s1&make=Apple');

    expect(isFilterStateUrlUnchanged(url, '/map?spaceId=s1&make=Apple&rating=4')).toBe(false);
    expect(isFilterStateUrlUnchanged(url, '/map?spaceId=s1&make=Canon')).toBe(false);
    expect(isFilterStateUrlUnchanged(url, '/map?spaceId=s1')).toBe(false);
  });

  // `at` is dropped by buildFilterStateUrl. That IS a change worth navigating for — the one-shot
  // scroll target must not survive a filter change.
  it('is false when the one-shot `at` param is dropped', () => {
    const url = new URL('https://g.test/albums/al1?at=asset-9&make=Apple');

    expect(isFilterStateUrlUnchanged(url, buildFilterStateUrl(url, state({ make: 'Apple' })))).toBe(false);
  });

  it('is false when the path or the hash differs', () => {
    const url = new URL('https://g.test/map?spaceId=s1#12/52.52/13.4');

    expect(isFilterStateUrlUnchanged(url, '/albums/al1?spaceId=s1#12/52.52/13.4')).toBe(false);
    expect(isFilterStateUrlUnchanged(url, '/map?spaceId=s1')).toBe(false);
  });

  // The free-text filters (description, filename, ocr) may contain `&` and `=`. Canonicalising by
  // joining raw values would let ONE entry impersonate TWO — the single description below would
  // read as `description=x` plus `make=Apple` — and the guard would swallow a real filter change.
  it('is false when a free-text value merely looks like a second param', () => {
    const url = new URL('https://g.test/photos');
    url.searchParams.set('description', 'x&make=Apple');

    expect(isFilterStateUrlUnchanged(url, '/photos?description=x&make=Apple')).toBe(false);
  });
});
