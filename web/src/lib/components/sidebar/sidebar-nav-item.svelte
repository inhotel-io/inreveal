<!-- web/src/lib/components/sidebar/sidebar-nav-item.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  // @immich/ui re-exports its types (dist/index.d.ts: `export * from './types.js'`),
  // so IconLike / IconProps come from the package rather than being redeclared here.
  import { Icon, Link, type IconLike, type IconProps } from '@immich/ui';
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    href: string;
    icon?: IconLike | IconProps;
    activeIcon?: IconLike | IconProps;
    isActive?: () => boolean;
    expanded?: boolean;
    items?: Snippet;
  }

  let { title, href, icon, activeIcon, isActive, expanded = $bindable(false), items }: Props = $props();

  // Rail collapses to icons only; hovering or focusing floats the labels back without
  // touching the grid column, so `collapsed` follows hoverExpanded too.
  const collapsed = $derived(sidebarModeStore.layout === 'rail' && !sidebarModeStore.hoverExpanded);

  const active = $derived(isActive ? isActive() : page.url.pathname.startsWith(href));

  const asIconProps = (value?: IconLike | IconProps) => {
    if (typeof value === 'string') {
      return { icon: value };
    }
    if (value && 'path' in value) {
      return { icon: value.path };
    }
    return value;
  };

  const iconProps = $derived(asIconProps(icon));
  const activeIconProps = $derived(asIconProps(activeIcon));

  // `bg-primary/10` cannot go through Svelte's `class:` directive - the slash is not a
  // valid identifier there - so the active tint is composed into the class string.
  const linkClass = $derived(
    [
      'hover:bg-subtle hover:text-primary flex w-full place-items-center gap-4 rounded-e-full py-3 ps-5 transition-[padding] delay-100 duration-100',
      active ? 'bg-primary/10 text-primary' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

<div>
  <!-- Link, not a raw <a>: it carries @immich/ui's shared link treatment and SvelteKit
       integration, matching what upstream NavbarItem renders. -->
  <Link
    {href}
    underline={false}
    data-active={String(active)}
    data-collapsed={String(collapsed)}
    title={collapsed ? title : undefined}
    aria-current={active ? 'page' : undefined}
    class={linkClass}
  >
    {#if iconProps}
      <Icon
        size="1.375em"
        class="shrink-0"
        aria-hidden={true}
        {...active && activeIconProps ? activeIconProps : iconProps}
      />
    {/if}
    <!--
      The label stays mounted in rail mode - collapsing it with width/opacity rather than
      unmounting keeps the link's accessible name and makes rail <-> expanded a pure CSS
      transition instead of a component swap needing a cross-fade.
    -->
    <span
      class="truncate text-sm font-medium transition-all duration-200 motion-reduce:transition-none"
      class:w-0={collapsed}
      class:opacity-0={collapsed}
      class:overflow-hidden={collapsed}
    >
      {title}
    </span>
  </Link>

  {#if items && expanded && !collapsed}
    <div>{@render items()}</div>
  {/if}
</div>
