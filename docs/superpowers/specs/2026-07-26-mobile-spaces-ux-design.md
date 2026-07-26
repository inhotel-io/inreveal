# Mobile Spaces UX — edit a space, and add selections to spaces and space albums

**Date:** 2026-07-26
**Branch:** `worktree-feat+mobile-spaces-ux`
**Follows on from:** `2026-07-25-rename-spaces-design.md` (web rename/edit) and
`2026-07-25-space-add-to-collection-design.md` (web contribution mode).

## Problem

Two gaps make Spaces awkward to use from the phone.

1. **A space cannot be renamed on mobile.** `SharedSpaceApiRepository` has `create` and `delete` but no
   `update`, so there is no client path at all. The space detail kebab is wrapped in `if (_isOwner)` and
   holds exactly one item, "Delete Space" (`space_detail.page.dart:459`) — which also means **editors see
   no kebab whatsoever**, even though the server has permitted editors to rename since the server half of
   the web rename design shipped.
2. **Photos can only be added to a space from inside that space.** The flow today is inside-out: open the
   space → tap the 🖼️+ icon → pick assets (`space_detail.page.dart:123`). Space albums have the same
   shape via their kebab's "Add photos". The outside-in flow — select photos anywhere in the library, then
   send them to a space — does not exist. The main timeline's multi-select sheet mounts only `AlbumSelector`
   (`general_bottom_sheet.widget.dart:118`), so albums are the sole possible destination.

The web app closed both of these. This spec is the mobile counterpart, and it is the follow-up PR that
`2026-07-25-rename-spaces-design.md` explicitly deferred:

> **Mobile.** `mobile/lib/repositories/shared_space_api.repository.dart` has no `updateSpace` call at all.
> Adding one means a repository method, a bottom-sheet action, a dialog, and a local Drift write — its own PR.

## Goals

1. Space owners and editors can edit a space's name, description, and colour from mobile.
2. From a multi-select on the main timeline or a space timeline, a user can add the selection to a personal
   album, a space, or an album linked to a space.
3. No server changes, no DTO changes, no OpenAPI regeneration.

## Non-goals

- **Server work of any kind.** `PATCH /shared-spaces/:id` already accepts `name` / `description` / `color`
  and already gates naming at Editor (`shared-space.service.ts:274-282`, shipped with the web rename design).
  The Dart SDK already generates `updateSpace` and `SharedSpaceUpdateDto`.
- **Cross-owner contribution mode.** Deferred deliberately — see Risks R1.
- **Cover photo editing on mobile.** Mobile has no asset-picker-plus-crop surface; that is its own slice.
- **Target multi-select in the picker.** Tapping a row adds immediately, matching today's album behaviour.
  Web needs multi-select because it has a CTRL key; on mobile it would nest a selection mode inside the
  asset selection mode the user is already in.
- **A full i18n sweep of mobile Spaces.** Only strings on surfaces this work already modifies get keyed.

## What already exists

Everything below is load-bearing for the design and none of it needs changing.

| Piece                                       | Where                                                                        | Why it matters                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `PATCH /shared-spaces/:id`, Editor for name | `shared-space.service.ts:274-282`                                            | No server work; editors may already rename                                   |
| `updateSpace` + `SharedSpaceUpdateDto`      | `mobile/openapi/lib/api/shared_spaces_api.dart:2499`                         | Every field is `Optional<T?>`; absent ≠ null                                 |
| `sharedSpacesProvider`                      | `mobile/lib/providers/shared_space.provider.dart`                            | Network `getAll()`, carries `members` for role gating                        |
| `spaceAlbumsProvider(spaceId)`              | `mobile/lib/providers/infrastructure/space_album.provider.dart`              | **Local Drift stream** per space — lazy expansion is cheap and works offline |
| `SpaceAlbumActions.addAssets`               | `mobile/lib/providers/infrastructure/space_album_actions.dart:65`            | Routes around the absorbed-album foreign-key trap; fires its own sync nudge  |
| `actionProvider.addToAlbum`                 | `mobile/lib/providers/infrastructure/action.provider.dart:384`               | Existing remote+local dispatch, incl. upload-then-link for local assets      |
| `RemoteAlbumService.categorizeCandidates`   | called from `action.provider.dart:390`                                       | Splits a selection into remote ids and local assets needing upload           |
| `SpaceLinkPickerSheet.show`                 | `mobile/lib/presentation/widgets/remote_album/space_link_picker.widget.dart` | Precedent for a static-`show` bottom sheet instead of an `auto_route` page   |
| `spaceGradientColors`                       | `mobile/lib/widgets/spaces/space_collage.dart:7`                             | The ten space colours mobile already renders                                 |

