<script lang="ts">
  import AdminPageLayout from '$lib/components/layouts/AdminPageLayout.svelte';
  import { Route } from '$lib/route';
  import { getPersonFaceThumbnailUrl } from '$lib/utils/people-utils';
  import {
    applyFaceRepair,
    getFaceRepairClusterFaces,
    getFaceRepairPersonFaces,
    getLatestScan,
    getPeopleThumbnailPath,
    resolveFaces,
  } from '@immich/sdk';
  import { Button, Icon, modalManager } from '@immich/ui';
  import { mdiArrowLeft, mdiArrowRight, mdiCheckBold, mdiClose, mdiLock } from '@mdi/js';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';
  import PersonPicker from './PersonPicker.svelte';
  import { createReviewModel, type FaceEntry, type FaceState, type FlaggedFace } from './review.svelte';

  interface ScanPerson {
    personId: string;
    ownerId: string;
    personName: string | null;
    faceCount: number;
    thumbnailFaceId: string | null;
    eligible: number;
    flagged: number;
    flaggedFraction: number;
    suspectedOwners: {
      ownerPersonId: string;
      ownerName: string | null;
      thumbnailFaceId: string | null;
      count: number;
    }[];
    recommendation: 'confident' | 'review-first';
    reviewReasons: string[];
  }

  interface FaceCleanupScan {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: { scanned: number; total: number } | null;
    totals: object | null;
    persons: ScanPerson[];
    error: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
  }

  // Model B state colors (docs/plans/2026-07-10-face-cleanup-resolution-mockup.html :root vars) — the visual
  // source of truth for this page. Only `owner` is reachable this slice (Slice 1 wires the move-to-owner
  // path only); the rest are rendered so the full 5-state model already has its final look.
  const STATE_COLOR: Record<FaceState, string> = {
    owner: '#4f46e5',
    other: '#d97706',
    stay: '#16a34a',
    lock: '#7c3aed',
    detach: '#475569',
  };

  type Props = { data: PageData };
  const { data }: Props = $props();

  const personId = $derived(data.personId);

  // State
  let flaggedFaces = $state<FlaggedFace[]>([]);
  let scanPerson = $state<ScanPerson | null>(null);
  let loading = $state(true);
  let applying = $state(false);
  let applyError = $state<string | null>(null);

  // Rest-of-cluster (server-paginated, add-faces feature) — retained this slice as its own self-contained
  // flow on the OLD `apply` endpoint (Slice 1 only moves the flagged-grid Apply onto `resolve`; unifying the
  // Rest section onto `resolve` is a later slice). Its selection is intentionally decoupled from the
  // flagged-grid review model above.
  const REST_PAGE_SIZE = 48;
  let restFaces = $state<{ assetFaceId: string }[]>([]);
  let restTotal = $state(0);
  let restPage = $state(0);
  let restHasMore = $state(false);
  let restLoading = $state(false);
  const restSelected = new SvelteSet<string>();
  let restMoving = $state(false);
  let showEntireConfirm = $state(false);

  // An entire-cluster move covers ALL eligible faces: the Rest (which excludes the flagged ids) plus the
  // still-flagged faces. This is why "Move entire cluster" works even when the Rest is empty.
  const clusterTotal = $derived(restTotal + flaggedFaces.length);

  // Lazy-load chunk size for the flagged grid — selection/Apply always act on the full flagged set (via the
  // review model), independent of how much is currently rendered.
  const CHUNK_SIZE = 48;
  let visibleCount = $state(CHUNK_SIZE);

  // View model (Model B / full resolution)
  let vm = $derived(createReviewModel(flaggedFaces));

  // Derived person metadata
  const personName = $derived(scanPerson?.personName ?? $t('admin.face_cleanup_review_unnamed'));
  const faceCount = $derived(scanPerson?.faceCount ?? 0);
  const primaryOwner = $derived(scanPerson?.suspectedOwners?.[0] ?? null);
  const ownerName = $derived(primaryOwner?.ownerName ?? $t('admin.face_cleanup_review_unnamed'));
  const ownerPersonId = $derived(primaryOwner?.ownerPersonId ?? null);

  const visibleFaces = $derived(vm.faces.slice(0, visibleCount));
  const hasMore = $derived(visibleCount < vm.faces.length);

  const personThumbUrl = (id: string) => `/api${getPeopleThumbnailPath(id)}`;
  const faceThumbnailUrl = (faceId: string) => getPersonFaceThumbnailUrl(personId, faceId);

  const ownerNameById = (ownerPersonId: string): string =>
    scanPerson?.suspectedOwners?.find((o) => o.ownerPersonId === ownerPersonId)?.ownerName ??
    $t('admin.face_cleanup_review_unnamed');

  const ribbonLabel = (face: FaceEntry): string => {
    switch (face.state) {
      case 'owner': {
        return $t('admin.face_cleanup_review_tile_dest', { values: { name: ownerNameById(face.suspectedOwnerId) } });
      }
      case 'other': {
        return $t('admin.face_cleanup_review_tile_dest', { values: { name: face.destinationName ?? '' } });
      }
      case 'stay': {
        return $t('admin.face_cleanup_review_tile_stay_ribbon');
      }
      case 'lock': {
        return $t('admin.face_cleanup_review_tile_lock_ribbon');
      }
      case 'detach': {
        return $t('admin.face_cleanup_review_tile_detach_ribbon');
      }
    }
  };

  onMount(async () => {
    try {
      const [facesResult, scanResult] = await Promise.all([getFaceRepairPersonFaces({ personId }), getLatestScan()]);

      const faces = facesResult as unknown as { flaggedFaces: FlaggedFace[] };
      flaggedFaces = faces?.flaggedFaces ?? [];

      const scan = scanResult as unknown as FaceCleanupScan | null;
      if (scan?.persons) {
        scanPerson = scan.persons.find((p) => p.personId === personId) ?? null;
      }

      if (flaggedFaces.length > 0) {
        void loadRestPage();
      }
    } catch {
      // leave empty — graceful state below handles it
    } finally {
      loading = false;
    }
  });

  const handleLoadMore = () => {
    visibleCount = Math.min(visibleCount + CHUNK_SIZE, vm.faces.length);
  };

  const handleTileClick = (assetFaceId: string, event: MouseEvent) => {
    if (event.shiftKey) {
      vm.selectRange(assetFaceId);
    } else {
      vm.toggleSelect(assetFaceId);
    }
  };

  const handleBulkOwner = () => {
    vm.applyToSelection('owner');
  };

  const handleBulkStay = () => {
    vm.applyToSelection('stay');
  };

  const handleBulkLock = () => {
    vm.applyToSelection('lock');
  };

  const handleBulkOther = async () => {
    if (!scanPerson || vm.selectedCount === 0) {
      return;
    }
    const destination = await modalManager.show(PersonPicker, {
      ownerId: scanPerson.ownerId,
      faceCount: vm.selectedCount,
      suggestedPersonId: ownerPersonId,
    });
    if (destination) {
      vm.applyToSelection('other', destination);
    }
  };

  const loadRestPage = async () => {
    if (restLoading) {
      return;
    }
    restLoading = true;
    try {
      const result = await getFaceRepairClusterFaces({
        personId,
        faceRepairClusterFacesRequestDto: {
          excludeFaceIds: flaggedFaces.map((f) => f.assetFaceId),
          page: restPage,
          size: REST_PAGE_SIZE,
        },
      });
      restFaces = [...restFaces, ...result.faces];
      restTotal = result.total;
      restHasMore = result.hasMore;
      restPage += 1;
    } catch {
      // graceful — leave the Rest section empty
    } finally {
      restLoading = false;
    }
  };

  const handleSelectAllRest = () => {
    for (const face of restFaces) {
      restSelected.add(face.assetFaceId);
    }
  };

  const handleMoveRestSelection = async () => {
    if (!ownerPersonId || restSelected.size === 0 || restMoving) {
      return;
    }
    restMoving = true;
    try {
      await applyFaceRepair({
        faceRepairApplyRequestDto: {
          approvedPersonIds: [],
          excludeFaceIds: [],
          manualMove: { personId, destinationPersonId: ownerPersonId, faceIds: [...restSelected] },
        },
      });
      void goto(Route.faceCleanup());
    } catch {
      // non-fatal — selection is preserved, admin can retry
    } finally {
      restMoving = false;
    }
  };

  const handleMoveEntireCluster = () => {
    if (!ownerPersonId) {
      return;
    }
    showEntireConfirm = true;
  };

  const confirmMoveEntireCluster = async () => {
    showEntireConfirm = false;
    if (!ownerPersonId) {
      return;
    }
    try {
      await applyFaceRepair({
        faceRepairApplyRequestDto: {
          approvedPersonIds: [],
          excludeFaceIds: [],
          manualMove: { personId, destinationPersonId: ownerPersonId, entireCluster: true },
        },
      });
      void goto(Route.faceCleanup());
    } catch {
      // non-fatal — the confirm modal already closed; the person stays in the console for a retry
    }
  };

  const handleCancel = () => {
    void goto(Route.faceCleanup());
  };

  const handleApply = async () => {
    if (applying) {
      return;
    }
    applying = true;
    applyError = null;
    try {
      await resolveFaces({ faceRepairResolveRequestDto: vm.buildResolveRequest(personId) });
      void goto(Route.faceCleanup());
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      applyError =
        status === 409 ? $t('admin.face_cleanup_review_apply_conflict') : $t('admin.face_cleanup_review_apply_error');
    } finally {
      applying = false;
    }
  };
