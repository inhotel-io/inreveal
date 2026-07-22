<script lang="ts">
  import { t } from 'svelte-i18n';
  import type { FilterContext } from './filter-panel';

  interface Props {
    makes: string[];
    selectedMake?: string;
    selectedModel?: string;
    context?: FilterContext;
    onModelFetch: (make: string, context?: FilterContext) => Promise<string[]>;
    onSelectionChange: (make?: string, model?: string) => void;
    emptyText?: string;
  }

  let { makes, selectedMake, selectedModel, context, onModelFetch, onSelectionChange, emptyText }: Props = $props();

  let expandedMake = $state<string | undefined>(undefined);
  let models = $state<string[]>([]);
  let loadingModels = $state(false);

  // Orphaned make: selected but not in current results
  let orphanedMake = $derived(selectedMake && !makes.includes(selectedMake) ? selectedMake : undefined);

  $effect(() => {
    if (expandedMake) {
      const _context = context;
      loadingModels = true;
      void onModelFetch(expandedMake, _context).then((result) => {
        models = result;
        loadingModels = false;

        // Cascade child auto-clear: if selected model is not in new results, clear it
        if (selectedModel && result.length > 0 && !result.includes(selectedModel)) {
          onSelectionChange(expandedMake!, undefined);
        }
      });
    } else {
      models = [];
    }
  });

  function handleMakeClick(make: string) {
    if (selectedMake === make && !selectedModel) {
      // Deselect make
      expandedMake = undefined;
      onSelectionChange(undefined, undefined);
    } else {
      // Select make
      expandedMake = make;
      onSelectionChange(make, undefined);
    }
  }

  function handleModelClick(model: string, make: string) {
    if (selectedModel === model) {
      // Deselect model, keep make
      onSelectionChange(make, undefined);
    } else {
      // Select model (auto-fills make)
      onSelectionChange(make, model);
    }
  }
</script>

<!-- One radio row — a make, or an indented model under it. `selected` fills the dot, `emphasis`
     bolds the label (greyed otherwise), `orphaned` marks a selection that fell out of the
     suggestions: dimmed and explicitly pressed. -->
{#snippet radioRow(row: {
  testId: string;
  label: string;
  selected: boolean;
  emphasis: boolean;
  onclick: () => void;
  orphaned?: boolean;
  indented?: boolean;
})}
  <button
    type="button"
    class="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-subtle {row.indented
      ? 'ml-5 w-[calc(100%-1.25rem+1rem)]'
      : 'w-[calc(100%+1rem)]'} {row.emphasis ? 'font-medium' : 'text-gray-500 dark:text-gray-300'} {row.orphaned
      ? 'opacity-50'
      : ''}"
    onclick={row.onclick}
    aria-pressed={row.orphaned ? 'true' : undefined}
    data-testid={row.testId}
  >
    <div
      class="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 {row.selected
        ? 'border-immich-primary bg-immich-primary dark:border-immich-dark-primary dark:bg-immich-dark-primary'
        : 'border-gray-300 dark:border-gray-600'}"
    >
      {#if row.selected}
        <div class="h-1.5 w-1.5 rounded-full bg-white dark:bg-black"></div>
      {/if}
    </div>
    <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">{row.label}</span>
  </button>
{/snippet}

<div data-testid="camera-filter">
  {#if makes.length === 0 && !orphanedMake}
    <p class="text-sm text-gray-400 dark:text-gray-500" data-testid="camera-empty">
      {emptyText ?? $t('filter_no_cameras_found')}
    </p>
  {:else}
    <!-- Orphaned make (selected but no longer in suggestions) -->
    {#if orphanedMake}
      {@render radioRow({
        testId: `camera-make-${orphanedMake}`,
        label: orphanedMake,
        selected: true,
        emphasis: true,
        orphaned: true,
        onclick: () => handleMakeClick(orphanedMake!),
      })}
    {/if}

    {#each makes as make (make)}
      {@const isMakeSelected = selectedMake === make}
      {@render radioRow({
        testId: `camera-make-${make}`,
        label: make,
        selected: isMakeSelected && !selectedModel,
        emphasis: isMakeSelected,
        onclick: () => handleMakeClick(make),
      })}

      <!-- Models (indented when make is expanded) -->
      {#if expandedMake === make && !loadingModels}
        {#each models as model (model)}
          {@const isModelSelected = selectedModel === model && selectedMake === make}
          {@render radioRow({
            testId: `camera-model-${model}`,
            label: model,
            selected: isModelSelected,
            emphasis: isModelSelected,
            indented: true,
            onclick: () => handleModelClick(model, make),
          })}
        {/each}
      {/if}
    {/each}
  {/if}
</div>
