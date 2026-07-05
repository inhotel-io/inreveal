<script lang="ts">
  import { AlbumSortBy, AlbumViewMode, SortOrder } from '$lib/stores/preferences.store';
  import { spaceAlbumViewSettings } from '$lib/stores/space-album-view-settings.store';
  import { type AlbumSortOptionMetadata, findSortOptionMetadata, sortOptionsMetadata } from '$lib/utils/album-utils';
  import { Button, Icon, Text } from '@immich/ui';
  import {
    mdiArrowDownThin,
    mdiArrowUpThin,
    mdiChevronDown,
    mdiFormatListBulletedSquare,
    mdiViewGridOutline,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';

  let showSortMenu = $state(false);

  const flipOrdering = (ordering: string) => {
    return ordering === SortOrder.Asc ? SortOrder.Desc : SortOrder.Asc;
  };

  const handleChangeSortBy = ({ id, defaultOrder }: AlbumSortOptionMetadata) => {
    if ($spaceAlbumViewSettings.sortBy === id) {
      $spaceAlbumViewSettings.sortOrder = flipOrdering($spaceAlbumViewSettings.sortOrder);
    } else {
      $spaceAlbumViewSettings.sortBy = id;
      $spaceAlbumViewSettings.sortOrder = defaultOrder;
    }
    showSortMenu = false;
  };

  const handleToggleView = () => {
    $spaceAlbumViewSettings.view =
      $spaceAlbumViewSettings.view === AlbumViewMode.Cover ? AlbumViewMode.List : AlbumViewMode.Cover;
  };

  function handleClickOutside(event: MouseEvent) {
    if (!(event.target as HTMLElement).closest('[data-testid="space-albums-sort-container"]')) {
      showSortMenu = false;
    }
  }

  let selectedSortOption = $derived(findSortOptionMetadata($spaceAlbumViewSettings.sortBy));
  let sortIcon = $derived($spaceAlbumViewSettings.sortOrder === SortOrder.Desc ? mdiArrowDownThin : mdiArrowUpThin);

  let albumSortByNames: Record<AlbumSortBy, string> = $derived({
    [AlbumSortBy.Title]: $t('sort_title'),
    [AlbumSortBy.ItemCount]: $t('sort_items'),
    [AlbumSortBy.DateModified]: $t('sort_modified'),
    [AlbumSortBy.DateCreated]: $t('sort_created'),
    [AlbumSortBy.MostRecentPhoto]: $t('sort_recent'),
    [AlbumSortBy.OldestPhoto]: $t('sort_oldest'),
  });
</script>

<svelte:window onclick={handleClickOutside} />

<div class="flex items-center justify-end gap-2 px-4 py-2" data-testid="space-albums-view-toggle">
  <div class="flex items-center gap-1">
    <!-- Sort Albums -->
    <div class="relative" data-testid="space-albums-sort-container">
      <button
        type="button"
        title={$t('sort_albums_by')}
        aria-label={$t('sort_albums_by')}
        class="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
        data-testid="space-albums-sort-btn"
        onclick={() => (showSortMenu = !showSortMenu)}
      >
        <Icon icon={sortIcon} size="18" />
        <span class="hidden sm:inline">{albumSortByNames[selectedSortOption.id as AlbumSortBy]}</span>
        <Icon icon={mdiChevronDown} size="14" />
      </button>

      {#if showSortMenu}
        <div
          class="absolute top-full right-0 z-10 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          data-testid="space-albums-sort-menu"
        >
          {#each sortOptionsMetadata as option (option.id)}
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
              class:font-semibold={$spaceAlbumViewSettings.sortBy === option.id}
              onclick={() => handleChangeSortBy(option)}
              data-testid="space-albums-sort-option-{option.id}"
            >
              {albumSortByNames[option.id as AlbumSortBy]}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Cover/List Display Toggle -->
    {#if $spaceAlbumViewSettings.view === AlbumViewMode.List}
      <Button
        leadingIcon={mdiViewGridOutline}
        onclick={handleToggleView}
        size="small"
        variant="ghost"
        color="secondary"
      >
        <Text class="hidden md:block">{$t('covers')}</Text>
      </Button>
    {:else}
      <Button
        leadingIcon={mdiFormatListBulletedSquare}
        onclick={handleToggleView}
        size="small"
        variant="ghost"
        color="secondary"
      >
        <Text class="hidden md:block">{$t('list')}</Text>
      </Button>
    {/if}
  </div>
</div>
