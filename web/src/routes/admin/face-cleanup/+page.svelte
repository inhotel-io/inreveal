<script lang="ts">
  import AdminPageLayout from '$lib/components/layouts/AdminPageLayout.svelte';
  import { Route } from '$lib/route';
  import { createFaceCleanupModel, type FaceCleanupModel } from './face-cleanup.svelte';
  import FaceCleanupTable from './FaceCleanupTable.svelte';
  import { declineFaceRepair, getFaceRepairPersonFaces, getLatestScan, resolveFaces, triggerScan } from '@immich/sdk';
  import { Button, Icon, modalManager, toastManager } from '@immich/ui';
  import { mdiClose, mdiRefresh, mdiTune } from '@mdi/js';
  import AdvancedScanModal, { type AdvancedScanParams } from './AdvancedScanModal.svelte';
  import ScanChecklist from './ScanChecklist.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { handleError } from '$lib/utils/handle-error';
  import type { PageData } from './$types';

  // Local types for the loosely-typed SDK response
  interface ScanTotals {
    eligibleFaces: number;
    flaggedFaces: number;
    toRepair: number;
    reviewOnlyFaces: number;
    reviewOnlyPersons: number;
    affectedPersons: number;
    reviewOnlyByReason: { overCap: number; badTarget: number; unAttributable: number };
  }

  interface ScanProgress {
    scanned: number;
    total: number;
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
    progress: ScanProgress | null;
    totals: ScanTotals | null;
    persons: ScanPerson[];
    error: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
  }

  type Props = { data: PageData };
  const { data }: Props = $props();

  let scan = $state<FaceCleanupScan | null>(null);
  let loading = $state(true);
  let loadError = $state(false);
  let scanning = $state(false);
  let applying = $state(false);
  let applyError = $state<string | null>(null);
  let pollTimer = $state<ReturnType<typeof setTimeout> | null>(null);

  // Filter / search state
  let filter = $state<'all' | 'review-first' | 'confident' | 'named'>('all');

  // Static literal key map — the typed $t() rejects a dynamically-built template-literal key.
  const FILTER_LABEL_KEYS = {
    all: 'admin.face_cleanup_filter_all',
    'review-first': 'admin.face_cleanup_filter_review_first',
    confident: 'admin.face_cleanup_filter_confident',
    named: 'admin.face_cleanup_filter_named',
  } as const;
  let searchQuery = $state('');

  // The view-model is rebuilt through setScan so user selections and the opened review-first gate are
  // carried over across refetches/dismissals instead of resetting to the confident preselect.
  let vm = $state<FaceCleanupModel | null>(null);

  const openedStorageKey = (scanId: string) => `face-cleanup-opened:${scanId}`;

  const readPersistedOpened = (scanId: string): string[] => {
    try {
      return JSON.parse(sessionStorage.getItem(openedStorageKey(scanId)) ?? '[]') as string[];
    } catch {
      return [];
    }
  };

  const persistOpened = (scanId: string, opened: Iterable<string>) => {
    try {
      sessionStorage.setItem(openedStorageKey(scanId), JSON.stringify([...opened]));
    } catch {
      // sessionStorage unavailable — the gate just won't survive navigation
    }
  };

  const setScan = (next: FaceCleanupScan | null) => {
    scan = next;
    vm =
      next?.persons && next.persons.length > 0
        ? createFaceCleanupModel(next.persons as ScanPerson[], {
            prev: vm,
            restoredOpened: readPersistedOpened(next.id),
          })
        : null;
  };

  const isActive = (status: string | undefined) => status === 'pending' || status === 'running';

  const fetchLatestScan = async () => {
    try {
      const result = await getLatestScan();
      setScan(result as unknown as FaceCleanupScan | null);
    } catch {
      // Transient poll/network error: keep the current state. A genuine "no scan yet" arrives as a
      // successful null result (handled above), so wiping `scan` here would flash the empty state and
      // re-enable Re-scan mid-scan.
    }
  };

  const POLL_MIN_MS = 2000;
  const POLL_MAX_MS = 15_000;
  let pollDelay = POLL_MIN_MS;

  // Self-rescheduling poll with capped backoff (N3): a fixed 2s interval fired hundreds of near-identical status
  // requests across a long scan. Each successful poll grows the delay toward POLL_MAX_MS; it stops as soon as the
  // scan is no longer active. fetchLatestScan swallows its own transient errors, so polling keeps going on a blip.
  const scheduleNextPoll = () => {
    pollTimer = setTimeout(() => {
      void fetchLatestScan().then(() => {
        if (scan && !isActive(scan.status)) {
          stopPolling();
          return;
        }
        pollDelay = Math.min(Math.round(pollDelay * 1.5), POLL_MAX_MS);
        scheduleNextPoll();
      });
    }, pollDelay);
  };

  const startPolling = () => {
    if (pollTimer) {
      return;
    }
    pollDelay = POLL_MIN_MS;
    scheduleNextPoll();
  };

  const stopPolling = () => {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  // The INITIAL load is kept separate from fetchLatestScan's swallow-everything poll idiom above (D17): a
  // failed first fetch must render as a distinct error state with a Retry, not the reassuring "no scan yet"
  // empty state — but once that first fetch has succeeded, a later poll blip should keep showing the
  // last-known scan state, not flash into an error banner. Retry re-runs this same function.
  const loadInitial = async () => {
    loading = true;
    loadError = false;
    try {
      const result = await getLatestScan();
      setScan(result as unknown as FaceCleanupScan | null);
    } catch (error) {
      loadError = true;
      handleError(error, $t('admin.face_cleanup_load_error'));
    } finally {
      loading = false;
    }
    if (scan && isActive(scan.status)) {
      startPolling();
    }
  };

  onMount(loadInitial);

  onDestroy(() => stopPolling());

  const runScan = async (params?: AdvancedScanParams) => {
    scanning = true;
    applyError = null;
    try {
      await triggerScan({ faceRepairScanTriggerRequestDto: params ? { params } : {} });
      await fetchLatestScan();
      startPolling();
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      if (status === 409) {
        toastManager.danger($t('admin.face_cleanup_scan_conflict'));
      } else {
        toastManager.danger($t('admin.face_cleanup_scan_error'));
      }
    } finally {
      scanning = false;
    }
  };

  const handleRescan = () => runScan();

  const handleAdvanced = () => {
    void modalManager.show(AdvancedScanModal, {
      onRun: (params: AdvancedScanParams) => {
        void runScan(params);
      },
    });
  };

  // Bulk-approve migrated off the old single-call `apply` onto a per-person zero-override `resolve`
  // (Slice 6, web part B): a mixed cluster can flag its faces toward different owners, so each person's
  // flagged faces are grouped into `moveToPerson` buckets by their own `suspectedOwnerId` before resolving.
  const resolvePersonToOwners = async (personId: string) => {
    const result = await getFaceRepairPersonFaces({ personId });
    const flaggedFaces =
      (result as unknown as { flaggedFaces: { assetFaceId: string; suspectedOwnerId: string }[] }).flaggedFaces ?? [];
    if (flaggedFaces.length === 0) {
      // An empty resolve 400s (E16) — a person can end up with zero flagged faces between scan and apply
      // (e.g. already resolved elsewhere), so skip it rather than fail the whole batch.
      return;
    }
    // Plain Map: local bookkeeping scoped to this single call, discarded on return.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const moveGroups = new Map<string, string[]>();
    for (const face of flaggedFaces) {
      const group = moveGroups.get(face.suspectedOwnerId);
      if (group) {
        group.push(face.assetFaceId);
      } else {
        moveGroups.set(face.suspectedOwnerId, [face.assetFaceId]);
      }
    }
    const moveToPerson = [...moveGroups.entries()].map(([destinationPersonId, faceIds]) => ({
      destinationPersonId,
      faceIds,
    }));
    await resolveFaces({ faceRepairResolveRequestDto: { personId, moveToPerson } });
  };

  const handleApply = async () => {
    if (!vm || vm.selectedCount === 0 || applying) {
      return;
    }
    applying = true;
    applyError = null;
    try {
      const approvedPersonIds = [...vm.selected];
      await Promise.all(approvedPersonIds.map((personId) => resolvePersonToOwners(personId)));
      toastManager.success($t('admin.face_cleanup_apply_success', { values: { count: approvedPersonIds.length } }));
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      applyError = status === 409 ? $t('admin.face_cleanup_apply_conflict') : $t('admin.face_cleanup_apply_error');
    } finally {
      // Refetch even on a partial/total failure: Promise.all rejects on the FIRST rejection, but sibling
      // resolves already in flight can still have landed server-side — skipping this on error left the table
      // showing stale pre-apply state even though some persons genuinely resolved (D17).
      await fetchLatestScan();
      applying = false;
    }
  };

  const handleOpen = (personId: string) => {
    if (vm) {
      vm.open(personId);
    }
    if (scan) {
      persistOpened(scan.id, new Set([...readPersistedOpened(scan.id), personId]));
    }
  };

  const handleDismiss = async (personId: string) => {
    const person = scan?.persons.find((p) => p.personId === personId);
    if (!person) {
      return;
    }
    const suspectedOwnerIds = person.suspectedOwners.map((o) => o.ownerPersonId);
    try {
      await declineFaceRepair({ faceRepairDeclineRequestDto: { persons: [{ personId, suspectedOwnerIds }] } });
      // The server drains the dismissed person from the latest scan snapshot (createDeclines's persons
      // branch), so trust that snapshot via a refetch rather than only mutating the client-held list.
      await fetchLatestScan();
      toastManager.success($t('admin.face_cleanup_dismiss'));
    } catch {
      toastManager.danger($t('admin.face_cleanup_dismiss_error'));
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) {
      return null;
    }
    return new Date(dateStr).toLocaleString();
  };

  const filterCounts = $derived.by(() => {
    if (!vm) {
      return { all: 0, reviewFirst: 0, confident: 0, named: 0 };
    }
    return {
      all: vm.reviewFirst.length + vm.confident.length,
      reviewFirst: vm.reviewFirst.length,
      confident: vm.confident.length,
      named: [...vm.reviewFirst, ...vm.confident].filter((p) => p.personName != null).length,
    };
  });
</script>

<AdminPageLayout breadcrumbs={[{ title: data.meta.title }]}>
  <div class="mx-auto max-w-screen-xl p-6">
    <!-- Header -->
    <div class="mb-6 flex flex-wrap items-start justify-between gap-6">
      <!-- The description paragraph that used to sit here now lives as the checklist's subtitle: the page was
           already dense, so guidance had to replace prose rather than pile on top of it. -->
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{$t('admin.face_cleanup')}</h1>
      </div>
      <div class="flex flex-none flex-col items-end gap-2">
        {#if scan?.finishedAt}
          <span class="text-xs text-gray-400">
            {$t('admin.face_cleanup_last_scan')} · {formatDate(scan.finishedAt)}
          </span>
        {/if}
        <div class="flex items-center gap-2">
          <Button color="secondary" variant="ghost" size="small" href={Route.faceCleanupResolutions()}>
            {$t('admin.face_cleanup_view_resolutions')}
          </Button>
          <div class="mx-0.5 h-5 w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true"></div>
          <Button
            color="secondary"
            variant="outline"
            size="small"
            disabled={scanning || (!!scan && isActive(scan.status))}
            onclick={handleAdvanced}
            class="gap-2"
          >
            <Icon icon={mdiTune} size="16" />
            {$t('admin.face_cleanup_advanced')}
          </Button>
          <Button
            color="primary"
            size="small"
            disabled={scanning || (!!scan && isActive(scan.status))}
            onclick={handleRescan}
            class="gap-2"
          >
            <Icon icon={mdiRefresh} size="16" />
            {$t('admin.face_cleanup_rescan')}
          </Button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    {#if loading}
      <div class="flex items-center justify-center py-20 text-gray-400">
        <span>{$t('loading')}</span>
      </div>

      <!-- Initial load failed (D17): distinct from "no scan yet" — a network/server error is not the same as
           a clean instance that has never scanned, and rendering it as the latter hides the failure. -->
    {:else if loadError}
      <div
        class="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400"
        data-testid="load-error-banner"
      >
        <span class="flex-1">{$t('admin.face_cleanup_load_error')}</span>
        <Button color="secondary" size="small" onclick={loadInitial} data-testid="load-error-retry">
          {$t('retry')}
        </Button>
      </div>

      <!-- No scan yet -->
    {:else if !scan}
      <div class="rounded-2xl border border-dashed border-gray-200 py-20 text-center dark:border-gray-700">
        <div class="text-lg font-medium text-gray-500">{$t('admin.face_cleanup_empty_no_scan')}</div>
        <p class="mt-2 text-sm text-gray-400">{$t('admin.face_cleanup_empty_no_scan_sub')}</p>
      </div>

      <!-- Scan running / pending: show progress -->
    {:else if isActive(scan.status)}
      <div
        class="rounded-2xl border border-primary-100 bg-primary-50/50 p-8 text-center dark:border-primary-900/30 dark:bg-primary-900/10"
      >
        <div class="mb-3 text-base font-semibold text-primary">
          {scan.status === 'pending' ? $t('admin.face_cleanup_scan_pending') : $t('admin.face_cleanup_scan_running')}
        </div>
        {#if scan.progress}
          <div class="mb-3 text-sm text-gray-500">
            {scan.progress.scanned.toLocaleString()} / {scan.progress.total.toLocaleString()}
            {$t('admin.face_cleanup_faces')}
          </div>
          <div class="mx-auto h-2 max-w-xs overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              class="h-full rounded-full bg-primary transition-all"
              style={`width:${scan.progress.total > 0 ? Math.round((scan.progress.scanned / scan.progress.total) * 100) : 0}%`}
            ></div>
          </div>
        {:else}
          <div class="text-sm text-gray-400">{$t('admin.face_cleanup_scan_preparing')}</div>
        {/if}
      </div>

      <!-- Scan failed -->
    {:else if scan.status === 'failed'}
      <div class="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-900/30 dark:bg-red-900/10">
        <div class="font-semibold text-red-700 dark:text-red-400">{$t('admin.face_cleanup_scan_failed')}</div>
        {#if scan.error}
          <p class="mt-1 font-mono text-xs text-red-500">{scan.error}</p>
        {/if}
        <div class="mt-3">
          <Button color="secondary" onclick={handleRescan} disabled={scanning}>
            {$t('admin.face_cleanup_retry_scan')}
          </Button>
        </div>
      </div>

      <!-- Scan completed -->
    {:else if scan.status === 'completed'}
      <!-- What to do now: the page is dense and, until this, said nothing about what the admin should DO — nor
           that the confident clusters arrive pre-selected. Only worth showing when the scan actually flagged
           someone; the "nothing to clean up" state below speaks for itself. -->
      {#if vm && (vm.reviewFirst.length > 0 || vm.confident.length > 0)}
        <div class="mb-6">
          <ScanChecklist
            reviewFirstTotal={vm.reviewFirst.length}
            reviewFirstOpened={vm.reviewFirst.filter((person) => vm!.opened.has(person.personId)).length}
            confidentTotal={vm.confident.length}
            selectedCount={vm.selectedCount}
          />
        </div>
      {/if}

      <!-- Stat strip -->
      {#if scan.totals}
        {@const tot = scan.totals}
        <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div class="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="flex items-center gap-2 text-xs font-medium text-gray-400">
              <span class="size-2 rounded-full bg-gray-400"></span>
              {$t('admin.face_cleanup_stat_eligible')}
            </div>
            <div class="mt-2 text-2xl font-semibold tabular-nums">{tot.eligibleFaces.toLocaleString()}</div>
            <div class="mt-0.5 text-xs text-gray-400">{$t('admin.face_cleanup_stat_eligible_sub')}</div>
          </div>
          <div class="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="flex items-center gap-2 text-xs font-medium text-amber-500">
              <span class="size-2 rounded-full bg-amber-400"></span>
              {$t('admin.face_cleanup_stat_flagged')}
            </div>
            <div class="mt-2 text-2xl font-semibold tabular-nums">{tot.flaggedFaces.toLocaleString()}</div>
            <div class="mt-0.5 text-xs text-gray-400">
              {$t('admin.face_cleanup_stat_flagged_sub', { values: { count: tot.affectedPersons } })}
            </div>
          </div>
          <div class="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="flex items-center gap-2 text-xs font-medium text-green-600">
              <span class="size-2 rounded-full bg-green-500"></span>
              {$t('admin.face_cleanup_stat_repaired')}
            </div>
            <div class="mt-2 text-2xl font-semibold tabular-nums">{tot.toRepair.toLocaleString()}</div>
            <div class="mt-0.5 text-xs text-gray-400">{$t('admin.face_cleanup_stat_repaired_sub')}</div>
          </div>
          <div class="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="flex items-center gap-2 text-xs font-medium text-primary">
              <span class="size-2 rounded-full bg-primary"></span>
              {$t('admin.face_cleanup_stat_needs_decision')}
            </div>
            <div class="mt-2 text-2xl font-semibold tabular-nums">{tot.reviewOnlyFaces.toLocaleString()}</div>
            <div class="mt-0.5 text-xs text-gray-400">
              {$t('admin.face_cleanup_stat_needs_decision_sub', { values: { count: tot.reviewOnlyPersons } })}
            </div>
          </div>
          <div class="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="flex items-center gap-2 text-xs font-medium text-red-500">
              <span class="size-2 rounded-full bg-red-500"></span>
              {$t('admin.face_cleanup_stat_unattributable')}
            </div>
            <div class="mt-2 text-2xl font-semibold tabular-nums">
              {(tot.reviewOnlyByReason?.unAttributable ?? 0).toLocaleString()}
            </div>
            <div class="mt-0.5 text-xs text-gray-400">{$t('admin.face_cleanup_stat_unattributable_sub')}</div>
          </div>
        </div>
      {/if}

      <!-- Empty completed state: 0 flagged -->
      {#if !vm || (vm.reviewFirst.length === 0 && vm.confident.length === 0)}
        <div class="rounded-2xl border border-dashed border-gray-200 py-20 text-center dark:border-gray-700">
          <div class="text-lg font-medium text-gray-500">{$t('admin.face_cleanup_empty_clean')}</div>
          <p class="mt-2 text-sm text-gray-400">{$t('admin.face_cleanup_empty_clean_sub')}</p>
        </div>
      {:else}
        <!-- Filter toolbar -->
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <div
            class="flex items-center gap-0.5 rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-800"
          >
            {#each ['all', 'review-first', 'confident', 'named'] as const as f (f)}
              <button
                type="button"
                class={[
                  'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold leading-none transition-colors',
                  filter === f
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                ].join(' ')}
                onclick={() => (filter = f)}
              >
                {$t(FILTER_LABEL_KEYS[f])}
                <span class="text-gray-400">
                  {#if f === 'all'}{filterCounts.all}{/if}
                  {#if f === 'review-first'}{filterCounts.reviewFirst}{/if}
                  {#if f === 'confident'}{filterCounts.confident}{/if}
                  {#if f === 'named'}{filterCounts.named}{/if}
                </span>
              </button>
            {/each}
          </div>
          <div
            class="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
          >
            <svg
              class="size-4 flex-none text-gray-300"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
            </svg>
            <input
              bind:value={searchQuery}
              placeholder={$t('admin.face_cleanup_search_placeholder')}
              class="flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none dark:text-gray-200"
            />
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

        <!-- Selection bar -->
        <div
          class="mb-4 flex items-center gap-4 rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3 dark:border-primary-900/30 dark:bg-primary-900/10"
        >
          <span class="text-base font-bold text-primary-600 dark:text-primary-400">
            {$t('admin.face_cleanup_selected', { values: { count: vm.selectedCount } })}
          </span>
          <span class="text-xs text-gray-400 dark:text-gray-500">
            {$t('admin.face_cleanup_selected_hint')}
          </span>
          <span class="flex-1"></span>
          <button
            type="button"
            onclick={() => vm?.clear()}
            class="rounded-xl border border-transparent px-3 py-1.5 text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {$t('admin.face_cleanup_clear')}
          </button>
          <Button color="primary" disabled={vm.selectedCount === 0 || applying} onclick={handleApply}>
            {$t('admin.face_cleanup_apply', { values: { count: vm.selectedCount } })}
          </Button>
        </div>

        <!-- Table -->
        <FaceCleanupTable
          {vm}
          {filter}
          {searchQuery}
          users={data.users}
          onOpen={handleOpen}
          onDismiss={handleDismiss}
        />

        <!-- Footnote -->
        <p class="mt-4 max-w-3xl text-xs text-gray-400 dark:text-gray-500">
          {$t('admin.face_cleanup_footnote')}
        </p>
      {/if}
    {/if}
  </div>
</AdminPageLayout>
