import { DateTime } from 'luxon';
import {
  dominantBy,
  medianTime,
  monthName,
  pickEvenlySpaced,
  recencyBonus,
  sampleAssetsByTime,
} from 'src/services/memory-rules/curation.util';

const asset = (id: string, iso: string) => ({ id, localDateTime: DateTime.fromISO(iso, { zone: 'utc' }).toJSDate() });

describe('pickEvenlySpaced', () => {
  it('returns [] when count is zero or negative', () => {
    expect(pickEvenlySpaced([1, 2, 3], 0)).toEqual([]);
    expect(pickEvenlySpaced([1, 2, 3], -1)).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(pickEvenlySpaced([], 3)).toEqual([]);
  });

  it('returns all items (copied) when count >= length', () => {
    const items = [1, 2, 3];
    const result = pickEvenlySpaced(items, 5);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(items);
  });

  it('returns the middle element when count === 1', () => {
    expect(pickEvenlySpaced([0, 1, 2, 3, 4], 1)).toEqual([2]);
    // even length -> lower-middle
    expect(pickEvenlySpaced([0, 1, 2, 3], 1)).toEqual([1]);
  });

  it('returns first and last when count === 2', () => {
    expect(pickEvenlySpaced([0, 1, 2, 3, 4], 2)).toEqual([0, 4]);
  });

  it('spaces evenly for counts in between (parity with recent_trip)', () => {
    expect(pickEvenlySpaced([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4)).toEqual([0, 3, 6, 9]);
    expect(pickEvenlySpaced([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toEqual([0, 5, 9]);
  });
});

describe('sampleAssetsByTime', () => {
  it('sorts by time and returns ids chronologically', () => {
    const assets = [
      asset('b', '2023-07-10T00:00:00'),
      asset('a', '2023-07-01T00:00:00'),
      asset('c', '2023-07-20T00:00:00'),
    ];
    expect(sampleAssetsByTime(assets, 3)).toEqual(['a', 'b', 'c']);
  });

  it('returns all ids chronologically when cap exceeds input', () => {
    const assets = [asset('b', '2023-07-10T00:00:00'), asset('a', '2023-07-01T00:00:00')];
    expect(sampleAssetsByTime(assets, 10)).toEqual(['a', 'b']);
  });

  it('returns [] when cap is zero', () => {
    expect(sampleAssetsByTime([asset('a', '2023-07-01T00:00:00')], 0)).toEqual([]);
  });

  it('evenly samples down to the cap, chronologically', () => {
    const assets = Array.from({ length: 10 }, (_, i) =>
      asset(`a${i}`, DateTime.fromISO('2023-07-01T00:00:00', { zone: 'utc' }).plus({ days: i }).toISO()!),
    );
    expect(sampleAssetsByTime(assets, 4)).toEqual(['a0', 'a3', 'a6', 'a9']);
  });
});

describe('medianTime', () => {
  it('returns the middle time for an odd count', () => {
    const assets = [
      asset('a', '2023-07-01T00:00:00'),
      asset('b', '2023-07-02T00:00:00'),
      asset('c', '2023-07-03T00:00:00'),
    ];
    expect(medianTime(assets)).toEqual(DateTime.fromISO('2023-07-02T00:00:00', { zone: 'utc' }).toJSDate());
  });

  it('returns the lower-middle time for an even count', () => {
    const assets = [
      asset('a', '2023-07-01T00:00:00'),
      asset('b', '2023-07-02T00:00:00'),
      asset('c', '2023-07-03T00:00:00'),
      asset('d', '2023-07-04T00:00:00'),
    ];
    expect(medianTime(assets)).toEqual(DateTime.fromISO('2023-07-02T00:00:00', { zone: 'utc' }).toJSDate());
  });

  it('handles unsorted input', () => {
    const assets = [
      asset('c', '2023-07-03T00:00:00'),
      asset('a', '2023-07-01T00:00:00'),
      asset('b', '2023-07-02T00:00:00'),
    ];
    expect(medianTime(assets)).toEqual(DateTime.fromISO('2023-07-02T00:00:00', { zone: 'utc' }).toJSDate());
  });
});

describe('dominantBy', () => {
  it('returns a single group with ratio 1', () => {
    const result = dominantBy(['x', 'x', 'x'], (v) => v);
    expect(result).toEqual({ key: 'x', items: ['x', 'x', 'x'], ratio: 1 });
  });

  it('returns the largest group with its share of the total', () => {
    const result = dominantBy(['a', 'a', 'a', 'b'], (v) => v);
    expect(result.key).toBe('a');
    expect(result.items).toHaveLength(3);
    expect(result.ratio).toBeCloseTo(0.75);
  });

  it('breaks ties by larger group then lexicographically smaller key', () => {
    // equal counts of 'b' and 'a' -> 'a' wins on lexical order
    const result = dominantBy(['b', 'b', 'a', 'a'], (v) => v);
    expect(result.key).toBe('a');
    expect(result.items).toHaveLength(2);
  });

  it('returns an empty result for empty input', () => {
    expect(dominantBy([] as string[], (v) => v)).toEqual({ key: '', items: [], ratio: 0 });
  });

  it('lets a real empty-string key win a tie (no sentinel confusion), regardless of order', () => {
    // '' is lexicographically smallest, so it must win an equal-sized tie whether seen first or last.
    expect(dominantBy(['', '', 'a', 'a'], (v) => v)).toMatchObject({ key: '', items: ['', ''] });
    expect(dominantBy(['a', 'a', '', ''], (v) => v)).toMatchObject({ key: '', items: ['', ''] });
  });
});

describe('monthName', () => {
  it('returns the English name for a 1-based month', () => {
    expect(monthName(1)).toBe('January');
    expect(monthName(7)).toBe('July');
    expect(monthName(12)).toBe('December');
  });
});

describe('recencyBonus', () => {
  it('is 10 for the same year', () => {
    expect(recencyBonus(2026, 2026)).toBe(10);
  });

  it('decreases by one per year', () => {
    expect(recencyBonus(2023, 2026)).toBe(7);
  });

  it('is 0 for ten or more years ago and never negative', () => {
    expect(recencyBonus(2016, 2026)).toBe(0);
    expect(recencyBonus(2000, 2026)).toBe(0);
  });
});
