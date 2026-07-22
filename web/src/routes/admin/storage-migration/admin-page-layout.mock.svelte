<!-- Test-only stub for AdminPageLayout: the real one renders the app shell, which needs providers
     that only exist in the root layout. Imported from storage-migration-page.spec.ts. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();
</script>

{@render children?.()}
