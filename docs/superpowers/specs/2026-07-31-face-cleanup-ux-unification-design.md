# Face cleanup UX unification — design

**Date:** 2026-07-31
**Branch:** `feat/face-review-unified`
**Scope:** web only. No server, SDK, DB or mobile changes.

## 1. Problem

Three reported defects in the face cleanup console, all in the same family — the UI knows things it never
tells the admin.

1. **The landing page (`/admin/face-cleanup`) is blank above the two cards.** It carries an explanatory
   paragraph (`admin.face_cleanup_mode_first_visit_intro`) but renders it **only on a first visit**, gated on
   `firstVisit = !scan` (`web/src/routes/admin/face-cleanup/+page.svelte:80`). Every return visit — which is
   every visit after the first scan, i.e. almost all of them — shows two cards and nothing else. Nowhere does
   the console explain what problem it solves, why recognition needs a human at all, or what an admin can
   actually do to an individual face.

2. **The bulk action bar is not self-describing.** Once faces are selected, six terse buttons appear
   (`→ Owner`, `Keep here`, `Confirm / lock`, `Move → person…`, `Unknown person`, `Not a face`). The full
   explanation exists — `ActionsHelpModal` has a body and an on-apply consequence for every one of them — but
   it is behind an unlabelled `(i)` button that gives no hint it is worth pressing. An admin has to guess, and
   one of the six (`Not a face`) is irreversible.

3. **The two modes' docks are visually different components.** Guided
   (`admin/face-cleanup/[personId]/+page.svelte:942-1009`) uses `rounded-2xl`, `px-4 py-3`, `text-sm` buttons
   with `ring-1 ring-white/15 ring-inset`, a red-tinted destructive button, and an in-bar `(i)`. Manual
   (`admin/face-cleanup/people/[personId]/+page.svelte:660-726`) uses `rounded-xl`, `px-3.5 py-2.5`, `text-xs`
   buttons with `border border-white/15`, no destructive tint, and **no** `(i)` in the bar at all — its help
   launcher lives up in the grid header. The same action is also worded differently per mode (`Move → person…`
   vs `Move to…`; `Confirm / lock` vs `Lock`; `Unknown person` vs `Unknown`).

The 2026-07-23 manual-review design (§6.4) listed "the footer-dock shell" under **Reused**. In implementation
it was re-typed rather than shared, and the two copies drifted. This spec makes the intent real.

## 2. Goals / non-goals

**Goals**

- The landing page states the problem, why recognition is conservative, and what the tools let you do —
  permanently, not just on a first visit.
- Every bulk action explains itself on hover/focus, and the dock always shows what Apply will do to the
  selected faces.
- Both modes render the _same_ dock component with the same styling, and the same wording for the same action.
- One action registry behind the buttons, the tooltips and the help modal, so an explanation can never drift
  from the button it explains.

**Non-goals**

- No change to what any action _does_. No server calls change; no resolve payload changes.
- No change to the tile grid, the scan pages, the resolutions page, the People browser or `PersonPicker`.
- No new user-facing settings, no persistence of UI state.
- No docs-site page (`docs/docs/`) update — this is an admin console surface with no published guide.

## 3. Architecture

Four units, each independently testable.

```
web/src/lib/components/face-cleanup/
  face-actions.ts               (pure data — no Svelte, no i18n calls)
  FaceReviewDock.svelte         (presentation — the whole footer dock)
  FaceActionsHelpModal.svelte   (presentation — renders a registry subset)

web/src/routes/admin/face-cleanup/
  +page.svelte                            (landing page intro block)
  [personId]/+page.svelte                 (guided: consumes the dock + modal)
  [personId]/review.svelte.ts             (re-exports tokens from the registry)
  people/[personId]/+page.svelte          (manual: consumes the dock + modal)
  people/[personId]/manual-review.svelte.ts (re-exports tokens from the registry)

DELETED
  [personId]/ActionsHelpModal.svelte              + .spec.ts
  people/[personId]/ManualActionsHelpModal.svelte + .spec.ts
```

### 3.1 `face-actions.ts` — the registry

The single source of truth. Pure data, no dependency on Svelte or on either route directory.

