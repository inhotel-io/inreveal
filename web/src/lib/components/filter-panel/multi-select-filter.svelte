<script lang="ts" generics="T extends { id: string; name: string }">
  import { Icon } from '@immich/ui';
  import { mdiCheck, mdiMagnify } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { Snippet } from 'svelte';

  interface Props {
    /** Prefix for every `data-testid` this list emits (`people` → `people-item-…`). */
    testId: string;
    /** Options from the latest suggestions fetch. */
    options: T[];
    /**
     * Selected entries that dropped out of `options` (e.g. narrowed away by another filter). They
     * render first, always checked and dimmed, so a selection is never silently invisible — and they
     * ignore the search box, since removing them is the only thing left to do with them.
     */
    orphaned: T[];
    selectedIds: string[];
    onToggle: (id: string) => void;
    searchPlaceholder: string;
    emptyText: string;
    /** Rendered when a search matches nothing. Omit to render nothing in that case. */
    noResultsText?: string;
    initialShowCount: number;
    /** Reset search + "show more" whenever the option list changes (used by tags). */
    resetOnOptionsChange?: boolean;
    /** Optional leading visual (people render an avatar here). */
    leading?: Snippet<[T, boolean]>;
  }

  let {
    testId,
    options,
    orphaned,
    selectedIds,
    onToggle,
    searchPlaceholder,
    emptyText,
    noResultsText,
    initialShowCount,
    resetOnOptionsChange = false,
    leading,
  }: Props = $props();

  let searchQuery = $state('');
  let showAll = $state(false);

  let previousOptionsLength = 0;
  $effect(() => {
    if (!resetOnOptionsChange) {
      return;
    }
    const currentLength = options.length;
    if (previousOptionsLength > 0 && currentLength !== previousOptionsLength) {
      searchQuery = '';
      showAll = false;
    }
    previousOptionsLength = currentLength;
  });

  let filtered = $derived(
    searchQuery.trim()
      ? options.filter((option) => option.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      : options,
  );

  // A search shows every match; only the unsearched list is truncated behind "show more".
  let visible = $derived(searchQuery.trim() || showAll ? filtered : filtered.slice(0, initialShowCount));

  let remainingCount = $derived(Math.max(0, filtered.length - initialShowCount));

  let rows = $derived([
    ...orphaned.map((item) => ({ item, isOrphaned: true })),
    ...visible.map((item) => ({ item, isOrphaned: false })),
  ]);
</script>

<div data-testid="{testId}-filter">
  {#if options.length === 0 && orphaned.length === 0}
    <p class="text-sm text-gray-400 dark:text-gray-500" data-testid="{testId}-empty">{emptyText}</p>
  {:else}
    <div class="relative mb-2">
      <div class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
        <Icon icon={mdiMagnify} size="14" />
      </div>
      <input
        type="text"
        class="immich-form-input h-8 w-full rounded-lg pl-7 pr-2 text-sm"
        placeholder={searchPlaceholder}
        bind:value={searchQuery}
        oninput={() => {
          showAll = false;
        }}
        data-testid="{testId}-search-input"
      />
    </div>

    {#each rows as { item, isOrphaned } (item.id)}
      {@const isActive = isOrphaned || selectedIds.includes(item.id)}
      <button
        type="button"
        class="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-subtle {isOrphaned
          ? 'opacity-50'
          : isActive
            ? 'font-medium'
            : 'text-gray-500 dark:text-gray-300'}"
        onclick={() => onToggle(item.id)}
        aria-pressed={isActive}
        data-testid="{testId}-item-{item.id}"
      >
        <div
          class="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded {isActive
            ? 'bg-immich-primary dark:bg-immich-dark-primary'
            : 'border border-gray-300 dark:border-gray-600'}"
        >
          {#if isActive}
            <Icon icon={mdiCheck} size="12" class="text-white dark:text-black" />
          {/if}
        </div>

        {@render leading?.(item, isOrphaned)}

        <span
          class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left {isOrphaned ? 'font-medium' : ''}"
        >
          {item.name}
        </span>
      </button>
    {/each}

    {#if noResultsText && filtered.length === 0 && searchQuery.trim()}
      <p class="text-sm text-gray-400 dark:text-gray-500" data-testid="{testId}-no-results">{noResultsText}</p>
    {/if}

    {#if !showAll && remainingCount > 0 && !searchQuery.trim()}
      <button
        type="button"
        class="py-1 text-xs font-medium text-immich-primary dark:text-immich-dark-primary"
        onclick={() => (showAll = true)}
        data-testid="{testId}-show-more"
      >
        {$t('filter_show_more', { values: { count: remainingCount } })}
      </button>
    {/if}
  {/if}
</div>