**i18n.** Web and mobile share one `i18n/` directory, and **every key this work needs already exists there**,
so no new keys are added and everything ships already translated into all seven locales:

| Key                                     | Used for                                    |
| --------------------------------------- | ------------------------------------------- |
| `add_to_album_or_space`                 | Picker header                               |
| `add_to_space`                          | The pool child row inside an expanded space |
| `add_to_collection_restricted_to_space` | Non-owned-selection notice                  |
| `spaces_hidden_too_many_assets`         | Over-50 000-selection notice                |
| `added_to_space_count`                  | Success toast for a space-pool add          |
| `space_album_add_photos_success`        | Success toast for a space-album add         |
| `spaces_edit`                           | Edit sheet title and both menu items        |
| `spaces_edit_success`                   | Edit success toast                          |
| `errors.unable_to_update_space`         | Edit failure toast                          |
| `name`, `description`, `color`          | Edit sheet field labels                     |

Keying the hardcoded English on the two surfaces this work touches (Slice 8) needs no new keys either —
`spaces_delete` ("Delete Space") and `spaces_delete_confirmation` already exist.

`spaces_no_writable_spaces` is deliberately **not** used: web shows it as an empty state, whereas this design
omits the whole section when there is nothing writable (§3), so nothing would ever render it.

**Translation coverage — audited 2026-07-26, all present and genuinely localised** (not English fallbacks) in
every one of `de`, `fr`, `it`, `es`, `nl`, `pl`, `ru`, `zh_Hans`, `zh_Hant`, for all thirteen keys above plus
`spaces_delete` / `spaces_delete_confirmation`. Verified by value, e.g.:

| Key                                     | de                                              | ru                                               | zh_Hans                     |
| --------------------------------------- | ----------------------------------------------- | ------------------------------------------------ | --------------------------- |
| `spaces_edit`                           | Space bearbeiten                                | Изменить Space                                   | 编辑 Space                  |
| `add_to_space`                          | Zum Space hinzufügen                            | Добавить в Space                                 | 添加到 Space                |
| `spaces_delete`                         | Space löschen                                   | Удалить Space                                    | 删除 Space                  |
| `add_to_collection_restricted_to_space` | Deine Auswahl enthält Fotos anderer Mitglieder… | Ваш выбор содержит фотографии других участников… | 您的选择包含其他成员的照片… |

This is a direct consequence of reusing web's keys: the fork convention is that new keys land in `en.json`
only and are translated later, so **inventing a key here would ship an untranslated string into nine locales**.
That is the concrete reason §3 reuses `add_to_space` for the pool child rather than minting an
"Add to {space}" variant, and why the toasts in Slice 8 do not name their destination. If a future change does
need a new key, it must add all nine translations in the same PR.

## Design

### 1. Structure — compose, do not modify

`album_selector.widget.dart` and `general_bottom_sheet.widget.dart` are **pure upstream files**: every
commit touching either is an upstream PR (`206992605e2`, `cb1af3a8ec0`, `14aff51da9d`, …). They are also
850 and 124 lines respectively, and `AlbumSelector`'s search / quick-filter / sort / grid machinery is
album-specific.

So `AlbumSelector` stays byte-identical and gets composed rather than extended:

```
CollectionPicker (MultiSliver)
├── AlbumSelector            ← upstream, untouched
└── SpaceCollectionSection   ← new
```

Each upstream file takes a one-line diff swapping `AlbumSelector` for `CollectionPicker`, keeping future
rebases trivial. Album search, quick filters, sort, grid/list toggle and swipe-to-delete all keep working
because that code is not touched.

The cost is two search affordances in one sheet — album search at the top, the spaces section below it.
Accepted: the spaces list is short, grouped, and lives under its own header.

