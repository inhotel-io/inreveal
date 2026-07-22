import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { FilterPanelConfig, FilterSuggestionsResponse } from '../filter-panel';
import FilterPanel from '../filter-panel.svelte';

const defaultSuggestions: FilterSuggestionsResponse = {
  countries: ['Germany', 'France'],
  cameraMakes: ['Canon', 'Sony'],
  tags: [
    { id: 't1', name: 'Vacation' },
    { id: 't2', name: 'Family' },
  ],
  people: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ],
  ratings: [3, 4, 5],
  mediaTypes: ['IMAGE', 'VIDEO'],
  hasUnnamedPeople: false,
};

function createConfig(overrides: Partial<FilterPanelConfig> = {}): FilterPanelConfig {
  return {
    sections: ['timeline', 'people', 'location', 'camera', 'tags'],
    suggestionsProvider: vi.fn().mockResolvedValue(defaultSuggestions),
    ...overrides,
  };
}

const timeBuckets = [
  { timeBucket: '2023-06-01', count: 100 },
  { timeBucket: '2023-08-01', count: 200 },
  { timeBucket: '2024-03-01', count: 50 },
];

describe('Contextual re-fetch on temporal change', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should re-fetch suggestions with the selected year', async () => {
    const config = createConfig();
    render(FilterPanel, {
      props: { config, timeBuckets },
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(config.suggestionsProvider).toHaveBeenCalledTimes(1);

    // Click year to select 2023
    await fireEvent.click(screen.getByTestId('year-btn-2023'));

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(250);

    await waitFor(() => {
      expect(config.suggestionsProvider).toHaveBeenCalledTimes(2);
      expect(config.suggestionsProvider).toHaveBeenLastCalledWith(
        expect.objectContaining({ selectedYear: 2023, selectedMonth: undefined }),
      );
    });
  });

  it('should debounce rapid temporal changes — year then quickly month yields limited calls', async () => {
    const config = createConfig();
    render(FilterPanel, {
      props: { config, timeBuckets },
    });

    await vi.advanceTimersByTimeAsync(0);

    const initialCalls = (config.suggestionsProvider as ReturnType<typeof vi.fn>).mock.calls.length;

    // Click year — this triggers a 200ms debounce for the year context
    await fireEvent.click(screen.getByTestId('year-btn-2023'));

    // Wait for the year debounce to fire
    await vi.advanceTimersByTimeAsync(250);

    // Now click month (month grid is visible after year selection)
    await fireEvent.click(screen.getByTestId('month-btn-6'));

    // Wait for month debounce
    await vi.advanceTimersByTimeAsync(250);

    await waitFor(() => {
      const finalCalls = (config.suggestionsProvider as ReturnType<typeof vi.fn>).mock.calls.length;
      // Year triggers 1 re-fetch, month triggers another → exactly 2 extra
      expect(finalCalls - initialCalls).toBe(2);
    });
  });

  it('should NOT re-fetch while no filter changes', async () => {
    const config = createConfig();
    render(FilterPanel, {
      props: {
        config: { ...config, sections: ['people', 'rating', 'media'] },
        timeBuckets: [],
      },
    });

    await vi.advanceTimersByTimeAsync(0);

    const initialCalls = (config.suggestionsProvider as ReturnType<typeof vi.fn>).mock.calls.length;

    // Advance time — nothing changed, so no re-fetch
    await vi.advanceTimersByTimeAsync(500);

    expect((config.suggestionsProvider as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialCalls);
  });

  it('should bypass debounce on clear (immediate re-fetch with no temporal filter)', async () => {
    const config = createConfig();
    render(FilterPanel, {
      props: { config, timeBuckets },
    });

    await vi.advanceTimersByTimeAsync(0);

    // Select year first
    await fireEvent.click(screen.getByTestId('year-btn-2023'));
    await vi.advanceTimersByTimeAsync(250);

    const callsAfterYear = (config.suggestionsProvider as ReturnType<typeof vi.fn>).mock.calls.length;

    // Click "All" breadcrumb to clear temporal filter
    await fireEvent.click(screen.getByTestId('temporal-breadcrumb-all'));

    // Advance just 1ms — clear should fire immediately (delay=0)
    await vi.advanceTimersByTimeAsync(1);

    await waitFor(() => {
      const finalCalls = (config.suggestionsProvider as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(finalCalls).toBeGreaterThan(callsAfterYear);
      expect(config.suggestionsProvider).toHaveBeenLastCalledWith(
        expect.objectContaining({ selectedYear: undefined, dateAfter: undefined, dateBefore: undefined }),
      );
    });
  });

  it('should keep stale data on fetch error', async () => {
    const suggestionsProvider = vi
      .fn()
      .mockResolvedValueOnce({ ...defaultSuggestions, people: [{ id: 'p1', name: 'Alice' }] })
      .mockRejectedValueOnce(new Error('Network error'));

    const config = createConfig({ suggestionsProvider });
    render(FilterPanel, {
      props: { config, timeBuckets },
    });

    await vi.advanceTimersByTimeAsync(0);

    await waitFor(() => {
      expect(screen.getByTestId('people-item-p1')).toBeTruthy();
    });

    // Select year to trigger re-fetch (which will fail)
    await fireEvent.click(screen.getByTestId('year-btn-2023'));
    await vi.advanceTimersByTimeAsync(250);

    // Allow promise rejection to settle
    await vi.advanceTimersByTimeAsync(0);

    // Stale data should still be visible
    expect(screen.getByTestId('people-item-p1')).toBeTruthy();
  });

  it('should pass the selected month through to the suggestions provider', async () => {
    const config = createConfig();
    render(FilterPanel, {
      props: { config, timeBuckets },
    });

    await vi.advanceTimersByTimeAsync(0);

    // Select year first
    await fireEvent.click(screen.getByTestId('year-btn-2023'));
    await vi.advanceTimersByTimeAsync(250);

    // Now select month (August — month 8)
    await fireEvent.click(screen.getByTestId('month-btn-8'));
    await vi.advanceTimersByTimeAsync(250);

    await waitFor(() => {
      expect(config.suggestionsProvider).toHaveBeenLastCalledWith(
        expect.objectContaining({ selectedYear: 2023, selectedMonth: 8 }),
      );
    });
  });

  it('should re-fetch unified suggestions when custom from date changes and narrow people and tags', async () => {
    const secondSuggestions: FilterSuggestionsResponse = {
      ...defaultSuggestions,
      people: [{ id: 'p1', name: 'Alice' }],
      tags: [{ id: 't1', name: 'Vacation' }],
    };
    const suggestionsProvider = vi
      .fn()
      .mockResolvedValueOnce(defaultSuggestions)
      .mockResolvedValueOnce(secondSuggestions);
    const config: FilterPanelConfig = {
      sections: ['timeline', 'people', 'tags'],
      suggestionsProvider,
    };

    render(FilterPanel, {
      props: { config, timeBuckets },
    });

    await vi.advanceTimersByTimeAsync(0);
    await waitFor(() => {
      expect(screen.getByTestId('people-item-p2')).toBeTruthy();
      expect(screen.getByTestId('tags-item-t2')).toBeTruthy();
    });

    await fireEvent.input(screen.getByTestId('custom-date-from-input'), { target: { value: '2024-01-01' } });
    await vi.advanceTimersByTimeAsync(200);

    await waitFor(() => {
      expect(suggestionsProvider).toHaveBeenCalledTimes(2);
      expect(suggestionsProvider).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dateAfter: '2024-01-01',
          dateBefore: undefined,
          selectedYear: undefined,
          selectedMonth: undefined,
        }),
      );
      expect(screen.getByTestId('people-item-p1')).toBeTruthy();
      expect(screen.queryByTestId('people-item-p2')).toBeNull();
      expect(screen.getByTestId('tags-item-t1')).toBeTruthy();
      expect(screen.queryByTestId('tags-item-t2')).toBeNull();
    });
  });

  it('should clear selected year when custom from date changes', async () => {
    const config = createConfig();
    render(FilterPanel, {
      props: { config, timeBuckets },
    });

    await vi.advanceTimersByTimeAsync(0);
    await fireEvent.click(screen.getByTestId('year-btn-2023'));
    await vi.advanceTimersByTimeAsync(250);
    expect(screen.getByTestId('month-grid')).toBeTruthy();

    await fireEvent.input(screen.getByTestId('custom-date-from-input'), { target: { value: '2024-01-01' } });
    await vi.advanceTimersByTimeAsync(250);

    await waitFor(() => {
      expect(screen.queryByTestId('month-grid')).toBeNull();
      expect(screen.getByTestId('year-grid')).toBeTruthy();
      expect(config.suggestionsProvider).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateAfter: '2024-01-01', selectedYear: undefined, selectedMonth: undefined }),
      );
    });
  });

  it('should clear selected year and month when custom to date changes', async () => {
    const config = createConfig();
    render(FilterPanel, {
      props: { config, timeBuckets },
    });

    await vi.advanceTimersByTimeAsync(0);
    await fireEvent.click(screen.getByTestId('year-btn-2023'));
    await vi.advanceTimersByTimeAsync(250);
    await fireEvent.click(screen.getByTestId('month-btn-8'));
    await vi.advanceTimersByTimeAsync(250);
    expect(screen.getByTestId('month-grid')).toBeTruthy();

    await fireEvent.input(screen.getByTestId('custom-date-to-input'), { target: { value: '2024-12-31' } });
    await vi.advanceTimersByTimeAsync(250);

    await waitFor(() => {
      expect(screen.queryByTestId('month-grid')).toBeNull();
      expect(screen.getByTestId('year-grid')).toBeTruthy();
      expect(config.suggestionsProvider).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateBefore: '2024-12-31', selectedYear: undefined, selectedMonth: undefined }),
      );
    });
  });

  it('should clear custom dates when selecting a year', async () => {
    const config = createConfig();
    render(FilterPanel, {
      props: { config, timeBuckets },
    });

    await vi.advanceTimersByTimeAsync(0);
    await fireEvent.input(screen.getByTestId('custom-date-from-input'), { target: { value: '2024-01-01' } });
    await fireEvent.input(screen.getByTestId('custom-date-to-input'), { target: { value: '2024-12-31' } });
    await vi.advanceTimersByTimeAsync(250);

    await fireEvent.click(screen.getByTestId('year-btn-2023'));
    await vi.advanceTimersByTimeAsync(250);

    await waitFor(() => {
      expect(screen.getByTestId('custom-date-from-input')).toHaveValue('');
      expect(screen.getByTestId('custom-date-to-input')).toHaveValue('');
      expect(config.suggestionsProvider).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateAfter: undefined, dateBefore: undefined, selectedYear: 2023 }),
      );
    });
  });

  it('should clear custom dates when selecting a month', async () => {
    const config = createConfig();
    render(FilterPanel, {
      props: {
        config,
        timeBuckets,
        filters: {
          personIds: [],
          tagIds: [],
          mediaType: 'all',
          sortOrder: 'desc',
          dateAfter: '2024-01-01',
          dateBefore: '2024-12-31',
          selectedYear: 2023,
        },
      },
    });

    await vi.advanceTimersByTimeAsync(0);
    await fireEvent.click(screen.getByTestId('month-btn-8'));
    await vi.advanceTimersByTimeAsync(250);

    await waitFor(() => {
      expect(screen.getByTestId('custom-date-from-input')).toHaveValue('');
      expect(screen.getByTestId('custom-date-to-input')).toHaveValue('');
      expect(config.suggestionsProvider).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dateAfter: undefined,
          dateBefore: undefined,
          selectedYear: 2023,
          selectedMonth: 8,
        }),
      );
    });
  });

  it('should pass custom from date context to dependent city and camera model providers', async () => {
    const cities = vi.fn().mockResolvedValue(['Berlin']);
    const cameraModels = vi.fn().mockResolvedValue(['EOS R5']);
    const config = createConfig({ providers: { cities, cameraModels } });
    render(FilterPanel, {
      props: { config, timeBuckets },
    });

    await vi.advanceTimersByTimeAsync(0);
    await fireEvent.input(screen.getByTestId('custom-date-from-input'), { target: { value: '2024-01-01' } });
    await vi.advanceTimersByTimeAsync(250);

    await fireEvent.click(screen.getByTestId('location-country-Germany'));
    await fireEvent.click(screen.getByTestId('camera-make-Canon'));

    await waitFor(() => {
      expect(cities).toHaveBeenLastCalledWith('Germany', {
        takenAfter: '2024-01-01T00:00:00.000Z',
      });
      expect(cameraModels).toHaveBeenLastCalledWith('Canon', {
        takenAfter: '2024-01-01T00:00:00.000Z',
      });
    });
  });

  it('should keep rating and media controls stable after custom date changes', async () => {
    const secondSuggestions: FilterSuggestionsResponse = {
      ...defaultSuggestions,
      ratings: [5],
      mediaTypes: ['IMAGE'],
    };
    const suggestionsProvider = vi
      .fn()
      .mockResolvedValueOnce(defaultSuggestions)
      .mockResolvedValueOnce(secondSuggestions);
    const config: FilterPanelConfig = {
      sections: ['timeline', 'rating', 'media'],
      suggestionsProvider,
    };

    render(FilterPanel, {
      props: { config, timeBuckets },
    });

    await vi.advanceTimersByTimeAsync(0);
    await waitFor(() => {
      expect(screen.getByTestId('rating-star-1')).toBeTruthy();
      expect(screen.getByTestId('media-type-video')).toBeTruthy();
    });

    await fireEvent.input(screen.getByTestId('custom-date-from-input'), { target: { value: '2024-01-01' } });
    await vi.advanceTimersByTimeAsync(200);

    await waitFor(() => {
      expect(suggestionsProvider).toHaveBeenCalledTimes(2);
      for (const star of [1, 2, 3, 4, 5]) {
        expect(screen.getByTestId(`rating-star-${star}`)).toBeTruthy();
      }
      expect(screen.getByTestId('media-type-image')).toBeTruthy();
      expect(screen.getByTestId('media-type-video')).toBeTruthy();
    });
  });
});
