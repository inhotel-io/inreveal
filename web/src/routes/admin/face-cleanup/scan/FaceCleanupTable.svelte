<script lang="ts">
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { Route } from '$lib/route';
  import { getAdminFaceThumbnailUrl } from '$lib/utils/people-utils';
  import { getPeopleThumbnailPath, type UserAdminResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiArrowRight, mdiCheckCircle, mdiAlertCircle } from '@mdi/js';
  import { t, type Translations } from 'svelte-i18n';
  import type { FaceCleanupModel, FaceCleanupPerson } from './face-cleanup.svelte';

  type Props = {
    vm: FaceCleanupModel;
    filter: 'all' | 'review-first' | 'confident' | 'named';
    searchQuery: string;
    users: UserAdminResponseDto[];
    onOpen: (personId: string) => void;
    onDismiss: (personId: string) => void;
  };

  const { vm, filter, searchQuery, users, onOpen, onDismiss }: Props = $props();

  const usersById = $derived(new Map(users.map((u) => [u.id, u])));

  // Admin cleanup renders clusters the admin does not own — the person-scoped thumbnail 404s/403s for
  // those. Prefer the face-keyed admin route; fall back to the person-scoped one only when a row has no
  // thumbnailFaceId (unexpected, but graceful).
  const thumbUrl = (personId: string, thumbnailFaceId: string | null) =>
    thumbnailFaceId ? getAdminFaceThumbnailUrl(thumbnailFaceId) : `/api${getPeopleThumbnailPath(personId)}`;

  const filterPerson = (p: FaceCleanupPerson) => {
    if (filter === 'review-first') {
      return p.recommendation === 'review-first';
    }
    if (filter === 'confident') {
      return p.recommendation === 'confident';
    }
    if (filter === 'named') {
      return p.personName != null;
    }
    return true;
  };

  const matchesSearch = (p: FaceCleanupPerson) => {
    if (!searchQuery) {
      return true;
    }
    const q = searchQuery.toLowerCase();
    const name = (p.personName ?? '').toLowerCase();
    const owner = p.suspectedOwners.map((o) => (o.ownerName ?? '').toLowerCase()).join(' ');
    return name.includes(q) || owner.includes(q);
  };

  const visibleReviewFirst = $derived(vm.reviewFirst.filter((p) => filterPerson(p) && matchesSearch(p)));
  const visibleConfident = $derived(vm.confident.filter((p) => filterPerson(p) && matchesSearch(p)));

  const showReviewGroup = $derived(filter === 'all' || filter === 'review-first' || filter === 'named');
  const showConfidentGroup = $derived(filter === 'all' || filter === 'confident' || filter === 'named');

  const isBadTarget = (p: FaceCleanupPerson) => p.reviewReasons.includes('bad-target');

  // Map server-provided review-reason tags to translated chip labels. Falls back to the raw tag for
  // any future reason the server adds before the web side learns about it.
  const reviewReasonKeys: Record<string, string> = {
    'over-cap': 'admin.face_cleanup_reason_over_cap',
    named: 'admin.face_cleanup_reason_named',
    'large-cluster': 'admin.face_cleanup_reason_large_cluster',
    'multiple-owners': 'admin.face_cleanup_reason_multiple_owners',
    'bad-target': 'admin.face_cleanup_reason_bad_target',
  };

  const pct = (p: FaceCleanupPerson) => Math.round(p.flaggedFraction * 100);

  const handleCheckbox = (p: FaceCleanupPerson, checked: boolean) => {
    if (!vm.canSelect(p.personId)) {
      return;
    }
    if (checked !== vm.selected.has(p.personId)) {
      vm.toggle(p.personId);
    }
  };
</script>

