<script lang="ts">
  import { t } from 'svelte-i18n';
  import { selectableDestinations, type SuspectedOwner } from './destination';

  // Where the two whole-cluster actions send faces. Both used to hardcode suspectedOwners[0], which silently
  // overrode the routing of every face the scan attributed to a secondary owner.
  type Props = {
    owners: SuspectedOwner[];
    value: string | null;
    onSelect: (ownerPersonId: string) => void;
    onChooseOther: () => void;
  };
  const { owners, value, onSelect, onChooseOther }: Props = $props();

  const OTHER = '__other__';
  // Deleted destinations are omitted, not disabled: the card above already explains why one is unusable, and
  // an option that guarantees a face-repair:destination-missing failure is only a chance to misclick.
  const options = $derived(selectableDestinations(owners));

  const handleChange = (event: Event) => {
    const next = (event.currentTarget as HTMLSelectElement).value;
    if (next === OTHER) {
      onChooseOther();
      return;
    }
    onSelect(next);
  };
</script>

<label class="flex items-center gap-2 text-sm">
  <span class="text-gray-500 dark:text-gray-400">{$t('admin.face_cleanup_review_dest_send_to')}</span>
  <select
    value={value ?? ''}
    onchange={handleChange}
    class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
    data-testid="destination-select"
  >
    {#if value === null}
      <option value="" disabled>{$t('admin.face_cleanup_review_dest_send_to')}</option>
    {/if}
    {#each options as owner (owner.ownerPersonId)}
      <option value={owner.ownerPersonId}>
        {$t('admin.face_cleanup_review_dest_option', {
          values: { name: owner.ownerName ?? $t('admin.face_cleanup_review_unnamed'), count: owner.ownerFaceCount },
        })}
      </option>
    {/each}
    <!-- The test id sits on the <option>, and a plain click on an <option> in happy-dom does not bubble a
         `change` event to the <select> (unlike a real browser), so onSelect above never fires for it. The
         onclick here makes the affordance work for both a real user (click, or arrow keys + Enter, both of
         which DO fire `change` in a real browser) and this test environment. -->
    <option value={OTHER} data-testid="destination-choose-other" onclick={onChooseOther}>
      {$t('admin.face_cleanup_review_dest_choose_other')}
    </option>
  </select>
</label>
