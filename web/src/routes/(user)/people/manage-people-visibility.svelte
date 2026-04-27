<script lang="ts">
  import PeopleVisibilityModal from '$lib/components/people/people-visibility-modal.svelte';
  import type { VisibilityChange, VisibilityPerson, VisibilitySaveResult } from '$lib/components/people/people-types';
  import { getPeopleThumbnailUrl } from '$lib/utils';
  import { updatePeople, type PersonResponseDto } from '@immich/sdk';

  interface Props {
    people: PersonResponseDto[];
    totalPeopleCount: number;
    titleId?: string | undefined;
    onClose: () => void;
    onUpdate: (people: PersonResponseDto[]) => void;
    loadNextPage: () => void;
  }

  let { people, totalPeopleCount, titleId = undefined, onClose, onUpdate, loadNextPage }: Props = $props();

  const visibilityPeople: VisibilityPerson[] = $derived(
    people.map((person) => ({
      id: person.id,
      displayName: person.name,
      thumbnailUrl: getPeopleThumbnailUrl(person),
      isHidden: person.isHidden,
    })),
  );

  const saveVisibilityChanges = async (changes: VisibilityChange[]): Promise<VisibilitySaveResult> => {
    const results = await updatePeople({ peopleUpdateDto: { people: changes } });
    const successCount = results.filter(({ success }) => success).length;
    return { successCount, failCount: results.length - successCount };
  };

  const handleUpdate = (updatedVisibilityPeople: VisibilityPerson[]) => {
    const hiddenById = new Map(updatedVisibilityPeople.map((person) => [person.id, person.isHidden]));
    onUpdate(people.map((person) => ({ ...person, isHidden: hiddenById.get(person.id) ?? person.isHidden })));
  };
</script>

<PeopleVisibilityModal
  people={visibilityPeople}
  {totalPeopleCount}
  {titleId}
  {onClose}
  onUpdate={handleUpdate}
  {loadNextPage}
  hasMore={true}
  saveVisibilityChanges={saveVisibilityChanges}
/>
