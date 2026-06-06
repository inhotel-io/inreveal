<script lang="ts">
  import { getFaceRepairScanDefaults } from '@immich/sdk';
  import { Field, FormModal } from '@immich/ui';
  import { mdiTune } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  export type AdvancedScanParams = { maxDistance: number; minFaces: number; maxFlaggedFraction: number };
  type Props = { onClose: () => void; onRun: (params: AdvancedScanParams) => void };
  const { onClose, onRun }: Props = $props();

  // Sensible fallbacks until the defaults endpoint resolves.
  let maxDistance = $state(0.5);
  let minFaces = $state(3);
  let maxFlaggedFraction = $state(0.5);

  const loadDefaults = async () => {
    // .catch() is attached synchronously so the rejection is observed before any
    // microtask checkpoint — avoids spurious unhandledRejection in test environments.
    const d = await getFaceRepairScanDefaults().catch(() => null);
    if (d) {
      maxDistance = d.maxDistance;
      minFaces = d.minFaces;
      maxFlaggedFraction = d.maxFlaggedFraction;
    }
    // if null, keep fallbacks; the server re-applies defaults for any omitted field anyway
  };

  onMount(loadDefaults);

  const onSubmit = () => {
    // Coerce to numbers — the API rejects string params (z.number()). Native numeric inputs already bind as
    // numbers; Number() is a no-op safety net.
    onRun({
      maxDistance: Number(maxDistance),
      minFaces: Number(minFaces),
      maxFlaggedFraction: Number(maxFlaggedFraction),
    });
    onClose();
  };
</script>

<FormModal
  title={$t('admin.face_cleanup_advanced_title')}
  icon={mdiTune}
  {onClose}
  {onSubmit}
  submitText={$t('admin.face_cleanup_advanced_apply')}
  size="giant"
>
  <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">{$t('admin.face_cleanup_advanced_subtitle')}</p>

  <div class="flex flex-col gap-5">
    <Field label={$t('admin.face_cleanup_advanced_sensitivity')}>
      <div class="flex items-center gap-3">
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.01"
          bind:value={maxDistance}
          class="flex-1"
          data-testid="sensitivity-range"
        />
        <span class="w-12 text-right font-mono text-sm">{maxDistance.toFixed(2)}</span>
      </div>
      <p class="mt-1 text-xs text-gray-400">{$t('admin.face_cleanup_advanced_sensitivity_help')}</p>
    </Field>

    <Field label={$t('admin.face_cleanup_advanced_min_faces')}>
      <input
        type="number"
        min="1"
        step="1"
        bind:value={minFaces}
        class="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
        data-testid="min-faces-input"
      />
      <p class="mt-1 text-xs text-gray-400">{$t('admin.face_cleanup_advanced_min_faces_help')}</p>
    </Field>

    <Field label={$t('admin.face_cleanup_advanced_cap')}>
      <div class="flex items-center gap-3">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          bind:value={maxFlaggedFraction}
          class="flex-1"
          data-testid="cap-range"
        />
        <span class="w-12 text-right font-mono text-sm">{maxFlaggedFraction.toFixed(2)}</span>
      </div>
      <p class="mt-1 text-xs text-gray-400">{$t('admin.face_cleanup_advanced_cap_help')}</p>
    </Field>

    <button type="button" class="self-start text-sm font-semibold text-primary hover:underline" onclick={loadDefaults}>
      {$t('admin.face_cleanup_advanced_reset')}
    </button>
  </div>
</FormModal>
