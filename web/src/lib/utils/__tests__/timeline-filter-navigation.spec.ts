import { createFilterState } from '$lib/components/filter-panel/filter-panel';

import {
  activateTimelineBucket,
  clearTimelineTemporalFilter,
  getTimelineManagerTimeBuckets,
} from '../timeline-filter-navigation';

describe('timeline filter navigation helpers', () => {
  it('selects a year bucket, clears custom dates, preserves non-time filters, and switches to month grouping', () => {
    const filters = {
      ...createFilterState(),
      personIds: ['person-1'],
      tagIds: ['tag-1'],
      dateAfter: '2020-01-01',
      dateBefore: '2020-12-31',
      sortOrder: 'asc' as const,
    };

    const result = activateTimelineBucket(filters, {
      grouping: 'year',
      date: { year: 2015 },
    });

    expect(result).toEqual({
      filters: {
        ...filters,
        dateAfter: undefined,
        dateBefore: undefined,
        selectedYear: 2015,
        selectedMonth: undefined,
      },
      grouping: 'month',
      anchor: { year: 2015 },
    });
  });

  it('selects a month bucket and switches to detailed day grouping', () => {
    const filters = {
      ...createFilterState(),
      personIds: ['person-1'],
      selectedYear: 2015,
    };

    const result = activateTimelineBucket(filters, {
      grouping: 'month',
      date: { year: 2015, month: 8 },
    });

    expect(result).toEqual({
      filters: {
        ...filters,
        dateAfter: undefined,
        dateBefore: undefined,
        selectedYear: 2015,
        selectedMonth: 8,
      },
      grouping: 'day',
      anchor: { year: 2015, month: 8 },
    });
  });

  it('does not turn day buckets into another drill-down mode', () => {
    const filters = createFilterState();

    expect(
      activateTimelineBucket(filters, {
        grouping: 'day',
        date: { year: 2015, month: 8, day: 23 },
      }),
    ).toBeUndefined();
  });

  it('does not activate a malformed month bucket without a month number', () => {
    const filters = createFilterState();

    expect(
      activateTimelineBucket(filters, {
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

    expect(getTimelineManagerTimeBuckets(manager)).toEqual([
      { timeBucket: '2024-02-01T00:00:00.000Z', count: 5 },
    ]);
  });
});