```ts
export type FaceActionId = 'owner' | 'stay' | 'lock' | 'other' | 'unknown' | 'detach' | 'keep' | 'unmark';

export interface FaceActionMeta {
  readonly id: FaceActionId;
  /** Button label. Also the help modal's heading — one string, so they can never disagree. */
  readonly labelKey: string;
  /** One line, ≤ ~90 chars. Hover/focus popover. */
  readonly tipKey: string;
  /** Help modal: what it means / when to use it. */
  readonly bodyKey: string;
  /** Help modal "On apply:" AND the dock's inline hint row. */
  readonly effectKey: string;
  /** `undefined` for `keep`/`unmark` — neither corresponds to a coloured tile state. */
  readonly icon: string | undefined;
  readonly color: string | undefined;
  /** `danger` tints the button red. Only `detach`. */
  readonly tone: 'default' | 'danger';
}

export const FACE_ACTIONS: Readonly<Record<FaceActionId, FaceActionMeta>>;
```

`icon` and `color` carry the values that live in `review.svelte.ts` today. That file and
`manual-review.svelte.ts` keep exporting `STATE_COLOR` / `STATE_ICON` / `MANUAL_STATE_COLOR` /
`MANUAL_STATE_ICON`, now **derived from** `FACE_ACTIONS` rather than declared inline. Their existing importers
(both pages, both view-model specs) are untouched.

Direction of dependency is `lib/ ← routes/`, never the reverse.

### 3.2 `FaceReviewDock.svelte` — one dock, both halves

Owns the footer shell (`shrink-0 border-t … py-3.5`), the `max-w-screen-xl` inner row, and the
summary ↔ selected swap. Rendered through `AdminPageLayout`'s `footer` snippet by both pages, exactly as
today.

```ts
interface DockAction {
  id: FaceActionId;
  /** Preserved verbatim from each page — e2e targets these, not labels. */
  testId: string;
}

interface Props {
  selectedCount: number;
  actions: DockAction[];
  onAction: (id: FaceActionId) => void;
  onHelp: () => void;
  onClear: () => void;
  testIds: { dock: string; bar: string; clear: string; help: string; hint: string };
  tally: Snippet; // summary half — page-specific
  apply: Snippet; // summary half — page-specific
}
```

The summary half stays page-owned via snippets because the two genuinely differ: guided adds a
rest-of-cluster chip, an apply-blocked reason and an "all set" marker that manual has no concept of.

**Hover behaviour.** One `let hoveredId: FaceActionId | null = $state(null)`, set by `onmouseenter` /
`onfocusin` on each button and cleared by `onmouseleave` / `onfocusout`. It drives two renderings:

- a popover positioned above the hovered button showing `$t(FACE_ACTIONS[hoveredId].tipKey)`;
- the **hint row** at the foot of the bar: `<Label> · On apply: <effect>`, or a neutral default when nothing
  is hovered.

The popover is ~15 lines of local markup, not `@immich/ui`'s `Tooltip`. Both pages already document why they
avoid that component: it styles for the page background rather than this dark bar, and it needs a
`TooltipProvider` from the app root that isolated component specs do not have
(`people/[personId]/+page.svelte:530-532`). A local popover also shares `hoveredId` with the hint row for free.

The hint row reserves two lines (`min-h`, `line-clamp-2`) so swapping between a short and a long effect string
cannot shift the dock's height and move the buttons out from under the pointer.

### 3.3 `FaceActionsHelpModal.svelte` — one modal

```ts
interface Props {
  actions: FaceActionId[];
  introKey: string;
  footerKey: string;
  /** Renders a "(default)" badge next to this action. Manual passes `keep`; guided passes nothing. */
  defaultActionId?: FaceActionId;
  onClose: () => void;
}
```

Renders one row per id from `FACE_ACTIONS`: colour rail + icon + `labelKey` heading + `bodyKey` + an
`On apply:` block carrying `effectKey`. Rows whose meta has no `color`/`icon` (`keep`, `unmark`) render the
no-swatch treatment the manual modal has today — signalled by absence, mirroring the untouched tile.

Guided passes `['owner','stay','lock','other','unknown','detach']` with its intro/footer keys.
Manual passes `['keep','other','lock','unknown','detach','unmark']`, `defaultActionId: 'keep'`, and its own
intro/footer keys.

