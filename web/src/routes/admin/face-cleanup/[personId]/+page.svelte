<script lang="ts">
  import AdminPageLayout from '$lib/components/layouts/AdminPageLayout.svelte';
  import { Route } from '$lib/route';
  import { getAdminFaceThumbnailUrl } from '$lib/utils/people-utils';
  import {
    getFaceRepairClusterFaces,
    getFaceRepairPersonFaces,
    getLatestScan,
    getPeopleThumbnailPath,
    isHttpError,
    resolveFaces,
    type FaceRepairResolveRequestDto,
  } from '@immich/sdk';
  import { Button, Icon, modalManager, toastManager } from '@immich/ui';
  import { mdiArrowLeft, mdiArrowRight, mdiCheckBold, mdiClose, mdiInformationOutline } from '@mdi/js';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { t } from 'svelte-i18n';
  import { getServerErrorMessage, handleError } from '$lib/utils/handle-error';
  import ActionsHelpModal from './ActionsHelpModal.svelte';
  import type { PageData } from './$types';
  import PersonPicker from './PersonPicker.svelte';
  import {
    createReviewModel,
    STATE_COLOR,
    STATE_ICON,
    type FaceEntry,
    type FaceState,
    type FlaggedFace,
  } from './review.svelte';

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
  let loadError = $state(false);
  let applying = $state(false);
  let applyError = $state<string | null>(null);

  // Rest-of-cluster (server-paginated, add-faces feature): faces the scan never flagged, which the admin can add
  // to the move. This selection STAGES into the dock's single Apply — it does not commit on its own. It used to
  // fire its own independent resolve, which settled none of the flagged snapshot yet still closed the person out
  // of the console, silently discarding every staged flagged decision (they came back on the next scan). The
  // server now refuses to drain on such a resolve; the client no longer makes one. "Move entire cluster" stays a
  // separate, explicit commit — it moves ALL eligible faces, flagged ones included.
  const REST_PAGE_SIZE = 48;
  let restFaces = $state<{ assetFaceId: string }[]>([]);
  let restTotal = $state(0);
  let restPage = $state(0);
  let restHasMore = $state(false);
  let restLoading = $state(false);
  const restSelected = new SvelteSet<string>();
  let showEntireConfirm = $state(false);
  let showDetachConfirm = $state(false);

  // An entire-cluster move covers ALL eligible faces: the Rest (which excludes the flagged ids) plus the
  // still-flagged faces. This is why "Move entire cluster" works even when the Rest is empty.
  const clusterTotal = $derived(restTotal + flaggedFaces.length);

  // Lazy-load chunk size for the flagged grid — selection/Apply always act on the full flagged set (via the
  // review model), independent of how much is currently rendered.
  const CHUNK_SIZE = 48;
  // Cap on the RAW (untranslatable) server text rendered in the apply banner — see commitResolve.
  const MAX_ERROR_REASON_LENGTH = 300;
  // Contract with FaceRepairResolveErrorCode in face-repair.service.ts. These are the resolve failures an admin
  // can actually hit, so they get real translated sentences rather than the server's English developer text.
  const REASON_KEY_BY_CODE: Record<string, string> = {
    'face-repair:person-not-found': 'admin.face_cleanup_review_apply_reason_person_gone',
    'face-repair:destination-missing': 'admin.face_cleanup_review_apply_reason_destination_gone',
    'face-repair:faces-not-in-snapshot': 'admin.face_cleanup_review_apply_reason_stale',
    'face-repair:faces-not-eligible': 'admin.face_cleanup_review_apply_reason_stale',
  };
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

  // Admin cleanup/resolutions render clusters the admin does not own, and a negative-verdict face has no
  // person↔face join at all — the person-scoped thumbnail routes 404/403 for those. Face-keyed, admin-gated,
  // no join required.
  const personThumbUrl = (id: string, thumbnailFaceId: string | null) =>
    thumbnailFaceId ? getAdminFaceThumbnailUrl(thumbnailFaceId) : `/api${getPeopleThumbnailPath(id)}`;
  const faceThumbnailUrl = (faceId: string) => getAdminFaceThumbnailUrl(faceId);

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
      case 'unknown': {
        return $t('admin.face_cleanup_review_tile_unknown_ribbon');
      }
    }
  };

  const loadPersonData = async () => {
    loading = true;
    loadError = false;
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
    } catch (error) {
      // D17: a failed load is not the same as "this person has no flagged faces" (a genuine, graceful empty
      // state below) — render a distinct error state with a Retry instead.
      loadError = true;
      handleError(error, $t('admin.face_cleanup_review_load_error'));
    } finally {
      loading = false;
    }
  };

  onMount(loadPersonData);

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

  const handleBulkDetach = () => {
    vm.applyToSelection('detach');
  };

  const handleBulkUnknown = () => {
    vm.applyToSelection('unknown');
  };

  // The six bulk actions carry terse labels and no explanation of what they do on apply. Two entry points open
  // the same modal: the banner (always visible, so a confused admin finds it BEFORE selecting anything) and the
  // bulk bar (which only exists once a face is selected, i.e. mid-task). Read-only — it never touches the
  // review model, so an open/close leaves the selection and the staged states exactly as they were.
  const handleOpenHelp = () => {
    void modalManager.show(ActionsHelpModal, {});
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
    await commitResolve({ personId, entireCluster: { destinationPersonId: ownerPersonId } });
  };

  const handleCancel = () => {
    void goto(Route.faceCleanupScan());
  };

  // Every resolve on this page funnels through here, so a failure can never again be swallowed: the whole-cluster
  // move used to `catch {}` the server's 409 ("Refusing to apply while a scan is in progress"), leaving the admin
  // with no banner, nothing moved, and the belief that it had worked — the same faces then came back on the next
  // scan. On success we report what the server actually DID (its own counts) rather than blind-navigating.
  // The fields this page reads off a failed resolve. Deliberately loose: `code` is a fork-only addition and
  // Zod's `maximum` is not in the SDK's `ApiValidationError`, so both are validated at the use site.
  type ApplyErrorData = { code?: unknown; errors?: { code?: unknown; maximum?: unknown }[] };

  const parseErrorData = (data: unknown): ApplyErrorData | undefined => {
    // Errors from endpoints without a return type arrive as an unparsed JSON string (same case handle-error.ts
    // covers) — a raw string would silently read as "no code, no issues" and lose the translation.
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as ApplyErrorData;
      } catch {
        return undefined;
      }
    }
    return (data ?? undefined) as ApplyErrorData | undefined;
  };

  // Turn a failed resolve into the most translatable sentence we can, in this order:
  //   1. a stable server reason code   → a real, translated explanation of what changed under the page;
  //   2. a Zod `too_big` issue         → a translated "too many faces" with the server's own limit;
  //   3. the server's raw message      → English, but a truthful reason beats a reason-less banner;
  //   4. nothing at all (offline, 502) → the original generic sentence.
  // Only 3 stays untranslated, and it is reachable only through failures the UI cannot itself produce.
  const describeApplyFailure = (error: unknown): string => {
    const data = isHttpError(error) ? parseErrorData(error.data) : undefined;

    const reasonKey = typeof data?.code === 'string' ? REASON_KEY_BY_CODE[data.code] : undefined;
    if (reasonKey) {
      return $t('admin.face_cleanup_review_apply_error_reason', { values: { reason: $t(reasonKey) } });
    }

    const tooBig = data?.errors?.find((issue) => issue?.code === 'too_big');
    if (tooBig && typeof tooBig.maximum === 'number') {
      return $t('admin.face_cleanup_review_apply_error_reason', {
        values: { reason: $t('admin.face_cleanup_review_apply_reason_too_many', { values: { max: tooBig.maximum } }) },
      });
    }

    // Truncated: a per-face validation failure produces ONE issue per offending id, and this page's buckets run
    // to thousands of faces — pasting all of them in would push the banner past the content it warns about.
    const serverMessage = getServerErrorMessage(error)?.toString().slice(0, MAX_ERROR_REASON_LENGTH);
    return serverMessage
      ? $t('admin.face_cleanup_review_apply_error_reason', { values: { reason: serverMessage } })
      : $t('admin.face_cleanup_review_apply_error');
  };

  const commitResolve = async (request: FaceRepairResolveRequestDto) => {
    if (applying) {
      return;
    }
    applying = true;
    applyError = null;
    try {
      const result = await resolveFaces({ faceRepairResolveRequestDto: request });
      toastManager.primary(
        $t('admin.face_cleanup_review_apply_summary', {
          values: {
            moved: result.moved,
            kept: result.declined,
            locked: result.locked,
            detached: result.detached,
            unknown: result.unknown,
            skipped: result.skipped,
          },
        }),
      );
      void goto(Route.faceCleanupScan());
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      // 409 is the one failure with a genuine "try again later" remedy, so it keeps its own tailored wording.
      // Everything else used to collapse into one reason-less sentence, which is how a hard, permanent failure
      // (a validation ceiling the payload can never satisfy) read exactly like a transient blip and sent admins
      // into retry loops. Now the banner says why — in the admin's own language wherever the server gave us
      // something stable to translate from.
      applyError = status === 409 ? $t('admin.face_cleanup_review_apply_conflict') : describeApplyFailure(error);
    } finally {
      applying = false;
    }
  };

  // The ONE terminal action: every flagged face's staged state, plus any rest-of-cluster faces the admin ticked,
  // in a single resolve. Splitting these into two resolves is what let a rest-move settle none of the flagged
  // snapshot and still close the person out of the console.
  const buildApplyRequest = () =>
    vm.buildResolveRequest(
      personId,
      ownerPersonId && restSelected.size > 0
        ? { destinationPersonId: ownerPersonId, faceIds: [...restSelected] }
        : undefined,
    );

  // "Not a face" is the one IRREVERSIBLE action on this page: it retires the detected face for good, and there
  // is no undo for it anywhere in the app (declines and locks have one on the Resolutions page; a detached face
  // does not). It also sits directly next to "Unknown person" in the bulk bar, and the two mean opposite things
  // — bin this crop vs. this is a real person I can't name. A slip between those two buttons destroys real face
  // data, so an Apply carrying any detached face has to be confirmed first. Everything else applies straight
  // through: a confirmation on every Apply would train the admin to click past it, which is how you lose the
  // one warning that matters.
  const handleApply = () => {
    if (vm.tally.detach > 0) {
      showDetachConfirm = true;
      return;
    }
    return commitResolve(buildApplyRequest());
  };

  const confirmDestructiveApply = async () => {
    showDetachConfirm = false;
    await commitResolve(buildApplyRequest());
  };
