# Filter Panel Redesign — Motion & Polish

**Date:** 2026-06-17
**Status:** Design approved, pending spec review
**Scope:** Fork-only feature (`web/src/lib/components/filter-panel/`)
**Interactive prototype:** `design-exploration/filter-panel-redesign.html` (open in a browser)

## Problem

The filter panel works but feels stiff:

- **Collapsing is a hard swap.** `filter-panel.svelte` flips between an 8px icon strip and a 256px panel via `{#if collapsed}` with no transition — it snaps.
- **Section expand/collapse is instant.** `filter-section.svelte` shows/hides body content via `{#if expanded}` with zero height animation; only the chevron rotates. This is inconsistent with the rest of the app — `setting-accordion.svelte` already uses `transition:slide`.
- **It looks flat and rigid.** Every section is separated by a hard full-width `border-b border-gray-200 dark:border-gray-700`, producing a ladder of rules. The year grid is a dense set of bordered boxes. The section toggle row is a row of square buttons.

The panel is a **shared component** rendered in 5+ hosts (photos, map, spaces, smart-search results, timeline grouping bar), so changes land everywhere. It is fork-only code, so there is no upstream-rebase conflict risk.

## Goals

1. Smooth, **settle-feeling** collapse/expand of the whole panel.
2. Smooth height-slide for individual section expand/collapse, consistent with the app's existing `transition:slide` convention.
3. Light visual polish: hairline dividers, soft tonal surfaces for the active section, a year grid that breathes, softened toggle pills.
4. Honor `prefers-reduced-motion`.
5. **No behavior changes, no feature changes**, and minimal test churn.

## Non-Goals (YAGNI)

- No restructuring to a chip/popover filter paradigm (explicitly rejected during brainstorming).
- No changes to filter data flow, providers, suggestion re-fetch logic, section visibility/persistence, or favorites/albums logic.
- No new filters, no font change (the prototype's Hanken Grotesk is mockup-only; production keeps Gallery's app font).
- The "slide-off drawer" collapse style (Option B in the prototype) is **not** being built.

## Decisions (locked during brainstorming)

| Decision | Choice | Why |
| --- | --- | --- |
| Scope | Motion + light polish | Lowest risk; keep today's structure and behavior. |
| Collapse style | **Option A — width-eased rail** | Keeps the always-visible icon rail (filters one click away); minimal behavior change; preserves the E2E tests that click rail icons. |
| Visual polish | Approved | Surfaces over hard rules, hairline dividers, breathing year grid, settle easing. |
| Test impact | Preserve mutual-exclusivity semantics | The collapse implementation keeps the `{#if}` content swap so existing unit/E2E presence assertions stay valid. |

## Motion language

Shared tokens, defined once and reused so the feel is consistent.

- **Easing:** decelerating "settle" curve `cubic-bezier(0.22, 1, 0.36, 1)`. For Svelte JS transitions (`slide`), use the closest stock curve `expoOut` from `svelte/easing`.
- **Durations:** panel width `380ms`; section slide `240ms`; hover/micro `150ms`.
- **Reduced motion** uses two mechanisms, both already available in the codebase:
  - **CSS transitions** (panel width, hovers, year chips) → Tailwind `motion-reduce:transition-none` variant (used elsewhere, e.g. `global-search.svelte`, `crop-area.svelte`).
  - **Svelte `slide` transition** (section body) → set `duration` to `0` when `mediaQueryManager.reducedMotion` is true (the existing reactive store in `stores/media-query-manager.svelte.ts`).

A small new module `web/src/lib/components/filter-panel/motion.ts` exports the easing/duration constants and a `slideMotion(reducedMotion: boolean)` helper returning `{ duration, easing }`. Keeps values in one place; used by `filter-section.svelte` and `filter-panel.svelte`.

## Architecture & component changes

### 1. Panel collapse — width-eased rail (`filter-panel.svelte`)

**Approach:** introduce a **persistent outer shell** whose width animates, and keep the existing `{#if collapsed}` content swap *inside* it.

