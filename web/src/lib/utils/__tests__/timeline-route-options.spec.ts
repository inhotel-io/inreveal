import { createFilterState } from '$lib/components/filter-panel/filter-panel';
import { buildTimelineRouteOptions } from '$lib/utils/timeline-route-options';
import { AssetVisibility } from '@immich/sdk';

describe('buildTimelineRouteOptions', () => {
  it('adds grouping without temporal bounds when no temporal filter is active', () => {
    const base = {
      visibility: AssetVisibility.Timeline,
      withStacked: true,
    };

    expect(buildTimelineRouteOptions(base, createFilterState(), 'month')).toEqual({
      visibility: AssetVisibility.Timeline,
      withStacked: true,
      grouping: 'month',
    });
  });

  it('adds selected year bounds while preserving base route filters', () => {
    const filters = { ...createFilterState(), selectedYear: 2024 };
    const base = {
      visibility: AssetVisibility.Timeline,
      withStacked: true,
      personIds: ['person-1'],
      tagIds: ['tag-1'],
    };

    expect(buildTimelineRouteOptions(base, filters, 'year')).toEqual({
      visibility: AssetVisibility.Timeline,
      withStacked: true,
      personIds: ['person-1'],
      tagIds: ['tag-1'],
      grouping: 'year',
      takenAfter: '2024-01-01T00:00:00.000Z',
      takenBefore: '2025-01-01T00:00:00.000Z',
    });
  });

  it('adds selected month bounds as an exclusive month range', () => {
    const filters = { ...createFilterState(), selectedYear: 2024, selectedMonth: 2 };
    const base = {
      visibility: AssetVisibility.Timeline,
      withStacked: true,
    };

    expect(buildTimelineRouteOptions(base, filters, 'day')).toEqual({
      visibility: AssetVisibility.Timeline,
      withStacked: true,
      grouping: 'day',
      takenAfter: '2024-02-01T00:00:00.000Z',
      takenBefore: '2024-03-01T00:00:00.000Z',
    });
  });

  it('prefers custom date ranges over selected year/month state', () => {
    const filters = {
      ...createFilterState(),
      dateAfter: '2023-05-10',
      dateBefore: '2023-05-20',
      selectedYear: 2024,
      selectedMonth: 2,
    };
    const base = {
      visibility: AssetVisibility.Timeline,
      withStacked: true,
    };

    expect(buildTimelineRouteOptions(base, filters, 'month')).toEqual({
      visibility: AssetVisibility.Timeline,
      withStacked: true,
      grouping: 'month',
      takenAfter: '2023-05-10T00:00:00.000Z',
      takenBefore: '2023-05-21T00:00:00.000Z',
    });
  });
});
