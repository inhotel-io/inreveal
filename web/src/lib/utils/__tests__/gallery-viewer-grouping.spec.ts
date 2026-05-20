import { AssetTypeEnum, AssetVisibility, type AssetResponseDto } from '@immich/sdk';

import {
  buildGalleryViewerBuckets,
  filterGalleryViewerAssetsByTemporalState,
  getGalleryViewerAssetDate,
} from '../gallery-viewer-grouping';

function asset(id: string, localDateTime: string, overrides: Partial<AssetResponseDto> = {}): AssetResponseDto {
  return {
    id,
    ownerId: 'user-1',
    type: AssetTypeEnum.Image,
    originalFileName: `${id}.jpg`,
    visibility: AssetVisibility.Timeline,
    isFavorite: false,
    isTrashed: false,
    fileCreatedAt: localDateTime,
    localDateTime,
    thumbhash: `${id}-thumbhash`,
    width: 1600,
    height: 900,
    ...overrides,
  } as AssetResponseDto;
}

describe('gallery viewer grouping helpers', () => {
  it('reads localDateTime before fileCreatedAt for bucket dates', () => {
    const result = getGalleryViewerAssetDate(
      asset('asset-1', '2015-12-31T23:30:00.000Z', { fileCreatedAt: '2016-01-01T00:30:00.000Z' }),
    );

    expect(result).toEqual({ year: 2015, month: 12, day: 31 });
  });

  it('falls back to fileCreatedAt when localDateTime is missing', () => {
    const result = getGalleryViewerAssetDate(
      asset('asset-1', '2015-01-01T00:00:00.000Z', {
        localDateTime: undefined as unknown as string,
        fileCreatedAt: '2016-02-29T10:00:00.000Z',
      }),
    );

    expect(result).toEqual({ year: 2016, month: 2, day: 29 });
  });

  it('builds year buckets from loaded assets and uses the first asset as representative', () => {
    const buckets = buildGalleryViewerBuckets(
      [
        asset('asset-2016-a', '2016-01-02T00:00:00.000Z'),
        asset('asset-2015-a', '2015-08-03T00:00:00.000Z'),
        asset('asset-2015-b', '2015-01-01T00:00:00.000Z'),
      ],
      'year',
    );

    expect(buckets).toEqual([
      expect.objectContaining({
        viewId: 'year:2016',
        timeBucket: '2016-01-01T00:00:00.000Z',
        grouping: 'year',
        date: { year: 2016 },
        count: 1,
        representativeAssetId: 'asset-2016-a',
        representativeThumbhash: 'asset-2016-a-thumbhash',
        representativeRatio: 1600 / 900,
      }),
      expect.objectContaining({
        viewId: 'year:2015',
        timeBucket: '2015-01-01T00:00:00.000Z',
        grouping: 'year',
        date: { year: 2015 },
        count: 2,
        representativeAssetId: 'asset-2015-a',
      }),
    ]);
  });

  it('builds month buckets from loaded assets while preserving first-seen bucket order', () => {
    const buckets = buildGalleryViewerBuckets(
      [
        asset('aug-a', '2015-08-03T00:00:00.000Z'),
        asset('jan-a', '2015-01-01T00:00:00.000Z'),
        asset('aug-b', '2015-08-04T00:00:00.000Z'),
      ],
      'month',
    );

    expect(buckets.map((bucket) => [bucket.viewId, bucket.count, bucket.representativeAssetId])).toEqual([
      ['month:2015-08', 2, 'aug-a'],
      ['month:2015-01', 1, 'jan-a'],
    ]);
  });

  it('filters loaded assets by selected year and month without mutating the input list', () => {
    const assets = [
      asset('aug-a', '2015-08-03T00:00:00.000Z'),
      asset('jan-a', '2015-01-01T00:00:00.000Z'),
      asset('other', '2016-08-03T00:00:00.000Z'),
    ];

    expect(filterGalleryViewerAssetsByTemporalState(assets, { selectedYear: 2015 }).map((asset) => asset.id)).toEqual([
      'aug-a',
      'jan-a',
    ]);
    expect(
      filterGalleryViewerAssetsByTemporalState(assets, { selectedYear: 2015, selectedMonth: 8 }).map(
        (asset) => asset.id,
      ),
    ).toEqual(['aug-a']);
    expect(assets.map((asset) => asset.id)).toEqual(['aug-a', 'jan-a', 'other']);
  });

  it('keeps all assets when no temporal state is active', () => {
    const assets = [asset('asset-1', '2015-08-03T00:00:00.000Z')];

    expect(filterGalleryViewerAssetsByTemporalState(assets, {})).toBe(assets);
  });
});
