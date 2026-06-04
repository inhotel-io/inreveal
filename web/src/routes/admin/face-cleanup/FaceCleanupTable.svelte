<script lang="ts">
  import { getPeopleThumbnailPath } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiArrowRight, mdiCheckCircle, mdiAlertCircle } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { FaceCleanupModel, FaceCleanupPerson } from './face-cleanup.svelte';

  type Props = {
    vm: FaceCleanupModel;
    filter: 'all' | 'review-first' | 'confident' | 'named';
    searchQuery: string;
    onOpen: (personId: string) => void;
  };

  const { vm, filter, searchQuery, onOpen }: Props = $props();

  const thumbUrl = (personId: string) => `/api${getPeopleThumbnailPath(personId)}`;

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
    class="grid items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:border-gray-700 dark:bg-gray-800"
    style="grid-template-columns: 2.5rem 2.3fr 1.2fr 1.5fr 1.6fr 8rem 6rem"
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
      class="flex items-center gap-2 bg-amber-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
    >
      <Icon path={mdiAlertCircle} size="16" />
      <span>{$t('admin.face_cleanup_group_review')}</span>
      <span class="font-normal normal-case tracking-normal text-gray-400">
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
      class="flex items-center gap-2 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400"
    >
      <Icon path={mdiCheckCircle} size="16" />
      <span>{$t('admin.face_cleanup_group_confident')}</span>
      <span class="font-normal normal-case tracking-normal text-gray-400">
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
  {@const bad = isBadTarget(person)}

  <div
    class={[
      'grid items-center gap-3 border-b border-gray-200 px-4 py-3 text-sm transition-colors last:border-b-0 dark:border-gray-700',
      isSelected ? 'bg-primary-50 dark:bg-primary-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
    ].join(' ')}
    style="grid-template-columns: 2.5rem 2.3fr 1.2fr 1.5fr 1.6fr 8rem 6rem"
  >
    <!-- Checkbox -->
    <div>
      <input
        type="checkbox"
        class="size-5 cursor-pointer rounded accent-primary disabled:cursor-not-allowed disabled:opacity-40"
        checked={isSelected}
        disabled={!canSelect}
        onchange={(e) => handleCheckbox(person, (e.target as HTMLInputElement).checked)}
      />
    </div>

    <!-- Person -->
    <div class="flex min-w-0 items-center gap-3">
      <img
        src={thumbUrl(person.personId)}
        alt=""
        class="size-10 flex-none rounded-xl bg-gray-100 object-cover dark:bg-gray-700"
      />
      <div class="min-w-0">
        {#if person.personName}
          <div class="truncate font-semibold">{person.personName}</div>
        {:else}
          <div class="truncate font-medium italic text-gray-400">{$t('admin.face_cleanup_unnamed')}</div>
        {/if}
        <div class="mt-0.5 font-mono text-xs text-gray-400">
          {person.personId.slice(0, 8)} · {person.faceCount.toLocaleString()}
          {$t('admin.face_cleanup_faces')}
        </div>
      </div>
    </div>

    <!-- Owner (first suspected owner's owner person) -->
    <div class="flex min-w-0 items-center gap-2 text-sm text-gray-500">
      {#if primaryOwner}
        <img
          src={thumbUrl(person.ownerId)}
          alt=""
          class="size-6 flex-none rounded-full bg-gray-100 object-cover dark:bg-gray-700"
        />
        <span class="truncate">{$t('admin.face_cleanup_owner_label')}</span>
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
        <Icon path={mdiArrowRight} size="16" class="flex-none text-gray-300" />
        <img
          src={thumbUrl(primaryOwner.ownerPersonId)}
          alt=""
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
              {reason}
            </span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Review link -->
    <div class="flex justify-end">
      <a
        href="/admin/face-cleanup/{person.personId}"
        onclick={() => onOpen(person.personId)}
        class="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        {$t('admin.face_cleanup_review')}
      </a>
    </div>
  </div>
{/snippet}
