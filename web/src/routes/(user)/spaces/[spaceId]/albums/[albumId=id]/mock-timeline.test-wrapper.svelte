<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    options?: Record<string, unknown>;
    enableRouting?: boolean;
    isSelectionMode?: boolean;
    singleSelect?: boolean;
    assetInteraction?: unknown;
    empty?: Snippet;
  }

  let {
    options = {},
    enableRouting = false,
    isSelectionMode = false,
    singleSelect = false,
    assetInteraction,
    empty,
  }: Props = $props();

  const serializedOptions = $derived(JSON.stringify(options));
  // Detect which mode the page is in from the options shape
  const derivedMode = $derived('timelineAlbumId' in options ? 'add' : 'browse');
</script>

<div
  data-testid="space-album-timeline"
  data-enable-routing={String(enableRouting)}
  data-has-asset-interaction={String(assetInteraction !== undefined)}
  data-is-selection-mode={String(isSelectionMode)}
  data-single-select={String(singleSelect)}
  data-mode={derivedMode}
>
  <div data-testid="timeline-options">{serializedOptions}</div>
  {@render empty?.()}
</div>
