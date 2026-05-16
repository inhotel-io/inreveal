<script lang="ts">
  import { websocketEvents, type AgentSessionClientEvent } from '$lib/stores/websocket';
  import { handleError } from '$lib/utils/handle-error';
  import { appendAgentSessionMessage, getAgentSessionMessages } from '@immich/sdk';
  import {
    AgentMessageRole,
    AgentMessageTextBlockType,
    AgentSessionStatus,
    type AgentMessageResponseDto,
    type AgentSessionResponseDto,
  } from '@immich/sdk';
  import { Button } from '@immich/ui';
  import { onDestroy, onMount, type Snippet } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { t } from 'svelte-i18n';
  import { deriveAgentSessionTitleFromMessages } from './agent-session-workspace-ui';

  interface Props {
    session: AgentSessionResponseDto;
    actionDock?: Snippet;
    composerDisabled?: boolean;
    composerDisabledReason?: string | null;
    composerPlaceholder?: string;
    submitLabel?: string;
    terminalActionLabel?: string;
    onTerminalAction?: () => void;
    onMessageSent?: (sessionId: string) => void | Promise<void>;
    onTitleDiscovered?: (sessionId: string, title: string) => void;
  }

  let {
    session,
    actionDock,
    composerDisabled = false,
    composerDisabledReason = null,
    composerPlaceholder,
    submitLabel,
    terminalActionLabel,
    onTerminalAction,
    onMessageSent,
    onTitleDiscovered,
  }: Props = $props();

  let messages = $state<AgentMessageResponseDto[]>([]);
  let draft = $state('');
  let isSending = $state(false);
  let isAssistantActive = $state(false);
  let errorMessage = $state<string | null>(null);
  let streamingText = $state('');
  let lastPublishedTitle: string | null = null;
  let cleanupWebsocketListener: (() => void) | undefined;

  const canSend = $derived(draft.trim().length > 0 && !isSending && !isAssistantActive && !composerDisabled);
  const terminalStatuses = new Set<AgentSessionStatus>([
    AgentSessionStatus.Applying,
    AgentSessionStatus.Completed,
    AgentSessionStatus.Cancelled,
    AgentSessionStatus.Failed,
  ]);

  const textForMessage = (message: AgentMessageResponseDto) =>
    message.content.blocks
      .filter((block) => block.type === AgentMessageTextBlockType.Text)
      .map((block) => block.text)
      .join('\n');

  const mergeMessages = (firstMessages: AgentMessageResponseDto[], secondMessages: AgentMessageResponseDto[]) => {
    const seenIds = new SvelteSet<string>();
    const mergedMessages: AgentMessageResponseDto[] = [];

    for (const message of [...firstMessages, ...secondMessages]) {
      if (seenIds.has(message.id)) {
        continue;
      }

      seenIds.add(message.id);
      mergedMessages.push(message);
    }

    return mergedMessages;
  };

  const publishDiscoveredTitle = (nextMessages: AgentMessageResponseDto[]) => {
    const title = deriveAgentSessionTitleFromMessages(nextMessages);

    if (!title || title === lastPublishedTitle) {
      return;
    }

    lastPublishedTitle = title;
    onTitleDiscovered?.(session.id, title);
  };

  const notifyMessageSent = () => {
    try {
      void onMessageSent?.(session.id)?.catch(() => undefined);
    } catch {
      // Follow-up refresh errors must not undo the successful append.
    }
  };

  const appendIfNew = (message: AgentMessageResponseDto) => {
    const nextMessages = mergeMessages(messages, [message]);
    messages = nextMessages;
    publishDiscoveredTitle(nextMessages);
  };

  const handleSessionEvent = (event: AgentSessionClientEvent) => {
    if (event.sessionId !== session.id) {
      return;
    }

    if (event.type === 'assistant-message-delta') {
      isAssistantActive = true;
      streamingText += event.delta;
      return;
    }

    if (event.type === 'assistant-message-created') {
      isAssistantActive = false;
      streamingText = '';
      appendIfNew(event.message);
      return;
    }

    if (event.type === 'operation-plan-ready' || event.type === 'operation-plan-applied') {
      return;
    }

    isAssistantActive = false;
    streamingText = '';
    errorMessage = event.message;
  };

  const loadMessages = async () => {
    try {
      const loadedMessages = await getAgentSessionMessages({ id: session.id });
      const nextMessages = mergeMessages(loadedMessages, messages);
      messages = nextMessages;
      publishDiscoveredTitle(nextMessages);
    } catch (error) {
      errorMessage = $t('assistant_message_load_error');
      handleError(error, errorMessage);
    }
  };

  const sendMessage = async () => {
    const text = draft.trim();

    if (!text || isSending || composerDisabled) {
      return;
    }

    isSending = true;
    errorMessage = null;

    try {
      const message = await appendAgentSessionMessage({
        id: session.id,
        agentMessageCreateDto: {
          content: {
            blocks: [{ type: AgentMessageTextBlockType.Text, text }],
          },
        },
      });

      appendIfNew(message);
      draft = '';
      isAssistantActive = true;
      notifyMessageSent();
    } catch (error) {
      errorMessage = $t('assistant_message_send_error');
      handleError(error, errorMessage);
      isAssistantActive = false;
    } finally {
      isSending = false;
    }
  };

  onMount(() => {
    cleanupWebsocketListener = websocketEvents.on('on_agent_session_event', handleSessionEvent);
    void loadMessages();
  });

  $effect(() => {
    if (!terminalStatuses.has(session.status)) {
      return;
    }

    isAssistantActive = false;
    streamingText = '';
  });

  onDestroy(() => {
    cleanupWebsocketListener?.();
  });
