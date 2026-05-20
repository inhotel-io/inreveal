<script lang="ts">
  import Thumbhash from '$lib/components/Thumbhash.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import type { ActivatableTimelineBucket } from '$lib/utils/timeline-filter-navigation';
  import { AssetMediaSize } from '@immich/sdk';

  type TimelineBucketCardBucket = ActivatableTimelineBucket & {
    timeBucket: string;
    count: number;
    representativeAssetId?: string | null;
    representativeThumbhash?: string | null;
    representativeRatio?: number | null;
  };

  interface Props {
    bucket: TimelineBucketCardBucket;
    locale?: string;
    loading?: boolean;
    disabled?: boolean;
    onActivate: (bucket: ActivatableTimelineBucket) => void;
  }

  let { bucket, locale = 'en-US', loading = false, disabled = false, onActivate }: Props = $props();

  let loadedImageKey = $state<string>();
  let failedImageKey = $state<string>();

  let imageKey = $derived(`${bucket.representativeAssetId ?? ''}:${bucket.representativeThumbhash ?? ''}`);
  let imageLoaded = $derived(loadedImageKey === imageKey);
  let imageFailed = $derived(failedImageKey === imageKey);

  let title = $derived.by(() => {
    if (bucket.grouping === 'month') {
      return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(bucket.timeBucket),
      );
    }

    return String(bucket.date.year);
  });

  let countLabel = $derived.by(() => {
    const count = new Intl.NumberFormat(locale).format(bucket.count);
    return `${count} ${bucket.count === 1 ? 'photo' : 'photos'}`;
  });

  let hasImage = $derived(Boolean(bucket.representativeAssetId) && !loading && !imageFailed);
  let imageUrl = $derived.by(() => {
    if (!hasImage || !bucket.representativeAssetId) {
      return undefined;
    }

    return getAssetMediaUrl({
      id: bucket.representativeAssetId,
      size: AssetMediaSize.Thumbnail,
      cacheKey: bucket.representativeThumbhash ?? undefined,
    });
  });
  let state = $derived(loading ? 'loading' : hasImage ? 'image' : 'fallback');
  let mediaClass = $derived(bucket.representativeRatio ? '' : 'aspect-[16/9]');
  let mediaStyle = $derived(
    bucket.representativeRatio ? `aspect-ratio: ${bucket.representativeRatio};` : undefined,
  );

  const activate = () => {
    if (disabled) {
      return;
    }

    onActivate({ grouping: bucket.grouping, date: bucket.date });
  };

  const getEventImageKey = (event: Event) => (event.currentTarget as HTMLImageElement).dataset.imageKey;

  const handleImageLoad = (event: Event) => {
    const eventImageKey = getEventImageKey(event);
    if (eventImageKey === imageKey) {
      loadedImageKey = eventImageKey;
    }
  };

  const handleImageError = (event: Event) => {
    const eventImageKey = getEventImageKey(event);
    if (eventImageKey === imageKey) {
      failedImageKey = eventImageKey;
    }
  };
</script>

<button
  type="button"
  class="group block w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-left transition hover:border-gray-300 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800"
  aria-label={`${title}, ${countLabel}`}
  {disabled}
  data-state={state}
  data-testid="timeline-bucket-card"
  onclick={activate}
>
  <div
    class={`relative w-full overflow-hidden bg-gray-200 dark:bg-gray-800 ${mediaClass}`}
    style={mediaStyle}
    data-testid="timeline-bucket-card-media"
  >
    {#if hasImage && imageUrl}
      {#if bucket.representativeThumbhash && !imageLoaded}
        <Thumbhash
          base64ThumbHash={bucket.representativeThumbhash}
          class="absolute inset-0 h-full w-full object-cover"
          fadeOut
        />
      {/if}

      {#key imageKey}
        <img
          src={imageUrl}
          alt=""
          draggable="false"
          class="h-full w-full object-cover"
          data-testid="timeline-bucket-card-image"
          data-image-key={imageKey}
          onload={handleImageLoad}
          onerror={handleImageError}
        />
      {/key}
    {:else}
      <div
        class="flex h-full min-h-24 w-full items-center justify-center bg-gray-200 px-3 text-center text-lg font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300"
        data-testid="timeline-bucket-card-fallback"
      >
        {title}
      </div>
    {/if}
  </div>

  <div class="space-y-1 px-3 py-2">
    <div class="truncate text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
    <div class="truncate text-xs text-gray-600 dark:text-gray-300">{countLabel}</div>
  </div>
</button>
