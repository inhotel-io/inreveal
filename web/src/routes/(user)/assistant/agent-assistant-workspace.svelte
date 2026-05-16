<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    type AgentProviderCredentialResponseDto,
    type AgentRunnerStatusDto,
    type AgentSessionResponseDto,
  } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import AgentOperationPlanReviewPanel from './agent-operation-plan-review-panel.svelte';
  import AgentRunnerStatusPanel from './agent-runner-status-panel.svelte';
  import AgentSessionChatPanel from './agent-session-chat-panel.svelte';
  import AgentSessionSetupPanel from './agent-session-setup-panel.svelte';
  import AgentSessionSidebar from './agent-session-sidebar.svelte';
  import { getApprovalModeLabelKey, getPermissionPresetLabelKey } from './agent-session-ui';
  import {
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
  let selectedSessionId = $state<string | null>(getInitialSelectedSessionId());
  let lastRequestedSessionId = $state(getInitialRequestedSessionId());
  let syncedFallbackSessionId = $state<string | null>(null);
  let shouldReplaceSelectedSessionUrl = $state(getInitialShouldReplaceSessionUrl());

  const selectedSession = $derived(localSessions.find((session) => session.id === selectedSessionId) ?? null);
  const selectedTitle = $derived(selectedSession ? getAgentSessionTitle(selectedSession) : $t('assistant_new_chat'));

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
    shouldReplaceSelectedSessionUrl = false;
    selectedSessionId = sessionId;
    sidebarOpen = false;
    void updateSessionUrl(sessionId);
  };

  const startNewChat = () => {
    shouldReplaceSelectedSessionUrl = false;
    selectedSessionId = null;
    sidebarOpen = false;
    void updateSessionUrl(null);
  };

  const handleSessionCreated = (session: AgentSessionResponseDto) => {
    localSessions = [session, ...localSessions.filter((existingSession) => existingSession.id !== session.id)];
    shouldReplaceSelectedSessionUrl = false;
    selectedSessionId = session.id;
    void updateSessionUrl(session.id);
  };

  $effect(() => {
    if (requestedSessionId === lastRequestedSessionId) {
      return;
    }

    lastRequestedSessionId = requestedSessionId;
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

<div class="flex h-[calc(100vh-8rem)] min-h-[34rem] overflow-hidden bg-white text-black dark:bg-black dark:text-white">
  <div class="hidden w-80 shrink-0 md:block">
    <AgentSessionSidebar
      sessions={localSessions}
      {selectedSessionId}
      onSelectSession={selectSession}
      onNewChat={startNewChat}
    />
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
        onSelectSession={selectSession}
        onNewChat={startNewChat}
      />
    </div>
  {/if}

  <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <header
      class="flex min-h-16 shrink-0 items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-800 md:px-6"
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
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if selectedSession}
        <section
          class="mx-auto w-full max-w-3xl px-4 py-6 text-black dark:text-white md:px-8"
          aria-labelledby="assistant-selected-session-title"
        >
          <div class="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-immich-dark-gray">
            <h2 id="assistant-selected-session-title" class="text-lg font-semibold">
              {$t('assistant_selected_session')}
            </h2>
            <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt class="text-gray-500 dark:text-gray-400">{$t('assistant_provider_credential')}</dt>
                <dd class="font-medium">{selectedSession.credentialSnapshot.label}</dd>
              </div>
              <div>
                <dt class="text-gray-500 dark:text-gray-400">{$t('assistant_model')}</dt>
                <dd class="font-medium">{selectedSession.modelSnapshot.model}</dd>
              </div>
              <div>
                <dt class="text-gray-500 dark:text-gray-400">{$t('status')}</dt>
                <dd class="font-medium">{$t(getAgentSessionStatusLabelKey(selectedSession.status))}</dd>
              </div>
              <div>
                <dt class="text-gray-500 dark:text-gray-400">{$t('assistant_permission_preset')}</dt>
                <dd class="font-medium">{$t(getPermissionPresetLabelKey(selectedSession.permissionPreset))}</dd>
              </div>
              <div>
                <dt class="text-gray-500 dark:text-gray-400">{$t('assistant_approval_mode')}</dt>
                <dd class="font-medium">{$t(getApprovalModeLabelKey(selectedSession.approvalMode))}</dd>
              </div>
            </dl>
          </div>
        </section>

        {#key selectedSession.id}
          <AgentSessionChatPanel session={selectedSession} />
          <AgentOperationPlanReviewPanel session={selectedSession} />
        {/key}
      {:else}
        <AgentRunnerStatusPanel status={runnerStatus} />
        <AgentSessionSetupPanel {runnerStatus} {credentials} onSessionCreated={handleSessionCreated} />
      {/if}
    </div>
  </main>
</div>
