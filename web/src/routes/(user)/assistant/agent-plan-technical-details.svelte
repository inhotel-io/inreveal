<script lang="ts">
  import { t } from 'svelte-i18n';
  import {
    buildOperationTechnicalDetails,
    type OperationReviewItem,
    type OperationTechnicalDetails,
  } from './agent-operation-plan-ui';

  interface Props {
    item: OperationReviewItem;
    expanded?: boolean;
    showToggle?: boolean;
  }

  let { item, expanded = false, showToggle = true }: Props = $props();
  let internalOpen = $state(false);
  const details = $derived(buildOperationTechnicalDetails(item));
  const detailsId = $derived(`operation-technical-details-${item.id}`);
  const open = $derived(showToggle ? internalOpen : expanded);

  const sanitizeError = (error: string | undefined) => error?.split('\n')[0]?.trim();

  const statusLabelKey = (reviewItem: OperationReviewItem) => {
    if (reviewItem.applyState.kind === 'partial') {
      return 'assistant_operation_status_partial';
    }

    return `assistant_operation_status_${reviewItem.applyState.kind}`;
  };

  const resultAssetOverflowCount = $derived(details.resultAssetOverflowCount ?? 0);
</script>

<div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
  {#if showToggle}
    <button
      type="button"
      class="text-left font-medium text-gray-600 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-immich-primary dark:text-gray-300"
      aria-expanded={open}
      aria-controls={detailsId}
      onclick={() => (internalOpen = !internalOpen)}
    >
      {$t(open ? 'assistant_operation_detail_hide' : 'assistant_operation_detail_show')}
    </button>
  {/if}

  {#if open}
    <div id={detailsId} class="mt-2 grid gap-3">
      <dl class="grid gap-1 sm:grid-cols-[max-content_1fr]">
        <dt class="font-medium">{$t('assistant_operation_detail_type')}</dt>
        <dd>{$t(item.typeLabelKey)}</dd>
        <dt class="font-medium">{$t('assistant_operation_detail_risk')}</dt>
        <dd>{$t(item.riskLabelKey)}</dd>
        <dt class="font-medium">{$t('assistant_operation_detail_status')}</dt>
        <dd>{$t(statusLabelKey(item))}</dd>
        <dt class="font-medium">{$t('assistant_operation_detail_id')}</dt>
        <dd class="break-all">{details.operationId}</dd>
        {#if sanitizeError(details.error)}
          <dt class="font-medium">{$t('error')}</dt>
          <dd>{sanitizeError(details.error)}</dd>
        {/if}
      </dl>

      {#if details.assetIdPreview.length > 0}
        <div>
          <p class="font-medium">{$t('assistant_operation_detail_assets_preview')}</p>
          <ul class="mt-1 grid gap-1">
            {#each details.assetIdPreview as assetId}
              <li class="break-all">{assetId}</li>
            {/each}
          </ul>
          {#if details.assetOverflowCount}
            <p class="mt-1">
              {$t('assistant_operation_detail_assets_overflow', { values: { count: details.assetOverflowCount } })}
            </p>
          {/if}
        </div>
      {/if}

      {#if details.resultAssetIdPreview}
        <div>
          <p class="font-medium">{$t('assistant_operation_detail_assets_preview')}</p>
          <ul class="mt-1 grid gap-1">
            {#each details.resultAssetIdPreview as assetId}
              <li class="break-all">{assetId}</li>
            {/each}
          </ul>
          {#if resultAssetOverflowCount}
            <p class="mt-1">
              {$t('assistant_operation_detail_assets_overflow', { values: { count: resultAssetOverflowCount } })}
            </p>
          {/if}
        </div>
      {/if}

      {#if details.resultAssetResultsPreview}
        <div>
          <p class="font-medium">{$t('assistant_operation_detail_assets_preview')}</p>
          <ul class="mt-1 grid gap-1">
            {#each details.resultAssetResultsPreview as result}
              <li class="break-all">
                {result.id}
                <span
                  >{result.success
                    ? $t('assistant_operation_status_applied')
                    : $t('assistant_operation_status_failed')}</span
                >
              </li>
            {/each}
          </ul>
          {#if details.resultAssetResultsOverflowCount}
            <p class="mt-1">
              {$t('assistant_operation_detail_assets_overflow', {
                values: { count: details.resultAssetResultsOverflowCount },
              })}
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
