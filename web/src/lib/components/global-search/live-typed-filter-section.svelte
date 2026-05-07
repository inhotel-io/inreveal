<script lang="ts">
  import type {
    LiveTypedSearchChoice,
    LiveTypedSearchKey,
    LiveTypedSearchStatus,
  } from '$lib/utils/typed-search/typed-search-live-suggestions';
  import { Command } from 'bits-ui';
  import { t, type Translations } from 'svelte-i18n';

  interface Props {
    status: LiveTypedSearchStatus;
    onSelect: (choice: LiveTypedSearchChoice) => void;
  }
  let { status, onSelect }: Props = $props();

  const labelKey = $derived(
    status.status === 'idle'
      ? ('cmdk_filter_match_tag' as Translations)
      : (`cmdk_filter_match_${status.key}` as Translations),
  );
  const entity = $derived(status.status === 'idle' ? '' : status.key);

  function pluralEntity(key: LiveTypedSearchKey) {
    if (key === 'person') {
      return 'people';
    }
    if (key === 'country') {
      return 'countries';
    }
    if (key === 'city') {
      return 'cities';
    }
    return 'tags';
  }
</script>

{#if status.status !== 'idle'}
  <Command.Group class="mb-4" data-live-typed-filter-section data-testid="live-typed-filter-section">
    <Command.GroupHeading
      class="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
    >
      {$t(labelKey)}
    </Command.GroupHeading>
    <Command.GroupItems>
      {#if status.status === 'ok'}
        {#each status.items as choice (choice.id)}
          <Command.Item
            value={`filter:${choice.id}:${choice.label}`}
            onSelect={() => onSelect(choice)}
            onkeydown={(event) => {
              if (event.key === 'Enter') {
                onSelect(choice);
                event.preventDefault();
              }
            }}
            class="group"
          >
            <div
              class="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-[80ms] ease-out group-data-[selected]:bg-primary/10"
            >
              <span class="min-w-0 truncate">
                <span>{choice.label}</span>
                {#if choice.secondaryLabel}
                  <span class="ms-2 text-xs text-gray-500 dark:text-gray-400">{choice.secondaryLabel}</span>
                {/if}
              </span>
              <span class="shrink-0 text-xs font-medium text-primary">{$t('cmdk_filter_use_as_filter')}</span>
            </div>
          </Command.Item>
        {/each}
      {:else if status.status === 'loading'}
        <div class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          {$t('cmdk_filter_match_loading', { values: { entity } })}
        </div>
      {:else if status.status === 'empty'}
        <div class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          {$t('cmdk_filter_match_none', { values: { entity: pluralEntity(status.key) } })}
        </div>
      {:else if status.status === 'timeout'}
        <div class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          {$t('cmdk_filter_match_timeout', { values: { entity } })}
        </div>
      {:else}
        <div class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          {$t('cmdk_filter_match_error', { values: { entity } })}
        </div>
      {/if}
    </Command.GroupItems>
  </Command.Group>
{/if}
