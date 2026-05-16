<script lang="ts">
  import type { AgentSessionResponseDto } from '@immich/sdk';
  import AgentOperationPlanReviewPanel from './agent-operation-plan-review-panel.svelte';
  import AgentSessionChatPanel from './agent-session-chat-panel.svelte';
  import AgentSessionDetailsDrawer from './agent-session-details-drawer.svelte';
  import AgentSessionHeader from './agent-session-header.svelte';

  interface Props {
    session: AgentSessionResponseDto;
    title?: string | null;
    onNewChat: () => void;
    onTitleDiscovered?: (sessionId: string, title: string) => void;
  }

  let { session, title = null, onNewChat, onTitleDiscovered }: Props = $props();

  let detailsOpen = $state(false);

  $effect(() => {
    detailsOpen = false;
  });
</script>

<section class="flex min-h-0 flex-1 flex-col text-black dark:text-white" aria-labelledby="agent-session-header-title">
  <AgentSessionHeader {session} {title} {onNewChat} onOpenDetails={() => (detailsOpen = true)} />
  <AgentSessionDetailsDrawer {session} open={detailsOpen} onClose={() => (detailsOpen = false)} />

  <div class="min-h-0 flex-1 overflow-y-auto py-6">
    {#key session.id}
      <AgentSessionChatPanel {session} {onTitleDiscovered} />
      <AgentOperationPlanReviewPanel {session} />
    {/key}
  </div>
</section>
