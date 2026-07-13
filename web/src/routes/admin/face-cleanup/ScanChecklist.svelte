<script lang="ts">
  import { Button, Icon } from '@immich/ui';
  import { mdiArrowRight, mdiCheckCircle } from '@mdi/js';
  import { t } from 'svelte-i18n';

  // The post-scan console is dense — five stat cards, four filters, a search box, a pre-selected bulk bar and a
  // grouped table — and says nothing about what the admin is meant to DO. This is that guidance, and because it
  // reads real scan state (not a static blurb) it doubles as progress: how many still need a decision, how many
  // are already selected, what the commit will actually touch. Step 2 is also the ONLY place the page admits
  // that the confident clusters come pre-selected, which is what makes its biggest button a 90-person action.
  //
  // Pure presentation: every number is a prop, nothing is fetched, no model is mutated (see the design doc,
  // docs/superpowers/specs/2026-07-13-face-cleanup-scan-checklist-design.md).
  type Props = {
    reviewFirstTotal: number;
    reviewFirstOpened: number;
    confidentTotal: number;
    selectedCount: number;
    onReviewFirst: () => void;
  };
  const { reviewFirstTotal, reviewFirstOpened, confidentTotal, selectedCount, onReviewFirst }: Props = $props();

  // Done when every review-first cluster has been opened — or when the scan flagged none for review at all.
  const reviewDone = $derived(reviewFirstOpened >= reviewFirstTotal);
  const confidentInactive = $derived(confidentTotal === 0);
  const applyInactive = $derived(selectedCount === 0);
</script>

<div class="rounded-2xl border border-gray-200 p-4 dark:border-gray-700" data-testid="scan-checklist">
  <h2 class="text-sm font-semibold">{$t('admin.face_cleanup_steps_title')}</h2>
  <p class="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
    {$t('admin.face_cleanup_steps_subtitle')}
  </p>

  <ol class="mt-4 flex flex-col gap-3">
    <!-- ① the clusters the scan could not decide on its own -->
    <li class="flex items-start gap-3" data-testid="step-review" data-done={reviewDone}>
      {#if reviewDone}
        <span class="mt-0.5 flex-none text-green-600 dark:text-green-500">
          <Icon icon={mdiCheckCircle} size="18" />
        </span>
      {:else}
        <span
          class="mt-0.5 flex size-[18px] flex-none items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white"
        >
          1
        </span>
      {/if}
      <div class="flex-1">
        {#if reviewDone}
          <p class="text-sm font-semibold text-gray-500 dark:text-gray-400">
            {$t('admin.face_cleanup_steps_review_done')}
          </p>
        {:else}
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p class="text-sm font-semibold">
              {$t('admin.face_cleanup_steps_review_title', { values: { count: reviewFirstTotal } })}
            </p>
            <span class="text-xs font-semibold text-gray-400" data-testid="step-review-progress">
              {$t('admin.face_cleanup_steps_review_progress', {
                values: { opened: reviewFirstOpened, total: reviewFirstTotal },
              })}
            </span>
            <Button
              color="secondary"
              size="tiny"
              variant="outline"
              shape="round"
              onclick={onReviewFirst}
              data-testid="step-review-cta"
            >
              {$t('admin.face_cleanup_steps_review_cta')}
              <Icon icon={mdiArrowRight} size="14" />
            </Button>
          </div>
          <p class="mt-0.5 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            {$t('admin.face_cleanup_steps_review_body')}
          </p>
        {/if}
      </div>
    </li>

    <!-- ② the pre-selection the page never mentions -->
    <li class="flex items-start gap-3" data-testid="step-confident" data-inactive={confidentInactive}>
      <span
        class={[
          'mt-0.5 flex size-[18px] flex-none items-center justify-center rounded-full text-[11px] font-bold text-white',
          confidentInactive ? 'bg-gray-300 dark:bg-gray-600' : 'bg-green-600',
        ].join(' ')}
      >
        2
      </span>
      <div class="flex-1">
        {#if confidentInactive}
          <p class="text-sm font-semibold text-gray-500 dark:text-gray-400">
            {$t('admin.face_cleanup_steps_confident_none')}
          </p>
        {:else}
          <p class="text-sm font-semibold">
            {$t('admin.face_cleanup_steps_confident_title', { values: { count: confidentTotal } })}
          </p>
          <p class="mt-0.5 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            {$t('admin.face_cleanup_steps_confident_body')}
          </p>
        {/if}
      </div>
    </li>

    <!-- ③ the commit -->
    <li class="flex items-start gap-3" data-testid="step-apply" data-inactive={applyInactive}>
      <span
        class={[
          'mt-0.5 flex size-[18px] flex-none items-center justify-center rounded-full text-[11px] font-bold text-white',
          applyInactive ? 'bg-gray-300 dark:bg-gray-600' : 'bg-primary',
        ].join(' ')}
      >
        3
      </span>
      <div class="flex-1">
        {#if applyInactive}
          <p class="text-sm font-semibold text-gray-500 dark:text-gray-400">
            {$t('admin.face_cleanup_steps_apply_none')}
          </p>
        {:else}
          <p class="text-sm font-semibold">
            {$t('admin.face_cleanup_steps_apply_title', { values: { count: selectedCount } })}
          </p>
          <p class="mt-0.5 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            {$t('admin.face_cleanup_steps_apply_body')}
          </p>
        {/if}
      </div>
    </li>
  </ol>
</div>
