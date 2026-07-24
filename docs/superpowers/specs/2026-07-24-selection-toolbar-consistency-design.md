# Selection-toolbar consistency for Shared Spaces (web)

- **Discussion:** [open-noodle/gallery#839](https://github.com/open-noodle/gallery/discussions/839)
  — "Inconsistent selection toolbar across timelines (missing in Shared Space timeline/albums)"
- **Date:** 2026-07-24
- **Scope:** web only (`web/`). Mobile is a deliberate follow-up (see Out of scope).
- **Status:** design approved; implementation sliced for `impl-loop`.

## Problem

When a user multi-selects assets, the action toolbar that appears differs by surface:

- **Personal timeline & regular albums** — full toolbar (Share, Select-all, Add-to-album,
  Favorite, Download, and a context menu of edits/tags/delete).
- **Shared Space timeline & space person** — reduced: Select-all, Remove-from-space (editor),
  Favorite (own), Download + a partial context menu. No Share, no Add-to-album.
- **Shared Space albums** — gutted: only Download and (for managers) Remove-from-album. No
  Select-all, no Favorite, no context menu at all.

A space member therefore "loses access to basic actions simply because they're browsing through a
Shared Space." A viewer inside a space album bottoms out at a single Download icon.

### Root cause

`web/src/lib/components/timeline/AssetSelectControlBar.svelte` is a thin wrapper that renders
whatever `children` a page passes into its `trailing` snippet. There is **no shared source of truth**
for "which actions apply." Each of the five selection surfaces hand-wires its own list of action
components, so they drifted apart:

| Surface                                                           | Renders                         | Provenance |
| ----------------------------------------------------------------- | ------------------------------- | ---------- |
| `routes/(user)/photos/…/+page.svelte`                             | full list                       | upstream   |
| `routes/(user)/albums/[albumId]/…/+page.svelte`                   | full list (+ Remove-from-album) | upstream   |
| `routes/(user)/spaces/[spaceId]/…/+page.svelte`                   | reduced list                    | **fork**   |
| `routes/(user)/spaces/[spaceId]/people/[personId]/…/+page.svelte` | reduced list                    | **fork**   |
| `routes/(user)/spaces/[spaceId]/albums/[albumId]/…/+page.svelte`  | Download + Remove only          | **fork**   |

The fork already has a **unified capability model** for the ⌘K command palette
(`command-context-manager.svelte.ts` → `CommandContext` with album/space/selection sub-contexts and
per-item `isAvailable(ctx)` predicates in `command-items.ts`). The bulk toolbar is the one selection
surface that ignores it.

## Goal / guiding principle

**The regular shared album is the reference model.** Give every user, on every space surface,
exactly the actions they would have on the same assets in a regular shared album — same per-action
gates — mapping **space role → album role** (Owner/Editor/Viewer), with **Remove-from-space**
substituted for **Remove-from-album** on the direct-space surfaces (space timeline / space person).

"Consistent by rule": an action appears whenever the same conditions hold (surface + role +
ownership + asset state). Differences survive **only** where a real permission constraint forces them.
No surface hides an action it is allowed to show.

## Reference model — what a shared album grants today

From `albums/[albumId]/…/+page.svelte:734-780` (the untouched reference):

| Action                                                                                           | Gate in a shared album                                                    |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Download                                                                                         | **Unconditional** — you can download a photo another user shared with you |
| Select-all                                                                                       | Unconditional                                                             |
| Create-shared-link (Share)                                                                       | Unconditional¹                                                            |
| Add-to-album                                                                                     | Unconditional¹                                                            |
| Favorite                                                                                         | Own assets only (`isAllUserOwned`)                                        |
| Edit metadata: Rotate, Change date, Change description, Change location, Archive, Set-visibility | Own assets only                                                           |
| Tag                                                                                              | Own assets only, and tags preference enabled                              |
| Set-as-cover                                                                                     | Album editor (owner/editor role), single selection                        |
| Remove-from-album                                                                                | Album owner (`isOwned`) **or** own assets                                 |
| Delete                                                                                           | Own assets only                                                           |

¹ The album renders these buttons unconditionally; whether the **server** honours a
create-shared-link / add-to-album call for a _non-owned_ asset is pinned by the API RBAC matrix
(Slice 6). Whatever the album's real behaviour is, spaces mirror it — see the Share/Add-to-album note
under Capability rules.

We deliberately mirror the **album's** metadata set (Rotate + date/description/location + Archive +
Set-visibility), **not** the personal timeline's richer set (Stack, Link-live-photo, and library job
actions). Those are personal-library operations that do not belong inside a shared space.

