<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    href?: string;
    expanded?: boolean;
    items?: Snippet;
    class?: string;
    onclick?: () => void;
  }

  let { title, href = '#', expanded = $bindable(false), items, class: className, onclick }: Props = $props();
</script>

<a {href} data-expanded={expanded} class={className} {onclick}>{title}</a>

{#if items}
  {@render items()}
{/if}
