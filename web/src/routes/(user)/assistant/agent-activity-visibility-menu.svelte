<script lang="ts">
  import { tick } from 'svelte';
  import { t, type Translations } from 'svelte-i18n';
  import type { AgentActivityVisibilityMode } from './agent-activity-visibility-ui';

  interface Props {
    mode: AgentActivityVisibilityMode;
    onModeChange: (mode: AgentActivityVisibilityMode) => void;
  }

  let { mode, onModeChange }: Props = $props();

  let isOpen = $state(false);
  let triggerElement: HTMLButtonElement | null = $state(null);
  let itemElements: HTMLButtonElement[] = $state([]);

  const modes: AgentActivityVisibilityMode[] = ['off', 'compact', 'expanded'];
  const labelKeys: Record<AgentActivityVisibilityMode, Translations> = {
    compact: 'assistant_activity_visibility_compact',
    expanded: 'assistant_activity_visibility_expanded',
    off: 'assistant_activity_visibility_off',
  };
  const activeIndex = $derived(Math.max(0, modes.indexOf(mode)));

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
    await focusItem(activeIndex);
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

  const selectMode = async (nextMode: AgentActivityVisibilityMode) => {
    onModeChange(nextMode);
    await closeMenu();
  };

  const moveFocus = async (delta: number) => {
    const activeElement = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    const currentIndex = activeElement ? itemElements.indexOf(activeElement) : -1;
    const nextIndex = (Math.max(0, currentIndex) + delta + modes.length) % modes.length;
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
    class="rounded-full border border-gray-300 px-3 py-2 text-sm font-medium text-black hover:bg-gray-50 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
    aria-haspopup="menu"
    aria-expanded={isOpen}
    onclick={toggleMenu}
    onkeydown={handleTriggerKeydown}
  >
    <span class="sr-only">{$t('assistant_activity_visibility')}</span>
    <span aria-hidden="true">{$t('assistant_activity_visibility')}: {$t(labelKeys[mode])}</span>
  </button>

  {#if isOpen}
    <div
      role="menu"
      aria-label={$t('assistant_activity_visibility_menu')}
      tabindex="-1"
      class="absolute right-0 z-20 mt-2 min-w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
      onkeydown={handleMenuKeydown}
    >
      {#each modes as itemMode, index (itemMode)}
        <button
          bind:this={itemElements[index]}
          type="button"
          role="menuitemradio"
          aria-checked={mode === itemMode}
          class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium text-black hover:bg-gray-50 focus:bg-gray-50 dark:text-white dark:hover:bg-gray-800 dark:focus:bg-gray-800"
          onclick={() => selectMode(itemMode)}
        >
          {$t(labelKeys[itemMode])}
        </button>
      {/each}
    </div>
  {/if}
</div>
