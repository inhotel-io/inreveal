<script lang="ts">
  import { AgentOperationStatus } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import type { OperationReviewItem } from './agent-operation-plan-ui';

  interface Props {
    item: OperationReviewItem;
    canChangeSelection: boolean;
    onToggleOperation: (operationId: string, checked: boolean) => void;
  }

  let { item, canChangeSelection, onToggleOperation }: Props = $props();
  let detailsOpen = $state(false);
</script>

<div class="flex gap-3 py-3">
  <input
    class="mt-1 size-4 shrink-0"
    type="checkbox"
    aria-label={item.review.summary}
    checked={item.enabled}
    disabled={!canChangeSelection || item.blocked}
    onchange={(event) => onToggleOperation(item.id, event.currentTarget.checked)}
  />

  <div class="min-w-0 flex-1">
    <p class="font-medium leading-5">{item.review.summary}</p>

    <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
      {#if item.review.selection.totalCount > 0}
        <span>
          {$t('assistant_operation_asset_count', { values: { count: item.review.selection.totalCount } })}
        </span>
      {/if}
      {#if item.operation.status === AgentOperationStatus.Applied}
        <span>{$t('assistant_operation_status_applied')}</span>
      {:else if item.operation.status === AgentOperationStatus.Failed}
        <span>{$t('assistant_operation_status_failed')}</span>
      {:else if item.operation.status === AgentOperationStatus.Skipped}
        <span>{$t('assistant_operation_status_skipped')}</span>
      {/if}
    </div>

    {#if item.blocked}
      <span class="mt-1 block text-sm text-amber-700 dark:text-amber-300">
        {$t('assistant_operation_blocked_by', { values: { dependencies: item.blockedBy.join(', ') } })}
      </span>
    {/if}

    {#if item.operation.error}
      <span class="mt-1 block text-sm text-red-700 dark:text-red-300">
        {item.operation.error}
      </span>
    {/if}

    <details class="mt-2 text-xs text-gray-500 dark:text-gray-400" bind:open={detailsOpen}>
      <summary class="cursor-pointer select-none">{$t('assistant_operation_detail_toggle')}</summary>
      {#if detailsOpen}
        <dl class="mt-2 grid gap-1 sm:grid-cols-[max-content_1fr]">
          <dt class="font-medium">{$t('assistant_operation_detail_type')}</dt>
          <dd>{$t(item.typeLabelKey)}</dd>
          <dt class="font-medium">{$t('assistant_operation_detail_risk')}</dt>
          <dd>{$t(item.riskLabelKey)}</dd>
          <dt class="font-medium">{$t('assistant_operation_detail_status')}</dt>
          <dd>{item.operation.status}</dd>
          <dt class="font-medium">{$t('assistant_operation_detail_id')}</dt>
          <dd class="break-all">{item.id}</dd>
        </dl>
      {/if}
    </details>
  </div>
</div>