## Non-goals / Out of scope (YAGNI)

- **Mobile (iOS/Android).** The discussion notes the mobile app diverges too. It is a separate
  codebase (Flutter/Riverpod) and a separate spec that will reuse these capability rules conceptually.
- **Refactoring the upstream `photos` and `albums` pages onto the shared toolbar.** They are the
  reference and already correct; patching two of Immich's hottest files buys recurring rebase
  conflicts for no user-visible gain. They stay untouched. (A parity guard test — Slice 1 — protects
  against silent drift if upstream restructures the album toolbar.)
- **New actions** beyond the album model (no Stack / Link-live-photo / library jobs in spaces).
- **Changing the ⌘K command palette itself.** We reuse its context; we do not alter its items.
- **Trashed-asset actions (restore/permanent-delete).** Space timelines do not surface trash;
  `isAllTrashed` selections are not a reachable state here.

## Architecture

Two new fork files, one rule set, **zero upstream edits**. The toolbar's upstream action components
(`DownloadAction`, `FavoriteAction`, `AssetSelectControlBar`, …) are imported and rendered, never
modified — rebase-safe.

### 1. `getSelectionCapabilities(ctx: CommandContext): SelectionCapabilities` — the rule engine

New pure fork module (proposed: `web/src/lib/managers/selection-capabilities.ts`). Consumes the
`CommandContext` the fork already assembles (`commandContextManager.getContext()`), returns one
struct of booleans. It encodes the album model **once**; because it reads `ctx.album` / `ctx.space`,
it yields the album answer in album context and the mirrored answer in space context.

```ts
export interface SelectionCapabilities {
  canSelectAll: boolean;
  canDownload: boolean;
  canShare: boolean; // CreateSharedLink
  canAddToAlbum: boolean;
  canFavorite: boolean;
  canEditMetadata: boolean; // Rotate, ChangeDate/Description/Location, Archive, SetVisibility
  canTag: boolean;
  canDelete: boolean;
  canSetCover: boolean;
  canRemoveFromAlbum: boolean;
  canRemoveFromSpace: boolean;
}
```

Surface discriminators derived from `ctx` (no new signal needed):

```
sel            = ctx.selection            // null ⇒ no toolbar rendered at all
inAlbum        = ctx.album !== null
inSpace        = ctx.space !== null
isRegularAlbum = inAlbum && !inSpace
isDirectSpace  = inSpace && !inAlbum      // space timeline & space person
isSpaceAlbum   = inAlbum && inSpace
isPersonal     = !inAlbum && !inSpace
```

Predicates (the single rule set):

```
canSelectAll       = sel !== null
canDownload        = true
canShare           = true            // mirror album (see Share/Add-to-album note)
canAddToAlbum      = true            // mirror album
canFavorite        = sel.isAllUserOwned
canEditMetadata    = sel.isAllUserOwned
canTag             = sel.isAllUserOwned && tagsEnabled
canDelete          = sel.isAllUserOwned
isEditorOfContext  = isRegularAlbum ? (ctx.album.isOwner || ctx.album.isEditor)
                   : isDirectSpace  ? ctx.space.canWrite
                   : isSpaceAlbum   ? (ctx.space.canWrite || ctx.album.isEditor)   // == canManage
                   : /* personal */   false
canSetCover        = isEditorOfContext && sel.selectedAssetIds.length === 1 && !isPersonal
canRemoveFromAlbum = isRegularAlbum ? (ctx.album.isOwner || sel.isAllUserOwned)
                   : isSpaceAlbum   ? (ctx.space.canWrite || ctx.album.isEditor)
                   : false
canRemoveFromSpace = isDirectSpace && ctx.space.canWrite
```

