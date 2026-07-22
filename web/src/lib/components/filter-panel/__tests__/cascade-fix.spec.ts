import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { FilterPanelConfig, FilterSuggestionsResponse } from '../filter-panel';
import FilterPanel from '../filter-panel.svelte';

function suggestions(overrides: Partial<FilterSuggestionsResponse> = {}): FilterSuggestionsResponse {
  return {
    countries: [],
    cameraMakes: [],
    tags: [],
    people: [],
    ratings: [],
    mediaTypes: [],
    hasUnnamedPeople: false,
    ...overrides,
  };
}

function createConfig(
  sections: FilterPanelConfig['sections'],
  response: FilterSuggestionsResponse,
  providers?: FilterPanelConfig['providers'],
): FilterPanelConfig {
  return {
    sections,
    suggestionsProvider: vi.fn().mockResolvedValue(response),
    providers,
  };
}

describe('Cascade callbacks pass parent value', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should call cities provider with the selected country', async () => {
    const citiesFn = vi.fn().mockResolvedValue(['Berlin', 'Munich']);

    render(FilterPanel, {
      props: {
        config: createConfig(['location'], suggestions({ countries: ['Germany', 'France'] }), { cities: citiesFn }),
        timeBuckets: [],
      },
    });

    // Wait for countries to load
    await waitFor(() => {
      expect(screen.getByTestId('location-country-Germany')).toBeTruthy();
    });

    // Click a country to trigger cascade fetch
    await fireEvent.click(screen.getByTestId('location-country-Germany'));

    await waitFor(() => {
      expect(citiesFn).toHaveBeenCalledWith('Germany', undefined);
    });
  });

  it('should call cameraModels provider with the selected make', async () => {
    const modelsFn = vi.fn().mockResolvedValue(['X-T5', 'X-H2']);

    render(FilterPanel, {
      props: {
        config: createConfig(['camera'], suggestions({ cameraMakes: ['Fujifilm', 'Sony'] }), {
          cameraModels: modelsFn,
        }),
        timeBuckets: [],
      },
    });

    // Wait for makes to load
    await waitFor(() => {
      expect(screen.getByTestId('camera-make-Fujifilm')).toBeTruthy();
    });

    // Click a make to trigger cascade fetch
    await fireEvent.click(screen.getByTestId('camera-make-Fujifilm'));

    await waitFor(() => {
      expect(modelsFn).toHaveBeenCalledWith('Fujifilm', undefined);
    });
  });

  it('should not call cities provider when no cities provider is configured', async () => {
    render(FilterPanel, {
      props: {
        config: createConfig(['location'], suggestions({ countries: ['Germany'] })),
        timeBuckets: [],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('location-country-Germany')).toBeTruthy();
    });

    // Click country — should not throw even without cities provider
    await fireEvent.click(screen.getByTestId('location-country-Germany'));
  });

  it('should not call cameraModels provider when no cameraModels provider is configured', async () => {
    render(FilterPanel, {
      props: {
        config: createConfig(['camera'], suggestions({ cameraMakes: ['Fujifilm'] })),
        timeBuckets: [],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('camera-make-Fujifilm')).toBeTruthy();
    });

    // Click make — should not throw even without cameraModels provider
    await fireEvent.click(screen.getByTestId('camera-make-Fujifilm'));
  });

  it('should pass different country when a different country is clicked', async () => {
    const citiesFn = vi.fn().mockResolvedValue([]);

    render(FilterPanel, {
      props: {
        config: createConfig(['location'], suggestions({ countries: ['Germany', 'France'] }), { cities: citiesFn }),
        timeBuckets: [],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('location-country-France')).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId('location-country-France'));

    await waitFor(() => {
      expect(citiesFn).toHaveBeenCalledWith('France', undefined);
    });
    expect(citiesFn).not.toHaveBeenCalledWith('Germany', undefined);
  });
});