- The shell is always rendered (when not `hidden`): `overflow-hidden`, `transition-[width] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none`, with width driven by a class — full (`w-[268px]`) vs rail (`w-[56px]`, up from today's 32px for breathing room).
- Inside the shell, the current `{#if collapsed}` branches are preserved: the collapsed branch keeps `data-testid="collapsed-icon-strip"` (with `expand-panel-btn` and the per-section rail icons + active dot), and the expanded branch keeps `data-testid="discovery-panel"`.
- Because content swaps via `{#if}` and the shell clips with `overflow-hidden`, expanding produces a **clip-reveal** (the full content is revealed left-to-right as the shell widens) and collapsing narrows the panel down to the rail. The width animates smoothly; only one content branch is ever in the DOM.

**Why not a both-mounted cross-fade:** keeping both the rail and full content mounted simultaneously (to cross-fade) would require rewriting ~10 unit assertions that encode "collapsed ⟺ `discovery-panel` absent" and risks Playwright visibility flakiness. Option A was chosen specifically for low churn, so we keep the single-branch swap. (If a cross-fade is wanted later, it is a follow-up with explicit test updates — out of scope here.)

**Rail/toggle-row polish:** rounded-`[10px]` toggle pills (active = `bg-primary/10 text-primary`, already present), add `active:scale-90 transition-transform motion-reduce:transition-none` for a tactile press, keep the animated "has active filter" dot and all `section-toggle-*` testids.

### 2. Section expand/collapse — height slide (`filter-section.svelte`)

- Keep `{#if expanded && !isEmpty}` for the body, but wrap the reveal with `transition:slide={slideMotion(mediaQueryManager.reducedMotion)}` (import `slide` from `svelte/transition`, `expoOut` from `svelte/easing`, `mediaQueryManager` from `stores/media-query-manager.svelte`, and the helper from `motion.ts`). `mediaQueryManager.reducedMotion` is a Svelte 5 reactive getter, accessed directly (no `$` store prefix). This matches `setting-accordion.svelte`.
- Replace the wrapper's hard `border-b border-gray-200 dark:border-gray-700` with **surfaces over rules**: each section becomes a `rounded-xl mx-1.5` block; the expanded/active section gets a soft `bg-subtle` tonal background; spacing (not full-width borders) separates sections. A hairline divider may remain only where needed (`border-white/5` / `border-gray-200/60`).
- Keep the chevron rotate (already `transition-transform`); add `motion-reduce:transition-none`.
- Keep `data-testid="filter-section-{testId}"` and the empty `(0)` behavior.

### 3. Year/month grid polish (`temporal-picker.svelte`)

- Year grid: switch from the 4-column `flex flex-wrap basis-[calc(25%-5px)]` to a clean `grid grid-cols-3 gap-1.5` (3 columns, matching the screenshot and prototype), chips `rounded-xl`, refined hover (`hover:-translate-y-0.5 motion-reduce:hover:translate-y-0`), keep the selected primary fill, keep tabular-figure counts.
- Volume bars keep the existing `transition-[width]`; add a one-time load grow (keyframe `scaleX(0)→1`, `motion-reduce` safe).
- Month grid: apply the same chip styling for consistency.
- Date-range inputs: already rounded with a focus ring — keep; only align spacing/tokens.
- Preserve all testids: `temporal-picker`, `year-grid`, `year-btn-{year}`, `month-grid`, `month-btn-{month}`, `custom-date-from-input`, etc.

## Theming

Stay entirely within the existing `@immich/ui` / Tailwind theme tokens already used in these files (`bg-light`, `bg-subtle`, `text-primary`, `immich-primary` / `immich-dark-primary`, gray scale). Hairlines are expressed as low-opacity variants of the existing border grays. No new color system. Works in both light and dark themes (verified visually in the prototype).

## Testing

**Must stay green (unchanged):**

- `filter-panel.spec.ts` collapse/expand presence assertions — preserved by keeping the `{#if}` content swap.
- E2E `photos-filter-panel`, `map-filter-panel`, `spaces-filter-panel` specs — testids and element visibility preserved; Playwright auto-waiting absorbs the transition.

**New / updated:**

- Unit: assert the shell carries the width-transition + `motion-reduce:transition-none` classes, and that toggling `collapsed` flips the width class (pattern mirrors `global-search.spec.ts`, which asserts `motion-reduce:` class presence).
- Section slide: verify `filter-sections.spec.ts` still passes; if any assertion checks section-body **absence immediately after collapse**, wrap it in `waitFor`/`tick` because `transition:slide` makes removal async. (Touch-point to confirm during implementation — expected to be small.)
- Manual: open `design-exploration/filter-panel-redesign.html`, exercise both themes and the reduced-motion toggle. In the running app, verify with OS "Reduce motion" on.

## Risks

- **Async outro vs. synchronous test assertions.** Adding `transition:slide` to section bodies can make happy-dom-based tests see a lingering node on collapse. Mitigation: the `reducedMotion`-aware duration and `waitFor` in the few affected tests.
- **Rail width change (32px → 56px).** Purely internal to the component's collapsed footprint; hosts are unaffected, but visually confirm in each host during implementation.
- **Section surface restyle** touches the most-rendered component path; keep diffs tight and rely on existing testids to catch regressions.

## Out-of-repo artifact

The prototype `design-exploration/filter-panel-redesign.html` is a throwaway design reference. Decide at finish time whether to keep it in the branch (as a design record under `design-exploration/`) or delete it before merge — it is not wired into any build.
