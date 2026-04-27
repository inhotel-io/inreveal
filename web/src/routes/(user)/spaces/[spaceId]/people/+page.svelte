<script lang="ts">
  import { goto } from '$app/navigation';
  import { shortcut } from '$lib/actions/shortcut';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import PeopleGrid from '$lib/components/people/people-grid.svelte';
  import PersonTile from '$lib/components/people/person-tile.svelte';
  import type { ManagedPerson } from '$lib/components/people/people-types';
  import ManageSpacePeopleVisibility from '$lib/components/spaces/manage-space-people-visibility.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/button-context-menu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/menu-option.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { createUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import {
    getSpacePeople,
    SharedSpaceRole,
    updateSpacePerson,
    type SharedSpaceMemberResponseDto,
    type SharedSpacePersonResponseDto,
    type SharedSpaceResponseDto,
  } from '@immich/sdk';
  import { Button, Icon, IconButton, toastManager } from '@immich/ui';
  import {
    mdiAccountGroupOutline,
    mdiAccountMultipleCheckOutline,
    mdiArrowLeft,
    mdiDotsVertical,
    mdiEyeOffOutline,
    mdiEyeOutline,
  } from '@mdi/js';
  import { fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let space: SharedSpaceResponseDto = $state(data.space);
  let members: SharedSpaceMemberResponseDto[] = $state(data.members);
  let people = $state<SharedSpacePersonResponseDto[]>(data.people);

  $effect(() => {
    if (data.space.id !== space.id) {
      space = data.space;
      members = data.members;
      people = data.people;
      editingName = '';
      hasMore = data.people.length >= PAGE_SIZE;
    }
  });

  const PAGE_SIZE = 100;
  let loading = $state(false);
  let hasMore = $state(data.people.length >= PAGE_SIZE);

  let selectHidden = $state(false);
  const visiblePeople = $derived(people.filter((p) => !p.isHidden));
  let allPeople = $state<SharedSpacePersonResponseDto[]>([]);

  // Name editing state
  let editingName = $state('');

  const currentMember = $derived(members.find((m) => m.userId === authManager.user.id));
  const isOwner = $derived(currentMember?.role === SharedSpaceRole.Owner);
  const isEditor = $derived(isOwner || currentMember?.role === SharedSpaceRole.Editor);

  const getThumbUrl = (person: SharedSpacePersonResponseDto): string => {
    return createUrl(`/shared-spaces/${space.id}/people/${person.id}/thumbnail`, { updatedAt: person.updatedAt });
  };

  const toManagedPerson = (person: SharedSpacePersonResponseDto): ManagedPerson => ({
    id: person.id,
    displayName: person.alias || person.name || '',
    canonicalName: person.name,
    thumbnailUrl: getThumbUrl(person),
    href: `/spaces/${space.id}/people/${person.id}`,
    isHidden: person.isHidden,
    type: person.type,
    assetCount: person.assetCount,
    faceCount: person.faceCount,
  });

  async function refreshPeople() {
    try {
      people = await getSpacePeople({ id: space.id, limit: PAGE_SIZE });
      hasMore = people.length >= PAGE_SIZE;
    } catch (error) {
      handleError(error, $t('spaces_error_loading_people'));
    }
  }

  async function loadMore() {
    if (loading || !hasMore) {
      return;
    }
    loading = true;
    try {
      const more = await getSpacePeople({ id: space.id, limit: PAGE_SIZE, offset: people.length });
      people = [...people, ...more];
      hasMore = more.length >= PAGE_SIZE;
    } catch (error) {
      handleError(error, $t('spaces_error_loading_people'));
    } finally {
      loading = false;
    }
  }

  async function openVisibilityModal() {
    try {
      allPeople = await getSpacePeople({ id: space.id, withHidden: true, limit: PAGE_SIZE });
    } catch (error) {
      handleError(error, $t('spaces_error_loading_people'));
      return;
    }
    hasMoreVisibility = allPeople.length >= PAGE_SIZE;
    selectHidden = true;
  }

  let hasMoreVisibility = $state(false);
  let loadingVisibility = $state(false);

  async function loadMoreVisibility() {
    if (loadingVisibility || !hasMoreVisibility) {
      return;
    }
    loadingVisibility = true;
    try {
      const more = await getSpacePeople({
        id: space.id,
        withHidden: true,
        limit: PAGE_SIZE,
        offset: allPeople.length,
      });
      allPeople = [...allPeople, ...more];
      hasMoreVisibility = more.length >= PAGE_SIZE;
    } catch (error) {
      handleError(error, $t('spaces_error_loading_people'));
    } finally {
      loadingVisibility = false;
    }
  }

  const onNameFocus = (person: SharedSpacePersonResponseDto) => {
    editingName = person.name;
  };

  const onNameSubmit = async (name: string, person: SharedSpacePersonResponseDto) => {
    try {
      if (name === person.name) {
        return;
      }
      await updateSpacePerson({
        id: space.id,
        personId: person.id,
        sharedSpacePersonUpdateDto: { name },
      });
      await refreshPeople();
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_name'));
    }
  };

  const onNameInput = (event: Event) => {
    if (event.target) {
      editingName = (event.target as HTMLInputElement).value;
    }
  };

  function handleMerge(personId: string) {
    void goto(`/spaces/${space.id}/people/${personId}?action=merge`);
  }

  async function handleHide(person: SharedSpacePersonResponseDto) {
    try {
      await updateSpacePerson({
        id: space.id,
        personId: person.id,
        sharedSpacePersonUpdateDto: { isHidden: true },
      });
      const idx = people.findIndex((p) => p.id === person.id);
      if (idx !== -1) {
        people[idx] = { ...people[idx], isHidden: true };
      }
      toastManager.primary($t('changed_visibility_successfully'));
    } catch (error) {
      handleError(error, $t('errors.unable_to_hide_person'));
    }
  }
</script>

<UserPageLayout title={$t('spaces_people_title')}>
  {#snippet leading()}
    <IconButton
      variant="ghost"
      shape="round"
      color="secondary"
      aria-label={$t('back')}
      onclick={() => goto(`/spaces/${space.id}`)}
      icon={mdiArrowLeft}
    />
  {/snippet}
  {#snippet buttons()}
    {#if isEditor}
      <Button leadingIcon={mdiEyeOutline} onclick={openVisibilityModal} size="small" variant="ghost" color="secondary"
        >{$t('show_and_hide_people')}</Button
      >
    {/if}
  {/snippet}

  {#if visiblePeople.length === 0}
    <div class="flex min-h-[calc(66vh-11rem)] w-full place-content-center items-center dark:text-white">
      <div class="flex flex-col content-center items-center text-center">
        <Icon icon={mdiAccountGroupOutline} size="3.5em" />
        <p class="mt-5 text-lg text-gray-500 dark:text-gray-400">{$t('spaces_no_people')}</p>
        <p class="mt-1 text-sm text-gray-400 dark:text-gray-500">
          {$t('spaces_no_people_description')}
        </p>
      </div>
    </div>
  {:else}
    <div class="px-4 pt-4">
      <PeopleGrid
        items={visiblePeople}
        class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8"
        hasNextPage={hasMore}
        {loading}
        loadNextPage={loadMore}
      >
        {#snippet children(person)}
          {@const managedPerson = toManagedPerson(person)}
          <div
            class="rounded-xl border-2 border-transparent p-2 transition-all hover:border-immich-primary/50 hover:bg-gray-200 hover:shadow-sm dark:hover:border-immich-dark-primary/25 dark:hover:bg-immich-dark-primary/20"
          >
            <PersonTile person={managedPerson} showActionMenu={isEditor}>
              {#snippet actionMenu()}
                <ButtonContextMenu
                  buttonClass="icon-white-drop-shadow"
                  color="secondary"
                  size="medium"
                  variant="filled"
                  icon={mdiDotsVertical}
                  title={$t('show_person_options')}
                >
                  <MenuOption onClick={() => handleHide(person)} icon={mdiEyeOffOutline} text={$t('hide_person')} />
                  <MenuOption
                    onClick={() => handleMerge(person.id)}
                    icon={mdiAccountMultipleCheckOutline}
                    text={$t('merge_people')}
                  />
                </ButtonContextMenu>
              {/snippet}

              {#snippet footer()}
                {#if isEditor}
                  <input
                    type="text"
                    class="mt-2 w-full rounded-2xl border-gray-100 bg-white py-2 text-center text-sm text-primary placeholder-gray-400 dark:border-gray-900 dark:bg-immich-dark-gray"
                    value={person.name}
                    placeholder={$t('add_a_name')}
                    use:shortcut={{ shortcut: { key: 'Enter' }, onShortcut: (e) => e.currentTarget.blur() }}
                    onfocusin={() => onNameFocus(person)}
                    onfocusout={() => onNameSubmit(editingName, person)}
                    oninput={(event) => onNameInput(event)}
                  />
                {:else if managedPerson.displayName}
                  <p class="mt-2 truncate text-center text-sm font-medium">{managedPerson.displayName}</p>
                {/if}
              {/snippet}
            </PersonTile>
          </div>
        {/snippet}
      </PeopleGrid>
    </div>
  {/if}
</UserPageLayout>

{#if selectHidden}
  <dialog
    transition:fly={{ y: 500, duration: 150, easing: quintOut, opacity: 0 }}
    class="fixed inset-0 h-full w-full max-w-none max-h-none bg-light"
    aria-labelledby="manage-visibility-title"
    {@attach (dialog) => dialog.showModal()}
  >
    <ManageSpacePeopleVisibility
      people={allPeople}
      spaceId={space.id}
      onClose={() => (selectHidden = false)}
      onUpdate={() => refreshPeople()}
      hasMore={hasMoreVisibility}
      loading={loadingVisibility}
      onLoadMore={loadMoreVisibility}
    />
  </dialog>
{/if}