**Orthogonality invariant (critical):** _space role_ (Owner/Editor/Viewer, from
`ctx.space.canWrite`/`isOwner`) and _asset ownership_ (`sel.isAllUserOwned`, i.e.
`asset.ownerId === userId`) are independent axes. A space **Owner** viewing **another member's**
asset must NOT get owner-gated actions (they don't own the asset); a space **Viewer** who happens to
own the selected asset DOES get them. Every owner-gated capability keys off `isAllUserOwned`, never
off space role, and vice-versa.

**Context extension (fork files only):** `AlbumContext` currently exposes `isOwner` but not
`isEditor`. Add `isEditor` to `AlbumContext` and compute it in `registerAlbumContext` from
`album.albumUsers` (mirrors the existing `isAlbumEditor` derivation in the space-album page). This is
a fork file (`command-context-manager.svelte.ts`), so it is rebase-safe. `SpaceContext.canWrite`
(owner||editor) already exists.

### 2. `<SelectionToolbar>` component

New fork component (proposed:
`web/src/lib/components/timeline/SelectionToolbar.svelte`). Responsibilities:

- Wrap the upstream `<AssetSelectControlBar>`.
- Own the `<CommandPaletteDefaultProvider>` + `getAssetBulkActions($t)` block (today only
  personal/album pages render it; spaces must too, so Add-to-album registers).
- Compute `caps = getSelectionCapabilities(commandContextManager.getContext())` reactively and render
  the album-page layout — top row (Share, Select-all, Add-to-album, Favorite) + overflow
  `ButtonContextMenu` (Download, metadata edits, Set-cover, Tag, Remove-from-album/space, Delete) —
  each action wrapped in `{#if caps.canX}`.

**Separation of concerns:** capabilities decide _what to show_; the page passes a typed props bundle
for _what to do_. Proposed props:

```ts
interface SelectionToolbarProps {
  timelineManager: TimelineManager;
  assetInteraction: AssetInteraction; // the assetMultiSelectManager singleton
  album?: AlbumResponseDto; // present on album surfaces (for Remove-from-album, download filename)
  spaceId?: string; // present on direct-space surfaces (for Remove-from-space)
  downloadFilename?: string;
  onRemove?: (ids: string[]) => void; // remove-from-album / remove-from-space result handler
  onSetCover?: () => void; // per-surface cover setter (album cover vs space cover)
  onFavorite?: OnFavorite; // defaults to timelineManager.update
  onArchive?: OnArchive;
  onDelete?: OnDelete;
}
```

The component never decides permissions from props — only `getSelectionCapabilities` does. Props that
correspond to a disabled capability are simply never reached.

### 3. Space page integration

Each of the three fork space routes replaces its bespoke control-bar block with a single
`<SelectionToolbar {...} />` and flips its `registerSelectionContext({ canAddToAlbum: () => false })`
to `true` (so the ⌘K palette stays consistent with the toolbar). Net result per surface:

| Surface        | Before                                                           | After                                                                                        |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Space album    | Download + Remove-from-album only                                | Full album-equivalent toolbar; Remove-from-album gated `canManage`; **no** Remove-from-space |
| Space timeline | Select-all, Remove-from-space, Favorite, Download + partial menu | Full album-equivalent; adds Share, Add-to-album, Rotate, Set-visibility, Delete, Set-cover   |
| Space person   | same as space timeline                                           | same as space timeline                                                                       |

## RBAC safety invariants & verifications

Reversing the deliberate space-album strip (`rbac-5/albums-8` comment at
`spaces/[spaceId]/albums/…/+page.svelte:405-411`) is safe because:

1. **Every cross-owner mutation stays behind `isAllUserOwned`.** Favorite/metadata/Tag/Delete fire
   only when the whole selection is the current user's own assets → owner-path → the server always
   permits it, regardless of album-path. The concern the review closed — a space _editor_ editing
   _another member's_ album-path asset — is a capability the album model never offers, so mimicking
   the album never re-opens it. `checkSpaceEditAccess`'s album-arm omission and its guard
   (`shared-space-album-scope.guard.spec.ts`) remain valid and untouched.
2. **Editor/owner-role actions** (Set-cover, Remove-from-album/space) are gated by container role and
   independently enforced server-side.
3. **Share / Add-to-album** mirror the album (see note below); the server is the enforcement point.

Two things are **verified by tests, not assumed**:

- **V1 — `TimelineAsset.ownerId` is correct on space-projected assets.** The entire owner-gate rests
  on it. If ownerId were wrong/absent on the merged space timeline or space album, owner-gated
  actions could appear on non-owned assets. Asserted by the web e2e owner/other cases (Slice 5) and,
  if needed, a focused unit check.
- **V2 — owner-scoped Share / Add-to-album / edit / delete endpoints accept space-accessed asset
  IDs and enforce ownership/role.** Proven by the server/API RBAC matrix (Slice 6).

### Share / Add-to-album note

The capability defaults to unconditional (mirror the album). Slice 6 pins the **actual** server
behaviour for a non-owned asset:

- If the server **owner-scopes** create-shared-link and/or add-to-album (rejects non-owned), then to
  keep the toolbar honest we gate those two capabilities by `sel.isAllUserOwned` — which on the
  personal timeline and regular album is always true, so those reference surfaces are unaffected,
  and in a space the button appears only for your own selected assets. This is still "mimic album":
  identical rule, made explicit.
- If the server permits it (as the album UI implies), they stay unconditional.

Either way the toolbar never offers a button the server would 400 — that equivalence is the property
Slice 6 guarantees.

## Testing strategy (TDD + BDD)

TDD throughout: for every slice, write the failing test(s) first, watch them fail for the right
reason, then implement to green. Tests are written as BDD scenarios (Given/When/Then). RBAC coverage
is exhaustive on the pure rule engine (cheap) and representative on e2e (expensive).

### Layers

- **a. Unit — capability matrix (core + parity guard):** `getSelectionCapabilities` over the full
  cross-product `{personal, regular-album, space-timeline, space-album} × {owner, editor, viewer} ×
{all-owned, mixed, none-owned} × {single, multi}`, plus asset-state axes (all-favorite,
  all-archived, tags on/off). Includes the **parity assertion**: for equivalent role+ownership, the
  space capability set equals the album capability set with one substitution — on **direct-space**
  surfaces (space timeline/person) `canRemoveFromAlbum` is replaced by `canRemoveFromSpace`; on a
  **space album** the set matches the album exactly (`canRemoveFromAlbum` via `canManage`). This is
  what fails CI if upstream restructures the album toolbar.
- **b. Component — `<SelectionToolbar>`:** given a capability set, renders exactly the permitted
  buttons and no others (reuse the `register-selection-context-harness.svelte` pattern). Asserts
  the ⌘K provider is present so Add-to-album registers.
- **c. Web e2e RBAC matrix (Playwright):** new spec mirroring `spaces-albums-timeline.e2e-spec.ts`,
  driving the real UI and asserting toolbar visibility via `page.locator('#control-bar')` +
  `getByLabel` / `data-testid`.
- **d. Server/API RBAC matrix (supertest):** `buildSpaceContext()` + `forEachActor()` proving the
  underlying endpoints enforce owner/role rules for space-accessed asset IDs (backs V2, and pins the
  Share/Add-to-album behaviour that decides the capability gate).
- **e. Keep green:** `command-items.spec.ts`, `selection-command-handlers.spec.ts`,
  `shared-space-album-scope.guard.spec.ts`, `selection-command-page-boundaries.spec.ts`,
  `archive-page.spec.ts`.

### RBAC edge-case catalogue (must all be covered — unit at minimum)

| #   | Scenario                                                                     | Expected                                                                                                                |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| E1  | Space **viewer** selects an owner's (not their) asset — space timeline       | Select-all, Download, Share, Add-to-album ✓; Favorite/edit/Tag/Delete ✗; Remove-from-space ✗; Set-cover ✗               |
| E2  | Space **editor** selects their **own** asset — space timeline                | all of E1 ✓ + Favorite/edit/Tag/Delete ✓ + Remove-from-space ✓ + Set-cover ✓ (if single)                                |
| E3  | Space **editor** selects an owner's (not their) asset                        | E1 ✓ + Remove-from-space ✓ + Set-cover ✓; Favorite/edit/Tag/Delete ✗                                                    |
| E4  | Space **owner** selects **another member's** asset                           | Remove-from-space ✓, Set-cover ✓ (role); Favorite/edit/Delete ✗ (**not** the asset owner) — the orthogonality invariant |
| E5  | Space **viewer** who is the space album's **album-editor**, in a space album | Remove-from-album ✓ (canManage via `isAlbumEditor`) even though space viewer                                            |
| E6  | Space **editor**, not an album member, in a space album                      | Remove-from-album ✓ (canManage via `isSpaceEditor`)                                                                     |
| E7  | **Mixed** selection (some owned, some not)                                   | owner-gated all ✗ (`isAllUserOwned` false); always-set ✓                                                                |
| E8  | **Multi** selection                                                          | Set-cover ✗ (single only); everything else per role/ownership                                                           |
| E9  | All-favorite selection                                                       | Favorite renders as "remove from favorites"; else "favorite"                                                            |
| E10 | All-archived selection                                                       | Archive renders as "unarchive"; else "archive"                                                                          |
| E11 | Tags preference disabled                                                     | Tag ✗ even when `isAllUserOwned`                                                                                        |
| E12 | Empty selection                                                              | toolbar not rendered (`sel === null`)                                                                                   |
| E13 | Space **non-member** hits a space URL                                        | cannot reach the page (existing visibility specs); toolbar N/A — cross-referenced, not re-tested                        |
| E14 | Regression: personal timeline unchanged                                      | full personal set unchanged (function returns personal answer; pages untouched)                                         |
| E15 | Regression: regular album unchanged                                          | full album set unchanged                                                                                                |

### Web e2e matrix (subset of the catalogue that is reachable through the UI)

| #   | Surface        | Actor              | Selection                   | Assert SHOW                                                 | Assert HIDE                                          | Catalogue |
| --- | -------------- | ------------------ | --------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- | --------- |
| 1   | Space timeline | Viewer             | owner's asset               | Select-all, Download, Share, Add-to-album                   | Favorite, edit, Delete, Remove-from-space, Set-cover | E1        |
| 2   | Space timeline | Editor             | own asset (editor adds it)  | + Favorite, edit, Tag, Delete, Remove-from-space, Set-cover | —                                                    | E2        |
| 3   | Space timeline | Editor             | owner's asset               | Remove-from-space, Set-cover                                | Favorite, edit, Delete                               | E3        |
| 4   | Space timeline | Owner              | own asset                   | everything                                                  | —                                                    | E2/E4     |
| 5   | Space album    | Viewer/member      | album asset (not theirs)    | Select-all, Download, Share, Add-to-album                   | Remove-from-album, owner-gated                       | E1/E7     |
| 6   | Space album    | Editor (canManage) | album asset                 | + Remove-from-album, Set-cover                              | —                                                    | E6        |
| 7   | Space album    | member             | **own** asset in album      | owner-gated (Favorite/edit/Delete)                          | —                                                    | E2        |
| 8   | Space person   | Viewer             | person's asset (not theirs) | Select-all, Download, Share, Add-to-album                   | owner-gated, Remove-from-space                       | smoke     |

Cases 1 and 5 are the reporter's exact regressions. A _viewer's own asset in a space_ is not a
reachable fixture (viewers cannot contribute), so viewer×ownership variation lives in the unit matrix
(E1 vs a synthetic all-owned viewer ctx), not e2e.

### Server/API RBAC matrix (Slice 6)

Using `buildSpaceContext()` (gives `spaceOwner`/`spaceEditor`/`spaceViewer`/`spaceNonMember` +
`spaceAssetId` owned by owner) and `forEachActor()` (asserts a status per actor, names the failing
actor):

- **Download** of `spaceAssetId`: owner/editor/viewer → 200; non-member → 4xx.
- **Create-shared-link** referencing `spaceAssetId`: pin the real status per actor (decides the
  `canShare` gate — see Share note).
- **Add-to-album** of `spaceAssetId` into the actor's own album: pin per actor (decides `canAddToAlbum`
  gate).
