# Space Album Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give mobile editors a route into album management on an empty space, stop the album-delete audit trigger writing a duplicate tombstone for the space creator, and collapse the duplicated mobile album dialogs into one implementation.

**Architecture:** Three independent fixes on one branch, touching disjoint code. S1 widens one boolean in a Flutter widget plus one i18n key. M2 rewrites one PL/pgSQL trigger body, shipped via a fork migration that must **UPDATE** an existing `migration_overrides` row. M9 hoists two dialog helpers out of a page file into a shared widget file, preserving every widget key so the existing suites are the regression net.

**Tech Stack:** Flutter 3.44.8 / Dart, Riverpod, `flutter_test`; NestJS + Kysely + PostgreSQL, Vitest medium tests against a real database via testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-08-space-album-followups-design.md`

## Global Constraints

- **Flutter must be the pinned 3.44.8** from `mobile/mise.toml`. Invoke binaries directly from `~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/{flutter,dart}`. Inside a git worktree both `mise exec` and `mise run` resolve against the **main checkout** and hand back Flutter 3.44.0, which fails pub solve before any test runs.
- **Never run `make sql` without a running database** — it deletes all generated query files.
- **`dart analyze --fatal-infos lib test` and `dart format` are two separate CI gates.** Both must be clean.
- **ESLint green does not imply Prettier green** — they are separate CI gates on the server side.
- **`withOpacity` is banned** by `dart analyze --fatal-infos`; use `withValues(alpha:)`.
- **i18n keys must be added to all ten locale files**: `en, de, es, fr, it, nl, pl, ru, zh_Hans, zh_Hant`. Keys are stored in **alphabetical order**.
- **Do not commit** `mobile/ios/Podfile.lock`, `Runner.xcodeproj/project.pbxproj`, or `Package.resolved` churn from local simulator builds.
- **Run Prettier on any markdown under `docs/`** — CI Docs Build is strict.
- **No `Co-Authored-By` or `Generated-with` trailers** in commit messages.

## File Structure

| File                                                                                      | Responsibility                                                                     | Task |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---- |
| `mobile/lib/presentation/widgets/spaces/space_albums_shelf.widget.dart`                   | Albums strip on the space page; owns the header entry gate and label               | 1    |
| `i18n/*.json` (10 files)                                                                  | `space_albums_manage` string                                                       | 1    |
| `mobile/test/presentation/widgets/spaces/space_albums_shelf_test.dart`                    | Shelf widget tests (already exists, 8 tests)                                       | 1    |
| `server/src/schema/functions.ts`                                                          | Declarative source of the trigger body                                             | 2    |
| `server/src/schema/migrations-gallery/1786100000000-DedupeSharedSpaceAlbumDeleteAudit.ts` | Applies the new body to deployed databases                                         | 2    |
| `server/test/medium/specs/sync/shared-space-album-delete-triggers.spec.ts`                | Trigger behaviour against real PostgreSQL (already exists)                         | 2    |
| `mobile/lib/presentation/widgets/spaces/space_album_dialogs.dart`                         | **New.** The single implementation of the album name prompt and the confirm dialog | 3    |
| `mobile/lib/pages/library/spaces/space_albums.page.dart`                                  | Albums list page — loses its private dialog copies                                 | 3    |
| `mobile/lib/pages/library/spaces/space_album_detail.page.dart`                            | Album detail page — loses its private dialog copies                                | 3    |

---

## Task 1: Reach album management from an empty space (S1)

**Files:**

- Modify: `mobile/lib/presentation/widgets/spaces/space_albums_shelf.widget.dart:84` and `:123-152`
- Modify: `i18n/en.json`, `i18n/de.json`, `i18n/es.json`, `i18n/fr.json`, `i18n/it.json`, `i18n/nl.json`, `i18n/pl.json`, `i18n/ru.json`, `i18n/zh_Hans.json`, `i18n/zh_Hant.json`
- Test: `mobile/test/presentation/widgets/spaces/space_albums_shelf_test.dart`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on. `SpaceAlbumsShelf`'s public constructor is unchanged — `spaceId`, `canEdit`, `onLinkTap`, `onAlbumTap`, `onSeeAll`.

**Context you need before starting.** The test file already exists with eight passing tests. Two are directly relevant:

- `:135` `'tapping "See all ▸" invokes the onSeeAll callback'` already covers click-through on a populated space. **Do not add a duplicate of it.**
- `:101` `'count==0 + canEdit=true: shows only the Link tile'` is named as though it asserts the header is absent, but it only checks that the link tile is present and that no cover tiles are. It will keep passing after this change while its name becomes false. **Rewriting it is the RED step.**

The chevron `▸` is part of the translated string (`"See all ▸"`), not the widget. The new key must carry it too.

- [ ] **Step 1: Write the failing tests**

Replace the whole `testWidgets('count==0 + canEdit=true: shows only the Link tile', ...)` block at `:101-110` with the following, and add the four new tests after it. Add `import 'dart:async';` to the top of the file.

```dart
  testWidgets('count==0 + canEdit=true: shows the Link tile AND a "Manage ▸" entry', (tester) async {
    await tester.pumpConsumerWidget(
      SpaceAlbumsShelf(spaceId: spaceId, canEdit: true, onLinkTap: () {}, onAlbumTap: (_) {}, onSeeAll: () {}),
      overrides: _overrides(spaceId: spaceId, albums: const []),
    );

    expect(find.byKey(const Key('space-album-link-tile')), findsOneWidget);
    expect(findByKeyPrefix('space-album-tile-'), findsNothing);
    // The entry into album management (create album / create folder) must be
    // reachable on an EMPTY space — that is the whole point of this fix.
    expect(find.text('Manage ▸'), findsOneWidget);
    // ...and it must not claim "See all" when there is nothing to see.
    expect(find.text('See all ▸'), findsNothing);
  });

  testWidgets('count==0 + canEdit=true: tapping "Manage ▸" invokes onSeeAll', (tester) async {
    var called = false;

    await tester.pumpConsumerWidget(
      SpaceAlbumsShelf(
        spaceId: spaceId,
        canEdit: true,
        onLinkTap: () {},
        onAlbumTap: (_) {},
        onSeeAll: () => called = true,
      ),
      overrides: _overrides(spaceId: spaceId, albums: const []),
    );

    await tester.tap(find.text('Manage ▸'));
    expect(called, isTrue);
  });

  testWidgets('count>0 + canEdit=false: viewer still sees "See all ▸"', (tester) async {
    final albums = [_album(id: 'a1', name: 'Hawaii')];

    await tester.pumpConsumerWidget(
      SpaceAlbumsShelf(spaceId: spaceId, canEdit: false, onLinkTap: () {}, onAlbumTap: (_) {}, onSeeAll: () {}),
      overrides: _overrides(spaceId: spaceId, albums: albums),
    );

    expect(find.text('See all ▸'), findsOneWidget);
    expect(find.text('Manage ▸'), findsNothing);
  });

  testWidgets('provider still loading: renders nothing, so no entry flashes in', (tester) async {
    await tester.pumpConsumerWidget(
      SpaceAlbumsShelf(spaceId: spaceId, canEdit: true, onLinkTap: () {}, onAlbumTap: (_) {}, onSeeAll: () {}),
      overrides: [
        // A stream that never emits keeps the provider in AsyncLoading.
        spaceAlbumsProvider(spaceId).overrideWith((_) => Stream<List<SpaceAlbum>>.fromFuture(Completer<List<SpaceAlbum>>().future)),
      ],
    );

    expect(find.byKey(const Key('space-albums-shelf')), findsNothing);
    expect(find.text('Manage ▸'), findsNothing);
  });

  testWidgets('onSeeAll omitted: the entry is not rendered, so it can never be dead', (tester) async {
    await tester.pumpConsumerWidget(
      // No onSeeAll passed.
      SpaceAlbumsShelf(spaceId: spaceId, canEdit: true, onLinkTap: () {}, onAlbumTap: (_) {}),
      overrides: _overrides(spaceId: spaceId, albums: const []),
    );

    expect(find.byKey(const Key('space-album-link-tile')), findsOneWidget);
    expect(find.text('Manage ▸'), findsNothing);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/flutter test \
  test/presentation/widgets/spaces/space_albums_shelf_test.dart
```

Expected: FAIL. The first three new tests fail with
`Expected: exactly one matching candidate / Actual: _TextWidgetFinder:<Found 0 widgets with text "Manage ▸": []>`.
The `loading` and `onSeeAll omitted` tests should already PASS — they are guards, not drivers.

If the `count==0` test passes at this point, you edited the widget before the test. Revert and start again.

- [ ] **Step 3: Add the i18n key to all ten locales**

Insert alphabetically, between `space_albums_load_failed` and `space_albums_no_match` (l < m < n):

```
en.json        "space_albums_manage": "Manage ▸",
de.json        "space_albums_manage": "Verwalten ▸",
es.json        "space_albums_manage": "Gestionar ▸",
fr.json        "space_albums_manage": "Gérer ▸",
it.json        "space_albums_manage": "Gestisci ▸",
nl.json        "space_albums_manage": "Beheren ▸",
pl.json        "space_albums_manage": "Zarządzaj ▸",
ru.json        "space_albums_manage": "Управление ▸",
zh_Hans.json   "space_albums_manage": "管理 ▸",
zh_Hant.json   "space_albums_manage": "管理 ▸",
```

- [ ] **Step 4: Regenerate the Dart translation bindings**

The generated files are gitignored, so tests will not see the new key until this runs.

```bash
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/dart \
  run easy_localization:generate -S ../i18n
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/dart \
  run bin/generate_keys.dart
```

Do **not** use `mise run codegen:translation` — inside a worktree it resolves to the main checkout and the wrong Flutter.

- [ ] **Step 5: Widen the gate**

In `space_albums_shelf.widget.dart`, change the `_HeaderRow` call at `:84`:

```dart
          // Header row: "Albums (N)  See all ▸" — the entry stays reachable for an
          // editor even at zero albums, because that is the only route to album
          // creation. Viewers at zero albums never get here: line 75 already
          // returned SizedBox.shrink().
          _HeaderRow(count: albums.length, showSeeAll: albums.isNotEmpty || canEdit, onSeeAll: onSeeAll),
```

- [ ] **Step 6: Pick the label from the count**

In `_HeaderRow.build`, replace the `if (showSeeAll)` block:

```dart
          if (showSeeAll && onSeeAll != null)
            GestureDetector(
              onTap: onSeeAll,
              child: Text(
                // "See all" is a false promise when the list is empty; the empty
                // state's job is to get the editor to album creation.
                (count == 0 ? 'space_albums_manage' : 'space_albums_see_all').t(context: context),
                style: context.textTheme.bodySmall?.copyWith(color: context.colorScheme.primary),
              ),
            ),
```

Note the added `&& onSeeAll != null`: with the gate widened, a caller that omits `onSeeAll` would otherwise render a label that does nothing.

This guard also changes a pre-existing case — a **populated** shelf built without `onSeeAll` used to render an inert "See all ▸" and now renders nothing. That is verified safe:

- The only production caller, `space_detail.page.dart:438-447`, always passes `onSeeAll`.
- No test outside the shelf spec asserts on the "See all ▸" text (`space_detail_top_sliver_test.dart` and `spaces_page_test.dart` contain no such assertion).
- Within the shelf spec, the two tests that construct the widget without `onSeeAll` (`:72`, `:86`) assert on widget **keys** only, never that text.

If a future caller wants the label without navigation, it should pass a callback, not rely on a dead label.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/flutter test \
  test/presentation/widgets/spaces/space_albums_shelf_test.dart
```

Expected: PASS, 12 tests. The seven pre-existing tests must pass **unmodified** — if any needed an edit, the change altered behaviour it should not have.

- [ ] **Step 8: Run the adjacent suites that render the shelf**

```bash
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/flutter test \
  test/presentation/pages/space_detail_top_sliver_test.dart \
  test/presentation/pages/spaces_page_test.dart
```

Expected: PASS. The shelf height is unchanged, so `space_detail_top_sliver_test.dart` must not move.

- [ ] **Step 9: Lint and format**

```bash
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/dart analyze --fatal-infos lib test
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/dart format \
  --set-exit-if-changed lib/presentation/widgets/spaces/space_albums_shelf.widget.dart \
  test/presentation/widgets/spaces/space_albums_shelf_test.dart
npx prettier --check i18n/*.json
```

Expected: `No issues found!`, `0 changed`, and Prettier clean. If Prettier reports the i18n files, run `npx prettier --write i18n/*.json`.

- [ ] **Step 10: Commit**

```bash
git add mobile/lib/presentation/widgets/spaces/space_albums_shelf.widget.dart \
        mobile/test/presentation/widgets/spaces/space_albums_shelf_test.dart \
        i18n/
git commit -m "fix(mobile): let an editor reach album management from an empty space"
```

---

## Task 2: Stop the album-delete audit writing a duplicate tombstone (M2)

**Files:**

- Modify: `server/src/schema/functions.ts:583-610`
- Create: `server/src/schema/migrations-gallery/1786100000000-DedupeSharedSpaceAlbumDeleteAudit.ts`
- Test: `server/test/medium/specs/sync/shared-space-album-delete-triggers.spec.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on. The exported symbol `shared_space_album_delete_audit` keeps its name and signature; only the `body` string changes.

**Context you need before starting.**

The trigger writes tombstones in two independent statements — one per space **member**, one for the space **creator** — and nothing makes them disjoint. In production the creator is always a member (`SharedSpaceService.create()` adds them as an Owner; `shared-space.service.ts:613` and `:640` prevent removal), so the creator gets two rows on every album-link delete.

**Do not "simplify" by deleting step 3.** That invariant is enforced by the service, not the database: no constraint binds `shared_space.createdById` to a member row, and the medium-test factory `newSharedSpace()` does not create one. The fix merges the two sets; it does not drop the creator.

**Two facts that make this safe:** every existing assertion in the target spec is a presence check (`.some(...)`) or a grant-state check, never an audit row count — which is why this survived — and the cascade case is already guarded by an existing test at `:236-260` that asserts `toHaveLength(1)` with the comment _"a regressed guard would produce a duplicate here."_ That test is your safety net for the riskiest part of this change. Do not duplicate it.

- [ ] **Step 1: Add the audit helper and the failing tests**

At the top of `shared-space-album-delete-triggers.spec.ts`, beside the existing `grantsFor` helper at `:12`, add:

```ts
const auditFor = (albumId: string) =>
  db.selectFrom('shared_space_album_user_audit').selectAll().where('albumId', '=', albumId).execute();
```

Then append this describe block to the end of the file:

```ts
// ---------------------------------------------------------------------------
// M2: the creator must receive exactly ONE grant-revocation tombstone.
//
// Steps 2 and 3 of shared_space_album_delete_audit insert independently — one
// per member, one for the creator — and the creator is always a member in
// production (SharedSpaceService.create adds them as Owner; they cannot leave
// or be removed). The creator therefore got two rows per delete.
// ---------------------------------------------------------------------------

describe('shared_space_album_delete_audit — tombstone deduplication', () => {
  it('writes exactly one tombstone for a creator who is also a member', async () => {
    const ctx = new SyncTestContext(db);
    const { user: creator } = await ctx.newUser();
    const { user: albumOwner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    // Owned by someone else, so the creator genuinely loses access on unlink.
    const { album } = await ctx.newAlbum({ ownerId: albumOwner.id });
    const { space } = await ctx.newSharedSpace({ createdById: creator.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: creator.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Viewer });
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: creator.id })
      .execute();

    await db.deleteFrom('shared_space_album').where('spaceId', '=', space.id).where('albumId', '=', album.id).execute();

    const audit = await auditFor(album.id);
    expect(audit.filter((r) => r.userId === creator.id)).toHaveLength(1);
    expect(audit.filter((r) => r.userId === member.id)).toHaveLength(1);
  });

  it('still writes one tombstone for a creator who is NOT a member', async () => {
    // Guards against a future "step 3 is redundant, delete it" simplification:
    // the member/creator overlap is a SERVICE invariant, not a schema one.
    const ctx = new SyncTestContext(db);
    const { user: creator } = await ctx.newUser();
    const { user: albumOwner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: albumOwner.id });
    const { space } = await ctx.newSharedSpace({ createdById: creator.id });
    // Deliberately NO shared_space_member row for the creator.
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: creator.id })
      .execute();

    await db.deleteFrom('shared_space_album').where('spaceId', '=', space.id).where('albumId', '=', album.id).execute();

    const audit = await auditFor(album.id);
    expect(audit.filter((r) => r.userId === creator.id)).toHaveLength(1);
  });

  it('writes no tombstone for a member who keeps access via an album_user role', async () => {
    const ctx = new SyncTestContext(db);
    const { user: creator } = await ctx.newUser();
    const { user: albumOwner } = await ctx.newUser();
    const { user: shared } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: albumOwner.id });
    await db
      .insertInto('album_user')
      .values({ albumId: album.id, userId: shared.id, role: AlbumUserRole.Editor })
      .execute();
    const { space } = await ctx.newSharedSpace({ createdById: creator.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: creator.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: shared.id, role: SharedSpaceRole.Viewer });
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: creator.id })
      .execute();

    await db.deleteFrom('shared_space_album').where('spaceId', '=', space.id).where('albumId', '=', album.id).execute();

    const audit = await auditFor(album.id);
    expect(audit.filter((r) => r.userId === shared.id)).toHaveLength(0);
  });

  it('writes one tombstone per user when an album is unlinked from two spaces in one statement', async () => {
    // The audit table has no spaceId column, so two deleted links produce two
    // identical (albumId, userId) rows without a DISTINCT.
    const ctx = new SyncTestContext(db);
    const { user: creator } = await ctx.newUser();
    const { user: albumOwner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: albumOwner.id });
    const { space: s1 } = await ctx.newSharedSpace({ createdById: creator.id });
    const { space: s2 } = await ctx.newSharedSpace({ createdById: creator.id });
    for (const s of [s1, s2]) {
      await ctx.newSharedSpaceMember({ spaceId: s.id, userId: creator.id, role: SharedSpaceRole.Owner });
      await ctx.newSharedSpaceMember({ spaceId: s.id, userId: member.id, role: SharedSpaceRole.Viewer });
      await db
        .insertInto('shared_space_album')
        .values({ spaceId: s.id, albumId: album.id, addedById: creator.id })
        .execute();
    }

    // ONE statement removing BOTH links → the statement-level trigger sees both in "old".
    await db.deleteFrom('shared_space_album').where('albumId', '=', album.id).execute();

    const audit = await auditFor(album.id);
    expect(audit.filter((r) => r.userId === member.id)).toHaveLength(1);
    expect(audit.filter((r) => r.userId === creator.id)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd server && npx vitest --config test/vitest.config.medium.mjs --run \
  test/medium/specs/sync/shared-space-album-delete-triggers.spec.ts
```

Expected: the first test fails with `expected 2 to be 1` (creator), and the fourth fails the same way. The second and third must **PASS** already — they pin behaviour the fix must preserve.

If the first test passes, the fixture is wrong. The most likely cause is that the album is owned by the creator, so `user_has_album_path` returns true and suppresses both inserts. Check `newAlbum({ ownerId: albumOwner.id })` uses a different user from `createdById`.

- [ ] **Step 3: Rewrite the function body**

In `server/src/schema/functions.ts`, replace the `body` of `shared_space_album_delete_audit` (`:587-609`) with:

```ts
  body: `
    BEGIN
      -- 1. Always record the (space, album) link delete (ungated) so clients drop the space-album.
      INSERT INTO shared_space_album_audit ("spaceId", "albumId")
      SELECT "spaceId", "albumId" FROM "old";

      -- 2. Gated grant revocation for every member AND the space creator, as ONE
      --    deduplicated set. They were two independent INSERTs, and the creator is
      --    always also a member (SharedSpaceService.create adds them as Owner and
      --    they cannot leave), so the creator received two tombstones per delete.
      --
      --    UNION (not UNION ALL) collapses creator-as-member. The creator arm is
      --    KEPT, not dropped: nothing in the schema binds createdById to a member
      --    row, so a creator without membership must still be revoked.
      --
      --    DISTINCT additionally collapses the same user arriving via two deleted
      --    links in one statement — the audit table has no "spaceId" to separate them.
      --
      --    INNER JOIN shared_space preserves the cascade guard the previous two arms
      --    had: during a shared_space delete the row is already gone, this yields
      --    nothing, and the BEFORE-row trigger on shared_space does the fan-out.
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

      RETURN NULL;
    END`,
```

- [ ] **Step 4: Write the migration**

Create `server/src/schema/migrations-gallery/1786100000000-DedupeSharedSpaceAlbumDeleteAudit.ts`.

**`migration_overrides.name` is the PRIMARY KEY and a row named `function_shared_space_album_delete_audit` already exists** (inserted by `1779200000000-AddSharedSpaceAlbumDeleteSideTriggers.ts:88`). This migration must **UPDATE** it. An `INSERT` fails with a unique violation. The trigger definition is unchanged, so `trigger_shared_space_album_delete_audit` is left alone.

```ts
import { Kysely, sql } from 'kysely';

// M2 — shared_space_album_delete_audit wrote TWO grant-revocation tombstones for the space
// creator, because the per-member arm and the per-creator arm were independent INSERTs and the
// creator is always also a member. Merge them into one UNION-deduplicated set. The creator arm is
// preserved (no schema constraint binds createdById to a member row), and DISTINCT also collapses
// the same user arriving via two links deleted in a single statement.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE OR REPLACE FUNCTION shared_space_album_delete_audit()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
  AS $$
    BEGIN
      INSERT INTO shared_space_album_audit ("spaceId", "albumId")
      SELECT "spaceId", "albumId" FROM "old";

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

      RETURN NULL;
    END
  $$;`.execute(db);

  await sql`UPDATE "migration_overrides"
    SET "value" = '{"type":"function","name":"shared_space_album_delete_audit","sql":"CREATE OR REPLACE FUNCTION shared_space_album_delete_audit()\\n  RETURNS TRIGGER\\n  LANGUAGE PLPGSQL\\n  AS $$\\n    BEGIN\\n      INSERT INTO shared_space_album_audit (\\"spaceId\\", \\"albumId\\")\\n      SELECT \\"spaceId\\", \\"albumId\\" FROM \\"old\\";\\n\\n      INSERT INTO shared_space_album_user_audit (\\"albumId\\", \\"userId\\")\\n      SELECT DISTINCT o.\\"albumId\\", u.\\"userId\\"\\n      FROM \\"old\\" o\\n      INNER JOIN shared_space ss ON ss.\\"id\\" = o.\\"spaceId\\"\\n      CROSS JOIN LATERAL (\\n        SELECT ssm.\\"userId\\" FROM shared_space_member ssm WHERE ssm.\\"spaceId\\" = o.\\"spaceId\\"\\n        UNION\\n        SELECT ss.\\"createdById\\"\\n      ) u\\n      WHERE NOT user_has_album_path(o.\\"albumId\\", u.\\"userId\\", o.\\"spaceId\\");\\n\\n      RETURN NULL;\\n    END\\n  $$;"}'::jsonb
    WHERE "name" = 'function_shared_space_album_delete_audit';`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`CREATE OR REPLACE FUNCTION shared_space_album_delete_audit()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
  AS $$
    BEGIN
      INSERT INTO shared_space_album_audit ("spaceId", "albumId")
      SELECT "spaceId", "albumId" FROM "old";

      INSERT INTO shared_space_album_user_audit ("albumId", "userId")
      SELECT o."albumId", ssm."userId"
      FROM "old" o
      INNER JOIN shared_space_member ssm ON ssm."spaceId" = o."spaceId"
      WHERE EXISTS (SELECT 1 FROM shared_space ss WHERE ss.id = o."spaceId")
        AND NOT user_has_album_path(o."albumId", ssm."userId", o."spaceId");

      INSERT INTO shared_space_album_user_audit ("albumId", "userId")
      SELECT o."albumId", ss."createdById"
      FROM "old" o
      INNER JOIN shared_space ss ON ss."id" = o."spaceId"
      WHERE NOT user_has_album_path(o."albumId", ss."createdById", o."spaceId");

      RETURN NULL;
    END
  $$;`.execute(db);

  await sql`UPDATE "migration_overrides"
    SET "value" = '{"type":"function","name":"shared_space_album_delete_audit","sql":"CREATE OR REPLACE FUNCTION shared_space_album_delete_audit()\\n  RETURNS TRIGGER\\n  LANGUAGE PLPGSQL\\n  AS $$\\n    BEGIN\\n      -- 1. Always record the (space, album) link delete (ungated) so clients drop the space-album.\\n      INSERT INTO shared_space_album_audit (\\"spaceId\\", \\"albumId\\")\\n      SELECT \\"spaceId\\", \\"albumId\\" FROM \\"old\\";\\n\\n      -- 2. Gated grant revocation per member; skips during shared_space cascade (BEFORE-row handles it).\\n      INSERT INTO shared_space_album_user_audit (\\"albumId\\", \\"userId\\")\\n      SELECT o.\\"albumId\\", ssm.\\"userId\\"\\n      FROM \\"old\\" o\\n      INNER JOIN shared_space_member ssm ON ssm.\\"spaceId\\" = o.\\"spaceId\\"\\n      WHERE EXISTS (SELECT 1 FROM shared_space ss WHERE ss.id = o.\\"spaceId\\")\\n        AND NOT user_has_album_path(o.\\"albumId\\", ssm.\\"userId\\", o.\\"spaceId\\");\\n\\n      -- 3. Gated grant revocation for the space creator.\\n      INSERT INTO shared_space_album_user_audit (\\"albumId\\", \\"userId\\")\\n      SELECT o.\\"albumId\\", ss.\\"createdById\\"\\n      FROM \\"old\\" o\\n      INNER JOIN shared_space ss ON ss.\\"id\\" = o.\\"spaceId\\"\\n      WHERE NOT user_has_album_path(o.\\"albumId\\", ss.\\"createdById\\", o.\\"spaceId\\");\\n\\n      RETURN NULL;\\n    END\\n  $$;"}'::jsonb
    WHERE "name" = 'function_shared_space_album_delete_audit';`.execute(db);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd server && npx vitest --config test/vitest.config.medium.mjs --run \
  test/medium/specs/sync/shared-space-album-delete-triggers.spec.ts
```

Expected: PASS, all tests including the four new ones and the pre-existing cascade guard at `:236-260`.

- [ ] **Step 6: Run the whole sync medium suite**

The trigger feeds `SharedSpaceAlbumSync.getDeletes`, so the sync specs are the blast radius.

```bash
cd server && npx vitest --config test/vitest.config.medium.mjs --run test/medium/specs/sync/
```

Expected: PASS, no test modified.

- [ ] **Step 7: Verify the migration applies and the schema is not drifting**

```bash
cd server && npx vitest --config test/vitest.config.medium.mjs --run \
  test/medium/specs/services/database-migration.service.spec.ts
```

Expected: PASS. A failure here means the `migration_overrides` value does not match the `functions.ts` body — the two SQL strings must be identical modulo the JSON escaping. Re-copy the body rather than hand-editing the escapes.

- [ ] **Step 8: Lint and format**

```bash
cd server && npx eslint src/schema/functions.ts src/schema/migrations-gallery/1786100000000-DedupeSharedSpaceAlbumDeleteAudit.ts \
  test/medium/specs/sync/shared-space-album-delete-triggers.spec.ts
cd server && npx prettier --check src/schema/functions.ts \
  src/schema/migrations-gallery/1786100000000-DedupeSharedSpaceAlbumDeleteAudit.ts \
  test/medium/specs/sync/shared-space-album-delete-triggers.spec.ts
```

Expected: both clean. ESLint passing does not imply Prettier passing — they are separate CI gates.

- [ ] **Step 9: Commit**

```bash
git add server/src/schema/functions.ts \
        server/src/schema/migrations-gallery/1786100000000-DedupeSharedSpaceAlbumDeleteAudit.ts \
        server/test/medium/specs/sync/shared-space-album-delete-triggers.spec.ts
git commit -m "fix(server): stop the album-delete audit double-tombstoning the space creator"
```

---

## Task 3: Collapse the duplicated mobile album dialogs (M9 + P2)

**Files:**

- Create: `mobile/lib/presentation/widgets/spaces/space_album_dialogs.dart`
- Modify: `mobile/lib/pages/library/spaces/space_albums.page.dart` (remove `_promptName` `:1082-1102`, `_FolderNameDialog` `:1115-1176`, `_confirmBulkAction` `:1209-1238`; fix the comment at `:1078`)
- Modify: `mobile/lib/pages/library/spaces/space_album_detail.page.dart` (remove `_promptAlbumName` `:381-388`, `_AlbumNameDialog` `:396-441`, `_confirmDeleteAlbum` `:449-471`)
- Test: no test file may be modified

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces:
  - `Future<String?> promptSpaceAlbumName(BuildContext context, {required String title, required String confirmLabel, required String label, required String keyPrefix, String initialName = ''})`
  - `Future<bool> confirmSpaceAlbumAction(BuildContext context, {required String title, required String content, required String confirmLabel, required Key cancelKey, required Key confirmKey, bool destructive = false})`
  - `class SpaceAlbumNameDialog extends StatefulWidget`

**Context you need before starting.** This is a pure refactor. The acceptance criterion is that **every existing test passes without being edited.** If you find yourself changing an assertion, the extraction changed behaviour — revert and redo.

Two hazards:

1. Both name dialogs are `StatefulWidget`s specifically so the `TextEditingController` is disposed on unmount rather than when `showDialog` resolves — the pop is animated, so the field is still in the tree after the awaited future completes. Disposing early crashes with _"A TextEditingController was used after being disposed."_ **Move the widget; do not rewrite it as a function.**
2. Widget keys are the contract with the tests. Every key literal must survive byte-identical: `space-album-name-field` / `-cancel` / `-confirm`, `space-album-folder-name-*`, `space-album-delete-cancel` / `-confirm`.

The detail page's `_confirmDeleteAlbum` and the list page's single-album delete are the _same dialog_: same title key `space_album_delete`, same content key `space_album_delete_confirm`, same keys, both destructive. The list page reaches it through the parameterised `_confirmBulkAction`; the detail page hardcodes it. `confirmSpaceAlbumAction` is `_confirmBulkAction` moved out, and the detail page becomes a caller.

- [ ] **Step 1: Establish the green baseline**

```bash
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/flutter test \
  test/presentation/pages/space_albums_page_test.dart \
  test/presentation/pages/space_album_detail_page_test.dart \
  test/presentation/widgets/spaces/space_album_kebab_test.dart \
  test/presentation/widgets/spaces/space_album_bottom_sheet_test.dart
```

Expected: PASS. Record the test count — it must be identical at the end. If this is not green before you start, stop: you cannot attribute later failures.

- [ ] **Step 2: Create the shared dialogs file**

Create `mobile/lib/presentation/widgets/spaces/space_album_dialogs.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';

/// The one implementation of the space-album name prompt and confirm dialog,
/// shared by the albums list page and the album detail page.
///
/// These lived twice — once private to each page — because Dart's underscore
/// privacy is per library file. The cost of that duplication was concrete: the
/// `Delete ""?` defect was fixed on one surface and stayed live on the other.

/// Prompts for a name and returns it trimmed, or `null` if the user cancelled
/// or left it blank. A blank name is "nothing to do" rather than an error, so
/// callers never fire a doomed API call.
///
/// [label] and [keyPrefix] are caller-supplied, not hardcoded, so this one
/// dialog serves both the album prompts (`space-album-name`) and the folder
/// prompts (`space-album-folder-name`) without their widget keys colliding.
Future<String?> promptSpaceAlbumName(
  BuildContext context, {
  required String title,
  required String confirmLabel,
  required String label,
  required String keyPrefix,
  String initialName = '',
}) async {
  final name = await showDialog<String>(
    context: context,
    builder: (_) => SpaceAlbumNameDialog(
      title: title,
      confirmLabel: confirmLabel,
      label: label,
      keyPrefix: keyPrefix,
      initialName: initialName,
    ),
  );
  if (name == null || name.isEmpty) return null;
  return name;
}

/// The dialog body for [promptSpaceAlbumName].
///
/// A **StatefulWidget**, not a function building a [TextEditingController]
/// inline: the controller must be disposed when this widget unmounts, not when
/// `showDialog` resolves. The pop is animated, so the [TextFormField] is still
/// in the tree and still rebuilding for a moment after the awaited future
/// completes. Disposing there crashes with "A TextEditingController was used
/// after being disposed."
class SpaceAlbumNameDialog extends StatefulWidget {
  const SpaceAlbumNameDialog({
    super.key,
    required this.title,
    required this.confirmLabel,
    required this.label,
    required this.keyPrefix,
    this.initialName = '',
  });

  final String title;
  final String confirmLabel;

  /// The text field's label — e.g. "Folder name" or "Album name".
  final String label;

  /// Base for this dialog's widget keys: `$keyPrefix-field` / `-cancel` / `-confirm`.
  final String keyPrefix;
  final String initialName;

  @override
  State<SpaceAlbumNameDialog> createState() => _SpaceAlbumNameDialogState();
}

class _SpaceAlbumNameDialogState extends State<SpaceAlbumNameDialog> {
  late final TextEditingController _controller = TextEditingController(text: widget.initialName);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: TextFormField(
          key: Key('${widget.keyPrefix}-field'),
          controller: _controller,
          autofocus: true,
          decoration: InputDecoration(labelText: widget.label),
          onFieldSubmitted: (value) => Navigator.of(context).pop(value.trim()),
        ),
      ),
      actions: [
        TextButton(
          key: Key('${widget.keyPrefix}-cancel'),
          onPressed: () => Navigator.of(context).pop(null),
          child: Text('cancel'.t(context: context)),
        ),
        TextButton(
          key: Key('${widget.keyPrefix}-confirm'),
          onPressed: () => Navigator.of(context).pop(_controller.text.trim()),
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}

/// Confirms a destructive or bulk album action. Returns `true` only on an
/// explicit confirm. Parameterised because callers differ in copy, widget keys
/// and whether the confirm button is error-tinted.
Future<bool> confirmSpaceAlbumAction(
  BuildContext context, {
  required String title,
  required String content,
  required String confirmLabel,
  required Key cancelKey,
  required Key confirmKey,
  bool destructive = false,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(content),
      actions: [
        TextButton(
          key: cancelKey,
          onPressed: () => Navigator.of(ctx).pop(false),
          child: Text('cancel'.t(context: ctx)),
        ),
        TextButton(
          key: confirmKey,
          onPressed: () => Navigator.of(ctx).pop(true),
          style: destructive ? TextButton.styleFrom(foregroundColor: Theme.of(ctx).colorScheme.error) : null,
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return confirmed == true;
}
```

- [ ] **Step 3: Point the list page at the shared file**

In `space_albums.page.dart`:

1. Add the import: `import 'package:immich_mobile/presentation/widgets/spaces/space_album_dialogs.dart';`
2. Delete `_promptName` (`:1082-1102`), `_FolderNameDialog` and `_FolderNameDialogState` (`:1115-1176`), and `_confirmBulkAction` (`:1209-1238`).
3. Rename the call sites: `_promptName(` → `promptSpaceAlbumName(` (4 call sites, lines ~387, 428, 471, 638) and `_confirmBulkAction(` → `confirmSpaceAlbumAction(` (call sites including `deleteAlbums` at `:665`).
4. Keep `_confirmDeleteFolder` where it is — it is not duplicated across files.

Move the doc comment that sat above `_promptName` onto `promptSpaceAlbumName` in the new file, **with P2 corrected**. The counts are two and two, not two and three:

```dart
/// The two ALBUM call sites ("New album" and "Rename album") pass
/// `space_album_name_label`/`space-album-name`; the two FOLDER ones keep
/// `space_album_folder_name_label`/`space-album-folder-name`.
```

- [ ] **Step 4: Point the detail page at the shared file**

In `space_album_detail.page.dart`:

1. Add the import: `import 'package:immich_mobile/presentation/widgets/spaces/space_album_dialogs.dart';`
2. Delete `_promptAlbumName` (`:381-388`), `_AlbumNameDialog` and `_AlbumNameDialogState` (`:396-441`), and `_confirmDeleteAlbum` (`:449-471`).
3. Replace the `_promptAlbumName(context, album.name)` call with:

```dart
    final name = await promptSpaceAlbumName(
      context,
      title: 'space_album_rename'.t(context: context),
      confirmLabel: 'save'.t(context: context),
      label: 'space_album_name_label'.t(context: context),
      keyPrefix: 'space-album-name',
      initialName: album.name,
    );
```

4. Replace the `_confirmDeleteAlbum(context, album)` call at `:216` with:

```dart
    final confirmed = await confirmSpaceAlbumAction(
      context,
      title: 'space_album_delete'.t(context: context),
      content: 'space_album_delete_confirm'.t(context: context, args: {'name': album.name}),
      confirmLabel: 'delete'.t(context: context),
      cancelKey: const Key('space-album-delete-cancel'),
      confirmKey: const Key('space-album-delete-confirm'),
      destructive: true,
    );
```

- [ ] **Step 5: Run the baseline suites — no test may be edited**

```bash
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/flutter test \
  test/presentation/pages/space_albums_page_test.dart \
  test/presentation/pages/space_album_detail_page_test.dart \
  test/presentation/widgets/spaces/space_album_kebab_test.dart \
  test/presentation/widgets/spaces/space_album_bottom_sheet_test.dart
```

Expected: PASS, with the **same test count as Step 1** and zero edits to any test file.

If a test fails, do not adjust the test. Diff your extraction against the originals — the usual causes are a changed widget key, a `const Key(...)` that became non-const, or a dropped `destructive: true`.

- [ ] **Step 6: Verify no orphans remain**

```bash
cd mobile && grep -rn "_promptName\|_FolderNameDialog\|_confirmBulkAction\|_promptAlbumName\|_AlbumNameDialog\|_confirmDeleteAlbum" lib/
```

Expected: no output. Any hit is a copy you failed to delete.

- [ ] **Step 7: Run the full mobile suite**

```bash
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/flutter test
```

Expected: PASS (~3245 tests + Task 1's additions).

- [ ] **Step 8: Lint and format**

```bash
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/dart analyze --fatal-infos lib test
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/dart format \
  --set-exit-if-changed lib/presentation/widgets/spaces/space_album_dialogs.dart \
  lib/pages/library/spaces/space_albums.page.dart \
  lib/pages/library/spaces/space_album_detail.page.dart
```

Expected: `No issues found!` and `0 changed`.

- [ ] **Step 9: Commit**

```bash
git add mobile/lib/presentation/widgets/spaces/space_album_dialogs.dart \
        mobile/lib/pages/library/spaces/space_albums.page.dart \
        mobile/lib/pages/library/spaces/space_album_detail.page.dart
git commit -m "refactor(mobile): give the album name and confirm dialogs one implementation"
```

---

## Task 4: Full gates and push to PR #961

**Files:** none modified — this task only runs gates.

**Interfaces:**

- Consumes: Tasks 1, 2 and 3 committed.
- Produces: a pushed branch with green CI.

- [ ] **Step 1: Confirm the spec's own gate list is satisfied**

```bash
cd web && pnpm exec vitest run
```

Expected: 4486 passed. No web file was touched, so any failure is pre-existing and must be investigated before pushing, not after.

- [ ] **Step 2: Server unit suite**

```bash
cd server && npx vitest --config test/vitest.config.mjs --run
```

Expected: 5387 passed.

- [ ] **Step 3: Server medium suite**

```bash
cd server && npx vitest --config test/vitest.config.medium.mjs --run
```

Expected: PASS. This is the suite Task 2 changed behaviour in.

- [ ] **Step 4: E2E on the touched spec**

```bash
cd e2e && npx vitest --run src/specs/server/api/shared-space-album.e2e-spec.ts
```

Expected: 76 passed. No API surface changed, so this must be unchanged.

- [ ] **Step 5: Format the plan and spec docs**

```bash
npx prettier --check docs/superpowers/specs/2026-08-08-space-album-followups-design.md \
  docs/superpowers/plans/2026-08-08-space-album-followups.md
```

Expected: clean. If not, `npx prettier --write` the same paths and amend.

- [ ] **Step 6: Confirm the tree is clean of build churn**

```bash
git status --short
```

Expected: empty. If `mobile/ios/Podfile.lock`, `Runner.xcodeproj/project.pbxproj` or `Package.resolved` appear, check them out — they are local simulator-build churn and must not be committed.

- [ ] **Step 7: Push**

```bash
git push origin feat/space-album-rename-delete
```

- [ ] **Step 8: Watch CI to green**

PR #961 re-runs its full check set (33 checks). Use the babysit workflow. The checks most likely to react to this work are **Medium Tests (Server)** (Task 2), **Unit Test Mobile** and **Run Dart Code Analysis** (Tasks 1 and 3), and **Test i18n** (Task 1's ten locale files).

---

## Notes for the reviewer

**Where the risk actually is.** Task 2 is the only change that touches a database trigger and the only one with a migration. Its highest-risk failure mode is not the dedup — it is silently un-guarding the `shared_space` cascade path, which would double every tombstone on space deletion. That case is covered by an existing test at `shared-space-album-delete-triggers.spec.ts:236-260`, which asserts `toHaveLength(1)` and carries the comment _"a regressed guard would produce a duplicate here."_ If that test fails, the `INNER JOIN shared_space` was dropped or weakened.

**Why the existing tests did not catch M2.** Every assertion in that spec was a presence check (`.some(...)`) or a grant-state check. Nothing counted audit rows. Task 2's new tests count.

**Task 3 has no new tests on purpose.** It is a refactor whose correctness criterion is that the existing suites pass unmodified. New tests would weaken that signal by giving the extraction somewhere to hide.
