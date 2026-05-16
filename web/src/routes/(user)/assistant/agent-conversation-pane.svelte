<script lang="ts">
  import type { AgentSessionResponseDto } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import AgentOperationPlanReviewPanel from './agent-operation-plan-review-panel.svelte';
  import AgentSessionActionDock from './agent-session-action-dock.svelte';
  import AgentSessionChatPanel from './agent-session-chat-panel.svelte';
  import AgentSessionDetailsDrawer from './agent-session-details-drawer.svelte';
  import AgentSessionHeader from './agent-session-header.svelte';

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

  $effect(() => {
    detailsOpen = false;
  });
</script>

<section class="flex min-h-0 flex-1 flex-col text-black dark:text-white" aria-labelledby="agent-session-header-title">
  <AgentSessionHeader {session} {title} {onNewChat} onOpenDetails={() => (detailsOpen = true)} />
  <AgentSessionDetailsDrawer {session} open={detailsOpen} onClose={() => (detailsOpen = false)} />

  <div class="min-h-0 flex-1 overflow-y-auto py-6">
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
        composerDisabled={pendingApprovalCount > 0}
        composerDisabledReason={pendingApprovalCount > 0 ? $t('assistant_approval_review_pending') : null}
        {onTitleDiscovered}
      />
      <AgentOperationPlanReviewPanel {session} />
    {/key}
  </div>
</section>