</script>

<AdminPageLayout breadcrumbs={[{ title: $t('admin.face_cleanup'), href: Route.faceCleanup() }, { title: personName }]}>
  <div class="mx-auto max-w-screen-xl p-6 pb-32">
    <!-- Back link -->
    <a
      href={Route.faceCleanup()}
      class="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
    >
      <Icon icon={mdiArrowLeft} size="16" />
      {$t('admin.face_cleanup_review_back')}
    </a>

    <!-- Title row -->
    <div class="mb-6 flex items-center gap-4">
      {#if !loading && scanPerson}
        <img
          src={personThumbUrl(personId)}
          alt=""
          class="size-14 flex-none rounded-2xl bg-gray-100 object-cover dark:bg-gray-700"
        />
      {:else}
        <div class="size-14 flex-none rounded-2xl bg-gray-100 dark:bg-gray-700"></div>
      {/if}
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          {$t('admin.face_cleanup_review_heading', { values: { name: personName } })}
        </h1>
        {#if scanPerson}
          <div class="mt-1 flex items-center gap-2 text-sm text-gray-500">
            <span>{$t('admin.face_cleanup_review_header_flagged', { values: { count: flaggedFaces.length } })}</span>
            <span>·</span>
            <span>{faceCount.toLocaleString()} {$t('admin.face_cleanup_faces')}</span>
            <span>·</span>
            <span class="font-mono text-xs">{personId.slice(0, 8)}</span>
          </div>
        {/if}
      </div>
    </div>

    {#if loading}
      <!-- Loading -->
      <div class="flex items-center justify-center py-20 text-gray-400">
        <span>{$t('loading')}</span>
      </div>
    {:else if flaggedFaces.length === 0}
      <!-- Stale / no flagged faces -->
      <div class="rounded-2xl border border-dashed border-gray-200 py-20 text-center dark:border-gray-700">
        <div class="text-lg font-medium text-gray-500">{$t('admin.face_cleanup_review_no_flagged')}</div>
        <p class="mt-2 text-sm text-gray-400">{$t('admin.face_cleanup_review_no_flagged_sub')}</p>
        <div class="mt-4">
          <Button color="secondary" onclick={handleCancel}>{$t('admin.face_cleanup_review_back')}</Button>
        </div>
      </div>
    {:else}
      <!-- Banner -->
      <div
        class="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-900/10"
      >
        <div
          class="flex size-8 flex-none items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </div>
        <div>
          <h3 class="mb-1 text-sm font-semibold">
            {$t('admin.face_cleanup_review_banner_title', { values: { count: flaggedFaces.length } })}
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {$t('admin.face_cleanup_review_banner_body', { values: { ownerName } })}
          </p>
        </div>
      </div>

      <!-- Apply error banner -->
      {#if applyError}
        <div
          class="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400"
        >
          <span class="flex-1">{applyError}</span>
          <button type="button" onclick={() => (applyError = null)} class="flex-none text-red-400 hover:text-red-600">
            <Icon icon={mdiClose} size="16" />
          </button>
        </div>
      {/if}

      <!-- Flagged grid -->
      <div class="mb-5 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
        <div class="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div>
            <h3 class="text-sm font-semibold">
              {$t('admin.face_cleanup_review_grid_title', { values: { name: personName } })}
            </h3>
            <p class="text-xs text-gray-400">{$t('admin.face_cleanup_review_grid_hint')}</p>
          </div>
          <div class="flex-1"></div>
          <button
            type="button"
            onclick={() => vm.selectAll()}
            class="text-sm font-semibold text-primary hover:underline"
            data-testid="select-all"
          >
            {$t('admin.face_cleanup_review_select_all_flagged', { values: { count: vm.total } })}
          </button>
          <button
            type="button"
            onclick={() => vm.reset()}
            class="text-sm font-semibold text-gray-400 hover:underline"
            data-testid="reset"
          >
            {$t('admin.face_cleanup_review_reset')}
          </button>
        </div>

        <div
          class="grid grid-cols-4 gap-2.5 bg-gray-50 p-4 sm:grid-cols-6 lg:grid-cols-8 dark:bg-gray-800/50"
          data-testid="flagged-grid"
        >
          {#each visibleFaces as face (face.assetFaceId)}
            {@const selected = vm.isSelected(face.assetFaceId)}
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
              data-state={face.state}
            >
              <img
                src={faceThumbnailUrl(face.assetFaceId)}
                alt=""
                class="size-full object-cover"
                style={face.state === 'detach' ? 'filter: grayscale(1) opacity(0.55);' : ''}
                loading="lazy"
              />
              {#if selected}
                <div class="absolute inset-0 bg-primary/15"></div>
              {/if}
              <!-- State indicator -->
              <div
                class="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-md border-2 border-white shadow-sm"
                style="background: {STATE_COLOR[face.state]}"
              >
                {#if face.state === 'lock'}
                  <Icon icon={mdiLock} size="11" color="white" />
                {:else if face.state !== 'detach'}
                  <Icon icon={mdiCheckBold} size="11" color="white" />
                {/if}
              </div>
              <!-- Ribbon -->
              <div
                class="absolute inset-x-0 bottom-0 p-1 text-center text-[9.5px] font-bold text-white"
                style="background: {STATE_COLOR[face.state]}"
              >
                {ribbonLabel(face)}
              </div>
            </button>
          {/each}
        </div>

        {#if hasMore}
          <div class="border-t border-gray-200 px-4 py-3 text-center dark:border-gray-700">
            <button
              type="button"
              onclick={handleLoadMore}
              class="text-sm font-semibold text-primary hover:underline"
              data-testid="load-more"
            >
              {$t('admin.face_cleanup_review_load_more', { values: { count: vm.faces.length - visibleCount } })}
            </button>
          </div>
        {/if}
      </div>

      <!-- Rest of this cluster (paginated, add-faces feature — retained on the old apply endpoint) -->
      <div
        class="mb-28 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700"
        data-testid="rest-section"
      >
        <div class="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 class="text-sm font-semibold">
            {$t('admin.face_cleanup_review_rest_title', { values: { count: restTotal.toLocaleString() } })}
            <span class="ml-2 font-normal text-gray-400">
              {$t('admin.face_cleanup_review_rest_hint', { values: { owner: ownerName } })}
            </span>
          </h3>
          <div class="flex-1"></div>
          {#if restSelected.size > 0}
            <Button
              size="small"
              disabled={!ownerPersonId || restMoving}
              onclick={handleMoveRestSelection}
              data-testid="move-rest-selection-btn"
            >
              {$t('admin.face_cleanup_review_move', { values: { count: restSelected.size } })}
            </Button>
          {/if}
          <button
            type="button"
            onclick={handleSelectAllRest}
            disabled={!ownerPersonId || restFaces.length === 0}
            class="text-sm font-semibold text-primary hover:underline disabled:opacity-40"
            data-testid="select-all-btn"
          >
            {$t('admin.face_cleanup_review_select_all')}
          </button>
          <Button
            color="secondary"
            size="small"
            disabled={!ownerPersonId}
            onclick={handleMoveEntireCluster}
            data-testid="move-entire-btn"
          >
            {$t('admin.face_cleanup_review_move_entire')}
          </Button>
        </div>

        {#if restTotal === 0 && !restLoading}
          <div class="py-12 text-center text-sm text-gray-400" data-testid="rest-empty">
            {$t('admin.face_cleanup_review_rest_empty')}
          </div>
        {:else}
          <div class="grid grid-cols-4 gap-3 bg-gray-50 p-4 sm:grid-cols-6 lg:grid-cols-8 dark:bg-gray-800/50">
            {#each restFaces as face (face.assetFaceId)}
              {@const selected = restSelected.has(face.assetFaceId)}
              <div class="relative aspect-square">
                <button
                  type="button"
                  class={[
                    'absolute inset-0 overflow-hidden rounded-xl border-2 transition-all',
                    selected ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100',
                  ].join(' ')}
                  onclick={() => {
                    if (restSelected.has(face.assetFaceId)) {
                      restSelected.delete(face.assetFaceId);
                    } else {
                      restSelected.add(face.assetFaceId);
                    }
                  }}
                  data-testid="rest-tile"
                  data-faceid={face.assetFaceId}
                  data-selected={selected}
                >
                  <img src={faceThumbnailUrl(face.assetFaceId)} alt="" class="size-full object-cover" loading="lazy" />
                  {#if selected}
                    <div
                      class="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-md border-2 border-white bg-primary shadow-sm"
                    >
                      <Icon icon={mdiCheckBold} size="10" color="white" />
                    </div>
                    <div
                      class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-1.5 pt-3 pb-1 text-[10px] font-semibold text-white"
                    >
                      {$t('admin.face_cleanup_review_tile_dest', { values: { name: ownerName } })}
                    </div>
                  {/if}
                </button>
              </div>
            {/each}
          </div>
          {#if restHasMore}
            <div class="border-t border-gray-200 px-4 py-3 text-center dark:border-gray-700">
              <button
                type="button"
                onclick={loadRestPage}
                class="text-sm font-semibold text-primary hover:underline"
                data-testid="rest-load-more"
              >
                {$t('admin.face_cleanup_review_load_more', { values: { count: restTotal - restFaces.length } })}
              </button>
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>

  <!-- Sticky dock: swaps between the outcome-tally summary and the bulk action bar (Model B mockup).
       Sticky (not fixed) so it stays within the admin content region and never overlaps the sidebar — fixed
       positioning spans the full viewport and would render on top of AdminPageLayout's sidebar nav. -->
  {#if !loading && flaggedFaces.length > 0}
    <div
      class="sticky bottom-0 z-20 border-t border-gray-200 bg-white/90 py-3.5 backdrop-blur-md dark:border-gray-700 dark:bg-gray-900/90"
      data-testid="dock"
    >
      <div class="mx-auto flex max-w-screen-xl flex-wrap items-center gap-3.5 px-6">
        {#if vm.selectedCount === 0}
          <!-- Summary state -->
          <div class="flex flex-1 flex-wrap items-center gap-3.5" data-testid="tally">
            {#each ['owner', 'stay', 'lock', 'other', 'detach'] as FaceState[] as state (state)}
              {@const count = vm.tally[state]}
              <span
                class={[
                  'inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-bold dark:border-gray-700 dark:bg-gray-800',
                  count === 0 ? 'opacity-40' : '',
                ].join(' ')}
              >
                <span class="size-2.5 rounded-xs" style="background: {STATE_COLOR[state]}"></span>
                <span>{count}</span>
                <span class="font-normal text-gray-500 dark:text-gray-400">
                  {state === 'owner'
                    ? $t('admin.face_cleanup_review_tally_owner', { values: { name: ownerName } })
                    : $t(`admin.face_cleanup_review_tally_${state}`)}
                </span>
              </span>
            {/each}
            <span class="inline-flex items-center gap-1.5 text-xs font-bold text-green-600">
              <Icon icon={mdiCheckBold} size="13" />
              {$t('admin.face_cleanup_review_tally_all_set')}
            </span>
          </div>
          <Button color="primary" disabled={applying} onclick={handleApply} data-testid="apply-btn">
            <Icon icon={mdiArrowRight} size="16" />
            {$t('admin.face_cleanup_review_apply_label', { values: { count: vm.total } })}
          </Button>
        {:else}
          <!-- Bulk-bar state — only the move-to-owner path is wired this slice (RF1/Slice 1). -->
          <div
            class="flex flex-1 flex-wrap items-center gap-2.5 rounded-xl bg-gray-900 px-3.5 py-2.5 text-white"
            data-testid="bulk-bar"
          >
            <span class="text-sm font-bold whitespace-nowrap">
              {vm.selectedCount}
              {$t('admin.face_cleanup_review_bulk_selected_suffix')}
            </span>
            <span class="h-5 w-px bg-white/15"></span>
            <button
              type="button"
              onclick={handleBulkOwner}
              class="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20"
            >
              <span class="size-2 rounded-xs" style="background: {STATE_COLOR.owner}"></span>
              {$t('admin.face_cleanup_review_bulk_owner')}
            </button>
            <button
              type="button"
              onclick={handleBulkStay}
              class="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20"
              data-testid="bulk-stay"
            >
              <span class="size-2 rounded-xs" style="background: {STATE_COLOR.stay}"></span>
              {$t('admin.face_cleanup_review_bulk_stay')}
            </button>
            <button
              type="button"
              onclick={handleBulkLock}
              class="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20"
              data-testid="bulk-lock"
            >
              <span class="size-2 rounded-xs" style="background: {STATE_COLOR.lock}"></span>
              {$t('admin.face_cleanup_review_bulk_lock')}
            </button>
            <button
              type="button"
              onclick={handleBulkOther}
              class="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20"
              data-testid="bulk-other"
            >
              <span class="size-2 rounded-xs" style="background: {STATE_COLOR.other}"></span>
              {$t('admin.face_cleanup_review_bulk_other')}
            </button>
            <button
              type="button"
              onclick={() => vm.clearSelection()}
              class="ml-auto text-xs font-bold text-gray-300 hover:text-white"
              data-testid="clear"
            >
              {$t('admin.face_cleanup_review_bulk_clear')}
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if showEntireConfirm}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-testid="entire-confirm">
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
        <h3 class="text-lg font-semibold">{$t('admin.face_cleanup_review_move_entire_confirm_title')}</h3>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {$t('admin.face_cleanup_review_move_entire_confirm_body', {
            values: { count: clusterTotal.toLocaleString(), owner: ownerName },
          })}
        </p>
        <div class="mt-5 flex justify-end gap-3">
          <Button color="secondary" onclick={() => (showEntireConfirm = false)} data-testid="entire-confirm-cancel">
            {$t('admin.face_cleanup_review_cancel')}
          </Button>
          <Button color="primary" onclick={confirmMoveEntireCluster} data-testid="entire-confirm-cta">
            {$t('admin.face_cleanup_review_move_entire_confirm_cta', {
              values: { count: clusterTotal.toLocaleString() },
            })}
          </Button>
        </div>
      </div>
    </div>
  {/if}
</AdminPageLayout>
