<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import PeopleMergeSelector from '$lib/components/people/people-merge-selector.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import PersonEditBirthDateModal from '$lib/modals/PersonEditBirthDateModal.svelte';
  import { createUrl, getAssetMediaUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import {
    getSpacePeople,
    mergeSpacePeople,
    SharedSpaceRole,
    updateSpacePerson,
    type SharedSpaceMemberResponseDto,
    type SharedSpacePersonResponseDto,
  } from '@immich/sdk';
  import { ContextMenuButton, IconButton, modalManager, toastManager, type ActionItem } from '@immich/ui';
  import { mdiAccountMultipleCheckOutline, mdiArrowLeft, mdiCalendarEditOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const PAGE_SIZE = 100;

  const space = $derived(data.space);
  const members: SharedSpaceMemberResponseDto[] = $derived(data.members);
  const assetIds: string[] = $derived(data.assetIds);
  const routeStateKey = $derived(`${data.space.id}:${data.person.id}:${data.person.updatedAt}:${data.action ?? ''}`);

  let personOverride = $state<SharedSpacePersonResponseDto>();
  let personOverrideKey = $state('');
  const person = $derived(personOverrideKey === routeStateKey && personOverride ? personOverride : data.person);

  let actionOverride = $state<string | null>();
  let actionOverrideKey = $state('');
  const action = $derived(actionOverrideKey === routeStateKey ? actionOverride : data.action);

  const currentMember = $derived(members.find((member) => member.userId === authManager.user.id));
  const isEditor = $derived(
    currentMember?.role === SharedSpaceRole.Owner || currentMember?.role === SharedSpaceRole.Editor,
  );
  const displayName = $derived(person.name || '');

  const setPerson = (updatedPerson: SharedSpacePersonResponseDto) => {
    personOverride = updatedPerson;
    personOverrideKey = routeStateKey;
  };

  const setAction = (updatedAction: string | null) => {
    actionOverride = updatedAction;
    actionOverrideKey = routeStateKey;
  };

  const getThumbUrl = (person: SharedSpacePersonResponseDto): string => {
    return createUrl(`/shared-spaces/${space.id}/people/${person.id}/thumbnail`, { updatedAt: person.updatedAt });
  };

  const getMergeDisplayName = (person: SharedSpacePersonResponseDto) => person.name || '';

  const loadMergePeople = async () => {
    return getSpacePeople({ id: space.id, limit: PAGE_SIZE });
  };

  const mergePeople = async (
    targetPerson: SharedSpacePersonResponseDto,
    selectedPeople: SharedSpacePersonResponseDto[],
  ) => {
    await mergeSpacePeople({
      id: space.id,
      personId: targetPerson.id,
      sharedSpacePersonMergeDto: { ids: selectedPeople.map(({ id }) => id) },
    });
    toastManager.success($t('spaces_people_merged'));
    return targetPerson;
  };

  async function closeMergeFlow() {
    setAction(null);
    if (data.action === 'merge') {
      await goto(`/spaces/${space.id}/people/${person.id}`, { replaceState: true });
    }
  }

  async function handleMergeComplete(updatedPerson: SharedSpacePersonResponseDto) {
    setPerson(updatedPerson);
    setAction(null);
    await invalidateAll();
  }

  async function openBirthDateModal() {
    await modalManager.show(PersonEditBirthDateModal, {
      birthDate: person.birthDate,
      onSave: async (birthDate) => {
        try {
          const updatedPerson = await updateSpacePerson({
            id: space.id,
            personId: person.id,
            sharedSpacePersonUpdateDto: { birthDate },
          });
          setPerson({ ...person, ...updatedPerson, birthDate: updatedPerson.birthDate ?? birthDate });
          toastManager.success($t('date_of_birth_saved'));
          return true;
        } catch (error) {
          handleError(error, $t('errors.unable_to_save_date_of_birth'));
          return false;
        }
      },
    });
  }

  const actionItems = $derived.by(() => {
    const items: ActionItem[] = [];

    if (isEditor) {
      items.push(
        {
          title: $t('set_date_of_birth'),
          icon: mdiCalendarEditOutline,
          onAction: () => void openBirthDateModal(),
        },
        {
          title: $t('merge_people'),
          icon: mdiAccountMultipleCheckOutline,
          onAction: () => setAction('merge'),
        },
      );
    }

    return items;
  });
</script>

<UserPageLayout title={displayName}>
  {#snippet leading()}
    <IconButton
      variant="ghost"
      shape="round"
      color="secondary"
      aria-label={$t('back')}
      onclick={() => goto(`/spaces/${space.id}/people`)}
      icon={mdiArrowLeft}
    />
  {/snippet}

  {#snippet buttons()}
    {#if isEditor && action !== 'merge'}
      <ContextMenuButton items={actionItems} aria-label={$t('show_person_options')} />
    {/if}
  {/snippet}

  <section class="px-4 pt-4">
    {#if assetIds.length === 0}
      <div class="py-8 text-center">
        <p class="text-gray-500 dark:text-gray-400">{$t('spaces_no_person_assets')}</p>
      </div>
    {:else}
      <div class="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {#each assetIds as assetId (assetId)}
          <a
            href="/spaces/{space.id}/photos/{assetId}"
            class="aspect-square overflow-hidden rounded-sm"
            data-testid="person-asset-{assetId}"
          >
            <img
              src={getAssetMediaUrl({ id: assetId })}
              alt=""
              class="size-full object-cover transition-transform duration-200 hover:scale-105"
              loading="lazy"
            />
          </a>
        {/each}
      </div>
    {/if}
  </section>

  {#if isEditor && action === 'merge'}
    <PeopleMergeSelector
      {person}
      getDisplayName={getMergeDisplayName}
      getThumbnailUrl={getThumbUrl}
      loadPeople={loadMergePeople}
      {mergePeople}
      onBack={() => void closeMergeFlow()}
      onMerge={(mergedPerson) => void handleMergeComplete(mergedPerson)}
      showSimilaritySort={false}
      loadErrorMessage={$t('spaces_error_loading_people')}
      mergeErrorMessage={$t('spaces_error_merging_people')}
    />
  {/if}
</UserPageLayout>
