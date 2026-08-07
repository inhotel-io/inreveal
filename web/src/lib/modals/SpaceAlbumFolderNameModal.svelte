<script lang="ts">
  import { Field, FormModal, Input } from '@immich/ui';
  import { mdiFolderPlusOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    title: string;
    /** Pre-filled when renaming; empty when creating. */
    initialName?: string;
    /** Defaults keep every existing folder call site working unchanged. */
    icon?: string;
    label?: string;
    onClose: (name?: string) => void;
  };

  const {
    title,
    initialName = '',
    icon = mdiFolderPlusOutline,
    label = $t('space_album_folder_name_label'),
    onClose,
  }: Props = $props();

  let value = $state(initialName);

  // Trim here as well as on the server: it keeps "  " from arriving as a submittable name,
  // and the server re-validates regardless.
  const onSubmit = () => {
    const name = value.trim();
    onClose(name || undefined);
  };
</script>

<FormModal {title} {icon} {onClose} {onSubmit} size="small" submitText={$t('save')}>
  <Field {label}>
    <Input bind:value />
  </Field>
</FormModal>
