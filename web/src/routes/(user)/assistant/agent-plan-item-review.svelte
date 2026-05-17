<script lang="ts">
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import {
    buildAgentPlanItemReviewAssetIds,
    isAssetSelectedForOperation,
    type OperationReviewItem,
  } from './agent-operation-plan-ui';

  interface Props {
    item: OperationReviewItem;
    canChangeSelection: boolean;
    onToggleItem: (operationId: string, assetId: string, selected: boolean) => void;
    onResetSelection: (operationId: string) => void;
  }

  let { item, canChangeSelection, onToggleItem, onResetSelection }: Props = $props();
  let failedAssetIds = $state(new Set<string>());

  const visibleAssetIds = $derived(buildAgentPlanItemReviewAssetIds(item));
  const overflowCount = $derived(Math.max(item.review.selection.totalCount - visibleAssetIds.length, 0));

  const markFailed = (assetId: string) => {
    if (failedAssetIds.has(assetId)) {
      return;
    }

    failedAssetIds = new Set([...failedAssetIds, assetId]);
  };
</script>

{#if item.review.selection.supportsItemSelection}
  <section
    class="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40"
    role="group"
    aria-label={$t('assistant_operation_item_review_label', { values: { summary: item.review.summary } })}
  >
    <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-300">
      <div class="flex flex-wrap gap-2">
        <span>
          {$t('assistant_operation_item_selected_count', {
            values: { selected: item.review.selection.selectedCount, total: item.review.selection.totalCount },
          })}
        </span>
        {#if item.excludedAssetCount > 0}
          <span>
            {$t('assistant_operation_item_excluded_count', { values: { count: item.excludedAssetCount } })}
          </span>
        {/if}
      </div>

      {#if item.review.selection.mode !== 'all'}
        <button
          type="button"
          class="rounded-md px-2 py-1 text-sm font-medium text-immich-primary hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-immich-dark-primary dark:hover:bg-gray-800"
          disabled={!canChangeSelection}
          onclick={() => onResetSelection(item.id)}
        >
          {$t('assistant_operation_item_reset')}
        </button>
      {/if}
    </div>

    <div class="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
      {#each visibleAssetIds as assetId, index (assetId)}
        {@const selected = isAssetSelectedForOperation(item, assetId)}
        <label
          class="group relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
        >
          <img
            class="size-full object-cover opacity-100"
            class:opacity-40={!selected}
            data-testid="agent-plan-item-review-image"
            src={getAssetMediaUrl({ id: assetId, size: AssetMediaSize.Thumbnail })}
            alt={$t('assistant_operation_item_thumbnail_alt', {
              values: { index: index + 1, count: item.review.selection.totalCount },
            })}
            loading="lazy"
            draggable="false"
            onerror={() => markFailed(assetId)}
          />
          {#if failedAssetIds.has(assetId)}
            <span
              class="absolute inset-0 flex items-center justify-center bg-gray-200 px-1 text-center text-[10px] leading-tight text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            >
              {$t('assistant_operation_item_thumbnail_unavailable')}
            </span>
          {/if}
          <input
            class="absolute left-1.5 top-1.5 size-4"
            type="checkbox"
            aria-label={$t('assistant_operation_item_toggle', { values: { index: index + 1 } })}
            checked={selected}
            disabled={!canChangeSelection}
            onchange={(event) => onToggleItem(item.id, assetId, event.currentTarget.checked)}
          />
        </label>
      {/each}

      {#if overflowCount > 0}
        <div
          class="flex aspect-square items-center justify-center rounded-md border border-gray-200 bg-gray-100 px-2 text-center text-sm font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          aria-label={$t('assistant_operation_item_overflow_label', { values: { count: overflowCount } })}
        >
          {$t('assistant_operation_item_overflow', { values: { count: overflowCount } })}
        </div>
      {/if}
    </div>
  </section>
{/if}