### 3.4 Landing page intro

Replaces the `{#if firstVisit}` paragraph with an always-rendered block between the page heading and the card
grid: a lead paragraph plus three icon rows. The last-scan chip on the right is unchanged.

## 4. Copy

### 4.1 Landing page (new keys)

| Key                                | English                                                                                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `face_cleanup_intro_lead`          | Face recognition sorts detected faces into people on its own, and it is deliberately cautious about it: a wrong assignment is far harder to untangle later than one it never made. So it leaves the doubtful calls alone rather than guessing. This page is where you make them. |
| `face_cleanup_intro_scan_title`    | A scan finds the doubtful calls                                                                                                                                                                                                                                                  |
| `face_cleanup_intro_scan_body`     | Guided cleanup re-checks the library and flags faces that resemble someone else more than the person they're filed under. It changes nothing — it just brings you the shortlist.                                                                                                 |
| `face_cleanup_intro_actions_title` | Every face is yours to route                                                                                                                                                                                                                                                     |
| `face_cleanup_intro_actions_body`  | Send a face to the person it really belongs to (or a brand-new one), park it as an unknown person, keep it where it is, lock it so no future scan questions it again, or drop it if it isn't a real face at all.                                                                 |
| `face_cleanup_intro_manual_title`  | Or audit anyone, any time                                                                                                                                                                                                                                                        |
| `face_cleanup_intro_manual_body`   | Manual review skips the scan entirely: pick any person and go through their faces yourself, with the same actions. Nothing is written until you press Apply.                                                                                                                     |

`face_cleanup_mode_first_visit_intro` becomes unreferenced and is **removed** from `en.json` and from the nine
translated locales.

### 4.2 Harmonised labels (existing keys, changed values)

| Key                                      | Was              | Now                          |
| ---------------------------------------- | ---------------- | ---------------------------- |
| `face_cleanup_review_bulk_owner`         | `→ Owner`        | `Move to owner`              |
| `face_cleanup_review_bulk_stay`          | `Keep here`      | `Keep here` (unchanged)      |
| `face_cleanup_review_bulk_lock`          | `Confirm / lock` | `Confirm & lock`             |
| `face_cleanup_review_bulk_other`         | `Move → person…` | `Move to person…`            |
| `face_cleanup_review_bulk_unknown`       | `Unknown person` | `Unknown person` (unchanged) |
| `face_cleanup_review_bulk_detach`        | `Not a face`     | `Not a face` (unchanged)     |
| `face_cleanup_manual_review_bulk_unmark` | `Unmark`         | `Unmark` (unchanged)         |

Manual's three duplicate keys collapse onto guided's and are **removed** from `en.json` and the nine locales:
`face_cleanup_manual_review_bulk_move`, `face_cleanup_manual_review_bulk_lock`,
`face_cleanup_manual_review_bulk_unknown`.

Because the changed keys already carry translations in the nine fork locales, those values are updated in the
same change — a translation of the old wording left in place would be wrong, not merely untranslated.

### 4.3 Tooltips (new keys, one per action)

`face_cleanup_action_<id>_tip` for all eight ids, one line each, e.g.

| Key                               | English                                                             |
| --------------------------------- | ------------------------------------------------------------------- |
| `face_cleanup_action_owner_tip`   | Move these to the person the scan thinks they actually are.         |
| `face_cleanup_action_stay_tip`    | These really are this person — decline the scan's suggestion.       |
| `face_cleanup_action_lock_tip`    | Pin these here permanently, so no future scan can flag them.        |
| `face_cleanup_action_other_tip`   | Pick who these belong to — anyone in the library, or a new person.  |
| `face_cleanup_action_unknown_tip` | Real faces, but not this person, and you can't name them.           |
| `face_cleanup_action_detach_tip`  | Not real faces at all. Irreversible — the crop is retired for good. |
| `face_cleanup_action_keep_tip`    | The default. An untouched face is left exactly as it is.            |
| `face_cleanup_action_unmark_tip`  | Undo — return the selection to untouched.                           |

### 4.4 Dock hint row (new keys)

