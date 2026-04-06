<script lang="ts">
  interface Props {
    timelineManager?: unknown;
    children?: import('svelte').Snippet;
    [key: string]: unknown;
  }

  let { timelineManager = $bindable(), children, ...rest }: Props = $props();
</script>

<div {...rest} data-testid="timeline-stub" data-has-timeline={String(timelineManager !== undefined)}>
  {@render children?.()}
</div>
