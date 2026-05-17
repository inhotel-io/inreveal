<script lang="ts">
  import { Button } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import type { OperationReviewImpactSummary } from './agent-operation-plan-ui';

  interface Props {
    impact: OperationReviewImpactSummary;
    selectedOperationIds: string[];
    canApply: boolean;
    applying: boolean;
    onApply: () => void;
  }

  let { impact, selectedOperationIds, canApply, applying, onApply }: Props = $props();
</script>

<div
  class="sticky bottom-0 -mx-4 mt-1 flex flex-col gap-3 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-immich-dark-gray sm:flex-row sm:items-center sm:justify-between"
  data-testid="agent-operation-plan-sticky-actions"
  role="region"
  aria-label={$t('assistant_operation_apply_bar_label')}
  aria-describedby="assistant-operation-apply-summary"
>
  <div id="assistant-operation-apply-summary" class="text-sm font-medium text-gray-600 dark:text-gray-300">
    {$t('assistant_operation_apply_summary', {
      values: { changes: impact.selectedOperationCount, assets: impact.selectedAssetCount },
    })}
  </div>
  <Button type="button" disabled={!canApply} onclick={onApply}>
    {applying
      ? $t('assistant_operation_apply_applying')
      : $t('assistant_operation_apply_selected', { values: { count: selectedOperationIds.length } })}
  </Button>
</div>
