import { AssetTypeEnum } from '@immich/sdk';
import { describe, expect, it } from 'vitest';
import { createFilterState, type FilterState } from '$lib/components/filter-panel/filter-panel';
import { filterStateToSearchTerms } from '$lib/utils/filter-search-terms';

describe('filterStateToSearchTerms', () => {
  it('returns empty terms for a cleared filter state', () => {
    expect(filterStateToSearchTerms(createFilterState())).toEqual({});
  });

  it('maps text, people, tag, location, camera, rating, favorite and album filters', () => {
    const filters: FilterState = {
      ...createFilterState(),
      personIds: ['p1', 'p2'],
      tagIds: ['t1'],
      city: 'Lisbon',
      country: 'Portugal',
      make: 'Canon',
      model: 'R6',
      description: 'beach',
      originalFileName: 'IMG',
      ocr: 'invoice',
      rating: 4,
      isFavorite: true,
      isInAlbum: true,
      mediaType: 'image',
    };

    expect(filterStateToSearchTerms(filters)).toEqual({
      personIds: ['p1', 'p2'],
      tagIds: ['t1'],
      city: 'Lisbon',
      country: 'Portugal',
      make: 'Canon',
      model: 'R6',
      description: 'beach',
      originalFileName: 'IMG',
      ocr: 'invoice',
      rating: 4,
      isFavorite: true,
      isInAlbum: true,
      type: AssetTypeEnum.Image,
    });
  });

  it('maps mediaType video to the video asset type', () => {
    const terms = filterStateToSearchTerms({ ...createFilterState(), mediaType: 'video' });
    expect(terms.type).toBe(AssetTypeEnum.Video);
  });

  it('maps isNotInAlbum without emitting isInAlbum', () => {
    const terms = filterStateToSearchTerms({ ...createFilterState(), isNotInAlbum: true });
    expect(terms.isNotInAlbum).toBe(true);
    expect(terms.isInAlbum).toBeUndefined();
  });

  it('omits blank / whitespace-only text filters', () => {
    const terms = filterStateToSearchTerms({
      ...createFilterState(),
      description: ' '.repeat(3),
      originalFileName: '',
      ocr: '  ',
    });
    expect(terms).toEqual({});
  });

  it('maps lensModel and state to search terms', () => {
    const terms = filterStateToSearchTerms({
      ...createFilterState(),
      lensModel: 'RF24-70mm F2.8 L IS USM',
      state: 'State of Berlin',
    });

    expect(terms).toEqual(
      expect.objectContaining({
        lensModel: 'RF24-70mm F2.8 L IS USM',
        state: 'State of Berlin',
      }),
    );
  });

  // MetadataSearchDto has no ownerId field, so it is intentionally not forwarded here (unlike the
  // timeline/map option builders, which do forward it to their own DTOs).
  it('does not forward ownerId, which MetadataSearchDto does not support', () => {
    const terms = filterStateToSearchTerms({ ...createFilterState(), ownerId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' });

    expect(terms).not.toHaveProperty('ownerId');
  });

  it('maps a custom date range to takenAfter / takenBefore', () => {
    const terms = filterStateToSearchTerms({
      ...createFilterState(),
      dateAfter: '2024-01-01',
      dateBefore: '2024-12-31',
    });
    expect(terms.takenAfter).toBeTruthy();
    expect(terms.takenBefore).toBeTruthy();
  });
});