| Key                                     | English                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `face_cleanup_review_bulk_hint_default` | Nothing is written until you press Apply. Hover an action to see what it will do. |
| `face_cleanup_review_bulk_hint_effect`  | `{action} · On apply: {effect}`                                                   |

New keys land in `en.json` only. This is the invariant `web/src/lib/i18n/fork-string-parity.spec.ts` states
explicitly ("new keys land in en.json alone and get translated in a later pass") and the reason that test keys
its fork-string detection on "at least one of the nine", never "all nine".

## 5. Testing

Test-first throughout: for each unit below, the listed specs are written and observed failing before the
implementation exists, and the assertions describe behaviour (what an admin sees or can do), never internal
structure. Existing suites are treated as a regression contract — no assertion is deleted to make a new
implementation pass; where a test encodes behaviour this change deliberately alters, it is rewritten to assert
the new behaviour, and that rewrite is called out per test below.

Two harness facts constrain how these are written:

- `$t` is mocked to return the **key**, so assertions match on key names, not English. Interpolated strings
  render as the bare key — a spec cannot assert on interpolated values, only on the key's presence.
- `Icon` is stubbed to a no-op component. Icon identity is not observable in a page spec; it is asserted in the
  registry spec instead.

### 5.1 `face-actions.spec.ts` (new — pure unit)

