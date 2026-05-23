<script lang="ts">
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import { buildAgentPlanThumbnailStrip, type OperationReviewGroup } from './agent-operation-plan-ui';

  interface Props {
    group: OperationReviewGroup;
    variant?: 'strip' | 'mosaic' | 'compact';
    maxVisible?: number;
  }

  let { group, variant = 'strip', maxVisible }: Props = $props();
  let failedAssetIds = $state(new Set<string>());

  const strip = $derived(buildAgentPlanThumbnailStrip(group, maxVisible));
  const wrapperClass = $derived(
    variant === 'mosaic' ? 'grid grid-cols-3 gap-2 sm:grid-cols-4' : 'flex flex-wrap gap-1.5',
  );
  const tileBaseClass =
    'relative overflow-hidden border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800';
  const tileClass = (index: number) => {
    if (variant === 'mosaic') {
      return `${tileBaseClass} aspect-square rounded-lg ${index === 0 ? 'sm:col-span-2 sm:row-span-2' : ''}`;
    }

    if (variant === 'compact') {
      return `${tileBaseClass} size-10 rounded`;
    }

    return `${tileBaseClass} size-14 rounded-md`;
  };
  const overflowClass = $derived(
    variant === 'mosaic'
      ? 'flex aspect-square items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-sm font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
      : variant === 'compact'
        ? 'flex size-10 items-center justify-center rounded border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
        : 'flex size-14 items-center justify-center rounded-md border border-gray-200 bg-gray-100 text-sm font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
  );

  const markFailed = (assetId: string) => {
    if (failedAssetIds.has(assetId)) {
      return;
    }

    failedAssetIds = new Set([...failedAssetIds, assetId]);
  };
</script>

{#if strip.totalCount > 0}
  <div
    class="mt-4"
    data-testid="agent-plan-thumbnail-strip"
    aria-label={$t('assistant_operation_thumbnail_strip_label', { values: { count: strip.totalCount } })}
  >
    {#if strip.hasThumbnails}
      <div class={wrapperClass}>
        {#each strip.assetIds as assetId, index (assetId)}
          <figure class={tileClass(index)} data-testid="agent-plan-thumbnail-tile">
            <img
              class="size-full object-cover"
              data-testid="agent-plan-thumbnail-image"
              src={getAssetMediaUrl({ id: assetId, size: AssetMediaSize.Thumbnail })}
              alt={$t('assistant_operation_thumbnail_alt', {
                values: { index: index + 1, count: strip.totalCount },
              })}
              loading="lazy"
              draggable="false"
              onerror={() => markFailed(assetId)}
            />
            {#if failedAssetIds.has(assetId)}
              <span
                class="absolute inset-0 flex items-center justify-center bg-gray-200 px-1 text-center text-[10px] leading-tight text-gray-600 dark:bg-gray-800 dark:text-gray-300"
              >
                {$t('assistant_operation_thumbnail_unavailable')}
              </span>
            {/if}
          </figure>
        {/each}

        {#if strip.hasMore}
          <div
            class={overflowClass}
            aria-label={$t('assistant_operation_thumbnail_overflow_label', {
              values: { count: strip.overflowCount },
            })}
          >
            {$t('assistant_operation_thumbnail_overflow', { values: { count: strip.overflowCount } })}
          </div>
        {/if}
      </div>
    {:else}
      <p class="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        {$t('assistant_operation_thumbnail_empty', { values: { count: strip.totalCount } })}
      </p>
    {/if}
  </div>
{/if}
