<script lang="ts">
  import {
    createFaceRepairOwnerPerson,
    getFaceRepairOwnerPeople,
    getPeopleThumbnailPath,
    type FaceRepairOwnerPeopleResponseDto,
  } from '@immich/sdk';
  import { Icon, Modal, ModalBody } from '@immich/ui';
  import { mdiMagnify, mdiPlus } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  // Owner-scoped move-to-chosen-person picker (Slice 4). Reads the mockup
  // (docs/plans/2026-07-10-face-cleanup-resolution-mockup.html #modalBg) as the visual source of truth:
  // title "Move N faces to…", subtitle, a search box, owner-scoped rows (named people + unnamed clusters),
  // a "Create new person" row once a query is typed, and a "No matches" empty state.
  export interface PersonPickerDestination {
    personId: string;
    name: string;
  }

  type OwnerPerson = FaceRepairOwnerPeopleResponseDto['people'][number];

  type Props = {
    ownerId: string;
    faceCount: number;
    // The cluster's primary suspected owner (already selected by the default `owner` state) — shown with a
    // "this scan's suggestion" subtitle instead of a face count, matching the mockup's Paul Friedrich
    // Meischner row. Optional: a picker opened without scan context just omits the callout.
    suggestedPersonId?: string | null;
    onClose: (destination?: PersonPickerDestination) => void;
  };

  const { ownerId, faceCount, suggestedPersonId = null, onClose }: Props = $props();

  let query = $state('');
  let people = $state<OwnerPerson[]>([]);
  let loading = $state(true);
  let loadError = $state(false);
  let creating = $state(false);
  let createError = $state(false);

  const trimmedQuery = $derived(query.trim());
  const showEmpty = $derived(!loading && !loadError && people.length === 0 && trimmedQuery.length === 0);

  const unnamedLabel = () => $t('admin.face_cleanup_review_unnamed');
  const displayName = (name: string) => (name.trim() ? name : unnamedLabel());
  const shortId = (id: string) => id.slice(0, 8);
  const thumbUrl = (personId: string) => `/api${getPeopleThumbnailPath(personId)}`;

  // Guards against a stale response landing after a newer keystroke's request (no debounce — the owner
  // people list is admin-scale, not a hot path per FaceRepairRepository.searchOwnerPeople).
  let requestToken = 0;

  const search = async (rawQuery: string) => {
    const token = ++requestToken;
    loading = true;
    loadError = false;
    try {
      const result = await getFaceRepairOwnerPeople({ ownerId, page: 0, query: rawQuery || undefined });
      if (token !== requestToken) {
        return;
      }
      people = result.people;
    } catch {
      if (token !== requestToken) {
        return;
      }
      loadError = true;
      people = [];
    } finally {
      if (token === requestToken) {
        loading = false;
      }
    }
  };

  onMount(() => {
    void search('');
  });

  const handleSearchInput = () => {
    void search(trimmedQuery);
  };

  const choosePerson = (person: OwnerPerson) => {
    onClose({ personId: person.id, name: displayName(person.name) });
  };

  const createNew = async () => {
    if (!trimmedQuery || creating) {
      return;
    }
    creating = true;
    createError = false;
    try {
      const result = await createFaceRepairOwnerPerson({
        ownerId,
        faceRepairOwnerPersonCreateRequestDto: { name: trimmedQuery },
      });
      onClose({ personId: result.id, name: trimmedQuery });
    } catch {
      // E8: creation failed — leave the selection untouched (nothing applied) and surface the error inline;
      // the picker stays open so the admin can retry.
      createError = true;
    } finally {
      creating = false;
    }
  };
</script>

<Modal title={$t('admin.face_cleanup_review_picker_title', { values: { count: faceCount } })} {onClose} size="small">
  <ModalBody>
    <div data-testid="person-picker" class="flex flex-col gap-3">
      <p class="-mt-2 text-xs text-gray-500 dark:text-gray-400">
        {$t('admin.face_cleanup_review_picker_subtitle')}
      </p>

      <div class="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
        <Icon icon={mdiMagnify} size="16" class="flex-none text-gray-400" />
        <input
          type="text"
          class="w-full border-none bg-transparent p-0 text-sm outline-none"
          placeholder={$t('admin.face_cleanup_review_picker_search_placeholder')}
          bind:value={query}
          oninput={handleSearchInput}
          data-testid="person-picker-search"
        />
      </div>

      {#if createError}
        <p class="text-xs font-medium text-red-600 dark:text-red-400" data-testid="person-picker-create-error">
          {$t('admin.face_cleanup_review_picker_create_error')}
        </p>
      {/if}
      {#if loadError}
        <p class="text-xs font-medium text-red-600 dark:text-red-400" data-testid="person-picker-load-error">
          {$t('admin.face_cleanup_review_picker_load_error')}
        </p>
      {/if}

      <div class="max-h-72 overflow-y-auto">
        {#each people as person (person.id)}
          {@const suggested = person.id === suggestedPersonId}
          {@const unnamed = !person.name.trim()}
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
            onclick={() => choosePerson(person)}
            data-testid={`person-picker-row-${person.id}`}
          >
            <img
              src={thumbUrl(person.id)}
              alt=""
              class="size-9 flex-none rounded-xl bg-gray-100 object-cover dark:bg-gray-700"
            />
            <div class="min-w-0">
              <div class="truncate text-sm font-bold">{displayName(person.name)}</div>
              <div class={['truncate text-[11.5px] text-gray-400', unnamed && !suggested ? 'font-mono' : ''].join(' ')}>
                {#if suggested}
                  {$t('admin.face_cleanup_review_picker_suggestion')}
                {:else if unnamed}
                  {person.faceCount.toLocaleString()}
                  {$t('admin.face_cleanup_faces')} · {shortId(person.id)}
                {:else}
                  {person.faceCount.toLocaleString()} {$t('admin.face_cleanup_faces')}
                {/if}
              </div>
            </div>
          </button>
        {/each}

        {#if trimmedQuery}
          <button
            type="button"
            class="text-primary flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left font-bold hover:bg-gray-100 dark:hover:bg-gray-800"
            onclick={createNew}
            disabled={creating}
            data-testid="person-picker-create"
          >
            <span
              class="border-primary flex size-9 flex-none items-center justify-center rounded-xl border-2 border-dashed"
            >
              <Icon icon={mdiPlus} size="16" />
            </span>
            <span>{$t('admin.face_cleanup_review_picker_create', { values: { query: trimmedQuery } })}</span>
          </button>
        {/if}

        {#if showEmpty}
          <p class="py-8 text-center text-xs text-gray-400" data-testid="person-picker-empty">
            {$t('admin.face_cleanup_review_picker_empty')}
          </p>
        {/if}
      </div>
    </div>
  </ModalBody>
</Modal>
