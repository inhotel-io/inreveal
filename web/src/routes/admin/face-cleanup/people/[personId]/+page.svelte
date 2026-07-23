<script lang="ts">
  import AdminPageLayout from '$lib/components/layouts/AdminPageLayout.svelte';
  import { Route } from '$lib/route';
  import { handleError } from '$lib/utils/handle-error';
  import { getAdminFaceThumbnailUrl } from '$lib/utils/people-utils';
  import {
    getFaceRepairClusterFaces,
    getFaceRepairPersonMetadata,
    getPeopleThumbnailPath,
    type FaceRepairPersonMetadataResponseDto,
  } from '@immich/sdk';
  import { Button, Icon } from '@immich/ui';
  import { mdiArrowLeft } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';
  import {
    createManualReviewModel,
    MANUAL_STATE_COLOR,
    MANUAL_STATE_ICON,
    type ManualFaceState,
  } from './manual-review.svelte';

  // Manual review page (Slice 8, design §6.4). This is a NEW page with its OWN view-model — reusing the
  // guided page's tile presentation, not its review model (§6.5: the guided model does not typecheck against
  // a scan-free cluster and would wipe staged decisions on every paginated append).
  //
  // THE VISUAL INVERSION IS THE POINT OF THIS PAGE. In guided every tile always carries a badge and a ribbon,
  // because every face always holds one of six terminal states. Manual defaults every face to `keep`, which
  // writes nothing — so a `keep` tile is a clean crop (no badge, no ribbon) and colour appears ONLY once the
  // admin has acted (state !== 'keep'). `keep` needs no colour token; it is signalled by absence.
  //
  // Bulk actions, Apply, and the entire-cluster move are OUT OF SCOPE here (slice 9/10) — this slice renders
  // the grid, selection (click / shift-range / select-all-loaded / clear), and server paging only. The footer
  // dock and its bulk bar are not rendered yet; there is nothing for them to summarise until marks can be
  // staged through the UI.

  type Props = { data: PageData };
  const { data }: Props = $props();

  // Read once, directly off the load data — never off navigation state — so a hard refresh or a deep link
  // resolves the same way a normal client-side navigation does (design §6.4, plan item 4).
  const personId = data.personId;

  const PAGE_SIZE = 48;

  // Created exactly ONCE, here, and never reassigned. This is what makes appendFaces safe: a `$derived` that
  // rebuilds the model from a growing faces array would wipe every staged mark and the current selection on
  // every paginated load — the guided page's latent defect (design §6.5) this separate model exists to avoid.
  const vm = createManualReviewModel(personId);

  let metadata = $state<FaceRepairPersonMetadataResponseDto | null>(null);
  let loading = $state(true);
  let loadError = $state(false);
  let loadingMore = $state(false);
  let page = $state(0);

  // Server-sourced, so it is never a static UI-copy fallback derived from `metadata.name` alone — an empty or
  // whitespace-only name must not render as a blank heading (plan item 3).
  const personName = $derived(metadata?.name?.trim() ? metadata.name : $t('admin.face_cleanup_unnamed'));

  // Whether another page exists to load — purely a function of loaded vs. total, never a server-returned
  // hasMore flag, so it stays honest even if a page happens to return fewer faces than requested.
  const hasMore = $derived(vm.loadedCount < vm.total);

  // Admin cleanup renders clusters the admin does not own, and a face may have no person↔face join at all —
  // the person-scoped thumbnail routes 404/403 for those. Face-keyed, admin-gated, no join required. Same
  // helper the guided review page uses (design §6.4 "Reused").
  const personThumbUrl = (id: string, thumbnailFaceId: string | null) =>
    thumbnailFaceId ? getAdminFaceThumbnailUrl(thumbnailFaceId) : `/api${getPeopleThumbnailPath(id)}`;
  const faceThumbnailUrl = (faceId: string) => getAdminFaceThumbnailUrl(faceId);

  // Reuses guided's exact ribbon copy for the three states that need no extra context (design §6.4: "one
  // glyph means one thing across both pages"). `move` has no destination NAME at the model layer yet (only
  // the destination personId — see manual-review.svelte.ts) because the picker that supplies a name is wired
  // in slice 9; until then the ribbon falls back to the raw id it does have.
  const ribbonLabel = (assetFaceId: string, state: ManualFaceState): string => {
    switch (state) {
      case 'move': {
        return $t('admin.face_cleanup_review_tile_dest', { values: { name: vm.destinationOf(assetFaceId) ?? '' } });
      }
      case 'lock': {
        return $t('admin.face_cleanup_review_tile_lock_ribbon');
      }
      case 'unknown': {
        return $t('admin.face_cleanup_review_tile_unknown_ribbon');
      }
      case 'detach': {
        return $t('admin.face_cleanup_review_tile_detach_ribbon');
      }
      case 'keep': {
        return '';
      }
    }
  };

  const loadPersonData = async () => {
    loading = true;
    loadError = false;
    try {
      const [metadataResult, facesResult] = await Promise.all([
        getFaceRepairPersonMetadata({ personId }),
        getFaceRepairClusterFaces({
          personId,
          faceRepairClusterFacesRequestDto: { excludeFaceIds: [], page: 0, size: PAGE_SIZE },
        }),
      ]);
      metadata = metadataResult;
      vm.appendFaces(facesResult.faces, facesResult.total);
      page = 0;
    } catch (error) {
      // D17 on the guided page: a failed load is not the same as "this person genuinely has no faces" (a
      // graceful empty state) — render a distinct error state with Retry instead.
      loadError = true;
      handleError(error, $t('admin.face_cleanup_review_load_error'));
    } finally {
      loading = false;
    }
  };

  onMount(loadPersonData);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) {
      return;
    }
    loadingMore = true;
    try {
      const nextPage = page + 1;
      const result = await getFaceRepairClusterFaces({
        personId,
        faceRepairClusterFacesRequestDto: { excludeFaceIds: [], page: nextPage, size: PAGE_SIZE },
      });
      // appendFaces, never a reassignment — see the model comment above. This is the regression guard for the
      // guided page's $derived defect and the most important behaviour in this slice.
      vm.appendFaces(result.faces, result.total);
      page = nextPage;
    } catch (error) {
      handleError(error, $t('admin.face_cleanup_review_load_error'));
    } finally {
      loadingMore = false;
    }
  };

  const handleTileClick = (assetFaceId: string, event: MouseEvent) => {
    vm.toggle(assetFaceId, event.shiftKey);
  };
