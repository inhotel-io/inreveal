<script lang="ts">
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import SpaceCollage from '$lib/components/spaces/space-collage.svelte';
  import { Route } from '$lib/route';
  import { getSpaceGradientClass } from '$lib/utils/space-colors';
  import { type SharedSpaceResponseDto, type UserAvatarColor } from '@immich/sdk';
  import { mdiDotsVertical, mdiPin, mdiPinOff } from '@mdi/js';
  import { Icon } from '@immich/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    space: SharedSpaceResponseDto;
    preload?: boolean;
    isPinned?: boolean;
    onTogglePin?: (id: string) => void;
  }

  let { space, preload = false, isPinned = false, onTogglePin = () => {} }: Props = $props();

  let showMenu = $state(false);

  const MAX_AVATARS = 4;

  let gradientClass = $derived(getSpaceGradientClass(space.color));

  let collageAssets = $derived(
    (space.recentAssetIds ?? []).map((id, i) => ({
      id,
      thumbhash: space.recentAssetThumbhashes?.[i] ?? null,
    })),
  );
  let visibleMembers = $derived((space.members ?? []).slice(0, MAX_AVATARS));
  let overflowCount = $derived(Math.max(0, (space.members ?? []).length - MAX_AVATARS));

  let hasActivity = $derived((space.newAssetCount ?? 0) > 0);
  let activityText = $derived.by(() => {
    const count = space.newAssetCount ?? 0;
    const displayCount = count > 99 ? '99+' : String(count);
    if (space.lastContributor) {
      return $t('spaces_card_contributor_new', {
        values: { name: space.lastContributor.name, count: displayCount },
      });
    }
    return $t('spaces_card_new_photos', { values: { count: displayCount } });
  });
</script>

<a
  href={Route.viewSpace({ id: space.id })}
  class="group relative rounded-2xl border border-transparent p-5 hover:bg-gray-100 hover:border-gray-200 dark:hover:border-gray-800 dark:hover:bg-gray-900"
  data-testid="space-card"
  onmouseenter={() => (showMenu = true)}
  onmouseleave={() => (showMenu = false)}
>
  <div class="relative">
    <SpaceCollage assets={collageAssets} {gradientClass} {preload} />

    {#if isPinned}
      <div
        class="absolute top-2 start-2 z-10 rounded-full bg-white/70 p-1 dark:bg-gray-800/70"
        data-testid="pin-overlay"
      >
        <Icon icon={mdiPin} size="14" class="text-gray-600 dark:text-gray-400" />
      </div>
    {/if}

    {#if showMenu}
      <!-- The whole card is an anchor, so swallow the click default here to stay put on menu use. -->
      <ButtonContextMenu
        class="absolute top-2 end-2 z-20"
        data-testid="space-menu-button"
        onclick={(event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        icon={mdiDotsVertical}
        title={$t('more')}
        color="secondary"
        variant="filled"
        size="medium"
        align="top-right"
        direction="left"
        buttonClass="icon-white-drop-shadow"
      >
        <MenuOption
          icon={isPinned ? mdiPinOff : mdiPin}
          text={isPinned ? $t('spaces_unpin') : $t('spaces_pin_to_top')}
          onClick={() => onTogglePin(space.id)}
        />
      </ButtonContextMenu>
    {/if}

    {#if hasActivity}
      <div data-testid="activity-dot" class="absolute -right-1 -top-1 z-10 h-2 w-2 rounded-full bg-immich-primary">
        <div class="absolute inset-0 animate-ping rounded-full bg-immich-primary opacity-40"></div>
      </div>
    {/if}

    {#if visibleMembers.length > 0}
      <div class="absolute bottom-2 end-2 flex items-center">
        {#each visibleMembers as member (member.userId)}
          <div class="-ms-1.5 first:ms-0">
            <UserAvatar
              user={{
                id: member.userId,
                name: member.name,
                email: member.email,
                profileImagePath: member.profileImagePath ?? '',
                avatarColor: (member.avatarColor ?? 'primary') as UserAvatarColor,
                profileChangedAt: member.profileChangedAt ?? '',
              }}
              size="sm"
              noTitle
            />
          </div>
        {/each}
        {#if overflowCount > 0}
          <div
            class="-ms-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-500 text-xs font-medium text-white shadow-md"
          >
            +{overflowCount}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="mt-4">
    <p
      class="w-full leading-6 text-lg line-clamp-2 font-semibold text-black dark:text-white group-hover:text-primary"
      data-testid="space-name"
      title={space.name}
    >
      {space.name}
    </p>

    {#if hasActivity}
      <p data-testid="activity-line" class="truncate text-xs font-medium text-immich-primary">
        {activityText}
      </p>
    {/if}

    <span class="flex gap-2 text-sm dark:text-immich-dark-fg" data-testid="space-details">
      {#if space.assetCount != null}
        <p>{space.assetCount} {$t('photos')}</p>
      {/if}
      {#if space.assetCount != null && space.memberCount != null}
        <p>&middot;</p>
      {/if}
      {#if space.memberCount != null}
        <p>{space.memberCount} {$t('members')}</p>
      {/if}
    </span>
  </div>
</a>
