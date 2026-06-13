<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import SpaceLinkedLibrariesModal from '$lib/modals/SpaceLinkedLibrariesModal.svelte';
  import SpaceTabs from '$lib/components/spaces/space-tabs.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { spaceUiManager } from '$lib/managers/space-ui-manager.svelte';
  import { Route } from '$lib/route';
  import { handleError } from '$lib/utils/handle-error';
  import {
    bulkAddAssets,
    removeSpace,
    SharedSpaceRole,
    updateMemberPreferences,
    updateMemberTimeline,
    updateSpace,
  } from '@immich/sdk';
  import { Button, IconButton, modalManager, toastManager } from '@immich/ui';
  import {
    mdiArrowLeft,
    mdiBookshelf,
    mdiDeleteOutline,
    mdiDotsVertical,
    mdiEyeOffOutline,
    mdiEyeOutline,
    mdiFaceRecognition,
    mdiImageMultipleOutline,
    mdiImagePlusOutline,
    mdiPaw,
  } from '@mdi/js';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { LayoutData } from './$types';

  interface Props {
    data: LayoutData;
    children?: Snippet;
  }

  let { data, children }: Props = $props();

  const space = $derived(data.space);
  const members = $derived(data.members);
  const base = $derived(`/spaces/${space.id}`);

  const currentMember = $derived(members.find((m) => m.userId === authManager.user.id));
  const isOwner = $derived(currentMember?.role === SharedSpaceRole.Owner);
  const isEditor = $derived(
    currentMember?.role === SharedSpaceRole.Owner || currentMember?.role === SharedSpaceRole.Editor,
  );
  const showInTimeline = $derived(currentMember?.showInTimeline ?? true);
  const sharePersonMetadata = $derived(currentMember?.sharePersonMetadata ?? true);

  // A detail route (person or album) suppresses the cover + tabs; it keeps its own back nav.
  const suffix = $derived(page.url.pathname.slice(base.length));
  const isDetailRoute = $derived(/^\/(people|albums)\/[^/]+/.test(suffix));
  const showChrome = $derived(!isDetailRoute && !spaceUiManager.chromeHidden);

  const handleAddPhotos = () => {
    spaceUiManager.requestAddPhotos();
    if (page.url.pathname !== base) {
      void goto(base);
    }
  };

  const handleToggleTimeline = async () => {
    try {
      await updateMemberTimeline({
        id: space.id,
        sharedSpaceMemberTimelineDto: { showInTimeline: !showInTimeline },
      });
      await invalidateAll();
    } catch (error) {
      handleError(error, $t('errors.unable_to_update_timeline_display_status'));
    }
  };

  const handleTogglePersonMetadataSharing = async () => {
    try {
      await updateMemberPreferences({
        id: space.id,
        sharedSpaceMemberPreferencesDto: { sharePersonMetadata: !sharePersonMetadata },
      });
      await invalidateAll();
    } catch (error) {
      handleError(error, $t('errors.unable_to_update_person_metadata_sharing'));
    }
  };

  const handleBulkAddAssets = async () => {
    const confirmed = await modalManager.showDialog({
      title: $t('add_all_photos'),
      prompt: $t('bulk_add_confirmation'),
    });
    if (!confirmed) {
      return;
    }
    try {
      await bulkAddAssets({ id: space.id });
      toastManager.success($t('bulk_add_started'));
    } catch (error) {
      handleError(error, $t('errors.error_adding_assets_to_space'));
    }
  };

  const handleLinkLibraries = async () => {
    const changed = await modalManager.show(SpaceLinkedLibrariesModal, { space });
    if (changed) {
      await invalidateAll();
    }
  };

  const handleToggleFaceRecognition = async () => {
    try {
      await updateSpace({
        id: space.id,
        sharedSpaceUpdateDto: { faceRecognitionEnabled: !space.faceRecognitionEnabled },
      });
      await invalidateAll();
    } catch (error) {
      handleError(error, $t('spaces_toggle_people_failed'));
    }
  };

  const handleTogglePets = async () => {
    try {
      await updateSpace({ id: space.id, sharedSpaceUpdateDto: { petsEnabled: !space.petsEnabled } });
      await invalidateAll();
    } catch (error) {
      handleError(error, $t('spaces_toggle_pets_failed'));
    }
  };

  const handleDelete = async () => {
    const confirmed = await modalManager.showDialog({
      prompt: $t('spaces_delete_confirmation', { values: { name: space.name } }),
      title: $t('spaces_delete'),
    });
    if (!confirmed) {
      return;
    }
    await removeSpace({ id: space.id });
    await goto(Route.spaces());
  };