### 2. `CollectionTarget`

New sealed class in `mobile/lib/domain/models/collection_target.dart`, the Dart cousin of web's
`PickerCollection`. Its whole job is to make the dispatch table total and checked by the compiler.

| Variant            | Payload                  | Dispatch                               |
| ------------------ | ------------------------ | -------------------------------------- |
| `AlbumTarget`      | `RemoteAlbum`            | `actionProvider.addToAlbum` (existing) |
| `SpacePoolTarget`  | `SharedSpaceResponseDto` | `actionProvider.addToSpace` (new)      |
| `SpaceAlbumTarget` | `spaceId` + `SpaceAlbum` | `spaceAlbumActionsProvider.addAssets`  |

**`SpaceAlbumTarget` must never route through `addToAlbum`.** A linked album may be _absorbed_ — present
only in `shared_space_album` with no local `remote_album` row — and `addToAlbum` also writes the local
`remote_album_asset` junction, which would hit a foreign-key violation. `SpaceAlbumActions.addAssets`
exists precisely to avoid this and documents it at `space_album_actions.dart:56-64`. A test pins it.

### 3. `SpaceCollectionSection`

New `mobile/lib/presentation/widgets/collection/space_collection_section.widget.dart`.

Watches `sharedSpacesProvider`, filters to spaces the user can write to, and renders one row per space
under a "Spaces" header.

**Row behaviour.**

- A space **with** linked albums expands on tap. Its children are "Add to space" (the pool) followed by each
  linked album. The child label needs no space name — the parent row it is nested under already carries it,
  which is what lets the existing `add_to_space` key be reused verbatim.
- A space with **no** linked albums has nothing to expand into, so it renders as a plain row that adds to
  the pool on a single tap.

This costs one extra tap for the common case versus tap-to-add. That is the right trade on a _shared_
surface: an accidental add is visible to every member and writes an activity-feed entry for each of them,
so the destination must never be ambiguous.

Linked albums come from `spaceAlbumsProvider(spaceId)`, watched **only while a row is expanded**. It is a
local Drift stream, so expansion is cheap and works offline, and collapsed spaces subscribe to nothing.

**Gating.** The section renders in exactly one of four states:

| Condition                                                     | Rendering                                                        |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| No owner/editor space                                         | Section omitted entirely                                         |
| Selection contains an asset the user does not own             | Header + `add_to_collection_restricted_to_space` notice, no rows |
| Selection larger than `MAX_SPACE_ASSETS_PER_REQUEST` (50 000) | Header + `spaces_hidden_too_many_assets` notice, no rows         |
| Otherwise                                                     | Header + one row per writable space                              |

Local-only assets do **not** count as non-owned: they will be uploaded as the current user's.

### 4. `space_permissions.dart`

The owner/editor predicate exists twice today — `SpaceLinkPickerSheet._canWrite` and
`space_detail.page.dart`'s `_canEdit` / `_isOwner`. New `mobile/lib/utils/space_permissions.dart` holds one
implementation and all three sites point at it:

```dart
bool spaceIsWritable(SharedSpaceResponseDto space, String? currentUserId);
bool spaceIsOwned(SharedSpaceResponseDto space, String? currentUserId);
```

Creator-implies-owner is kept (`space.createdById == currentUserId` short-circuits), because the members
list does not always contain the creator. `members` is `Optional`, so an absent list degrades to the
`createdById` check rather than throwing.

### 5. Dispatch

New `actionProvider.addToSpace(ActionSource source, SharedSpaceResponseDto space)`, sitting beside
`addToAlbum` and returning the same `ActionResult(count, success, error)`.

Both space paths handle local assets by uploading first. **Unlike `addToAlbum`**, which links each asset as
it lands (it must, because it also writes the local Drift junction), the space paths collect the uploaded
remote ids and issue **one** add call at the end — otherwise `SpaceAlbumActions.addAssets` would fire its
`syncRemote()` nudge once per photo.

