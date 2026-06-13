# Space tabbed navigation — design

**Date:** 2026-06-13
**Branch:** `feat/space-albums`
**Status:** Approved design, pre-implementation
**Scope:** Web only (SvelteKit). Mobile/Flutter untouched.

## Problem

The space detail view scatters its most-used destinations across two places and leans on
unlabeled icons:

- **Albums** and **Map** are small icons in the top-right app bar (hover-to-discover).
- **Members** appears both as a top-right icon **and** as a pill in the cover hero.
- **People** appears as a top-right overflow item, a "Manage people" pill in the hero, **and**
  a face strip below it.
- The cover hero carries a row of pills (photo count, members, manage-people, role, collapse
  chevron) — so identity, stats, navigation, and actions are tangled together.

The result: no single "what can I do here" surface, duplicated entry points, and discoverability
that depends on hovering icons. The cover photo itself is liked; the problem is the **split**
between cover-pills and header-icons.

## Goals

- One labeled navigation surface for the frequently-used destinations: **Photos, People, Albums,
  Map, Members**.
- End the split: every action has exactly one home (identity / navigation / actions cleanly
  separated).
- Keep the cover photo as identity, but button-free.
- No regressions in role-gating (viewer / editor / owner / admin) or existing space features.

## Non-goals

- Mobile (Flutter) parity — deferred.
- Redesigning the People, Albums, or Map pages' internals — only how they are reached and framed.
- Changing the asset viewer, multi-select control bar, or filter/search behavior beyond where
  they mount.

## Decisions (from brainstorming)

