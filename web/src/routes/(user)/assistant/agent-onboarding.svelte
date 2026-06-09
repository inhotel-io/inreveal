<script lang="ts">
  import { AgentApprovalMode, AgentPermissionPreset } from '@immich/sdk';
  import { Button } from '@immich/ui';
  import { t } from 'svelte-i18n';
  import AgentOnboardingAccess from './agent-onboarding-access.svelte';
  import AgentOnboardingApproval from './agent-onboarding-approval.svelte';
  import AgentOnboardingConnect from './agent-onboarding-connect.svelte';
  import { ONBOARDING_DEFAULT_APPROVAL, ONBOARDING_DEFAULT_PRESET, type OnboardingProviderId } from './agent-onboarding-model';

  interface OnboardingResult {
    credentialId: string;
    model: string;
    permissionPreset: AgentPermissionPreset;
    approvalMode: AgentApprovalMode;
  }

  interface Props {
    onComplete: (result: OnboardingResult) => void;
  }
  let { onComplete }: Props = $props();

  // Step machine: 0=welcome 1=connect 2=access 3=approval 4=ready
  let step = $state(0);

  // State threaded from connect step
  let connectedCredentialId = $state('');
  let connectedModel = $state('');
  let connectedProvider = $state<OnboardingProviderId>('local');

  // Access + approval defaults
  let preset = $state<AgentPermissionPreset>(ONBOARDING_DEFAULT_PRESET);
  let approval = $state<AgentApprovalMode>(ONBOARDING_DEFAULT_APPROVAL);

  const continueEnabled = $derived(step !== 1 || connectedCredentialId !== '');

  const handleConnected = (credentialId: string, model: string, provider: OnboardingProviderId) => {
    connectedCredentialId = credentialId;
    connectedModel = model;
    connectedProvider = provider;
  };

  const goNext = () => {
    if (continueEnabled) {
      step = Math.min(step + 1, 4);
    }
  };

  const goBack = () => {
    step = Math.max(step - 1, 0);
  };

  const finish = () => {
    onComplete({
      credentialId: connectedCredentialId,
      model: connectedModel,
      permissionPreset: preset,
      approvalMode: approval,
    });
  };
</script>

