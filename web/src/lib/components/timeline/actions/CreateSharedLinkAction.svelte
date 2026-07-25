<script lang="ts">
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import SharedLinkCreateModal from '$lib/modals/SharedLinkCreateModal.svelte';
  import { IconButton, modalManager } from '@immich/ui';
  import { mdiShareVariantOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  const handleClick = async () => {
    // `Permission.AssetShare` is owner ∪ partner only and rejects the ENTIRE request if it names
    // one asset the caller does not own, so send the owned subset rather than the raw selection.
    // The excluded count is surfaced in the modal so the narrowing is never silent.
    const ownedAssetIds = assetMultiSelectManager.ownedAssets.map(({ id }) => id);
    await modalManager.show(SharedLinkCreateModal, {
      assetIds: ownedAssetIds,
      excludedCount: assetMultiSelectManager.assets.length - ownedAssetIds.length,
    });
  };
</script>

<IconButton
  shape="round"
  color="secondary"
  variant="ghost"
  aria-label={$t('share')}
  icon={mdiShareVariantOutline}
  onclick={handleClick}
/>
