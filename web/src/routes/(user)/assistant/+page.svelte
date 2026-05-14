<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import type { PageData } from './$types';
  import AgentSessionPageContent from './agent-session-page-content.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<UserPageLayout title={data.meta.title}>
  <AgentSessionPageContent runnerStatus={data.runnerStatus} credentials={data.credentials} />
</UserPageLayout>