</script>

<AdminPageLayout
  breadcrumbs={[{ title: $t('admin.face_cleanup'), href: Route.faceCleanupScan() }, { title: personName }]}
>
  <div class="mx-auto max-w-screen-xl p-6">
    <!-- Back link -->
    <a
      href={Route.faceCleanupScan()}
      class="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
    >
      <Icon icon={mdiArrowLeft} size="16" />
      {$t('admin.face_cleanup_review_back')}
    </a>

    <!-- Title row -->
    <div class="mb-6 flex items-center gap-4">
      {#if !loading && scanPerson}
        <img
          src={personThumbUrl(personId, scanPerson.thumbnailFaceId)}
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
    {:else if loadError}
      <!-- Initial load failed (D17): distinct from "no flagged faces" — a network/server error is not the
           same as a stale/already-resolved cluster, and rendering it as the latter hides the failure. -->
      <div
        class="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400"
        data-testid="load-error-banner"
      >
        <span class="flex-1">{$t('admin.face_cleanup_review_load_error')}</span>
        <Button color="secondary" size="small" onclick={loadPersonData} data-testid="load-error-retry">
          {$t('retry')}
        </Button>
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
        <div class="flex-1">
          <h3 class="mb-1 text-sm font-semibold">
            {$t('admin.face_cleanup_review_banner_title', { values: { count: flaggedFaces.length } })}
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {$t('admin.face_cleanup_review_banner_body', { values: { ownerName } })}
          </p>
        </div>
        <!-- Plain button, not <IconButton>: @immich/ui wraps any titled button in a Tooltip, which needs a
             TooltipProvider from the app root — absent when this page is rendered in isolation. A native title
             gives the same hover hint, and plain buttons are already this page's idiom. -->
        <button
          type="button"
          onclick={handleOpenHelp}
          aria-label={$t('admin.face_cleanup_review_help_open')}
          title={$t('admin.face_cleanup_review_help_open')}
          class="flex-none rounded-full p-1.5 text-amber-600 transition-colors hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
          data-testid="banner-help"
        >
          <Icon icon={mdiInformationOutline} size="18" />
        </button>
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
              <!-- State indicator: its own icon per state, never colour alone (owner/stay/other used to share
                   one check mark, so indigo-vs-violet was all that separated "moved away" from "locked here"). -->
              <div
                class="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-md border-2 border-white shadow-sm"
                style="background: {STATE_COLOR[face.state]}"
                data-state-icon={face.state}
              >
                <Icon icon={STATE_ICON[face.state]} size="11" color="white" />
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

      <!-- Rest of this cluster (paginated, add-faces feature — posts through resolve) -->
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
            <!-- Staged, not committed: these ride the dock's single Apply along with the flagged faces. -->
            <span class="text-xs font-semibold text-primary" data-testid="rest-staged">
              {$t('admin.face_cleanup_review_rest_staged', { values: { count: restSelected.size } })}
            </span>
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

  <!-- Dock: swaps between the outcome-tally summary and the bulk action bar (Model B mockup). Rendered through
       AdminPageLayout's `footer` slot, i.e. as a sibling of the scroll area rather than inside it. It used to be
       `sticky bottom-0` within the content, which only pins while there is something to scroll: on a short review
       (a handful of flagged faces) the page doesn't overflow, sticky is inert, and the bar came to rest wherever
       the content happened to end — floating in the middle of the page. As a footer it is pinned at every content
       length, the grid scrolls above it instead of under it, and it still never overlaps the sidebar (which is why
       `fixed` was rejected). The content no longer needs `pb-32` to reserve space for it either. -->
  {#snippet footer()}
    {#if !loading && flaggedFaces.length > 0}
      <div
        class="shrink-0 border-t border-gray-200 bg-white py-3.5 dark:border-gray-700 dark:bg-gray-900"
        data-testid="dock"
      >
        <div class="mx-auto flex max-w-screen-xl flex-wrap items-center gap-3.5 px-6">
          {#if vm.selectedCount === 0}
            <!-- Summary state -->
            <div class="flex flex-1 flex-wrap items-center gap-3.5" data-testid="tally">
              {#each ['owner', 'stay', 'lock', 'other', 'unknown', 'detach'] as FaceState[] as state (state)}
                {@const count = vm.tally[state]}
                <span
                  class={[
                    'inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-bold dark:border-gray-700 dark:bg-gray-800',
                    count === 0 ? 'opacity-40' : '',
                  ].join(' ')}
                >
                  <Icon icon={STATE_ICON[state]} size="13" color={STATE_COLOR[state]} />
                  <span>{count}</span>
                  <span class="font-normal text-gray-500 dark:text-gray-400">
                    {state === 'owner'
                      ? $t('admin.face_cleanup_review_tally_owner', { values: { name: ownerName } })
                      : $t(`admin.face_cleanup_review_tally_${state}`)}
                  </span>
                </span>
              {/each}
              {#if restSelected.size > 0}
                <!-- Rest-of-cluster faces the admin added: part of the same Apply, so the dock must account for
                   them too — otherwise the count lies about what the button is going to do. -->
                <span
                  class="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-bold text-primary"
                  data-testid="tally-added"
                >
                  <span>+{restSelected.size}</span>
                  <span class="font-normal">{$t('admin.face_cleanup_review_tally_added')}</span>
                </span>
              {/if}
              <span class="inline-flex items-center gap-1.5 text-xs font-bold text-green-600">
                <Icon icon={mdiCheckBold} size="13" />
                {$t('admin.face_cleanup_review_tally_all_set')}
              </span>
            </div>
            <Button color="primary" disabled={applying} onclick={handleApply} data-testid="apply-btn">
              <Icon icon={mdiArrowRight} size="16" />
              {restSelected.size > 0
                ? $t('admin.face_cleanup_review_apply_label_added', {
                    values: { count: vm.total, added: restSelected.size },
                  })
                : $t('admin.face_cleanup_review_apply_label', { values: { count: vm.total } })}
            </Button>
          {:else}
            <!-- Bulk-bar state: the routing choices for the selected faces. The previous text-xs buttons on the
                 dark bar read as small/hidden (reported) — these are larger, each with a defining inset ring and
                 a bigger hit area; the destructive "not a face" is tinted red, apart from the routine routes. -->
            {@const bulkBtn =
              'inline-flex items-center gap-2 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/15 ring-inset transition-colors hover:bg-white/20'}
            <div
              class="flex flex-1 flex-wrap items-center gap-2 rounded-2xl bg-gray-900 px-4 py-3 text-white dark:bg-gray-950"
              data-testid="bulk-bar"
            >
              <span class="mr-1 text-base font-bold whitespace-nowrap">
                {vm.selectedCount}
                {$t('admin.face_cleanup_review_bulk_selected_suffix')}
              </span>
              <span class="h-6 w-px bg-white/15"></span>
              <button type="button" onclick={handleBulkOwner} class={bulkBtn}>
                <Icon icon={STATE_ICON.owner} size="16" />
                {$t('admin.face_cleanup_review_bulk_owner')}
              </button>
              <button type="button" onclick={handleBulkStay} class={bulkBtn} data-testid="bulk-stay">
                <Icon icon={STATE_ICON.stay} size="16" />
                {$t('admin.face_cleanup_review_bulk_stay')}
              </button>
              <button type="button" onclick={handleBulkLock} class={bulkBtn} data-testid="bulk-lock">
                <Icon icon={STATE_ICON.lock} size="16" />
                {$t('admin.face_cleanup_review_bulk_lock')}
              </button>
              <button type="button" onclick={handleBulkOther} class={bulkBtn} data-testid="bulk-other">
                <Icon icon={STATE_ICON.other} size="16" />
                {$t('admin.face_cleanup_review_bulk_other')}
              </button>
              <!-- Sits next to "Move to…" because it is the same decision one step further: the admin knows the
                 face does not belong here but has nobody to route it to. Without it the only honest-looking exits
                 are all wrong, and the review cannot be finished. -->
              <button type="button" onclick={handleBulkUnknown} class={bulkBtn} data-testid="bulk-unknown">
                <Icon icon={STATE_ICON.unknown} size="16" />
                {$t('admin.face_cleanup_review_bulk_unknown')}
              </button>
              <button
                type="button"
                onclick={handleBulkDetach}
                class="inline-flex items-center gap-2 rounded-lg bg-red-500/15 px-3.5 py-2 text-sm font-semibold text-red-100 ring-1 ring-red-400/30 transition-colors ring-inset hover:bg-red-500/25"
                data-testid="bulk-detach"
              >
                <Icon icon={STATE_ICON.detach} size="16" />
                {$t('admin.face_cleanup_review_bulk_detach')}
              </button>
              <!-- Same modal as the banner's (i). A plain button rather than <IconButton>: the bar is a dark
                 surface, and the @immich/ui ghost variant styles for the page background, not for this one. -->
              <button
                type="button"
                onclick={handleOpenHelp}
                aria-label={$t('admin.face_cleanup_review_help_open')}
                title={$t('admin.face_cleanup_review_help_open')}
                class="inline-flex items-center rounded-lg bg-white/10 p-2 ring-1 ring-white/15 ring-inset hover:bg-white/20"
                data-testid="bulk-help"
              >
                <Icon icon={mdiInformationOutline} size="16" />
              </button>
              <button
                type="button"
                onclick={() => vm.clearSelection()}
                class="ml-auto text-sm font-bold text-gray-300 hover:text-white"
                data-testid="clear"
              >
                {$t('admin.face_cleanup_review_bulk_clear')}
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/snippet}

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

  <!-- The only destructive confirmation on this page. `danger` on the CTA, not `primary`: this button is the one
       that cannot be taken back, and it must not look like the routine Apply the admin has already clicked a
       dozen times. Cancel returns to the review with every staged state intact — nothing is committed. -->
  {#if showDetachConfirm}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-testid="detach-confirm">
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
        <h3 class="text-lg font-semibold">
          {$t('admin.face_cleanup_review_detach_confirm_title', { values: { count: vm.tally.detach } })}
        </h3>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {$t('admin.face_cleanup_review_detach_confirm_body', { values: { count: vm.tally.detach } })}
        </p>
        <div class="mt-5 flex justify-end gap-3">
          <Button color="secondary" onclick={() => (showDetachConfirm = false)} data-testid="detach-confirm-cancel">
            {$t('admin.face_cleanup_review_cancel')}
          </Button>
          <Button color="danger" onclick={confirmDestructiveApply} data-testid="detach-confirm-cta">
            {$t('admin.face_cleanup_review_detach_confirm_cta', { values: { count: vm.tally.detach } })}
          </Button>
        </div>
      </div>
    </div>
  {/if}
</AdminPageLayout>
