# Space album rename & delete — design spec

- **Date:** 2026-08-07
- **Base branch:** `feat/space-album-folders` (at `7a0806e00c7`, which already contains
  `feat(spaces): nestable folders for space albums` and `feat: multi-select for space albums (#949)`)
- **Working branch:** `feat/space-album-rename-delete`
- **Platforms:** server, web, mobile
- **Method:** TDD — every slice writes a failing (red) test before the implementation. Scenarios below
  are written in Given/When/Then (BDD) form and are the acceptance criteria.

---

## 1. Summary

Rename and delete a space album **from the space-albums list**, without opening it — and from the
space-album detail page too, so the two surfaces do not disagree. Delete also works over a
multi-selection, but is only offered when the user owns **every** selected album.

Two fork-local server routes are added. `server/src/utils/access.ts` is deliberately **not** touched,
so no upstream permission semantics change and no rebase surface is added there.

## 2. Current state

### 2.1 What exists today

| Surface             | File                                                                    | Card ⋮ actions today                                    |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| Web grid            | `web/src/lib/components/spaces/space-album-card.svelte`                 | Show/Hide in timeline · Move to folder · Unlink         |
| Web list            | `web/src/lib/components/spaces/space-albums-table.svelte`               | same three                                              |
| Web select bar      | `web/src/lib/components/spaces/space-album-select-bar.svelte`           | album: Unlink · Move · Timeline — folder: Move · Delete |
| Mobile grid         | `mobile/lib/pages/library/spaces/space_albums.page.dart` (`_AlbumCard`) | Toggle timeline · Unlink · Move to folder               |
| Mobile album detail | `mobile/lib/presentation/widgets/spaces/space_album_kebab.widget.dart`  | Add photos · Toggle timeline · Unlink                   |

Every one of those is behind a single master gate — `canManage` on web, `canEdit` on mobile — meaning
**space Editor**. Neither rename nor delete exists on any of them.

The space-detail **shelf** (`mobile/lib/presentation/widgets/spaces/space_albums_shelf.widget.dart`)
has no per-card overflow menu at all, so it is untouched by this work.

### 2.2 Server facts this design depends on

Verified in the tree at `7a0806e00c7`:

1. `Permission.AlbumDelete` resolves to `access.album.checkOwnerAccess` **only**
   (`server/src/utils/access.ts:218`). It already means exactly "album owner", which is the rule we
   want for delete — no change needed.
2. `Permission.AlbumUpdate` resolves to owner **or album-level Editor**
   (`album_user.role = editor`, `server/src/utils/access.ts:208`). **Space** editors are _not_
   included, so `PATCH /albums/{id}` would 403 for a space editor renaming someone else's album.
   This is the single reason a new server capability is required.
3. `shared_space_album.albumId` is `ON DELETE CASCADE` to `album`
   (`server/src/schema/tables/shared-space-album.table.ts:42`), and its `@AfterDeleteTrigger`
   (`shared_space_album_delete_audit`) is documented as firing "on unlinking (direct **or via cascade
   from album**/shared_space deletion)". So deleting an album removes the link row **and** emits the
   `shared_space_album_audit` / `shared_space_album_user_audit` rows that drive
   `SharedSpaceAlbumLinkDeleteV1` sync. No extra client-invalidation plumbing is required.
4. `shared-space.service.ts` already has `@OnEvent({ name: 'AlbumDelete' })` (`onAlbumDelete`), which
   removes space person-faces for orphaned assets and deletes orphaned space persons. So an album
   deletion is already space-safe **provided the `AlbumDelete` event is emitted**.
5. The bulk pattern is established: a private `#xChecked` core, run through `#runBulk`, returning
   `BulkIdResponseDto[]`, with **one** activity row and **one** `queueAlbumGrantReconcile` per batch
   (`bulkUnlinkAlbums`). `#runBulk` iterates `new Set(ids)`, so duplicate ids in a request act once.
