<script lang="ts">
  import { websocketEvents, type AgentSessionClientEvent } from '$lib/stores/websocket';
  import { handleError } from '$lib/utils/handle-error';
  import { appendAgentSessionMessage, getAgentSessionMessages } from '@immich/sdk';
  import {
    AgentMessageRole,
    AgentMessageTextBlockType,
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
    onTitleDiscovered?: (sessionId: string, title: string) => void;
  }

  let { session, actionDock, composerDisabled = false, composerDisabledReason = null, onTitleDiscovered }: Props =
    $props();

  let messages = $state<AgentMessageResponseDto[]>([]);
  let draft = $state('');
  let isSending = $state(false);
  let isAssistantActive = $state(false);
  let errorMessage = $state<string | null>(null);
  let streamingText = $state('');
  let lastPublishedTitle: string | null = null;
  let cleanupWebsocketListener: (() => void) | undefined;

  const canSend = $derived(draft.trim().length > 0 && !isSending && !isAssistantActive && !composerDisabled);

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

    if (event.type === 'operation-plan-ready') {
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

  onDestroy(() => {
    cleanupWebsocketListener?.();
  });
</script>

<section
  class="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-10 text-black dark:text-white md:px-8"
  aria-labelledby="assistant-chat-title"
>
  <div class="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-immich-dark-gray">
    <h2 id="assistant-chat-title" class="text-lg font-semibold">{$t('assistant_chat')}</h2>

    {#if errorMessage}
      <div class="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{errorMessage}</div>
    {/if}

    <div class="mt-5 flex max-h-96 flex-col gap-3 overflow-y-auto" aria-live="polite">
      {#each messages as message (message.id)}
        {@const text = textForMessage(message)}
        {#if text}
          <article
            class={[
              'max-w-[85%] rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap',
              message.role === AgentMessageRole.User
                ? 'ml-auto border-immich-primary/30 bg-immich-primary/10'
                : 'mr-auto border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900',
            ]}
          >
            {text}
          </article>
        {/if}
      {/each}

      {#if streamingText}
        <article
          class="mr-auto max-w-[85%] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400">{$t('assistant_streaming_response')}</div>
          <div class="mt-1 whitespace-pre-wrap">{streamingText}</div>
        </article>
      {/if}
    </div>

    {#if actionDock}
      <div class="mt-5">
        {@render actionDock()}
      </div>
    {/if}

    <form
      class="mt-5 flex flex-col gap-3"
      onsubmit={(event) => {
        event.preventDefault();
        void sendMessage();
      }}
    >
      <div>
        <label for="assistant-message" class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {$t('assistant_message')}
        </label>
        <textarea
          id="assistant-message"
          aria-label={$t('assistant_message')}
          class="min-h-24 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-immich-dark-gray"
          bind:value={draft}
          disabled={isSending || isAssistantActive || composerDisabled}
        ></textarea>
        {#if composerDisabled && composerDisabledReason}
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400" role="status">{composerDisabledReason}</p>
        {/if}
      </div>

      <div>
        <Button type="submit" disabled={!canSend} loading={isSending}>{$t('assistant_send')}</Button>
      </div>
    </form>
  </div>
</section>
