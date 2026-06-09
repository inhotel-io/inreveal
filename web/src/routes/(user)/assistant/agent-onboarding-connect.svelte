<script lang="ts">
  import {
    createAgentProviderCredential,
    deleteAgentProviderCredential,
    validateAgentSession,
  } from '@immich/sdk';
  import { Button, Icon } from '@immich/ui';
  import { mdiCheck, mdiEye, mdiEyeOff, mdiServer } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import {
    ONBOARDING_PROVIDER_ORDER,
    ONBOARDING_PROVIDERS,
    buildCredentialCreateDto,
    buildValidateDto,
    isCloudProvider,
    isConnectComplete,
    type OnboardingConnectState,
    type OnboardingProviderId,
  } from './agent-onboarding-model';

  interface Props {
    onConnected: (credentialId: string, model: string) => void;
  }
  let { onConnected }: Props = $props();

  let provider = $state<OnboardingProviderId>('local');
  let label = $state('');
  let secret = $state('');
  let baseUrl = $state(ONBOARDING_PROVIDERS.local.baseUrlPrefill);
  let model = $state('');
  let revealKey = $state(false);
  let status = $state<'idle' | 'testing' | 'connected' | 'error'>('idle');
  let errorMessage = $state<string | null>(null);
  let createdCredentialId = $state<string | null>(null);

  const meta = $derived(ONBOARDING_PROVIDERS[provider]);
  const connectState = $derived<OnboardingConnectState>({ provider, label, secret, baseUrl, model });
  const canTest = $derived(isConnectComplete(connectState) && status !== 'testing');

  const markDirty = () => {
    if (status === 'connected' || status === 'error') {
      status = 'idle';
      onConnected('', '');
    }
  };

  const selectProvider = (next: OnboardingProviderId) => {
    if (createdCredentialId) {
      void deleteAgentProviderCredential({ id: createdCredentialId }).catch(() => {});
      createdCredentialId = null;
    }
    provider = next;
    baseUrl = ONBOARDING_PROVIDERS[next].baseUrlPrefill;
    secret = '';
    status = 'idle';
    errorMessage = null;
    onConnected('', '');
  };

  const test = async () => {
    if (!canTest) return;
    status = 'testing';
    errorMessage = null;
    try {
      if (createdCredentialId) {
        await deleteAgentProviderCredential({ id: createdCredentialId });
        createdCredentialId = null;
      }
      const created = await createAgentProviderCredential({
        agentProviderCredentialCreateDto: buildCredentialCreateDto(connectState),
      });
      createdCredentialId = created.id;
      await validateAgentSession({ agentSessionCreateDto: buildValidateDto(created.id, model) });
      status = 'connected';
      onConnected(created.id, model.trim());
    } catch {
      status = 'error';
      errorMessage = $t('assistant_onboarding_test_error');
    }
  };

  const baseUrlFieldId = 'onboarding-base-url';
  const apiKeyFieldId = 'onboarding-api-key';
  const modelFieldId = 'onboarding-model';
</script>

