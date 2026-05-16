<script lang="ts">
  import type { AgentSessionResponseDto, AgentSessionStatus } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import AgentSessionRow from './agent-session-row.svelte';
  import {
    filterAgentSessionsForSidebar,
    getAgentSessionStatusLabelKey,
    sortAgentSessionsForSidebar,
    type AgentSessionTitleCache,
  } from './agent-session-workspace-ui';

  interface Props {
    sessions: AgentSessionResponseDto[];
    selectedSessionId: string | null;
    titleBySessionId?: AgentSessionTitleCache;
    onSelectSession: (sessionId: string) => void;
    onNewChat: () => void;
  }

  let { sessions, selectedSessionId, titleBySessionId = {}, onSelectSession, onNewChat }: Props = $props();
  let query = $state('');

  const sortedSessions = $derived(sortAgentSessionsForSidebar(sessions));
  const statusLabels = $derived.by(
    () =>
      Object.fromEntries(
        sortedSessions.map((session) => [session.status, $t(getAgentSessionStatusLabelKey(session.status))]),
      ) as Partial<Record<AgentSessionStatus, string>>,
  );
  const visibleSessions = $derived(
    filterAgentSessionsForSidebar(sortedSessions, query, titleBySessionId, statusLabels),
  );
</script>

<aside
  class="flex h-full min-h-0 w-full flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950"
>
  <div class="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 p-3 dark:border-gray-800">
    <h2 class="text-sm font-semibold text-black dark:text-white">{$t('assistant_sessions')}</h2>
    <button
      type="button"
      class="rounded-lg bg-immich-primary px-3 py-2 text-sm font-medium text-white hover:bg-immich-primary/90"
      onclick={onNewChat}
    >
      {$t('assistant_new_chat')}
    </button>
  </div>

  <div class="shrink-0 p-3">
    <input
      class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-immich-primary dark:border-gray-700 dark:bg-immich-dark-gray dark:text-white"
      type="search"
      aria-label={$t('assistant_search_chats')}
      placeholder={$t('assistant_search_chats')}
      bind:value={query}
    />
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
    <div class="flex flex-col gap-1">
      {#each visibleSessions as session (session.id)}
        <div data-testid="agent-session-row" data-session-id={session.id}>
          <AgentSessionRow {session} selected={session.id === selectedSessionId} {titleBySessionId} {onSelectSession} />
        </div>
      {/each}
    </div>
  </div>
</aside>
