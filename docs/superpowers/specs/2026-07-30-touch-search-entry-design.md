# Touch search entry + `/` shortcut

Fixes [#862](https://github.com/open-noodle/gallery/issues/862) — the `Ctrl+K` search hint has no
touch equivalent on iPad/iPhone — and adds `/` as a second way to open the palette.

## Problem

The nav bar search field renders a `<kbd>` chip reading `Ctrl+K` (or `⌘K` on Apple platforms) at
every viewport ≥640px. On a keyboardless iPad the chip advertises a shortcut that cannot be typed,
and the chip itself is decorative — not a button.

The palette is in fact reachable by touch today:

- below 640px a magnify `IconButton` in `NavigationBar.svelte` opens the modal palette;
- at 640px and above, tapping the search field focuses it, and `onfocus` opens the inline dropdown.

So the defect is the affordance, not raw reachability. Two things make the tap path poor on a
tablet: the inline dropdown is cramped, and focusing a real `<input>` raises the iOS soft keyboard,
which covers the dropdown it just opened.

Separately, we want `/` to open search, matching the GitHub/Gmail/Slack convention.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | On touch, tapping the search bar opens the **modal** palette, not the inline dropdown | Full-height below 640px, large centred card above; no soft-keyboard occlusion |
| 2 | `/` **replaces** the existing `/` → Explore binding | `/` = search is the near-universal convention; Explore stays reachable from the sidebar |
| 3 | `/` opens the **same modal palette** `Ctrl+K` opens | One surface, one documented behaviour, works where the nav bar is hidden |
| 4 | Touch is detected **per event** via `PointerEvent.pointerType` | Exact per-interaction; an iPad user gets the modal by finger and the dropdown by trackpad |
| 5 | The `<kbd>` chip is **hidden** when `pointer: coarse` | Removes the misleading hint; the whole bar becomes the tap target |
| 6 | The iPad modal keeps its **current large centred size** | Already comfortable, needs no new CSS; full-bleed styling can follow if it reads cramped |
| 7 | Chip visibility uses `{#if}` on `mediaQueryManager.pointerCoarse`, not a CSS media query | jsdom does not evaluate CSS media queries, so `{#if}` is the testable form |

Decision 7 costs a one-frame flash: `MediaQuery` has no SSR value, so the chip renders during SSR
and is removed on hydration. Accepted in exchange for real assertions.

Decision 4 covers `pointerType === 'touch'` only. `'pen'` keeps the dropdown — an Apple Pencil tap
on a tablet arguably wants the modal too, but a Surface pen paired with a keyboard does not, and pen
input on this surface is rare. Pinned by test so the choice is deliberate rather than incidental.

## Behaviour

| Interaction | Before | After |
|---|---|---|
| Tap nav search bar (finger) | focus → inline dropdown, soft keyboard covers it | **modal palette**, no soft keyboard |
| Click nav search bar (mouse / trackpad / pen) | inline dropdown | unchanged |
| Tab to nav search bar | inline dropdown | unchanged |
| `Ctrl+K` / `⌘K` | modal palette | unchanged |
| **`/`** | go to Explore | **modal palette** |
| **`/` on layouts where `/` needs Shift** | dead | **modal palette** |
| `Ctrl+/` | cycle search mode | unchanged |
| `?` | shortcuts modal | unchanged |
| Magnify button below 640px | modal palette | unchanged |
| `Ctrl+K` chip shown | always ≥640px | only when `pointer: coarse` is false |

## Implementation

### `web/src/lib/components/global-search/global-search.svelte`

Both edits sit in the `variant === 'dropdown'` branch.

**Route touch taps to the modal.** `Command.Input` (~L631) gains an `onpointerdown` handler: when
`event.pointerType === 'touch'`, call `event.preventDefault()` and `manager.open('modal')`.

The `preventDefault()` is load-bearing for two reasons, and both belong in a code comment:

- it suppresses the focus that would otherwise fire `onfocus={openDropdown}`, which calls
  `manager.open('dropdown')` and clobbers `presentation` straight back to `'dropdown'`;
- it stops iOS raising the soft keyboard against an input that is about to be covered by the modal.

**Hide the chip on coarse pointers.** Wrap the `<kbd>` block (L652–656) in
`{#if !mediaQueryManager.pointerCoarse}`. `mediaQueryManager` is already imported at L24. The
existing `hidden … sm:inline-block` classes stay, so sub-640px behaviour is unchanged.

### `web/src/routes/+layout.svelte`

Add two entries to the existing `use:shortcuts` array, both calling the existing `openModalSearch()`:

```js
{ shortcut: { key: '/' }, onShortcut: openSearchFromSlash },
{ shortcut: { key: '/', shift: true }, onShortcut: openSearchFromSlash },
```

Reusing `openModalSearch()` inherits its feature-flag guard and `toggle('modal')` semantics.

**Why two bindings.** `matchesShortcut` in `@immich/ui` compares modifiers strictly:
`Boolean(shortcut.shift) === event.shiftKey`. On German QWERTZ, Spanish and Italian layouts `/` is
Shift+7; on AZERTY it is Shift+:. All emit `event.key === '/'` with `shiftKey: true`, so a lone
`{ key: '/' }` never matches and the shortcut is dead for those users. There is no collision with
`?`: on US layouts Shift+/ emits `event.key === '?'`, so the shift variant only fires on layouts
where Shift genuinely produces `/`.

**Why a wrapper rather than `openModalSearch` directly.** `@immich/ui`'s `shouldIgnoreEvent` skips
shortcuts only for `type` in `textarea, text, date, datetime-local, email, password`. It misses
`type="search"` — used by `space-albums-controls.svelte:108` — so typing `/` in the space album
filter would open the palette instead of inserting the character. `type="number"` (6 uses) is
uncovered too. `openSearchFromSlash` bails when `document.activeElement` is an editable element
(`input`, `textarea`, `select`, or `[contenteditable]`) and otherwise delegates to
`openModalSearch()`. The app has no `contenteditable` today; including it keeps the guard correct if
one appears.

`Command.Input` renders `type="text"`, so `/` typed into the palette itself is already ignored by
the built-in guard; the wrapper reinforces it rather than changing it.

### Upstream files — remove `/` → Explore

- `web/src/lib/components/shared-components/gallery-viewer/GalleryViewer.svelte:274` — delete the
  binding. `goto` and `Route` each have another use in the file, so imports stay. One-line diff.
- `web/src/lib/components/timeline/actions/TimelineKeyboardActions.svelte:119` — delete the binding
  **and** the now-unused `goto` (L2) and `Route` (L17) imports, or lint fails. Three-line diff.

Both are upstream files; the diffs are pure deletions, which rebase cleanly.

### `web/src/lib/modals/ShortcutsModal.svelte`

Add `{ key: ['/'], action: $t('shortcut_open_global_search') }` beside the existing `Ctrl+K` row.
Reusing the existing i18n key means no new strings across the locale files. `/` → Explore was never
documented, so nothing is removed.

## Behaviour change worth naming

`/` → Explore was suppressed while the asset viewer was open (`TimelineKeyboardActions` returns an
empty shortcut list when `assetViewerManager.isViewing`). The new `/` binding lives at the layout
level, so it fires over the asset viewer as well. This matches `Ctrl+K`, which is already global, so
the two aliases stay consistent. Pinned by test.

## Test plan

TDD throughout: every test below is written first and observed failing for the intended reason
before the corresponding implementation lands. Tests are named as behaviour statements
(`it('opens the modal palette when the search bar is tapped')`).

### `global-search-input-trigger.spec.ts` — pointer routing

Extends the existing suite, which already asserts click → dropdown.

| Scenario | Expected |
|---|---|
| Finger tap (`user.pointer({ keys: '[TouchA]', target: input })`) | `open` called with `'modal'`; no `[data-cmdk-dropdown-panel]` in the DOM |
| Finger tap | the pointerdown event's default is prevented (`defaultPrevented === true` on a dispatched event) |
| Mouse click | `open` called with `'dropdown'`; panel present (regression guard for decision 4) |
| Pen input (`pointerType: 'pen'`) | dropdown, not modal (pins decision 4's scope) |
| `pointerType` absent/empty (synthetic event) | falls through to dropdown |
| Keyboard focus via Tab, no pointer event | dropdown, on touch-capable devices too |
| Tap while the dropdown is already open | ends in `presentation === 'modal'`, opened once |
| Tap, close modal, tap again | reopens the modal; no stuck presentation state |

### `global-search-input-trigger.spec.ts` — chip visibility

`mediaQueryManager.pointerCoarse` is a getter, stubbed per test.

| Scenario | Expected |
|---|---|
| `pointerCoarse` true | no `<kbd>` in the DOM |
| `pointerCoarse` false | `<kbd>` present |
| `pointerCoarse` false, non-Apple platform | reads `Ctrl+K` |
| `pointerCoarse` false, Apple platform | reads `⌘K` |
| Either value | input keeps `role="combobox"` and its accessible name — the chip is not part of the name |

### `/` shortcut

| Scenario | Expected |
|---|---|
| `/` with no modifiers, nothing focused | `openModalSearch` called |
| `/` with `shiftKey: true` (QWERTZ/AZERTY) | `openModalSearch` called |
| `?` (US Shift+/, `event.key === '?'`) | shortcuts modal opens; palette does not |
| `Ctrl+/` | cycles search mode; palette does not open |
| `/` while an `<input type="text">` is focused | no palette; character inserted |
| `/` while an `<input type="search">` is focused | no palette (the gap `shouldIgnoreEvent` misses) |
| `/` while a `<textarea>` is focused | no palette |
| `/` while a `[contenteditable]` is focused | no palette |
| `/` while the palette modal is open and its input focused | no toggle; character typed into the query |
| `/` with the `search` feature flag off | no-op, no throw |
| `/` with feature flags not yet loaded | no-op, no throw (`valueOrUndefined` path) |
| `/` while the asset viewer is open | palette opens (documents the intended change above) |

### Regression

- `Ctrl+K` and `⌘K` still open the modal on their respective platforms.
- Explore is no longer reachable by `/` on the timeline or in the gallery viewer.
- `svelte-check` and `tsc --noEmit` clean — catches the unused `goto` / `Route` imports.

Verification runs `pnpm test` in `web/`, plus `make check-web` and `make lint-web`.

No Playwright coverage: `e2e/playwright.config.ts` defines only `Desktop Chrome` projects, and
standing up a touch project for one interaction is not proportionate. The tap path is fully covered
by the unit tests above.

## Out of scope

- Full-bleed modal styling on tablets (decision 6).
- Rewriting `@immich/ui`'s `shouldIgnoreEvent`; the local `openSearchFromSlash` guard covers the `/`
  binding without patching a dependency.
- Extending the shift-variant fix to other bare-key shortcuts (`f`, `i`, `x`, `g`, …), which have
  the same layout sensitivity. Pre-existing, unrelated to #862.
- The sub-640px magnify button, which already works.

## Risks

| Risk | Mitigation |
|---|---|
| Users relying on `/` → Explore lose it | Sidebar entry unchanged; `/` = search is the stronger convention |
| One-frame chip flash on touch after hydration | Accepted for testability; swap to a CSS variant if it proves visible |
| `preventDefault()` on pointerdown blocks focus more broadly than intended | Guarded to `pointerType === 'touch'`; mouse, pen, and keyboard paths each covered by test |
| Upstream edits conflict on rebase | Pure deletions in two files, three lines total |
