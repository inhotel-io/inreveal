<script lang="ts">
  import { cancelAgentSession, getAgentSession, type AgentSessionResponseDto } from '@immich/sdk';
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import AgentSessionActionDock from './agent-session-action-dock.svelte';
  import AgentSessionChatPanel from './agent-session-chat-panel.svelte';
  import AgentSessionDetailsDrawer from './agent-session-details-drawer.svelte';
  import AgentSessionHeader from './agent-session-header.svelte';
  import { getAgentSessionComposerState, isAgentSessionCancellable } from './agent-session-lifecycle-ui';

  interface Props {
    session: AgentSessionResponseDto;
    title?: string | null;
    onNewChat: () => void;
    onTitleDiscovered?: (sessionId: string, title: string) => void;
    onSessionUpdated?: (session: AgentSessionResponseDto) => void;
  }

  let { session, title = null, onNewChat, onTitleDiscovered, onSessionUpdated }: Props = $props();

  let detailsOpen = $state(false);
  let pendingApprovalCount = $state(0);
  let cancelBusy = $state(false);
  let lifecycleError = $state<string | null>(null);
  let refreshSequence = 0;
  let cancelSequence = 0;
  let destroyed = false;

  const composerState = $derived(getAgentSessionComposerState(session.status, { pendingApprovalCount }));
  const composerDisabledReason = $derived(
    composerState.disabledReasonKey ? $t(composerState.disabledReasonKey) : null,
  );
  const terminalActionLabel = $derived(
    composerState.terminalActionLabelKey ? $t(composerState.terminalActionLabelKey) : undefined,
  );

  const isCurrentSession = (sessionId: string) => !destroyed && session.id === sessionId;

  const refreshSelectedSession = async (sessionId: string) => {
    const requestSequence = ++refreshSequence;

    try {
      const refreshedSession = await getAgentSession({ id: sessionId });

      if (!isCurrentSession(sessionId) || requestSequence !== refreshSequence || refreshedSession.id !== sessionId) {
        return;
      }

      lifecycleError = null;
      onSessionUpdated?.(refreshedSession);
    } catch {
      if (!isCurrentSession(sessionId) || requestSequence !== refreshSequence) {
        return;
      }

      lifecycleError = $t('assistant_message_refresh_error');
    }
  };

  const cancelSelectedSession = async () => {
    const sessionId = session.id;

    if (!isAgentSessionCancellable(session.status) || cancelBusy) {
      return;
    }

    const requestSequence = ++cancelSequence;
    cancelBusy = true;
    lifecycleError = null;

    try {
      const cancelledSession = await cancelAgentSession({ id: sessionId });

      if (!isCurrentSession(sessionId) || requestSequence !== cancelSequence || cancelledSession.id !== sessionId) {
        return;
      }

      onSessionUpdated?.(cancelledSession);
    } catch {
      if (!isCurrentSession(sessionId) || requestSequence !== cancelSequence) {
        return;
      }

      lifecycleError = $t('assistant_session_cancel_error');
    } finally {
      if (isCurrentSession(sessionId) && requestSequence === cancelSequence) {
        cancelBusy = false;
      }
    }
  };

  const cancelHandler = $derived(isAgentSessionCancellable(session.status) ? cancelSelectedSession : null);

  $effect(() => {
    detailsOpen = false;
  });

  $effect(() => {
    session.id;
    pendingApprovalCount = 0;
    lifecycleError = null;
    cancelBusy = false;
    refreshSequence += 1;
    cancelSequence += 1;
  });

  onDestroy(() => {
    destroyed = true;
    refreshSequence += 1;
    cancelSequence += 1;
  });
</script>

<section class="flex h-full min-h-0 flex-col text-black dark:text-white" aria-labelledby="agent-session-header-title">
  <AgentSessionHeader
    {session}
    {title}
    {onNewChat}
    onCancel={cancelHandler}
    cancelDisabled={cancelBusy}
    onOpenDetails={() => (detailsOpen = true)}
  />
  <AgentSessionDetailsDrawer {session} open={detailsOpen} onClose={() => (detailsOpen = false)} />

  {#if lifecycleError}
    <div
      class="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200 md:px-6"
      role="alert"
    >
      {lifecycleError}
    </div>
  {/if}

  <div class="min-h-0 flex-1 overflow-hidden">
    {#key session.id}
      {#snippet actionDock()}
        <AgentSessionActionDock
          {session}
          {onSessionUpdated}
          onPendingApprovalCountChange={(count) => (pendingApprovalCount = count)}
        />
      {/snippet}

      <AgentSessionChatPanel
        {session}
        {actionDock}
        composerDisabled={composerState.disabled}
        composerDisabledReason={composerDisabledReason}
        composerPlaceholder={$t(composerState.placeholderKey)}
        submitLabel={$t(composerState.submitLabelKey)}
        {terminalActionLabel}
        onTerminalAction={terminalActionLabel ? onNewChat : undefined}
        onMessageSent={refreshSelectedSession}
        {onTitleDiscovered}
      />
    {/key}
  </div>
</section>
