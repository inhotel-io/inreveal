import { createFilterState } from '$lib/components/filter-panel/filter-panel';

import {
  clearTimelineTemporalFilter,
  getTimelineBucketZoomTarget,
  getTimelineManagerTimeBuckets,
} from '../timeline-filter-navigation';

describe('timeline filter navigation helpers', () => {
  it('zooms a year bucket to month grouping without requiring filters', () => {
    expect(
      getTimelineBucketZoomTarget({
        grouping: 'year',
        date: { year: 2015 },
      }),
    ).toEqual({
      grouping: 'month',
      anchor: { year: 2015 },
    });
  });

  it('zooms a month bucket to detailed day grouping without requiring filters', () => {
    expect(
      getTimelineBucketZoomTarget({
        grouping: 'month',
        date: { year: 2015, month: 8 },
      }),
    ).toEqual({
      grouping: 'day',
      anchor: { year: 2015, month: 8 },
    });
  });

  it('does not zoom day buckets', () => {
    expect(
      getTimelineBucketZoomTarget({
        grouping: 'day',
        date: { year: 2015, month: 8, day: 23 },
      }),
    ).toBeUndefined();
  });

  it('does not zoom malformed month buckets without a month number', () => {
    expect(
      getTimelineBucketZoomTarget({
        grouping: 'month',
        date: { year: 2015 },
      }),
    ).toBeUndefined();
  });
  it('clears only temporal filter state', () => {
    const filters = {
      ...createFilterState(),
      personIds: ['person-1'],
      tagIds: ['tag-1'],
      rating: 4,
      dateAfter: '2024-01-01',
      dateBefore: '2024-12-31',
      selectedYear: 2015,
      selectedMonth: 8,
      sortOrder: 'asc' as const,
    };

    expect(clearTimelineTemporalFilter(filters)).toEqual({
      ...filters,
      dateAfter: undefined,
      dateBefore: undefined,
      selectedYear: undefined,
      selectedMonth: undefined,
    });
  });

  it('uses generic timeline buckets for temporal picker buckets before falling back to month buckets', () => {
    const manager = {
      timelineBuckets: [
        { timeBucket: '2015-01-01', count: 438 },
        { timeBucket: '2007-01-01', count: 12 },
      ],
      months: [{ yearMonth: { year: 2024, month: 2 }, assetsCount: 5 }],
    };

    expect(getTimelineManagerTimeBuckets(manager)).toEqual([
      { timeBucket: '2015-01-01', count: 438 },
      { timeBucket: '2007-01-01', count: 12 },
    ]);
  });

  it('falls back to detailed month counts when generic buckets are not available yet', () => {
    const manager = {
      timelineBuckets: [],
      months: [{ yearMonth: { year: 2024, month: 2 }, assetsCount: 5 }],
    };

    expect(getTimelineManagerTimeBuckets(manager)).toEqual([{ timeBucket: '2024-02-01', count: 5 }]);
  });
});