6. `#unlinkAlbumChecked` establishes the "space Editor short-circuits, else album owner" gate shape,
   **and** the `hasAlbumLink(spaceId, albumId)` → 404 guard that both arms must pass before any side
   effect. That guard exists specifically to stop a leaked `spaceId` injecting an activity row into an
   unrelated space's feed.
7. `@Authenticated` accepts **one** `Permission`
   (`AuthenticatedOptions = { permission?: Permission | false } & …`, `server/src/middleware/auth.guard.ts:20`).
   A route cannot require two API-key scopes.
8. `SharedSpaceLinkedAlbumDto` already carries `ownerId` (`server/src/dtos/shared-space.dto.ts:232`).

### 2.3 Mobile fact this design depends on

The mobile local model `SpaceAlbum` (`mobile/lib/domain/models/space_album.model.dart`) has **no**
`ownerId`, and no shared-space sync stream carries one: `SyncEntityType.SharedSpaceAlbumV1` maps to
`SyncAlbumV2` (`server/src/dtos/sync.dto.ts:726`), and `SyncAlbumV2` has no `ownerId` — `ownerId` is
reconstructed from `albumUsers` only in `syncAlbumV2ToV1`. There is no shared-space album-user stream.

However, an album the user **owns** is always in their own owner-scoped album sync, so
`remote_album_user` holds a `(albumId, me, role = owner)` row for it. Ownership is therefore derivable
offline from data mobile already stores — see §6.1.

---

## 3. Capability model

The single master gate is replaced by **per-action capabilities**, because the new rules cross it in
both directions: a space Editor gains rename over albums they do not own, and an album owner who is
only a space _viewer_ gains rename and delete.

| Action                                    | Capability                                | Change    |
| ----------------------------------------- | ----------------------------------------- | --------- |
| Unlink · Move to folder · Toggle timeline | `canManage` (space Editor)                | unchanged |
| Folder create / rename / move / delete    | `canManage`                               | unchanged |
| Drag an album or folder card (web)        | `canManage`                               | unchanged |
| **Rename album**                          | `canManage` **OR** `isOwner(album)`       | new       |
| **Delete album**                          | `isOwner(album)` — _only_                 | new       |
| **Bulk delete albums**                    | `isOwner(a)` for **every** selected album | new       |

Two derived rules keep the surfaces coherent:

- **Selectable predicate.** An album card is selectable iff `canManage || isOwner(album)`. A folder
  card stays `canManage`, so a space viewer can never select a folder and the never-mixed
  album/folder selection invariant is untouched.
- **Per-button rendering.** Each select-bar button renders iff its own capability holds. A viewer's
  bar therefore shows _Delete_ alone; an editor with a mixed-ownership selection sees
  _Unlink / Move / Timeline_ but no _Delete_.

**Bulk Delete is hidden, not disabled**, when ownership is not unanimous — matching how the bar
already shows and hides buttons by `kind`.

Explicit consequence, accepted: a space **Owner** who does not own a linked album cannot delete it.
Deletion destroys another user's album globally; only its owner may do that. They can still Unlink.

Second explicit consequence, accepted: a space **viewer** who owns a linked album now sees a ⋮ on
that card and can enter selection mode. Cards they do not own remain inert for them.

---

## 4. Server design

### 4.1 `PUT /shared-spaces/:id/albums/:albumId/name`

```
@Put(':id/albums/:albumId/name')
@Authenticated({ permission: Permission.AlbumUpdate })
@HttpCode(HttpStatus.NO_CONTENT)
renameAlbum(@Auth() auth, @Param() { id, albumId }: SharedSpaceAlbumParamDto,
            @Body() dto: SharedSpaceAlbumRenameDto): Promise<void>
```

**Why its own route rather than a field on `PATCH :id/albums/:albumId`.** That endpoint's
`showInTimeline` is deliberately required; `shared-space-bulk.dto.ts` and the controller both document
why — an optional field regenerates the Dart client into three-state `isPresent` territory, a known
fork trap. `PUT :id/albums/:albumId/folder` already exists for exactly this reason and is the
precedent this route follows.