</script>

<AdminPageLayout
  breadcrumbs={[
    { title: $t('admin.face_cleanup'), href: Route.faceCleanup() },
    { title: $t('admin.face_cleanup_mode_manual'), href: Route.faceCleanupPeople() },
    { title: personName },
  ]}
>
  <div class="mx-auto max-w-screen-xl p-6">
    <!-- Back link -->
    <a
      href={Route.faceCleanupPeople()}
      class="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      data-testid="manual-review-back"
    >
      <Icon icon={mdiArrowLeft} size="16" />
      {$t('admin.face_cleanup_mode_manual')}
    </a>

    <!-- Title row -->
    <div class="mb-6 flex items-center gap-4" data-testid="manual-review-header">
      {#if !loading && metadata}
        <img
          src={personThumbUrl(personId, metadata.thumbnailFaceId)}
          alt=""
          class="size-14 flex-none rounded-2xl bg-gray-100 object-cover dark:bg-gray-700"
        />
      {:else}
        <div class="size-14 flex-none rounded-2xl bg-gray-100 dark:bg-gray-700"></div>
      {/if}
      <div>
        <h1 class="text-2xl font-semibold tracking-tight" data-testid="manual-review-heading">
          {personName}
        </h1>
        {#if metadata}
          <div class="mt-1 flex items-center gap-2 text-sm text-gray-500">
            <span class="tabular-nums" data-testid="manual-review-showing">
              {vm.loadedCount.toLocaleString()} / {vm.total.toLocaleString()}
            </span>
            <span>·</span>
            <span>{metadata.faceCount.toLocaleString()} {$t('admin.face_cleanup_faces')}</span>
            <span>·</span>
            <span class="whitespace-nowrap">
              {$t('admin.face_cleanup_col_owner')}
              <span class="font-mono text-xs" data-testid="manual-review-owner">{metadata.ownerId}</span>
            </span>
          </div>
        {/if}
      </div>
    </div>

    {#if loading}
      <!-- Loading -->
      <div class="flex items-center justify-center py-20 text-gray-400">
        <span>{$t('loading')}</span>
      </div>
    {:else if loadError}
      <!-- Initial load failed (D17): distinct from "zero faces", a genuine, graceful empty state below. -->
      <div
        class="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400"
        data-testid="manual-review-load-error"
      >
        <span class="flex-1">{$t('admin.face_cleanup_review_load_error')}</span>
        <Button color="secondary" size="small" onclick={loadPersonData} data-testid="manual-review-load-error-retry">
          {$t('retry')}
        </Button>
      </div>
    {:else if vm.total === 0}
      <!-- Zero-face person: distinct from the load-error state above (D17). -->
      <div
        class="rounded-2xl border border-dashed border-gray-200 py-20 text-center dark:border-gray-700"
        data-testid="manual-review-empty"
      >
        <div class="text-lg font-medium text-gray-500">{$t('admin.face_cleanup_manual_review_empty')}</div>
        <p class="mt-2 text-sm text-gray-400">{$t('admin.face_cleanup_manual_review_empty_sub')}</p>
      </div>
    {:else}
      <!-- Face grid -->
      <div
        class="mb-6 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700"
        data-testid="manual-review-grid"
      >
        <div class="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div>
            <h3 class="text-sm font-semibold">
              {$t('admin.face_cleanup_review_grid_title', { values: { name: personName } })}
            </h3>
            <p class="text-xs text-gray-400">{$t('admin.face_cleanup_review_grid_hint')}</p>
          </div>
          <div class="flex-1"></div>
          <!-- Selection can only ever mean the faces actually loaded — a cluster can hold thousands, and an
               unqualified "select all" would either lie about what it selected or force loading everything
               (design §6.4, "Selection cannot claim the whole cluster"). The loaded count is appended as
               plain text, never solely through i18n interpolation, so the honesty requirement is visible in
               the DOM regardless of locale. -->
          <button
            type="button"
            onclick={() => vm.selectAllLoaded()}
            class="text-sm font-semibold text-primary hover:underline"
            data-testid="manual-review-select-all-loaded"
          >
            {$t('admin.face_cleanup_manual_review_select_all_loaded')} ({vm.loadedCount})
          </button>
          <button
            type="button"
            onclick={() => vm.clearSelection()}
            class="text-sm font-semibold text-gray-400 hover:underline"
            data-testid="manual-review-clear-selection"
          >
            {$t('admin.face_cleanup_review_bulk_clear')}
          </button>
        </div>

        <div
          class="grid grid-cols-4 gap-2.5 bg-gray-50 p-4 sm:grid-cols-6 lg:grid-cols-8 dark:bg-gray-800/50"
          data-testid="manual-review-face-grid"
        >
          {#each vm.faces as face (face.assetFaceId)}
            {@const selected = vm.isSelected(face.assetFaceId)}
            {@const state = vm.stateOf(face.assetFaceId)}
            <button
              type="button"
              class={[
                'relative aspect-square overflow-hidden rounded-xl border-2 transition-all',
                selected ? 'border-primary' : 'border-transparent',
              ].join(' ')}
              style={selected ? 'box-shadow: 0 0 0 3px rgba(79,70,229,0.32);' : ''}
              onclick={(event) => handleTileClick(face.assetFaceId, event)}
              data-testid="face-tile"
              data-faceid={face.assetFaceId}
              data-state={state}
              data-selected={selected}
            >
              <img
                src={faceThumbnailUrl(face.assetFaceId)}
                alt=""
                class="size-full object-cover"
                style={state === 'detach' ? 'filter: grayscale(1) opacity(0.55);' : ''}
                loading="lazy"
              />
              {#if selected}
                <div class="absolute inset-0 bg-primary/15"></div>
              {/if}
              <!-- The visual inversion (§6.4): `keep` (the default) renders NEITHER the badge nor the ribbon
                   below — it is signalled by absence, not a 7th colour swatch. Every other state reuses
                   guided's exact STATE_COLOR/STATE_ICON tokens via MANUAL_STATE_COLOR/MANUAL_STATE_ICON, so
                   one glyph means one thing across both pages. -->
              {#if state !== 'keep'}
                {@const nonKeepState = state as Exclude<ManualFaceState, 'keep'>}
                <div
                  class="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-md border-2 border-white shadow-sm"
                  style="background: {MANUAL_STATE_COLOR[nonKeepState]}"
                  data-state-icon={state}
                >
                  <Icon icon={MANUAL_STATE_ICON[nonKeepState]} size="11" color="white" />
                </div>
                <div
                  class="absolute inset-x-0 bottom-0 p-1 text-center text-[9.5px] font-bold text-white"
                  style="background: {MANUAL_STATE_COLOR[nonKeepState]}"
                >
                  {ribbonLabel(face.assetFaceId, state)}
                </div>
              {/if}
            </button>
          {/each}
        </div>

        {#if hasMore}
          <div class="border-t border-gray-200 px-4 py-3 text-center dark:border-gray-700">
            <button
              type="button"
              onclick={handleLoadMore}
              disabled={loadingMore}
              class="text-sm font-semibold text-primary hover:underline disabled:opacity-40"
              data-testid="manual-review-load-more"
            >
              {$t('admin.face_cleanup_review_load_more', { values: { count: vm.total - vm.loadedCount } })}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</AdminPageLayout>
