<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import type { PageData } from './$types';
  import AgentRunnerStatusPanel from './agent-runner-status-panel.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<UserPageLayout title={data.meta.title}>
  <AgentRunnerStatusPanel status={data.runnerStatus} />
</UserPageLayout>