**Failure semantics.** Selection resets **only on success**, leaving the photos selected for retry after a
failure. This matches `addToAlbum`, which returns before its reset on the error path
(`action.provider.dart:398-404`). A space-pool add is all-or-nothing server-side —
`POST /shared-spaces/:id/assets` requires `AssetShare` on every id and rejects the whole request otherwise —
so a partial-success toast would be a lie. On failure: `scaffold_body_error_occurred` and nothing else. On
success: sync nudge, then the count toast.

### 6. `SpaceEditSheet`

New `mobile/lib/presentation/widgets/spaces/space_edit_sheet.widget.dart` with a static
`SpaceEditSheet.show(context, space) → Future<bool?>`, following the `SpaceLinkPickerSheet.show` precedent
rather than adding an `auto_route` page for a three-field form.

Fields mirror web's `SpaceEditModal`: **name** (required, `maxLength` 100), **description**
(`maxLength` 500), **colour** (the ten `spaceGradientColors` swatches).

- **Empty-name guard.** Save is disabled when `name.trim().isEmpty`, catching both the empty and the
  whitespace-only case before a request that `z.string().trim().min(1)` would reject with a 400.
- **Autofocus and select-once.** The name field autofocuses with its text selected, so typing replaces it.
  Only on the **first** focus — otherwise tapping to place the caret mid-word would re-select everything.

### 7. `SharedSpaceApiRepository.update`

```dart
Future<SharedSpaceResponseDto> update(
  String id, {
  String? name,
  String? description,
  UserAvatarColor? color,
});
```

Two things it must get right, both mirroring the web service:

- Every `SharedSpaceUpdateDto` field is `Optional<T?>`. Unchanged fields must be `Optional.absent()`, never
  `Optional.present(null)` — the latter clears them server-side.
- **Description is sent only when it changed.** A space created without one stores `null`; always sending
  `''` would clobber it on a pure rename, while omitting it when the user _did_ clear it would silently keep
  the old text. The caller decides "changed", the repository sends verbatim.

### 8. Entry points and RBAC

Naming and appearance are Editor-level server-side, but mobile's kebab is owner-gated today, so editors see
no kebab at all. Both entry points use `space_permissions.dart`:

|              | Viewer | Editor | Owner |
| ------------ | ------ | ------ | ----- |
| Edit space   | —      | ✅     | ✅    |
| Delete space | —      | —      | ✅    |

- **Space detail kebab** — gate flips from `_isOwner` to `_canEdit`, gaining "Edit space"; "Delete Space"
  stays owner-only _inside_ the menu.
- **Space card long-press** — `SpaceCard` gains `onLongPress`, opening a compact sheet with the same two
  role-gated items. A viewer long-pressing gets no sheet, since every item would be hidden.

**After a successful save**, invalidate `sharedSpacesProvider` and `sharedSpaceProvider(id)`, then fire the
`backgroundSyncProvider.syncRemote()` nudge every other space mutation already uses. The Drift
`shared_space_entity` stores `name`, `description` and `color` locally
(`shared_space.entity.dart:16-20`), so without the nudge the local row keeps the old name and the space
timeline's app bar stays stale until the next app start.

### 9. Surfaces

`CollectionPicker` is mounted in two bottom sheets:

- **`general_bottom_sheet.widget.dart`** — main timeline multi-select. Replaces the `AlbumSelector` sliver.
- **`space_bottom_sheet.widget.dart`** — space timeline multi-select, which today offers only
  share / download / favourite / remove-from-space. Gains the picker's slivers.

## Implementation slices

Test-first throughout: write the failing test, confirm it fails for the right reason, then implement.
Each slice is independently landable and leaves the tree green.

Dependency order: 1 → {2 → 3 → 4} and 1 → {5 → 6 → 7} → 8.

---

### Slice 1 — `space_permissions.dart`

**Goal.** One implementation of the writable/owned predicates; three call sites repointed.

**Files.** New `mobile/lib/utils/space_permissions.dart`. New
`mobile/test/utils/space_permissions_test.dart`. Edit `space_link_picker.widget.dart` and
`space_detail.page.dart` to delegate.

**Tests first (BDD).**

- Given a space whose `createdById` is me and whose members list omits me, when I ask if it is writable,
  then it is — and it is also owned.
