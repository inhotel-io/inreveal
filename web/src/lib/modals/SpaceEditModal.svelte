<script lang="ts">
  import ColorPicker from '$lib/components/spaces/color-picker.svelte';
  import { updateSpaceDetails } from '$lib/services/space.service';
  import { UserAvatarColor, type SharedSpaceResponseDto } from '@immich/sdk';
  import { Field, FormModal, Input, Textarea } from '@immich/ui';
  import { mdiAccountGroup } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    space: SharedSpaceResponseDto;
    onClose: (updated?: boolean) => void;
  };

  let { space, onClose }: Props = $props();

  let name = $state(space.name);
  let description = $state(space.description ?? '');
  let color = $state<UserAvatarColor>(space.color ?? UserAvatarColor.Primary);

  // Renaming is the dominant path, so the autofocused name arrives pre-selected and typing
  // replaces it. Only on the FIRST focus — otherwise clicking to place the caret mid-word
  // would keep re-selecting the whole value.
  let hasSelectedName = false;
  const selectNameOnce = (event: FocusEvent & { currentTarget: HTMLInputElement }) => {
    if (hasSelectedName) {
      return;
    }
    hasSelectedName = true;
    event.currentTarget.select();
  };

  const onSubmit = async () => {
    // `description` goes through verbatim — '' clears it server-side, `undefined` would not.
    const success = await updateSpaceDetails(space.id, { name: name.trim(), description, color });
    if (success) {
      onClose(true);
    }
  };
</script>

<FormModal
  icon={mdiAccountGroup}
  title={$t('spaces_edit')}
  size="small"
  disabled={name.trim().length === 0}
  {onClose}
  {onSubmit}
>
  <div class="flex flex-col gap-4 m-4">
    <Field label={$t('name')} required>
      <Input bind:value={name} maxlength={100} autofocus onfocus={selectNameOnce} data-testid="space-edit-name" />
    </Field>
    <Field label={$t('description')}>
      <Textarea bind:value={description} maxlength={500} data-testid="space-edit-description" />
    </Field>
    <Field label={$t('color')}>
      <ColorPicker value={color} onchange={(c) => (color = c)} />
    </Field>
  </div>
</FormModal>
