<script lang="ts">
  import AdminPageLayout from '$lib/components/layouts/AdminPageLayout.svelte';
  import { Route } from '$lib/route';
  import { getPersonFaceThumbnailUrl } from '$lib/utils/people-utils';
  import { applyFaceRepair, getFaceRepairPersonFaces, getLatestScan, getPeopleThumbnailPath } from '@immich/sdk';
  import { Button, Icon } from '@immich/ui';
  import { mdiArrowLeft, mdiArrowRight, mdiClose } from '@mdi/js';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';
  import { createReviewModel } from './review.svelte';

  // Local types mirroring the SDK response (loosely typed)
  interface FlaggedFace {
    assetFaceId: string;
    suspectedOwnerId: string;
  }

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

  type Props = { data: PageData };
  const { data }: Props = $props();

  const personId = $derived(data.personId);

  // State
  let flaggedFaces = $state<FlaggedFace[]>([]);
  let scanPerson = $state<ScanPerson | null>(null);
  let loading = $state(true);
  let applying = $state(false);
  let applyError = $state<string | null>(null);

  // Lazy-load chunk size
  const CHUNK_SIZE = 48;
  let visibleCount = $state(CHUNK_SIZE);

  // View model
  let vm = $derived(createReviewModel(flaggedFaces));

  // Derived person metadata
  const personName = $derived(scanPerson?.personName ?? $t('admin.face_cleanup_review_unnamed'));
  const faceCount = $derived(scanPerson?.faceCount ?? 0);
  const primaryOwner = $derived(scanPerson?.suspectedOwners?.[0] ?? null);
  const ownerName = $derived(primaryOwner?.ownerName ?? $t('admin.face_cleanup_review_unnamed'));
  const ownerPersonId = $derived(primaryOwner?.ownerPersonId ?? null);

  const staysCount = $derived(faceCount - vm.movingCount);
  const visibleFaces = $derived(flaggedFaces.slice(0, visibleCount));
  const hasMore = $derived(visibleCount < flaggedFaces.length);

  const personThumbUrl = (id: string) => `/api${getPeopleThumbnailPath(id)}`;

  const faceThumbnailUrl = (faceId: string) => getPersonFaceThumbnailUrl(personId, faceId);

  onMount(async () => {
    try {
      const [facesResult, scanResult] = await Promise.all([getFaceRepairPersonFaces({ personId }), getLatestScan()]);

      const faces = facesResult as unknown as { flaggedFaces: FlaggedFace[] };
      flaggedFaces = faces?.flaggedFaces ?? [];

      const scan = scanResult as unknown as FaceCleanupScan | null;
      if (scan?.persons) {
        scanPerson = scan.persons.find((p) => p.personId === personId) ?? null;
      }
    } catch {
      // leave empty — graceful state below handles it
    } finally {
      loading = false;
    }
  });

  const handleLoadMore = () => {
    visibleCount = Math.min(visibleCount + CHUNK_SIZE, flaggedFaces.length);
  };

  const handleCancel = () => {
    void goto(Route.faceCleanup());
  };

  const handleMove = async () => {
    if (vm.movingCount === 0 || applying) {
      return;
    }
    applying = true;
    applyError = null;
    try {
      await applyFaceRepair({
        faceRepairApplyRequestDto: {
          approvedPersonIds: [personId],
          excludeFaceIds: vm.excludeFaceIds(),
        },
      });
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
  <div class="mx-auto max-w-screen-xl p-6 pb-36">
    <!-- Back link -->
    <a
      href={Route.faceCleanup()}
      class="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
    >
      <Icon path={mdiArrowLeft} size="16" />
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
          <h3 class="mb-1 text-sm font-semibold">{$t('admin.face_cleanup_review_banner_title')}</h3>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {$t('admin.face_cleanup_review_banner_body', {
              values: { moving: vm.movingCount, name: personName, faceCount, ownerName },
            })}
          </p>
        </div>
      </div>

      <!-- Decision strip -->
      <div
        class="mb-5 grid items-stretch overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700"
        style="grid-template-columns: 1fr 3rem 1fr"
      >
        <!-- Stays side -->
        <div class="flex items-center gap-3 bg-white p-4 dark:bg-gray-800">
          <img
            src={personThumbUrl(personId)}
            alt=""
            class="size-14 flex-none rounded-xl object-cover shadow-[0_0_0_3px_#e8f6ec,0_0_0_4px_#2fa84f] dark:shadow-[0_0_0_3px_rgba(47,168,79,0.2),0_0_0_4px_#2fa84f]"
          />
          <div>
            <div class="text-xs font-bold uppercase tracking-widest text-green-600" data-testid="stays-label">
              {$t('admin.face_cleanup_review_stays_label', { values: { name: personName } })}
            </div>
            <div class="mt-1 text-base font-semibold">{personName}</div>
            <div class="mt-0.5 text-xs text-gray-500" data-testid="stays-count">
              {$t('admin.face_cleanup_review_stays_count', { values: { count: staysCount.toLocaleString() } })}
            </div>
          </div>
        </div>

        <!-- Arrow divider -->
        <div
          class="flex items-center justify-center border-x border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="rounded-full border border-gray-200 bg-white p-1.5 dark:border-gray-700 dark:bg-gray-800">
            <Icon path={mdiArrowRight} size="16" class="text-gray-400" />
          </div>
        </div>

        <!-- Moves side -->
        <div class="flex items-center justify-end gap-3 bg-white p-4 text-right dark:bg-gray-800">
          <div>
            <div class="text-xs font-bold uppercase tracking-widest text-primary" data-testid="moves-label">
              {$t('admin.face_cleanup_review_moves_label')}
            </div>
            <div class="mt-1 text-base font-semibold">{ownerName}</div>
            <div class="mt-0.5 text-xs text-gray-500" data-testid="moves-count">
              {$t('admin.face_cleanup_review_moves_count', { values: { count: vm.movingCount.toLocaleString() } })}
            </div>
          </div>
          {#if ownerPersonId}
            <img
              src={personThumbUrl(ownerPersonId)}
              alt=""
              class="size-14 flex-none rounded-xl object-cover shadow-[0_0_0_3px_#eef0fb,0_0_0_4px_#4250af] dark:shadow-[0_0_0_3px_rgba(66,80,175,0.2),0_0_0_4px_#4250af]"
            />
          {:else}
            <div class="size-14 flex-none rounded-xl bg-gray-100 dark:bg-gray-700"></div>
          {/if}
        </div>
      </div>

      <!-- Apply error banner -->
      {#if applyError}
        <div
          class="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400"
        >
          <span class="flex-1">{applyError}</span>
          <button type="button" onclick={() => (applyError = null)} class="flex-none text-red-400 hover:text-red-600">
            <Icon path={mdiClose} size="16" />
          </button>
        </div>
      {/if}

      <!-- Faces grid -->
      <div class="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
        <!-- Grid header -->
        <div class="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 class="text-sm font-semibold">
            {$t('admin.face_cleanup_review_grid_title', { values: { name: personName } })}
            <span class="ml-2 font-normal text-gray-400">
              {$t('admin.face_cleanup_review_grid_hint', {
                values: { ownerName, name: personName },
              })}
            </span>
          </h3>
        </div>

        <!-- Tiles -->
        <div class="grid grid-cols-4 gap-3 bg-gray-50 p-4 dark:bg-gray-800/50 sm:grid-cols-6 lg:grid-cols-8">
          {#each visibleFaces as face (face.assetFaceId)}
            {@const excluded = vm.isExcluded(face.assetFaceId)}
            <button
              type="button"
              class={[
                'relative aspect-square overflow-hidden rounded-xl border-2 transition-all',
                excluded ? 'border-transparent opacity-55 grayscale-[0.5]' : 'border-primary hover:border-primary/80',
              ].join(' ')}
              onclick={() => vm.toggle(face.assetFaceId)}
              data-testid="face-tile"
              data-faceid={face.assetFaceId}
              data-excluded={excluded}
            >
              <img src={faceThumbnailUrl(face.assetFaceId)} alt="" class="size-full object-cover" loading="lazy" />
              <!-- Checkmark or stays overlay -->
              {#if excluded}
                <div
                  class="absolute inset-x-0 bottom-0 bg-green-600 py-0.5 text-center text-[9px] font-bold text-white"
                  data-testid="stays-badge"
                >
                  {$t('admin.face_cleanup_review_tile_stays', { values: { name: personName } })}
                </div>
              {:else}
                <!-- Checkmark -->
                <div
                  class="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-md border-2 border-white bg-primary shadow-sm"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <!-- Destination tag -->
                <div
                  class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-[10px] font-semibold text-white"
                >
                  {$t('admin.face_cleanup_review_tile_dest', { values: { name: ownerName } })}
                </div>
              {/if}
            </button>
          {/each}
        </div>

        <!-- Load more -->
        {#if hasMore}
          <div class="border-t border-gray-200 px-4 py-3 text-center dark:border-gray-700">
            <button
              type="button"
              onclick={handleLoadMore}
              class="text-sm font-semibold text-primary hover:underline"
              data-testid="load-more"
            >
              {$t('admin.face_cleanup_review_load_more')} ({(flaggedFaces.length - visibleCount).toLocaleString()} remaining)
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Sticky action bar -->
  {#if !loading && flaggedFaces.length > 0}
    <div
      class="fixed inset-x-0 bottom-0 z-20 flex items-center gap-4 border-t border-gray-200 bg-white/90 px-6 py-4 shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/90"
      data-testid="action-bar"
    >
      <div>
        <div class="text-sm font-medium">
          {$t('admin.face_cleanup_review_action_summary', {
            values: { moving: vm.movingCount.toLocaleString(), owner: ownerName },
          })}
          <span class="text-gray-400">
            {$t('admin.face_cleanup_review_action_kept', {
              values: { kept: staysCount.toLocaleString() },
            })}
          </span>
        </div>
      </div>
      <div class="flex-1"></div>
      <Button color="secondary" onclick={handleCancel} data-testid="cancel-btn">
        {$t('admin.face_cleanup_review_cancel')}
      </Button>
      <Button color="primary" disabled={vm.movingCount === 0 || applying} onclick={handleMove} data-testid="move-btn">
        <Icon path={mdiArrowRight} size="16" />
        {$t('admin.face_cleanup_review_move', { values: { count: vm.movingCount.toLocaleString() } })}
      </Button>
    </div>
  {/if}
</AdminPageLayout>
