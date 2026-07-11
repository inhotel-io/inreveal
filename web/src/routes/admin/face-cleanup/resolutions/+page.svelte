<script lang="ts">
  import AdminPageLayout from '$lib/components/layouts/AdminPageLayout.svelte';
  import { Route } from '$lib/route';
  import { getPersonFaceThumbnailUrl } from '$lib/utils/people-utils';
  import { getFaceRepairResolutions, getPeopleThumbnailPath, removeFaceRepairResolutions } from '@immich/sdk';
  import { Button, toastManager } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  type ResolutionKind = 'decline' | 'lock';
  type ResolutionItem = {
    id: string;
    kind: ResolutionKind;
    type: 'face' | 'person' | null;
    assetFaceId: string | null;
    suspectedOwnerId: string | null;
    suspectedOwnerName: string | null;
    suspectedOwnerThumbnailFaceId: string | null;
    personId: string | null;
    personName: string | null;
    personThumbnailFaceId: string | null;
    createdAt: string;
  };

  // Matches the review page's Model B state-color legend (STATE_COLOR in [personId]/+page.svelte): a
  // soft-decline is the "stay" state, a lock is the "lock" state.
  const KIND_COLOR: Record<ResolutionKind, string> = {
    decline: '#16a34a',
    lock: '#7c3aed',
  };

  let resolutions = $state<ResolutionItem[]>([]);
  let loading = $state(true);

  const declines = $derived(resolutions.filter((r) => r.kind === 'decline'));
  const locks = $derived(resolutions.filter((r) => r.kind === 'lock'));

  const personThumbUrl = (personId: string) => `/api${getPeopleThumbnailPath(personId)}`;
  const faceThumbnailUrl = (personId: string, faceId: string) => getPersonFaceThumbnailUrl(personId, faceId);
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

  const load = async () => {
    try {
      const result = await getFaceRepairResolutions();
      const dto = result as unknown as { resolutions: ResolutionItem[] };
      resolutions = dto?.resolutions ?? [];
    } catch {
      // leave empty — graceful state below handles it
    } finally {
      loading = false;
    }
  };

  onMount(load);

  const handleUndo = async (item: ResolutionItem) => {
    try {
      await removeFaceRepairResolutions({
        faceRepairResolutionsRemoveRequestDto:
          item.kind === 'decline' ? { declineIds: [item.id] } : { lockIds: [item.id] },
      });
      toastManager.success($t('admin.face_cleanup_resolutions_undo_success'));
      await load();
    } catch {
      toastManager.danger($t('admin.face_cleanup_undo_error'));
    }
  };
</script>

<AdminPageLayout
  breadcrumbs={[
    { title: $t('admin.face_cleanup'), href: Route.faceCleanup() },
    { title: $t('admin.face_cleanup_resolutions_title') },
  ]}
