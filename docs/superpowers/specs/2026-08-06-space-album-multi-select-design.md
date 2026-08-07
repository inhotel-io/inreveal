# Space album multi-select — design

**Date:** 2026-08-06
**Status:** approved, ready for planning
**Depends on:** the space album folders feature (PR #931 / #936). This spec assumes folders, the
folder drag-and-drop (`onDropItem`), and the mobile folder pages already exist.

## 1. Goal

Let a user select several space albums at once and act on all of them, instead of repeating a
per-item menu action or dragging one card at a time. Selection must look and behave exactly like
photo multi-select on each platform — including Shift-click ranges with live preview on web, and
long-press entry on mobile.

## 2. Scope

**In scope**

- The **space albums** surface only: `web/src/lib/components/spaces/space-albums-list.svelte` and
  `mobile/lib/pages/library/spaces/space_albums.page.dart`.
- **Both platforms**, web and mobile.
- Selection of **albums** and of **folders**, but never both at once.
- Bulk actions matching what a single item already offers:
  - albums: unlink from space, move to folder, include/exclude in timeline
  - folders: move, delete
- New server bulk endpoints, plus their OpenAPI/SDK/Dart regeneration.

**Out of scope**

- The personal albums page (`web/src/lib/components/album-page/AlbumsList.svelte`). It has a
  different action set (edit/share/download/delete) and no folders. It is a plausible follow-up
  reusing the same manager, but is not designed here.
- True album **deletion** from the space view. Neither platform offers it today; unlink is the
  destructive action in this surface and adding real deletion is new destructive surface area.
- Bulk **rename**. There is no sensible bulk rename, so rename stays a single-item action.
- Any change to who may do what. Bulk endpoints reuse the existing per-item authorization exactly
  (§6.3).

## 3. Existing code this builds on

| Concern                    | Existing code                                                             |
| -------------------------- | ------------------------------------------------------------------------- |
| Photo selection manager    | `web/src/lib/managers/asset-multi-select-manager.svelte.ts`               |
| Photo selection bar        | `web/src/lib/components/timeline/AssetSelectControlBar.svelte`            |
| Shift state                | `keyboardManager.shift` — `web/src/lib/stores/keyboard-manager.svelte.ts` |
| Space album grid/table     | `web/src/lib/components/spaces/space-albums-list.svelte`                  |
| Space album table          | `web/src/lib/components/spaces/space-albums-table.svelte`                 |
| Album card                 | `web/src/lib/components/spaces/space-album-card.svelte`                   |
| Folder card                | `web/src/lib/components/spaces/space-album-folder-card.svelte`            |
| Folder drag-and-drop       | `web/src/lib/utils/space-album-folder-dnd.ts`                             |
| Mobile space albums page   | `mobile/lib/pages/library/spaces/space_albums.page.dart`                  |
| Mobile per-card actions    | `enum _CardAction { toggle, unlink, move }` in that page                  |
| Mobile photo multiselect   | `mobile/lib/providers/timeline/multiselect.provider.dart`                 |
| Server space album service | `server/src/services/shared-space.service.ts`                             |
| Server space album routes  | `server/src/controllers/shared-space.controller.ts`                       |
| Bulk result DTO            | `BulkIdResponseDto` in `server/src/dtos/asset-ids.response.dto.ts`        |

## 4. Selection model

### 4.1 A new manager, not a generalisation

Add `web/src/lib/managers/space-album-multi-select-manager.svelte.ts`, mirroring the _shape_ of
`AssetMultiSelectManager` (selected map, anchor for ranges, candidates for range preview,
`selectionActive`) without sharing code with it.

`AssetMultiSelectManager` is asset-typed throughout — `ownedAssets`, `isAllTrashed`,
`isAllArchived`, `isAllFavorite` — so a shared generic would either carry asset concepts into the
album domain or dissolve into a bag of type parameters. The pattern is ~40 lines. Copying it is
cheaper to read and to change than abstracting it.

### 4.2 Discriminated, never-mixed selection

The manager holds one of:

```ts
type SpaceAlbumSelection =
  { kind: 'none' } | { kind: 'album'; ids: SvelteSet<string> } | { kind: 'folder'; ids: SvelteSet<string> };
```

Selecting an item of the other kind **replaces** the selection wholesale rather than merging or
partially clearing. Rationale: move-to-folder is the only action valid for both kinds, so a mixed
selection would grey out two of three album actions and confuse what the bar is offering.

### 4.3 Ordering for Shift-ranges

Range resolution operates over a **derived flat list in visual order**. This list does not exist
today and must be added: `space-albums-list.svelte` computes three separate shapes —
`searchHitAlbums` (:96), `sorted` (:132) and `groups` (:139) — with no unified ordering. Derive it
from whichever is active:

| Mode           | Flat list                                                  |
| -------------- | ---------------------------------------------------------- |
| Search         | `searchHitAlbums`                                          |
| Grouped        | `groups.filter(g => !collapsed(g)).flatMap(g => g.albums)` |
| Ungrouped grid | `sorted`                                                   |
| List/table     | the rendered row order (folders first, then `sorted`)      |

Consequences:

- In **grouped** mode the list spans group boundaries, so a range may cross group headers exactly as
  photo ranges cross day headers.
- Items in **collapsed** groups are absent from this list, so a range cannot pass _through_ them. A
  user cannot Shift-select items they cannot see.

**This is a range-resolution list, not a definition of selection membership.** Collapsing a group
does not deselect anything already selected inside it (E-14); it only removes those items from the
ordering used to compute a new range.

Because folders and albums are separate selection kinds, a range never spans from a folder to an
album; a Shift-click on the other kind starts a fresh selection at that item.

### 4.4 Permission gating

Selection is available only when `canManage` is true — the same space-editor boolean that gates the
existing per-item menus. Consequence: a selection can never contain an item the current user is not
permitted to act on, so the UI needs no per-item disabled state.

Note a deliberate asymmetry with the server: `unlinkAlbum` permits **space Editors OR the album's
owner** (`shared-space.service.ts`, the `rbac-6` comment), but web has never surfaced the
owner-without-membership path. This spec does not change that. The bulk endpoints still implement
the full server-side rule (§6.3), so an API client using the owner path gets correct behaviour;
the web/mobile UI simply does not offer it, matching today.

## 5. Interaction

### 5.1 Web

| Situation                            | Behaviour                                             |
| ------------------------------------ | ----------------------------------------------------- |
| Hover a card, no selection active    | A check circle appears (as on photo thumbnails)       |
| Click the check circle               | Enters selection mode with that item selected         |
| Click a card, selection active       | Toggles that item; does **not** navigate              |
| Click a card, no selection active    | Opens the album / enters the folder (unchanged)       |
| Shift held, hovering                 | Live preview of the candidate range (`candidates`)    |
| Shift-click                          | Commits the range from the anchor to the clicked item |
| `Escape`                             | Clears the selection                                  |
| Navigating (including into a folder) | Clears the selection                                  |

**Clearing must be explicit — `AppNavigate` is not sufficient, and assuming otherwise is a trap.**
`web/src/routes/+layout.svelte:185-193` suppresses the event for same-route transitions:

```js
const sameRouteTransition = fromRouteId && toRouteId && fromRouteId === toRouteId;
if (sameRouteTransition) return; // AppNavigate is NOT emitted
eventManager.emit('AppNavigate');
```

Entering a folder is `goto(Route.viewSpaceAlbums({ id, folderId }))` (`+page.svelte:140`) — the same
route id with a different `?folder=`. So `AppNavigate` never fires and a manager relying on
`resetOnNavigate` alone would carry a selection across folder levels.

The manager therefore clears on **three** explicit triggers:

1. `currentFolderId` changes (covers entering/leaving a folder and the breadcrumb);
2. `searchQuery` changes (local `$state`, see E-6 — no navigation occurs at all);
3. `AppNavigate`, which still correctly covers leaving the albums route entirely.

This matters because move-to-folder resolves against the current level, so a selection must never
span two levels.

### 5.2 Mobile

| Situation                     | Behaviour                                       |
| ----------------------------- | ----------------------------------------------- |
| Long-press a card             | Enters selection mode with that item selected   |
| Tap, selection active         | Toggles that item                               |
| Tap, no selection active      | Opens the album / enters the folder (unchanged) |
| System back, selection active | Exits selection **without** popping the page    |
| System back, no selection     | Pops the page (unchanged)                       |
| Navigating away               | Clears the selection                            |

There is no Shift equivalent; range selection is web-only. Long-press is currently unused on these
cards, so there is no gesture conflict.

**The back-button row requires adding a `PopScope`, and that is delicate.** The page has none today.
The folder-vanished self-pop from the folders work calls `context.maybePop()`
(`space_albums.page.dart:221`), which a `PopScope` can absorb — and a known deferred issue is that
`trySelfPop` clears its guard flag _before_ `maybePop` resolves, so a refused pop leaves a visible,
dead page with no retry. A naive selection `PopScope` would make that latent bug reachable.

Two rules keep them separate:

1. The `PopScope` is **inert unless a selection exists** — `canPop: selection.isEmpty` — so it
   cannot intercept anything on a page with no selection.
2. The folder-vanished listener **clears the selection first**, before the self-pop is attempted.
   By the time `maybePop` runs, `canPop` is true again.

Rule 2 is the load-bearing one and needs its own test (E-21). Do not modify the self-pop logic
itself; the interaction is resolved entirely on the selection side.

The `AppBar` is replaced by a selection bar showing the count and the action icons, mirroring the
timeline's multiselect bar.

### 5.3 Drag-and-drop composes with selection

Dragging a card that **is part of the current selection** drags the whole selection. Dragging a card
that is not selected behaves exactly as today and leaves the selection untouched.

Implementation note: `DragPayload` in `web/src/lib/utils/space-album-folder-dnd.ts` is today
`{ kind: 'album' | 'folder'; id: string }`. It already carries the same `kind` discriminator as the
selection model (§4.2), so it becomes `{ kind; ids: string[] }` — a single-item drag is simply a
one-element array. `onDropItem(payload, targetFolderId)` keeps its signature, and
`writeDragPayload` / `readDragPayload` keep theirs.

## 6. Server

### 6.1 Endpoints

Added to `server/src/controllers/shared-space.controller.ts`, following the existing
`POST :id/assets/bulk-add` naming convention.

| Method | Path                            | Permission                     | Body                                |
| ------ | ------------------------------- | ------------------------------ | ----------------------------------- |
| POST   | `:id/albums/bulk-unlink`        | `SharedSpaceAlbumDelete`       | `{ ids }`                           |
| PUT    | `:id/albums/bulk-folder`        | `SharedSpaceAlbumUpdate`       | `{ ids, folderId: string \| null }` |
| PUT    | `:id/albums/bulk-timeline`      | `SharedSpaceAlbumUpdate`       | `{ ids, showInTimeline: boolean }`  |
| PUT    | `:id/album-folders/bulk-parent` | `SharedSpaceAlbumFolderUpdate` | `{ ids, parentId: string \| null }` |
| POST   | `:id/album-folders/bulk-delete` | `SharedSpaceAlbumFolderDelete` | `{ ids }`                           |

All return `BulkIdResponseDto[]` with HTTP 200 (not 204 — there is a body).

**Request DTOs are fork-local and must not reuse `BulkIdsDto`.** `BulkIdsSchema` is
`z.array(z.uuidv4())` with **no `.min(1)`** (`asset-ids.response.dto.ts:38-42`), so reusing it would
make an empty `ids` array a silent 200-with-`[]` rather than the 400 this spec requires (E-2). It is
also shared with upstream endpoints, so tightening it in place is not an option.

Define fork-local schemas in `server/src/dtos/shared-space.dto.ts` with
`ids: z.array(z.uuidv4()).min(1).max(1000)`. The `max` bounds the request against a pathological
payload; 1000 is above any realistic selection (E-16) and is a request-validation limit, not a
product limit. Responses still reuse `BulkIdResponseDto` unchanged.

### 6.2 Response and partial failure

`BulkIdResponseDto` is `{ id, success, error?, errorMessage? }` where `error` is
`BulkIdErrorReason`: `duplicate | no_permission | not_found | unknown | validation`. That vocabulary
covers every failure this feature produces, so **no new response DTO is introduced**.

Bulk operations are **not** transactional across items. One album another user unlinked a second ago
must not block the other forty-nine. Each item succeeds or fails independently and reports its own
reason.

- Item the caller may not act on → `success: false`, `error: no_permission`
- Item not linked to this space / folder does not exist → `success: false`, `error: not_found`
- Move that would create a cycle or exceed depth → `success: false`, `error: validation`
- Name collision on move → `success: false`, `error: validation`

The endpoint itself returns 200 even when every item failed. It returns a 4xx only for
request-level problems: not a space member (403), malformed body (400), unknown space (**403**, not
404 — see below).

> **Corrected 2026-08-06 during implementation.** An earlier draft of this section said an unknown
> space returns 404. It cannot: `requireRole` → `requireMembership` throws `ForbiddenException`, and
> an unknown `spaceId` is indistinguishable from one the caller simply is not a member of. All five
> endpoints therefore return 403. This is pre-existing behaviour across the whole
> `SharedSpaceController`, and it is the better answer anyway — a 404 would leak which space ids
> exist to a non-member.

**`showInTimeline` on the bulk-timeline body is required, not optional.** The existing
`PATCH :id/albums/:albumId` carries a comment recording exactly this: making it optional pushes the
generated Dart client into three-state (`isPresent`/absent) territory. The bulk endpoint must not
reintroduce that.

### 6.3 Bulk endpoints must not become a permission bypass

Each bulk service method loops over the ids calling **the same checked helpers the single-item paths
call** — notably `unlinkAlbum`'s Editor-or-album-owner rule. It must not perform one space-level
check and then a single bulk `DELETE`/`UPDATE`.

Likewise, **bulk folder move must delegate to `moveAlbumFolderChecked` per item**. That method
carries the advisory lock and cycle detection. A bulk mover issuing its own `UPDATE` would bypass
them — the exact footgun closed by narrowing `updateAlbumFolder`'s dto to `{ name: string }`.

Depth and limit validation re-runs **per item, in order**, because earlier items in a batch change
what is legal for later ones (§8, E-9).

### 6.4 Activity feed and sync

- One activity row per bulk operation, not one per item.
- The sync stream emits the affected folder/link changes as a single checkpoint advance. Mobile is a
  client of these endpoints, and avoiding fifty individual sync events is a main reason bulk
  endpoints were chosen over a client-side loop.

## 7. BDD scenarios

Written as Given/When/Then. Each maps to at least one test in §9.

### 7.1 Selection — web

**S-1 Entering selection**
Given a space albums grid with albums A, B, C and no selection
When the user clicks the check circle on B
Then B is selected, the selection bar shows "1 selected", and no navigation occurred.

**S-2 Click toggles while selection is active**
Given A is selected
When the user clicks card C
Then A and C are selected and the page did not navigate to C.

**S-3 Click navigates when no selection is active**
Given no selection
When the user clicks card C
Then the album C opens.

**S-4 Shift-click range**
Given albums A, B, C, D in visual order and A is selected
When the user Shift-clicks D
Then A, B, C, D are all selected.

**S-5 Shift-hover previews the range**
Given A is selected and Shift is held
When the user hovers C
Then B and C are shown as candidates and the selection is still only A.

**S-6 Range crosses group boundaries**
Given grouping is active with A, B in group 1 and C, D in group 2, all expanded, and A is selected
When the user Shift-clicks D
Then A, B, C, D are selected.

**S-7 Range skips collapsed groups**
Given A, B in expanded group 1, C, D in **collapsed** group 2, E in expanded group 3, and A selected
When the user Shift-clicks E
Then A, B, E are selected and C, D are not.

**S-8 Escape clears**
Given three albums are selected
When the user presses Escape
Then nothing is selected and the selection bar is gone.

**S-9 Entering a folder clears the selection**
Given two albums are selected
When the user opens a folder
Then nothing is selected.

**S-9a Browser Back out of a folder clears the selection**
Given the user entered folder F and selected two albums
When they press browser Back
Then nothing is selected. (Same-route history moves emit no `AppNavigate`, so this fails against a
manager relying on `resetOnNavigate` alone — see §5.1.)

**S-9b Changing the search query clears the selection**
Given two albums are selected from a search for "beach"
When the user types another character
Then nothing is selected.

**S-10 Selection is unavailable without manage rights**
Given the viewer has `canManage: false`
When they hover a card
Then no check circle appears and no selection can start.

### 7.2 Selection — kinds

**S-11 Selecting a folder replaces an album selection**
Given albums A, B are selected
When the user selects folder F
Then the selection is exactly { folder F } and no albums are selected.

**S-12 Selecting an album replaces a folder selection**
Given folders F, G are selected
When the user selects album A
Then the selection is exactly { album A }.

**S-13 The bar offers only the kind's actions**
Given a folder selection
Then the bar offers move and delete, and offers neither unlink nor timeline toggle.

### 7.3 Selection — mobile

**S-14 Long-press enters selection**
Given no selection
When the user long-presses album B
Then selection mode is active with B selected and the AppBar shows the selection bar.

**S-15 Tap toggles in selection mode**
Given selection mode is active with B selected
When the user taps C
Then B and C are selected and the album C did not open.

**S-16 Back exits selection before popping**
Given selection mode is active on a folder page
When the user presses system back
Then selection mode exits and the page is still displayed.
And when the user presses back again
Then the page pops.

**S-16a The selection `PopScope` does not veto the folder-vanished self-pop**
Given the user is inside folder F with two albums selected
When another editor deletes folder F and the provider emits a list without it
Then the selection is cleared first, the page self-pops, and the user does not end up on a visible
dead page. (Guards E-21 — the one place selection can resurrect a known self-pop issue.)

### 7.4 Bulk actions

**S-17 Bulk unlink**
Given albums A, B, C are selected
When the user confirms "Unlink 3 albums from this space?"
Then all three link rows are gone, the grid no longer shows them, and the selection is cleared.

**S-18 Timeline toggle resolves toward include**
Given selected albums where at least one has `showInTimeline: false`
Then the button reads "Add to timeline"
And when pressed, every selected album ends with `showInTimeline: true`.

**S-19 Timeline toggle when all are already included**
Given every selected album has `showInTimeline: true`
Then the button reads "Remove from timeline"
And when pressed, every selected album ends with `showInTimeline: false`.

**S-20 Bulk move to folder**
Given albums A, B are selected at the root
When the user moves them to folder F
Then both links have `folderId = F` and both disappear from the root level.

**S-21 Bulk folder delete promotes children**
Given folders F (containing album X and subfolder G) and H are selected
When the user confirms deletion
Then F and H are gone, X and G have moved up one level, and X is still linked to the space.

**S-22 Drag a selection**
Given albums A, B, C are selected
When the user drags card B onto folder F
Then A, B and C all move into F.

**S-23 Drag an unselected card leaves the selection alone**
Given albums A, B are selected
When the user drags unselected card D onto folder F
Then only D moves and A, B remain selected.

### 7.5 Partial failure

**S-24 Partial failure keeps the failures selected**
Given albums A, B, C are selected and the server returns success for A and C and
`no_permission` for B
Then a message names one failure, B remains selected, A and C are deselected.

**S-25 Total failure keeps everything selected**
Given every item fails
Then the selection is unchanged and a message names the failure count.

**S-26 Total success clears the selection**
Given every item succeeds
Then the selection is empty and the bar is gone.

### 7.6 Server

**S-27 Per-item authorization**
Given an editor batch containing one album in another space
Then that id returns `success: false, error: not_found` and the others return `success: true`,
and the HTTP status is 200.

**S-28 Viewer is refused**
Given a space viewer
When they call any bulk endpoint **except `albums/bulk-unlink`**
Then the response is 403 and nothing changed.

**S-29 Non-member is refused**
Given a user who is not a member of the space
When they call any bulk endpoint **except `albums/bulk-unlink`**
Then the response is 403.

**S-29a `albums/bulk-unlink` refuses per item, not per request**
Given a space viewer who owns none of the albums in the batch
When they call `POST :id/albums/bulk-unlink`
Then the response is **200** and every entry is `success: false, error: no_permission`, and nothing changed.
And given a non-member who owns one of the albums in the batch
Then that album's entry is `success: true` and the others are `no_permission`.

> **Why this endpoint differs** (amended 2026-08-06, during implementation). The other four bulk
> endpoints are space-Editor-only, so a single hoisted `requireRole(Editor)` is equivalent to
> checking per item and gives the cleaner 403. `unlinkAlbum` is not: it carries a deliberate owner
> arm (the `rbac-6` block in `shared-space.service.ts`) letting an album's owner revoke a link to
> their own album **even without space membership** — otherwise an owner could neither discover nor
> undo an editor's link. Hoisting `requireRole(Editor)` there would silently narrow that rule, so
> this endpoint authorizes per item and reports per item. The UI never exercises the difference:
> selection is gated on `canManage` (§4.4), so a viewer never reaches any of these endpoints from
> the app.

**S-30 Bulk move rejects a cycle**
Given folders F and G where G is a child of F
When the caller moves F under G
Then that id returns `error: validation` and no rows changed.

**S-31 One activity row per batch**
Given a bulk unlink of three albums
Then exactly one activity row is written.

## 8. Edge cases

| #    | Case                                                                         | Required behaviour                                                                                                                                                                                                                                                  |
| ---- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-1  | Empty selection                                                              | The bar is not rendered; bulk endpoints are never called with an empty `ids` array (client-side guard).                                                                                                                                                             |
| E-2  | Server receives an empty `ids` array                                         | 400, not a silent no-op. Requires the fork-local `.min(1)` schema of §6.1 — `BulkIdsDto` would return 200.                                                                                                                                                          |
| E-3  | Duplicate ids in one request                                                 | Deduplicated server-side before processing; the response has one entry per distinct id.                                                                                                                                                                             |
| E-4  | An item disappears (unlinked elsewhere) before the action                    | `error: not_found` for that id; the rest proceed.                                                                                                                                                                                                                   |
| E-5  | An item disappears while selected, before any action                         | The provider refresh drops it from the selection silently; the count updates.                                                                                                                                                                                       |
| E-6  | Selection spanning a search, then the query changes                          | Explicit clear on `searchQuery` change. It is local `$state` (`+page.svelte:57`), not URL-backed, so no navigation fires and nothing clears it otherwise.                                                                                                           |
| E-7  | Shift-click with no anchor (nothing selected yet)                            | Behaves as a plain click: selects that one item and sets it as the anchor.                                                                                                                                                                                          |
| E-8  | Shift-click _backwards_ (anchor after the target)                            | Selects the range in visual order regardless of direction.                                                                                                                                                                                                          |
| E-9  | Batch where an earlier move makes a later one illegal                        | Items process in request order; the later item returns `error: validation`. Documented, not "undefined".                                                                                                                                                            |
| E-10 | Moving folders into a folder that is itself being moved                      | Processed in order; the cycle check in `moveAlbumFolderChecked` rejects the offender with `validation`.                                                                                                                                                             |
| E-11 | Bulk move producing a name collision in the target folder                    | `error: validation` for the colliding id, reusing the existing conflict message.                                                                                                                                                                                    |
| E-12 | Bulk move exceeding the 10-level depth limit                                 | `error: validation`, same message as the single-item path.                                                                                                                                                                                                          |
| E-13 | Bulk create exceeding the space folder limit                                 | Not applicable — no bulk create in scope.                                                                                                                                                                                                                           |
| E-14 | Selecting every item, then a group collapses                                 | Collapsed items stay selected (collapsing hides, it does not deselect); ranges just cannot cross them.                                                                                                                                                              |
| E-15 | `canManage` flips to false mid-selection (role revoked)                      | Selection clears on the next provider refresh and the bar disappears.                                                                                                                                                                                               |
| E-16 | Very large selection (e.g. 500 albums)                                       | One request; no client-side chunking. If this proves slow, chunking is a follow-up, not a v1 requirement.                                                                                                                                                           |
| E-17 | Mobile: selection active, app backgrounded and resumed                       | Selection survives; it is page state, not navigation state.                                                                                                                                                                                                         |
| E-18 | Mobile: the folder page self-pops (folder deleted elsewhere)                 | Selection is discarded with the page; the self-pop logic is untouched.                                                                                                                                                                                              |
| E-19 | Offline / request fails at transport level                                   | Nothing is deselected and an error message is shown; the user can retry the whole batch.                                                                                                                                                                            |
| E-20 | Timeline toggle on a selection where the value is uniform                    | Still sends the explicit boolean; the endpoint is idempotent.                                                                                                                                                                                                       |
| E-21 | Mobile: browsed folder vanishes **while a selection is active**              | The listener clears the selection first, so `canPop` is true and the self-pop's `maybePop` is not vetoed by the selection `PopScope` (§5.2). Needs its own test — this is the one interaction that can resurrect the known "refused pop settles a dead page" issue. |
| E-22 | Web: folder changed via browser Back/Forward, not a card tap                 | Same explicit `currentFolderId` clear (§5.1). `AppNavigate` does not fire for same-route history moves either.                                                                                                                                                      |
| E-23 | Web: `?folder=` stripped by the stale-folder fallback (`+page.svelte:87-93`) | Treated as a `currentFolderId` change like any other; selection clears.                                                                                                                                                                                             |

## 9. Test plan

TDD throughout: for each behaviour write the failing test first, capture RED, implement, capture
GREEN. For pinning tests of behaviour that already exists, mutate the code under test to prove the
test can fail, capture that output, and revert.

### 9.1 Server unit — `server/src/services/shared-space.service.spec.ts`

- Each bulk method delegates per item to the checked single-item helper (spy on the helper).
- Bulk folder move calls `moveAlbumFolderChecked` and never a raw repository update. This is the
  §6.3 guard; assert on the mock call, and mutate the implementation to a raw update to prove the
  test fails.
- Partial-failure result shape: mixed success/failure produces one entry per id, in request order,
  with the correct `BulkIdErrorReason`.
- An item the caller cannot act on yields `no_permission`, not a thrown 403.
- Empty `ids` rejected (E-2). Duplicate ids deduplicated (E-3).

Run: `pnpm exec vitest run --config test/vitest.config.mjs src/services/shared-space.service.spec.ts`
from `server/`.

### 9.2 Server medium — real DB

Extend `server/test/medium/specs/repositories/shared-space-album-folder.repository.spec.ts` and the
sync specs.

- Cycle/depth re-validation **within one batch** (E-9, E-10): move A under B and C under A in one
  call and assert the second is rejected while the first persisted.
- Bulk folder delete promotes children and unlinks nothing (S-21) — assert the album's link row
  survives with the promoted `folderId`.
- Name collision on bulk move (E-11).
- The sync stream advances one checkpoint for a batch, driven through `ctx.syncStream` rather than
  the repository — the handler-level path, matching the coverage added for the folder sync handler.

### 9.3 E2E — `e2e/src/specs/server/api/shared-space-album-folder.e2e-spec.ts`

RBAC matrix as real HTTP assertions, exact status codes (not "not 200"):

- editor → 200 with the expected `BulkIdResponseDto[]` body
- **viewer → 403**
- **non-member → 403**
- album-owner-but-not-editor → per-item success for their own albums, `no_permission` for others
- malformed body → 400; unknown space → 403 (see §6.2 — not 404); empty `ids` → 400

Assert response **bodies**, not just statuses, and assert the resulting state via a follow-up GET.

### 9.4 Web unit — vitest + @testing-library/svelte

- Manager: range math (S-4, S-6, S-7, E-7, E-8). The collapsed-group test needs a **positive
  control** asserting visible items _are_ included, so it cannot pass vacuously.
- Manager: never-mixed replacement (S-11, S-12) — assert the other kind's set is empty _and_ assert
  it was non-empty beforehand.
- `isAllInTimeline` label derivation (S-18, S-19).
- Partial failure re-selection (S-24, S-25, S-26) — assert exactly which ids remain.
- Selection gating on `canManage` (S-10).
- Drag payload carries the selection (S-22) and does not for an unselected card (S-23).
- **The three clearing triggers, tested separately** (S-9, S-9a, S-9b): `currentFolderId` change,
  `searchQuery` change, and `AppNavigate`. Each needs its own test, because the first two are exactly
  the cases `AppNavigate` does **not** cover — a single "selection clears on navigation" test would
  pass against the broken design.

### 9.4a Server DTO validation

- Empty `ids` → 400 (E-2). This test fails if the implementation reuses `BulkIdsDto`, which is the
  point: it pins the §6.1 decision rather than restating it.
- `ids` above the max → 400.
- Duplicate ids → one response entry per distinct id (E-3).

### 9.5 Mobile — `flutter test`

- Long-press entry, tap-toggle (S-14, S-15).
- Back exits selection before popping (S-16) — two separate back presses with an assertion between.
- The selection bar renders the count and the kind-appropriate actions (S-13).
- **The `PopScope` does not veto the self-pop** (S-16a / E-21). Drive it through the existing stacked
  folder-page harness with a selection active, and assert the page actually left the stack. Prove the
  test is real by removing the "clear selection first" rule and watching it fail — without that
  mutation evidence the test could pass for the wrong reason, since a page that pops for any reason
  satisfies a naive assertion.

### 9.6 Test-quality rules

These are binding, not advisory:

- **No assertion that passes for any non-throwing implementation.** The batch tests are the obvious
  trap: `expect(result).toHaveLength(3)` is true whether or not anything happened. Assert observable
  state — link rows, `folderId` values, what the grid renders — not just the response envelope.
- No test whose only assertion is that a mock was called, where the real property is observable.
- No assertion on a filtered array being empty without first proving it would otherwise be non-empty.
- No unreachable assertions (inside an `if` that never runs, or a settled-promise branch that
  swallows rejections).

## 10. i18n

New EN keys in `i18n/en.json`, **and translated into the nine fork-maintained locales**: `de`, `es`,
`fr`, `it`, `nl`, `pl`, `ru`, `zh_Hans`, `zh_Hant`.

That set is not a guess — it is verifiable. Exactly those nine plus `en` carry the fork's
`space_album_*` strings (55 each as of `7b1872a5217`); every other locale in `i18n/` carries zero and
is maintained upstream via Weblate. `i18n/` holds ~90 files; touching the other ~80 would inject
fork strings into files upstream owns and create rebase conflicts. Confirm the set before starting:

```sh
python3 -c "
import json,glob,os
for f in sorted(glob.glob('i18n/*.json')):
    c=sum(1 for k in json.load(open(f)) if k.startswith('space_album'))
    if c: print(os.path.basename(f), c)"
```

Terminology must match what each locale already uses rather than being invented: folder is
`Ordner` / `Carpeta` / `Dossier` / `Cartella` / `Map` / `Folder` / `Папка` / `文件夹` / `資料夾`, and
"Space" stays untranslated in de/es/nl/pl/ru/zh (fr uses _espaces_, it uses _Space_). Note `zh_Hans`
uses `相簿` in this surface, not `相册`, matching its existing `space_album_*` strings.

Keys needed (final names to be settled in the plan):

- selection count (plural — needs correct CLDR categories per locale)
- "Unlink N albums from this space?" confirm title/body (plural)
- "Delete N folders?" confirm title/body (plural)
- "Add to timeline" / "Remove from timeline"
- partial-failure message (plural)

Plural strings must be validated by rendering through `intl-messageformat` per locale, not merely by
eye — Polish and Russian need `one/few/many/other`, Chinese a single form.

## 11. Constraints and repo gotchas

- **Flutter is exact-pinned to 3.44.8.** The default `flutter` on PATH may be older; invoke
  `~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/{flutter,dart}` directly.
- **Mobile CI has two gates beyond tests:** `dart analyze --fatal-infos lib test` must be clean (an
  _info_-level lint fails CI) and `dart format` must produce no diff on touched files.
- **Server:** TypeScript strict, no relative imports (use the `src/` alias), ESLint zero-warnings,
  and Prettier is a **separate** CI gate.
- **Single server test file:** `pnpm exec vitest run --config test/vitest.config.mjs <path>`. The
  bare `pnpm exec vitest run <path>` loads no config and dies with `describe is not defined`; and
  `pnpm test -- --run <path>` silently drops the path filter.
- **Never run `make sql` without a running database** — it deletes the generated query files. This
  feature adds repository methods, so regenerating SQL docs must happen with a DB up.
- **Kysely:** never run `this.db` queries inside a `transaction().execute(async (trx) => …)`
  callback; use `trx`.
- **OpenAPI:** new DTOs mean regenerating **both** clients — `make open-api` covers the TypeScript
  SDK and the Dart client (Dart generation needs Java). Regenerating only one fails CI's OpenAPI
  Clients job.
- **Never hand-edit generated files:** `mobile/openapi/`, `*.g.dart`, `*.drift.dart`,
  `mobile/lib/routing/router.gr.dart`, `server/src/queries/*.sql`.
- **Docs:** run Prettier on markdown under `docs/` before committing — the CI Docs Build is strict
  and covers `docs/superpowers/specs`.
- **Commits:** conventional style; no `Co-Authored-By` or `Generated-with` trailers.

## 12. Follow-ups, deliberately deferred

- Multi-select on the **personal albums** page, reusing this manager with its own action set.
- Client-side chunking for very large selections, if E-16 proves slow in practice.
- Surfacing the album-owner-without-membership unlink path in the UI (§4.4), which is a pre-existing
  web/server asymmetry rather than something this feature introduces.
