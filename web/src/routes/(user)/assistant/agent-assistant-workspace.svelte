<script lang="ts">
  import { goto } from '$app/navigation';
  import { handleError } from '$lib/utils/handle-error';
  import {
    AgentApprovalMode,
    AgentMessageTextBlockType,
    AgentPermissionPreset,
    appendAgentSessionMessage,
    createAgentSession,
    deleteAgentSession,
    validateAgentSession,
    type AgentMessageResponseDto,
    type AgentProviderCredentialResponseDto,
    type AgentRunnerStatusDto,
    type AgentSessionResponseDto,
    updateAgentSession,
  } from '@immich/sdk';
  import { Button, Icon } from '@immich/ui';
  import { mdiAlertCircleOutline, mdiCheckCircleOutline, mdiDotsHorizontal } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import AgentConversationPane from './agent-conversation-pane.svelte';
  import AgentProviderCredentialsModal from './agent-provider-credentials-modal.svelte';
  import AgentSessionSidebar from './agent-session-sidebar.svelte';
  import {
    DEFAULT_AGENT_APPROVAL_MODE,
    DEFAULT_AGENT_PERMISSION_PRESET,
    approvalModeOptions,
    getDefaultModel,
    permissionPresetOptions,
  } from './agent-session-ui';
  import {
    type AgentSessionTitleCache,
    getAgentSessionStatusLabelKey,
    getAgentSessionTitle,
    selectInitialAgentSessionId,
  } from './agent-session-workspace-ui';

  interface Props {
    runnerStatus: AgentRunnerStatusDto;
    credentials: AgentProviderCredentialResponseDto[];
    sessions: AgentSessionResponseDto[];
    requestedSessionId: string | null;
  }

  let { runnerStatus, credentials, sessions, requestedSessionId }: Props = $props();
  const getInitialCredentials = () => credentials;
  const getInitialSessions = () => sessions;
  const getInitialRequestedSessionId = () => requestedSessionId;
  const getInitialSelectedSessionId = () =>
    selectInitialAgentSessionId(getInitialSessions(), getInitialRequestedSessionId());
  const getInitialShouldReplaceSessionUrl = () => {
    const initialSelectedSessionId = getInitialSelectedSessionId();
    return initialSelectedSessionId !== null && getInitialRequestedSessionId()?.trim() !== initialSelectedSessionId;
  };

  let sidebarOpen = $state(false);
  let localSessions = $state<AgentSessionResponseDto[]>(getInitialSessions());
  let localCredentials = $state<AgentProviderCredentialResponseDto[]>(getInitialCredentials());
  let selectedSessionId = $state<string | null>(getInitialSelectedSessionId());
  let lastRequestedSessionId = $state(getInitialRequestedSessionId());
  let syncedFallbackSessionId = $state<string | null>(null);
  let shouldReplaceSelectedSessionUrl = $state(getInitialShouldReplaceSessionUrl());
  let titleBySessionId = $state<AgentSessionTitleCache>({});
  let sidebarCollapsed = $state(false);
  let credentialsModalOpen = $state(false);
  let assistantSettingsOpen = $state(false);
  let newChatDraft = $state('');
  let newChatError = $state<string | null>(null);
  let isStartingFromMessage = $state(false);
  let startingFromMessageSessionId = $state<string | null>(null);
  let sentMessageBySessionId = $state<Record<string, AgentMessageResponseDto>>({});
  let assistantPermissionPreset = $state<AgentPermissionPreset>(DEFAULT_AGENT_PERMISSION_PRESET);
  let assistantApprovalMode = $state<AgentApprovalMode>(DEFAULT_AGENT_APPROVAL_MODE);
  let assistantDefaultsInitialized = false;
  let explicitNewChatPending = false;
  const defaultsStorageKey = 'gallery.assistant.defaults';

  const selectedSession = $derived(localSessions.find((session) => session.id === selectedSessionId) ?? null);
  const selectedTitle = $derived(
    selectedSession ? getAgentSessionTitle(selectedSession, titleBySessionId) : $t('assistant_new_chat'),
  );
  const isRunnerAvailable = $derived(runnerStatus.configured && runnerStatus.healthy);
  const runnerStatusLabel = $derived(
    isRunnerAvailable ? $t('assistant_runner_ready') : $t('assistant_unavailable_banner'),
  );
  const canSendNewChat = $derived(
    newChatDraft.trim().length > 0 && !isStartingFromMessage && isRunnerAvailable && localCredentials.length > 0,
  );

  const isPermissionPreset = (value: unknown): value is AgentPermissionPreset =>
    permissionPresetOptions.some((option) => option.value === value);

  const isApprovalMode = (value: unknown): value is AgentApprovalMode =>
    approvalModeOptions.some((option) => option.value === value);

  const readStoredAssistantDefaults = () => {
    try {
      return JSON.parse(localStorage.getItem(defaultsStorageKey) ?? '{}') as Partial<{
        credentialId: string;
        model: string;
        permissionPreset: string;
        approvalMode: string;
      }>;
    } catch {
      return {};
    }
  };

  const readAssistantDefaults = () => {
    const parsed = readStoredAssistantDefaults();
    const credential =
      localCredentials.find((candidate) => candidate.id === parsed.credentialId) ?? localCredentials[0];
    return {
      credential,
      model: parsed.model || getDefaultModel(credential),
      permissionPreset: isPermissionPreset(parsed.permissionPreset)
        ? parsed.permissionPreset
        : assistantPermissionPreset,
      approvalMode: isApprovalMode(parsed.approvalMode) ? parsed.approvalMode : assistantApprovalMode,
    };
  };

  const persistAssistantDefaults = (partialDefaults: {
    credentialId?: string;
    model?: string;
    permissionPreset?: AgentPermissionPreset;
    approvalMode?: AgentApprovalMode;
  }) => {
    try {
      localStorage.setItem(
        defaultsStorageKey,
        JSON.stringify({
          ...readStoredAssistantDefaults(),
          ...partialDefaults,
        }),
      );
    } catch {
      // localStorage can be unavailable in private or embedded contexts.
    }
  };

  const writeAssistantDefaults = (session: AgentSessionResponseDto) => {
    assistantPermissionPreset = session.permissionPreset;
    assistantApprovalMode = session.approvalMode;
    persistAssistantDefaults({
      credentialId: session.providerCredentialId,
      model: session.modelSnapshot.model,
      permissionPreset: session.permissionPreset,
      approvalMode: session.approvalMode,
    });
  };

  const handlePermissionPresetChange = (event: Event) => {
    const nextPermissionPreset = (event.currentTarget as HTMLSelectElement).value;
    if (!isPermissionPreset(nextPermissionPreset)) {
      return;
    }

    assistantPermissionPreset = nextPermissionPreset;
    persistAssistantDefaults({ permissionPreset: nextPermissionPreset });
  };

  const handleApprovalModeChange = (event: Event) => {
    const nextApprovalMode = (event.currentTarget as HTMLSelectElement).value;
    if (!isApprovalMode(nextApprovalMode)) {
      return;
    }

    assistantApprovalMode = nextApprovalMode;
    persistAssistantDefaults({ approvalMode: nextApprovalMode });
  };

  $effect(() => {
    if (assistantDefaultsInitialized) {
      return;
    }

    assistantDefaultsInitialized = true;
    const storedDefaults = readStoredAssistantDefaults();
    if (isPermissionPreset(storedDefaults.permissionPreset)) {
      assistantPermissionPreset = storedDefaults.permissionPreset;
    }
    if (isApprovalMode(storedDefaults.approvalMode)) {
      assistantApprovalMode = storedDefaults.approvalMode;
    }
  });
  const buildAssistantPath = (sessionId: string | null) => {
    const url = new URL(globalThis.location.href);

    if (sessionId) {
      url.searchParams.set('session', sessionId);
    } else {
      url.searchParams.delete('session');
    }

    return `${url.pathname}${url.search}${url.hash}`;
  };

  const updateSessionUrl = async (sessionId: string | null, replaceState = false) => {
    await goto(buildAssistantPath(sessionId), { keepFocus: true, noScroll: true, replaceState });
  };

  const selectSession = (sessionId: string) => {
    explicitNewChatPending = false;
    shouldReplaceSelectedSessionUrl = false;
    selectedSessionId = sessionId;
    sidebarOpen = false;
    void updateSessionUrl(sessionId);
  };

  const startNewChat = () => {
    explicitNewChatPending = true;
    shouldReplaceSelectedSessionUrl = false;
    selectedSessionId = null;
    sidebarOpen = false;
    void updateSessionUrl(null);
  };

  const handleSessionCreated = (session: AgentSessionResponseDto) => {
    writeAssistantDefaults(session);
    explicitNewChatPending = false;
    localSessions = [session, ...localSessions.filter((existingSession) => existingSession.id !== session.id)];
    shouldReplaceSelectedSessionUrl = false;
    selectedSessionId = session.id;
    void updateSessionUrl(session.id);
  };

  const startSessionFromMessage = async () => {
    const text = newChatDraft.trim();
    if (!text || isStartingFromMessage) {
      return;
    }

    if (!isRunnerAvailable) {
      newChatError = $t('assistant_unavailable_banner');
      return;
    }

    if (localCredentials.length === 0) {
      credentialsModalOpen = true;
      return;
    }

    const defaults = readAssistantDefaults();
    if (!defaults.credential || !defaults.model) {
      credentialsModalOpen = true;
      return;
    }

    const agentSessionCreateDto = {
      providerCredentialId: defaults.credential.id,
      model: defaults.model,
      permissionPreset: defaults.permissionPreset,
      approvalMode: defaults.approvalMode,
    };

    isStartingFromMessage = true;
    newChatError = null;

    try {
      await validateAgentSession({ agentSessionCreateDto });
      const session = await createAgentSession({ agentSessionCreateDto });
      startingFromMessageSessionId = session.id;
      handleSessionCreated(session);
      const message = await appendAgentSessionMessage({
        id: session.id,
        agentMessageCreateDto: {
          content: {
            blocks: [{ type: AgentMessageTextBlockType.Text, text }],
          },
        },
      });
      sentMessageBySessionId = { ...sentMessageBySessionId, [session.id]: message };
      titleBySessionId = { ...titleBySessionId, [session.id]: text };
      newChatDraft = '';
    } catch (error) {
      newChatError = $t('assistant_session_create_error');
      handleError(error, newChatError);
    } finally {
      startingFromMessageSessionId = null;
      isStartingFromMessage = false;
    }
  };

  const handleNewChatComposerKeydown = (event: KeyboardEvent) => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.isComposing
    ) {
      return;
    }

    event.preventDefault();
    void startSessionFromMessage();
  };

  const handleTitleDiscovered = (sessionId: string, title: string) => {
    if (sessionId !== selectedSessionId || !localSessions.some((session) => session.id === sessionId)) {
      return;
    }

    titleBySessionId = { ...titleBySessionId, [sessionId]: title };
  };

  const handleSessionUpdated = (session: AgentSessionResponseDto) => {
    if (
      session.id !== selectedSessionId ||
      !localSessions.some((existingSession) => existingSession.id === session.id)
    ) {
      return;
    }

    localSessions = localSessions.map((existingSession) =>
      existingSession.id === session.id ? session : existingSession,
    );
  };

  const handleRenameSession = async (sessionId: string, title: string) => {
    const session = await updateAgentSession({ id: sessionId, agentSessionUpdateDto: { title } });
    localSessions = localSessions.map((existingSession) =>
      existingSession.id === session.id ? session : existingSession,
    );
    titleBySessionId = { ...titleBySessionId, [sessionId]: null };
  };

  const handleDeleteSession = async (sessionId: string) => {
    await deleteAgentSession({ id: sessionId });
    localSessions = localSessions.filter((session) => session.id !== sessionId);

    if (selectedSessionId === sessionId) {
      selectedSessionId = null;
      void updateSessionUrl(null);
    }
  };

  $effect(() => {
    if (requestedSessionId === lastRequestedSessionId) {
      return;
    }

    lastRequestedSessionId = requestedSessionId;

    if (explicitNewChatPending && !requestedSessionId?.trim()) {
      explicitNewChatPending = false;
      selectedSessionId = null;
      shouldReplaceSelectedSessionUrl = false;
      return;
    }

    explicitNewChatPending = false;
    selectedSessionId = selectInitialAgentSessionId(localSessions, requestedSessionId);
    shouldReplaceSelectedSessionUrl = selectedSessionId !== null && requestedSessionId?.trim() !== selectedSessionId;
  });

  $effect(() => {
    if (!shouldReplaceSelectedSessionUrl || !selectedSessionId || syncedFallbackSessionId === selectedSessionId) {
      return;
    }

    shouldReplaceSelectedSessionUrl = false;
    syncedFallbackSessionId = selectedSessionId;
    void updateSessionUrl(selectedSessionId, true);
  });
