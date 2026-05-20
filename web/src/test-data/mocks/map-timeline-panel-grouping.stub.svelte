<script lang="ts">
  import { createFilterState, type FilterState } from '$lib/components/filter-panel/filter-panel';

  interface Props {
    filters?: FilterState;
    onClose?: () => void;
    [key: string]: unknown;
  }

  let { filters = $bindable(createFilterState()), onClose, ...rest }: Props = $props();

  function activateYear() {
    filters = { ...filters, selectedYear: 2015 };
  }
</script>

<div {...rest} data-testid="map-timeline-panel-stub" data-selected-year={filters?.selectedYear ?? ''}>
  <button type="button" data-testid="map-panel-activate-year" onclick={activateYear}>Activate year</button>
  <button type="button" data-testid="map-panel-close" onclick={() => onClose?.()}>Close</button>
</div>
