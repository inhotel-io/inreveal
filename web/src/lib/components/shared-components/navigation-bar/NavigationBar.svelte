<script lang="ts" module>
  export const menuButtonId = 'top-menu-button';
</script>

<script lang="ts">
  import { page } from '$app/state';
  import { clickOutside } from '$lib/actions/click-outside';
  import GlobalSearchInputTrigger from '$lib/components/global-search/global-search-input-trigger.svelte';
  import NotificationPanel from '$lib/components/shared-components/navigation-bar/NotificationPanel.svelte';
  import SkipLink from '$lib/elements/SkipLink.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { globalSearchManager } from '$lib/managers/global-search-manager.svelte';
  import { Route } from '$lib/route';
  import { getGlobalActions } from '$lib/services/app.service';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { notificationManager } from '$lib/stores/notification-manager.svelte';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import { sidebarStore } from '$lib/stores/sidebar.svelte';
  import { ActionButton, Button, IconButton } from '@immich/ui';
  import Logo from '$lib/components/shared-components/Logo.svelte';
  import { mdiBellBadge, mdiBellOutline, mdiMagnify, mdiMenu, mdiTrayArrowUp } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import ThemeButton from '../ThemeButton.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import AccountInfoPanel from './AccountInfoPanel.svelte';

  type Props = {
    onUploadClick?: () => void;
    // TODO: remove once this is only used in <AppShellHeader>
    noBorder?: boolean;
    /**
     * Opt-in: size the hamburger/column/logo from `sidebarModeStore.layout` (adds the rail
     * state). Defaults to false so callers with no rail-width sidebar of their own - namely
     * AdminPageLayout, whose sidebar is bound only to `sidebarStore.isOpen` and pinned open
     * above 850px regardless of `railOverlayOpen` - keep today's viewport-only behaviour
     * (hamburger hidden, logo inline, wide column) untouched above 850px.
     */
    railAware?: boolean;
  };

  let { onUploadClick, noBorder = false, railAware = false }: Props = $props();

  let shouldShowAccountInfoPanel = $state(false);
  let shouldShowNotificationPanel = $state(false);
  let innerWidth: number = $state(0);
  const hasUnreadNotifications = $derived(notificationManager.notifications.length > 0);

  onMount(async () => {
    try {
      await notificationManager.refresh();
    } catch (error) {
      console.error('Failed to load notifications on mount', error);
    }
  });

  const { Cast } = $derived(getGlobalActions($t));

  // Without `railAware`, fall back to the pre-rail, viewport-only check: no rail state
  // exists, and "expanded" just means "at/above the 850px sidebar breakpoint" - identical to
  // today's CSS-only `sidebar:` breakpoint behaviour for callers that never opt in.
  const isRail = $derived(railAware && sidebarModeStore.layout === 'rail');
  const isExpandedLayout = $derived(
    railAware ? sidebarModeStore.layout === 'expanded' : mediaQueryManager.isFullSidebar,
  );

  // The first column holds the hamburger AND the logo, which is why its sub-850px value is
  // 8rem. Rail mode needs the hamburger visible, so it cannot shrink to the 4rem rail width.
  //
  // Each pair below is driven from a single shared value on purpose, used for BOTH the real
  // prop/class and the test-facing attribute: a test asserting only the semantic label (e.g.
  // `data-column`) can't tell the two apart if they were computed by separate, duplicate
  // ternaries, so a mutation to only the "real" side would pass silently.
  const navColumn = $derived(isExpandedLayout ? 'wide' : 'narrow');
  const navColumnClass = $derived(
    { wide: 'grid-cols-[--spacing(64)_auto]', narrow: 'grid-cols-[--spacing(32)_auto]' }[navColumn],
  );
  const menuButtonHidden = $derived(isExpandedLayout);
  const logoVariant = $derived(isExpandedLayout ? 'inline' : 'icon');
</script>

<svelte:window bind:innerWidth />

