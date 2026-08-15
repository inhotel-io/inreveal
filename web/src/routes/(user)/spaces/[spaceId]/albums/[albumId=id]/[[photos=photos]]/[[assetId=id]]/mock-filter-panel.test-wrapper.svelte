<script lang="ts">
  import {
    createFilterState,
    type FilterPanelConfig,
    type FilterState,
  } from '$lib/components/filter-panel/filter-panel';

  interface Props {
    config: FilterPanelConfig;
    filters?: FilterState;
    hidden?: boolean;
    timeBuckets?: unknown;
    storageKey?: string;
    personNames?: Map<string, string>;
    tagNames?: Map<string, string>;
    onFiltersChange?: (filters: FilterState) => void;
  }

  // `filters` is two-way bound by the page; the buttons below let tests activate filters.
  let { filters = $bindable(createFilterState()), hidden = false, onFiltersChange, ...rest }: Props = $props();
  void rest;

  // The real panel funnels EVERY control through `updateFilters`, which sets the bound value and
  // then fires `onFiltersChange` (filter-panel.svelte). Mutating the binding alone would let a page
  // that never wires the callback — and so never writes its filters to the URL — pass.
  function updateFilters(nextFilters: FilterState) {
    filters = nextFilters;
    onFiltersChange?.(nextFilters);
  }
</script>

<div data-testid="filter-panel" data-hidden={String(hidden)}>
  <button
    type="button"
    data-testid="filter-panel-add-person"
    onclick={() => updateFilters({ ...filters, personIds: ['person-1'] })}
  >
    add person filter
  </button>
  <button
    type="button"
    data-testid="filter-panel-add-year"
    onclick={() => updateFilters({ ...filters, selectedYear: 2025 })}
  >
    add year filter
  </button>
</div>
