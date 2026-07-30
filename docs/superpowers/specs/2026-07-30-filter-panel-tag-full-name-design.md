# Reveal full tag names in the Filter panel

**Date:** 2026-07-30
**Discussion:** [open-noodle/gallery#881](https://github.com/open-noodle/gallery/discussions/881)
**Scope:** web only — a new `web/src/lib/actions/clamp-overflow.ts`, a new `web/src/lib/components/filter-panel/tag-filter-row.svelte`, and edits to `web/src/lib/components/filter-panel/tags-filter.svelte`, plus their tests.

## Problem

The Filter panel renders the **full hierarchical tag path**, not the leaf. `web/src/lib/utils/map-filter-config.ts:44` maps the server's `tag.value` onto `TagOption.name`:

```ts
tags: response.tags.map((t: { id: string; value: string }) => ({ id: t.id, name: t.value })),
```

`server/src/dtos/tag.dto.ts:66-67` confirms the split — `name` is `value.split('/').at(-1)`, `value` is the full path — and `search.repository.ts:795` selects `tag.value`. The same mapping exists in `recently-added-filter-config.ts:18`, `album-filter-config.ts:29`, `space-search.ts:125`, and both timeline `+page.svelte` files, so every Filter panel shows full paths.

Those labels are rendered single-line with Tailwind's `truncate` (`overflow:hidden; text-overflow:ellipsis; white-space:nowrap`) at `tags-filter.svelte:107` (orphaned rows) and `tags-filter.svelte:144` (normal rows), inside a fixed `w-64` panel (`filter-panel.svelte:675`).

The result is that end-ellipsis removes the **leaf** — the most specific, distinguishing part of the path. `Events/2024/Italy Summer Trip Rome` and `Events/2024/Iceland Winter Trip` both render as `Events/2024/I…`. This is exactly the reporter's complaint: "their distinguishing detail (dates, locations, event names) is exactly the part that gets cut off."

## Decisions

| Question                    | Decision                                                       |
| --------------------------- | -------------------------------------------------------------- |
| How to reveal the full name | Wrap to two lines (`line-clamp-2`), plus a tooltip for residue |
| Scope                       | Tags only — people/camera/location keep today's `truncate`     |
| When the tooltip appears    | Only on rows actually still clipped after two lines            |

The reporter's open question was that hover does not exist on touch. Wrapping is the answer to that: it needs no interaction at all, so mouse, touch, and keyboard users all see the same thing. The tooltip is a fallback for the residual case, not the primary mechanism.

Two lines rather than unlimited wrapping keeps the list scannable — `INITIAL_SHOW_COUNT` is 10, and unbounded wrapping of deep hierarchies would push the section arbitrarily long.

### Rejected alternatives

- **Tooltip only.** Smallest change and keeps the list dense, but delivers nothing on touch — the reporter's stated concern.
- **Start-truncation** (`…/Italy Summer Trip Rome`). Directly preserves the leaf and works on every input method, but hides the parent context and relies on a CSS direction hack.
- **Unlimited wrapping.** Simplest possible change, but a deep path can occupy three or four rows.

## Behaviour

- A tag label wraps to at most two lines. Most paths become fully visible with **zero interaction**. `/` is a UAX-14 class-SY break opportunity, so hierarchical paths wrap naturally at their separators.
- A label still clipped at two lines carries an `@immich/ui` `Tooltip` with the full name, opening on hover **and** on keyboard focus.
- A label that fits carries **no** tooltip.
- Everything else about the section — search, `Show N more`, orphaned-selection rows, selection toggling — is unchanged.

## Architecture

### Conditionality is a prop, not markup

`web/node_modules/@immich/ui/dist/components/Tooltip/Tooltip.svelte` already has the escape hatch:

```svelte
{#if text}
  <Tooltip.Root …><Tooltip.Trigger {child} />…</Tooltip.Root>
{:else}
  {@render child({ props: {} })}
{/if}
```

So "no tooltip when it fits" is expressed as `text={isOverflowing ? name : undefined}`. When the label fits, bits-ui is never instantiated and the button renders bare. `TooltipProvider` is already mounted app-wide at `web/src/routes/+layout.svelte:310`.

### Units

| Unit                                                                | Responsibility                                                                                                                                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/src/lib/actions/clamp-overflow.ts` _(new)_                     | Pure measurement. Reports `scrollHeight > clientHeight` for a node via callback. Measures on mount, on `ResizeObserver`, and on parameter update. Knows nothing about tags or tooltips. |
| `web/src/lib/components/filter-panel/tag-filter-row.svelte` _(new)_ | One row: checkbox, clamped label, conditional tooltip. Owns its own `isOverflowing` state.                                                                                              |
| `web/src/lib/components/filter-panel/tags-filter.svelte`            | Renders `<TagFilterRow>` for both the orphaned and normal lists.                                                                                                                        |

`web/src/lib/actions/` is the established home for DOM actions in this codebase (`long-press.ts`, `click-outside.ts`, `focus-trap.ts`, …), with tests in `web/src/lib/actions/__test__/`.

Per-row overflow state lives in the row component rather than an id-keyed map in the parent, because such a map's entries outlive the tags they describe (search filtering and `Show N more` continuously change which tags are mounted).

The row component also collapses two near-identical ~20-line blocks that already exist in `tags-filter.svelte`. It takes `{ id, name, checked, dimmed, onToggle }`; the orphaned list passes `checked` and `dimmed` true, the normal list passes `checked={isActive}` and `dimmed` false.

### Action contract

```ts
export interface ClampOverflowParams {
  /** Called only when the overflow verdict changes. */
  onChange: (isOverflowing: boolean) => void;
  /** Re-measure when this changes (e.g. the label text). */
  key?: unknown;
}

export function clampOverflow(node: HTMLElement, params: ClampOverflowParams): ActionReturn<ClampOverflowParams>;
```

- Measures **synchronously on mount**. This is load-bearing: the repo's `getResizeObserverMock()` has a no-op `observe`, so a measurement that only ran from the observer callback would never fire under test — and, in the browser, would leave a frame where a clipped row has no tooltip.
- Calls `onChange` only when the verdict flips, so a resize storm cannot thrash Svelte state.
- `update()` re-measures. The observer watches the node's own box, so a same-size box with different text (same tag id, renamed tag) would otherwise go undetected.
- `destroy()` disconnects the observer.
- Guards a missing `ResizeObserver` rather than throwing, so a test that forgets the global stub fails on its assertion instead of on a constructor.

### Markup detail

- `truncate` and `line-clamp-2` conflict (`white-space: nowrap` vs `display: -webkit-box`), so `truncate` is **replaced**, not supplemented.
- `{...props}` from the tooltip's `child` snippet is spread **first** on the `<button>`, with the component's own `onclick`, `aria-pressed`, and `data-testid` after it, so local attributes win. bits-ui's trigger sets pointer/focus handlers, not `onclick`.
- `data-testid="tags-item-{id}"` **must stay on the clickable button**: `e2e/src/specs/web/album.e2e-spec.ts` and `e2e/src/specs/web/spaces-filter-panel.e2e-spec.ts` click that selector.
- The row keeps `items-center`, so the checkbox centres against a two-line label.
- The label keeps `flex-1` and `text-left`.

## Test plan

Written test-first: each scenario below is committed as a failing test, confirmed red for the intended reason, then made green. Behaviour is described in Given/When/Then; the test names mirror the scenario names.

### `web/src/lib/actions/__test__/clamp-overflow.spec.ts`

Measurement is tested against a stub node with `scrollHeight`/`clientHeight` defined directly, so no layout engine is required.

| #   | Scenario                      | Given / When / Then                                                                                                                                               |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | reports overflow on mount     | Given a node whose `scrollHeight` (100) exceeds its `clientHeight` (40), when the action is applied, then `onChange(true)` is called.                             |
| A2  | reports fit on mount          | Given a node whose `scrollHeight` equals its `clientHeight`, when the action is applied, then `onChange(false)` is called.                                        |
| A3  | measures synchronously        | Given a node that overflows, when the action is applied, then `onChange` has already been called before any observer callback runs.                               |
| A4  | treats shorter content as fit | Given a node whose `scrollHeight` is **less than** its `clientHeight`, when the action is applied, then `onChange(false)` — defensive against sub-pixel rounding. |
| A5  | observes the node             | Given the action is applied, then `ResizeObserver.observe` was called with that same node.                                                                        |
| A6  | re-measures on resize         | Given a fitting node, when its `scrollHeight` grows past `clientHeight` and the observer callback fires, then `onChange(true)`.                                   |
| A7  | suppresses unchanged verdicts | Given an overflowing node, when the observer fires twice with no change in metrics, then `onChange` is called exactly once in total.                              |
| A8  | re-measures on update         | Given a fitting node, when `scrollHeight` grows and `update()` is called with a new `key`, then `onChange(true)`.                                                 |
| A9  | disconnects on destroy        | Given the action is applied, when `destroy()` is called, then `ResizeObserver.disconnect` was called.                                                             |
| A10 | tolerates a missing observer  | Given `ResizeObserver` is undefined on `globalThis`, when the action is applied, then it does not throw and still reports the mount-time verdict.                 |

### `web/src/lib/components/filter-panel/__tests__/tag-filter-row.spec.ts`

Rendered through the existing `TestWrapper.svelte` so `TooltipProvider` is in scope, with `getResizeObserverMock()` stubbed from `$lib/__mocks__/resize-observer.mock`. Overflow is simulated by defining `scrollHeight`/`clientHeight` on the element.

| #   | Scenario                          | Given / When / Then                                                                                                                                                                |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | renders the full name in the DOM  | Given a long hierarchical name, when the row renders, then the label's text content is the complete path — clipping is visual only, so screen readers already read the whole name. |
| R2  | clamps rather than truncates      | Given any row, when it renders, then the label carries `line-clamp-2` and **not** `truncate`.                                                                                      |
| R3  | keeps the e2e handle              | Given a tag with id `t1`, when the row renders, then `data-testid="tags-item-t1"` is on the element that receives the click.                                                       |
| R4  | tooltip when clipped              | Given a label whose `scrollHeight` exceeds its `clientHeight`, when the row renders, then a tooltip trigger is present carrying the full name.                                     |
| R5  | no tooltip when it fits           | Given a label whose `scrollHeight` equals its `clientHeight`, when the row renders, then no tooltip trigger is present.                                                            |
| R6  | tooltip appears on hover          | Given a clipped row, when the user hovers it, then the full name is shown in tooltip content.                                                                                      |
| R7  | tooltip appears on focus          | Given a clipped row, when it receives keyboard focus, then the full name is shown — this is the keyboard path, distinct from R6.                                                   |
| R8  | toggling still works when clipped | Given a clipped row wrapped in a tooltip, when it is clicked, then `onToggle` is called with the tag id — guards the `{...props}` spread not clobbering `onclick`.                 |
| R9  | checked state                     | Given `checked` is true, then the checkmark renders and `aria-pressed` is `"true"`.                                                                                                |
| R10 | unchecked state                   | Given `checked` is false, then no checkmark renders and `aria-pressed` is `"false"`.                                                                                               |
| R11 | dimmed variant                    | Given `dimmed` is true, then the row carries `opacity-50`.                                                                                                                         |
| R12 | unbreakable name still clipped    | Given a single very long word with no break opportunity that overflows two lines, then the tooltip is present — the case wrapping cannot solve.                                    |

### `web/src/lib/components/filter-panel/__tests__/tags-filter.spec.ts`

The 19 existing tests must keep passing; they are the regression suite for search, `Show N more`, orphaned rows, and the empty states. They currently render `TagsFilter` bare, so they move to `TestWrapper.svelte` for `TooltipProvider` scope and gain the `ResizeObserver` stub.

| #   | Scenario                         | Given / When / Then                                                                                              |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| T1  | normal rows clamp                | Given tags are listed, then each label carries `line-clamp-2` and no label carries `truncate`.                   |
| T2  | orphaned rows clamp              | Given a selected tag absent from the current results, then its orphaned row's label also carries `line-clamp-2`. |
| T3  | orphaned rows keep their styling | Given an orphaned row, then it still carries `opacity-50` and `font-medium` and renders as checked.              |
| T4  | selection survives the refactor  | Given a tag row, when it is clicked, then `onSelectionChange` receives the id — through the new row component.   |
| T5  | search survives the refactor     | Given a search query matching a subset, then only matching rows render, each still clamped.                      |

### Edge cases explicitly covered

- Label shorter than one line — no tooltip (R5).
- Label wrapping to exactly two lines — no tooltip; this is the case wrapping is meant to fix (A2/R5).
- Label exceeding two lines — tooltip (R4).
- Single unbreakable token — tooltip (R12).
- Orphaned rows, whose name falls back to `selectedNames` → `tagNameCache` → the raw id (`tags-filter.svelte:45`) and so is never empty (T2/T3).
- Tag renamed while its id is unchanged — `update()` re-measures (A8).
- Panel or viewport resize changing the verdict (A6).
- Repeated resize events not thrashing state (A7).
- Observer teardown on unmount (A9).

### Out of scope for automated tests

`scrollHeight > clientHeight` against `-webkit-line-clamp` is the standard detection technique, but happy-dom does not implement layout, so **no unit test proves that a real browser reports overflow for a clamped element**. This needs one manual check in a real browser against a tag path long enough to exceed two lines, plus a check that the tooltip does not appear for short tags. Recorded as a manual verification item, not an assumed pass.

## Not included

- No i18n strings — the tooltip content is the tag name itself.
- No server, SDK, OpenAPI, or mobile changes.
- People, camera, and location labels keep today's single-line `truncate`.
