<script lang="ts">
  // Snippet props can't be supplied from a plain props object in @testing-library/svelte, so this wrapper
  // supplies `summary` and `apply` and forwards everything else verbatim. Same convention as
  // src/lib/components/people/person-tile.test-wrapper.svelte.
  import FaceReviewDock from './FaceReviewDock.svelte';

  const props: Record<string, unknown> = $props();
</script>

<FaceReviewDock {...props}>
  {#snippet summary()}
    <div data-testid="harness-summary">summary</div>
  {/snippet}
  {#snippet apply()}
    <div data-testid="harness-apply">apply</div>
  {/snippet}
</FaceReviewDock>