- Given I am a member with role `owner` / `editor`, then writable is true.
- Given I am a member with role `viewer`, then writable is false and owned is false.
- Given I am not a member and did not create it, then both are false.
- Given `members` is `Optional.absent()`, then it falls back to the `createdById` check and does not throw.
- Given `currentUserId` is null (logged out), then both are false, even for a space with a matching creator id.

**Done when.** Both predicates are pure, `SpaceLinkPickerSheet._canWrite` and `space_detail.page.dart`'s
`_canEdit` / `_isOwner` are gone in favour of the helper, and behaviour on those two screens is unchanged.

---

### Slice 2 — `SharedSpaceApiRepository.update`

**Goal.** The rename call, with correct `Optional` semantics.

**Files.** Edit `mobile/lib/repositories/shared_space_api.repository.dart`. New
`mobile/test/repositories/shared_space_api_repository_test.dart` — no test file exists for this repository
today, so it is created here alongside the siblings in `mobile/test/repositories/`.

**Tests first (BDD).**

- Given only a new name, when update is called, then the DTO carries `Optional.present(name)` and
  `Optional.absent()` for description and colour.
- Given a description changed from text to `''`, then the DTO carries `Optional.present('')` — the clobber
  regression this design calls out.
- Given a description changed from `null` to text, then `Optional.present(text)`.
- Given description is not passed at all, then `Optional.absent()` — **never** `Optional.present(null)`.
- Given a colour change, then `Optional.present(color)`.
- Given a name with surrounding whitespace, then it is trimmed before sending.
- Given the API throws, then the exception propagates to the caller unchanged.

**Done when.** The method exists, is covered, and no other field of the DTO is ever populated.

---

### Slice 3 — `SpaceEditSheet`

**Goal.** The three-field form, with validation, in isolation from its entry points.

**Files.** New `mobile/lib/presentation/widgets/spaces/space_edit_sheet.widget.dart`. New
`mobile/test/widgets/spaces/space_edit_sheet_test.dart`.

**Tests first (BDD).**

- Given a space, when the sheet opens, then name, description and colour are prefilled from it.
- Given an empty name, then Save is disabled.
- Given a whitespace-only name `"   "`, then Save is disabled — the case a `required` flag would let through.
- Given the sheet just opened, then the name field is focused with its text selected; and given the user
  taps the field again, then the selection is **not** reapplied.
- Given name and description fields, then they enforce `maxLength` 100 and 500.
- Given only the name was edited, when saved, then the repository is called **without** a description.
- Given the description was cleared, when saved, then the repository is called with `''`.
- Given the user taps a colour swatch, then the selection moves and is sent on save.
- Given the save succeeds, then the sheet resolves `true`.
- Given the save throws, then the sheet stays open, resolves nothing, and shows
  `errors.unable_to_update_space`.
- Given the user cancels, then no repository call is made and it resolves `null`.

**Done when.** The sheet is fully covered and not yet reachable from any screen.

---

### Slice 4 — Edit entry points

**Goal.** Make the sheet reachable, and fix the editors-see-no-kebab bug.

**Files.** Edit `space_detail.page.dart` (kebab regate) and `mobile/lib/widgets/spaces/space_card.dart`
(`onLongPress`). New compact role-gated sheet for the card. Tests in
`mobile/test/pages/spaces/space_detail_kebab_test.dart` and `mobile/test/widgets/spaces/space_card_test.dart`.

**Tests first (BDD).**

- Given I am the owner, then the kebab shows "Edit space" and "Delete Space".
- Given I am an editor, then the kebab shows "Edit space" but **not** "Delete Space" — the regression fix.
- Given I am a viewer, then no kebab renders at all.
- Given I long-press a space card as owner, then a sheet offers Edit and Delete.
- Given I long-press as an editor, then it offers Edit only.
- Given I long-press as a viewer, then no sheet opens.
- Given a save returns `true`, then `sharedSpacesProvider` and `sharedSpaceProvider(id)` are invalidated and
  `syncRemote()` is called exactly once.
- Given a save returns `null` (cancelled), then nothing is invalidated and no sync nudge fires.

**Done when.** Editing works end to end from both entry points, and the RBAC table in §8 is pinned by tests.

---

### Slice 5 — `CollectionTarget` and dispatch

**Goal.** The routing table, tested without any UI.

