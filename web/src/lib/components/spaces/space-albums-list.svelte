<script lang="ts">
  import type { SharedSpaceLinkedAlbumDto } from '@immich/sdk';
  import { AlbumViewMode } from '$lib/stores/preferences.store';
  import { spaceAlbumViewSettings } from '$lib/stores/space-album-view-settings.store';
  import SpaceAlbumCard from '$lib/components/spaces/space-album-card.svelte';
  import SpaceAlbumsTable from '$lib/components/spaces/space-albums-table.svelte';

  interface Props {
    spaceId: string;
    albums: SharedSpaceLinkedAlbumDto[];
    canManage: boolean;
    onUnlink?: (album: SharedSpaceLinkedAlbumDto) => void;
    onToggleTimeline?: (album: SharedSpaceLinkedAlbumDto) => void;
  }

  let { spaceId, albums, canManage, onUnlink, onToggleTimeline }: Props = $props();
</script>

{#if $spaceAlbumViewSettings.view === AlbumViewMode.List}
  <SpaceAlbumsTable {spaceId} {albums} {canManage} {onUnlink} {onToggleTimeline} />
{:else}
  <div class="grid grid-auto-fill-56 gap-y-4">
    {#each albums as album (album.id)}
      <SpaceAlbumCard {spaceId} {album} {canManage} {onUnlink} {onToggleTimeline} />
    {/each}
  </div>
{/if}