| Question         | Decision                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Navigation model | **Labeled tab bar** — `Photos · People · Albums · Map · Members`                            |
| Scope            | **Web only**                                                                                |
| Cover treatment  | Keep the cover (it's liked); make it button-free identity (Direction A)                     |
| Members          | **Fifth tab** (new `/members` route), replacing the slide-in panel                          |
| Scroll behavior  | Moderate cover (~220px) **scrolls away; tab bar sticks** to top. No manual collapse chevron |
| Map tab          | **Routes out** to the existing `/map?spaceId=` with a "back to space" affordance            |
| Face strip       | **Dropped** — People tab is the single people surface                                       |

## Architecture — a shared space shell

Today each space view (`/spaces/[id]`, `/people`, `/albums`) is an independent page that
re-renders its own chrome, and the Photos page owns the app-bar buttons + cover hero. We
introduce a **SvelteKit layout** at `web/src/routes/(user)/spaces/[spaceId]/` that owns the chrome
once; each tab becomes a child route filling the content below.

```
(user)/spaces/[spaceId]/
  +layout.ts                      ← load space + role + members + counts (once)
  +layout.svelte                  ← app bar (back · name · ＋Add photos · ⋮) + cover + sticky <SpaceTabs>
  [[photos=photos]]/[[assetId=id]]/+page.svelte   ← Photos tab (content only)
  people/+page.svelte             ← People tab (content only)
  albums/+page.svelte             ← Albums tab (content only)
  members/+page.svelte            ← Members tab (NEW)
```

- **`+layout.ts`** loads the space, the current member/role, the members list, and the counts
  used for tab badges (assetCount, album count, members length). Child routes keep loading their
  own content.
- **`+layout.svelte`** renders the app bar, the cover (`SpaceHero`), and the sticky `SpaceTabs`,
  then `{@render children()}`. Role helpers (`isOwner`, `isEditor`, `currentMember`) are computed
  here and exposed to children via Svelte context, so child pages don't recompute them.

### Sticky scroll behavior

On the Photos tab the cover (~220px) scrolls away under a **sticky tab bar** that pins to the top
of the scroll container, showing a condensed title + the same app-bar actions. This replaces the
current manual expand/collapse chevron and the `collapsed`/`onToggleCollapse` machinery in
`space-hero.svelte`. On the other tabs the cover is shorter (identity only) and tabs stay pinned.

## Tabs & routing

`web/src/lib/components/spaces/space-tabs.svelte` renders the labeled tabs with active-state from
the current route, count badges where cheap, and visibility gating.

| Tab         | Route                                 | Visible when                   | Badge        |
| ----------- | ------------------------------------- | ------------------------------ | ------------ |
| **Photos**  | `/spaces/[id]` (default/index)        | always                         | asset count  |
| **People**  | `/spaces/[id]/people`                 | `space.faceRecognitionEnabled` | —            |
| **Albums**  | `/spaces/[id]/albums`                 | always                         | album count  |
| **Map**     | → `/map?spaceId=[id]` (navigates out) | always                         | —            |
| **Members** | `/spaces/[id]/members`                | always                         | member count |

- Tabs render as an ARIA `tablist` (`role="tab"`, `aria-selected`, arrow-key navigation), but are
  real links for deep-linking and middle-click.
- **Map** is a launch, not an in-shell section: clicking it navigates to `/map?spaceId=`. The map
  page gains a "← back to {space name}" affordance to return. (The existing `space-map.svelte`
  link is absorbed into this tab.)
- **People vs Members** naming: People = faces detected in photos; Members = users with access.
  Keep labels distinct; no icon-only reliance.

### Responsive (web)

On narrow widths the tab strip becomes horizontally scrollable; the app-bar **＋ Add photos**
collapses to an icon-only `＋`. Tabs never wrap.

## Actions & role gating

The **only** app-bar actions, identical on every tab:

- **＋ Add photos** — editors+. Because the timeline's add-assets mode lives on the Photos page,
  this action navigates to the Photos route (if not already there) and enters `select-assets`
  mode (see "Cross-route intents").
- **⋮ overflow** — the existing management menu, minus "People" (now a tab):
  - Show / hide on timeline (toggle)
  - Share / stop sharing person metadata
  - Add all photos (editor)
  - Link libraries (admin)
  - Hide / show people, hide / show pets (owner)
  - Change cover photo / Reposition cover (editor) — see cover affordance
  - Delete space (owner)

Gating is unchanged from today, just relocated to the layout. Viewers see no **＋** and no
owner/admin overflow items.

### Cover edit affordance

The cover is button-free. Editors get a hover-revealed **✎** control offering **Change cover
photo** and **Reposition**. With no cover set, the cover shows a "Set cover photo" prompt
(editors). Reposition uses the existing drag-to-reposition flow in `space-hero.svelte` (kept);
"Change cover photo" routes to Photos and enters `select-cover` mode.

### Cross-route intents

Two actions live in the layout but are fulfilled by the Photos page's selection modes
(`select-assets`, `select-cover`). A small runes-based manager at
`web/src/lib/managers/space-ui-manager.svelte.ts` (matching the fork's manager-singleton pattern)
carries the intent: the layout sets the intent and ensures the Photos route is active; the Photos
page consumes it on mount and enters the corresponding mode, then clears it. The same manager
holds the selection-mode flag the shell reads to hide its app bar + tabs. This keeps the heavy
timeline/selection state on the Photos page while the trigger lives in the shell.

## Members tab (from the slide-in panel)

`space-panel.svelte`'s content becomes `members/+page.svelte`:

- Member list with avatars, name/email, **role** (owner can change editor/viewer/owner; others
  read-only), and contribution stats (photos added, last active).
- **＋ Invite** (owner only).
- A **Recent activity** section below the list (the existing `space-activity-feed.svelte`, with
  load-more).

The slide-in `SpacePanel`, its open/close state (`panelOpen`), and every trigger that opened it
(the header members icon, the hero member-count pill, onboarding "invite members") are removed;
those now route to the Members tab. The `space-activity-feed.svelte` component is reused as-is.

## What's removed

- `space-people-strip.svelte` usage (face strip) on the Photos tab — delete the component if it
  has no other consumers.
- The hero pill row in `space-hero.svelte`: photo count, member-count button, "Manage people"
  link, role badge relocation, and the collapse/expand chevron + `collapsed`/`onToggleCollapse`
  props. The hero keeps: cover image, name, description, role badge (now top-corner), reposition
  mode, and the new hover ✎.
- The scattered header icons on the Photos page (`mdiMapOutline`, `mdiImageMultipleOutline`
  albums, `mdiAccountMultipleOutline` members) and the members button — all replaced by tabs.
- The slide-in `SpacePanel` and its triggers.

## Modes that must overlay the shell

The Photos page's full-screen modes — `select-assets`, `select-cover`
(`ControlAppBar`), and the multi-select `AssetSelectControlBar` — must visually cover or suppress
the shell's app bar + tabs while active, and the asset viewer overlay (`[[assetId=id]]`) continues
to render above the shell. The layout hides its app bar + tabs when the active child signals a
selection/cover mode (via the shared `space-ui` state), restoring them on exit.

## Data flow

- `+layout.ts` → `{ space, currentMember, role, members, counts }` available to layout + children
  via `data` and context.
- Mutations that change shell data (role changes, invites, cover change, delete, toggles) call the
  existing shared-space APIs and invalidate the layout load (`invalidate`) so the shell + badges
  refresh. The Members tab triggers `invalidate` after member/role changes.

## File-by-file change list

**New**

- `web/src/routes/(user)/spaces/[spaceId]/+layout.ts`
- `web/src/routes/(user)/spaces/[spaceId]/+layout.svelte`
- `web/src/lib/components/spaces/space-tabs.svelte`
- `web/src/routes/(user)/spaces/[spaceId]/members/+page.svelte`
- `web/src/lib/managers/space-ui-manager.svelte.ts` (cross-route intents + selection-mode flag)

**Modified**

- `.../[[photos=photos]]/[[assetId=id]]/+page.svelte` — strip the `buttons`/`leading` snippets,
  the `SpaceHero` render, and the `SpacePeopleStrip`; read shell context; consume add-photos /
  change-cover intents; signal selection modes to the shell.
- `web/src/lib/components/spaces/space-hero.svelte` — moderate default height; remove pill row +
  collapse chevron; relocate role badge; add hover ✎ edit affordance; keep reposition.
- `web/src/lib/components/spaces/space-map.svelte` — folded into the Map tab entry (back-to-space
  affordance added on the map page).
- People & Albums pages — drop any self-rendered header now provided by the shell.

**Removed**

- `web/src/lib/components/spaces/space-panel.svelte` (content moved to Members tab).
- `web/src/lib/components/spaces/space-people-strip.svelte` (if unused elsewhere).

## Testing

- **Playwright (web)** — extend the existing space permission-gating and in-space-album suites:
  - Tab visibility per role: viewer sees no **＋** / no owner overflow items; People tab hidden
    when face recognition is off; all five tabs present otherwise.
  - Members-as-tab: list, role change (owner), invite, activity feed render at `/members`; no
    slide-in panel exists.
  - Navigation: each tab routes correctly and shows active state; Map launches `/map?spaceId=`
    and back returns; Add photos from a non-Photos tab lands in select-assets mode.
- **Unit (vitest + testing-library)** — `space-tabs.svelte` gating/badges; the `space-ui` intent
  manager; the hero with the pill row removed.
- **Accessibility** — tablist roles, keyboard navigation, sticky region focus order.

## Risks / open considerations

- **Shell vs. selection modes** — getting the show/hide of app bar + tabs right during
  select-assets / select-cover / multi-select is the fiddliest part; the shared `space-ui` flag is
  the single source of truth.
- **Photos route shape** — the existing `[[photos=photos]]/[[assetId=id]]` optional-matcher route
  must remain the layout's index; verify the asset viewer overlay and deep links still resolve
  under the new `+layout`.
- **Data dedup** — moving the space fetch to `+layout.ts` means the Photos page must stop
  re-fetching it; ensure no double load.
- **Map round-trip** — leaving the shell for the global map is a deliberate trade-off (less work);
  the back affordance must reliably return to the originating space tab.

```

```