</script>

<div class="relative flex h-full min-h-0 overflow-hidden bg-white text-black dark:bg-black dark:text-white">
  <AgentProviderCredentialsModal
    open={credentialsModalOpen}
    credentials={localCredentials}
    onClose={() => (credentialsModalOpen = false)}
    onCredentialsChanged={(nextCredentials) => (localCredentials = nextCredentials)}
  />

  {#if assistantSettingsOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6" role="presentation">
      <div
        class="max-h-full w-full max-w-3xl overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-settings-title"
      >
        <div class="mb-4 flex items-center justify-between gap-4">
          <h2 id="assistant-settings-title" class="text-lg font-semibold">{$t('assistant_settings')}</h2>
          <Button type="button" size="small" color="secondary" onclick={() => (assistantSettingsOpen = false)}>
            {$t('close')}
          </Button>
        </div>
        <div class="grid gap-5">
          <section class="rounded-lg border border-gray-200 p-4 dark:border-neutral-800">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-base font-semibold">{$t('assistant_api_keys')}</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{$t('assistant_api_keys_description')}</p>
              </div>
              <Button type="button" size="small" color="secondary" onclick={() => (credentialsModalOpen = true)}>
                {localCredentials.length > 0 ? $t('assistant_manage_api_keys') : $t('assistant_add_api_key')}
              </Button>
            </div>
          </section>

          <section class="rounded-lg border border-gray-200 p-4 dark:border-neutral-800">
            <h3 class="text-base font-semibold">{$t('assistant_permission_preset')}</h3>
            <div class="mt-4 grid gap-4">
              <div class="grid gap-2">
                <label class="text-sm font-medium" for="assistant-default-permission-preset">
                  {$t('assistant_permission_preset')}
                </label>
                <select
                  id="assistant-default-permission-preset"
                  aria-label={$t('assistant_permission_preset')}
                  class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-immich-dark-gray"
                  value={assistantPermissionPreset}
                  onchange={handlePermissionPresetChange}
                >
                  {#each permissionPresetOptions as option (option.value)}
                    <option value={option.value}>{$t(option.labelKey)}</option>
                  {/each}
                </select>
              </div>

              <div class="grid gap-2">
                <label class="text-sm font-medium" for="assistant-default-approval-mode">
                  {$t('assistant_approval_mode')}
                </label>
                <select
                  id="assistant-default-approval-mode"
                  aria-label={$t('assistant_approval_mode')}
                  class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-immich-dark-gray"
                  value={assistantApprovalMode}
                  onchange={handleApprovalModeChange}
                >
                  {#each approvalModeOptions as option (option.value)}
                    <option value={option.value}>{$t(option.labelKey)}</option>
                  {/each}
                </select>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  {/if}

  <div class="hidden shrink-0 md:block">
    {#if sidebarCollapsed}
      <div
        class="flex h-full w-14 flex-col items-center border-r border-gray-200 bg-slate-50 py-2 dark:border-neutral-800 dark:bg-neutral-950"
      >
        <button
          type="button"
          data-testid="agent-session-sidebar-expand"
          class="rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
          aria-label={$t('assistant_open_sessions')}
          onclick={() => (sidebarCollapsed = false)}
        >
          {$t('assistant_sessions').slice(0, 1)}
        </button>
      </div>
    {:else}
      <div class="h-full w-72">
        <AgentSessionSidebar
          sessions={localSessions}
          {selectedSessionId}
          {titleBySessionId}
          onSelectSession={selectSession}
          onNewChat={startNewChat}
          onRenameSession={handleRenameSession}
          onDeleteSession={handleDeleteSession}
          onCollapse={() => (sidebarCollapsed = true)}
        />
      </div>
    {/if}
  </div>

  {#if sidebarOpen}
    <div
      class="fixed inset-0 z-40 bg-black/40 md:hidden"
      role="presentation"
      onclick={() => (sidebarOpen = false)}
    ></div>
    <div class="fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] md:hidden">
      <AgentSessionSidebar
        sessions={localSessions}
        {selectedSessionId}
        {titleBySessionId}
        onSelectSession={selectSession}
        onNewChat={startNewChat}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
      />
    </div>
  {/if}

  <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <header
      class={[
        'flex min-h-14 shrink-0 items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-800 md:px-6',
        selectedSession ? 'md:hidden' : '',
      ]}
    >
      <button
        type="button"
        class="rounded-lg border border-gray-300 px-3 py-2 text-sm md:hidden dark:border-gray-700"
        aria-label={$t('assistant_open_sessions')}
        onclick={() => (sidebarOpen = true)}
      >
        {$t('assistant_sessions')}
      </button>
      <div class="min-w-0">
        <h1 class="truncate text-lg font-semibold">{selectedTitle}</h1>
        {#if selectedSession}
          <p class="truncate text-sm text-gray-500 dark:text-gray-400">
            {$t(getAgentSessionStatusLabelKey(selectedSession.status))} · {selectedSession.modelSnapshot.model}
          </p>
        {/if}
      </div>
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          class={[
            'inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors',
            isRunnerAvailable
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
          ]}
          aria-label={runnerStatusLabel}
          title={runnerStatusLabel}
        >
          <Icon icon={isRunnerAvailable ? mdiCheckCircleOutline : mdiAlertCircleOutline} size="18" />
        </button>
        <button
          type="button"
          class="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-black dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white"
          data-testid="assistant-settings-menu"
          aria-label={$t('assistant_settings')}
          onclick={() => (assistantSettingsOpen = true)}
        >
          <Icon icon={mdiDotsHorizontal} size="20" />
        </button>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-hidden">
      {#if selectedSession}
        <AgentConversationPane
          session={selectedSession}
          title={selectedTitle}
          seedMessages={sentMessageBySessionId[selectedSession.id] ? [sentMessageBySessionId[selectedSession.id]] : []}
          assistantResponsePending={isStartingFromMessage && startingFromMessageSessionId === selectedSession.id}
          onNewChat={startNewChat}
          onTitleDiscovered={handleTitleDiscovered}
          onSessionUpdated={handleSessionUpdated}
        />
      {:else}
        <section
          class="flex h-full min-h-0 flex-col px-4 pb-4 text-black dark:text-white md:px-8"
          data-testid="assistant-empty-chat"
        >
          {#if !isRunnerAvailable}
            <div
              class="mx-auto mt-5 w-full max-w-3xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
              role="alert"
            >
              {$t('assistant_unavailable_banner')}
            </div>
          {/if}

          <div
            class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col justify-center gap-4 pb-20"
            data-testid="assistant-empty-chat-surface"
          >
            <div>
              <h2 class="text-2xl font-semibold">{$t('assistant_new_chat')}</h2>
              <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{$t('assistant_subtitle')}</p>
            </div>

            {#if newChatError}
              <div
                class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                role="alert"
              >
                {newChatError}
              </div>
            {/if}

            <form
              class="mt-4 shrink-0"
              data-testid="assistant-new-chat-composer"
              onsubmit={(event) => {
                event.preventDefault();
                void startSessionFromMessage();
              }}
            >
              <div
                class="flex w-full items-end gap-3 rounded-2xl border border-gray-300 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
              >
                <label for="assistant-new-message" class="sr-only">{$t('assistant_message')}</label>
                <textarea
                  id="assistant-new-message"
                  aria-label={$t('assistant_message')}
                  class="min-h-14 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  bind:value={newChatDraft}
                  placeholder={$t('assistant_new_chat_placeholder')}
                  disabled={isStartingFromMessage || !isRunnerAvailable}
                  onkeydown={handleNewChatComposerKeydown}
                ></textarea>
                <Button type="submit" disabled={!canSendNewChat} loading={isStartingFromMessage}
                  >{$t('assistant_send')}</Button
                >
              </div>
            </form>
          </div>
        </section>
      {/if}
    </div>
  </main>
</div>
