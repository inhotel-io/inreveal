<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import { t } from 'svelte-i18n';
  import type { TagOption } from './filter-panel';
  import MultiSelectFilter from './multi-select-filter.svelte';

  interface Props {
    tags: TagOption[];
    selectedIds: string[];
    selectedNames?: Map<string, string>;
    onSelectionChange: (ids: string[]) => void;
  }

  let { tags, selectedIds, selectedNames, onSelectionChange }: Props = $props();

  const INITIAL_SHOW_COUNT = 10;

  // Cache tag names so orphaned tags can display their name even after removal from results
  const tagNameCache = new SvelteMap<string, string>();
  $effect(() => {
    for (const tag of tags) {
      tagNameCache.set(tag.id, tag.name);
    }
  });

  // Orphaned tags: selected but not in current results
  let orphanedTags = $derived(
    selectedIds
      .filter((id) => !tags.some((t) => t.id === id))
      .map((id) => ({ id, name: selectedNames?.get(id) ?? tagNameCache.get(id) ?? id })),
  );

  function toggleTag(id: string) {
    const isSelected = selectedIds.includes(id);
    if (isSelected) {
      onSelectionChange(selectedIds.filter((tid) => tid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  }
</script>

<MultiSelectFilter
  testId="tags"
  options={tags}
  orphaned={orphanedTags}
  {selectedIds}
  onToggle={toggleTag}
  searchPlaceholder={$t('search_tags')}
  emptyText={$t('filter_no_tags_available')}
  noResultsText={$t('filter_no_matching_tags')}
  initialShowCount={INITIAL_SHOW_COUNT}
  resetOnOptionsChange
/>
