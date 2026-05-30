<script lang="ts">
  import FaceCrop from '$lib/components/faces-page/face-crop.svelte';
  import { isSuggestionSnoozed, snoozeSuggestions } from '$lib/utils/face-suggestion-snooze';
  import type { PersonFaceSuggestionResponseDto, PersonResponseDto } from '@immich/sdk';
  import { Button } from '@immich/ui';
  import { mdiAccountQuestionOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    person: PersonResponseDto;
    total: number;
    previews: PersonFaceSuggestionResponseDto[];
    referenceThumbnailUrl: string;
    onReview: () => void;
  }

  let { person, total, previews, referenceThumbnailUrl, onReview }: Props = $props();

  let snoozeTick = $state(0);
  const visible = $derived.by(() => {
    if (snoozeTick < 0) {
      return false;
    }
    return total > 0 && !isSuggestionSnoozed(person.id, total);
  });
  const shownPreviews = $derived(previews.slice(0, 5));

  const title = $derived(
    person.name
      ? $t('face_suggestion_banner_title', { values: { name: person.name } })
      : $t('face_suggestion_banner_title_unnamed'),
  );

  const snooze = () => {
    snoozeSuggestions(person.id, total);
    snoozeTick++;
  };
</script>

{#if visible}
  <!--
    Content-sized card: `w-fit` shrink-wraps to the widest row (the crop strip)
    instead of stretching full-width, capped at the viewport so it never
    overflows once the margins are accounted for.
  -->
  <div
    data-testid="person-suggestion-banner"
    class="suggestion-card mx-4 my-3 flex w-fit max-w-[calc(100%-2rem)] flex-col gap-3 self-start rounded-2xl border border-gray-200 bg-light p-3.5 sm:mx-6 sm:max-w-[calc(100%-3rem)] dark:border-gray-700"
  >
    <div class="flex items-center gap-2.5">
      <img
        data-testid="suggestion-banner-reference"
        src={referenceThumbnailUrl}
        alt={person.name || $t('face_suggestion_reference')}
        class="size-9 shrink-0 rounded-full object-cover ring-2 ring-primary/15"
      />
      <div class="min-w-0">
        <p class="truncate text-sm font-medium leading-snug text-primary">{title}</p>
        <p class="truncate text-xs leading-snug text-gray-500 dark:text-gray-400">
          {$t('face_suggestion_count', { values: { count: total } })}
        </p>
      </div>
    </div>

    <div class="flex flex-wrap gap-1.5">
      {#each shownPreviews as item (item.assetFaceId)}
        <div class="w-12">
          <FaceCrop face={item} label={$t('face_suggestion_candidate')} />
        </div>
      {/each}
      {#if total > shownPreviews.length}
        <div
          class="flex aspect-square w-12 items-center justify-center rounded-lg bg-gray-100 text-xs font-medium tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-300"
          aria-hidden="true"
        >
          +{total - shownPreviews.length}
        </div>
      {/if}
    </div>

    <div class="flex justify-center gap-2">
      <Button
        size="small"
        shape="round"
        leadingIcon={mdiAccountQuestionOutline}
        data-testid="suggestion-review-btn"
        onclick={onReview}
      >
        {$t('face_suggestion_review')}
      </Button>
      <Button size="small" shape="round" color="secondary" data-testid="suggestion-snooze-btn" onclick={snooze}>
        {$t('face_suggestion_not_now')}
      </Button>
    </div>
  </div>
{/if}

<style>
  /* One-shot entrance (CSS only — a Svelte transition would keep the node
     mounted during snooze-out and break the "Not now hides the banner" test). */
  .suggestion-card {
    animation: suggestion-card-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes suggestion-card-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .suggestion-card {
      animation: none;
    }
  }
</style>
