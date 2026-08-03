<script lang="ts">
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import { NavbarGroup } from '@immich/ui';

  interface Props {
    title: string;
  }

  let { title }: Props = $props();

  const collapsed = $derived(sidebarModeStore.layout === 'rail' && !sidebarModeStore.hoverExpanded);
</script>

{#if collapsed}
  <!-- A text heading is unreadable at 4rem, so the group boundary becomes a rule - the
       same treatment Google Photos uses in its rail. -->
  <hr data-testid="sidebar-group-divider" class="border-subtle mx-3 my-2" />
{:else}
  <NavbarGroup {title} size="tiny" />
{/if}