**Files.** New `mobile/lib/domain/models/collection_target.dart`. Edit
`mobile/lib/providers/infrastructure/action.provider.dart` (add `addToSpace`). New
`mobile/test/providers/collection_dispatch_test.dart`.

**Tests first (BDD).**

- Given an `AlbumTarget`, then `addToAlbum` is called and neither space path is touched.
- Given a `SpacePoolTarget` with remote-only assets, then `SharedSpaceApiRepository.addAssets` is called
  once with every id.
- Given a `SpaceAlbumTarget`, then `SpaceAlbumActions.addAssets` is called and **`addToAlbum` is never
  called** — the absorbed-album foreign-key guard.
- Given a space target with local assets, then upload runs first and the add call is made **exactly once**
  with all resulting remote ids — not once per asset.
- Given an empty selection, then no API call is made and the result is a success with count 0.
- Given the upload fails, then no add call is made and the result is a failure.
- Given the add call throws, then the result is a failure **and the selection is not reset**.
- Given the add succeeds, then the selection is reset, `syncRemote()` fires, and the count comes from the
  server response rather than the request length.

**Done when.** Every row of the §2 dispatch table is covered, including the two never-call assertions.

---

### Slice 6 — `SpaceCollectionSection`

**Goal.** The spaces half of the picker, in isolation.

**Files.** New `mobile/lib/presentation/widgets/collection/space_collection_section.widget.dart`. New
`mobile/test/widgets/collection/space_collection_section_test.dart`.

**Tests first (BDD).**

- Given no writable spaces, then the section renders nothing at all — not an empty header.
- Given a mix of writable and viewer-only spaces, then only the writable ones are listed.
- Given a space with linked albums, when I tap its row, then it expands to show the `add_to_space` pool child
  followed by each album; tapping again collapses it.
- Given a space with **no** linked albums, then it renders as a plain row and a single tap emits a
  `SpacePoolTarget`.
- Given a collapsed space, then `spaceAlbumsProvider` for it is never watched.
- Given an expanded space whose album stream is still loading, then a loading affordance shows and the pool
  child remains tappable.
- Given an expanded space whose album stream errors, then the pool child still works and the album list
  shows an error rather than taking the section down.
- Given the selection contains a non-owned asset, then no space rows render and the restricted notice shows.
- Given the selection exceeds 50 000 assets, then no space rows render and `spaces_hidden_too_many_assets`
  shows.
- Given `sharedSpacesProvider` fails (offline), then the section hides rather than surfacing an error into
  a sheet whose album half still works.
- Given a tap on an album child, then a `SpaceAlbumTarget` carrying the **owning space's id** is emitted.

**Done when.** All four gating states from §3 and both row behaviours are covered.

---

### Slice 7 — `CollectionPicker` and the two sheets

**Goal.** Compose and mount, without regressing the album flow.

**Files.** New `mobile/lib/presentation/widgets/collection/collection_picker.widget.dart`. A one-line swap in
the upstream `general_bottom_sheet.widget.dart` (`AlbumSelector` → `CollectionPicker`). A slightly larger edit
to the fork-only `space_bottom_sheet.widget.dart`, which passes no `slivers:` today and so gains that argument
plus the `AddToAlbumHeader`/picker pair — still small, and unconstrained by rebase risk. New
`mobile/test/widgets/collection/collection_picker_test.dart` plus additions to the two sheet tests.

**Tests first (BDD).**

- Given the picker, then it renders the album selector above the spaces section.
- Given an album row is tapped, then the existing add-to-album behaviour runs unchanged — the regression guard.
- Given the album search, sort, quick-filter and grid/list controls, then they all still work.
- Given the keyboard-expand callback, then it is still threaded through to the album selector.
- Given the main timeline sheet, then it mounts the picker and spaces are offered.
- Given the space timeline sheet, then it mounts the picker alongside the existing
  share / download / favourite / remove-from-space actions.
- Given `AlbumSelector`, then its file is unchanged in this diff — asserted by review, not by test.

**Done when.** Both sheets offer all three target kinds and the album path is provably untouched.

---

### Slice 8 — i18n, toasts and gates

**Goal.** Ship-quality strings and a green CI.

