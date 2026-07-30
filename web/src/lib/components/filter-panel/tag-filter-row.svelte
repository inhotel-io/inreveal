<script lang="ts">
  import { Tooltip } from '@immich/ui';
  import { clampOverflow } from '$lib/actions/clamp-overflow';

  interface Props {
    id: string;
    name: string;
    checked: boolean;
    /** Orphaned selections render faded — selected, but absent from the current suggestions. */
    dimmed?: boolean;
    onToggle: (id: string) => void;
  }

  let { id, name, checked, dimmed = false, onToggle }: Props = $props();

  let isOverflowing = $state(false);

  // The tooltip trigger supplies its own onclick (it closes the tooltip), so both handlers must run —
  // spreading ours over it would break the tooltip, spreading theirs over ours would break selection.
  function handleClick(triggerProps: Record<string, unknown>, event: MouseEvent) {
    (triggerProps.onclick as ((event: MouseEvent) => void) | undefined)?.(event);
    onToggle(id);
  }
</script>

<Tooltip text={isOverflowing ? name : undefined}>
  {#snippet child({ props })}
    <button
      {...props}
      type="button"
      class="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-subtle {checked
        ? 'font-medium'
        : 'text-gray-500 dark:text-gray-300'} {dimmed ? 'opacity-50' : ''}"
      onclick={(event) => handleClick(props, event)}
      aria-pressed={checked}
      data-testid="tags-item-{id}"
    >
      <div
        class="flex size-4 shrink-0 items-center justify-center rounded-sm {checked
          ? 'bg-immich-primary dark:bg-immich-dark-primary'
          : 'border border-gray-300 dark:border-gray-600'}"
      >
        {#if checked}
          <svg viewBox="0 0 24 24" class="size-3 text-white dark:text-black">
            <path fill="currentColor" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z" />
          </svg>
        {/if}
      </div>

      <!-- wrap-break-words is required, not cosmetic: without it an unbreakable token overflows
           horizontally and clampOverflow reports a false "fits". -->
      <span
        class="wrap-break-words line-clamp-2 flex-1 text-left"
        use:clampOverflow={{ onChange: (overflowing) => (isOverflowing = overflowing), key: name }}
      >
        {name}
      </span>
    </button>
  {/snippet}
</Tooltip>
