<script lang="ts">
  import AdminPageLayout from '$lib/components/layouts/AdminPageLayout.svelte';
  import { Route } from '$lib/route';
  import { Button, Icon } from '@immich/ui';
  import { mdiAccountSearch, mdiRadar } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  // Local types for the loosely-typed SDK response (mirrors scan/+page.svelte).
  interface ScanTotals {
    flaggedFaces: number;
    affectedPersons: number;
  }

  interface ScanProgress {
    scanned: number;
    total: number;
  }

  interface FaceCleanupScan {
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: ScanProgress | null;
    totals: ScanTotals | null;
    error: string | null;
    finishedAt: string | null;
  }

  type Props = { data: PageData };
  const { data }: Props = $props();

  const scan = $derived(data.scan as unknown as FaceCleanupScan | null);

  // Two presentations (§6.2): first visit has never had a scan; returning has one, in whichever state.
  const firstVisit = $derived(!scan);
  // 409-guard UI half (§7): resolveFaces rejects while a scan runs, so the manual card must be genuinely
  // unusable — not just faded — for the whole time the scan is pending or running.
  const scanRunning = $derived(scan?.status === 'pending' || scan?.status === 'running');
  const scanFailed = $derived(scan?.status === 'failed');
  const flagged = $derived(scan?.totals?.flaggedFaces ?? 0);
  const affectedPersons = $derived(scan?.totals?.affectedPersons ?? 0);
  const userCount = $derived(data.users.length);

  const formatDate = (dateStr: string | null | undefined) => (dateStr ? new Date(dateStr).toLocaleString() : null);
</script>

