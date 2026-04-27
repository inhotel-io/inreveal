<script lang="ts" generics="T extends { id: string }">
  import type { Snippet } from 'svelte';
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    items: T[];
    class?: string;
    hasNextPage?: boolean;
    loading?: boolean;
    loadNextPage: () => void;
    children?: Snippet<[T, number]>;
  }

  let {
    items,
    class: className = 'w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-10 gap-1',
    hasNextPage = false,
    loading = false,
    loadNextPage,
    children,
  }: Props = $props();
  let sentinel: HTMLElement | undefined = $state();

  const intersectionObserver = new IntersectionObserver((entries) => {
    const entry = entries.find((entry) => entry.target === sentinel);
    if (entry?.isIntersecting && hasNextPage && !loading) {
      loadNextPage();
    }
  });

  $effect(() => {
    if (sentinel) {
      intersectionObserver.disconnect();
      intersectionObserver.observe(sentinel);
    }
  });

  onDestroy(() => {
    intersectionObserver.disconnect();
  });
</script>

<div class={className}>
  {#each items as item, index (item.id)}
    {@render children?.(item, index)}
  {/each}
</div>

{#if hasNextPage}
  <div bind:this={sentinel} class="flex h-8 w-full items-center justify-center">
    {#if loading}
      <span class="text-sm text-gray-500">{$t('loading')}</span>
    {/if}
  </div>
{/if}
