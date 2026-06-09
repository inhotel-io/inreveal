<script lang="ts">
  import { AgentPermissionPreset } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import { isCloudProvider, type OnboardingProviderId } from './agent-onboarding-model';

  interface Props {
    provider: OnboardingProviderId;
    preset: AgentPermissionPreset;
    onChange: (preset: AgentPermissionPreset) => void;
  }
  let { provider, preset, onChange }: Props = $props();

  // sees: [photoDetails, thumbnails, originals]
  const PRESETS = [
    {
      value: AgentPermissionPreset.Careful,
      labelKey: 'assistant_permission_preset_careful',
      descKey: 'assistant_permission_preset_careful_description',
      sees: [true, false, false] as const,
      chips: ['Albums & spaces', 'Tags', 'Favorites'],
      noChips: ['Edit', 'Trash', 'Share'],
      tag: null,
    },
    {
      value: AgentPermissionPreset.VisualOrganizer,
      labelKey: 'assistant_permission_preset_visual_organizer',
      descKey: 'assistant_permission_preset_visual_organizer_description',
      sees: [true, true, false] as const,
      chips: ['Everything in Careful', 'Edit & archive', 'Curate by content', 'Share with people'],
      noChips: ['Original files', 'Public links'],
      tag: 'assistant_onboarding_recommended',
    },
    {
      value: AgentPermissionPreset.LocalPowerUser,
      labelKey: 'assistant_permission_preset_local_power_user',
      descKey: 'assistant_permission_preset_local_power_user_description',
      sees: [true, true, true] as const,
      chips: ['Everything above', 'Original files', 'Public links', 'Locked folder', 'Delete albums'],
      noChips: [],
      tag: 'assistant_onboarding_local_models',
    },
  ] as const;

  const METER_LABELS = [
    'assistant_onboarding_meter_photo_details',
    'assistant_onboarding_meter_thumbnails',
    'assistant_onboarding_meter_originals',
  ] as const;

  const showCloudCaution = $derived(preset === AgentPermissionPreset.LocalPowerUser && isCloudProvider(provider));
</script>

<div class="flex flex-col gap-6">
  <div>
    <p class="text-sm font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
      {$t('assistant_onboarding_access_eyebrow')}
    </p>
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">{$t('assistant_onboarding_access_title')}</h2>
    <p class="mt-2 text-gray-500 dark:text-neutral-400">{$t('assistant_onboarding_access_subtitle')}</p>
  </div>

  <div role="group" aria-label={$t('assistant_onboarding_access_group_label')} class="flex flex-col gap-3">
    {#each PRESETS as p (p.value)}
      {@const isSelected = preset === p.value}
      <button
        aria-pressed={isSelected}
        aria-label={$t(p.labelKey)}
        onclick={() => onChange(p.value)}
        class="w-full text-left rounded-2xl border p-4 transition-all
          {isSelected
          ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
          : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-immich-dark-gray hover:border-primary/50'}"
      >
        <!-- card top: title + optional tag -->
        <div class="flex items-center gap-2 mb-3">
          <span class="font-semibold text-gray-900 dark:text-white">{$t(p.labelKey)}</span>
          {#if p.tag}
            <span class="text-xs font-medium px-2 py-0.5 rounded-full
              {p.value === AgentPermissionPreset.VisualOrganizer
              ? 'bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-neutral-400'}">
              {$t(p.tag)}
            </span>
          {/if}
        </div>

        <!-- visibility meter -->
        <div class="flex flex-col gap-1 mb-3">
          {#each METER_LABELS as label, i}
            <span class="flex items-center gap-2 text-sm
              {p.sees[i] ? 'text-primary font-medium' : 'text-gray-400 dark:text-gray-600'}">
              <span class="w-2 h-2 rounded-full flex-shrink-0
                {p.sees[i] ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}">
              </span>
              {$t(label)}
            </span>
          {/each}
        </div>

        <!-- description -->
        <p class="text-sm text-gray-500 dark:text-neutral-400 mb-3">{$t(p.descKey)}</p>

        <!-- can-do chips -->
        <div class="flex flex-wrap gap-1.5">
          {#each p.chips as chip}
            <span class="text-xs px-2 py-0.5 rounded-lg bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400">
              {chip}
            </span>
          {/each}
          {#each p.noChips as chip}
            <span class="text-xs px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 line-through">
              {chip}
            </span>
          {/each}
        </div>
      </button>
    {/each}
  </div>

  <!-- note box: cloud caution or neutral info -->
  {#if showCloudCaution}
    <div class="flex gap-3 rounded-xl p-4 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
      <svg class="w-5 h-5 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <p class="text-sm">{$t('assistant_onboarding_access_cloud_caution')}</p>
    </div>
  {:else}
    <div class="flex gap-3 rounded-xl p-4 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-neutral-400">
      <svg class="w-5 h-5 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4M12 8h.01"/>
      </svg>
      <p class="text-sm">{$t('assistant_onboarding_access_info_note')}</p>
    </div>
  {/if}
</div>
