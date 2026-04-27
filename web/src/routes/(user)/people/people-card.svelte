<script lang="ts">
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import PersonTile from '$lib/components/people/person-tile.svelte';
  import type { ManagedPerson } from '$lib/components/people/people-types';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/button-context-menu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/menu-option.svelte';
  import { Route } from '$lib/route';
  import { getPersonActions } from '$lib/services/person.service';
  import { getPeopleThumbnailUrl } from '$lib/utils';
  import { type PersonResponseDto } from '@immich/sdk';
  import {
    mdiAccountMultipleCheckOutline,
    mdiDotsVertical,
    mdiEyeOffOutline,
    mdiHeartMinusOutline,
    mdiHeartOutline,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    person: PersonResponseDto;
    onMergePeople: () => void;
    onHidePerson: () => void;
    onToggleFavorite: () => void;
  };

  let { person, onMergePeople, onHidePerson, onToggleFavorite }: Props = $props();

  const { SetDateOfBirth } = $derived(getPersonActions($t, person));

  const managedPerson: ManagedPerson = $derived({
    id: person.id,
    displayName: person.name,
    canonicalName: person.name,
    thumbnailUrl: getPeopleThumbnailUrl(person),
    href: Route.viewPerson(person, { previousRoute: Route.people() }),
    isHidden: person.isHidden,
    isFavorite: person.isFavorite,
    type: person.type,
    species: person.species,
  });
</script>

<PersonTile person={managedPerson}>
  {#snippet actionMenu()}
    <ButtonContextMenu
      buttonClass="icon-white-drop-shadow"
      color="secondary"
      size="medium"
      variant="filled"
      icon={mdiDotsVertical}
      title={$t('show_person_options')}
    >
      <MenuOption onClick={onHidePerson} icon={mdiEyeOffOutline} text={$t('hide_person')} />
      <ActionMenuItem action={SetDateOfBirth} />
      <MenuOption onClick={onMergePeople} icon={mdiAccountMultipleCheckOutline} text={$t('merge_people')} />
      <MenuOption
        onClick={onToggleFavorite}
        icon={person.isFavorite ? mdiHeartMinusOutline : mdiHeartOutline}
        text={person.isFavorite ? $t('unfavorite') : $t('to_favorite')}
      />
    </ButtonContextMenu>
  {/snippet}
</PersonTile>
