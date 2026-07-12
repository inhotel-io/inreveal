import { describe, expect, it } from 'vitest';
import { buildContextualFilterUrl, resolveFilterTarget } from '$lib/utils/filter-target';

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
