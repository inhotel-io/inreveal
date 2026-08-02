# Web: compact sidebar rail

Design doc for the sidebar half of [discussion #912](https://github.com/open-noodle/gallery/discussions/912).

## Problem

On tablets and medium screens the web app's chrome crowds out the photo grid. #912 raises three
contributors: the sidebar, the Space header banner, and the filter panel. This spec covers **only the
sidebar**. The banner and filter panel get their own specs later, referencing the same discussion.

Today the sidebar is binary:

- `≥ 850px` (`--breakpoint-sidebar`): full 16rem sidebar, always visible.
- `< 850px`: fully hidden; the hamburger floats it over the content.

There is no middle state, so a 900px-wide iPad spends 16rem on navigation. Worse, the threshold is a
fixed width, so rotating an iPad flips the sidebar between "always there" and "always hidden" with no
user control — the specific complaint in the thread.

## Goal

Add a third state: a thin icon rail, modelled on Google Photos. It is reachable by an explicit user
setting and is the automatic default on medium screens. A reply on #912 (LoPeraa) asks specifically
for the Google Photos pattern where the rail expands on hover.

## Decisions

| Question           | Decision                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Scope              | Sidebar only. Space header banner and filter panel are out of scope.                             |
| Rail behaviour     | Hover expands the full sidebar as a floating overlay. The photo grid never reflows.              |
| Setting            | Three-value preference, defaulting to width-driven `auto`.                                       |
| Rail contents      | Icons only, text group headers become dividers, sub-trees hidden, storage collapses to one icon. |
| Rendering approach | Fork-local `sidebar-nav-item.svelte` owning its own markup.                                      |
| Constraint         | Keep changes in fork-only files wherever possible to limit rebase conflicts.                     |

### Why a fork-local nav item

`NavbarItem` comes from `@immich/ui` and unconditionally renders
`<span class="truncate text-sm font-medium">{title}</span>`. There is no icon-only variant. Three
options were considered:

1. **Fork-local component owning its markup** — chosen. The label stays mounted and animates to zero
   width, so rail↔expanded is a pure CSS transition rather than a component swap needing a cross-fade.
   No coupling to `@immich/ui` internals. Costs ~40 lines duplicated from `NavbarItem`, which can drift
   cosmetically on a UI bump — a visual divergence, not a breakage.
2. **CSS-only collapse of `NavbarItem`** — rejected. Smallest diff and also smooth, but it targets
   `@immich/ui`'s internal span/chevron structure by selector. A UI bump that rewraps the span silently
   un-collapses the rail.
3. **Extend `patches/@immich__ui@0.83.0.patch`** — rejected. Cleanest call sites, but this fork rebases
   onto upstream regularly and every `@immich/ui` bump would make that hunk a merge conflict. The
   existing patch is deliberately small and behavioural; adding a feature to it is a different
   commitment.

## State model

Two persisted-independent concepts: the user's **mode** preference, and the **resolved layout**.

```ts
// web/src/lib/stores/sidebar-mode.svelte.ts  (fork-only)
export type SidebarMode = 'auto' | 'expanded' | 'rail';
export type SidebarLayout = 'overlay' | 'rail' | 'expanded';
```

`sidebarMode` is persisted via `persisted()` from `svelte-persisted-store`, defaulting to `'auto'`.

Resolution, evaluated reactively so a resize or rotation re-resolves live:

| Viewport         | `auto`     | `expanded` | `rail`    |
| ---------------- | ---------- | ---------- | --------- |
| `< 850px`        | `overlay`  | `overlay`  | `overlay` |
| `850px – 1279px` | `rail`     | `expanded` | `rail`    |
| `≥ 1280px`       | `expanded` | `expanded` | `rail`    |

`< 850px` is always `overlay` regardless of mode: a rail costs ~4rem, which a phone cannot spare, and
this preserves today's behaviour exactly on phones.

The `≥ 850px` query already exists as `mediaQueryManager.isFullSidebar`. The `≥ 1280px` query is new
and lives in the fork-only store rather than in upstream `media-query-manager.svelte.ts`.

`hoverExpanded` is separate `$state`, deliberately **not** persisted, and only meaningful when
`layout === 'rail'`.

The existing `sidebarStore.isOpen` keeps its current semantics untouched. It is a settable `$derived`
because `AdminPageLayout` does `bind:open={sidebarStore.isOpen}`; converting it to plain `$state` would
break that binding.

## Layout and widths

Two grids currently hardcode the width and must agree:

- `UserPageLayout`: `grid-cols-[--spacing(0)_auto] sidebar:grid-cols-[--spacing(64)_auto]`
- `NavigationBar`: `grid-cols-[--spacing(32)_auto] sidebar:grid-cols-[--spacing(64)_auto]`

Both become driven by one custom property, set inline from the store:

| `layout`   | `--sidebar-width`       |
| ---------- | ----------------------- |
| `overlay`  | `0`                     |
| `rail`     | `--spacing(16)` = 4rem  |
| `expanded` | `--spacing(64)` = 16rem |

The edit should be a single token per grid with an upstream-equivalent fallback, so an unset variable
behaves exactly as today. The exact Tailwind 4 spelling for a `var()` fallback wrapping `--spacing(64)`
must be verified during implementation; if it does not compile, fall back to an explicit conditional
class string.

**Hover-expand without reflow.** The `<nav>` keeps its grid slot at `--sidebar-width`. The inner scroll
container is absolutely positioned, `z-10`, and transitions its own width from 4rem to 16rem with a
shadow. The grid column never changes, so the justified timeline never re-lays-out.

Transitions are gated on `mediaQueryManager.reducedMotion`.

## Components

### New (fork-only, kebab-case per recent fork convention)

| File                                                                    | Role                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `web/src/lib/stores/sidebar-mode.svelte.ts`                             | `sidebarMode`, `≥1280px` query, resolved `layout`, `hoverExpanded`     |
| `web/src/lib/components/sidebar/sidebar-shell.svelte`                   | rail/overlay container; replaces `Sidebar.svelte` for the user sidebar |
| `web/src/lib/components/sidebar/sidebar-nav-item.svelte`                | icon + label row                                                       |
| `web/src/lib/components/shared-components/side-bar/rail-storage.svelte` | compact storage icon                                                   |
| `web/src/routes/(user)/user-settings/sidebar-settings.svelte`           | the setting block                                                      |

### Modified (upstream — four files)

| File                    | Change                                           |
| ----------------------- | ------------------------------------------------ |
| `UserSidebar.svelte`    | shell swap, 16 row swaps, storage branch         |
| `UserPageLayout.svelte` | one grid token                                   |
| `NavigationBar.svelte`  | grid token, `Logo variant`, hamburger visibility |
| `AppSettings.svelte`    | one import + one `<SidebarSettings />` line      |

### Deliberately untouched

`Sidebar.svelte` (only `UserSidebar` imports it, so the fork shell takes its place there; its existing
spec keeps passing unmodified), `BottomInfo.svelte`, `StorageSpace.svelte`, `preferences.store.ts`,
`media-query-manager.svelte.ts`, `app.css`, `+layout.svelte`, `AdminPageLayout.svelte`.

Admin pages are unaffected: `AdminPageLayout` uses `@immich/ui`'s `AppShellSidebar`, a different
component, and keeps today's binary behaviour.

## Interaction and accessibility

The hamburger is currently `class="sidebar:hidden"` — hidden at `≥ 850px`, because at that width the
sidebar was always fully visible. **Rail mode breaks that assumption.** Hover does not exist on touch,
so an iPad user at `≥ 850px` in rail mode would have no route to the labels. The hamburger must be
visible whenever `layout === 'rail'`.

- **Pointer:** `pointerenter` / `pointerleave` on the nav toggle `hoverExpanded`. JavaScript state
  rather than CSS `:hover`, because the `items` sub-trees need conditional rendering, not just styling.
- **Touch** (`mediaQueryManager.pointerCoarse`): no hover-expand. Tapping a rail icon navigates. The
  hamburger opens the full overlay, the same affordance as below 850px.
- **Keyboard:** `focusin` expands, `focusout` collapses, so labels are visible while tabbing. `Escape`
  collapses without stealing focus.
- **Not modal:** `focusTrap` stays limited to the `< 850px` overlay. A hover-expanded rail does not trap
  focus, and `inert` is never set in rail mode.
- **Accessible name:** the label `<span>` stays mounted and is collapsed with width/opacity, not
  `display: none`, so each link keeps its accessible name. The rail additionally sets a `title` tooltip
  for sighted users.

## Settings and i18n

`sidebar-settings.svelte` renders a three-option control bound to `sidebarMode`, using
`SettingCombobox` for consistency with the existing `AppSettings` controls.

New keys go in `i18n/en.json` only — `sidebar_mode`, `sidebar_mode_description`, `sidebar_mode_auto`,
`sidebar_mode_expanded`, `sidebar_mode_rail`. The `i18n/` directory is shared between web and mobile;
other locales backfill separately.

## Testing

**TDD throughout: write the failing test before the implementation for every slice.**

New fork-only specs, extending the `vi.hoisted` + `vi.mock('$lib/stores/media-query-manager.svelte')`
pattern already used in `Sidebar.spec.ts`:

- `sidebar-mode.spec.ts`
- `sidebar-shell.spec.ts`
- `sidebar-nav-item.spec.ts`
- `rail-storage.spec.ts`
- `sidebar-settings.spec.ts`

### Assertion trap to design around

Because the label `<span>` deliberately stays in the DOM in rail mode to preserve the accessible name,
any `getByText('Photos')` assertion passes in **both** states and can never fail. Rail assertions must
target the resolved collapse state via a `data-*` attribute on the container, never text presence.

Similarly, do not assert on a class string that appears in more than one state, and do not assert
`toBeVisible()` on an element collapsed by width/opacity — happy-dom does not compute that the way a
browser does.

### Coverage matrix

| #   | Case                                                                                             |
| --- | ------------------------------------------------------------------------------------------------ |
| 1   | Full mode × width matrix (3 × 3 from the resolution table) resolves correctly                    |
| 2   | Resize/rotation across all three bands re-resolves live                                          |
| 3   | `hoverExpanded` resets when `layout` changes away from `rail`                                    |
| 4   | Hover expand and collapse on `pointerenter` / `pointerleave`                                     |
| 5   | Grid column stays at rail width while hover-expanded (no reflow)                                 |
| 6   | `pointerCoarse` at `≥ 850px`: no hover-expand; hamburger visible                                 |
| 7   | Hamburger visible in rail, hidden in `expanded`, visible in `overlay`                            |
| 8   | `focusin` expands, `focusout` collapses                                                          |
| 9   | `Escape` collapses a hover-expanded rail                                                         |
| 10  | `inert` never true in rail; focus trap inactive in rail                                          |
| 11  | Focus trap still active in the `< 850px` overlay (regression)                                    |
| 12  | Sub-trees (Recent Spaces / Recent Albums) hidden in rail, present when expanded                  |
| 13  | Hiding a sub-tree does not clobber the persisted `recentSpacesDropdown` flag                     |
| 14  | Active-route highlight visible in rail, including the exact-match `isActive` override for Spaces |
| 15  | `NavbarGroup` "Library" renders as a divider in rail, as a text header when expanded             |
| 16  | `rail-storage` tooltip carries the same `storage_usage` string                                   |
| 17  | Reduced motion disables transitions                                                              |
| 18  | RTL: rail expands toward the inline-end in `dir="rtl"`                                           |
| 19  | Corrupt or unknown persisted `sidebarMode` falls back to `auto`                                  |
| 20  | Long translated labels truncate in the expanded overlay                                          |
| 21  | Setting control writes `sidebarMode` and the layout re-resolves                                  |
| 22  | Existing `Sidebar.spec.ts` and `user-sidebar.spec.ts` stay green unmodified                      |

## Out of scope

- Space header banner (compact / sticky-shrinking) — separate spec.
- Filter panel as an overlay — separate spec.
- Any mobile (Flutter) change.
- Backfilling non-English translations.
