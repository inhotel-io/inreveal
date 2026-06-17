<script lang="ts">
  import AdminPageLayout from '$lib/components/layouts/AdminPageLayout.svelte';
  import { Route } from '$lib/route';
  import { getPersonFaceThumbnailUrl } from '$lib/utils/people-utils';
  import { getFaceRepairDeclines, getPeopleThumbnailPath, removeFaceRepairDeclines } from '@immich/sdk';
  import { Button, toastManager } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  type DeclineItem = {
    id: string;
    type: 'face' | 'person';
    assetFaceId: string | null;
    suspectedOwnerId: string | null;
    suspectedOwnerName: string | null;
    suspectedOwnerThumbnailFaceId: string | null;
    personId: string | null;
    personName: string | null;
    personThumbnailFaceId: string | null;
    createdAt: string;
  };

  let declines = $state<DeclineItem[]>([]);
  let loading = $state(true);

  const faceDeclines = $derived(declines.filter((d) => d.type === 'face'));
  const personDeclines = $derived(declines.filter((d) => d.type === 'person'));

  const personThumbUrl = (personId: string) => `/api${getPeopleThumbnailPath(personId)}`;
  const faceThumbnailUrl = (personId: string, faceId: string) => getPersonFaceThumbnailUrl(personId, faceId);

  onMount(async () => {
    try {
      const result = await getFaceRepairDeclines();
      const dto = result as unknown as { declines: DeclineItem[] };
      declines = dto?.declines ?? [];
    } catch {
      // leave empty — graceful state below handles it
    } finally {
      loading = false;
    }
  });

  const handleUndo = async (id: string) => {
    try {
      await removeFaceRepairDeclines({ faceRepairDeclineRemoveRequestDto: { ids: [id] } });
      declines = declines.filter((d) => d.id !== id);
      toastManager.success($t('admin.face_cleanup_declined_undo'));
    } catch {
      toastManager.danger($t('admin.face_cleanup_undo_error'));
    }
  };
</script>

<AdminPageLayout
  breadcrumbs={[
    { title: $t('admin.face_cleanup'), href: Route.faceCleanup() },
    { title: $t('admin.face_cleanup_declined_title') },
  ]}
>
  <div class="mx-auto max-w-screen-xl p-6">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">{$t('admin.face_cleanup_declined_title')}</h1>
    </div>

    {#if loading}
      <div class="flex items-center justify-center py-20 text-gray-400">
        <span>{$t('loading')}</span>
      </div>
    {:else if declines.length === 0}
      <div class="rounded-2xl border border-dashed border-gray-200 py-20 text-center dark:border-gray-700">
        <div class="text-lg font-medium text-gray-500">{$t('admin.face_cleanup_declined_empty')}</div>
        <div class="mt-4">
          <Button color="secondary" href={Route.faceCleanup()}>{$t('admin.face_cleanup_review_back')}</Button>
        </div>
      </div>
    {:else}
      <!-- Face-level declines -->
      {#if faceDeclines.length > 0}
        <div class="mb-8">
          <h2 class="mb-3 text-base font-semibold">{$t('admin.face_cleanup_declined_faces_heading')}</h2>
          <div class="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
            {#each faceDeclines as decline (decline.id)}
              <div
                class="flex items-center gap-4 border-b border-gray-200 px-4 py-3 last:border-b-0 dark:border-gray-700"
              >
                <!-- Face thumbnail -->
                {#if decline.personId && decline.assetFaceId}
                  <img
                    src={faceThumbnailUrl(decline.personId, decline.assetFaceId)}
                    alt=""
                    class="size-10 flex-none rounded-xl bg-gray-100 object-cover dark:bg-gray-700"
                  />
                {:else}
                  <div class="size-10 flex-none rounded-xl bg-gray-100 dark:bg-gray-700"></div>
                {/if}

                <!-- Info -->
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 text-sm">
                    <span class="font-semibold">{decline.personName ?? $t('admin.face_cleanup_unnamed')}</span>
                    <span class="text-gray-400">→</span>
                    <span class="text-gray-600 dark:text-gray-300">
                      {decline.suspectedOwnerName ?? $t('admin.face_cleanup_unnamed')}
                    </span>
                  </div>
                  <div class="mt-0.5 font-mono text-xs text-gray-400">
                    {$t('admin.face_cleanup_declined_face_label', {
                      values: { id: decline.assetFaceId?.slice(0, 8) ?? '—' },
                    })}
                  </div>
                </div>

                <!-- Suspected owner thumbnail -->
                {#if decline.suspectedOwnerId}
                  <img
                    src={personThumbUrl(decline.suspectedOwnerId)}
                    alt=""
                    class="size-8 flex-none rounded-full bg-gray-100 object-cover dark:bg-gray-700"
                  />
                {/if}

                <!-- Undo button -->
                <Button color="secondary" size="small" onclick={() => handleUndo(decline.id)}>
                  {$t('admin.face_cleanup_declined_undo')}
                </Button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Person-level declines (Dismiss) -->
      {#if personDeclines.length > 0}
        <div>
          <h2 class="mb-3 text-base font-semibold">{$t('admin.face_cleanup_declined_people_heading')}</h2>
          <div class="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
            {#each personDeclines as decline (decline.id)}
              <div
                class="flex items-center gap-4 border-b border-gray-200 px-4 py-3 last:border-b-0 dark:border-gray-700"
              >
                <!-- Person thumbnail -->
                {#if decline.personId}
                  <img
                    src={personThumbUrl(decline.personId)}
                    alt=""
                    class="size-10 flex-none rounded-xl bg-gray-100 object-cover dark:bg-gray-700"
                  />
                {:else}
                  <div class="size-10 flex-none rounded-xl bg-gray-100 dark:bg-gray-700"></div>
                {/if}

                <!-- Info -->
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-semibold">
                    {decline.personName ?? $t('admin.face_cleanup_unnamed')}
                  </div>
                  <div class="mt-0.5 font-mono text-xs text-gray-400">
                    {decline.personId?.slice(0, 8) ?? '—'}
                  </div>
                </div>

                <!-- Undo button -->
                <Button color="secondary" size="small" onclick={() => handleUndo(decline.id)}>
                  {$t('admin.face_cleanup_declined_undo')}
                </Button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</AdminPageLayout>
