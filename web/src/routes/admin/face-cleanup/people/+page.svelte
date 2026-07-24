<script lang="ts">
  import AdminPageLayout from '$lib/components/layouts/AdminPageLayout.svelte';
  import InfiniteScrollSentinel from '$lib/components/shared-components/infinite-scroll-sentinel.svelte';
  import { getAdminFaceThumbnailUrl } from '$lib/utils/people-utils';
  import { Route } from '$lib/route';
  import { getFaceRepairOwnerPeople, type FaceRepairOwnerPeopleResponseDto } from '@immich/sdk';
  import { Button, Icon } from '@immich/ui';
  import { mdiAccountCircleOutline, mdiMagnify } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  // Manual people browser (§6.3): owner selector → paginated people grid via getFaceRepairOwnerPeople. Zero
  // new server endpoints — everything here already exists (searchUsersAdmin for the owner list,
  // getFaceRepairOwnerPeople for the paginated rows, the admin face-thumbnail route for crops).

  type OwnerPerson = FaceRepairOwnerPeopleResponseDto['people'][number];

  type Props = { data: PageData };
  const { data }: Props = $props();

  const users = data.users;

  // Default to the first user regardless of count: a single-user instance never shows the selector at all
  // (no pointless "pick an owner" step on a one-user install), and a multi-user instance still shows the
  // selector but doesn't dead-end on an empty "nobody selected yet" screen — it starts on the first owner
  // and lets the admin switch from there.
  let selectedOwnerId = $state<string | null>(users.length > 0 ? users[0].id : null);
  let query = $state('');
  let people = $state<OwnerPerson[]>([]);
  let total = $state(0);
  let hasMore = $state(false);
  let page = $state(0);
  let loading = $state(false);
  let loadingMore = $state(false);
  let loadError = $state(false);
  // Distinguishes "never successfully loaded" from "loaded and empty" — a load error on the very first
  // fetch must never be allowed to fall through to the reassuring owner-empty state (D17 on the guided page).
  let hasLoadedOnce = $state(false);

  const trimmedQuery = $derived(query.trim());
  const showOwnerSelect = $derived(users.length > 1);
  const showEmptyOwner = $derived(
    hasLoadedOnce && !loading && !loadError && people.length === 0 && trimmedQuery.length === 0,
  );
  const showNoResults = $derived(
    hasLoadedOnce && !loading && !loadError && people.length === 0 && trimmedQuery.length > 0,
  );

  const unnamedLabel = () => $t('admin.face_cleanup_unnamed');
  const displayName = (name: string) => (name.trim() ? name : unnamedLabel());

  // Guards a stale response (from a superseded owner switch or search keystroke) landing after a newer
  // request — otherwise a slow first response can land after a fast second one and clobber it.
  let requestToken = 0;

  const fetchPage = async (ownerId: string, requestPage: number, requestQuery: string) => {
    const token = ++requestToken;
    if (requestPage === 0) {
      loading = true;
    } else {
      loadingMore = true;
    }
    loadError = false;
    try {
      const result = await getFaceRepairOwnerPeople({
        ownerId,
        page: requestPage,
        query: requestQuery || undefined,
      });
      if (token !== requestToken) {
        return;
      }
      // Pagination APPENDS, never replaces — a fresh page-0 fetch (owner switch / new search) is the only
      // case that replaces the list outright.
      people = requestPage === 0 ? result.people : [...people, ...result.people];
      total = result.total;
      hasMore = result.hasMore;
      page = requestPage;
      hasLoadedOnce = true;
    } catch {
      if (token !== requestToken) {
        return;
      }
      loadError = true;
      if (requestPage === 0) {
        people = [];
      }
    } finally {
      if (token === requestToken) {
        loading = false;
        loadingMore = false;
      }
    }
  };

  // Fetch state is per-owner: switching owner resets page to 0 and clears the list, otherwise rows from two
  // owners interleave in the same grid.
  const loadOwner = (ownerId: string) => {
    selectedOwnerId = ownerId;
    query = '';
    people = [];
    total = 0;
    hasMore = false;
    page = 0;
    hasLoadedOnce = false;
    void fetchPage(ownerId, 0, '');
  };

  onMount(() => {
    if (selectedOwnerId) {
      void fetchPage(selectedOwnerId, 0, '');
    }
  });

  const handleOwnerChange = (event: Event) => {
    const ownerId = (event.currentTarget as HTMLSelectElement).value;
    if (ownerId) {
      loadOwner(ownerId);
    }
  };

  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  const SEARCH_DEBOUNCE_MS = 300;

  const handleSearchInput = () => {
    if (searchDebounce) {
      clearTimeout(searchDebounce);
    }
    searchDebounce = setTimeout(() => {
      if (!selectedOwnerId) {
        return;
      }
      void fetchPage(selectedOwnerId, 0, trimmedQuery);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleLoadMore = () => {
    if (!selectedOwnerId || loadingMore) {
      return;
    }
    void fetchPage(selectedOwnerId, page + 1, trimmedQuery);
  };

  const handleRetry = () => {
    if (!selectedOwnerId) {
      return;
    }
    void fetchPage(selectedOwnerId, 0, trimmedQuery);
  };
</script>

<AdminPageLayout breadcrumbs={[{ title: data.meta.title }]}>
  <div class="mx-auto max-w-screen-xl p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">{$t('admin.face_cleanup_mode_browse_people')}</h1>
      <p class="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">{$t('admin.face_cleanup_mode_manual_sub')}</p>
    </div>

    <div class="mb-6 flex flex-wrap items-center gap-3">
      {#if showOwnerSelect}
        <select
          class="immich-form-input h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800"
          value={selectedOwnerId}
          onchange={handleOwnerChange}
          data-testid="owner-select"
        >
          {#each users as user (user.id)}
            <option value={user.id}>{user.name}</option>
          {/each}
        </select>
      {/if}

      <div
        class="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
      >
        <Icon icon={mdiMagnify} size="16" class="flex-none text-gray-300" />
        <input
          type="text"
          bind:value={query}
          oninput={handleSearchInput}
          placeholder={$t('admin.face_cleanup_people_search_placeholder')}
          class="flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none dark:text-gray-200"
          data-testid="people-search-input"
        />
      </div>
    </div>

    {#if loadError}
      <div
        class="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400"
        data-testid="people-load-error"
      >
        <span class="flex-1">{$t('admin.face_cleanup_people_load_error')}</span>
        <Button color="secondary" size="small" onclick={handleRetry} data-testid="people-load-error-retry">
          {$t('retry')}
        </Button>
      </div>
    {:else if loading}
      <div class="flex items-center justify-center py-20 text-gray-400">
        <span>{$t('loading')}</span>
      </div>
    {:else if !selectedOwnerId}
      <div
        class="rounded-2xl border border-dashed border-gray-200 py-20 text-center dark:border-gray-700"
        data-testid="people-no-users"
      >
        <div class="text-lg font-medium text-gray-500">{$t('admin.face_cleanup_people_no_users')}</div>
      </div>
    {:else if showEmptyOwner}
      <div
        class="rounded-2xl border border-dashed border-gray-200 py-20 text-center dark:border-gray-700"
        data-testid="people-empty-owner"
      >
        <div class="text-lg font-medium text-gray-500">{$t('admin.face_cleanup_people_empty_owner')}</div>
      </div>
    {:else if showNoResults}
      <div
        class="rounded-2xl border border-dashed border-gray-200 py-20 text-center dark:border-gray-700"
        data-testid="people-no-results"
      >
        <div class="text-lg font-medium text-gray-500">{$t('admin.face_cleanup_people_no_results')}</div>
      </div>
    {:else}
      <div class="mb-2 text-xs text-gray-400 tabular-nums">
        {people.length.toLocaleString()} / {total.toLocaleString()}
      </div>
      <div
        class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        data-testid="people-grid"
      >
        {#each people as person (person.id)}
          <a
            href={Route.viewFaceCleanupManualPerson({ id: person.id })}
            class="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-left transition hover:border-primary/50 dark:border-gray-700 dark:bg-gray-800"
            data-testid={`person-tile-${person.id}`}
          >
            <div class="aspect-square w-full overflow-hidden bg-gray-100 dark:bg-gray-700">
              {#if person.thumbnailFaceId}
                <img
                  src={getAdminFaceThumbnailUrl(person.thumbnailFaceId)}
                  alt=""
                  class="size-full object-cover"
                  loading="lazy"
                  data-testid={`person-tile-thumb-${person.id}`}
                />
              {:else}
                <div
                  class="flex size-full items-center justify-center text-gray-300 dark:text-gray-600"
                  data-testid={`person-tile-placeholder-${person.id}`}
                >
                  <Icon icon={mdiAccountCircleOutline} size="32" />
                </div>
              {/if}
            </div>
            <div class="p-3">
              <div class="truncate text-sm font-semibold text-gray-900 dark:text-white">{displayName(person.name)}</div>
              <div class="mt-0.5 text-xs text-gray-400 tabular-nums">
                {person.faceCount.toLocaleString()}
                {$t('admin.face_cleanup_faces')}
              </div>
            </div>
          </a>
        {/each}
      </div>

      <!-- Scroll-driven pagination: the sentinel loads the next page as it enters the viewport, so the grid
           grows as the admin scrolls instead of dead-ending on a "Load more" button. -->
      <InfiniteScrollSentinel
        {hasMore}
        loading={loadingMore}
        onLoadMore={handleLoadMore}
        itemCount={people.length}
        class="mt-6 flex h-10 w-full items-center justify-center"
      />
    {/if}
  </div>
</AdminPageLayout>
