<script lang="ts">
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import { buildAgentPlanThumbnailStrip, type OperationReviewGroup } from './agent-operation-plan-ui';

  interface Props {
    group: OperationReviewGroup;
    maxVisible?: number;
  }

  let { group, maxVisible }: Props = $props();
  let failedAssetIds = $state(new Set<string>());

  const strip = $derived(buildAgentPlanThumbnailStrip(group, maxVisible));

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
      <div class="flex flex-wrap gap-1.5">
        {#each strip.assetIds as assetId, index (assetId)}
          <figure
            class="relative size-14 overflow-hidden rounded-md border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
            data-testid="agent-plan-thumbnail-tile"
          >
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
            class="flex size-14 items-center justify-center rounded-md border border-gray-200 bg-gray-100 text-sm font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
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
