<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import { t } from 'svelte-i18n';
  import type { PersonOption } from './filter-panel';
  import MultiSelectFilter from './multi-select-filter.svelte';

  interface Props {
    people: PersonOption[];
    selectedIds: string[];
    selectedNames?: Map<string, string>;
    onSelectionChange: (ids: string[]) => void;
    emptyText?: string;
  }

  let { people, selectedIds, selectedNames, onSelectionChange, emptyText }: Props = $props();

  const INITIAL_SHOW_COUNT = 5;

  const personCache = new SvelteMap<string, PersonOption>();
  $effect(() => {
    for (const person of people) {
      personCache.set(person.id, person);
    }
  });

  // Orphaned people: selected but not in current results
  let orphanedPeople = $derived(
    selectedIds
      .filter((id) => !people.some((p) => p.id === id))
      .map((id) => {
        const cached = personCache.get(id);
        return {
          id,
          name: selectedNames?.get(id) ?? cached?.name ?? id,
          thumbnailUrl: cached?.thumbnailUrl,
        } satisfies PersonOption;
      }),
  );

  function getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  function getAvatarGradient(name: string): string {
    const gradients = [
      'linear-gradient(135deg, #667eea, #764ba2)',
      'linear-gradient(135deg, #f093fb, #f5576c)',
      'linear-gradient(135deg, #4facfe, #00f2fe)',
      'linear-gradient(135deg, #43e97b, #38f9d7)',
      'linear-gradient(135deg, #fa709a, #fee140)',
      'linear-gradient(135deg, #a18cd1, #fbc2eb)',
    ];
    let hash = 0;
    for (const ch of name) {
      hash = ch.codePointAt(0)! + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length];
  }

  function togglePerson(id: string) {
    const isSelected = selectedIds.includes(id);
    if (isSelected) {
      onSelectionChange(selectedIds.filter((pid) => pid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  }
</script>

<MultiSelectFilter
  testId="people"
  options={people}
  orphaned={orphanedPeople}
  {selectedIds}
  onToggle={togglePerson}
  searchPlaceholder={$t('filter_search_people')}
  emptyText={emptyText ?? $t('spaces_no_people')}
  initialShowCount={INITIAL_SHOW_COUNT}
>
  {#snippet leading(person, isOrphaned)}
    {#if person.thumbnailUrl}
      <img
        src={person.thumbnailUrl}
        alt={person.name}
        class="h-5 w-5 flex-shrink-0 rounded-full object-cover"
        onerror={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          img.style.display = 'none';
          img.nextElementSibling?.removeAttribute('style');
        }}
      />
      <div
        class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
        style="display: none; background: {getAvatarGradient(person.name)}"
      >
        {getInitial(person.name)}
      </div>
    {:else if isOrphaned}
      <!-- A person narrowed out of the suggestions has no cached thumbnail to fall back on, so the
           avatar stays neutral rather than inventing a gradient identity for a dimmed row. -->
      <div
        class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-300 text-[9px] font-semibold text-white dark:bg-gray-600"
      >
        {getInitial(person.name)}
      </div>
    {:else}
      <div
        class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
        style="background: {getAvatarGradient(person.name)}"
      >
        {getInitial(person.name)}
      </div>
    {/if}
  {/snippet}
</MultiSelectFilter>
