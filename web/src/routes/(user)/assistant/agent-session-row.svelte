<script lang="ts">
  import type { AgentSessionResponseDto } from '@immich/sdk';
  import { getAgentSessionTitle, type AgentSessionTitleCache } from './agent-session-workspace-ui';

  interface Props {
    session: AgentSessionResponseDto;
    selected: boolean;
    titleBySessionId?: AgentSessionTitleCache;
    onSelectSession: (sessionId: string) => void;
  }

  let { session, selected, titleBySessionId = {}, onSelectSession }: Props = $props();

  const title = $derived(getAgentSessionTitle(session, titleBySessionId));
</script>

<button
  type="button"
  class={[
    'flex min-h-9 w-full items-center overflow-hidden rounded-md px-2.5 py-2 text-left text-sm transition-colors',
    selected
      ? 'bg-slate-200 text-slate-950 dark:bg-neutral-800 dark:text-neutral-50'
      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-neutral-50',
  ]}
  data-testid={`agent-session-row-${session.id}`}
  data-session-id={session.id}
  aria-current={selected ? 'true' : undefined}
  onclick={() => onSelectSession(session.id)}
>
  <span class="min-w-0 truncate">{title}</span>
</button>
