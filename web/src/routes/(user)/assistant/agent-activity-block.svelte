<script lang="ts">
  import { t, type Translations } from 'svelte-i18n';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import type { AgentActivityVisibilityMode } from './agent-activity-visibility-ui';
  import {
    buildAgentActivityTechnicalRows,
    type AgentActivityItem,
    type AgentActivityModel,
    type AgentActivityStatus,
  } from './agent-activity-ui';

  type BlockVisibilityMode = Extract<AgentActivityVisibilityMode, 'compact' | 'expanded'>;

  interface Props {
    model: AgentActivityModel;
    compactLimit?: number;
    visibilityMode?: BlockVisibilityMode;
    onVisibilityModeChange?: (mode: BlockVisibilityMode) => void;
  }

  let { model, compactLimit = 3, visibilityMode, onVisibilityModeChange }: Props = $props();
  const rowsId = $props.id();
  let uncontrolledVisibilityMode = $state<BlockVisibilityMode>('compact');
  let expandedTechnicalRowIds = new SvelteSet<string>();

  const statusLabels: Record<AgentActivityStatus, Translations> = {
    blocked: 'assistant_activity_status_blocked',
    completed: 'assistant_activity_status_completed',
    failed: 'assistant_activity_status_failed',
    pending: 'assistant_activity_status_pending',
    running: 'assistant_activity_status_running',
    skipped: 'assistant_activity_status_skipped',
  };

  const isActive = $derived(model.activeItem !== null);
  const effectiveVisibilityMode = $derived(visibilityMode ?? uncontrolledVisibilityMode);
  const isExpanded = $derived(effectiveVisibilityMode === 'expanded');
  const heading = $derived($t(isActive ? 'assistant_activity_title' : 'assistant_activity_summary_title'));
  const compactItems = $derived(selectCompactItems(model.items, model.activeItem, compactLimit));
  const visibleItems = $derived(isExpanded ? model.items : compactItems);

  const technicalRowsByItemId = $derived.by(() => {
    const rows = new SvelteMap<string, ReturnType<typeof buildAgentActivityTechnicalRows>>();

    for (const item of model.items) {
      rows.set(item.id, buildAgentActivityTechnicalRows(item));
    }

    return rows;
  });

  function selectCompactItems(
    items: AgentActivityItem[],
    activeItem: AgentActivityItem | null,
    limit: number,
  ): AgentActivityItem[] {
    if (limit <= 0) {
      return [];
    }

    if (!activeItem || items.length <= limit) {
      return items.slice(0, limit);
    }

    const selectedIds = new SvelteSet<string>();
    const selected: AgentActivityItem[] = [];
    const addItem = (item: AgentActivityItem | undefined) => {
      if (!item || selectedIds.has(item.id) || selected.length >= limit) {
        return;
      }

      selectedIds.add(item.id);
      selected.push(item);
    };

    addItem(activeItem);

    for (let index = items.length - 1; index >= 0 && selected.length < limit; index--) {
      addItem(items[index]);
    }

    return items.filter((item) => selectedIds.has(item.id));
  }

  function toggleTechnicalRow(itemId: string) {
    if (expandedTechnicalRowIds.has(itemId)) {
      expandedTechnicalRowIds.delete(itemId);
    } else {
      expandedTechnicalRowIds.add(itemId);
    }
  }
</script>

{#if model.items.length > 0}
  <article
    data-chat-item
    class="mr-auto w-full max-w-[82%] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-slate-800 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
    aria-label={heading}
  >
    <header class="flex flex-wrap items-center justify-between gap-2">
      <div class="min-w-0">
        <p class="text-xs font-semibold text-gray-500 dark:text-gray-400">{heading}</p>
        {#if !isActive && model.summary}
          <p class="mt-1 break-words text-xs text-gray-600 dark:text-gray-300">{model.summary}</p>
        {/if}
      </div>

      <button
        type="button"
        class="shrink-0 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-immich-primary dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800"
        aria-expanded={isExpanded}
        aria-controls={rowsId}
        onclick={(event) => {
          const nextMode = isExpanded ? 'compact' : 'expanded';
          if (onVisibilityModeChange) {
            onVisibilityModeChange(nextMode);
          } else if (visibilityMode === undefined) {
            uncontrolledVisibilityMode = nextMode;
          }
          event.currentTarget.focus();
        }}
      >
        {$t(isExpanded ? 'assistant_activity_hide' : 'assistant_activity_show')}
      </button>
    </header>

    <div
      id={rowsId}
      class="mt-3 flex flex-col gap-2"
      role={isActive ? 'status' : undefined}
      aria-live={isActive ? 'polite' : undefined}
    >
      {#each visibleItems as item (item.id)}
        {@const technicalRows = technicalRowsByItemId.get(item.id) ?? []}
        {@const technicalDetailsId = `${rowsId}-${item.id}-technical`}
        {@const technicalDetailsExpanded = expandedTechnicalRowIds.has(item.id)}
        <div
          class="min-w-0 rounded-md border border-gray-100 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="rounded-full bg-gray-100 px-2 py-0.5 text-[0.7rem] font-medium text-gray-700 dark:bg-neutral-800 dark:text-gray-200"
            >
              {$t(statusLabels[item.status])}
            </span>
            {#if item.count !== undefined}
              <span class="text-[0.7rem] text-gray-500 dark:text-gray-400">
                {$t('assistant_activity_count', { values: { count: item.count } })}
              </span>
            {/if}
          </div>
          <p class="mt-1 break-words font-medium text-slate-950 dark:text-neutral-50">{item.title}</p>
          {#if item.summary}
            <p class="mt-0.5 break-words text-xs text-gray-600 dark:text-gray-300">{item.summary}</p>
          {/if}
          {#if isExpanded && technicalRows.length > 0}
            <button
              type="button"
              class="mt-2 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-immich-primary dark:border-neutral-700 dark:text-gray-200 dark:hover:bg-neutral-800"
              aria-expanded={technicalDetailsExpanded}
              aria-controls={technicalDetailsId}
              onclick={(event) => {
                toggleTechnicalRow(item.id);
                event.currentTarget.focus();
              }}
            >
              {$t(technicalDetailsExpanded ? 'assistant_activity_technical_hide' : 'assistant_activity_technical_show')}
            </button>

            {#if technicalDetailsExpanded}
              <dl
                id={technicalDetailsId}
                class="mt-2 grid gap-1 rounded-md border border-gray-100 bg-gray-50 p-2 text-xs dark:border-neutral-800 dark:bg-neutral-950"
              >
                {#each technicalRows as row (row.id)}
                  <div class="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-2">
                    <dt class="font-medium text-gray-500 dark:text-gray-400">{$t(row.labelKey)}</dt>
                    <dd class="min-w-0 break-words text-gray-700 dark:text-gray-200">{row.value}</dd>
                  </div>
                {/each}
              </dl>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  </article>
{/if}
