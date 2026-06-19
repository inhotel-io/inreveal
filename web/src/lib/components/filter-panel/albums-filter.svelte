<script lang="ts">
  import { Icon } from '@immich/ui';
  import { mdiImageAlbum, mdiImageMultipleOutline, mdiImageOffOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    selected: 'all' | 'has' | 'none';
    onChange: (value: 'all' | 'has' | 'none') => void;
  }

  let { selected, onChange }: Props = $props();

  const activeClass =
    'border-immich-primary bg-immich-primary/10 text-immich-primary dark:border-immich-dark-primary dark:bg-immich-dark-primary/20 dark:text-immich-dark-primary';
  const inactiveClass = 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400';
</script>

<div class="flex gap-1.5" data-testid="albums-filter">
  <button
    type="button"
    class="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs {selected === 'all'
      ? activeClass
      : inactiveClass}"
    onclick={() => onChange('all')}
    data-testid="albums-all"
  >
    <Icon icon={mdiImageAlbum} size="14" />
    {$t('all')}
  </button>
  <button
    type="button"
    class="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs {selected === 'has'
      ? activeClass
      : inactiveClass}"
    onclick={() => onChange('has')}
    data-testid="albums-has"
  >
    <Icon icon={mdiImageMultipleOutline} size="14" />
    {$t('filter_has_album')}
  </button>
  <button
    type="button"
    class="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs {selected === 'none'
      ? activeClass
      : inactiveClass}"
    onclick={() => onChange('none')}
    data-testid="albums-none"
  >
    <Icon icon={mdiImageOffOutline} size="14" />
    {$t('filter_has_no_album')}
  </button>
</div>