<div class="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
  <!-- Column header -->
  <div
    class="grid items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold tracking-wider text-gray-400 uppercase dark:border-gray-700 dark:bg-gray-800"
    style="grid-template-columns: 2.5rem 2.3fr 1.2fr 1.5fr 1.6fr 8rem 10rem"
  >
    <div></div>
    <div>{$t('admin.face_cleanup_col_person')}</div>
    <div>{$t('admin.face_cleanup_col_owner')}</div>
    <div>{$t('admin.face_cleanup_col_flagged')}</div>
    <div>{$t('admin.face_cleanup_col_suspected_owner')}</div>
    <div>{$t('admin.face_cleanup_col_status')}</div>
    <div></div>
  </div>

  <!-- Review-first group -->
  {#if showReviewGroup && visibleReviewFirst.length > 0}
    <div
      class="flex items-center gap-2 bg-amber-50 px-4 py-3 text-xs font-semibold tracking-wide text-amber-700 uppercase dark:bg-amber-900/20 dark:text-amber-400"
    >
      <Icon icon={mdiAlertCircle} size="16" />
      <span>{$t('admin.face_cleanup_group_review')}</span>
      <span class="font-normal tracking-normal text-gray-400 normal-case">
        {$t('admin.face_cleanup_group_review_sub')}
      </span>
    </div>
    {#each visibleReviewFirst as person (person.personId)}
      {@render personRow(person, 'review-first')}
    {/each}
  {/if}

  <!-- Confident group -->
  {#if showConfidentGroup && visibleConfident.length > 0}
    <div
      class="flex items-center gap-2 bg-gray-50 px-4 py-3 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:bg-gray-800 dark:text-gray-400"
    >
      <Icon icon={mdiCheckCircle} size="16" />
      <span>{$t('admin.face_cleanup_group_confident')}</span>
      <span class="font-normal tracking-normal text-gray-400 normal-case">
        {$t('admin.face_cleanup_group_confident_sub')}
      </span>
    </div>
    {#each visibleConfident as person (person.personId)}
      {@render personRow(person, 'confident')}
    {/each}
  {/if}

  <!-- Empty within filter -->
  {#if visibleReviewFirst.length === 0 && visibleConfident.length === 0}
    <div class="px-6 py-10 text-center text-sm text-gray-400">
      {$t('admin.face_cleanup_no_results')}
    </div>
  {/if}
</div>

{#snippet personRow(person: FaceCleanupPerson, kind: 'review-first' | 'confident')}
  {@const canSelect = vm.canSelect(person.personId)}
  {@const isSelected = vm.selected.has(person.personId)}
  {@const primaryOwner = person.suspectedOwners[0]}
  {@const ownerUser = usersById.get(person.ownerId)}
  {@const bad = isBadTarget(person)}

  <div
    class={[
      'grid items-center gap-3 border-b border-gray-200 px-4 py-3 text-sm transition-colors last:border-b-0 dark:border-gray-700',
      // content-visibility:auto lets the browser skip layout/paint of off-screen rows (native row virtualization,
      // no JS) so hundreds/thousands of flagged persons don't all paint on mount (B3); the intrinsic-size hint
      // keeps the scrollbar stable. Find-in-page and selection still work because the DOM nodes remain present.
      '[content-visibility:auto] [contain-intrinsic-size:auto_4rem]',
      isSelected ? 'bg-primary-50 dark:bg-primary-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
    ].join(' ')}
    style="grid-template-columns: 2.5rem 2.3fr 1.2fr 1.5fr 1.6fr 8rem 10rem"
  >
    <!-- Checkbox -->
    <div>
      <input
        type="checkbox"
        class="size-5 cursor-pointer rounded-sm accent-primary disabled:cursor-not-allowed disabled:opacity-40"
        checked={isSelected}
        disabled={!canSelect}
        onchange={(e) => handleCheckbox(person, (e.target as HTMLInputElement).checked)}
      />
    </div>

    <!-- Person -->
    <div class="flex min-w-0 items-center gap-3">
      <img
        src={thumbUrl(person.personId, person.thumbnailFaceId)}
        alt=""
        loading="lazy"
        class="size-10 flex-none rounded-xl bg-gray-100 object-cover dark:bg-gray-700"
      />
      <div class="min-w-0">
        {#if person.personName}
          <div class="truncate font-semibold">{person.personName}</div>
        {:else}
          <div class="truncate font-medium text-gray-400 italic">{$t('admin.face_cleanup_unnamed')}</div>
        {/if}
        <div class="mt-0.5 font-mono text-xs text-gray-400">
          {person.personId.slice(0, 8)} · {person.faceCount.toLocaleString()}
          {$t('admin.face_cleanup_faces')}
        </div>
      </div>
    </div>

    <!-- Owner (the gallery user whose library this cluster belongs to) -->
    <div class="flex min-w-0 items-center gap-2 text-sm text-gray-500">
      {#if ownerUser}
        <div class="flex-none">
          <UserAvatar user={ownerUser} size="sm" />
        </div>
        <span class="truncate" title={ownerUser.email}>{ownerUser.name}</span>
      {:else}
        <span class="text-gray-300">—</span>
      {/if}
    </div>

    <!-- Flagged % bar -->
    <div class="min-w-0">
      <div class="mb-1 flex items-baseline justify-between">
        <span class="text-base font-bold">{pct(person)}%</span>
        <span class="text-xs text-gray-400">{person.flagged}/{person.faceCount.toLocaleString()}</span>
      </div>
      <div
        class="h-1.5 overflow-hidden rounded-full border border-gray-200 bg-gray-100 dark:border-gray-600 dark:bg-gray-700"
      >
        <div
          class={['h-full rounded-full', bad ? 'bg-red-500' : 'bg-amber-400'].join(' ')}
          style={`width:${pct(person)}%`}
        ></div>
      </div>
    </div>

    <!-- Suspected owner -->
    <div class="flex min-w-0 items-center gap-2">
      {#if primaryOwner}
        <Icon icon={mdiArrowRight} size="16" class="flex-none text-gray-300" />
        <img
          src={thumbUrl(primaryOwner.ownerPersonId, primaryOwner.thumbnailFaceId)}
          alt=""
          loading="lazy"
          class="size-6 flex-none rounded-full bg-gray-100 object-cover dark:bg-gray-700"
        />
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold">
            {primaryOwner.ownerName ?? $t('admin.face_cleanup_unnamed')}
          </div>
          {#if bad}
            <div class="text-xs text-red-500">{$t('admin.face_cleanup_bad_target')}</div>
          {:else}
            <div class="text-xs text-green-600">{primaryOwner.count} {$t('admin.face_cleanup_faces')}</div>
          {/if}
        </div>
      {:else}
        <span class="text-xs text-gray-400">{$t('admin.face_cleanup_unattributable')}</span>
      {/if}
    </div>

    <!-- Status chip + reasons -->
    <div>
      {#if kind === 'review-first'}
        <span
          class="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
        >
          {$t('admin.face_cleanup_chip_review')}
        </span>
      {:else}
        <span
          class="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary dark:bg-primary-900/20"
        >
          {$t('admin.face_cleanup_chip_confident')}
        </span>
      {/if}
      {#if person.reviewReasons.length > 0}
        <div class="mt-1 flex flex-wrap gap-1">
          {#each person.reviewReasons as reason (reason)}
            <span
              class={[
                'rounded-md border px-1.5 py-0.5 text-[10px]',
                reason === 'bad-target'
                  ? 'border-transparent bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400'
                  : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400',
              ].join(' ')}
            >
              {reviewReasonKeys[reason] ? $t(reviewReasonKeys[reason] as Translations) : reason}
            </span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Review link + Dismiss -->
    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        onclick={() => {
          if (
            confirm(
              $t('admin.face_cleanup_dismiss_confirm', { values: { name: person.personName ?? person.personId } }),
            )
          ) {
            onDismiss(person.personId);
          }
        }}
        title={$t('admin.face_cleanup_dismiss')}
        class="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        data-testid="dismiss-btn"
      >
        {$t('admin.face_cleanup_dismiss')}
      </button>
      <a
        href={Route.viewFaceCleanupPerson({ id: person.personId })}
        onclick={() => onOpen(person.personId)}
        class="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        {$t('admin.face_cleanup_review')}
      </a>
    </div>
  </div>
{/snippet}
