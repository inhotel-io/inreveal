# Move the Filter panel's section show/hide behind a cog menu

**Date:** 2026-08-04
**Scope:** web only — a new `web/src/lib/components/filter-panel/filter-section-menu.svelte`, edits to `web/src/lib/components/filter-panel/filter-panel.svelte`, one new i18n key, and the test migration in `web/src/lib/components/filter-panel/__tests__/`.

## Problem

The Filter panel decides which sections to render from a `visibleSections` set, and the only way to change that set is a row of icon-only toggles under the panel header (`filter-panel.svelte:722-750`):

```svelte
{#each config.sections as section (section)}
  <button aria-label={sectionToggleLabels[section]} aria-pressed={visibleSections.has(section)} …>
    <Icon icon={sectionIcons[section]} size="16" />
```

With every section configured that is ten 30px buttons in a 16rem panel — calendar, person, map pin, camera, tag, star, image, heart, album, magnifier-over-text (`filter-panel.svelte:330-341`). Nothing on screen says what they do or that they are toggles at all. The icons repeat the words already printed on the section headers directly below them, so the row reads as decoration until you happen to click one and a section vanishes.

The affordance is also invisible in the other direction: the words that would explain it (`sectionTitles`, `filter-panel.svelte:343-354`) exist already and are used only for `title` tooltips, which do nothing on touch.

## Decisions

| Question                              | Decision                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| Where the control lives               | A cog in the panel header, beside the `Filters` label                        |
| What it opens                         | A popover listing every section by name with a checkbox                      |
| Surface                               | New local component, dismissed by the existing `clickOutside` action         |
| Cue for a hidden section that filters | A dot on the cog, plus a marker on that row in the menu                      |
| Reset                                 | `Show all` at the foot of the menu                                           |
| Menu semantics                        | Plain popover of `aria-pressed` buttons — deliberately **not** `role="menu"` |
| Testids                               | `section-toggle-{section}` and `section-toggle-dot-{section}` kept as-is     |

### Rejected alternatives

- **Reuse `shared-components/context-menu/`.** Consistent with the app's other menus and keyboard handling comes free, but `MenuOption` closes on select and carries no checked state or trailing badge. Multi-toggling would reopen the menu on every click, and adding checkbox support means editing upstream files that every rebase then has to carry.
- **Inline list inside the panel.** No floating layer, no focus concerns, identical on touch — but it pushes the sections down each time it opens, which trades one always-present row for another intermittently-present one. That is close to the problem being solved.

## Design

### Component boundary

`filter-panel.svelte` is 893 lines. The popover goes in its own file rather than adding to it.

**`filter-section-menu.svelte`** owns the trigger, the open state and the list. Props:

| Prop                    | Meaning                                                |
| ----------------------- | ------------------------------------------------------ |
| `sections`              | `FilterSectionType[]` — the page's configured sections |
| `visible`               | `Set<FilterSectionType>` — which are currently shown   |
| `titles`                | section → label, from the existing `sectionTitles`     |
| `toggleLabels`          | section → accessible name, from `sectionToggleLabels`  |
| `hasHiddenActiveFilter` | `(section) => boolean` — drives the per-row marker     |
| `onToggle`              | `(section) => void`                                    |
| `onShowAll`             | `() => void`                                           |

It reads no storage and knows nothing about filter values. Its only state is `open`. That keeps it testable with no localStorage or SDK mocking.

`filter-panel.svelte` keeps `visibleSections` (`:449`), `toggleSection` (`:476-484`), `showAllSections` (`:486-488`) and the persistence effect (`:490-498`) untouched, including the `known`-set hydration that defaults newly-shipped sections to visible. The header at `:707-720` gains the cog between the `Filters` label and the close button; the block at `:722-750` is deleted.

`sectionIcons` (`:330-341`) is deleted with it — the menu is worded, and no other code reads it.

### The cog's dot

Derived in `filter-panel.svelte` from the predicate the per-icon dot already uses:

```ts
const anyHiddenActiveFilter = $derived(
  config.sections.some((section) => !visibleSections.has(section) && hasActiveFilter(section)),
);
```

Its purpose is to be visible while the menu is **shut**, so it is asserted without opening the menu.

### Interaction