**Why `Permission.AlbumUpdate` and not `Permission.SharedSpaceAlbumUpdate`.** The decorator gates
**API-key scope**, which is orthogonal to the RBAC check inside. The effect of this route is an album
mutation, visible to the owner everywhere in the product — not a change to space-link metadata. Were
it scoped `SharedSpaceAlbumUpdate`, a key holding only space-album scope could rename arbitrary albums
(including other users' albums, through the editor arm). Scoping it `AlbumUpdate` keeps the key scope
honest about what the call does. §2.2(7) is why this cannot simply require both.

**DTO** (`shared-space.dto.ts`):

```ts
const SharedSpaceAlbumRenameSchema = z
  .object({ name: z.string().trim().min(1).describe('New album name') })
  .meta({ id: 'SharedSpaceAlbumRenameDto' });
```

No `.max()`: upstream's `albumName` is an uncapped `z.string()`, and a cap here would create names
settable via `PATCH /albums/{id}` but not re-settable via this route. `.trim()` is added
deliberately — it matches the folder schemas and stops `"   "` reaching the service.

**Service** `renameAlbum(auth, spaceId, albumId, dto)`:

1. Gate, mirroring `#unlinkAlbumChecked`: `getMember` → if the caller is space Editor or above,
   short-circuit; otherwise `checkAccess({ permission: Permission.AlbumUpdate, ids: [albumId] })` must
   return the album, else `ForbiddenException`.
2. **In both arms**, `hasAlbumLink(spaceId, albumId)` or `NotFoundException`, before any side effect.
3. Read the album for `previousName`; if `previousName === name`, return without writing or logging
   (a no-op rename must not spam the feed).
4. `albumRepository.update(albumId, { id: albumId, albumName: name }, auth.user.id)`. The third
   argument is not optional — it is the id `withAlbumUsers(authUserId)` projects against
   (`album.repository.ts:621`). Pass the **caller's** id, not the owner's: a space editor renaming
   someone else's album is the caller, exactly as `album.service.ts#update` passes `auth.user.id`.
5. `logActivity({ type: SharedSpaceActivityType.AlbumRename, data: { albumId, albumName: name, previousName } })`.

No grant reconcile: a rename changes no access.

### 4.2 `POST /shared-spaces/:id/albums/bulk-delete`

```
@Post(':id/albums/bulk-delete')
@Authenticated({ permission: Permission.AlbumDelete })
@HttpCode(HttpStatus.OK)
bulkDeleteAlbums(@Auth() auth, @Param() { id }: UUIDParamDto,
                 @Body() dto: SharedSpaceBulkAlbumIdsDto): Promise<BulkIdResponseDto[]>
```

**Declaration placement.** It goes **before** the `:albumId` param routes, in the existing
`bulk-unlink` / `bulk-folder` / `bulk-timeline` block. To be precise about why: today there is no
`@Post(':id/albums/:albumId')`, so a POST bulk route is not _currently_ at risk of being swallowed —
the block's own comment describes the live hazard, which is `PUT :id/albums/:albumId` shadowing
`PUT :id/albums/bulk-folder`. Placing this route with its siblings keeps the invariant true by
construction rather than by the accident of no POST param route existing yet.

**One endpoint serves single and bulk delete.** The card ⋮ sends a one-element array. This avoids a
second route competing for a name (`DELETE :id/albums/:albumId` is already unlink), and keeps one code
path and one set of tests. The activity type is chosen by success count, mirroring the
`AlbumUnlink` / `AlbumBulkUnlink` pair.

**`Permission.AlbumDelete` as the key scope**, for the same reason as §4.1: this genuinely deletes
albums. Scoping it `SharedSpaceAlbumDelete` would let a space-scoped key destroy albums.

**No blanket `requireRole` hoist.** `bulkSetAlbumFolder` and `bulkSetAlbumTimeline` hoist
`requireRole(Editor)` so a non-member gets one clean 403; `bulkUnlinkAlbums` deliberately does not,
because its owner arm needs a per-item decision. This endpoint is in the second category — an album
owner who is not a space member must succeed — so it must **not** hoist.

**Per item**, in `#deleteAlbumChecked(auth, spaceId, albumId)`:

1. `checkAccess({ permission: Permission.AlbumDelete, ids: [albumId] })` — owner only, **no** Editor
   arm. Not owner → `ForbiddenException` → `no_permission`.
2. `hasAlbumLink(spaceId, albumId)` or `NotFoundException` → `not_found`.
3. Capture `albumName` (needed for the activity row, unreadable after deletion).
4. `eventRepository.emit('AlbumDelete', { albumId })` then `albumRepository.delete(albumId)` — the
   same two steps, in the same order, as `album.service.ts#delete`. Emitting first is what makes
   `onAlbumDelete`'s orphan queries run while the rows still exist.

**Per batch**, after `#runBulk`:

- `succeeded.length === 1` → one `AlbumDelete` row `{ albumId, albumName }`.
- `succeeded.length > 1` → one `AlbumBulkDelete` row `{ count, albumName }` where `albumName` is the
  first success, matching `AlbumBulkUnlink`'s shape so the feed can render "X and N others".
- `succeeded.length === 0` → no activity row, no reconcile.
- One `queueAlbumGrantReconcile(succeeded)` for the whole batch.

### 4.3 New activity types

Three values on `SharedSpaceActivityType` (`server/src/enum.ts`, beside `album_bulk_unlink`):
`album_rename`, `album_delete`, `album_bulk_delete`. Each needs a `case` in
`web/src/lib/components/spaces/space-activity-feed.svelte`; `album_bulk_delete` reuses the
`Math.max(count - 1, 0)` "and N others" convention `album_bulk_unlink` documents.

### 4.4 Deliberately unchanged

- `server/src/utils/access.ts` — no space-editor arm added to `Permission.AlbumUpdate`. Considered and
  rejected: it would hand space editors the whole of `UpdateAlbumDto` (description, thumbnail, sort
  order, activity toggle), not just the name, and would edit a file upstream rebases touch.
- `SyncAlbumV2` — no `ownerId` added. See §6.1.
- The `SharedSpaceAlbumLinkUpdateDto` three-state trap — no optional field added anywhere.

---

## 5. Web design

`authManager.user.id` is already read in the albums page (`+page.svelte:82`) and
`SharedSpaceLinkedAlbumDto.ownerId` is already on the wire, so ownership is a pure derivation — no
fetch, no new store, no new load path.

| File                                                                | Change                                                                                                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/utils/space-album-bulk-actions.ts`                             | add `bulkDeleteAlbumsAction(spaceId, ids)` returning `{ failedIds, failedCount }` like its five siblings, including the "a thrown request folds into every-id-failed" rule                 |
| `lib/modals/SpaceAlbumFolderNameModal.svelte`                       | accept `icon` and `label` props (currently hard-codes `mdiFolderPlusOutline` and `space_album_folder_name_label`) so it serves album rename unchanged — no second near-identical modal     |
| `lib/components/spaces/space-album-card.svelte`                     | split the single `{#if canManage}` ⋮ block into `canManage` items and capability items; render the ⋮ when _any_ item would. `draggable` stays `canManage`                                  |
| `lib/components/spaces/space-albums-table.svelte`                   | same split for the list view's own `MenuOption` block                                                                                                                                      |
| `lib/components/spaces/space-album-select-bar.svelte`               | new `canManage` and `canDelete` props; a danger _Delete_ in the `album` branch; the three editor buttons move behind `canManage`                                                           |
| `lib/components/spaces/space-albums-list.svelte`                    | selectable predicate → `canManage \|\| isOwner(album)` (folders stay `canManage`); new `$derived allSelectedAlbumsOwned`; widen the `{#if canManage && selection.selectionActive}` wrapper |
| `routes/(user)/spaces/[spaceId]/albums/+page.svelte`                | `handleRenameAlbum` and `handleBulkDeleteAlbums`, the latter returning "ids that stay selected" per the existing contract                                                                  |
| `routes/(user)/spaces/[spaceId]/albums/[albumId=id]/…/+page.svelte` | Rename + Delete in the detail menu; on delete, navigate to the space albums list, preserving the album's folder the way the existing back button does                                      |
| `lib/components/spaces/space-activity-feed.svelte`                  | three new `case`s (§4.3)                                                                                                                                                                   |

Reconcile behaviour, drag behaviour, grouping and the range-anchor logic are all untouched.

## 6. Mobile design

### 6.1 Ownership source

`SyncAlbumV2` is an upstream-shared DTO; a fork field on it is exactly the kind of change that breaks
silently on rebase (`feedback_zero_conflict_upstream_breaks`). Ownership is instead derived from data
mobile already syncs:

`SpaceAlbumRepository.watchLinkedAlbums(spaceId, currentUserId)` gains

```
LEFT JOIN remote_album_user
       ON remote_album_user.albumId = link.albumId
      AND remote_album_user.userId  = :currentUserId
      AND remote_album_user.role    = owner
```

surfacing a new `SpaceAlbum.isOwnedByMe` bool. `spaceAlbumsProvider` reads the id from
`currentUserProvider`.

**Fail-closed, and documented in the code.** A null user id, or an album you own whose
`remote_album_user` row has not synced yet (e.g. created moments ago on another device), reads as
_not owned_: the affordance is briefly hidden, never wrongly offered, and self-heals on the next sync
tick. The server re-checks regardless, so a hidden affordance is the only possible failure mode.

### 6.2 Other mobile changes

| File                                                        | Change                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repositories/shared_space_api.repository.dart`             | `renameAlbum(spaceId, albumId, name)`, `bulkDeleteAlbums(spaceId, ids)`                                                                                                                                                                                     |
| `providers/infrastructure/space_album_actions.dart`         | `renameAlbum` (throws on failure, like the other single-item ops); `bulkDeleteAlbums` (returns failed ids via `_bulkFailures`, like the other bulk ops). Both follow the existing sync-nudge rules                                                          |
| `pages/library/spaces/space_albums.page.dart`               | `_AlbumCard` takes `isOwnedByMe`; ⋮ items gated per capability; long-press selectable predicate widened; select bar gains Delete when ownership is unanimous. Reuses `_promptFolderName` for rename and the file's existing confirm-dialog shape for delete |
| `presentation/widgets/spaces/space_album_kebab.widget.dart` | `canRename` / `canDelete` props and the two new items; the widget's own doc comment ("exactly 3 items") must be updated with it                                                                                                                             |
| `pages/library/spaces/space_album_detail.page.dart`         | wire both; pop back to the albums list on successful delete                                                                                                                                                                                                 |

## 7. i18n

New keys in the ten locales the fork's space-album strings already cover — `de en es fr it nl pl ru
zh_Hans zh_Hant` (verified by `space_album_bulk_unlink_title` presence):

- `space_album_rename` (menu item + modal title), `space_album_name_label`
- `space_album_delete`, `space_album_delete_confirm` (single, named)
- `space_album_bulk_delete_title` (counted), `space_album_bulk_delete_confirm`
- `spaces_activity_renamed_album`, `spaces_activity_deleted_album`,
  `spaces_activity_bulk_deleted_albums`
- `space_album_error_rename`, `space_album_error_delete`

Delete copy must state that the album is destroyed for everyone, not merely removed from the space —
the distinction from the adjacent _Unlink_ action is the whole point.

---

## 8. Test strategy

TDD throughout: each slice's failing test is written and **observed failing** before implementation.
Scenarios are the acceptance criteria.

Two repository-specific traps are explicitly guarded:

- **No assertion that cannot fail** (`feedback_web_test_assertions_that_cannot_fail`). Every
  "affordance is hidden" test must be paired with a positive case in the same file proving the same
  query finds it when the capability holds. A bare `queryBy… not.toBeInTheDocument()` against a
  never-rendered element passes for the wrong reason.
- **No test that mocks the layer under test**
  (`feedback_test_harness_mocks_layer_under_test`). Mobile page tests must not mock
  `spaceAlbumActionsProvider` and then assert on `SpaceAlbumActions` behaviour; the actions class is
  tested against a mocked `SharedSpaceApiRepository` in its own spec.

### 8.1 Server — `server/src/services/shared-space.service.spec.ts`

Rename:

1. **Given** the caller is a space Editor who does **not** own the linked album, **when** rename,
   **then** `albumRepository.update` is called with the new name and one `album_rename` activity row
   is logged.
2. **Given** the caller owns the album but is **not a member** of the space, **when** rename,
   **then** it succeeds.
3. **Given** the caller is a space Viewer who does not own the album, **when** rename, **then**
   `ForbiddenException`, and **no** activity row.
4. **Given** the album exists but is not linked to this space, **when** rename via the **Editor**
   arm, **then** `NotFoundException` **before** any update or activity row.
5. As (4) but via the **owner** arm — both arms must be covered; the guard exists for the owner arm's
   sake and a test of only one arm would not catch it being placed inside the wrong branch.
6. **Given** the new name equals the current name, **when** rename, **then** no update and no
   activity row.
7. **Given** `name` is `"   "`, **then** the DTO rejects it (400) — asserted at the schema level.

Delete:

8. **Given** the caller owns the album, **when** bulk-delete with one id, **then**
   `eventRepository.emit('AlbumDelete', …)` is called **before** `albumRepository.delete`, one
   `album_delete` activity row is logged, and `queueAlbumGrantReconcile` is called once.
9. **Given** the caller is the space **Owner** but does not own the album, **then** the item fails
   with `no_permission` and `albumRepository.delete` is never called. _(The regression most likely to
   creep back in — a future "owners can do anything in their space" change would break exactly this.)_
10. **Given** the caller owns the album but is not a space member, **then** it succeeds.
11. **Given** a mixed batch — two owned, one not — **then** 200 with per-item results, two successes,
    one `no_permission`, exactly **one** `album_bulk_delete` row with `count: 2`, and **one**
    reconcile call.
12. **Given** exactly one of several ids succeeds, **then** the row is `album_delete`, not
    `album_bulk_delete`.
13. **Given** every item fails, **then** 200, no activity row, no reconcile.
14. **Given** an album not linked to this space, **then** `not_found`, and it is not deleted.
15. **Given** the same id twice in one request, **then** one delete, one success entry.
16. **Given** `ids: []`, **then** 400 from the DTO (`.min(1)`); **given** 1001 ids, 400 (`.max(1000)`).
17. **Given** a non-member, non-owner caller, **then** every item reports `no_permission` and the
    request is still 200 — i.e. the absence of a hoisted `requireRole` is asserted, not assumed.

### 8.2 Server — medium (`server/test/medium`) and e2e

Medium, against a real DB, in the existing
`server/test/medium/specs/services/shared-space-album.service.spec.ts`:

18. **Given** an album linked to two spaces, **when** deleted, **then** both `shared_space_album` rows
    are gone (FK cascade) and `shared_space_album_audit` has a delete row for each — the sync path
    §2.2(3) claims. Asserting this is what stops a silent "album vanishes on web, lingers on mobile".

E2E (`e2e/src/specs/server/api/shared-space-album.e2e-spec.ts`, alongside the existing
`shared-space-album-folder.e2e-spec.ts`):

19. Full RBAC matrix over both routes: space Owner / Editor / Viewer / non-member × album owner / not,
    asserting status codes and, for bulk, per-item `error` reasons.
20. An API key scoped only to `sharedSpaceAlbum.delete` is **refused** on `albums/bulk-delete`; a key
    with `album.delete` is accepted. Likewise `sharedSpaceAlbum.update` vs `album.update` on the
    rename route. This pins §4.1/§4.2's scope decision, which is otherwise invisible.
21. Route-placement regression: a request whose path segment is the literal `bulk-delete` reaches the
    bulk handler and not a `:albumId` route — i.e. it does not 400 with "invalid uuid". Cheap, and it
    is the test that fails the day someone adds a `@Post(':id/albums/:albumId')` above it (§4.2).

### 8.3 Web — vitest

`space-album-card.spec.ts` / `space-albums-table.spec.ts`, each over the four combinations:

22. editor + owner → Rename **and** Delete present, alongside the three existing items.
23. editor + not owner → Rename present, Delete **absent** (same file also asserts Delete present in
    (22), so the negative cannot pass vacuously).
24. viewer + owner → ⋮ present with Rename and Delete only; Unlink / Move / Timeline absent.
25. viewer + not owner → **no ⋮ at all**.
26. viewer + owner → the card is **not** `draggable`.

`space-album-select-bar.spec.ts`:

27. `kind: 'album'`, `canDelete: true` → Delete present; `canDelete: false` → absent.
28. `kind: 'album'`, `canManage: false`, `canDelete: true` → Delete **only**.
29. `kind: 'folder'` → the album Delete is not rendered (the folder branch keeps its own).
30. Clicking Delete calls `onDelete` exactly once.

`space-albums-list.spec.ts`:

31. A viewer can select an album they own; selecting one they do not own is a no-op.
32. A viewer cannot select a folder.
33. `allSelectedAlbumsOwned` is false as soon as one unowned album joins the selection, and the bar's
    Delete disappears.

`space-album-bulk-actions.spec.ts`:

34. Partial failure → `failedIds` is exactly the failed subset, `failedCount` matches.
35. A thrown request → every id reported failed.

`space-albums-page.spec.ts`:

36. Cancelling the delete confirm deselects nothing and issues no request.
37. After a partial failure the failed ids remain selected and one warning toast is shown.
38. Rename submits the trimmed name and re-renders the new name.

`space-activity-feed.spec.ts`:

39. `album_rename`, `album_delete`, `album_bulk_delete` each render their string;
    `album_bulk_delete` with `count: 1` renders "0 others" without going negative.

### 8.4 Mobile — `flutter test`

`test/medium/repositories/space_album_repository_test.dart`:

40. **Given** a linked album with a `remote_album_user` owner row for the current user, **then**
    `isOwnedByMe` is true.
41. **Given** the owner row names a different user, **then** false.
42. **Given** an album-level _editor_ row for the current user, **then** false — the join must key on
    `role = owner`, not mere presence.
43. **Given** no `remote_album_user` row at all (not yet synced), **then** false — fail-closed.
44. **Given** a null current user id, **then** every album is false and the query does not throw.

`test/providers/infrastructure/space_album_actions_test.dart`:

45. `renameAlbum` calls the repo and fires the sync nudge; on API failure it rethrows and does **not**
    nudge.
46. `bulkDeleteAlbums` returns the failed subset on partial failure, every id on a throw, and nudges
    on a 200-with-all-failed but not on a throw — matching the documented sibling contract.

`test/presentation/pages/space_albums_page_test.dart`:

47–50. The four capability combinations of (22)–(25) on `_AlbumCard`'s ⋮, each with its positive
counterpart in-file. 51. A viewer long-pressing an album they do not own does not start a selection; one they own does. 52. Bulk Delete is hidden the moment an unowned album joins the selection. 53. After a partial bulk delete, `reconcile(failedIds)` leaves exactly the failures selected. 54. The rename dialog's Cancel path fires no action call.

`test/presentation/pages/space_album_detail_page_test.dart`:

55. Rename shown for editor-non-owner; Delete not.
56. Delete shown for owner-viewer; on success the page pops.

The mobile page tests drive the real `SpaceAlbumsPage` with a mocked
`SharedSpaceApiRepository`, never a mocked `spaceAlbumActionsProvider`.

### 8.5 Gates

`make check-all` / `make lint-all`; from `web/`: `check:typescript`, `check:svelte`, `pnpm lint`; from
`mobile/`: `dart analyze --fatal-infos lib test` **and** `dart format`, with Flutter pinned per
`mobile/mise.toml`. `mise open-api` runs **once**, at the end, after both server DTO slices land.

---

## 9. Edge cases and failure modes

| #   | Case                                                                                    | Expected                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Album deleted by its owner while another member has it open                             | Link row cascades; the audit trigger emits; the other client's stream drops it. Mobile's existing folder self-pop logic is unaffected — a _folder_ did not vanish |
| E2  | Album unlinked by an editor between the client's ownership check and the delete request | `not_found` for that item; the album is **not** deleted                                                                                                           |
| E3  | Ownership changes (album transferred) mid-selection                                     | Server re-checks per item → `no_permission`; the item stays selected and the partial-failure toast fires                                                          |
| E4  | Rename to the identical name                                                            | No write, no activity row (§4.1 step 3)                                                                                                                           |
| E5  | Rename with leading/trailing whitespace                                                 | Trimmed by the DTO before it reaches the service                                                                                                                  |
| E6  | Rename to the same name as another album                                                | Allowed — album names are not unique in Immich. Unlike folder names, there is no conflict check to add                                                            |
| E7  | Mobile offline                                                                          | Both actions surface the existing error toast; no local write is attempted for either (the server is the source of truth for space albums)                        |
| E8  | Mobile: owned album not yet in `remote_album_user`                                      | Affordance hidden (fail-closed), self-heals on next sync                                                                                                          |
| E9  | Bulk delete of 1000 ids                                                                 | Sequential `#runBulk`; bounded by the DTO's `.max(1000)`                                                                                                          |
| E10 | Duplicate ids in one bulk request                                                       | `#runBulk`'s `new Set` collapses them; one result entry                                                                                                           |
| E11 | Every item in a batch fails                                                             | 200, per-item reasons, no activity row, no reconcile                                                                                                              |
| E12 | Album linked to several spaces, deleted from one                                        | Deleted globally; every space's link cascades. The activity row lands only in the space the request named — accepted, and consistent with where the user acted    |
| E13 | Space viewer with zero owned albums                                                     | No ⋮ anywhere, no selection mode; the page is exactly as it is today                                                                                              |

---

## 10. Risks and rebase watch-items

1. **`album.service.ts#delete` drift.** `#deleteAlbumChecked` replicates its two steps
   (emit → delete). If upstream adds a third, the space path silently diverges. Mitigated by test (8)
   pinning both calls and their order, plus a code comment naming `album.service.ts#delete` as the
   source of truth. Accepted rather than calling across services, which is not this codebase's pattern.
2. **`Permission.AlbumUpdate` semantics.** Reading it, not changing it. If upstream widens it, the
   owner arm of rename widens with it — which is the correct behaviour, not a bug.
3. **Ten-locale drift.** New keys must land in all ten or the branding/i18n check flags them.
4. **`mise open-api` timing.** Deferred to a single run at the end, per
   `reference_rebase_generated_api_artifacts` — regenerating between DTO slices produces churn that
   conflicts on rebase.

## 11. Out of scope

- Bulk **rename** — inherently single-item.
- Rename or delete from the mobile space-detail shelf (it has no per-card menu).
- Deleting an album's **assets** along with it. `POST /shared-spaces/:id/albums/bulk-delete` deletes
  albums only; assets survive in their owner's library, exactly as `DELETE /albums/{id}` does today.
- Any change to folder rename/delete, which already exist.

## 12. Slice outline

Each slice is red-first and independently reviewable. The full plan is produced by `writing-plans`.

1. Server: rename DTO + service + controller (§4.1) — tests 1–7.
2. Server: bulk-delete service + controller (§4.2) — tests 8–17.
3. Server: activity types + medium/e2e coverage (§4.3, §8.2) — tests 18–21.
4. `mise open-api` — one regeneration covering both slices.
5. i18n: ten locales (§7).
6. Web: bulk-action helper, modal props, card + table menus (§5) — tests 22–26, 34–35.
7. Web: select bar, list selection, page handlers, detail page, activity feed (§5) — tests 27–33,
   36–39.
8. Mobile: repository join + model field + provider (§6.1) — tests 40–44.
9. Mobile: API repo + actions (§6.2) — tests 45–46.
10. Mobile: albums page + detail kebab wiring (§6.2) — tests 47–56.
