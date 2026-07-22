<script lang="ts">
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import RoleBadge from '$lib/components/spaces/role-badge.svelte';
  import SpaceCollage from '$lib/components/spaces/space-collage.svelte';
  import { Route } from '$lib/route';
  import { getSpaceAccent, getSpaceGradientClass, type SpaceColor } from '$lib/utils/space-colors';
  import { formatTimeAgo } from '$lib/utils/timesince';
  import type { SharedSpaceResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiDotsVertical, mdiPin, mdiPinOff } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    spaces: SharedSpaceResponseDto[];
    pinnedSpaces?: SharedSpaceResponseDto[];
    currentUserId: string;
    pinnedIds?: string[];
    onTogglePin?: (id: string) => void;
  }

  let { spaces, pinnedSpaces = [], currentUserId, pinnedIds = [], onTogglePin = () => {} }: Props = $props();

  const showPinnedSection = $derived(pinnedSpaces.length > 0);

  let hoveredId = $state<string | null>(null);

  const getColorBarClass = (color: SpaceColor) => getSpaceAccent(color).solidBg;

  const getNewBadgeClass = (color: SpaceColor) => `${getSpaceAccent(color).solidBg} text-white`;

  const getCollageAssets = (space: SharedSpaceResponseDto) =>
    (space.recentAssetIds ?? []).map((id, i) => ({
      id,
      thumbhash: space.recentAssetThumbhashes?.[i] ?? null,
    }));

  const getCurrentUserRole = (space: SharedSpaceResponseDto) => {
    const member = (space.members ?? []).find((m) => m.userId === currentUserId);
    return member?.role ?? null;
  };
</script>

<div class="overflow-x-auto">
  <table class="w-full text-sm">
    <thead>
      <tr
        class="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400"
      >
        <th class="w-1 py-2 pr-3"></th>
        <th class="py-2 pr-4">{$t('name')}</th>
        <th class="w-28 py-2 pr-4">{$t('role')}</th>
        <th class="w-20 py-2 pr-4 text-right">{$t('photos')}</th>
        <th class="w-24 py-2 pr-4 text-right">{$t('members')}</th>
        <th class="w-20 py-2 pr-4 text-center">{$t('spaces_new')}</th>
        <th class="w-32 py-2 text-right">{$t('last_activity')}</th>
      </tr>
    </thead>
    <tbody>
      {#if showPinnedSection}
        {#each pinnedSpaces as space (space.id)}
          {@render spaceRow(space)}
        {/each}
        <!-- Separator before unpinned -->
        {#if spaces.length > 0}
          <tr>
            <td colspan="7" class="border-b-2 border-gray-200 dark:border-gray-700 py-0"></td>
          </tr>
        {/if}
      {/if}

      {#each spaces as space (space.id)}
        {@render spaceRow(space)}
      {/each}
    </tbody>
  </table>
</div>

{#snippet spaceRow(space: SharedSpaceResponseDto)}
  {@const collageAssets = getCollageAssets(space)}
  {@const gradientClass = getSpaceGradientClass(space.color)}
  {@const colorBarClass = getColorBarClass(space.color)}
  {@const newBadgeClass = getNewBadgeClass(space.color)}
  {@const currentRole = getCurrentUserRole(space)}
  {@const newCount = space.newAssetCount ?? 0}
  {@const isPinned = pinnedIds.includes(space.id)}
  <tr
    class="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
    data-testid="space-row"
    onmouseenter={() => (hoveredId = space.id)}
    onmouseleave={() => (hoveredId = null)}
  >
    <!-- Color bar cell -->
    <td class="py-3 pr-3">
      <div class="h-8 w-[3px] rounded-full {colorBarClass}" data-testid="color-bar-{space.id}"></div>
    </td>

    <!-- Name cell with collage thumbnail -->
    <td class="py-3 pr-4">
      <a
        href={Route.viewSpace({ id: space.id })}
        class="flex items-center gap-3 font-medium text-black hover:text-immich-primary dark:text-white dark:hover:text-immich-primary"
      >
        <div class="h-8 w-8 shrink-0">
          <SpaceCollage assets={collageAssets} {gradientClass} />
        </div>
        <span class="flex items-center gap-1">
          {#if isPinned}
            <span data-testid="pin-icon-{space.id}" class="inline-flex items-center">
              <Icon icon={mdiPin} size="12" class="text-gray-400" />
            </span>
          {/if}
          {space.name}
        </span>
      </a>
    </td>

    <!-- Role cell -->
    <td class="w-28 py-3 pr-4">
      {#if currentRole}
        <RoleBadge role={currentRole} spaceColor={space.color} size="sm" />
      {/if}
    </td>

    <!-- Asset count cell -->
    <td class="w-20 py-3 pr-4 text-right text-gray-600 dark:text-gray-400">
      {space.assetCount ?? 0}
    </td>

    <!-- Member count cell -->
    <td class="w-24 py-3 pr-4 text-right text-gray-600 dark:text-gray-400">
      {space.memberCount ?? 0}
    </td>

    <!-- New assets cell -->
    <td class="w-20 py-3 pr-4 text-center" data-testid="new-cell-{space.id}">
      {#if newCount > 0}
        <span
          class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {newBadgeClass}"
          data-testid="new-badge-{space.id}"
        >
          {newCount > 99 ? '99+' : newCount}
        </span>
      {:else}
        <span class="text-gray-400">—</span>
      {/if}
    </td>

    <!-- Last activity cell -->
    <td class="relative w-32 py-3 text-right text-sm text-gray-500 dark:text-gray-400">
      {#if hoveredId === space.id}
        <ButtonContextMenu
          class="absolute end-0 top-1/2 -translate-y-1/2"
          data-testid="row-menu-button-{space.id}"
          icon={mdiDotsVertical}
          title={$t('more')}
          color="secondary"
          size="small"
          align="top-right"
          direction="left"
        >
          <MenuOption
            icon={isPinned ? mdiPinOff : mdiPin}
            text={isPinned ? $t('spaces_unpin') : $t('spaces_pin_to_top')}
            onClick={() => onTogglePin(space.id)}
          />
        </ButtonContextMenu>
      {:else}
        {space.lastActivityAt ? formatTimeAgo(space.lastActivityAt) : '—'}
      {/if}
    </td>
  </tr>
{/snippet}