**Files.** No `i18n/en.json` change — every key is already present (see the table in "What already exists").
Keying of the hardcoded English on the two surfaces this work touched: the space detail kebab and the space
card.

**Tests first (BDD).**

- Given a successful add of N photos to a space, then `added_to_space_count` shows with the server's count.
- Given a successful add to a space album, then `space_album_add_photos_success` shows with the server's count.
  Neither toast names the destination, because neither existing key takes a name argument and adding one would
  ship an untranslated string into seven locales for marginal gain.
- Given a failed add, then `scaffold_body_error_occurred` shows and no count is claimed.
- Given every new widget, then no user-visible literal English string remains.
- Given the space detail kebab and the space card sheet, then the delete items render `spaces_delete` and
  `spaces_delete_confirmation` rather than hardcoded English.
- Given the whole diff, then **no file under `i18n/` is modified at all** — the guard against quietly
  inventing a key, which would ship untranslated text into the nine locales this design commits to.

**Done when.** `dart analyze --fatal-infos lib test` and `dart format --set-exit-if-changed` both pass, and
`flutter test` is green.

Strings left hardcoded elsewhere in mobile Spaces — "Create Space", "Add Photos", "Remove from space",
"Members", "Space deleted", the spaces empty state — are **out of scope** and recorded as a follow-up rather
than swept up here.

## Running the tests

Per the repo's mobile notes: Flutter **3.41.7** (the pinned SDK — `mise.toml` may symlink an older patch).
From `mobile/`:

```bash
flutter pub get
dart run easy_localization:generate -S ../i18n && dart run bin/generate_keys.dart
flutter test test/...
```

Drift and OpenAPI generated code is committed, so `build_runner` is not needed. CI runs **two** Dart gates:
`dart analyze --fatal-infos lib test` (local `flutter analyze lib` misses test-only lints) and
`dart format --set-exit-if-changed`.

## Risks

**R1 — Contribution-mode parity gap with web.** `2026-07-25-space-add-to-collection-design.md` lets a space
Owner/Editor contribute _other members'_ photos into albums linked to that space. Mobile deliberately does
not: when the selection contains a non-owned asset, space targets are hidden behind a notice. This is an
informed deferral, not an oversight — mobile has zero contribution plumbing today, and the honest-notice
behaviour is strictly better than the alternative failure, where
`POST /shared-spaces/:id/assets` rejects the entire batch over one non-owned id and the user gets nothing
added plus a vague error. Closing the gap is a follow-up slice that would port `restrictToSpaceId`.

**R2 — The spaces section is network-backed while albums are local-first.** `sharedSpacesProvider` calls
`getAll()`, so offline the section hides while the album half of the picker keeps working. Acceptable
because the section is purely additive, but it means the picker's contents differ online and offline.
Expansion is unaffected — linked albums come from Drift.

**R3 — One upstream file is touched.** `general_bottom_sheet.widget.dart` is pure upstream and takes a
one-line diff swapping `AlbumSelector` for `CollectionPicker`. `space_bottom_sheet.widget.dart` is
**fork-only** (it exists solely in the squashed fork commit `e0950535c36`) and so may be edited freely.
`album_selector.widget.dart` is upstream and is not touched at all. Any temptation to grow the
`general_bottom_sheet` edit into a refactor should be resisted — it converts a trivial rebase into a
conflicting one.

**R4 — The absorbed-album foreign-key trap.** Routing a `SpaceAlbumTarget` through `addToAlbum` throws on an
absorbed album. This is exactly the sort of thing a well-meaning "unify the two add paths" refactor would
reintroduce, so Slice 5 pins it with an explicit never-called assertion rather than relying on the comment
at `space_album_actions.dart:56`.

**R5 — Rename staleness in Drift.** The local `shared_space_entity` caches `name`, so a rename without the
`syncRemote()` nudge leaves the space timeline's app bar showing the old name until the next app start.
Slice 4 tests the nudge fires exactly once.

**R6 — One extra tap to reach a space pool.** Spaces with linked albums need expand-then-tap. Chosen
deliberately for safety on a shared surface (§3). If it proves annoying in use, the fix is a trailing
"add here" affordance on the space row itself, not making the whole row tap-to-add.