<nav id="dashboard-navbar" class="h-(--navbar-height) w-dvw text-sm max-md:h-(--navbar-height-md)">
  <SkipLink text={$t('skip_to_content')} />
  <div
    data-testid="navbar-grid"
    data-column={navColumn}
    class="grid h-full items-center py-2 {navColumnClass} {noBorder ? '' : 'border-b'}"
  >
    <div class="mx-4 flex flex-row items-center gap-1">
      <IconButton
        id={menuButtonId}
        shape="round"
        color="secondary"
        variant="ghost"
        size="medium"
        aria-label={$t('main_menu')}
        icon={mdiMenu}
        onclick={() => {
          if (isRail) {
            sidebarModeStore.toggleRailOverlay();
            return;
          }
          sidebarStore.toggle();
        }}
        onmousedown={(event: MouseEvent) => {
          if (sidebarStore.isOpen) {
            // stops event from reaching the default handler when clicking outside of the sidebar
            event.stopPropagation();
          }
        }}
        class={menuButtonHidden ? 'hidden' : ''}
        data-hidden={menuButtonHidden ? '' : undefined}
      />
      <a data-sveltekit-preload-data="hover" href={Route.photos()}>
        <span data-testid="navbar-logo" data-variant={logoVariant}>
          <Logo variant={logoVariant} class="max-md:h-12" />
        </span>
      </a>
    </div>
    <div class="flex justify-between gap-4 pe-6 lg:gap-8">
      <div class="hidden w-full max-w-5xl flex-1 sm:block tall:ps-0">
        <GlobalSearchInputTrigger />
      </div>

      <section class="flex w-full place-items-center justify-end gap-1 sm:w-auto md:gap-2">
        <IconButton
          color="secondary"
          shape="round"
          variant="ghost"
          size="medium"
          icon={mdiMagnify}
          onclick={() => globalSearchManager.open()}
          id="search-button"
          class="sm:hidden"
          aria-label={$t('go_to_search')}
        />

        {#if !page.url.pathname.includes('/admin') && onUploadClick}
          <Button
            leadingIcon={mdiTrayArrowUp}
            onclick={onUploadClick}
            class="hidden lg:flex"
            variant="ghost"
            size="medium"
            color="secondary"
            >{$t('upload')}
          </Button>
          <IconButton
            color="secondary"
            shape="round"
            variant="ghost"
            size="medium"
            onclick={onUploadClick}
            title={$t('upload')}
            aria-label={$t('upload')}
            icon={mdiTrayArrowUp}
            class="lg:hidden"
          />
        {/if}

        <ThemeButton />

        <div
          use:clickOutside={{
            onOutclick: () => (shouldShowNotificationPanel = false),
            onEscape: () => (shouldShowNotificationPanel = false),
          }}
        >
          <div class="relative">
            <IconButton
              shape="round"
              color={hasUnreadNotifications ? 'primary' : 'secondary'}
              variant="ghost"
              size="medium"
              icon={hasUnreadNotifications ? mdiBellBadge : mdiBellOutline}
              onclick={() => (shouldShowNotificationPanel = !shouldShowNotificationPanel)}
              aria-label={$t('notifications')}
            />

            {#if hasUnreadNotifications}
              <div
                class="pointer-events-none absolute top-0 right-1 flex size-5 items-center justify-center rounded-full border bg-primary text-[10px] font-bold text-light"
              >
                {notificationManager.notifications.length}
              </div>
            {/if}
          </div>

          {#if shouldShowNotificationPanel}
            <NotificationPanel />
          {/if}
        </div>

        <ActionButton action={Cast} />

        <div
          use:clickOutside={{
            onOutclick: () => (shouldShowAccountInfoPanel = false),
            onEscape: () => (shouldShowAccountInfoPanel = false),
          }}
        >
          <button
            type="button"
            class="flex ps-2"
            onclick={() => (shouldShowAccountInfoPanel = !shouldShowAccountInfoPanel)}
            title="{authManager.user.name} ({authManager.user.email})"
          >
            {#key authManager.user}
              <UserAvatar user={authManager.user} size="md" noTitle interactive />
            {/key}
          </button>

          {#if shouldShowAccountInfoPanel}
            <AccountInfoPanel onClose={() => (shouldShowAccountInfoPanel = false)} />
          {/if}
        </div>
      </section>
    </div>
  </div>
</nav>