</script>

<UserPageLayout hideNavbar={spaceUiManager.chromeHidden} title={space.name} scrollbar={false}>
  {#snippet leading()}
    {#if !spaceUiManager.chromeHidden}
      <IconButton
        variant="ghost"
        shape="round"
        color="secondary"
        aria-label={$t('back')}
        onclick={() => goto(Route.spaces())}
        icon={mdiArrowLeft}
      />
    {/if}
  {/snippet}

  {#snippet buttons()}
    {#if !spaceUiManager.chromeHidden}
      <div class="flex items-center gap-1">
        {#if isEditor}
          <!-- Mockup: a labeled primary "＋ Add photos" button; text hides on narrow widths → icon only. -->
          <Button
            size="small"
            leadingIcon={mdiImagePlusOutline}
            onclick={handleAddPhotos}
            aria-label={$t('add_photos')}
            data-testid="space-add-photos"
          >
            <span class="hidden sm:inline">{$t('add_photos')}</span>
          </Button>
        {/if}
        <ButtonContextMenu
          direction="left"
          align="top-right"
          color="secondary"
          title={$t('more')}
          icon={mdiDotsVertical}
          data-testid="space-overflow"
        >
          <MenuOption
            text={showInTimeline ? $t('spaces_hide_from_timeline') : $t('spaces_show_on_timeline')}
            icon={showInTimeline ? mdiEyeOutline : mdiEyeOffOutline}
            onClick={handleToggleTimeline}
          />
          <MenuOption
            text={sharePersonMetadata ? $t('spaces_stop_sharing_person_metadata') : $t('spaces_share_person_metadata')}
            icon={mdiFaceRecognition}
            onClick={handleTogglePersonMetadataSharing}
          />
          {#if isEditor || authManager.user?.isAdmin}
            <hr class="my-1 border-gray-300" />
          {/if}
          {#if isEditor}
            <MenuOption text={$t('add_all_photos')} icon={mdiImageMultipleOutline} onClick={handleBulkAddAssets} />
          {/if}
          {#if authManager.user?.isAdmin}
            <MenuOption text={$t('spaces_link_libraries')} icon={mdiBookshelf} onClick={handleLinkLibraries} />
          {/if}
          {#if isOwner}
            <hr class="my-1 border-gray-300" />
            <MenuOption
              text={space.faceRecognitionEnabled ? $t('spaces_hide_people') : $t('spaces_show_people')}
              icon={mdiFaceRecognition}
              onClick={handleToggleFaceRecognition}
            />
            {#if space.faceRecognitionEnabled && space.hasPets}
              <MenuOption
                text={space.petsEnabled ? $t('spaces_hide_pets') : $t('spaces_show_pets')}
                icon={mdiPaw}
                onClick={handleTogglePets}
              />
            {/if}
            <hr class="my-1 border-gray-300" />
            <MenuOption
              text={$t('spaces_delete')}
              icon={mdiDeleteOutline}
              textColor="text-red-500"
              onClick={handleDelete}
            />
          {/if}
        </ButtonContextMenu>
      </div>
    {/if}
  {/snippet}

  <div class="flex h-full flex-col">
    {#if showChrome}
      <!-- cover (SpaceHero) is inserted above the tabs in Task 9 -->
      <SpaceTabs
        spaceId={space.id}
        faceRecognitionEnabled={space.faceRecognitionEnabled}
        photoCount={space.assetCount ?? 0}
        albumCount={data.linkedAlbums.length}
        memberCount={members.length}
      />
    {/if}
    <div class="min-h-0 flex-1">
      {@render children?.()}
    </div>
  </div>
</UserPageLayout>
