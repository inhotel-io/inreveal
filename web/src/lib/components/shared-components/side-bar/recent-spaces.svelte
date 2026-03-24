<script lang="ts">
  import { page } from '$app/state';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { Route } from '$lib/route';
  import { pinnedSpaceIds } from '$lib/stores/space-view.store';
  import { userInteraction } from '$lib/stores/user.svelte';
  import { splitPinnedSpaces } from '$lib/utils/space-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { UserAvatarColor, getAllSpaces } from '@immich/sdk';
  import { t } from 'svelte-i18n';

  const DEMO_SPACE_CLICKED_KEY = 'demo-space-clicked';
  const DEMO_SPACE_ID = '3c5807bd-748a-49c6-8cdc-55be96d14dd2';
  let dismissed = $state(!!globalThis.localStorage?.getItem(DEMO_SPACE_CLICKED_KEY));
  let showGlow = $derived(authManager.isDemo && !dismissed);

  function onDemoSpaceClick() {
    if (!dismissed) {
      globalThis.localStorage?.setItem(DEMO_SPACE_CLICKED_KEY, 'true');
      dismissed = true;
    }
  }

  $effect(() => {
    if (!showGlow) {
      return;
    }
    const id = 'demo-glow-keyframes';
    if (document.getElementById(id)) {
      return;
    }
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `@keyframes demo-glow-pulse{0%,100%{box-shadow:0 0 4px 1px oklch(.65 .2 250/.3)}50%{box-shadow:0 0 12px 3px oklch(.65 .2 250/.5)}}`;
    document.head.append(style);
  });

  const bgClasses: Record<string, string> = {
    [UserAvatarColor.Primary]: 'bg-immich-primary',
    [UserAvatarColor.Pink]: 'bg-pink-500',
    [UserAvatarColor.Red]: 'bg-red-500',
    [UserAvatarColor.Yellow]: 'bg-yellow-500',
    [UserAvatarColor.Blue]: 'bg-blue-500',
    [UserAvatarColor.Green]: 'bg-green-600',
    [UserAvatarColor.Purple]: 'bg-purple-600',
    [UserAvatarColor.Orange]: 'bg-orange-500',
    [UserAvatarColor.Gray]: 'bg-gray-500',
    [UserAvatarColor.Amber]: 'bg-amber-500',
  };

  const sortByActivity = <T extends { lastActivityAt?: string | null }>(a: T, b: T): number => {
    const aTime = a.lastActivityAt ?? '';
    const bTime = b.lastActivityAt ?? '';
    return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
  };

  let allSpaces = $state(userInteraction.recentSpaces);

  let spaces = $derived.by(() => {
    if (!allSpaces) {
      return [];
    }
    const { pinned, unpinned } = splitPinnedSpaces(allSpaces, $pinnedSpaceIds);
    return [...pinned.sort(sortByActivity), ...unpinned.sort(sortByActivity)].slice(0, 3);
  });

  const refreshSpaces = async () => {
    try {
      allSpaces = await getAllSpaces();
      userInteraction.recentSpaces = allSpaces;
    } catch (error) {
      handleError(error, $t('failed_to_load_spaces'));
    }
  };

  $effect(() => {
    if (!userInteraction.recentSpaces) {
      void refreshSpaces();
    }
  });
</script>

{#each spaces as space (space.id)}
  {@const active = page.url.pathname.startsWith(`/spaces/${space.id}`)}
  {@const shouldGlow = showGlow && space.id === DEMO_SPACE_ID}
  <a
    href={Route.viewSpace({ id: space.id })}
    title={space.name}
    aria-current={active ? 'page' : undefined}
    data-testid="sidebar-space-{space.id}"
    onclick={shouldGlow ? onDemoSpaceClick : undefined}
    style={shouldGlow ? 'animation: demo-glow-pulse 2s ease-in-out infinite' : ''}
    class="flex w-full place-items-center gap-4 rounded-e-full py-3 transition-[padding] delay-100 duration-100 hover:cursor-pointer hover:bg-subtle hover:text-immich-primary dark:text-immich-dark-fg dark:hover:bg-immich-dark-gray dark:hover:text-immich-dark-primary ps-10 group-hover:sm:px-10 md:px-10 {active
      ? 'bg-primary/10 text-immich-primary dark:text-immich-dark-primary'
      : ''}"
  >
    <div>
      {#if space.newAssetCount && space.newAssetCount > 0}
        <div
          class="h-3 w-3 rounded-full {bgClasses[space.color ?? 'primary'] ?? bgClasses[UserAvatarColor.Primary]}"
          data-testid="sidebar-space-dot-{space.id}"
        ></div>
      {:else}
        <div class="h-3 w-3"></div>
      {/if}
    </div>
    <div class="grow text-sm font-medium truncate">
      {space.name}
    </div>
  </a>
{/each}
