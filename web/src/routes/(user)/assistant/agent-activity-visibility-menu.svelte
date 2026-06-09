<script lang="ts">
  import { Icon } from '@immich/ui';
  import { mdiDotsHorizontal } from '@mdi/js';
  import { tick } from 'svelte';
  import { t, type Translations } from 'svelte-i18n';
  import type { AgentActivityVisibilityMode } from './agent-activity-visibility-ui';

  interface Props {
    mode?: AgentActivityVisibilityMode;
    onModeChange?: (mode: AgentActivityVisibilityMode) => void;
    onOpenDetails: () => void;
  }

  let { mode, onModeChange, onOpenDetails }: Props = $props();

  let isOpen = $state(false);
  let triggerElement: HTMLButtonElement | null = $state(null);
  let itemElements: HTMLButtonElement[] = $state([]);

  const modes: AgentActivityVisibilityMode[] = ['off', 'compact', 'expanded'];
  const labelKeys: Record<AgentActivityVisibilityMode, Translations> = {
    compact: 'assistant_activity_visibility_compact',
    expanded: 'assistant_activity_visibility_expanded',
    off: 'assistant_activity_visibility_off',
  };
  const showModeSection = $derived(mode !== undefined && onModeChange !== undefined);
  const itemCount = $derived(showModeSection ? modes.length + 1 : 1);

  const focusTrigger = async () => {
    await tick();
    triggerElement?.focus();
  };

  const focusItem = async (index: number) => {
    await tick();
    itemElements[index]?.focus();
  };

  const openMenu = async () => {
    isOpen = true;
    await focusItem(0);
  };

  const closeMenu = async () => {
    isOpen = false;
    await focusTrigger();
  };

  const toggleMenu = async () => {
    if (isOpen) {
      await closeMenu();
      return;
    }

    await openMenu();
  };

  const selectDetails = async () => {
    onOpenDetails();
    await closeMenu();
  };

  const selectMode = async (nextMode: AgentActivityVisibilityMode) => {
    onModeChange?.(nextMode);
    await closeMenu();
  };

  const moveFocus = async (delta: number) => {
    const activeElement = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    const currentIndex = activeElement ? itemElements.indexOf(activeElement) : -1;
    const nextIndex = (Math.max(0, currentIndex) + delta + itemCount) % itemCount;
    await focusItem(nextIndex);
  };

  const handleTriggerKeydown = async (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      await openMenu();
    }
  };

  const handleMenuKeydown = async (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      await closeMenu();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      await moveFocus(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      await moveFocus(-1);
    }
  };
</script>

<div class="relative">
  <button
    bind:this={triggerElement}
    type="button"
    class="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-neutral-300 dark:hover:bg-gray-800"
    aria-label={$t('assistant_session_menu')}
    aria-haspopup="menu"
    aria-expanded={isOpen}
    onclick={toggleMenu}
    onkeydown={handleTriggerKeydown}
  >
    <Icon icon={mdiDotsHorizontal} size="18" />
  </button>

  {#if isOpen}
    <div
      role="menu"
      aria-label={$t('assistant_session_menu')}
      tabindex="-1"
      class="absolute right-0 z-20 mt-2 min-w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
      onkeydown={handleMenuKeydown}
    >
      <button
        bind:this={itemElements[0]}
        type="button"
        role="menuitem"
        class="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-black hover:bg-gray-50 focus:bg-gray-50 dark:text-white dark:hover:bg-gray-800 dark:focus:bg-gray-800"
        onclick={selectDetails}
      >
        {$t('assistant_details')}
      </button>
      {#if showModeSection}
        <div class="my-1 border-t border-gray-200 dark:border-gray-700" role="separator"></div>
        <div class="px-3 pb-1 pt-2 text-xs font-medium text-gray-500 dark:text-gray-400" aria-hidden="true">
          {$t('assistant_activity_visibility')}
        </div>
        {#each modes as itemMode, index (itemMode)}
          <button
            bind:this={itemElements[index + 1]}
            type="button"
            role="menuitemradio"
            aria-checked={mode === itemMode}
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-black hover:bg-gray-50 focus:bg-gray-50 dark:text-white dark:hover:bg-gray-800 dark:focus:bg-gray-800"
            onclick={() => selectMode(itemMode)}
          >
            {$t(labelKeys[itemMode])}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>
