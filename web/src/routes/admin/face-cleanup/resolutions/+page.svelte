<script lang="ts">
  import AdminPageLayout from '$lib/components/layouts/AdminPageLayout.svelte';
  import { Route } from '$lib/route';
  import { getAdminFaceThumbnailUrl } from '$lib/utils/people-utils';
  import { getFaceRepairResolutions, getPeopleThumbnailPath, removeFaceRepairResolutions } from '@immich/sdk';
  import { Button, toastManager } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { handleError } from '$lib/utils/handle-error';

  // A single negative-verdict row: "this face is NOT that person", from either engine. Human PLACEMENTS are
  // deliberately not listed here (the server omits them) — they are unbounded and are undone in context on
  // the per-person review page instead.
  type VerdictSource = 'cleanup' | 'suggestion';
  type ResolutionItem = {
    id: string;
    assetFaceId: string;
    status: string;
    source: VerdictSource | string;
    personId: string | null;
    personName: string | null;
    personThumbnailFaceId: string | null;
    spacePersonId: string | null;
    spacePersonName: string | null;
    spaceName: string | null;
    actorId: string | null;
    actorName: string | null;
    createdAt: string;
  };

  const SOURCE_COLOR: Record<string, string> = {
    cleanup: '#7c3aed', // admin console — violet
    suggestion: '#16a34a', // user review — green
  };

  type SourceFilter = 'all' | VerdictSource;

  let resolutions = $state<ResolutionItem[]>([]);
  let loading = $state(true);
  let loadError = $state(false);
  let sourceFilter = $state<SourceFilter>('all');

  const filtered = $derived(
    sourceFilter === 'all' ? resolutions : resolutions.filter((r) => r.source === sourceFilter),
  );

  // A negative-verdict face has no person↔face join by construction (that's what "not this person" means) —
  // the old person-scoped route's `getRepresentativeFaceForUpdate` join returns nothing for these rows,
  // 404-ing the row's thumbnail structurally. Face-keyed, admin-gated, no join required.
  const faceThumbnailUrl = (faceId: string) => getAdminFaceThumbnailUrl(faceId);
  const personThumbUrl = (personId: string, thumbnailFaceId: string | null) =>
    thumbnailFaceId ? getAdminFaceThumbnailUrl(thumbnailFaceId) : `/api${getPeopleThumbnailPath(personId)}`;
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

  const targetName = (item: ResolutionItem) =>
    item.personName ?? item.spacePersonName ?? $t('admin.face_cleanup_unnamed');

  const load = async () => {
    loadError = false;
    try {
      const result = await getFaceRepairResolutions();
      const dto = result as unknown as { resolutions: ResolutionItem[] };
      resolutions = dto?.resolutions ?? [];
    } catch (error) {
      // D17: a failed load is not the same as a genuinely empty resolutions list — render a distinct error
      // state (below) with a Retry, rather than the reassuring "no decisions recorded yet" empty card.
      loadError = true;
      handleError(error, $t('admin.face_cleanup_resolutions_load_error'));
    } finally {
      loading = false;
    }
  };

  onMount(load);

  const handleUndo = async (item: ResolutionItem) => {
    try {
      await removeFaceRepairResolutions({
        faceRepairResolutionsRemoveRequestDto: { verdictIds: [item.id] },
      });
      toastManager.success($t('admin.face_cleanup_resolutions_undo_success'));
      await load();
    } catch {
      toastManager.danger($t('admin.face_cleanup_undo_error'));
    }
  };

  const filters: { value: SourceFilter; label: string }[] = [
    { value: 'all', label: $t('admin.face_cleanup_resolutions_filter_all') },
    { value: 'cleanup', label: $t('admin.face_cleanup_resolutions_filter_cleanup') },
    { value: 'suggestion', label: $t('admin.face_cleanup_resolutions_filter_suggestion') },
  ];
</script>

<AdminPageLayout
  breadcrumbs={[
    { title: $t('admin.face_cleanup'), href: Route.faceCleanup() },
    { title: $t('admin.face_cleanup_resolutions_title') },
  ]}
