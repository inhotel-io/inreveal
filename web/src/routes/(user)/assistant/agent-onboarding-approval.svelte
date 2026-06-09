<script lang="ts">
  import { AgentApprovalMode } from '@immich/sdk';
  import { t } from 'svelte-i18n';

  interface Props {
    approval: AgentApprovalMode;
    onChange: (a: AgentApprovalMode) => void;
  }
  let { approval, onChange }: Props = $props();

  const MODES = [
    {
      value: AgentApprovalMode.PlanOnly,
      labelKey: 'assistant_onboarding_approval_plan',
      descKey: 'assistant_onboarding_approval_plan_desc',
      recommended: true,
      flow: [
        { type: 'node-ai', label: 'Drafts plan' },
        { type: 'arrow' },
        { type: 'node-you', label: 'You ✓' },
        { type: 'arrow' },
        { type: 'node-go', label: 'Runs' },
      ],
    },
    {
      value: AgentApprovalMode.Strict,
      labelKey: 'assistant_onboarding_approval_strict',
      descKey: 'assistant_onboarding_approval_strict_desc',
      recommended: false,
      flow: [
        { type: 'node-ai', label: 'Step' },
        { type: 'arrow' },
        { type: 'node-you', label: 'You ✓' },
        { type: 'arrow' },
        { type: 'node-ai', label: 'Step…' },
      ],
    },
  ] as const;
</script>

<div class="flex flex-col gap-6">
  <div>
    <p class="text-sm font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
      {$t('assistant_onboarding_approval_eyebrow')}
    </p>
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">{$t('assistant_onboarding_approval_title')}</h2>
    <p class="mt-2 text-gray-500 dark:text-neutral-400">{$t('assistant_onboarding_approval_subtitle')}</p>
  </div>

  <div role="group" aria-label={$t('assistant_onboarding_approval_group_label')} class="grid grid-cols-2 gap-3">
    {#each MODES as mode (mode.value)}
      {@const isSelected = approval === mode.value}
      <button
        aria-pressed={isSelected}
        aria-label={$t(mode.labelKey)}
        onclick={() => onChange(mode.value)}
        class="text-left rounded-xl border p-4 flex flex-col gap-3 transition-all
          {isSelected
          ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
          : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-immich-dark-gray hover:border-primary/50'}"
      >
        <!-- card top: title + optional recommended badge -->
        <div class="flex items-center justify-between gap-2">
          <span class="font-semibold text-gray-900 dark:text-white">{$t(mode.labelKey)}</span>
          {#if mode.recommended}
            <span class="text-xs font-medium px-2 py-0.5 rounded-full text-primary bg-primary/10">
              {$t('assistant_onboarding_recommended')}
            </span>
          {/if}
        </div>

        <!-- description -->
        <p class="text-xs text-gray-500 dark:text-neutral-400 leading-relaxed">{$t(mode.descKey)}</p>

        <!-- mini flow diagram -->
        <div class="flex items-center gap-1.5 rounded-lg p-2.5 bg-gray-50 dark:bg-gray-900">
          {#each mode.flow as node}
            {#if node.type === 'arrow'}
              <svg class="w-3 h-3 text-gray-400 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
            {:else}
              <span class="text-xs font-bold px-1.5 py-1 rounded-md border whitespace-nowrap
                {node.type === 'node-you'
                ? 'text-primary border-primary/40 bg-white dark:bg-gray-800'
                : node.type === 'node-go'
                ? 'text-green-600 dark:text-green-400 border-green-400/40 bg-white dark:bg-gray-800'
                : 'text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'}">
                {node.label}
              </span>
            {/if}
          {/each}
        </div>
      </button>
    {/each}
  </div>

  <p class="text-xs text-gray-400 dark:text-gray-600">
    {$t('assistant_onboarding_approval_hint')}
  </p>
</div>
