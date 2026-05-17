<script lang="ts">
  import { t } from 'svelte-i18n';
  import type { OperationReviewItem } from './agent-operation-plan-ui';
  import AgentPlanInlineFieldEditor from './agent-plan-inline-field-editor.svelte';
  import AgentPlanItemReview from './agent-plan-item-review.svelte';
  import AgentPlanTechnicalDetails from './agent-plan-technical-details.svelte';

  interface Props {
    item: OperationReviewItem;
    canChangeSelection: boolean;
    onToggleOperation: (operationId: string, checked: boolean) => void;
    onToggleItem: (operationId: string, assetId: string, selected: boolean) => void;
    onBulkSetItems: (operationId: string, assetIds: string[], selected: boolean) => void;
    onSetOnlyItems: (operationId: string, assetIds: string[]) => void;
    onResetItemSelection: (operationId: string) => void;
    onSetFieldOverride?: (operationId: string, fieldKey: string, value: string | undefined) => void;
    onResetFieldOverride?: (operationId: string, fieldKey: string) => void;
  }

  let {
    item,
    canChangeSelection,
    onToggleOperation,
    onToggleItem,
    onBulkSetItems,
    onSetOnlyItems,
    onResetItemSelection,
    onSetFieldOverride = () => {},
    onResetFieldOverride = () => {},
  }: Props = $props();
  let itemReviewOpen = $state(false);

  const checkboxState = $derived({
    checked: item.enabled,
    mixed: item.mixed,
  });

  const statusLabelKey = $derived.by(() => {
    if (item.applyState.kind === 'partial') {
      return 'assistant_operation_status_partial';
    }

    return `assistant_operation_status_${item.applyState.kind}`;
  });

  const setMixedCheckbox = (node: HTMLInputElement, state: { checked: boolean; mixed: boolean }) => {
    const update = ({ checked, mixed }: { checked: boolean; mixed: boolean }) => {
      node.indeterminate = mixed;
      node.setAttribute('aria-checked', mixed ? 'mixed' : String(checked));
    };

    update(state);

    return { update };
  };
</script>

<div class="flex gap-3 py-3">
  <input
    class="mt-1 size-4 shrink-0"
    type="checkbox"
    aria-label={item.review.summary}
    checked={checkboxState.checked}
    disabled={!canChangeSelection || item.blocked}
    use:setMixedCheckbox={checkboxState}
    onchange={(event) => onToggleOperation(item.id, event.currentTarget.checked)}
  />

  <div class="min-w-0 flex-1">
    <p class="font-medium leading-5">{item.review.summary}</p>

    <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
      {#if item.review.selection.totalCount > 0}
        <span>
          {#if item.review.selection.supportsItemSelection}
            {$t('assistant_operation_asset_selection_summary', {
              values: { selected: item.review.selection.selectedCount, total: item.review.selection.totalCount },
            })}
          {:else}
            {$t('assistant_operation_asset_count', { values: { count: item.review.selection.totalCount } })}
          {/if}
        </span>
      {/if}
      <span>{$t(statusLabelKey)}</span>
      {#if item.applyState.kind === 'partial'}
        <span>
          {$t('assistant_operation_partial_asset_summary', {
            values: { applied: item.applyState.appliedAssetCount, failed: item.applyState.failedAssetCount },
          })}
        </span>
      {:else if item.applyState.kind === 'skipped' && item.applyState.reason}
        <span>{$t('assistant_operation_skipped_reason', { values: { reason: item.applyState.reason } })}</span>
      {/if}
    </div>

    {#if item.blocked}
      <span class="mt-1 block text-sm text-amber-700 dark:text-amber-300">
        {$t('assistant_operation_blocked_by', { values: { dependencies: item.blockedBy.join(', ') } })}
      </span>
    {/if}

    <AgentPlanInlineFieldEditor {item} {canChangeSelection} {onSetFieldOverride} {onResetFieldOverride} />

    <div class="mt-2">
      <button
        type="button"
        class="text-xs font-medium text-gray-600 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-immich-primary dark:text-gray-300"
        aria-expanded={itemReviewOpen}
        onclick={() => (itemReviewOpen = !itemReviewOpen)}
      >
        {$t(itemReviewOpen ? 'assistant_operation_detail_hide' : 'assistant_operation_detail_show')}
      </button>

      {#if itemReviewOpen}
        <AgentPlanItemReview
          {item}
          {canChangeSelection}
          {onToggleItem}
          {onBulkSetItems}
          {onSetOnlyItems}
          onResetSelection={onResetItemSelection}
        />
      {/if}
    </div>

    <AgentPlanTechnicalDetails {item} expanded={itemReviewOpen} showToggle={false} />
  </div>
</div>