The menu stays open across toggles — hiding three sections is three clicks, not three round-trips through the cog. It closes on outside click or Escape via `use:clickOutside={{ onOutclick, onEscape }}`, the same action `sidebar-shell.svelte:119` uses, rather than the `svelte:window` click handler in `search-sort-dropdown.svelte:33-37`. Escape returns focus to the cog.

### Semantics

The rows are `<button aria-pressed>` in a plain popover, and the trigger carries `aria-expanded` + `aria-controls`. `role="menu"` with `role="menuitemcheckbox"` would be the richer vocabulary, but it obliges arrow-key navigation and a roving tabindex; declaring the role without implementing it leaves a screen-reader user with a menu whose keys do not work. Plain buttons get native Tab order and no keyboard code to get wrong, and `aria-pressed` is what the icons already carry today.

Both `titles` and `toggleLabels` are passed because they deliberately diverge for one section: the row reads `Favorites` but its accessible name is `Starred filter section`, to keep browser automation from confusing it with the asset action of the same name (`filter-panel.svelte:356-360`, asserted in `filter-panel.spec.ts:522-528`). Carried over unchanged, with a caveat now that the label is visible: an accessible name that does not contain the visible text is what WCAG 2.5.3 Label in Name warns against. It was invisible while the control was an icon. Left as-is here rather than folded into this change — the disambiguation is deliberate and undoing it belongs in its own commit with its own test.

### Positioning

The panel body is `overflow-y-auto` (`filter-panel.svelte:703`), so anything absolutely positioned inside it is clipped at the container edge. The popover therefore renders inside the header, which is `sticky top-0 z-5` (`:708`), and needs a z above `5`.

At ten sections plus the reset the menu is roughly 380px against a full-height panel, so it fits without portalling to `<body>`. Should the section list ever outgrow that, the fix is a `max-height` and internal scroll on the menu — not a portal.

### i18n

`filter_show_all_sections` already exists as "Show all" (`i18n/en.json:1591`) and is reused verbatim for the reset.

One new key for the cog's accessible name — `filter_manage_sections`, "Show or hide sections" — added to `i18n/en.json` only, per the repo's convention.

One existing string **must** change: `filter_show_sections_hint` reads "Click an icon above to show filters" (`i18n/en.json:1593`). It names the row this change deletes. It becomes "Use the cog above to show filters". The key is web-only — `filter-panel.svelte:878` is its sole consumer — so mobile is unaffected, but the `i18n/` directory is shared with mobile and the key keeps its name so no other locale file is orphaned.

## Testing

`section-toggle-{section}` and `section-toggle-dot-{section}` move onto the menu rows unchanged. Keeping them is what makes this a migration rather than a rewrite. No collision results from both being mounted at once: sections render as `filter-section-{id}` (`filter-section.svelte:25`).

**Existing tests.** 51 references across 25 tests in `filter-panel.spec.ts`, and 2 in `filter-sections.spec.ts` (`:1318`, `:1334`). An `openSectionMenu()` helper beside the existing `renderPanel()` clicks the cog; the affected tests gain one line each.

Three assertions change shape, all of them `section-toggle-row` sites:

| Test                      | Line   | Now        | Becomes                                                |
| ------------------------- | ------ | ---------- | ------------------------------------------------------ |
| renders row + all icons   | `:516` | row exists | open the menu, assert the list and its rows            |
| no row in collapsed panel | `:554` | row absent | **cog absent** — the header is gone entirely           |
| no row with empty config  | `:561` | row absent | **cog absent** — the `config.sections.length > 0` gate |

The last two improve: they stop asserting the absence of markup and start asserting the cog's actual render gate.

**New coverage:**

- The aggregate dot on the cog — hide a section holding an active filter, assert the dot **without** opening the menu.
- `filter-section-menu.spec.ts` for the component alone: opens and closes; Escape restores focus to the cog; stays open across consecutive toggles; `Show all` fires once; checkbox state tracks the `visible` prop.

**No e2e churn** — nothing under `e2e/` references these testids.

## Out of scope

- The empty-state rescue link (`filter-panel.svelte:876-888`) keeps its markup and its `show-all-sections` testid. It is reachable by a different route — hiding everything — so duplicating the reset there costs nothing. Only its hint copy changes, because that string names the deleted row (see i18n above).
- The collapsed-panel icon button and the toolbar's reopen button (`filter-toggle-button.svelte`) are untouched; they toggle the whole panel, not sections.
