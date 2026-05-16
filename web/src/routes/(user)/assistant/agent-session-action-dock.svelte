<script lang="ts">
  import { websocketEvents, type AgentSessionClientEvent } from '$lib/stores/websocket';
  import { handleError } from '$lib/utils/handle-error';
  import {
    AgentSessionStatus,
    AgentToolApprovalDecision,
    approveToolCall,
    getAgentSession,
    getToolCalls,
    type AgentSessionResponseDto,
    type AgentToolCallResponseDto,
  } from '@immich/sdk';
  import { onDestroy, onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import AgentOperationPlanReviewPanel from './agent-operation-plan-review-panel.svelte';
  import AgentToolApprovalCard from './agent-tool-approval-card.svelte';
  import { buildToolApprovalPayload, getPendingToolCalls, getRecentToolCalls } from './agent-tool-approval-ui';

  interface Props {
    session: AgentSessionResponseDto;
    onSessionUpdated?: (session: AgentSessionResponseDto) => void;
    onPendingApprovalCountChange?: (count: number) => void;
    onRecentToolCallsChange?: (toolCalls: AgentToolCallResponseDto[]) => void;
  }

  let { session, onSessionUpdated, onPendingApprovalCountChange, onRecentToolCallsChange }: Props = $props();

  let toolCalls = $state<AgentToolCallResponseDto[]>([]);
  let loading = $state(true);
  let loadErrorMessage = $state<string | null>(null);
  let refreshErrorMessage = $state<string | null>(null);
  let busyByToolCallId = $state<Record<string, boolean>>({});
  let errorByToolCallId = $state<Record<string, string>>({});
  let cleanupWebsocketListener: (() => void) | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let loadSequence = 0;
  let destroyed = false;

  const pendingToolCalls = $derived(getPendingToolCalls(toolCalls));
  const shouldPoll = $derived(
    session.status === AgentSessionStatus.Running || session.status === AgentSessionStatus.WaitingForToolApproval,
  );
  const canShowPlanReview = $derived((!loading || loadErrorMessage !== null) && pendingToolCalls.length === 0);

  const publishToolCallState = (nextToolCalls: AgentToolCallResponseDto[]) => {
    onPendingApprovalCountChange?.(getPendingToolCalls(nextToolCalls).length);
    onRecentToolCallsChange?.(getRecentToolCalls(nextToolCalls));
  };

  const replaceToolCall = (toolCall: AgentToolCallResponseDto) => {
    const nextToolCalls = [toolCall, ...toolCalls.filter((existingToolCall) => existingToolCall.id !== toolCall.id)];
    toolCalls = nextToolCalls;
    publishToolCallState(nextToolCalls);
  };

  const loadToolCalls = async ({ quiet = false }: { quiet?: boolean } = {}) => {
    const sequence = ++loadSequence;
    if (!quiet) {
      loading = true;
    }
    loadErrorMessage = null;

    try {
      const nextToolCalls = await getToolCalls({ id: session.id });
      if (destroyed || sequence !== loadSequence) {
        return;
      }

      toolCalls = nextToolCalls;
      publishToolCallState(nextToolCalls);
    } catch (error) {
      if (destroyed || sequence !== loadSequence) {
        return;
      }

      loadErrorMessage = $t('assistant_approval_tool_calls_error');
      handleError(error, loadErrorMessage);
    } finally {
      if (!destroyed && sequence === loadSequence) {
        loading = false;
      }
    }
  };

  const refreshAfterDecision = async (toolCall: AgentToolCallResponseDto) => {
    try {
      const nextSession = await getAgentSession({ id: session.id });
      onSessionUpdated?.(nextSession);
      await loadToolCalls({ quiet: true });
    } catch (error) {
      refreshErrorMessage = $t('assistant_approval_refresh_error');
      replaceToolCall(toolCall);
      handleError(error, refreshErrorMessage);
    }
  };

  const decide = async (toolCallId: string, decision: AgentToolApprovalDecision, reason?: string) => {
    busyByToolCallId = { ...busyByToolCallId, [toolCallId]: true };
    const remainingErrors = { ...errorByToolCallId };
    delete remainingErrors[toolCallId];
    errorByToolCallId = remainingErrors;
    refreshErrorMessage = null;

    try {
      const toolCall = await approveToolCall({
        id: session.id,
        toolCallId,
        agentToolApprovalDto: buildToolApprovalPayload(decision, reason),
      });
      await refreshAfterDecision(toolCall);
    } catch (error) {
      errorByToolCallId = { ...errorByToolCallId, [toolCallId]: $t('assistant_approval_action_error') };
      handleError(error, errorByToolCallId[toolCallId]);
    } finally {
      const remainingBusy = { ...busyByToolCallId };
      delete remainingBusy[toolCallId];
      busyByToolCallId = remainingBusy;
    }
  };

  const handleSessionEvent = (event: AgentSessionClientEvent) => {
    if (event.sessionId === session.id) {
      void loadToolCalls({ quiet: true });
    }
  };

  const startPolling = () => {
    if (!shouldPoll || interval) {
      return;
    }

    interval = setInterval(() => void loadToolCalls({ quiet: true }), 3000);
  };

  const stopPolling = () => {
    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }
  };

  $effect(() => {
    stopPolling();
    startPolling();
  });

  onMount(() => {
    cleanupWebsocketListener = websocketEvents.on('on_agent_session_event', handleSessionEvent);
    void loadToolCalls();
  });

  onDestroy(() => {
    destroyed = true;
    loadSequence += 1;
    stopPolling();
    cleanupWebsocketListener?.();
    onPendingApprovalCountChange?.(0);
    onRecentToolCallsChange?.([]);
  });
</script>

<section class="flex flex-col gap-3" aria-label={$t('assistant_approval_request')}>
  {#if loading}
    <p class="text-sm text-gray-500 dark:text-gray-400" role="status">{$t('loading')}</p>
  {/if}

  {#if loadErrorMessage}
    <p class="text-sm text-red-600 dark:text-red-400" role="alert">{loadErrorMessage}</p>
  {/if}

  {#if refreshErrorMessage}
    <p class="text-sm text-amber-700 dark:text-amber-300" role="alert">{refreshErrorMessage}</p>
  {/if}

  {#each pendingToolCalls as toolCall (toolCall.id)}
    <AgentToolApprovalCard
      {session}
      {toolCall}
      busy={busyByToolCallId[toolCall.id] === true}
      errorMessage={errorByToolCallId[toolCall.id] ?? null}
      onApprove={(id) => decide(id, AgentToolApprovalDecision.Approved)}
      onDeny={(id, reason) => decide(id, AgentToolApprovalDecision.Denied, reason)}
    />
  {/each}

  {#if canShowPlanReview}
    <AgentOperationPlanReviewPanel {session} variant="dock" hideEmpty />
  {/if}
</section>