</script>

<section
  class="relative h-full min-h-0 w-full overflow-hidden text-black dark:text-white"
  aria-labelledby="assistant-chat-title"
>
  <h2 id="assistant-chat-title" class="sr-only">{$t('assistant_chat')}</h2>

  {#if errorMessage}
    <div
      class="mx-auto w-full max-w-3xl shrink-0 border-b border-red-100 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:text-red-400 md:px-0"
      role="alert"
    >
      {errorMessage}
    </div>
  {/if}

  <div class="h-full overflow-y-auto" aria-live="polite">
    <div class="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 px-4 pb-36 pt-6 md:px-0">
      {#each messages as message (message.id)}
        {@const text = textForMessage(message)}
        {#if text}
          <article
            class={[
              'max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap',
              message.role === AgentMessageRole.User
                ? 'ml-auto bg-slate-100 text-slate-950 dark:bg-neutral-800 dark:text-neutral-50'
                : 'mr-auto text-slate-950 dark:text-neutral-100',
            ]}
          >
            {text}
          </article>
        {/if}
      {/each}

      {#if streamingText}
        <article class="mr-auto max-w-[80%] rounded-2xl px-4 py-3 text-sm text-slate-950 dark:text-neutral-100">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400">{$t('assistant_streaming_response')}</div>
          <div class="mt-1 whitespace-pre-wrap">{streamingText}</div>
        </article>
      {/if}

      {#if actionDock}
        <div class="mt-auto">
          {@render actionDock()}
        </div>
      {/if}
    </div>
  </div>

  <form
    class="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white via-white to-white/0 px-4 pb-4 pt-8 dark:from-black dark:via-black dark:to-black/0"
    onsubmit={(event) => {
      event.preventDefault();
      void sendMessage();
    }}
  >
    <label for="assistant-message" class="sr-only">{$t('assistant_message')}</label>
    <div class="mx-auto flex w-full max-w-3xl items-end gap-3">
      <textarea
        id="assistant-message"
        aria-label={$t('assistant_message')}
        class="min-h-14 flex-1 resize-none rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        bind:value={draft}
        placeholder={composerPlaceholder ?? $t('assistant_message_placeholder')}
        disabled={isSending || isAssistantActive || composerDisabled}
      ></textarea>

      {#if terminalActionLabel && onTerminalAction}
        <Button type="button" onclick={onTerminalAction}>{terminalActionLabel}</Button>
      {:else}
        <Button type="submit" disabled={!canSend} loading={isSending}>{submitLabel ?? $t('assistant_send')}</Button>
      {/if}
    </div>
    <div class="mx-auto w-full max-w-3xl">
      {#if composerDisabled && composerDisabledReason}
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400" role="status">{composerDisabledReason}</p>
      {/if}
    </div>
  </form>
</section>