- **Favorite / metadata update / delete** of `spaceAssetId`: only the asset **owner** → 200; other
  members → 4xx (proves owner-gate is real server-side, backs V1/V2).
- **Remove-from-space**: editor/owner → 200; viewer/non-member → 4xx.

### Infra notes (folded in from prior e2e pain)

- Run the web suite on the `:2285` e2e stack (`--project=web`); the `:2283` dev stack serves empty
  bodies and yields bogus "element not found".
- Space role text is a raw lowercase enum under CSS `capitalize` → match with `{ ignoreCase: true }`.
- Assert absence with `toHaveCount(0)` / `.not.toBeVisible()`, not a bare negation.
- Do not trust `waitForQueueFinish`'s false-"done"; settle uploads via the established websocket/event
  helpers.
- Fresh worktree needs SDK build + test-assets + `playwright install` before the web suite runs.

## Implementation slices (impl-loop)

Each slice is a vertical, independently green increment. TDD order inside every slice: **tests first
→ fail → implement → green → refactor**. A slice is "done" only when its acceptance criteria hold and
the full web gate (`check:typescript` + `check:svelte` + `pnpm lint`) is clean.

### Slice 1 — `getSelectionCapabilities` rule engine + unit matrix + parity guard

- **Tests first:** `selection-capabilities.spec.ts` implementing the full RBAC edge catalogue E1–E15
  as BDD scenarios over synthetic `CommandContext` fixtures, plus the album↔space parity assertion.