<div class="flex flex-col gap-4">
  <!-- Provider cards -->
  <div role="group" aria-label="Provider">
    <!-- Featured local card -->
    <button
      class="w-full text-left cursor-pointer mb-3 flex flex-row items-center gap-4 p-4 rounded-xl border-[1.5px] transition-all
        {provider === 'local'
          ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
          : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-immich-dark-gray hover:-translate-y-0.5'}"
      aria-pressed={provider === 'local' ? 'true' : 'false'}
      aria-label={$t('assistant_onboarding_provider_local')}
      onclick={() => selectProvider('local')}
      type="button"
    >
      <span
        class="w-12 h-12 rounded-xl flex items-center justify-center flex-none
          {provider === 'local' ? 'bg-white dark:bg-gray-800' : 'bg-gray-100 dark:bg-gray-700'}"
      >
        <Icon icon={mdiServer} size="24" class="text-primary" />
      </span>
      <span class="flex flex-col gap-1 flex-1 min-w-0">
        <span class="flex items-center gap-2 flex-wrap">
          <span class="font-bold text-sm">{$t('assistant_onboarding_provider_local')}</span>
          <span class="text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950">
            {$t('assistant_onboarding_provider_most_private')}
          </span>
        </span>
        <span class="text-xs text-gray-500 dark:text-neutral-400 leading-snug">{$t('assistant_onboarding_provider_local_meta')}</span>
      </span>
    </button>

    <!-- Cloud divider -->
    <div class="flex items-center gap-3 text-gray-400 dark:text-gray-500 text-[11px] font-semibold uppercase tracking-wider my-1 mb-2.5">
      <span class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></span>
      <span>{$t('assistant_onboarding_cloud_divider')}</span>
      <span class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></span>
    </div>

    <!-- Cloud provider cards (openai + anthropic) + Other -->
    <div class="grid grid-cols-3 gap-2.5">
      {#each ONBOARDING_PROVIDER_ORDER.filter((id) => id !== 'local') as id (id)}
        <button
          class="text-left cursor-pointer flex flex-col gap-2 p-3.5 rounded-xl border-[1.5px] transition-all
            {provider === id
              ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
              : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-immich-dark-gray hover:-translate-y-0.5'}"
          aria-pressed={provider === id ? 'true' : 'false'}
          aria-label={$t(`assistant_onboarding_provider_${id}`)}
          onclick={() => selectProvider(id as OnboardingProviderId)}
          type="button"
        >
          <span class="font-bold text-sm leading-tight">{$t(`assistant_onboarding_provider_${id}`)}</span>
          {#if id === 'openai'}
            <span class="text-[11px] text-gray-500 dark:text-neutral-400">GPT models · cloud</span>
          {:else if id === 'anthropic'}
            <span class="text-[11px] text-gray-500 dark:text-neutral-400">Claude models · cloud</span>
          {:else}
            <span class="text-[11px] text-gray-500 dark:text-neutral-400">{$t('assistant_onboarding_provider_other_meta')}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Fields -->
  <div class="flex flex-col gap-3 mt-1">
    <!-- Base URL (local + other) -->
    {#if meta.requiresBaseUrl}
      <div class="flex flex-col gap-1.5">
        <label for={baseUrlFieldId} class="font-semibold text-[13.5px]">
          {$t('assistant_onboarding_base_url')}
        </label>
        <input
          id={baseUrlFieldId}
          class="w-full font-mono text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5
            focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all"
          bind:value={baseUrl}
          oninput={markDirty}
          placeholder="http://localhost:11434/v1"
          autocomplete="off"
        />
      </div>
    {/if}

    <!-- API key -->
    <div class="flex flex-col gap-1.5">
      <div class="flex items-baseline justify-between gap-2">
        <label for={apiKeyFieldId} class="font-semibold text-[13.5px]">
          {#if isCloudProvider(provider)}
            {$t('assistant_onboarding_api_key')}
          {:else}
            {$t('assistant_onboarding_api_key_optional')}
          {/if}
        </label>
        {#if isCloudProvider(provider)}
          <span class="text-[12.5px] text-primary font-semibold cursor-pointer">{$t('assistant_onboarding_api_key_help')}</span>
        {/if}
      </div>
      <div class="relative flex items-center">
        <input
          id={apiKeyFieldId}
          class="w-full font-mono text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 pr-10
            focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all"
          type={revealKey ? 'text' : 'password'}
          bind:value={secret}
          oninput={markDirty}
          placeholder={isCloudProvider(provider) ? 'sk-…' : ''}
          autocomplete="off"
        />
        <button
          type="button"
          class="absolute right-2.5 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md transition-colors"
          onclick={() => (revealKey = !revealKey)}
          aria-label={revealKey ? 'Hide key' : 'Show key'}
        >
          <Icon icon={revealKey ? mdiEyeOff : mdiEye} size="16" />
        </button>
      </div>
    </div>

    <!-- Model -->
    <div class="flex flex-col gap-1.5">
      <label for={modelFieldId} class="font-semibold text-[13.5px]">
        {$t('assistant_onboarding_model')}
      </label>
      <input
        id={modelFieldId}
        class="w-full font-mono text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5
          focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all"
        bind:value={model}
        oninput={markDirty}
        placeholder={provider === 'openai' ? 'gpt-4o' : provider === 'anthropic' ? 'claude-3-5-sonnet-latest' : 'llama3.1'}
        autocomplete="off"
      />
    </div>

    <!-- Test row -->
    <div class="flex items-center gap-3 mt-1">
      <Button disabled={!canTest} onclick={test}>
        {$t('assistant_onboarding_test')}
      </Button>

      {#if status === 'testing'}
        <span class="flex items-center gap-2 text-[13px] font-semibold text-gray-500 dark:text-neutral-400">
          <span class="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-primary animate-spin"></span>
          {$t('assistant_onboarding_testing')}
        </span>
      {:else if status === 'connected'}
        <span class="flex items-center gap-2 text-[12.5px] font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-3 py-1 rounded-full">
          <Icon icon={mdiCheck} size="14" />
          {$t('assistant_onboarding_connected')}
        </span>
      {:else if status === 'error' && errorMessage}
        <p role="alert" class="text-[13px] text-red-600 dark:text-red-400">{errorMessage}</p>
      {/if}
    </div>
  </div>
</div>
