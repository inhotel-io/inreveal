<script lang="ts">
  import type { PersonResponseDto } from '@immich/sdk';
  import PeopleInfiniteScroll from './people-infinite-scroll.svelte';

  interface Props {
    people: PersonResponseDto[];
    hasNextPage?: boolean;
    loadNextPage: () => void;
  }

  let { people, hasNextPage = false, loadNextPage }: Props = $props();
</script>

<PeopleInfiniteScroll {people} {hasNextPage} {loadNextPage}>
  {#snippet children({ person, index })}
    <span>{person.name}</span>
    <span data-testid="person-index-{person.id}">{index}</span>
  {/snippet}
</PeopleInfiniteScroll>