- **Implement:** `selection-capabilities.ts` (pure function + `SelectionCapabilities` type). Extend
  `AlbumContext` with `isEditor` and compute it in `registerAlbumContext` (fork file). Reuse existing
  handlers (`canFavoriteSelected`, `canDeleteSelected`, `canAddSelectedToAlbum`) where they align.
- **Acceptance:** every E1–E15 scenario passes; parity assertion passes; no UI touched yet.
- **Files:** `web/src/lib/managers/selection-capabilities.ts` (new),
  `…/selection-capabilities.spec.ts` (new), `…/command-context-manager.svelte.ts` (extend
  `AlbumContext`), `…/command-context-manager.spec.ts` (extend for `isEditor`).

### Slice 2 — `<SelectionToolbar>` component + component tests

- **Tests first:** `SelectionToolbar.spec.ts` — Given a capability set (drive via a stubbed
  context/harness), Then exactly the permitted buttons render (E8–E12 rendering aspects), and the
  ⌘K default provider is present.
- **Implement:** `SelectionToolbar.svelte` wrapping `AssetSelectControlBar`, owning
  `CommandPaletteDefaultProvider`, rendering album-layout actions gated by
  `getSelectionCapabilities`, taking the props bundle.
- **Acceptance:** component renders correct buttons per caps; no page wired yet; existing suites green.
- **Files:** `web/src/lib/components/timeline/SelectionToolbar.svelte` (new), spec (new).

