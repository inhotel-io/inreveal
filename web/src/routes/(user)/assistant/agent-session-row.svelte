<script lang="ts">
  import type { AgentSessionResponseDto } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import {
    getAgentSessionStatusBadge,
    getAgentSessionTitle,
    type AgentSessionTitleCache,
  } from './agent-session-workspace-ui';

  interface Props {
    session: AgentSessionResponseDto;
    selected: boolean;
    titleBySessionId?: AgentSessionTitleCache;
    onSelectSession: (sessionId: string) => void;
  }

  let { session, selected, titleBySessionId = {}, onSelectSession }: Props = $props();

  const title = $derived(getAgentSessionTitle(session, titleBySessionId));
  const badge = $derived(getAgentSessionStatusBadge(session.status));
  const badgeClass = $derived.by(() => {
    switch (badge?.tone) {
      case 'active': {
        return 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-800';
      }

      case 'attention': {
        return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800';
      }

      case 'danger': {
        return 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-800';
      }

      case 'success': {
        return 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-950 dark:text-green-200 dark:ring-green-800';
      }

      default: {
        return 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700';
      }
    }
  });
</script>

<button
  type="button"
  class={[
    'flex min-h-20 w-full flex-col gap-2 overflow-hidden rounded-lg px-3 py-2 text-left transition-colors',
    selected
      ? 'bg-immich-primary/10 text-immich-primary ring-1 ring-immich-primary/30'
      : 'text-black hover:bg-gray-100 dark:text-white dark:hover:bg-gray-800',
  ]}
  data-testid={`agent-session-row-${session.id}`}
  data-session-id={session.id}
  aria-current={selected ? 'true' : undefined}
  onclick={() => onSelectSession(session.id)}
>
  <span class="flex min-w-0 items-center gap-2">
    <span class="truncate text-sm font-medium">{title}</span>
    {#if badge}
      <span class={['shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1', badgeClass]}>
        {$t(badge.labelKey)}
      </span>
    {/if}
  </span>
  <span class="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">{session.credentialSnapshot.label}</span>
  <span class="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">{session.modelSnapshot.model}</span>
</button>
