<script lang="ts">
  import DateInput from '$lib/elements/DateInput.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { createUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import {
    deleteSpacePersonAlias,
    setSpacePersonAlias,
    updateSpacePerson,
    type SharedSpacePersonResponseDto,
  } from '@immich/sdk';
  import { Button, toastManager } from '@immich/ui';
  import { DateTime } from 'luxon';
  import { t } from 'svelte-i18n';

  interface Props {
    spaceId: string;
    person: SharedSpacePersonResponseDto;
    canEditBirthDate: boolean;
    onPersonChange: (person: SharedSpacePersonResponseDto) => void;
  }

  let { spaceId, person, canEditBirthDate, onPersonChange }: Props = $props();

  let aliasInput = $state('');
  let birthDateInput = $state('');
  let isSavingAlias = $state(false);
  let isSavingBirthDate = $state(false);

  $effect(() => {
    aliasInput = person.alias ?? '';
    birthDateInput = person.birthDate ?? '';
  });

  const displayName = $derived(person.alias || person.name || '');
  const thumbnailUrl = $derived(
    createUrl(`/shared-spaces/${spaceId}/people/${person.id}/thumbnail`, { updatedAt: person.updatedAt }),
  );
  const formattedBirthDate = $derived(
    person.birthDate
      ? DateTime.fromISO(person.birthDate).toLocaleString(
          {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric',
          },
          { locale: $locale },
        )
      : '',
  );
  const birthDateLabel = $derived.by(() => {
    if (!formattedBirthDate) {
      return '';
    }

    const label = $t('person_birthdate', { values: { date: formattedBirthDate } });
    return label === 'person_birthdate' ? formattedBirthDate : label;
  });
  const aliasSaveLabel = $derived(`${$t('save')} ${$t('spaces_set_alias')}`);
  const aliasClearLabel = $derived(`${$t('clear')} ${$t('spaces_set_alias')}`);
  const birthDateSaveLabel = $derived(`${$t('save')} ${$t('set_date_of_birth')}`);
  const birthDateClearLabel = $derived(`${$t('clear')} ${$t('set_date_of_birth')}`);

  async function saveAlias() {
    const alias = aliasInput.trim();
    isSavingAlias = true;
    try {
      if (alias) {
        await setSpacePersonAlias({
          id: spaceId,
          personId: person.id,
          sharedSpacePersonAliasDto: { alias },
        });
        person = { ...person, alias };
        aliasInput = alias;
        onPersonChange(person);
        toastManager.success($t('spaces_alias_saved'));
      } else {
        await deleteSpacePersonAlias({ id: spaceId, personId: person.id });
        person = { ...person, alias: null };
        aliasInput = '';
        onPersonChange(person);
        toastManager.success($t('spaces_alias_cleared'));
      }
    } catch (error) {
      handleError(error, $t('spaces_error_saving_alias'));
    } finally {
      isSavingAlias = false;
    }
  }

  async function clearAlias() {
    isSavingAlias = true;
    try {
      await deleteSpacePersonAlias({ id: spaceId, personId: person.id });
      person = { ...person, alias: null };
      aliasInput = '';
      onPersonChange(person);
      toastManager.success($t('spaces_alias_cleared'));
    } catch (error) {
      handleError(error, $t('spaces_error_saving_alias'));
    } finally {
      isSavingAlias = false;
    }
  }

  async function saveBirthDate(nextBirthDate = birthDateInput) {
    isSavingBirthDate = true;
    try {
      const updatedPerson = await updateSpacePerson({
        id: spaceId,
        personId: person.id,
        sharedSpacePersonUpdateDto: { birthDate: nextBirthDate },
      });
      person = updatedPerson;
      birthDateInput = updatedPerson.birthDate ?? '';
      onPersonChange(updatedPerson);
      toastManager.success($t('date_of_birth_saved'));
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_date_of_birth'));
    } finally {
      isSavingBirthDate = false;
    }
  }

  async function clearBirthDate() {
    await saveBirthDate('');
  }

  const todayFormatted = new Date().toISOString().split('T')[0];
</script>

<div
  class="mb-4 flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/50"
>
  <div class="flex items-center gap-4">
    <div class="size-20 overflow-hidden rounded-full">
      <img src={thumbnailUrl} alt={displayName} class="size-full object-cover" />
    </div>
    <div>
      <h2 class="text-xl font-bold">{displayName}</h2>
      {#if person.alias && person.name}
        <p class="text-sm text-gray-500 dark:text-gray-400">{person.name}</p>
      {/if}
      <p class="text-sm text-gray-400 dark:text-gray-500">
        {person.assetCount}
        {$t('photos')}
      </p>
      {#if birthDateLabel}
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {birthDateLabel}
        </p>
      {/if}
    </div>
  </div>

  <div class="grid gap-4 md:grid-cols-2">
    <form class="flex flex-col gap-2" onsubmit={(event) => (event.preventDefault(), saveAlias())}>
      <label class="text-sm font-medium text-gray-700 dark:text-gray-300" for="space-person-alias">
        {$t('spaces_set_alias')}
      </label>
      <input
        id="space-person-alias"
        class="immich-form-input"
        aria-label={$t('spaces_set_alias')}
        placeholder={$t('spaces_alias_placeholder')}
        bind:value={aliasInput}
      />
      <div class="flex gap-2">
        <Button
          type="submit"
          size="small"
          shape="round"
          loading={isSavingAlias}
          aria-label={aliasSaveLabel}
          data-testid="save-alias-button"
        >
          {$t('save')}
        </Button>
        {#if person.alias}
          <Button
            type="button"
            size="small"
            shape="round"
            color="secondary"
            onclick={clearAlias}
            disabled={isSavingAlias}
            aria-label={aliasClearLabel}
            data-testid="clear-alias-button"
          >
            {$t('clear')}
          </Button>
        {/if}
      </div>
    </form>

    {#if canEditBirthDate}
      <form class="flex flex-col gap-2" onsubmit={(event) => (event.preventDefault(), saveBirthDate())}>
        <label class="text-sm font-medium text-gray-700 dark:text-gray-300" for="space-person-birthdate">
          {$t('set_date_of_birth')}
        </label>
        <DateInput
          id="space-person-birthdate"
          class="immich-form-input"
          aria-label={$t('set_date_of_birth')}
          type="date"
          bind:value={birthDateInput}
          max={todayFormatted}
        />
        <div class="flex gap-2">
          <Button
            type="submit"
            size="small"
            shape="round"
            loading={isSavingBirthDate}
            aria-label={birthDateSaveLabel}
            data-testid="save-birthdate-button"
          >
            {$t('save')}
          </Button>
          {#if person.birthDate}
            <Button
              type="button"
              size="small"
              shape="round"
              color="secondary"
              onclick={clearBirthDate}
              disabled={isSavingBirthDate}
              aria-label={birthDateClearLabel}
              data-testid="clear-birthdate-button"
            >
              {$t('clear')}
            </Button>
          {/if}
        </div>
      </form>
    {/if}
  </div>
</div>