### Slice 3 — Wire space timeline page + web e2e cases 1–4

- **Tests first:** new Playwright spec `spaces-selection-toolbar.e2e-spec.ts` cases 1–4 (fail: Share/
  Add-to-album/Delete/Set-cover absent today).
- **Implement:** replace the control-bar block (`spaces/[spaceId]/…/+page.svelte:877-911`) with
  `<SelectionToolbar>`; flip `canAddToAlbum` to `true`; pass space wiring (spaceId, onRemove=
  `handleRemoveAssets`, onSetCover=`handleSetAsCover`, onFavorite/onArchive).
- **Acceptance:** cases 1–4 green; the page's old inline action imports removed; web gate clean.
- **Files:** `spaces/[spaceId]/[[photos=photos]]/[[assetId=id]]/+page.svelte`, e2e spec (new).

### Slice 4 — Wire space person page + smoke e2e case 8

- **Tests first:** e2e case 8 (space-person viewer sees always-set, not owner-gated/Remove-from-space).
- **Implement:** same swap in
  `spaces/[spaceId]/people/[personId]/…/+page.svelte:714-742`.
- **Acceptance:** case 8 green; space-person toolbar identical to space timeline; web gate clean.
- **Files:** the space-person page, e2e spec (append).

### Slice 5 — Wire space album page (the reversal) + web e2e cases 5–7 + V1

