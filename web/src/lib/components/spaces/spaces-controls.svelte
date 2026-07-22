<script lang="ts">
  import Dropdown from '$lib/elements/Dropdown.svelte';
  import { SortOrder } from '$lib/stores/preferences.store';
  import {
    sortOptionsMetadata,
    SpaceSortBy,
    spaceViewSettings,
    type SpaceSortOptionMetadata,
  } from '$lib/stores/space-view.store';
  import type { SharedSpaceResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiArrowDownThin, mdiArrowUpThin, mdiFormatListBulletedSquare, mdiViewGridOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    spaces: SharedSpaceResponseDto[];
    onSorted: (sorted: SharedSpaceResponseDto[]) => void;
  }

  let { spaces, onSorted }: Props = $props();

  const flipOrdering = (ordering: string) => {
    return ordering === SortOrder.Asc ? SortOrder.Desc : SortOrder.Asc;
  };

  const handleSort = (option: SpaceSortOptionMetadata) => {
    if ($spaceViewSettings.sortBy === option.id) {
      $spaceViewSettings.sortOrder = flipOrdering($spaceViewSettings.sortOrder);
    } else {
      $spaceViewSettings.sortBy = option.id;
      $spaceViewSettings.sortOrder = option.defaultOrder;
    }
  };

  const sortSpaces = (items: SharedSpaceResponseDto[], sortBy: string, sortOrder: string) => {
    const sorted = [...items].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case SpaceSortBy.Name: {
          comparison = a.name.localeCompare(b.name);
          break;
        }
        case SpaceSortBy.LastActivity: {
          const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
          const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
          comparison = aTime - bTime;
          break;
        }
        case SpaceSortBy.DateCreated: {
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        }
        case SpaceSortBy.AssetCount: {
          comparison = (a.assetCount ?? 0) - (b.assetCount ?? 0);
          break;
        }
      }
      return sortOrder === SortOrder.Asc ? comparison : -comparison;
    });
    return sorted;
  };

  $effect(() => {
    const sorted = sortSpaces(spaces, $spaceViewSettings.sortBy, $spaceViewSettings.sortOrder);
    onSorted(sorted);
  });

  let sortIcon = $derived($spaceViewSettings.sortOrder === SortOrder.Desc ? mdiArrowDownThin : mdiArrowUpThin);
  // Default is sort by last activity
  const defaultSortOption = sortOptionsMetadata[1];
  let selectedSortOption = $derived(
    sortOptionsMetadata.find(({ id }) => id === $spaceViewSettings.sortBy) ?? defaultSortOption,
  );
</script>

<div class="relative mb-4 flex items-center justify-end gap-2" data-testid="spaces-controls">
  <button
    type="button"
    class="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
    onclick={() => ($spaceViewSettings.viewMode = $spaceViewSettings.viewMode === 'card' ? 'list' : 'card')}
    data-testid="view-toggle"
  >
    <Icon icon={$spaceViewSettings.viewMode === 'card' ? mdiFormatListBulletedSquare : mdiViewGridOutline} size="18" />
  </button>

  <Dropdown
    position="bottom-right"
    options={sortOptionsMetadata}
    selectedOption={selectedSortOption}
    onSelect={handleSort}
    render={({ label }) => ({ title: $t(label), icon: sortIcon })}
  />
</div>
