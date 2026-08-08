# Space album follow-ups: empty-state entry, audit dedup, dialog dedup

**Date:** 2026-08-08
**Branch:** `feat/space-album-rename-delete` (PR #961), folded in rather than stacked
**Related:** `2026-08-07-space-album-rename-delete-design.md`, `2026-08-05-space-album-folders-mobile-design.md`

Three independent fixes that share one branch. S1 is a UX gap found during manual testing of
#961; M2 and M9 are the two follow-ups the #961 whole-branch review deferred, which have no
record in git history outside this document.

Every fix is specified as BDD scenarios and implemented test-first. Each section states the
**RED** step (the exact command and the exact failure expected before any production change) and
the **GREEN** step. A fix whose RED step passes on the first run is not implemented — it means
the scenario does not pin the behaviour, and the scenario must be corrected before the
production change is written.

---

## S1 — reach album management from a space with no albums

### Problem

On mobile, a space with zero linked albums offers an editor no way to create an album and no way
to reach album management at all. The Albums shelf renders `Albums (0)` plus a single dashed tile
wired to `onLinkTap`, which opens the picker for linking an **existing** album.

The entry point to the management page is the header's "See all", and
`space_albums_shelf.widget.dart:84` gates it on the list being non-empty:

```dart
_HeaderRow(count: albums.length, showSeeAll: albums.isNotEmpty, onSeeAll: onSeeAll)
```

So the one route to album creation disappears exactly when the user most needs it.

This is a mobile-only divergence. On web the equivalent surface is a route,
`/spaces/[spaceId]/albums`, reachable regardless of album count, with a persistent "Create album"
action. Mobile gates entry on content; web does not.

### Who "editor" means here

`canEdit` is threaded from `space_detail.page.dart:114`, `spaceIsWritable(space, currentUserId)`
— the space-level owner/editor check. This is the same population the server requires for
`linkAlbum` (`shared-space.controller.ts:690`, "Requires space editor/owner"), so the affordance
and the permission agree. No RBAC widening.

### Fix

```dart
_HeaderRow(
  count: albums.length,
  showSeeAll: albums.isNotEmpty || canEdit,
  onSeeAll: onSeeAll,
)
```

For the empty case this resolves to editors only, because line 75 already returns
`SizedBox.shrink()` for `albums.isEmpty && !canEdit`.

**Label.** `space_albums_see_all` is `"See all ▸"` — the chevron lives **inside the translated
string**, not in the widget. The new key must therefore be `space_albums_manage: "Manage ▸"`, or
the empty state silently loses the chevron its neighbour has. Ten locales, matching how the
branch already ships `space_album_*` strings.

### What does not change

- **No layout change.** `kSpaceAlbumsShelfHeight` (196) already budgets the 32px header row, and
  `space_top_sliver.widget.dart:89` already reserves full shelf height for an editor on an empty
  space. The header renders today — only its right-hand side is empty.
- **No new navigation.** `space_detail.page.dart:447` already wires `onSeeAll` to push
  `SpaceAlbumsRoute`.
- **No new creation code.** The destination already exposes `createFolder` and `createAlbum`
  (`space_albums.page.dart:759`, `:766`).
- **No server change.**

### Deliberately excluded

A "New album" tile on the shelf itself. Creation stays on the management page, so album creation
has exactly one implementation on mobile.

### Existing coverage — read before writing tests

`mobile/test/presentation/widgets/spaces/space_albums_shelf_test.dart` already exists with eight
tests. Two matter here:

- **`:135` `'tapping "See all ▸" invokes the onSeeAll callback'`** already covers the
  click-through, tapping `find.text('See all ▸')`. Do **not** add a duplicate.
- **`:101` `'count==0 + canEdit=true: shows only the Link tile'`** is the test this change
  invalidates. Its name claims "**only** the Link tile", but its assertions only check that the
  link tile is present and that no cover tiles are. It asserts nothing about the header entry, so
  **it will keep passing after the fix while its name becomes false**. It must be rewritten as
  part of this change, not left to rot.

### BDD scenarios

```gherkin
Feature: Reaching album management from a space

  Scenario: Editor on an empty space can reach album management
    Given a space with zero linked albums
    And I am a space editor
    When the albums shelf renders
    Then I see the header entry labelled "Manage ▸"
    And I see the "Link an album" tile

  Scenario: Viewer on an empty space sees no shelf at all
    Given a space with zero linked albums
    And I am a space viewer
    When the albums shelf renders
    Then the shelf is absent entirely
    And no header entry is shown

  Scenario Outline: A populated space keeps the existing entry for everyone
    Given a space with at least one linked album
    And I am a space <role>
    When the albums shelf renders
    Then I see the header entry labelled "See all ▸"
    Examples: | role | editor | viewer |

  Scenario: The entry navigates to album management
    Given a space with zero linked albums
    And I am a space editor
    When I tap the header entry
    Then onSeeAll is invoked
```

### TDD sequence

**RED.** Rewrite `:101` to assert the header entry is present and labelled `"Manage ▸"`, and add
the editor-empty click-through scenario.

```
cd mobile && flutter test test/presentation/widgets/spaces/space_albums_shelf_test.dart
```

Expected failure, before touching the widget:
`Expected: exactly one matching candidate / Actual: Found 0 widgets with text "Manage ▸"`.

**GREEN.** Add the i18n key across ten locales, widen the gate, thread the label. Same command
passes, and the other seven pre-existing tests pass unmodified.

### Edge cases

| Case                         | Behaviour                                            | Covered by                                                       |
| ---------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Empty + editor               | header entry, labelled "Manage ▸"                    | rewritten `:101`                                                 |
| Empty + viewer               | shelf absent entirely (line 75, unchanged)           | existing `:112`                                                  |
| Non-empty + editor           | "See all ▸" unchanged                                | existing `:72` + new outline                                     |
| Non-empty + viewer           | "See all ▸" unchanged — viewers may browse albums    | new outline row                                                  |
| Provider `loading` / `error` | `SizedBox.shrink()`, no header (`widget.dart:67-68`) | new scenario — the entry must not flash in before albums resolve |
| `onSeeAll == null`           | `_HeaderRow` renders a non-tappable label            | new scenario — an editor must never see a dead "Manage ▸"        |

The last two are new: widening the gate makes the header reachable in states where it previously
could not appear, so both are regressions this change could introduce.

---

## M2 — duplicate grant-revocation tombstone

### Problem

`shared_space_album_delete_audit()` (`server/src/schema/functions.ts:583`) writes
grant-revocation tombstones in two independent `INSERT`s:

- **Step 2** — one row per space **member** with no other path to the album.
- **Step 3** — one row for the space **creator**, under the same gate.

Nothing makes the two sets disjoint, and in production the creator is always in the member set:
`SharedSpaceService.create()` inserts them via `addMember({ role: SharedSpaceRole.Owner })`, and
that row cannot be removed — self-removal is rejected with `Owner cannot leave the space`
(`shared-space.service.ts:613`) and removal by another owner with `Cannot remove the space
creator` (`:640`).

Reproduced on a live stack — album owned by a non-creator, linked into a three-member space, then
unlinked:

```
 email   | tombstones
---------+------------
 a@a.com |          2   <- creator AND member
 c@c.com |          1   <- member only
```

Pre-existing, not introduced by the rename/delete work. Harmless for sync — tombstones are
idempotent, so a client applying the same revocation twice reaches the same state. The cost is
unbounded growth of `shared_space_album_user_audit`.

### Why step 3 cannot simply be deleted

The invariant above is a **service** guarantee, not a database one. There is no constraint
binding `shared_space.createdById` to a `shared_space_member` row, and the medium-test factory
`newSharedSpace()` (`test/medium.factory.ts:336`) does **not** insert one — every existing test
adds members explicitly. So a creator-without-membership space is constructible at the level the
trigger operates on.

The fix therefore **merges** the creator into a deduplicated set rather than dropping the branch.
Deleting step 3 outright would be wrong.

### Fix

```sql
INSERT INTO shared_space_album_user_audit ("albumId", "userId")
SELECT DISTINCT o."albumId", u."userId"
FROM "old" o
INNER JOIN shared_space ss ON ss."id" = o."spaceId"
CROSS JOIN LATERAL (
  SELECT ssm."userId" FROM shared_space_member ssm WHERE ssm."spaceId" = o."spaceId"
  UNION                       -- UNION, not UNION ALL: dedupes creator-as-member
  SELECT ss."createdById"
) u
WHERE NOT user_has_album_path(o."albumId", u."userId", o."spaceId");
```

`user_has_album_path(target_album_id, target_user_id, exclude_space_id)` — argument order matches
`functions.ts:520-522`.

Three properties are load-bearing:

- **`UNION`, not `UNION ALL`** — dedupes creator-as-member.
- **`INNER JOIN shared_space`** preserves the cascade guard both branches had (step 2 via its
  `EXISTS`, step 3 via its own join). During a `shared_space` delete the row is already gone, the
  join yields nothing, and fan-out is left to the BEFORE-row trigger, exactly as before.
- **`DISTINCT`** additionally fixes a second duplication: the audit table carries no `spaceId`
  (`shared-space-album-user-audit.table.ts:20-31` — `id`, `albumId`, `userId`, `deletedAt`), so
  an album unlinked from two spaces in one statement emits two identical `(albumId, userId)`
  rows. No unique constraint exists to lean on instead; `shared-space-album-user-migration.spec.ts:123`
  pins that the table accepts such a row freely.

### Migration

`functions.ts` is the declarative source, but a deployed database keeps the old body until
replaced. Add a fork migration under `server/src/schema/migrations-gallery/` performing
`CREATE OR REPLACE FUNCTION`, at `1786100000000` (following
`1786000000000-SharedSpaceAlbumFolderAuditTable.ts`). Nothing under `migrations/` is touched, so
upstream rebases stay clean.

Rollback is the inverse `CREATE OR REPLACE` restoring the two-statement body; no data migration
is needed, because the change alters only what future deletes write. Existing duplicate rows are
left in place — they are harmless, and deleting audit history is riskier than keeping it.

### Existing coverage — verified, nothing breaks

The dedicated home for this trigger is
`server/test/medium/specs/sync/shared-space-album-delete-triggers.spec.ts`. Every assertion there
is a presence check (`.some(...)`) or a grant-state check (`toEqual([owner.id])`) — **no test
counts audit rows**. That is precisely why the duplicate went unnoticed for so long, and it means
the fix breaks no existing test. New scenarios go in this file.

### BDD scenarios

```gherkin
Feature: Grant-revocation tombstones on album unlink

  Scenario: The creator who is also a member gets exactly one tombstone
    Given a space whose creator is also a member
    And an album owned by a different user, linked into that space
    When the album is unlinked from the space
    Then the creator has exactly 1 grant-revocation tombstone
    And each other member with no remaining path has exactly 1

  Scenario: A creator who is NOT a member still gets a tombstone
    Given a space whose creator has no shared_space_member row
    And an album owned by a different user, linked into that space
    When the album is unlinked from the space
    Then the creator has exactly 1 grant-revocation tombstone

  Scenario: A user who retains access another way gets none
    Given a member holding an album_user role on the album
    When the album is unlinked from the space
    Then that member has 0 grant-revocation tombstones
    And their grant row is retained

  Scenario: Unlinking from two spaces at once emits one tombstone per user
    Given an album linked into two spaces sharing a member
    When both links are deleted in a single statement
    Then that member has exactly 1 grant-revocation tombstone

  Scenario: Deleting the space itself does not double up
    Given a space with a linked album and members
    When the space row is deleted
    Then the BEFORE-row trigger is the only source of tombstones
    And each affected user has exactly 1
```

### TDD sequence

**RED.** Add all five scenarios to `shared-space-album-delete-triggers.spec.ts` first.

```
cd server && npx vitest --config test/vitest.config.medium.mjs --run \
  test/medium/specs/sync/shared-space-album-delete-triggers.spec.ts
```

Expected: scenario 1 fails with `expected 2 to be 1`; scenario 4 fails the same way. Scenarios
2, 3 and 5 must **pass** before the change — they are the guards proving the merge preserves
existing behaviour. If scenario 1 passes at RED, the fixture is wrong (most likely the album is
owned by the creator, so `user_has_album_path` suppresses both inserts).

**GREEN.** Update `functions.ts`, add the migration, re-run. All five pass, plus the whole
`test/medium/specs/sync/` directory unchanged.

### Edge cases

| Case                                            | Expected                                      | Covered by                    |
| ----------------------------------------------- | --------------------------------------------- | ----------------------------- |
| Creator is a member (production invariant)      | 1 tombstone                                   | scenario 1                    |
| Creator is not a member (trigger-level)         | 1 tombstone — branch not dropped              | scenario 2                    |
| Member owns the album                           | 0 — `user_has_album_path` true                | scenario 3                    |
| Member holds an `album_user` role               | 0, grant retained                             | scenario 3                    |
| Album linked in 2 spaces, both unlinked at once | 1 per user, via `DISTINCT`                    | scenario 4                    |
| Album linked in 2 spaces, one unlinked          | 0 — path retained via the other space         | existing `:136`               |
| `DELETE FROM shared_space` cascade              | statement no-ops; BEFORE-row trigger fans out | scenario 5                    |
| Space with no members and no creator row        | 0 rows, no error                              | implied by scenario 2's shape |

Scenario 5 is the highest-risk regression of the merge: rewriting the join is exactly the kind of
change that can silently un-guard the cascade path and double every tombstone on space deletion.

---

## M9 — deduplicate the mobile rename and delete dialogs

### Problem

`space_album_detail.page.dart:381–471` defines `_promptAlbumName`, `_AlbumNameDialog` and
`_confirmDeleteAlbum` as a hand copy of the list page's `_promptName` / `_FolderNameDialog` and
its single-album delete confirm. The existing doc comment records why: "Duplicated rather than
imported: Dart's underscore-privacy is per-library-file, and that dialog is private to the list
page."

The risk is drift between two copies of a confirmation for an irreversible action — not
hypothetical on this branch, where the `Delete ""?` defect was fixed on mobile and stayed live on
web for exactly this reason.

### Fix

Extract to `mobile/lib/presentation/widgets/spaces/space_album_dialogs.dart`, exposing:

- `promptSpaceAlbumName(...)` — the list page's generalised prompt, parameterised by `title`,
  `confirmLabel`, `label`, `keyPrefix`, `initialName`, since it already serves album **and**
  folder call sites.
- `confirmDeleteSpaceAlbum(...)` — the single-album delete confirmation.

Both pages import it; both private copies are deleted. The detail page calls the shared prompt
with the album label and `space-album-name` prefix, which is what its private copy hardcoded.

**Widget key literals stay byte-identical** (`space-album-name-field` / `-cancel` / `-confirm`,
`space-album-delete-cancel` / `-confirm`). This is what makes the refactor verifiable.

### BDD scenario

```gherkin
Feature: One implementation of the album name and delete dialogs

  Scenario: Behaviour is identical after extraction
    Given the rename and delete dialogs are defined in one shared file
    When the existing mobile album suites run unmodified
    Then every test passes
    And no test file required an edit
```

### TDD sequence

This is a refactor, so the test suite is written first by virtue of already existing. The
discipline is inverted: **no test may be modified.**

**Baseline (must be green before touching anything):**

```
cd mobile && flutter test \
  test/presentation/pages/space_albums_page_test.dart \
  test/presentation/pages/space_album_detail_page_test.dart
```

**GREEN.** Extract, delete both private copies, re-run the identical command. If any assertion
needs editing to pass, the extraction changed behaviour and must be reverted and redone — that is
the acceptance criterion, not a guideline.

### Edge cases

| Case                                                        | Expected                             | Covered by                                                                         |
| ----------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| Folder call sites (2) still use the folder label and prefix | unchanged                            | existing folder tests in `space_albums_page_test.dart`                             |
| Album call sites (2) still use the album label and prefix   | unchanged                            | existing "New album" / rename tests                                                |
| Controller disposal on animated dialog pop                  | no "used after being disposed" crash | preserved by moving the `StatefulWidget` wholesale, not rewriting it as a function |
| Cancel returns null; blank name returns null                | unchanged                            | existing tests                                                                     |
| Detail-page delete confirm interpolates the real album name | unchanged                            | existing detail-page test                                                          |

The disposal case is the one real hazard: both copies are `StatefulWidget`s specifically because
a `TextEditingController` built inline is disposed before the pop animation finishes. The
extraction must move the widget, not "simplify" it.

---

## P2 — stale comment (drive-by)

`space_albums.page.dart:1078` documents the call sites as "The two ALBUM call sites ... the three
FOLDER ones". Verified counts: `keyPrefix: 'space-album-name'` at lines 433 and 644;
`keyPrefix: 'space-album-folder-name'` at lines 392 and 476. **Two of each.** The comment is
stale from before commit `0032806` moved the "New album" dialog onto the album prefix. Correct
the count.

---

## Out of scope

**P1** — `space-albums-table.svelte`'s `<thead>` has no leading `<th>` for the select column, so
the "Album name" header sits 32px left of the row names while that column shows. Web-only,
pre-existing on `main` for every editor, unrelated to the three fixes here. Tracked in the #961
ledger.

## Verification

| Fix | Area                     | Gate                                                                          |
| --- | ------------------------ | ----------------------------------------------------------------------------- |
| S1  | mobile widget            | `flutter test test/presentation/widgets/spaces/space_albums_shelf_test.dart`  |
| M2  | SQL function + migration | `vitest --config test/vitest.config.medium.mjs --run test/medium/specs/sync/` |
| M9  | mobile refactor          | the two album suites pass **unmodified**                                      |

Full gates before pushing to #961: web unit, mobile `flutter test` + `dart analyze
--fatal-infos lib test` + `dart format`, server unit + medium, e2e on the touched spec, i18n key
lint, and prettier over this document (CI Docs Build is strict).

Flutter must be the pinned **3.44.8** from `mobile/mise.toml`, invoked from
`~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin` — inside a worktree both
`mise exec` and `mise run` resolve against the main checkout and hand back the wrong SDK, which
fails pub solve before any test runs.
