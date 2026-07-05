<script lang="ts">
  import { AlbumViewMode } from '$lib/stores/preferences.store';
  import { spaceAlbumViewSettings } from '$lib/stores/space-album-view-settings.store';
  import { Button, Text } from '@immich/ui';
  import { mdiFormatListBulletedSquare, mdiViewGridOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  const handleToggleView = () => {
    $spaceAlbumViewSettings.view =
      $spaceAlbumViewSettings.view === AlbumViewMode.Cover ? AlbumViewMode.List : AlbumViewMode.Cover;
  };
</script>

<div class="flex items-center justify-end gap-2 px-4 py-2" data-testid="space-albums-view-toggle">
  <!-- Future controls (sort, group, search, create, link) will be added in later slices -->
  <div class="flex items-center gap-1">
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