>
  <div class="mx-auto max-w-screen-xl p-6">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">{$t('admin.face_cleanup_resolutions_title')}</h1>
    </div>

    {#if loading}
      <div class="flex items-center justify-center py-20 text-gray-400">
        <span>{$t('loading')}</span>
      </div>
    {:else if resolutions.length === 0}
      <div class="rounded-2xl border border-dashed border-gray-200 py-20 text-center dark:border-gray-700">
        <div class="text-lg font-medium text-gray-500">{$t('admin.face_cleanup_resolutions_empty')}</div>
        <div class="mt-4">
          <Button color="secondary" href={Route.faceCleanup()}>{$t('admin.face_cleanup_review_back')}</Button>
        </div>
      </div>
    {:else}
      <!-- Declines -->
      <div class="mb-8" data-testid="declines-section">
        <h2 class="mb-3 flex items-center gap-2 text-base font-semibold">
          <span class="size-2.5 flex-none rounded-xs" style="background: {KIND_COLOR.decline}"></span>
          {$t('admin.face_cleanup_resolutions_declines_heading')} ({declines.length})
        </h2>
        {#if declines.length === 0}
          <div
            class="rounded-2xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-gray-700"
          >
            {$t('admin.face_cleanup_resolutions_declines_empty')}
          </div>
        {:else}
          <div class="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
            {#each declines as item (item.id)}
              <div
                class="flex items-center gap-4 border-b border-gray-200 px-4 py-3 last:border-b-0 dark:border-gray-700"
                data-testid="resolution-row"
                data-kind="decline"
              >
                <!-- Thumbnail -->
                {#if item.type === 'face' && item.personId && item.assetFaceId}
                  <img
                    src={faceThumbnailUrl(item.personId, item.assetFaceId)}
                    alt=""
                    class="size-10 flex-none rounded-xl bg-gray-100 object-cover dark:bg-gray-700"
                  />
                {:else if item.personId}
                  <img
                    src={personThumbUrl(item.personId)}
                    alt=""
                    class="size-10 flex-none rounded-xl bg-gray-100 object-cover dark:bg-gray-700"
                  />
                {:else}
                  <div class="size-10 flex-none rounded-xl bg-gray-100 dark:bg-gray-700"></div>
                {/if}

                <!-- Info -->
                <div class="min-w-0 flex-1">
                  {#if item.type === 'face'}
                    <div class="flex items-center gap-2 text-sm">
                      <span class="font-semibold">{item.personName ?? $t('admin.face_cleanup_unnamed')}</span>
                      <span class="text-gray-400">→</span>
                      <span class="text-gray-600 dark:text-gray-300">
                        {item.suspectedOwnerName ?? $t('admin.face_cleanup_unnamed')}
                      </span>
                    </div>
                    <div class="mt-0.5 font-mono text-xs text-gray-400">
                      {$t('admin.face_cleanup_resolutions_face_label', {
                        values: { id: item.assetFaceId?.slice(0, 8) ?? '—' },
                      })}
                    </div>
                  {:else}
                    <div class="text-sm font-semibold">{item.personName ?? $t('admin.face_cleanup_unnamed')}</div>
                  {/if}
                  <div class="mt-0.5 text-xs text-gray-400">{formatDate(item.createdAt)}</div>
                </div>

                <!-- Suspected owner thumbnail -->
                {#if item.type === 'face' && item.suspectedOwnerId}
                  <img
                    src={personThumbUrl(item.suspectedOwnerId)}
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

      <!-- Locks -->
      <div data-testid="locks-section">
        <h2 class="mb-3 flex items-center gap-2 text-base font-semibold">
          <span class="size-2.5 flex-none rounded-xs" style="background: {KIND_COLOR.lock}"></span>
          {$t('admin.face_cleanup_resolutions_locks_heading')} ({locks.length})
        </h2>
        {#if locks.length === 0}
          <div
            class="rounded-2xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-gray-700"
          >
            {$t('admin.face_cleanup_resolutions_locks_empty')}
          </div>
        {:else}
          <div class="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
            {#each locks as item (item.id)}
              <div
                class="flex items-center gap-4 border-b border-gray-200 px-4 py-3 last:border-b-0 dark:border-gray-700"
                data-testid="resolution-row"
                data-kind="lock"
              >
                <!-- Face thumbnail -->
                {#if item.personId && item.assetFaceId}
                  <img
                    src={faceThumbnailUrl(item.personId, item.assetFaceId)}
                    alt=""
                    class="size-10 flex-none rounded-xl bg-gray-100 object-cover dark:bg-gray-700"
                  />
                {:else}
                  <div class="size-10 flex-none rounded-xl bg-gray-100 dark:bg-gray-700"></div>
                {/if}

                <!-- Info -->
                <div class="min-w-0 flex-1">
                  <div class="text-sm">
                    {$t('admin.face_cleanup_resolutions_locked_to', {
                      values: { name: item.personName ?? $t('admin.face_cleanup_unnamed') },
                    })}
                  </div>
                  <div class="mt-0.5 text-xs text-gray-400">{formatDate(item.createdAt)}</div>
                </div>

                <!-- Person thumbnail -->
                {#if item.personId}
                  <img
                    src={personThumbUrl(item.personId)}
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
    {/if}
  </div>
</AdminPageLayout>
