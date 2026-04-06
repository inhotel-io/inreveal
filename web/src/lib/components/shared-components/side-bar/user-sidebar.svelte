<script lang="ts">
  import BottomInfo from '$lib/components/shared-components/side-bar/bottom-info.svelte';
  import RecentAlbums from '$lib/components/shared-components/side-bar/recent-albums.svelte';
  import RecentSpaces from '$lib/components/shared-components/side-bar/recent-spaces.svelte';
  import Sidebar from '$lib/components/sidebar/sidebar.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { Route } from '$lib/route';
  import { recentAlbumsDropdown, recentSpacesDropdown } from '$lib/stores/preferences.store';
  import { NavbarGroup, NavbarItem } from '@immich/ui';
  import {
    mdiAccount,
    mdiAccountMultiple,
    mdiAccountGroup,
    mdiAccountGroupOutline,
    mdiAccountMultipleOutline,
    mdiAccountOutline,
    mdiArchiveArrowDown,
    mdiArchiveArrowDownOutline,
    mdiDatabaseImportOutline,
    mdiFolderOutline,
    mdiHeart,
    mdiHeartOutline,
    mdiHistory,
    mdiImageAlbum,
    mdiImageMultiple,
    mdiImageMultipleOutline,
    mdiLink,
    mdiLock,
    mdiLockOutline,
    mdiMagnify,
    mdiMap,
    mdiMapOutline,
    mdiTagMultipleOutline,
    mdiToolbox,
    mdiToolboxOutline,
    mdiTrashCan,
    mdiTrashCanOutline,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';

  const DEMO_MEMORIES_CLICKED_KEY = 'demo-memories-clicked';
  let memoriesDismissed = $state(!!globalThis.localStorage?.getItem(DEMO_MEMORIES_CLICKED_KEY));
  let showMemoriesGlow = $derived(authManager.isDemo && !memoriesDismissed);

  function onMemoriesClick() {
    if (showMemoriesGlow) {
      memoriesDismissed = true;
      globalThis.localStorage?.setItem(DEMO_MEMORIES_CLICKED_KEY, 'true');
    }
  }

  $effect(() => {
    if (!showMemoriesGlow) {
      return;
    }
    const glowId = 'demo-glow-keyframes';
    if (!document.getElementById(glowId)) {
      const style = document.createElement('style');
      style.id = glowId;
      style.textContent = `@keyframes demo-glow-pulse{0%,100%{box-shadow:0 0 4px 1px oklch(.65 .2 250/.3)}50%{box-shadow:0 0 12px 3px oklch(.65 .2 250/.5)}}`;
      document.head.append(style);
    }
    const shineId = 'demo-shine-keyframes';
    if (!document.getElementById(shineId)) {
      const style = document.createElement('style');
      style.id = shineId;
      style.textContent = `@keyframes demo-shine-sweep{0%{transform:translateX(-140%) skewX(-18deg);opacity:0}20%{opacity:.45}55%,100%{transform:translateX(170%) skewX(-18deg);opacity:0}}`;
      document.head.append(style);
    }
  });
</script>

<Sidebar ariaLabel={$t('primary')}>
  <NavbarItem title={$t('photos')} href={Route.photos()} icon={mdiImageMultipleOutline} activeIcon={mdiImageMultiple} />

  <NavbarItem
    title={$t('spaces')}
    href={Route.spaces()}
    icon={mdiAccountGroupOutline}
    activeIcon={mdiAccountGroup}
    bind:expanded={$recentSpacesDropdown}
  >
    {#snippet items()}
      <span in:fly={{ y: -20 }} class="hidden md:block">
        <RecentSpaces />
      </span>
    {/snippet}
  </NavbarItem>

  {#if featureFlagsManager.value.search}
    <NavbarItem title={$t('explore')} href={Route.explore()} icon={mdiMagnify} />
  {/if}

  {#if featureFlagsManager.value.map}
    <NavbarItem title={$t('map')} href={Route.map()} icon={mdiMapOutline} activeIcon={mdiMap} />
  {/if}

  {#if authManager.preferences.people.enabled && authManager.preferences.people.sidebarWeb}
    <NavbarItem title={$t('people')} href={Route.people()} icon={mdiAccountOutline} activeIcon={mdiAccount} />
  {/if}

  {#if authManager.preferences.sharedLinks.enabled && authManager.preferences.sharedLinks.sidebarWeb && !authManager.isDemo}
    <NavbarItem title={$t('shared_links')} href={Route.sharedLinks()} icon={mdiLink} />
  {/if}

  <NavbarItem
    title={$t('sharing')}
    href={Route.sharing()}
    icon={mdiAccountMultipleOutline}
    activeIcon={mdiAccountMultiple}
  />

  <NavbarGroup title={$t('library')} size="tiny" />

  <NavbarItem title={$t('favorites')} href={Route.favorites()} icon={mdiHeartOutline} activeIcon={mdiHeart} />

  {#if authManager.preferences.memories.enabled}
    <span onclick={onMemoriesClick} role="presentation">
      <NavbarItem
        title={$t('memories')}
        href={Route.memories()}
        icon={mdiHistory}
        class={showMemoriesGlow ? 'demo-memories-glow' : ''}
      />
    </span>
  {/if}

  <NavbarItem
    title={$t('albums')}
    href={Route.albums()}
    icon={{ icon: mdiImageAlbum, flipped: true }}
    bind:expanded={$recentAlbumsDropdown}
  >
    {#snippet items()}
      <span in:fly={{ y: -20 }} class="hidden md:block">
        <RecentAlbums />
      </span>
    {/snippet}
  </NavbarItem>

  {#if authManager.preferences.tags.enabled && authManager.preferences.tags.sidebarWeb}
    <NavbarItem title={$t('tags')} href={Route.tags()} icon={{ icon: mdiTagMultipleOutline, flipped: true }} />
  {/if}

  {#if authManager.preferences.folders.enabled && authManager.preferences.folders.sidebarWeb}
    <NavbarItem title={$t('folders')} href={Route.folders()} icon={{ icon: mdiFolderOutline, flipped: true }} />
  {/if}

  <NavbarItem title={$t('utilities')} href={Route.utilities()} icon={mdiToolboxOutline} activeIcon={mdiToolbox} />

  {#if !authManager.isDemo}
    <NavbarItem title={$t('import')} href={Route.import()} icon={mdiDatabaseImportOutline} />
  {/if}

  <NavbarItem
    title={$t('archive')}
    href={Route.archive()}
    icon={mdiArchiveArrowDownOutline}
    activeIcon={mdiArchiveArrowDown}
  />

  <NavbarItem title={$t('locked_folder')} href={Route.locked()} icon={mdiLockOutline} activeIcon={mdiLock} />

  {#if featureFlagsManager.value.trash && !authManager.isDemo}
    <NavbarItem title={$t('trash')} href={Route.trash()} icon={mdiTrashCanOutline} activeIcon={mdiTrashCan} />
  {/if}

  <BottomInfo />
</Sidebar>

<style>
  :global(.demo-memories-glow) {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    animation: demo-glow-pulse 2s ease-in-out infinite;
  }

  :global(.demo-memories-glow::after) {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(105deg, transparent 30%, oklch(0.88 0.12 250 / 0.38) 48%, transparent 66%);
    animation: demo-shine-sweep 2.8s ease-in-out infinite;
    pointer-events: none;
  }
</style>
