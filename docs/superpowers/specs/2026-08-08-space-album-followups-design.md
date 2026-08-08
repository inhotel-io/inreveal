# Space album follow-ups: empty-state entry, audit dedup, dialog dedup

**Date:** 2026-08-08
**Branch:** `feat/space-album-rename-delete` (PR #961), folded in rather than stacked
**Related:** `2026-08-07-space-album-rename-delete-design.md`, `2026-08-05-space-album-folders-mobile-design.md`

Three independent fixes that share one branch. S1 is a UX gap found during manual testing of
#961; M2 and M9 are the two follow-ups the #961 whole-branch review deferred, which have no
record in git history outside this document.

---

## S1 — reach album management from a space with no albums

### Problem

On mobile, a space with zero linked albums offers an editor no way to create an album and no
way to reach album management at all. The Albums shelf renders `Albums (0)` plus a single
dashed tile wired to `onLinkTap`, which opens the picker for linking an **existing** album.

The entry point to the full management page is the header's "See all", and
`space_albums_shelf.widget.dart:84` gates it on the list being non-empty:

```dart
_HeaderRow(count: albums.length, showSeeAll: albums.isNotEmpty, onSeeAll: onSeeAll)
```

So the one route to album creation disappears exactly when the user most needs it — on a space
that has no albums yet.

This is a mobile-only divergence. On web the equivalent surface is a route,
`/spaces/[spaceId]/albums`, reachable from the space regardless of how many albums exist, with a
persistent "Create album" action. Mobile gates entry on content; web does not.

### Fix

Widen the gate to include editors:

```dart
_HeaderRow(
  count: albums.length,
  showSeeAll: albums.isNotEmpty || canEdit,
  onSeeAll: onSeeAll,
)
```

For the empty case this resolves to editors only, because line 75 already returns
`SizedBox.shrink()` for `albums.isEmpty && !canEdit`. A viewer on an empty space continues to
see nothing, which is correct — they can neither create nor link. A viewer on a non-empty space
keeps "See all" exactly as today.

The label is chosen from the same condition: `space_albums_see_all` when albums exist, a new
`space_albums_manage` ("Manage") when the list is empty. "See all" is a false promise when there
is nothing to see.

### What does not change

- **No layout change.** `kSpaceAlbumsShelfHeight` (196) already budgets the 32px header row, and
  `space_top_sliver.widget.dart:89` already reserves full shelf height for an editor on an empty
  space. The header renders today — only its right-hand side is empty.
- **No new navigation.** `space_detail.page.dart:447` already wires `onSeeAll` to push
  `SpaceAlbumsRoute`.
- **No new creation code.** The destination already exposes `createFolder` and `createAlbum` as
  app-bar actions (`space_albums.page.dart:759`, `:766`).
- **No server change.**

### Deliberately excluded

Adding a "New album" tile to the shelf itself. Creation stays on the management page, one tap
away, so album creation has exactly one implementation on mobile.

### Testing

Widget tests over `SpaceAlbumsShelf` for `{empty, non-empty} × {editor, viewer}`:

| albums    | canEdit | expected                                 |
| --------- | ------- | ---------------------------------------- |
| empty     | editor  | header entry present, labelled "Manage"  |
| empty     | viewer  | whole shelf absent (unchanged)           |
| non-empty | editor  | header entry present, labelled "See all" |
| non-empty | viewer  | header entry present, labelled "See all" |

Plus a click-through test that tapping the entry fires `onSeeAll` — the current suite has no
coverage of that callback firing.

---

## M2 — duplicate grant-revocation tombstone

### Problem

`shared_space_album_delete_audit()` (`server/src/schema/functions.ts:583`) writes
grant-revocation tombstones in two independent `INSERT`s:

- **Step 2** — one row per space **member** who has no other path to the album.
- **Step 3** — one row for the space **creator**, under the same gate.

Nothing makes the two sets disjoint, and the creator is **always** in the member set — not by
coincidence but by invariant:

- `SharedSpaceService.create()` inserts the creator via
  `addMember({ ..., role: SharedSpaceRole.Owner })`, so the member row exists from the moment the
  space does.
- That row can never be removed: self-removal is rejected with `Owner cannot leave the space`,
  and removal by another owner with `Cannot remove the space creator`.

So step 3 is unconditionally redundant with step 2, and the creator receives two tombstones for
every album-link delete, in every space. The separate creator branch reads as defensive — the
same shape appears in the sibling library-audit functions — but there is no reachable state in
which it is the only source of the creator's row.

Reproduced on a live stack: an album owned by a non-creator, linked into a space with three
members, then unlinked, yields

```
 email   | tombstones
---------+------------
 a@a.com |          2   <- creator AND member
 c@c.com |          1   <- member only
```

Pre-existing, not introduced by the rename/delete work. Harmless for sync — tombstones are
idempotent, so a client applying the same revocation twice reaches the same state. The cost is
unbounded growth of `shared_space_album_user_audit`.

### Fix

Collapse both inserts into one statement over a deduplicated user set, rather than adding a
`NOT IN` exclusion to step 3:

```sql
INSERT INTO shared_space_album_user_audit ("albumId", "userId")
SELECT DISTINCT o."albumId", u."userId"
FROM "old" o
INNER JOIN shared_space ss ON ss."id" = o."spaceId"
CROSS JOIN LATERAL (
  SELECT ssm."userId" FROM shared_space_member ssm WHERE ssm."spaceId" = o."spaceId"
  UNION
  SELECT ss."createdById"
) u
WHERE NOT user_has_album_path(o."albumId", u."userId", o."spaceId");
```

Three properties are load-bearing:

- **`UNION`, not `UNION ALL`** — this is what dedupes creator-as-member.
- **`INNER JOIN shared_space`** preserves the cascade guard both branches had (step 2 via its
  `EXISTS`, step 3 via its own join). During a `shared_space` delete the row is already gone, the
  join yields nothing, and fan-out is left to the BEFORE-row trigger on `shared_space`, exactly
  as before.
- **`DISTINCT`** additionally fixes a second duplication the current code has for an unrelated
  reason: an album unlinked from two spaces in one statement emits two identical
  `(albumId, userId)` rows, because the audit table carries no `spaceId`.

### Migration

`functions.ts` is the declarative source, but a deployed database keeps the old body until
replaced. Add a fork migration under `server/src/schema/migrations-gallery/` performing
`CREATE OR REPLACE FUNCTION`, on the next round timestamp (`1786100000000`, following
`1786000000000-SharedSpaceAlbumFolderAuditTable.ts`). Nothing under `migrations/` is touched, so
upstream rebases stay clean.

### Testing

A medium test (real PostgreSQL) that links an album owned by a non-creator into a space whose
creator is also a member, unlinks it, and asserts **exactly one** tombstone per affected user.
The failing baseline is already established above: two rows for the creator today.

---

## M9 — deduplicate the mobile rename and delete dialogs

### Problem

`space_album_detail.page.dart:381–471` defines `_promptAlbumName`, `_AlbumNameDialog` and
`_confirmDeleteAlbum` as a hand copy of the list page's `_promptName` / `_FolderNameDialog` and
its single-album delete confirm. The existing doc comment records why: "Duplicated rather than
imported: Dart's underscore-privacy is per-library-file, and that dialog is private to the list
page."

The risk is drift between two copies of a confirmation for an irreversible action. That is not
hypothetical on this branch — the `Delete ""?` defect was fixed on mobile and stayed live on web
because the same dialog existed twice.

### Fix

Extract to `mobile/lib/presentation/widgets/spaces/space_album_dialogs.dart`, exposing two
public functions:

- `promptSpaceAlbumName(...)` — the list page's generalised prompt, parameterised by `title`,
  `confirmLabel`, `label`, `keyPrefix` and `initialName`, since it already serves both album and
  folder call sites.
- `confirmDeleteSpaceAlbum(...)` — the single-album delete confirmation.

Both pages import it; both private copies are deleted. The detail page calls the shared prompt
with the album label and `space-album-name` prefix, which is what its private copy hardcoded.

**Widget key literals stay byte-identical** (`space-album-name-field` / `-cancel` / `-confirm`,
`space-album-delete-cancel` / `-confirm`). Every existing widget test therefore passes unchanged,
which is what makes this a verifiable refactor rather than a rewrite.

### Testing

No new behavioural tests. The existing rename and delete tests on both the list page and the
detail page are the regression net; they must pass without modification. If any test needs
editing, the extraction changed behaviour and is wrong.

---

## P2 — stale comment (drive-by)

`space_albums.page.dart:1078` documents the prompt's call sites as "The two ALBUM call sites
... the three FOLDER ones". There are **two** of each: `keyPrefix: 'space-album-name'` at lines
433 and 644, `keyPrefix: 'space-album-folder-name'` at 392 and 476. The comment is stale from
before commit `0032806` moved the "New album" dialog off the folder prefix. Correct the count.

---

## Out of scope

**P1** — `space-albums-table.svelte`'s `<thead>` has no leading `<th>` for the select column, so
the "Album name" header label sits 32px left of the row names while that column shows. Web-only,
pre-existing on `main` for every editor, and unrelated to the three fixes here. Tracked in the
#961 ledger.

## Verification

Each fix is independently verifiable and they touch disjoint code:

| Fix | Area                            | Gate                                |
| --- | ------------------------------- | ----------------------------------- |
| S1  | mobile widget                   | `flutter test` shelf widget tests   |
| M2  | server SQL function + migration | medium test against real PostgreSQL |
| M9  | mobile refactor                 | existing suites pass **unmodified** |

Full gates before pushing to #961: web unit, mobile `flutter test` + `dart analyze
--fatal-infos lib test` + `dart format`, server unit + medium, e2e on the touched spec, and
prettier over this document (CI Docs Build is strict).
