<script lang="ts">
  import { page } from '$app/state';
  import { Route } from '$lib/route';
  import {
    isSpaceAlbumsExpanded,
    recentSpaceAlbumsExpanded,
    setSpaceAlbumsExpanded,
  } from '$lib/stores/preferences.store';
  import { pinnedSpaceIds } from '$lib/stores/space-view.store';
  import { userInteraction } from '$lib/stores/user.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { splitPinnedSpaces } from '$lib/utils/space-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { UserAvatarColor, getAllSpaces, getSharedSpaceAlbums } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiChevronDown, mdiChevronRight } from '@mdi/js';
  import { t } from 'svelte-i18n';

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

  const topSpaceIds = $derived(spaces.map((s) => s.id));

  const loadAlbums = async (spaceId: string) => {
    if (userInteraction.spaceAlbums?.[spaceId]) {
      return; // already fetched (possibly an empty list) — never refetch
    }
    try {
      const albums = await getSharedSpaceAlbums({ id: spaceId });
      const sorted = [...albums].sort((a, b) => (a.linkedAt > b.linkedAt ? -1 : a.linkedAt < b.linkedAt ? 1 : 0));
      userInteraction.spaceAlbums = { ...userInteraction.spaceAlbums, [spaceId]: sorted };
    } catch (error) {
      handleError(error, $t('failed_to_load_albums'));
      setSpaceAlbumsExpanded(spaceId, false, topSpaceIds); // cache stays unset → retry on next expand
    }
  };

  const toggleAlbums = (spaceId: string) => {
    const nowExpanded = !isSpaceAlbumsExpanded($recentSpaceAlbumsExpanded, spaceId);
    setSpaceAlbumsExpanded(spaceId, nowExpanded, topSpaceIds);
    if (nowExpanded) {
      void loadAlbums(spaceId);
    }
  };

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
  {@const hasAlbums = (space.albumCount ?? 0) > 0}
  {@const cachedAlbums = userInteraction.spaceAlbums?.[space.id]}
  {@const expanded =
    isSpaceAlbumsExpanded($recentSpaceAlbumsExpanded, space.id) &&
    (cachedAlbums === undefined || cachedAlbums.length > 0)}
  <div class="relative">
    {#if hasAlbums}
      <button
        type="button"
        aria-label={expanded ? $t('collapse') : $t('expand')}
        aria-expanded={expanded}
        data-testid="sidebar-space-chevron-{space.id}"
        class="absolute start-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-lg p-0.5 hover:bg-subtle md:block"
        onclick={() => toggleAlbums(space.id)}
      >
        <Icon icon={expanded ? mdiChevronDown : mdiChevronRight} size="1.25em" />
      </button>
    {/if}
    <a
      href={Route.viewSpace({ id: space.id })}
      title={space.name}
      aria-current={active ? 'page' : undefined}
      data-testid="sidebar-space-{space.id}"
      class="flex w-full place-items-center gap-4 rounded-e-full py-3 transition-[padding] delay-100 duration-100 hover:cursor-pointer hover:bg-subtle hover:text-immich-primary dark:text-immich-dark-fg dark:hover:bg-immich-dark-gray dark:hover:text-immich-dark-primary ps-10 group-hover:sm:pe-4 md:pe-4 {active
        ? 'bg-primary/10 text-immich-primary dark:text-immich-dark-primary'
        : ''}"
    >
      <div class="flex h-6 w-6 items-center justify-center">
        {#if space.newAssetCount && space.newAssetCount > 0}
          <div
            class="h-3 w-3 rounded-full {bgClasses[space.color ?? 'primary'] ?? bgClasses[UserAvatarColor.Primary]}"
            data-testid="sidebar-space-dot-{space.id}"
          ></div>
        {:else}
          <div
            class="h-6 w-6 bg-cover rounded bg-gray-200 dark:bg-gray-600"
            style={space.thumbnailAssetId
              ? `background-image:url('${getAssetMediaUrl({ id: space.thumbnailAssetId })}')`
              : ''}
            data-testid="sidebar-space-thumbnail-{space.id}"
          ></div>
        {/if}
      </div>
      <div class="grow text-sm font-medium truncate">
        {space.name}
      </div>
    </a>
    {#if expanded}
      {#each (cachedAlbums ?? []).slice(0, 3) as album (album.id)}
        <a
          href={Route.viewSpaceAlbum({ spaceId: space.id, albumId: album.id })}
          title={album.albumName}
          data-testid="sidebar-space-album-{album.id}"
          class="flex w-full place-items-center gap-4 rounded-e-full py-2 ps-14 hover:cursor-pointer hover:bg-subtle hover:text-immich-primary dark:text-immich-dark-fg dark:hover:bg-immich-dark-gray dark:hover:text-immich-dark-primary"
        >
          <div
            class="size-6 rounded-sm bg-gray-200 bg-cover dark:bg-gray-600"
            style={album.albumThumbnailAssetId
              ? `background-image:url('${getAssetMediaUrl({ id: album.albumThumbnailAssetId })}')`
              : ''}
          ></div>
          <div class="grow truncate text-sm font-medium">{album.albumName}</div>
        </a>
      {/each}
    {/if}
  </div>
{/each}
