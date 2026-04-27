<script lang="ts">
  import PeopleGrid from '$lib/components/people/people-grid.svelte';
  import type { PersonResponseDto } from '@immich/sdk';

  interface Props {
    people: PersonResponseDto[];
    hasNextPage?: boolean | undefined;
    loadNextPage: () => void;
    children?: import('svelte').Snippet<[{ person: PersonResponseDto; index: number }]>;
  }

  let { people, hasNextPage = undefined, loadNextPage, children }: Props = $props();
</script>

<PeopleGrid items={people} hasNextPage={!!hasNextPage} {loadNextPage}>
  {#snippet children(person, index)}
    {@render children?.({ person, index })}
  {/snippet}
</PeopleGrid>