| #   | Behaviour                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Every `FaceActionId` has an entry — the record is total, so a new id cannot be added without meta.                                                                                             |
| R2  | `labelKey`, `tipKey`, `bodyKey`, `effectKey` are non-empty and distinct across actions (no accidental copy-paste of one action's explanation onto another).                                    |
| R3  | Every referenced key exists in `en.json` (reads the file, same technique as `slice-12-key-audit.spec.ts`).                                                                                     |
| R4  | The six guided ids carry both `icon` and `color`; `keep` and `unmark` carry neither.                                                                                                           |
| R5  | `detach` is the only `tone: 'danger'` action.                                                                                                                                                  |
| R6  | `move`-equivalence: manual's move action resolves to `other`, so both modes' move button renders one label key.                                                                                |
| R7  | `STATE_COLOR` / `STATE_ICON` re-exported from `review.svelte.ts` equal the registry's values for all six guided states (pins the derivation, so a future edit to one cannot silently diverge). |
| R8  | `MANUAL_STATE_COLOR` / `MANUAL_STATE_ICON` equal the registry values for `other`/`lock`/`unknown`/`detach`, preserving today's documented mapping of manual `move` → guided `other`.           |

### 5.2 `FaceReviewDock.spec.ts` (new — component)

Rendered directly with props, no page. Covers both halves and every hover path.

**Swap**

| #   | Behaviour                                                                         |
| --- | --------------------------------------------------------------------------------- |
| D1  | `selectedCount === 0` renders the `tally` and `apply` snippets and no action bar. |
| D2  | `selectedCount > 0` renders the action bar and neither snippet.                   |
| D3  | The selected count is rendered next to the `…_selected_suffix` label.             |

**Actions**

| #   | Behaviour                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D4  | One button per entry in `actions`, in the order given, each carrying its supplied `testId`.                                                                                                     |
| D5  | Each button renders its registry `labelKey`.                                                                                                                                                    |
| D6  | Clicking a button calls `onAction` once with that id, and with no other id.                                                                                                                     |
| D7  | A `tone: 'danger'` action renders visually distinct from the others (asserted on the rendered class list — the destructive button is the one place where "looks different" _is_ the behaviour). |
| D8  | `onClear` fires from the clear button; `onHelp` fires from the help button.                                                                                                                     |
| D9  | Clear and help are present regardless of which action subset is passed — this is the manual-mode gap being closed.                                                                              |

**Hover / focus**

| #   | Behaviour                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D10 | With nothing hovered, the hint row shows `…_hint_default` and no popover is rendered.                                                                                            |
| D11 | `mouseenter` on an action renders a popover carrying that action's `tipKey`.                                                                                                     |
| D12 | `mouseenter` swaps the hint row to `…_hint_effect` (the effect readout replaces the default line).                                                                               |
| D13 | `mouseleave` restores the default hint and removes the popover.                                                                                                                  |
| D14 | **Keyboard parity:** `focusin` produces the same popover and hint as `mouseenter`; `focusout` restores the default. A keyboard-only admin is never left without the explanation. |
| D15 | Moving from one action straight to another (no intervening leave) shows the second action's tip, not a stale first.                                                              |
| D16 | Exactly one popover exists at a time.                                                                                                                                            |
| D17 | The popover is `aria-hidden` and the hint row is the accessible readout, so a screen reader gets the text once, not twice.                                                       |
| D18 | Hovering the clear or help button does not change the hint row — they are not routing actions and have no effect copy.                                                           |

**Edge cases**

| #   | Behaviour                                                                                         |
| --- | ------------------------------------------------------------------------------------------------- |
| D19 | An empty `actions` array still renders the bar shell, the count, clear and help without throwing. |
| D20 | A single action renders without the divider collapsing the layout.                                |
| D21 | `selectedCount` of 1 vs many both render (no plural-only string that breaks at 1).                |
| D22 | An action whose meta has no icon (`unmark`) renders label-only, without an empty icon slot.       |

### 5.3 `FaceActionsHelpModal.spec.ts` (new — replaces two deleted specs)

Every assertion from `ActionsHelpModal.spec.ts` and `ManualActionsHelpModal.spec.ts` is carried over, re-aimed
at the merged component under the mode that used to own it. Both modes are exercised in the same file.

| #   | Behaviour                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Guided subset names exactly its six actions, reusing the bulk-bar label keys (from `ActionsHelpModal.spec.ts`).                                                   |
| H2  | Manual subset names exactly its six: Keep (default), Move to person…, Confirm & lock, Unknown person, Not a face, Unmark (from `ManualActionsHelpModal.spec.ts`). |
| H3  | Every rendered action explains its meaning (`bodyKey`) and its consequence (`effectKey`) — asserted for both subsets.                                             |
| H4  | `defaultActionId` renders the "(default)" badge on exactly that action, and no badge at all when the prop is omitted.                                             |
| H5  | Actions with a colour render a swatch; `keep` and `unmark` render the no-swatch element.                                                                          |
| H6  | The destructive action's body warns it is irreversible and points at `unknown` as the opposite case.                                                              |
| H7  | Intro and footer render from the passed keys, so the two modes' different framing survives the merge.                                                             |
| H8  | Closes via the close button.                                                                                                                                      |
| H9  | Row order follows the `actions` array, not the registry's declaration order.                                                                                      |
| H10 | Passing an empty subset renders intro and footer without throwing.                                                                                                |

### 5.4 Landing page — `page.spec.ts` (amended)

| #   | Behaviour                                                                                                        | Status                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| L1  | The intro lead renders on a first visit.                                                                         | **rewritten** — was asserting `…_first_visit_intro`; now asserts `face_cleanup_intro_lead`.                                        |
| L2  | The intro lead **also** renders on a return visit with a completed scan.                                         | **inverted** — `page.spec.ts:151` currently asserts the intro is _absent_ here. That assertion encodes the defect and is replaced. |
| L3  | The intro renders in all five scan states (none / pending / running / failed / completed) — it is unconditional. | new                                                                                                                                |
| L4  | All three point rows render, each with its title and body.                                                       | new                                                                                                                                |
| L5  | The intro sits before the card grid in DOM order, so it is read first.                                           | new                                                                                                                                |
| L6  | Every existing card/CTA assertion still passes untouched.                                                        | regression                                                                                                                         |

### 5.5 Guided page — `[personId]/page.spec.ts` (amended)

All existing bulk-action, apply, destructive-confirm, destination and rest-of-cluster tests stay as they are:
they target `data-testid`s (`bulk-stay`, `bulk-lock`, `bulk-other`, `bulk-unknown`, `bulk-detach`, `clear`,
`bulk-help`, `bulk-bar`, `dock`, `apply-btn`, `tally`), every one of which the dock preserves. Added:

| #   | Behaviour                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------- |
| G1  | Hovering a bulk action shows its tip and its on-apply effect, wired through the real page.                                 |
| G2  | The help modal opened from the bulk bar names all six guided actions (proves the page passes the right subset).            |
| G3  | The help modal opened from the review banner and the one opened from the bulk bar are the same modal with the same subset. |

### 5.6 Manual page — `people/[personId]/page.spec.ts` (amended)

Existing tests keep their testids (`manual-review-bulk-move`, `-lock`, `-unknown`, `-detach`, `-unmark`,
`-clear`, `-bar`, `manual-review-dock`, `manual-review-apply-btn`, `manual-review-tally-*`). Added:

| #   | Behaviour                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------- |
| M1  | The bulk bar now carries a help button, and it opens the merged modal with manual's subset.                                   |
| M2  | The header help launcher and the new in-bar help open the same modal with the same subset.                                    |
| M3  | Hovering a bulk action shows its tip and effect.                                                                              |
| M4  | Manual's move button renders the same label key as guided's `other` button — the harmonisation, asserted rather than assumed. |

### 5.7 i18n guards

| #   | Behaviour                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | `slice-12-key-audit.spec.ts` passes unchanged: both pages still reference at least one `$t` key directly, and every key they reference exists in `en.json`.                                                                                                                                                          |
| I2  | No web or mobile source references the four removed keys (`…_first_visit_intro`, `…_manual_review_bulk_move`, `…_manual_review_bulk_lock`, `…_manual_review_bulk_unknown`). Extend `slice-12-key-audit.spec.ts`'s removed-key scan, or add the equivalent guard alongside it.                                        |
| I3  | `fork-string-parity.spec.ts` passes: the removed keys are gone from all nine locales too, not just `en.json`.                                                                                                                                                                                                        |
| I4  | `placeholders.spec.ts` passes. It compares a locale's placeholders against `en.json`'s, so the one new interpolated key (`…_hint_effect`, carrying `{action}` and `{effect}`) is inert until translated — but the guard becomes load-bearing on that later pass, and the argument names are chosen now to be stable. |
| I5  | `face-cleanup-plurals.spec.ts` passes — no new plural forms are introduced.                                                                                                                                                                                                                                          |

### 5.8 E2E

`e2e/src/specs/web/face-cleanup.e2e-spec.ts` and `face-review-cross-engine.e2e-spec.ts` target `data-testid`
only and must pass **unmodified**. That is the acceptance signal for the dock swap: if any testid moved, they
fail. No new e2e is added — the change is presentational and the existing X1 test already drives every bulk
action through the bar to a resolve payload.

### 5.9 Manual verification

Not automatable, checked by hand on the dev stack before the branch is called done:

- Popover placement at the start and end of the bar (does not clip at the viewport edge), and on a wrapped
  two-row bar at a narrow width.
- Light and dark theme on both docks and the intro block.
- Hint row does not shift the dock height when swapping between the shortest and longest effect string.
- Touch: with no hover available, the hint row and the `(i)` modal still carry the full explanation.

## 6. Risks

| Risk                                                                         | Mitigation                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A moved `data-testid` breaks e2e silently in a suite that isn't run locally. | Testids are props on the dock, enumerated per page; §5.8 requires the e2e specs to pass unmodified.                                                                                                                       |
| Merging two help modals loses an assertion one of them made.                 | §5.3 carries over every case from both deleted specs by name; the deletions happen in the same commit as the merged spec.                                                                                                 |
| Changing English label values leaves stale translations in nine locales.     | §4.2 updates them in the same change.                                                                                                                                                                                     |
| The popover reimplements a tooltip.                                          | Deliberate and scoped: ~15 lines, dark-surface styling, no `TooltipProvider` dependency, shares `hoveredId` with the hint row. Recorded here so a later reader does not "fix" it by swapping in `@immich/ui`'s `Tooltip`. |
| The hint row makes the dock taller and pushes grid content up.               | Two reserved lines with `line-clamp-2`; the dock is a layout footer, not overlaid on the grid.                                                                                                                            |

## 7. Out of scope / follow-ups

- Translating the new `en.json` keys into the nine fork locales — a later pass, per the parity test's stated
  invariant.
- Unifying the two view-models (`review.svelte.ts` / `manual-review.svelte.ts`). The 2026-07-23 design §6.5
  argues they are genuinely different state machines; nothing here changes that assessment.
- Unifying the summary halves of the two docks. Guided's rest-of-cluster chip, blocked reason and "all set"
  marker have no manual equivalent, so they stay page-owned snippets.