- **Tests first:** e2e cases 5–7 (fail: Select-all/menu/Share absent in space album today). Case 7
  specifically proves V1 (owner-gated actions appear on the member's **own** album asset and only
  then).
- **Implement:** replace the Download+Remove-only bar
  (`spaces/[spaceId]/albums/[albumId]/…/+page.svelte:412-419`) with `<SelectionToolbar>`; album wiring
  (album DTO, onRemove=`handleRemoveAssets`, onSetCover=album cover); `canRemoveFromAlbum` via
  `canManage`; **no** Remove-from-space. Update/replace the `rbac-5/albums-8` comment to document the
  new invariant (owner-gated via `isAllUserOwned`; space-editor cross-owner edit still never offered).
- **Acceptance:** cases 5–7 green; verify no owner-gated button shows on a non-owned album asset
  (V1); web gate clean.
- **Files:** the space-album page, e2e spec (append).

### Slice 6 — Server/API RBAC matrix + Share/Add-to-album decision (V2)

- **Tests first + implement (test-only slice):** `spaces-selection-actions.e2e-spec.ts` under
  `e2e/src/specs/server/api/` using `buildSpaceContext()` + `forEachActor()` covering download,
  create-shared-link, add-to-album, favorite, metadata update, delete, remove-from-space against
  space-accessed asset IDs.
- **Decision gate:** from the pinned create-shared-link / add-to-album statuses, either leave
  `canShare`/`canAddToAlbum` unconditional or gate them by `isAllUserOwned` (update Slice 1's
  function + matrix accordingly, keeping album/personal unaffected).
- **Acceptance:** matrix green; capability gate matches proven server behaviour; V2 satisfied.
- **Files:** e2e API spec (new); possibly `selection-capabilities.ts` + its spec (adjust gate).

### Slice 7 — Cleanup, i18n, parity guard confirmation, full verify

- **Implement:** remove now-dead action imports from all three space pages; add any new i18n keys
  (en.json only — web+mobile share `i18n/`); confirm the parity guard from Slice 1 is explicit and
  named.
- **Acceptance:** `make check-web` + `make lint-web` clean; unit + component + web e2e + API e2e all
  green; a final skim confirms the three space surfaces match the album reference per the catalogue.
- **Files:** the three space pages, `i18n/en.json` (if needed).

## Risks & open questions

- **R1 — Share/Add-to-album server behaviour (resolved by Slice 6).** If either is owner-scoped
  server-side, the capability is gated by `isAllUserOwned`; no user-visible regression on album/
  personal. Tracked, not blocking.
- **R2 — `ownerId` fidelity on space-projected assets (V1).** If the merged space timeline supplies a
  wrong/absent `ownerId`, owner-gated actions could mis-render. Slice 5 e2e (owner vs other) is the
  tripwire; a focused unit check is the fallback.
- **R3 — Drift from the untouched upstream album.** Mitigated by the Slice 1 parity guard: if upstream
  restructures the album toolbar, the assertion fails in CI rather than shipping silent divergence.
- **R4 — `check:svelte` local blindness.** It has been observed to scan 0 files locally; rely on the
  push-time CI gate for the svelte check, and don't treat a local 0-file run as proof.