<AdminPageLayout breadcrumbs={[{ title: data.meta.title }]}>
  <div class="mx-auto max-w-screen-xl p-6">
    {#if firstVisit}
      <!-- First visit: its own explanatory header, not a degraded version of the returning status board. -->
      <div class="mb-6">
        <h1 class="text-2xl font-semibold tracking-tight">{$t('admin.face_cleanup')}</h1>
        <p class="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          {$t('admin.face_cleanup_mode_first_visit_intro')}
        </p>
      </div>
    {:else}
      <div class="mb-6 flex flex-wrap items-start justify-between gap-6">
        <h1 class="text-2xl font-semibold tracking-tight">{$t('admin.face_cleanup')}</h1>
        {#if scan?.finishedAt}
          <span class="text-xs text-gray-400">
            {$t('admin.face_cleanup_last_scan')} · {formatDate(scan.finishedAt)}
          </span>
        {/if}
      </div>
    {/if}

    <!-- Two equal-weight cards, identical footprint. Neither is marked "recommended" (§6.2): we don't know
         which mode a given admin lives in — some triage scans, others spend all their time in manual review. -->
    <div class="grid gap-4 lg:grid-cols-2">
      <!-- Guided card: a status board that happens to be a fork — it carries the scan's live state so an
           admin can see whether guided work is waiting without clicking in. -->
      <div
        class="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
        data-testid="chooser-card-guided"
      >
        <div class="flex items-center gap-2 text-primary">
          <Icon icon={mdiRadar} size="20" />
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">{$t('admin.face_cleanup_mode_guided')}</h2>
        </div>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{$t('admin.face_cleanup_mode_guided_sub')}</p>

        {#if firstVisit}
          <!-- Never scanned: guided needs setup. -->
          <div class="mt-5">
            <div class="flex items-center gap-2 text-xs font-medium text-gray-400">
              <span class="size-2 rounded-full bg-gray-400"></span>
              {$t('admin.face_cleanup_mode_needs_scan')}
            </div>
            <p class="mt-0.5 text-xs text-gray-400">{$t('admin.face_cleanup_mode_needs_scan_sub')}</p>
          </div>
          <Button
            class="mt-5"
            color="primary"
            size="small"
            href={Route.faceCleanupScan()}
            data-testid="chooser-guided-cta"
          >
            {$t('admin.face_cleanup_mode_run_first_scan')}
          </Button>
        {:else if scanRunning}
          <!-- Running/pending: progress + heartbeat. -->
          <div class="mt-5">
            <div class="flex items-center gap-2 text-xs font-medium text-primary">
              <span class="size-2 rounded-full bg-primary"></span>
              {scan?.status === 'pending'
                ? $t('admin.face_cleanup_scan_pending')
                : $t('admin.face_cleanup_scan_running')}
            </div>
            {#if scan?.progress}
              <div class="mt-2 text-2xl font-semibold tabular-nums">
                {scan.progress.scanned.toLocaleString()} / {scan.progress.total.toLocaleString()}
              </div>
              <div class="mt-0.5 text-xs text-gray-400">{$t('admin.face_cleanup_faces')}</div>
            {:else}
              <p class="mt-1 text-xs text-gray-400">{$t('admin.face_cleanup_scan_preparing')}</p>
            {/if}
          </div>
          <Button
            class="mt-5"
            color="secondary"
            variant="outline"
            size="small"
            href={Route.faceCleanupScan()}
            data-testid="chooser-guided-cta"
          >
            {$t('admin.face_cleanup_mode_view_progress')}
          </Button>
        {:else if scanFailed}
          <!-- Failed: red error line. -->
          <div class="mt-5">
            <div class="flex items-center gap-2 text-xs font-medium text-red-500">
              <span class="size-2 rounded-full bg-red-500"></span>
              {$t('admin.face_cleanup_scan_failed')}
            </div>
            {#if scan?.error}
              <p class="mt-1 truncate font-mono text-xs text-red-500">{scan.error}</p>
            {/if}
          </div>
          <Button
            class="mt-5"
            color="secondary"
            size="small"
            href={Route.faceCleanupScan()}
            data-testid="chooser-guided-cta"
          >
            {$t('admin.face_cleanup_mode_view_details')}
          </Button>
        {:else if flagged > 0}
          <!-- Completed, flagged > 0: amber counts. -->
          <div class="mt-5">
            <div class="flex items-center gap-2 text-xs font-medium text-amber-500">
              <span class="size-2 rounded-full bg-amber-400"></span>
              {$t('admin.face_cleanup_stat_flagged')}
            </div>
            <div class="mt-2 text-2xl font-semibold tabular-nums">{flagged.toLocaleString()}</div>
            <div class="mt-0.5 text-xs text-gray-400">
              {$t('admin.face_cleanup_stat_flagged_sub', { values: { count: affectedPersons } })}
            </div>
          </div>
          <Button
            class="mt-5"
            color="primary"
            size="small"
            href={Route.faceCleanupScan()}
            data-testid="chooser-guided-cta"
          >
            {$t('admin.face_cleanup_mode_continue')}
          </Button>
        {:else}
          <!-- Completed, 0 flagged: green "nothing flagged". -->
          <div class="mt-5">
            <div class="flex items-center gap-2 text-xs font-medium text-green-600">
              <span class="size-2 rounded-full bg-green-500"></span>
              {$t('admin.face_cleanup_mode_nothing_flagged')}
            </div>
          </div>
          <Button
            class="mt-5"
            color="secondary"
            size="small"
            href={Route.faceCleanupScan()}
            data-testid="chooser-guided-cta"
          >
            {$t('admin.face_cleanup_rescan')}
          </Button>
        {/if}
      </div>

      <!-- Manual card: disabled while a scan runs (§7 — resolveFaces 409s), otherwise always reachable —
           including on a brand-new instance with no scan at all. -->
      <div
        class={[
          'rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800',
          scanRunning ? 'pointer-events-none opacity-50' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-disabled={scanRunning ? 'true' : undefined}
        data-testid="chooser-card-manual"
      >
        <div class="flex items-center gap-2 text-primary">
          <Icon icon={mdiAccountSearch} size="20" />
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">{$t('admin.face_cleanup_mode_manual')}</h2>
        </div>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{$t('admin.face_cleanup_mode_manual_sub')}</p>

        <div class="mt-5">
          {#if firstVisit}
            <div class="flex items-center gap-2 text-xs font-medium text-green-600">
              <span class="size-2 rounded-full bg-green-500"></span>
              {$t('admin.face_cleanup_mode_manual_no_scan_needed')}
            </div>
          {:else}
            <div class="flex items-center gap-2 text-xs font-medium text-gray-400">
              <span class="size-2 rounded-full bg-gray-400"></span>
              {$t('admin.face_cleanup_mode_manual_user_count', { values: { count: userCount } })}
            </div>
          {/if}
          {#if scanRunning}
            <p class="mt-2 text-xs text-amber-600 dark:text-amber-400">
              {$t('admin.face_cleanup_mode_manual_blocked_scanning')}
            </p>
          {/if}
        </div>

        {#if scanRunning}
          <!-- Genuinely not activatable: no href (so it's never a real link), native `disabled` (so it
               can't be reached by keyboard either) — not just faded with opacity. -->
          <Button class="mt-5" color="secondary" size="small" disabled data-testid="chooser-manual-cta">
            {$t('admin.face_cleanup_mode_browse_people')}
          </Button>
        {:else}
          <Button
            class="mt-5"
            color="secondary"
            variant="outline"
            size="small"
            href={Route.faceCleanupPeople()}
            data-testid="chooser-manual-cta"
          >
            {$t('admin.face_cleanup_mode_browse_people')}
          </Button>
        {/if}
      </div>
    </div>
  </div>
</AdminPageLayout>