>
  <div class="mx-auto max-w-screen-xl p-6">
    <!-- Header -->
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">{$t('admin.face_cleanup_resolutions_title')}</h1>

      <!-- Source filter -->
      <div class="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800" data-testid="source-filter">
        {#each filters as filter (filter.value)}
          <button
            type="button"
            class="rounded-lg px-3 py-1 text-sm font-medium transition-colors"
            class:bg-white={sourceFilter === filter.value}
            class:shadow-sm={sourceFilter === filter.value}
            class:dark:bg-gray-700={sourceFilter === filter.value}
            class:text-gray-500={sourceFilter !== filter.value}
            data-testid="source-filter-option"
            data-value={filter.value}
            aria-pressed={sourceFilter === filter.value}
            onclick={() => (sourceFilter = filter.value)}
          >
            {filter.label}
          </button>
        {/each}
      </div>
    </div>

    {#if loading}
      <div class="flex items-center justify-center py-20 text-gray-400">
        <span>{$t('loading')}</span>
      </div>
    {:else if loadError}
      <div
        class="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400"
        data-testid="load-error-banner"
      >
        <span class="flex-1">{$t('admin.face_cleanup_resolutions_load_error')}</span>
        <Button color="secondary" size="small" onclick={load} data-testid="load-error-retry">
          {$t('retry')}
        </Button>
      </div>
    {:else if filtered.length === 0}
      <div class="rounded-2xl border border-dashed border-gray-200 py-20 text-center dark:border-gray-700">
        <div class="text-lg font-medium text-gray-500">{$t('admin.face_cleanup_resolutions_empty')}</div>
        <div class="mt-4">
          <Button color="secondary" href={Route.faceCleanup()}>{$t('admin.face_cleanup_review_back')}</Button>
        </div>
      </div>
    {:else}
      <div class="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700" data-testid="verdicts-list">
        {#each filtered as item (item.id)}
          <div
            class="flex items-center gap-4 border-b border-gray-200 px-4 py-3 last:border-b-0 dark:border-gray-700"
            data-testid="resolution-row"
            data-source={item.source}
          >
            <!-- Source marker -->
            <span
              class="size-2.5 flex-none rounded-xs"
              style="background: {SOURCE_COLOR[item.source] ?? '#9ca3af'}"
              title={item.source}
            ></span>

            <!-- Face thumbnail: always available (face-keyed, no person↔face join required) -->
            <img
              src={faceThumbnailUrl(item.assetFaceId)}
              alt=""
              class="size-10 flex-none rounded-xl bg-gray-100 object-cover dark:bg-gray-700"
            />

            <!-- Info -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 text-sm">
                <span class="font-semibold">
                  {$t('admin.face_cleanup_resolutions_not_person', { values: { name: targetName(item) } })}
                </span>
                {#if item.spaceName}
                  <span class="text-xs text-gray-400">
                    {$t('admin.face_cleanup_resolutions_in_space', { values: { name: item.spaceName } })}
                  </span>
                {/if}
              </div>
              <div class="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                <span data-testid="source-label">
                  {item.source === 'cleanup'
                    ? $t('admin.face_cleanup_resolutions_source_cleanup')
                    : $t('admin.face_cleanup_resolutions_source_suggestion')}
                </span>
                {#if item.actorName}
                  <span>· {$t('admin.face_cleanup_resolutions_by_actor', { values: { name: item.actorName } })}</span>
                {/if}
                <span>· {formatDate(item.createdAt)}</span>
              </div>
            </div>

            <!-- Target person thumbnail -->
            {#if item.personId}
              <img
                src={personThumbUrl(item.personId, item.personThumbnailFaceId)}
                alt=""
                class="size-8 flex-none rounded-full bg-gray-100 object-cover dark:bg-gray-700"
              />
            {/if}

            <!-- Undo button -->
            <Button color="secondary" size="small" data-testid="undo-button" onclick={() => handleUndo(item)}>
              {$t('admin.face_cleanup_resolutions_undo')}
            </Button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</AdminPageLayout>
