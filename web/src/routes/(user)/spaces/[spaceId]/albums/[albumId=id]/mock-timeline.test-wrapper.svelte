<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    options?: Record<string, unknown>;
    enableRouting?: boolean;
    assetInteraction?: unknown;
    empty?: Snippet;
  }

  let { options = {}, enableRouting = false, assetInteraction, empty }: Props = $props();

  const serializedOptions = $derived(JSON.stringify(options));
</script>

<div
  data-testid="space-album-timeline"
  data-enable-routing={String(enableRouting)}
  data-has-asset-interaction={String(assetInteraction !== undefined)}
>
  <div data-testid="timeline-options">{serializedOptions}</div>
  {@render empty?.()}
</div>
