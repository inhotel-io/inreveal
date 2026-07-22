<script lang="ts">
  import { t } from 'svelte-i18n';

  interface Props {
    selected: 'all' | 'image' | 'video';
    onTypeChange: (type: 'all' | 'image' | 'video') => void;
  }

  let { selected, onTypeChange }: Props = $props();

  let options = $derived<Array<{ value: 'all' | 'image' | 'video'; label: string }>>([
    { value: 'all', label: $t('all') },
    { value: 'image', label: $t('photos') },
    { value: 'video', label: $t('videos') },
  ]);
</script>

<div class="flex gap-1.5" data-testid="media-type-filter">
  {#each options as option (option.value)}
    {@const isActive = selected === option.value}
    <button
      type="button"
      class="rounded-lg border px-2.5 py-1 text-xs
        {isActive
        ? 'border-immich-primary bg-immich-primary/10 text-immich-primary dark:border-immich-dark-primary dark:bg-immich-dark-primary/20 dark:text-immich-dark-primary'
        : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'}"
      onclick={() => onTypeChange(option.value)}
      data-testid="media-type-{option.value}"
    >
      {option.label}
    </button>
  {/each}
</div>
