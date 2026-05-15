<script lang="ts">
  import { handleError } from '$lib/utils/handle-error';
  import { Button, Field, Input, Text, toastManager } from '@immich/ui';
  import {
    AgentApprovalMode,
    AgentPermissionPreset,
    createAgentSession,
    type AgentProviderCredentialResponseDto,
    type AgentRunnerStatusDto,
    type AgentSessionResponseDto,
  } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import {
    DEFAULT_AGENT_APPROVAL_MODE,
    DEFAULT_AGENT_PERMISSION_PRESET,
    approvalModeOptions,
    getDefaultModel,
    getInitialCredentialId,
    permissionPresetOptions,
  } from './agent-session-ui';

  interface Props {
    runnerStatus: AgentRunnerStatusDto;
    credentials: AgentProviderCredentialResponseDto[];
    onSessionCreated: (session: AgentSessionResponseDto) => void;
  }

  let { runnerStatus, credentials, onSessionCreated }: Props = $props();

  let selectedCredentialId = $state('');
  let model = $state('');
  let permissionPreset = $state(DEFAULT_AGENT_PERMISSION_PRESET);
  let approvalMode = $state(DEFAULT_AGENT_APPROVAL_MODE);
  let isCreating = $state(false);
  let errorMessage = $state<string | null>(null);

  const selectedCredential = $derived(credentials.find((credential) => credential.id === selectedCredentialId));
  const isRunnerAvailable = $derived(runnerStatus.configured && runnerStatus.healthy);
  const canCreateSession = $derived(
    isRunnerAvailable && credentials.length > 0 && model.trim().length > 0 && !isCreating,
  );
  const disabledReason = $derived.by(() => {
    if (!runnerStatus.configured) {
      return 'assistant_runner_not_configured';
    }

    if (!runnerStatus.healthy) {
      return 'assistant_runner_unavailable';
    }

    if (credentials.length === 0) {
      return 'assistant_no_credentials';
    }

    return null;
  });

  $effect(() => {
    if (credentials.some((credential) => credential.id === selectedCredentialId)) {
      return;
    }

    selectedCredentialId = getInitialCredentialId(credentials);
    model = getDefaultModel(credentials[0]);
  });

  const handleCredentialChange = (event: Event) => {
    const nextCredentialId = (event.currentTarget as HTMLSelectElement).value;
    const nextCredential = credentials.find((credential) => credential.id === nextCredentialId);
    selectedCredentialId = nextCredentialId;
    model = getDefaultModel(nextCredential);
  };

  const handlePermissionPresetChange = (event: Event) => {
    permissionPreset = (event.currentTarget as HTMLSelectElement).value as AgentPermissionPreset;
  };

  const handleApprovalModeChange = (event: Event) => {
    approvalMode = (event.currentTarget as HTMLSelectElement).value as AgentApprovalMode;
  };

  const handleSubmit = async () => {
    if (!canCreateSession || !selectedCredential) {
      return;
    }

    isCreating = true;
    errorMessage = null;

    try {
      const session = await createAgentSession({
        agentSessionCreateDto: {
          providerCredentialId: selectedCredential.id,
          model: model.trim(),
          permissionPreset,
          approvalMode,
        },
      });

      toastManager.success($t('assistant_session_created'));
      onSessionCreated(session);
    } catch (error) {
      errorMessage = $t('assistant_session_create_error');
      handleError(error, errorMessage);
    } finally {
      isCreating = false;
    }
  };
</script>

<section
  class="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-8 text-black dark:text-white md:px-8"
  aria-labelledby="assistant-session-setup-title"
>
  <div class="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-immich-dark-gray">
    <h2 id="assistant-session-setup-title" class="text-lg font-semibold">{$t('assistant_session_setup')}</h2>

    {#if disabledReason}
      <Text size="small" color="muted" class="mt-2">{$t(disabledReason)}</Text>
    {/if}

    {#if errorMessage}
      <div class="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{errorMessage}</div>
    {/if}

    <form
      class="mt-5 grid gap-4"
      onsubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <Field label={$t('assistant_provider_credential')} disabled={credentials.length === 0}>
        <select
          id="assistant-provider-credential"
          aria-label={$t('assistant_provider_credential')}
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-immich-dark-gray"
          value={selectedCredentialId}
          onchange={handleCredentialChange}
          disabled={credentials.length === 0 || isCreating}
        >
          {#each credentials as credential (credential.id)}
            <option value={credential.id}>{credential.label}</option>
          {/each}
        </select>
      </Field>

      <Field label={$t('assistant_model')} required disabled={credentials.length === 0}>
        <Input
          id="assistant-model"
          aria-label={$t('assistant_model')}
          bind:value={model}
          list={selectedCredential?.models.length ? 'assistant-model-options' : undefined}
          disabled={credentials.length === 0 || isCreating}
          autocomplete="off"
        />
        {#if selectedCredential?.models.length}
          <datalist id="assistant-model-options">
            {#each selectedCredential.models as option (option)}
              <option value={option}></option>
            {/each}
          </datalist>
        {/if}
      </Field>

      <Field label={$t('assistant_permission_preset')}>
        <select
          id="assistant-permission-preset"
          aria-label={$t('assistant_permission_preset')}
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-immich-dark-gray"
          value={permissionPreset}
          onchange={handlePermissionPresetChange}
          disabled={isCreating}
        >
          {#each permissionPresetOptions as option (option.value)}
            <option value={option.value}>{$t(option.labelKey)}</option>
          {/each}
        </select>
      </Field>

      <Field label={$t('assistant_approval_mode')}>
        <select
          id="assistant-approval-mode"
          aria-label={$t('assistant_approval_mode')}
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-immich-dark-gray"
          value={approvalMode}
          onchange={handleApprovalModeChange}
          disabled={isCreating}
        >
          {#each approvalModeOptions as option (option.value)}
            <option value={option.value}>{$t(option.labelKey)}</option>
          {/each}
        </select>
      </Field>

      <div>
        <Button type="submit" disabled={!canCreateSession} loading={isCreating}>{$t('assistant_start_session')}</Button>
      </div>
    </form>
  </div>
</section>
