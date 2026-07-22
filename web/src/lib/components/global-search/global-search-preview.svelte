<script lang="ts">
  import type { ActiveItem } from '$lib/managers/global-search-manager.svelte';
  import PhotoPreview from './previews/photo-preview.svelte';
  import PersonPreview from './previews/person-preview.svelte';
  import PlacePreview from './previews/place-preview.svelte';
  import TagPreview from './previews/tag-preview.svelte';
  import AlbumPreview from './previews/album-preview.svelte';
  import SpacePreview from './previews/space-preview.svelte';
  import Logo from '$lib/components/shared-components/Logo.svelte';
  import { fade } from 'svelte/transition';
  import { t } from 'svelte-i18n';

  interface Props {
    activeItem: ActiveItem | null;
  }
  let { activeItem }: Props = $props();

  // Key on kind (not id) so type changes cross-fade at 120 ms per design § Motion.
  // Same-kind different-item transitions inside the per-type previews rely on their own
  // 300 ms dwell + generation-counter staleness handling rather than cross-fade.
  const previewKey = $derived(activeItem?.kind ?? 'none');
</script>

<!-- Shown with no selection, and for nav items and commands — neither has anything richer than the
     row itself to show, and rendering the placeholder keeps the pane at the same width instead of
     flashing a blank frame as the user cursors over them.
     `h-full` is safe here: nothing tall fights for height, so the pane's flex-stretched size is the
     logo's target and the logo stays vertically centred. -->
{#snippet emptyPane()}
  <div class="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 px-8 text-center">
    <Logo variant="icon" size="giant" class="opacity-10" />
    <span class="text-sm text-gray-500 opacity-50 dark:text-gray-400">
      {$t('cmdk_nothing_to_preview')}
    </span>
  </div>
{/snippet}

{#key previewKey}
  <div in:fade={{ duration: 120 }}>
    {#if activeItem === null}
      {@render emptyPane()}
    {:else if activeItem.kind === 'photo'}
      <PhotoPreview photo={activeItem.data as never} />
    {:else if activeItem.kind === 'person'}
      <PersonPreview person={activeItem.data as never} />
    {:else if activeItem.kind === 'place'}
      <PlacePreview place={activeItem.data as never} />
    {:else if activeItem.kind === 'tag'}
      <TagPreview tag={activeItem.data as never} />
    {:else if activeItem.kind === 'album'}
      <AlbumPreview item={activeItem.data as never} />
    {:else if activeItem.kind === 'space'}
      <SpacePreview item={activeItem.data as never} />
    {:else if activeItem.kind === 'nav' || activeItem.kind === 'command'}
      {@render emptyPane()}
    {/if}
  </div>
{/key}
