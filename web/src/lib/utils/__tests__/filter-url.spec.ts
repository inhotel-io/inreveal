import { describe, expect, it } from 'vitest';
import { createFilterState, type FilterState } from '$lib/components/filter-panel/filter-panel';
import { clearFilterParams, decodeFilterParams, encodeFilterParams } from '$lib/utils/filter-url';

const encode = (filters: Partial<FilterState>): URLSearchParams => {
  const params = new URLSearchParams();
  encodeFilterParams(params, { ...createFilterState(), ...filters });
  return params;
};

describe('filter-url codec', () => {
  it('round-trips every filter field', () => {
    const filters: FilterState = {
      ...createFilterState(),
      personIds: ['person:p1', 'space-person:p2'],
      tagIds: ['t1', 't2'],
      city: 'Berlin',
      state: 'State of Berlin',
      country: 'Germany',
      make: 'Apple',
      model: 'iPhone 17 Pro Max',
      lensModel: 'iPhone 17 Pro Max back triple camera',
      albumId: 'a1',
      ownerId: 'u1',
      description: 'sunset',
      originalFileName: 'IMG_7465',
      ocr: 'hello',
      rating: 4,
      mediaType: 'image',
      isFavorite: true,
      dateAfter: '2026-01-01',
      dateBefore: '2026-01-31',
    };

    const decoded = decodeFilterParams(new URL(`https://g.test/photos?${encode(filters)}`));

    expect(decoded).toMatchObject({
      personIds: ['person:p1', 'space-person:p2'],
      tagIds: ['t1', 't2'],
      city: 'Berlin',
      state: 'State of Berlin',
      country: 'Germany',
      make: 'Apple',
      model: 'iPhone 17 Pro Max',
      lensModel: 'iPhone 17 Pro Max back triple camera',
      albumId: 'a1',
      ownerId: 'u1',
      description: 'sunset',
      originalFileName: 'IMG_7465',
      ocr: 'hello',
      rating: 4,
      mediaType: 'image',
      isFavorite: true,
      dateAfter: '2026-01-01',
      dateBefore: '2026-01-31',
    });
  });

  it('uses the short `owner` and `lens` param names', () => {
    const params = encode({ ownerId: 'u1', lensModel: 'RF24-70mm' });

    expect(params.get('owner')).toBe('u1');
    expect(params.get('lens')).toBe('RF24-70mm');
    expect(params.get('ownerId')).toBeNull();
    expect(params.get('lensModel')).toBeNull();
  });

  // E1 — mirrors the server: albumId takes precedence over isInAlbum/isNotInAlbum
  it('E1: never emits album=has|none alongside albumId', () => {
    const params = encode({ albumId: 'a1', isInAlbum: true });

    expect(params.get('albumId')).toBe('a1');
    expect(params.get('album')).toBeNull();
  });

  it('E1: decoding drops isInAlbum/isNotInAlbum when albumId is present', () => {
    const decoded = decodeFilterParams(new URL('https://g.test/photos?albumId=a1&album=has'));

    expect(decoded.albumId).toBe('a1');
    expect(decoded.isInAlbum).toBeUndefined();
    expect(decoded.isNotInAlbum).toBeUndefined();
  });

  // E7 — empty/whitespace values must not become filters
  it('E7: emits no param for empty or whitespace-only values', () => {
    const params = encode({ make: '   ', lensModel: '', state: '  ', ownerId: '' });

    expect(params.get('make')).toBeNull();
    expect(params.get('lens')).toBeNull();
    expect(params.get('state')).toBeNull();
    expect(params.get('owner')).toBeNull();
  });

  // E12 — URL-special characters must survive a round trip
  it('E12: round-trips values containing URL-special characters', () => {
    const lensModel = 'FE 24-70mm F2.8 GM / II + adapter & hood?';
    const decoded = decodeFilterParams(new URL(`https://g.test/photos?${encode({ lensModel })}`));

    expect(decoded.lensModel).toBe(lensModel);
  });

  // E13 — bound the URL length, on BOTH sides of the codec
  it('E13: truncates description to 200 characters when encoding', () => {
    const params = encode({ description: 'x'.repeat(500) });

    expect(params.get('description')).toHaveLength(200);
  });

  it('E13: clamps an over-long description param when decoding', () => {
    // A hand-crafted or legacy URL can carry more than the encoder would ever emit. Clamp on the
    // way in too, so encode(decode(u)) is stable and the filter panel does not silently rewrite
    // the user's URL on the next hydrate.
    const decoded = decodeFilterParams(new URL(`https://g.test/photos?description=${'x'.repeat(500)}`));

    expect(decoded.description).toHaveLength(200);
  });

  it('clearFilterParams removes every filter param but leaves q and sort alone', () => {
    const params = new URLSearchParams('q=beach&sort=asc&make=Apple&lens=RF24&owner=u1&albumId=a1&state=Hamburg');

    clearFilterParams(params);

    expect(params.get('q')).toBe('beach');
    expect(params.get('sort')).toBe('asc');
    expect(params.get('make')).toBeNull();
    expect(params.get('lens')).toBeNull();
    expect(params.get('owner')).toBeNull();
    expect(params.get('albumId')).toBeNull();
    expect(params.get('state')).toBeNull();
  });
});