<div class="mx-auto max-w-3xl flex flex-col gap-6">
  <!-- Stepper (steps 1–4) -->
  {#if step >= 1 && step <= 4}
    <div class="flex items-center justify-between gap-4">
      <div class="flex gap-1.5 flex-1 max-w-[220px]">
        {#each [1, 2, 3, 4] as seg}
          <div
            class="h-[5px] flex-1 rounded-full overflow-hidden relative
              {seg <= step ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}"
          ></div>
        {/each}
      </div>
      <span class="text-xs font-semibold text-gray-400 dark:text-gray-500 tabular-nums">
        {$t('assistant_onboarding_step_count', { values: { step, total: 4 } })}
      </span>
    </div>
  {/if}

  <!-- WELCOME (step 0) -->
  {#if step === 0}
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-4">
        <!-- hero mark -->
        <div class="w-[60px] h-[60px] rounded-[18px] bg-primary flex items-center justify-center text-white">
          <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="14" rx="2.5"/>
            <path d="m3 14 4-4 3.5 3.5"/>
            <path d="m14 13 2.5-2.5L21 14"/>
            <circle cx="9" cy="9" r="1.4"/>
          </svg>
        </div>
        <h1 class="text-3xl font-extrabold leading-tight tracking-tight text-gray-900 dark:text-white">
          {$t('assistant_onboarding_welcome_title')}
        </h1>
        <p class="text-gray-500 dark:text-neutral-400 leading-relaxed">
          {$t('assistant_onboarding_welcome_subtitle')}
        </p>
      </div>

      <!-- reassurance promises -->
      <div class="flex flex-col gap-3">
        <div class="flex gap-3 items-start">
          <span class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
            <svg class="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </span>
          <div>
            <div class="font-semibold text-sm text-gray-900 dark:text-white">Your photos stay on your server</div>
            <div class="text-xs text-gray-500 dark:text-neutral-400 leading-snug mt-0.5">Nothing is uploaded anywhere except the AI model you pick.</div>
          </div>
        </div>
        <div class="flex gap-3 items-start">
          <span class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
            <svg class="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </span>
          <div>
            <div class="font-semibold text-sm text-gray-900 dark:text-white">It always asks first</div>
            <div class="text-xs text-gray-500 dark:text-neutral-400 leading-snug mt-0.5">The assistant proposes changes — you approve before anything happens.</div>
          </div>
        </div>
        <div class="flex gap-3 items-start">
          <span class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
            <svg class="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.7 6.3a4 4 0 0 1 0 5.6l-1.4 1.4a4 4 0 0 1-5.6-5.6l.7-.7"/>
              <path d="M9.3 17.7a4 4 0 0 1 0-5.6l1.4-1.4a4 4 0 0 1 5.6 5.6l-.7.7"/>
            </svg>
          </span>
          <div>
            <div class="font-semibold text-sm text-gray-900 dark:text-white">Bring your own model</div>
            <div class="text-xs text-gray-500 dark:text-neutral-400 leading-snug mt-0.5">Run a model on your own machine for full privacy — or connect OpenAI or Anthropic.</div>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between pt-5 border-t border-gray-200 dark:border-gray-700">
        <span class="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
          <svg class="w-3.5 h-3.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="11" width="16" height="9" rx="2"/>
            <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
          </svg>
          You can change any of this later in settings.
        </span>
        <Button onclick={() => (step = 1)}>
          {$t('assistant_onboarding_get_started')}
        </Button>
      </div>
    </div>

  <!-- CONNECT (step 1) -->
  {:else if step === 1}
    <div class="flex flex-col gap-4">
      <div>
        <p class="text-xs font-bold uppercase tracking-widest text-primary mb-1">{$t('assistant_onboarding_connect_eyebrow')}</p>
        <h2 class="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white">{$t('assistant_onboarding_connect_title')}</h2>
        <p class="mt-2 text-gray-500 dark:text-neutral-400 text-sm leading-relaxed">{$t('assistant_onboarding_connect_subtitle')}</p>
      </div>
      <AgentOnboardingConnect onConnected={handleConnected} />
    </div>
    <div class="flex items-center justify-between pt-5 border-t border-gray-200 dark:border-gray-700">
      <Button shape="round" color="secondary" onclick={goBack}>{$t('assistant_onboarding_back')}</Button>
      <Button disabled={!continueEnabled} onclick={goNext}>{$t('assistant_onboarding_continue')}</Button>
    </div>

  <!-- ACCESS (step 2) -->
  {:else if step === 2}
    <AgentOnboardingAccess provider={connectedProvider} {preset} onChange={(p) => (preset = p)} />
    <div class="flex items-center justify-between pt-5 border-t border-gray-200 dark:border-gray-700">
      <Button shape="round" color="secondary" onclick={goBack}>{$t('assistant_onboarding_back')}</Button>
      <Button onclick={goNext}>{$t('assistant_onboarding_continue')}</Button>
    </div>

  <!-- APPROVAL (step 3) -->
  {:else if step === 3}
    <AgentOnboardingApproval {approval} onChange={(a) => (approval = a)} />
    <div class="flex items-center justify-between pt-5 border-t border-gray-200 dark:border-gray-700">
      <Button shape="round" color="secondary" onclick={goBack}>{$t('assistant_onboarding_back')}</Button>
      <Button onclick={goNext}>{$t('assistant_onboarding_continue')}</Button>
    </div>

  <!-- READY (step 4) -->
  {:else if step === 4}
    <div class="flex flex-col gap-4">
      <!-- confetti mark -->
      <div class="w-14 h-14 rounded-full bg-green-50 dark:bg-green-950 flex items-center justify-center text-green-600 dark:text-green-400">
        <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      </div>
      <h2 class="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white">{$t('assistant_onboarding_ready_title')}</h2>
      <p class="text-gray-500 dark:text-neutral-400 text-sm">{$t('assistant_onboarding_ready_subtitle')}</p>

      <!-- summary rows -->
      <div class="flex flex-col rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="flex items-center gap-3 p-4 bg-white dark:bg-immich-dark-gray">
          <span class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
            <svg class="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/>
            </svg>
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">Model</div>
            <div class="text-sm font-semibold text-gray-900 dark:text-white truncate">{connectedModel}</div>
          </div>
          <button
            class="text-xs font-semibold text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors"
            onclick={() => (step = 1)}
            type="button"
          >Edit</button>
        </div>
        <div class="flex items-center gap-3 p-4 bg-white dark:bg-immich-dark-gray border-t border-gray-200 dark:border-gray-700">
          <span class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
            <svg class="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">Access</div>
            <div class="text-sm font-semibold text-gray-900 dark:text-white">{$t(`assistant_permission_preset_${preset.toLowerCase().replace(/_/g, '-').replace('localp', 'local-p')}`)}</div>
          </div>
          <button
            class="text-xs font-semibold text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors"
            onclick={() => (step = 2)}
            type="button"
          >Edit</button>
        </div>
        <div class="flex items-center gap-3 p-4 bg-white dark:bg-immich-dark-gray border-t border-gray-200 dark:border-gray-700">
          <span class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
            <svg class="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">Approvals</div>
            <div class="text-sm font-semibold text-gray-900 dark:text-white">
              {approval === AgentApprovalMode.PlanOnly ? $t('assistant_onboarding_approval_plan') : $t('assistant_onboarding_approval_strict')}
            </div>
          </div>
          <button
            class="text-xs font-semibold text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors"
            onclick={() => (step = 3)}
            type="button"
          >Edit</button>
        </div>
      </div>

      <!-- example prompts -->
      <p class="text-xs font-semibold text-gray-500 dark:text-neutral-400 mt-1">Try asking it to…</p>
      <div class="flex flex-col gap-2">
        <button class="w-full text-left text-sm flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-immich-dark-gray hover:border-primary hover:bg-primary/5 transition-all" type="button">
          <svg class="w-4 h-4 text-primary flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M3 12h18M3 17h12"/></svg>
          "Make an album from my Italy trip last summer"
        </button>
        <button class="w-full text-left text-sm flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-immich-dark-gray hover:border-primary hover:bg-primary/5 transition-all" type="button">
          <svg class="w-4 h-4 text-primary flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"/></svg>
          "Find and trash my blurry shots from this week"
        </button>
        <button class="w-full text-left text-sm flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-immich-dark-gray hover:border-primary hover:bg-primary/5 transition-all" type="button">
          <svg class="w-4 h-4 text-primary flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          "Move my passport scans to the locked folder"
        </button>
      </div>
    </div>

    <div class="flex items-center justify-between pt-5 border-t border-gray-200 dark:border-gray-700">
      <Button shape="round" color="secondary" onclick={goBack}>{$t('assistant_onboarding_back')}</Button>
      <Button onclick={finish}>{$t('assistant_onboarding_open')}</Button>
    </div>
  {/if}
</div>
