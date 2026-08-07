# Space Album Rename & Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user rename a space album (space Editor **or** album owner) and delete it (album owner only, including over a multi-selection) directly from the space-albums list and the space-album detail page, on both web and mobile.

**Architecture:** Two fork-local server routes on `shared-space.controller.ts` — `PUT :id/albums/:albumId/name` and `POST :id/albums/bulk-delete` — carry the new capability, so `server/src/utils/access.ts` is never touched and no upstream permission semantics change. Clients replace the single `canManage`/`canEdit` master gate on album affordances with per-action capabilities. Web derives album ownership from `SharedSpaceLinkedAlbumDto.ownerId`, already on the wire; mobile derives it offline from a new `LEFT JOIN` onto the local `remote_album_user` table, so no sync-stream DTO changes.

**Tech Stack:** NestJS 11 + Kysely + Zod (server), SvelteKit/Svelte 5 runes + vitest (web), Flutter + Riverpod + Drift (mobile), OpenAPI-generated SDK and Dart client.

**Spec:** `docs/superpowers/specs/2026-08-07-space-album-rename-delete-design.md`. Scenario numbers below refer to spec §8.

## Global Constraints

- **Base branch:** work on `feat/space-album-rename-delete`, branched from `feat/space-album-folders` @ `7a0806e00c7`. Worktree: `.claude/worktrees/space-album-rename-delete`. Run every command from that directory.
- **TDD is mandatory.** Every task writes the test, runs it, sees it fail for the stated reason, then implements. A test that passes before the implementation exists is a broken test, not a fast task.
- **Never modify `server/src/utils/access.ts`.** The whole design exists to avoid it.
- **Never add an optional field to an existing shared-space DTO.** Optional fields regenerate the Dart client into three-state `Optional`/`isPresent` territory. New capability ⇒ new route with required fields.
- **`mise open-api` runs exactly once**, in Task 4, after both server DTO tasks land. Do not regenerate between server tasks.
- **i18n locales (exactly these ten):** `de en es fr it nl pl ru zh_Hans zh_Hant`. Shared dir `i18n/` serves both web and mobile.
- **`shared_space_activity.type` is `varchar(30)`.** New values must be ≤ 30 chars.
- **Server import style:** absolute `src/...` paths only, no relative imports.
- **Gate commands (verified — CLAUDE.md is stale here).** The Makefile has **no** `check-*` or
  `lint-*` targets. Use `cd server && pnpm run check && pnpm run lint`, and from `web/`:
  `pnpm check:typescript`, `pnpm check:svelte`, `pnpm lint`. `make open-api` **does** exist.
- **Prettier:** run on any markdown under `docs/`. CI Docs Build is strict.
- **Delete copy must say the album is destroyed for everyone**, not merely removed from the space — that is the whole distinction from the adjacent Unlink action.
- **Test bodies written out vs. specified.** Tasks 1, 2, 5, 6, 9 and 10 carry complete, literal test
  code — write it as given. Tasks 3, 7 (list + page steps), 8, 11 and 12 give each test's **name and
  assertion contract** with an empty body, because their harnesses (`MediumRepositoryContext`
  bootstrap for a real DB, the e2e space/member fixtures, `space-albums-list.spec.ts`'s render
  harness, the mobile `pumpPage` harness) must be read before a body can be written that compiles.
  Read the neighbouring passing tests in the same file, then write the body. **An empty `it` /
  `test` / `testWidgets` body passes vacuously — committing one is a task failure**, and the review
  gate for those tasks must check that every body asserts something.
- **Two test traps this repo has been bitten by:**
  1. _No assertion that cannot fail._ Every "affordance is hidden" assertion needs a positive counterpart in the same file. `queryBy(...)` returning null against an element that never renders passes for the wrong reason.
  2. _Never mock the layer under test._ Mobile page tests mock `SharedSpaceApiRepository`, never `spaceAlbumActionsProvider`.

---

## File Structure

**Server**

| File                                                                   | Responsibility                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `server/src/dtos/shared-space.dto.ts`                                  | add `SharedSpaceAlbumRenameSchema` / `SharedSpaceAlbumRenameDto` |
| `server/src/enum.ts`                                                   | add three `SharedSpaceActivityType` values                       |
| `server/src/services/shared-space.service.ts`                          | `renameAlbum`, `#deleteAlbumChecked`, `bulkDeleteAlbums`         |
| `server/src/controllers/shared-space.controller.ts`                    | the two new routes                                               |
| `server/src/services/shared-space.service.spec.ts`                     | scenarios 1–20                                                   |
| `server/test/medium/specs/services/shared-space-album.service.spec.ts` | scenarios 21–22                                                  |
| `e2e/src/specs/server/api/shared-space-album.e2e-spec.ts`              | scenarios 23–25                                                  |

**Web**

| File                                                                                                       | Responsibility                                              |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `web/src/lib/utils/space-album-bulk-actions.ts`                                                            | `bulkDeleteAlbumsAction`                                    |
| `web/src/lib/modals/SpaceAlbumFolderNameModal.svelte`                                                      | gains `icon` / `label` props so it also serves album rename |
| `web/src/lib/components/spaces/space-album-card.svelte`                                                    | per-capability ⋮                                            |
| `web/src/lib/components/spaces/space-albums-table.svelte`                                                  | per-capability ⋮                                            |
| `web/src/lib/components/spaces/space-album-select-bar.svelte`                                              | `canManage` / `canDelete` props, album Delete               |
| `web/src/lib/components/spaces/space-albums-list.svelte`                                                   | selectable predicate, `allSelectedAlbumsOwned`              |
| `web/src/routes/(user)/spaces/[spaceId]/albums/+page.svelte`                                               | rename + bulk-delete handlers                               |
| `web/src/routes/(user)/spaces/[spaceId]/albums/[albumId=id]/[[photos=photos]]/[[assetId=id]]/+page.svelte` | detail-page rename + delete                                 |
| `web/src/lib/components/spaces/space-activity-feed.svelte`                                                 | three new `case`s                                           |
| `web/src/lib/space-album-rename-delete-i18n.spec.ts`                                                       | locale coverage (scenario 48)                               |

**Mobile**

| File                                                                   | Responsibility                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------- |
| `mobile/lib/domain/models/space_album.model.dart`                      | `isOwnedByMe` field                                |
| `mobile/lib/infrastructure/repositories/space_album.repository.dart`   | ownership join                                     |
| `mobile/lib/providers/infrastructure/space_album.provider.dart`        | pass current user id                               |
| `mobile/lib/repositories/shared_space_api.repository.dart`             | `renameAlbum`, `bulkDeleteAlbums`                  |
| `mobile/lib/providers/infrastructure/space_album_actions.dart`         | `renameAlbum`, `bulkDeleteAlbums`                  |
| `mobile/lib/pages/library/spaces/space_albums.page.dart`               | capability gating, selection widening, bulk delete |
| `mobile/lib/presentation/widgets/spaces/space_album_kebab.widget.dart` | `canRename` / `canDelete`                          |
| `mobile/lib/pages/library/spaces/space_album_detail.page.dart`         | detail wiring                                      |

**Shared**

`i18n/{de,en,es,fr,it,nl,pl,ru,zh_Hans,zh_Hant}.json`.

---

## Task 1: Server — rename route

**Files:**

- Modify: `server/src/dtos/shared-space.dto.ts`
- Modify: `server/src/services/shared-space.service.ts`
- Modify: `server/src/controllers/shared-space.controller.ts`
- Modify: `server/src/enum.ts`
- Test: `server/src/services/shared-space.service.spec.ts`

**Interfaces:**

- Consumes: existing `this.sharedSpaceRepository.getMember`, `.hasAlbumLink`, `.logActivity`; `this.albumRepository.getById` / `.update`; `this.checkAccess`; `getSharedSpaceRoleScore`, `ROLE_HIERARCHY`, `SharedSpaceRole`.
- Produces:
  - `SharedSpaceAlbumRenameDto` — `{ name: string }`
  - `SharedSpaceService.renameAlbum(auth: AuthDto, spaceId: string, albumId: string, dto: SharedSpaceAlbumRenameDto): Promise<void>`
  - `SharedSpaceActivityType.AlbumRename = 'album_rename'`
  - Route `PUT /shared-spaces/:id/albums/:albumId/name`

Covers spec scenarios 1–7 and 20.

- [ ] **Step 1: Add the activity type**

In `server/src/enum.ts`, immediately after `AlbumBulkUnlink = 'album_bulk_unlink',`:

```ts
  AlbumRename = 'album_rename',
```

- [ ] **Step 2: Add the DTO**

In `server/src/dtos/shared-space.dto.ts`, next to `SharedSpaceAlbumFolderUpdateSchema`:

```ts
// Its own route rather than a field on PATCH :id/albums/:albumId, because that endpoint's
// showInTimeline is deliberately required — an optional field there regenerates the Dart client
// into three-state (isPresent) territory. Mirrors why PUT :id/albums/:albumId/folder exists.
//
// No .max(): upstream's albumName is an uncapped z.string(), so a cap here would make names
// settable via PATCH /albums/{id} but not re-settable through this route.
const SharedSpaceAlbumRenameSchema = z
  .object({ name: z.string().trim().min(1).describe('New album name') })
  .meta({ id: 'SharedSpaceAlbumRenameDto' });
```

And with the other exported classes:

```ts
export class SharedSpaceAlbumRenameDto extends createZodDto(SharedSpaceAlbumRenameSchema) {}
```

- [ ] **Step 3: Write the failing tests**

Append inside the existing shared-space album `describe` block in `server/src/services/shared-space.service.spec.ts`. Place the helper next to `setupBulkUnlinkAlbums` (around line 160):

```ts
/** Editor-or-owner fixture for the renameAlbum tests. */
const setupRenameAlbum = (mocks: ServiceMocks) => {
  const auth = factory.auth();
  const spaceId = newUuid();
  const albumId = newUuid();
  mocks.sharedSpace.hasAlbumLink.mockResolvedValue(true);
  mocks.sharedSpace.logActivity.mockResolvedValue(void 0);
  mocks.album.getById.mockResolvedValue({ id: albumId, albumName: 'Old name' } as any);
  mocks.album.update.mockResolvedValue({ id: albumId, albumName: 'New name' } as any);
  return { auth, spaceId, albumId };
};

/** Makes the caller a space Editor. */
const asSpaceEditor = (mocks: ServiceMocks, auth: AuthDto, spaceId: string) =>
  mocks.sharedSpace.getMember.mockResolvedValue({
    spaceId,
    userId: auth.user.id,
    role: SharedSpaceRole.Editor,
  } as any);

/** Makes the caller a non-member. */
const asNonMember = (mocks: ServiceMocks) => mocks.sharedSpace.getMember.mockResolvedValue(void 0 as any);
```

Then the scenarios:

```ts
describe('renameAlbum', () => {
  // Scenario 1
  it('lets a space Editor rename an album they do not own', async () => {
    const { auth, spaceId, albumId } = setupRenameAlbum(mocks);
    asSpaceEditor(mocks, auth, spaceId);
    mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set());

    await sut.renameAlbum(auth, spaceId, albumId, { name: 'New name' });

    expect(mocks.album.update).toHaveBeenCalledWith(albumId, { id: albumId, albumName: 'New name' }, auth.user.id);
    expect(mocks.sharedSpace.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId,
        type: SharedSpaceActivityType.AlbumRename,
        data: { albumId, albumName: 'New name', previousName: 'Old name' },
      }),
    );
  });

  // Scenario 2
  it('lets the album owner rename even with no space membership', async () => {
    const { auth, spaceId, albumId } = setupRenameAlbum(mocks);
    asNonMember(mocks);
    mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));

    await sut.renameAlbum(auth, spaceId, albumId, { name: 'New name' });

    expect(mocks.album.update).toHaveBeenCalled();
  });

  // Scenario 3
  it('refuses a space Viewer who does not own the album, and logs nothing', async () => {
    const { auth, spaceId, albumId } = setupRenameAlbum(mocks);
    mocks.sharedSpace.getMember.mockResolvedValue({
      spaceId,
      userId: auth.user.id,
      role: SharedSpaceRole.Viewer,
    } as any);
    mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set());

    await expect(sut.renameAlbum(auth, spaceId, albumId, { name: 'New name' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mocks.album.update).not.toHaveBeenCalled();
    expect(mocks.sharedSpace.logActivity).not.toHaveBeenCalled();
  });

  // Scenario 4 — the guard must sit BELOW the branch, not inside the owner arm only.
  it('404s for an unlinked album via the Editor arm, before any side effect', async () => {
    const { auth, spaceId, albumId } = setupRenameAlbum(mocks);
    asSpaceEditor(mocks, auth, spaceId);
    mocks.sharedSpace.hasAlbumLink.mockResolvedValue(false);

    await expect(sut.renameAlbum(auth, spaceId, albumId, { name: 'New name' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mocks.album.update).not.toHaveBeenCalled();
    expect(mocks.sharedSpace.logActivity).not.toHaveBeenCalled();
  });

  // Scenario 5 — same guard, owner arm.
  it('404s for an unlinked album via the owner arm, before any side effect', async () => {
    const { auth, spaceId, albumId } = setupRenameAlbum(mocks);
    asNonMember(mocks);
    mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set([albumId]));
    mocks.sharedSpace.hasAlbumLink.mockResolvedValue(false);

    await expect(sut.renameAlbum(auth, spaceId, albumId, { name: 'New name' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mocks.album.update).not.toHaveBeenCalled();
    expect(mocks.sharedSpace.logActivity).not.toHaveBeenCalled();
  });

  // Scenario 6
  it('is a no-op when the name is unchanged', async () => {
    const { auth, spaceId, albumId } = setupRenameAlbum(mocks);
    asSpaceEditor(mocks, auth, spaceId);

    await sut.renameAlbum(auth, spaceId, albumId, { name: 'Old name' });

    expect(mocks.album.update).not.toHaveBeenCalled();
    expect(mocks.sharedSpace.logActivity).not.toHaveBeenCalled();
  });

  // Spec E6 — album names are NOT unique in Immich. Folder names are, and this endpoint sits
  // right next to the folder ones, so pin the asymmetry before someone "helpfully" mirrors
  // assertNoAlbumFolderNameConflict here.
  it('allows renaming to a name another album already uses', async () => {
    const { auth, spaceId, albumId } = setupRenameAlbum(mocks);
    asSpaceEditor(mocks, auth, spaceId);

    await sut.renameAlbum(auth, spaceId, albumId, { name: 'Trip B' });

    expect(mocks.album.update).toHaveBeenCalledWith(albumId, { id: albumId, albumName: 'Trip B' }, auth.user.id);
  });

  // Scenario 20
  it('logs the rename only in the space named in the path', async () => {
    const { auth, spaceId, albumId } = setupRenameAlbum(mocks);
    asSpaceEditor(mocks, auth, spaceId);
    mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set());

    await sut.renameAlbum(auth, spaceId, albumId, { name: 'New name' });

    expect(mocks.sharedSpace.logActivity).toHaveBeenCalledTimes(1);
    expect(mocks.sharedSpace.logActivity).toHaveBeenCalledWith(expect.objectContaining({ spaceId }));
  });
});
```

Scenario 7 is a **schema** test and belongs in `server/src/dtos/shared-space.dto.spec.ts`, not in the
service spec — that is where this repo puts DTO validation, and the accessor is `.schema.safeParse`,
not `.zodSchema.parse`:

```ts
// Scenario 7 — so a blank name never reaches the service.
it('rejects a whitespace-only album name and trims a padded one', () => {
  expect(SharedSpaceAlbumRenameDto.schema.safeParse({ name: '   ' }).success).toBe(false);
  expect(SharedSpaceAlbumRenameDto.schema.safeParse({ name: '  Trip  ' })).toMatchObject({
    success: true,
    data: { name: 'Trip' },
  });
});
```

Add any missing imports to `shared-space.service.spec.ts`: `ForbiddenException`, `NotFoundException`
from `@nestjs/common`; `SharedSpaceActivityType`, `SharedSpaceRole` from `src/enum`. The file already
imports `factory` / `newUuid` from `test/small.factory` and `ServiceMocks` from `test/utils`, and the
mock names used above are the real ones (`mocks.access.album.checkOwnerAccess`, `mocks.album.getById`
/ `.update`, `mocks.sharedSpace.*`). `SharedSpaceAlbumRenameDto` is imported by
`shared-space.dto.spec.ts` instead.

- [ ] **Step 4: Run the tests and verify they fail**

```bash
cd server && pnpm test -- --run src/services/shared-space.service.spec.ts -t renameAlbum
```

Expected: FAIL — `sut.renameAlbum is not a function`.

- [ ] **Step 5: Implement the service method**

In `server/src/services/shared-space.service.ts`, directly after `updateAlbumLink`:

```ts
  /**
   * Rename a space-linked album. Gate mirrors #unlinkAlbumChecked: a current-space Editor
   * short-circuits, otherwise the caller must hold AlbumUpdate on the album itself — which is how
   * an owner who is not a space member can still rename their own album.
   *
   * The hasAlbumLink guard runs in BOTH arms, below the branch: without it in the owner arm, a
   * leaked spaceId would inject an AlbumRename row into an unrelated space's activity feed, and a
   * nonexistent spaceId 500s on the FK.
   */
  async renameAlbum(
    auth: AuthDto,
    spaceId: string,
    albumId: string,
    dto: SharedSpaceAlbumRenameDto,
  ): Promise<void> {
    const member = await this.sharedSpaceRepository.getMember(spaceId, auth.user.id);
    const isSpaceEditor = !!member && getSharedSpaceRoleScore(member.role) >= ROLE_HIERARCHY[SharedSpaceRole.Editor];
    if (!isSpaceEditor) {
      const allowed = await this.checkAccess({ auth, permission: Permission.AlbumUpdate, ids: [albumId] });
      if (!allowed.has(albumId)) {
        throw new ForbiddenException('Insufficient role');
      }
    }

    const linked = await this.sharedSpaceRepository.hasAlbumLink(spaceId, albumId);
    if (!linked) {
      throw new NotFoundException('Album is not linked to this space');
    }

    const album = await this.albumRepository.getById(albumId, { withAssets: false });
    const previousName = album?.albumName ?? '';
    if (previousName === dto.name) {
      // A no-op rename must not spam the space feed.
      return;
    }

    // Third argument is required — it is the id withAlbumUsers(authUserId) projects against.
    // Pass the CALLER's id, not the owner's: a space editor renaming someone else's album is the
    // caller, exactly as album.service.ts#update does.
    await this.albumRepository.update(albumId, { id: albumId, albumName: dto.name }, auth.user.id);

    await this.sharedSpaceRepository.logActivity({
      spaceId,
      userId: auth.user.id,
      type: SharedSpaceActivityType.AlbumRename,
      data: { albumId, albumName: dto.name, previousName },
    });
  }
```

Add `SharedSpaceAlbumRenameDto` to the `src/dtos/shared-space.dto` import list at the top of the service.

- [ ] **Step 6: Run the tests and verify they pass**

```bash
cd server && pnpm test -- --run src/services/shared-space.service.spec.ts -t renameAlbum
```

Expected: PASS, 7 tests.

- [ ] **Step 7: Add the controller route**

In `server/src/controllers/shared-space.controller.ts`, next to `@Put(':id/albums/:albumId/folder')`:

```ts
  @Put(':id/albums/:albumId/name')
  @Authenticated({ permission: Permission.AlbumUpdate })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Rename a space-linked album',
    description:
      'Requires space Editor OR album owner. Scoped Permission.AlbumUpdate rather than ' +
      'SharedSpaceAlbumUpdate on purpose: @Authenticated gates API-KEY scope, and the effect of ' +
      'this call is an album mutation visible everywhere in the product, not a change to ' +
      'space-link metadata. A key holding only space-album scope must not be able to rename ' +
      "arbitrary albums through this route's editor arm.",
    history: new HistoryBuilder().added('v1').beta('v1'),
  })
  renameSharedSpaceAlbum(
    @Auth() auth: AuthDto,
    @Param() { id, albumId }: SharedSpaceAlbumParamDto,
    @Body() dto: SharedSpaceAlbumRenameDto,
  ): Promise<void> {
    return this.service.renameAlbum(auth, id, albumId, dto);
  }
```

- [ ] **Step 8: Type-check and lint**

```bash
cd server && pnpm run check && pnpm run lint
```

Expected: both clean. (`make check-server` / `make lint-server` do **not** exist in this
repo's Makefile despite what CLAUDE.md says — verified during Task 1.)

- [ ] **Step 9: Commit**

```bash
git add server/src/dtos/shared-space.dto.ts server/src/enum.ts \
        server/src/services/shared-space.service.ts server/src/services/shared-space.service.spec.ts \
        server/src/controllers/shared-space.controller.ts
git commit -m "feat(server): rename a space-linked album as editor or owner"
```

---

## Task 2: Server — bulk delete route

**Files:**

- Modify: `server/src/enum.ts`
- Modify: `server/src/services/shared-space.service.ts`
- Modify: `server/src/controllers/shared-space.controller.ts`
- Test: `server/src/services/shared-space.service.spec.ts`

**Interfaces:**

- Consumes: `#runBulk(ids, fn)` and `#bulkErrorFor(error)` (existing private members of `SharedSpaceService`); `this.eventRepository.emit`; `this.albumRepository.delete`; `SharedSpaceBulkAlbumIdsDto` from `src/dtos/shared-space-bulk.dto`.
- Produces:
  - `SharedSpaceService.bulkDeleteAlbums(auth: AuthDto, spaceId: string, dto: SharedSpaceBulkAlbumIdsDto): Promise<BulkIdResponseDto[]>`
  - `SharedSpaceActivityType.AlbumDelete = 'album_delete'`, `AlbumBulkDelete = 'album_bulk_delete'`
  - Route `POST /shared-spaces/:id/albums/bulk-delete`

Covers spec scenarios 8–19.

- [ ] **Step 1: Add the activity types**

In `server/src/enum.ts`, after the `AlbumRename` line added in Task 1:

```ts
  AlbumDelete = 'album_delete',
  AlbumBulkDelete = 'album_bulk_delete',
```

Both are ≤ 30 characters, which `shared_space_activity.type` (`varchar(30)`) requires.

- [ ] **Step 2: Write the failing tests**

Helper next to `setupRenameAlbum`:

```ts
/** Owner-of-everything fixture for the bulkDeleteAlbums tests. */
const setupBulkDeleteAlbums = (mocks: ServiceMocks) => {
  const auth = factory.auth();
  const spaceId = newUuid();
  const [a1, a2, a3] = [newUuid(), newUuid(), newUuid()];
  const albumNames = new Map([
    [a1, 'Trip A'],
    [a2, 'Trip B'],
    [a3, 'Trip C'],
  ]);
  mocks.access.album.checkOwnerAccess.mockImplementation((_userId: string, ids: Set<string>) =>
    Promise.resolve(new Set(ids)),
  );
  mocks.sharedSpace.hasAlbumLink.mockResolvedValue(true);
  mocks.sharedSpace.logActivity.mockResolvedValue(void 0);
  mocks.album.getById.mockImplementation((id: string) =>
    Promise.resolve({ albumName: albumNames.get(id) ?? 'Unknown' } as any),
  );
  mocks.album.delete.mockResolvedValue(void 0);
  return { auth, spaceId, a1, a2, a3 };
};
```

Scenarios:

```ts
describe('bulkDeleteAlbums', () => {
  // Scenario 8
  it('emits AlbumDelete before deleting, logs one album_delete row, and queues NO reconcile', async () => {
    const { auth, spaceId, a1 } = setupBulkDeleteAlbums(mocks);

    const result = await sut.bulkDeleteAlbums(auth, spaceId, { ids: [a1] });

    expect(result).toEqual([{ id: a1, success: true }]);
    // Ordering matters: onAlbumDelete's orphan queries must run while the rows still exist.
    const emitOrder = mocks.event.emit.mock.invocationCallOrder[0];
    const deleteOrder = mocks.album.delete.mock.invocationCallOrder[0];
    expect(emitOrder).toBeLessThan(deleteOrder);
    expect(mocks.event.emit).toHaveBeenCalledWith('AlbumDelete', { albumId: a1 });
    expect(mocks.sharedSpace.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SharedSpaceActivityType.AlbumDelete,
        data: { albumId: a1, albumName: 'Trip A' },
      }),
    );
    // Both tables reconcileAlbumGrants reads cascade from `album`, so a reconcile here is
    // provably dead work. Pinning its ABSENCE stops it being "helpfully" reinstated.
    expect(mocks.job.queue).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: JobName.SharedSpaceAlbumGrantReconcile }),
    );
  });

  // Scenario 9 — the regression most likely to creep back in.
  it('refuses a space Owner who does not own the album', async () => {
    const { auth, spaceId, a1 } = setupBulkDeleteAlbums(mocks);
    mocks.sharedSpace.getMember.mockResolvedValue({
      spaceId,
      userId: auth.user.id,
      role: SharedSpaceRole.Owner,
    } as any);
    mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set());

    const result = await sut.bulkDeleteAlbums(auth, spaceId, { ids: [a1] });

    expect(result[0]).toMatchObject({ id: a1, success: false, error: BulkIdErrorReason.NO_PERMISSION });
    expect(mocks.album.delete).not.toHaveBeenCalled();
  });

  // Scenario 10
  it('lets a non-member owner delete their own album', async () => {
    const { auth, spaceId, a1 } = setupBulkDeleteAlbums(mocks);
    mocks.sharedSpace.getMember.mockResolvedValue(void 0 as any);

    const result = await sut.bulkDeleteAlbums(auth, spaceId, { ids: [a1] });

    expect(result[0].success).toBe(true);
  });

  // Scenario 11
  it('reports per item on a mixed batch and logs exactly one bulk row', async () => {
    const { auth, spaceId, a1, a2, a3 } = setupBulkDeleteAlbums(mocks);
    mocks.access.album.checkOwnerAccess.mockImplementation((_userId: string, ids: Set<string>) =>
      Promise.resolve(new Set([...ids].filter((id) => id !== a2))),
    );

    const result = await sut.bulkDeleteAlbums(auth, spaceId, { ids: [a1, a2, a3] });

    expect(result[0].success).toBe(true);
    expect(result[1]).toMatchObject({ id: a2, success: false, error: BulkIdErrorReason.NO_PERMISSION });
    expect(result[2].success).toBe(true);
    expect(mocks.album.delete).toHaveBeenCalledTimes(2);
    expect(mocks.sharedSpace.logActivity).toHaveBeenCalledTimes(1);
    expect(mocks.sharedSpace.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SharedSpaceActivityType.AlbumBulkDelete,
        data: { count: 2, albumName: 'Trip A' },
      }),
    );
  });

  // Scenario 12
  it('logs album_delete, not album_bulk_delete, when exactly one of several ids succeeds', async () => {
    const { auth, spaceId, a1, a2 } = setupBulkDeleteAlbums(mocks);
    mocks.access.album.checkOwnerAccess.mockImplementation((_userId: string, ids: Set<string>) =>
      Promise.resolve(new Set([...ids].filter((id) => id === a1))),
    );

    await sut.bulkDeleteAlbums(auth, spaceId, { ids: [a1, a2] });

    expect(mocks.sharedSpace.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: SharedSpaceActivityType.AlbumDelete }),
    );
  });

  // Scenario 13
  it('returns 200-shaped per-item failures and logs nothing when every item fails', async () => {
    const { auth, spaceId, a1, a2 } = setupBulkDeleteAlbums(mocks);
    mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set());

    const result = await sut.bulkDeleteAlbums(auth, spaceId, { ids: [a1, a2] });

    expect(result).toHaveLength(2);
    expect(result.every((r) => !r.success)).toBe(true);
    expect(mocks.sharedSpace.logActivity).not.toHaveBeenCalled();
  });

  // Scenario 14
  it('reports not_found for an album that is not linked to this space', async () => {
    const { auth, spaceId, a1 } = setupBulkDeleteAlbums(mocks);
    mocks.sharedSpace.hasAlbumLink.mockResolvedValue(false);

    const result = await sut.bulkDeleteAlbums(auth, spaceId, { ids: [a1] });

    expect(result[0]).toMatchObject({ id: a1, success: false, error: BulkIdErrorReason.NOT_FOUND });
    expect(mocks.album.delete).not.toHaveBeenCalled();
  });

  // Scenario 15
  it('deduplicates repeated ids', async () => {
    const { auth, spaceId, a1 } = setupBulkDeleteAlbums(mocks);

    const result = await sut.bulkDeleteAlbums(auth, spaceId, { ids: [a1, a1] });

    expect(result).toEqual([{ id: a1, success: true }]);
    expect(mocks.album.delete).toHaveBeenCalledTimes(1);
  });

  // Scenario 17 — pins the ABSENCE of a hoisted requireRole.
  it('returns per-item no_permission for a non-member non-owner rather than throwing', async () => {
    const { auth, spaceId, a1, a2 } = setupBulkDeleteAlbums(mocks);
    mocks.sharedSpace.getMember.mockResolvedValue(void 0 as any);
    mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set());

    const result = await sut.bulkDeleteAlbums(auth, spaceId, { ids: [a1, a2] });

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.error === BulkIdErrorReason.NO_PERMISSION)).toBe(true);
  });

  // Scenario 18 — a trashed album is invisible to checkOwnerAccess (it filters deletedAt IS NULL),
  // so the reason is no_permission, NOT not_found. Pinned so it stays a decision.
  it('reports no_permission for a trashed album', async () => {
    const { auth, spaceId, a1 } = setupBulkDeleteAlbums(mocks);
    mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set());

    const result = await sut.bulkDeleteAlbums(auth, spaceId, { ids: [a1] });

    expect(result[0]).toMatchObject({ error: BulkIdErrorReason.NO_PERMISSION });
  });

  // Scenario 19 — the loser of a concurrent delete.
  it('reports no_permission and logs nothing when the album row is already gone', async () => {
    const { auth, spaceId, a1 } = setupBulkDeleteAlbums(mocks);
    mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set());

    const result = await sut.bulkDeleteAlbums(auth, spaceId, { ids: [a1] });

    expect(result[0].success).toBe(false);
    expect(mocks.sharedSpace.logActivity).not.toHaveBeenCalled();
    expect(mocks.album.delete).not.toHaveBeenCalled();
  });
});
```

**Scenario 16 needs no new test.** This route reuses `SharedSpaceBulkAlbumIdsDto` verbatim, and
`server/src/dtos/shared-space-bulk.dto.spec.ts` already pins that exact DTO's empty-array, over-1000
and non-uuid rejections. Do not write a duplicate — instead note in the controller's `@Endpoint`
description that the DTO is shared, so the link between the endpoint and its validation coverage
stays discoverable.

Add imports if missing: `BulkIdErrorReason`, `JobName`, `SharedSpaceActivityType`, `SharedSpaceRole`
from `src/enum`. `mocks.event.emit`, `mocks.album.delete` and `mocks.job.queue` are all real mock
names on `ServiceMocks`.

- [ ] **Step 3: Run the tests and verify they fail**

```bash
cd server && pnpm test -- --run src/services/shared-space.service.spec.ts -t bulkDeleteAlbums
```

Expected: FAIL — `sut.bulkDeleteAlbums is not a function`.

- [ ] **Step 4: Implement the service methods**

In `server/src/services/shared-space.service.ts`, after `bulkSetAlbumTimeline`:

```ts
  /**
   * Owner-gated per item, with NO Editor arm — deletion destroys another user's album globally,
   * so only its owner may do it. A space Owner who does not own the album gets no_permission.
   *
   * Replicates album.service.ts#delete's two steps in the same order rather than calling across
   * services (not this codebase's pattern). Emitting BEFORE the delete is what lets
   * onAlbumDelete's orphan queries run while the rows still exist. If album.service.ts#delete
   * ever gains a third step, this must follow.
   */
  async #deleteAlbumChecked(auth: AuthDto, spaceId: string, albumId: string): Promise<string> {
    const allowed = await this.checkAccess({ auth, permission: Permission.AlbumDelete, ids: [albumId] });
    if (!allowed.has(albumId)) {
      throw new ForbiddenException('Insufficient role');
    }

    const linked = await this.sharedSpaceRepository.hasAlbumLink(spaceId, albumId);
    if (!linked) {
      throw new NotFoundException('Album is not linked to this space');
    }

    // Captured before the delete — unreadable afterwards, and the activity row needs it.
    const album = await this.albumRepository.getById(albumId, { withAssets: false });
    const albumName = album?.albumName ?? '';

    await this.eventRepository.emit('AlbumDelete', { albumId });
    await this.albumRepository.delete(albumId);
    return albumName;
  }

  /**
   * Serves BOTH single and bulk delete — the card menu sends a one-element array, which is why
   * there is no second route competing with DELETE :id/albums/:albumId (unlink) for a name.
   *
   * Deliberately NO hoisted requireRole: like bulkUnlinkAlbums, the owner arm needs a per-item
   * decision, so an album owner who is not a space member must still succeed.
   *
   * Deliberately NO queueAlbumGrantReconcile either: reconcileAlbumGrants reads from
   * shared_space_album and shared_space_album_user, and both cascade from `album`, so after the
   * delete it has nothing to read. The tombstones clients need come from the
   * shared_space_album_delete_audit trigger, and the nightly sweep is the backstop.
   */
  async bulkDeleteAlbums(
    auth: AuthDto,
    spaceId: string,
    dto: SharedSpaceBulkAlbumIdsDto,
  ): Promise<BulkIdResponseDto[]> {
    const names = new Map<string, string>();
    const results = await this.#runBulk(dto.ids, async (albumId) => {
      names.set(albumId, await this.#deleteAlbumChecked(auth, spaceId, albumId));
    });

    const succeeded = results.filter((r) => r.success).map((r) => r.id);
    if (succeeded.length === 1) {
      await this.sharedSpaceRepository.logActivity({
        spaceId,
        userId: auth.user.id,
        type: SharedSpaceActivityType.AlbumDelete,
        data: { albumId: succeeded[0], albumName: names.get(succeeded[0]) ?? '' },
      });
    } else if (succeeded.length > 1) {
      // ONE row for the batch; albumName carries the first success so the feed renders
      // "X and N others", mirroring AlbumBulkUnlink.
      await this.sharedSpaceRepository.logActivity({
        spaceId,
        userId: auth.user.id,
        type: SharedSpaceActivityType.AlbumBulkDelete,
        data: { count: succeeded.length, albumName: names.get(succeeded[0]) ?? '' },
      });
    }
    return results;
  }
```

- [ ] **Step 5: Run the tests and verify they pass**

```bash
cd server && pnpm test -- --run src/services/shared-space.service.spec.ts -t bulkDeleteAlbums
```

Expected: PASS, 11 tests.

- [ ] **Step 6: Add the controller route**

In `server/src/controllers/shared-space.controller.ts`, **inside the existing bulk block, before the `:albumId` param routes** — that placement keeps the "bulk segments are never parsed as an albumId" invariant true by construction:

```ts
  @Post(':id/albums/bulk-delete')
  @Authenticated({ permission: Permission.AlbumDelete })
  @HttpCode(HttpStatus.OK)
  @Endpoint({
    summary: 'Delete several albums linked to a shared space',
    description:
      'Per-item results; the request succeeds with 200 even when every item fails. Deletes the ' +
      'ALBUMS, not just their space links — assets survive in their owner library. Authorizes per ' +
      'item on album ownership only, with no space-Editor arm, so a space Owner who does not own ' +
      'an album cannot delete it, while an album owner who is not a space member can. Scoped ' +
      'Permission.AlbumDelete rather than SharedSpaceAlbumDelete so a space-scoped API key cannot ' +
      'destroy albums.',
    history: new HistoryBuilder().added('v1').beta('v1'),
  })
  bulkDeleteAlbums(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Body() dto: SharedSpaceBulkAlbumIdsDto,
  ): Promise<BulkIdResponseDto[]> {
    return this.service.bulkDeleteAlbums(auth, id, dto);
  }
```

- [ ] **Step 7: Type-check and lint**

```bash
cd server && pnpm run check && pnpm run lint
```

- [ ] **Step 8: Commit**

```bash
git add server/src/enum.ts server/src/services/shared-space.service.ts \
        server/src/services/shared-space.service.spec.ts server/src/controllers/shared-space.controller.ts
git commit -m "feat(server): bulk-delete space albums, owner-gated per item"
```

---

## Task 3: Server — medium and e2e coverage

**Files:**

- Modify: `server/test/medium/specs/services/shared-space-album.service.spec.ts`
- Modify: `e2e/src/specs/server/api/shared-space-album.e2e-spec.ts` — **this file already exists**
  (878 lines) with `PUT`/`PATCH`/`GET :id/albums` groups and an `album delete via /albums/:id` group.
  Add the new describes into it; do not create a second file

**Interfaces:**

- Consumes: `SharedSpaceService.renameAlbum` and `.bulkDeleteAlbums` from Tasks 1–2.
- Produces: nothing consumed downstream.

Covers spec scenarios 21–25. Read the neighbouring `shared-space-album-folder.service.spec.ts` and `shared-space-album-folder.e2e-spec.ts` first and copy their fixture/bootstrap idiom exactly — those files define how this repo builds a space, members and linked albums against a real DB.

- [ ] **Step 1: Write the failing medium test**

Append to `server/test/medium/specs/services/shared-space-album.service.spec.ts`:

```ts
describe('album deletion cascades and sync tombstones', () => {
  // Scenario 21
  it('removes every shared_space_album row and audits each delete', async () => {
    // Given: one album linked to TWO spaces, both with a second member.
    // When: the owner deletes the album via bulkDeleteAlbums.
    // Then: both link rows are gone, and shared_space_album_audit has a row per link.
    // Assert on actual row counts read back from the DB, not on service return values.
  });

  // Scenario 22 — the assertion that earns this medium test.
  //
  // shared_space_album_delete_audit is a STATEMENT-level AFTER DELETE trigger on
  // shared_space_album that computes "who loses access". On an ALBUM delete, both
  // shared_space_album and shared_space_album_user cascade from the SAME statement, and nothing
  // in the schema orders those two cascades relative to the trigger. If the trigger runs after
  // the grants are gone, members' clients are never told they lost access and hold stale space
  // assets indefinitely — invisible to every unit test, since those mock the DB.
  it('writes a shared_space_album_user_audit tombstone for every member who lost access', async () => {
    // Then: one tombstone per (albumId, userId) that previously held a grant,
    // AND shared_space_album_user is empty for the album, proving the cascade ran at all.
  });
});
```

Fill each body using the fixture helpers already in that file. **If scenario 22 fails, stop and report it** — it means the sync-tombstone assumption in spec §2.2(3) is wrong and the design needs revisiting, not the test relaxing.

- [ ] **Step 2: Run the medium test and verify it fails, then passes**

```bash
cd server && pnpm test:medium -- --run test/medium/specs/services/shared-space-album.service.spec.ts
```

Expected first run: FAIL (empty test bodies assert nothing / rows not found). After filling in: PASS.

- [ ] **Step 3: Write the e2e spec**

Append to the **existing** `e2e/src/specs/server/api/shared-space-album.e2e-spec.ts`, reusing the
fixtures its top-level `describe('/shared-spaces/:id/albums (T18)')` already sets up. Read its
`album delete via /albums/:id` group first — it already establishes how a space-linked album delete is
exercised end to end:

```ts
describe('/shared-spaces/:id/albums rename and delete', () => {
  // Scenario 23 — full RBAC matrix.
  describe('PUT /shared-spaces/:id/albums/:albumId/name', () => {
    it('204s for a space Editor who does not own the album', async () => {});
    it('204s for the album owner with no space membership', async () => {});
    it('403s for a space Viewer who does not own the album', async () => {});
    it('404s when the album is not linked to the space', async () => {});
    it('400s on a blank name', async () => {});
  });

  describe('POST /shared-spaces/:id/albums/bulk-delete', () => {
    it('200s with success for the album owner', async () => {});
    it('200s with no_permission for a space Owner who does not own the album', async () => {});
    it('200s with per-item results on a mixed batch', async () => {});
    it('400s on an empty ids array', async () => {});
  });

  // Scenario 24 — pins the API-key scope decision, which is otherwise invisible.
  describe('api key scopes', () => {
    it('refuses bulk-delete for a key scoped only to sharedSpaceAlbum.delete', async () => {});
    it('accepts bulk-delete for a key scoped to album.delete', async () => {});
    it('refuses rename for a key scoped only to sharedSpaceAlbum.update', async () => {});
    it('accepts rename for a key scoped to album.update', async () => {});
  });

  // Scenario 25 — fails the day someone adds @Post(':id/albums/:albumId') above the bulk route.
  it('routes the literal bulk-delete segment to the bulk handler, not to :albumId', async () => {
    // Assert the response is NOT a 400 "invalid uuid".
  });
});
```

Fill every body. Empty `it` blocks pass vacuously — leaving one is a plan failure.

- [ ] **Step 4: Run the e2e spec**

```bash
cd e2e && pnpm test -- --run src/specs/server/api/shared-space-album.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/test/medium/specs/services/shared-space-album.service.spec.ts \
        e2e/src/specs/server/api/shared-space-album.e2e-spec.ts
git commit -m "test: cover space album rename/delete RBAC, scopes and delete cascades"
```

---

## Task 4: Regenerate the API clients

**Files:**

- Modify: `open-api/**`, `packages/sdk/src/fetch-client.ts`, `mobile/openapi/**` (all generated)

**Interfaces:**

- Consumes: the two routes from Tasks 1–2.
- Produces (names later tasks rely on verbatim):
  - TypeScript SDK: `renameSharedSpaceAlbum({ id, albumId, sharedSpaceAlbumRenameDto })`, `bulkDeleteAlbums({ id, sharedSpaceBulkAlbumIdsDto })`
  - Dart: `SharedSpacesApi.renameSharedSpaceAlbum(albumId, id, SharedSpaceAlbumRenameDto)`, `SharedSpacesApi.bulkDeleteAlbums(id, SharedSpaceBulkAlbumIdsDto)`

Java is required for the Dart generator.

- [ ] **Step 1: Build the server and regenerate**

```bash
cd server && pnpm build && pnpm sync:open-api
cd .. && make open-api
```

- [ ] **Step 2: Verify the generated names match what later tasks import**

```bash
grep -n "renameSharedSpaceAlbum\|bulkDeleteAlbums" packages/sdk/src/fetch-client.ts | head
grep -rn "renameSharedSpaceAlbum\|bulkDeleteAlbums" mobile/openapi/lib/api/shared_spaces_api.dart | head
```

Expected: both names present in both clients. If the generated names differ from the Interfaces block above, **update this plan's later tasks to the real names** rather than hand-editing generated code.

- [ ] **Step 3: Commit**

```bash
git add open-api packages/sdk mobile/openapi
git commit -m "chore: regenerate api clients for space album rename and bulk delete"
```

---

## Task 5: i18n — ten locales plus a coverage spec

**Files:**

- Modify: `i18n/{de,en,es,fr,it,nl,pl,ru,zh_Hans,zh_Hant}.json`
- Create: `web/src/lib/space-album-rename-delete-i18n.spec.ts`

**Interfaces:**

- Produces the keys every later client task references:
  `space_album_rename`, `space_album_name_label`, `space_album_delete`, `space_album_delete_confirm`, `space_album_bulk_delete_title`, `space_album_bulk_delete_confirm`, `space_album_error_rename`, `space_album_error_delete`, `spaces_activity_renamed_album`, `spaces_activity_deleted_album`, `spaces_activity_bulk_deleted_albums`.

Covers spec scenario 48.

- [ ] **Step 1: Write the failing coverage spec**

Create `web/src/lib/space-album-rename-delete-i18n.spec.ts`, modelled on the existing `web/src/lib/i18n-add-all.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)); // web/src/lib
const i18nDir = path.resolve(here, '../../../i18n'); // repo-root/i18n

const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'ru', 'zh_Hans', 'zh_Hant'];
const REQUIRED_KEYS = [
  'space_album_rename',
  'space_album_name_label',
  'space_album_delete',
  'space_album_delete_confirm',
  'space_album_bulk_delete_title',
  'space_album_bulk_delete_confirm',
  'space_album_error_rename',
  'space_album_error_delete',
  'spaces_activity_renamed_album',
  'spaces_activity_deleted_album',
  'spaces_activity_bulk_deleted_albums',
];

const load = (locale: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(i18nDir, `${locale}.json`), 'utf8'));

describe('i18n coverage for space album rename/delete', () => {
  for (const locale of LOCALES) {
    it(`${locale}.json contains all required keys`, () => {
      const messages = load(locale);
      for (const key of REQUIRED_KEYS) {
        expect(messages[key], `${key} missing in ${locale}.json`).toBeTypeOf('string');
      }
    });
  }
});
```

- [ ] **Step 2: Run it and verify it fails**

```bash
cd web && pnpm test -- --run src/lib/space-album-rename-delete-i18n.spec.ts
```

Expected: FAIL — every key missing in every locale.

- [ ] **Step 3: Add the English strings**

Into `i18n/en.json`, alphabetically among the existing `space_album_*` / `spaces_activity_*` keys:

```json
"space_album_rename": "Rename album",
"space_album_name_label": "Album name",
"space_album_delete": "Delete album",
"space_album_delete_confirm": "Delete \"{name}\"? This permanently deletes the album for everyone in this space, not just from this space. The photos in it are not deleted.",
"space_album_bulk_delete_title": "Delete {count} albums",
"space_album_bulk_delete_confirm": "This permanently deletes these albums for everyone, not just from this space. The photos in them are not deleted.",
"space_album_error_rename": "Unable to rename album",
"space_album_error_delete": "Unable to delete album",
"spaces_activity_renamed_album": "{name} renamed album \"{oldName}\" to \"{newName}\"",
"spaces_activity_deleted_album": "{name} deleted album \"{albumName}\"",
"spaces_activity_bulk_deleted_albums": "{name} deleted \"{albumName}\" and {count} other albums",
```

- [ ] **Step 4: Translate into the other nine locales**

Add the same keys to `de es fr it nl pl ru zh_Hans zh_Hant`, keeping every placeholder (`{name}`, `{count}`, `{oldName}`, `{newName}`, `{albumName}`) intact and preserving each file's existing key ordering convention. Keep the "for everyone, not just from this space" distinction in every translation — it is the only thing separating this action from Unlink.

- [ ] **Step 5: Run the coverage spec and verify it passes**

```bash
cd web && pnpm test -- --run src/lib/space-album-rename-delete-i18n.spec.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add i18n web/src/lib/space-album-rename-delete-i18n.spec.ts
git commit -m "feat(i18n): add space album rename/delete strings across ten locales"
```

---

## Task 6: Web — bulk action helper, rename modal, card and table menus

**Files:**

- Modify: `web/src/lib/utils/space-album-bulk-actions.ts`
- Modify: `web/src/lib/modals/SpaceAlbumFolderNameModal.svelte`
- Modify: `web/src/lib/components/spaces/space-album-card.svelte`
- Modify: `web/src/lib/components/spaces/space-albums-table.svelte`
- Test: `web/src/lib/utils/space-album-bulk-actions.spec.ts`, `web/src/lib/components/spaces/space-album-card.spec.ts`, `web/src/lib/components/spaces/space-albums-table.spec.ts`

**Interfaces:**

- Consumes: `bulkDeleteAlbums` from `@immich/sdk` (Task 4); i18n keys (Task 5); existing `runBulkAction` / `applyBulkResult` in the helper.
- Produces:
  - `bulkDeleteAlbumsAction(spaceId: string, ids: string[]): Promise<BulkActionResult>` where `BulkActionResult = { failedIds: string[]; failedCount: number }`
  - `SpaceAlbumFolderNameModal` props gain `icon?: string` and `label?: string`
  - `space-album-card.svelte` and `space-albums-table.svelte` props gain `canRename: boolean`, `canDelete: boolean`, `onRename?: (album) => void`, `onDelete?: (album) => void`

Covers spec scenarios 26–30, 39–40.

- [ ] **Step 1: Write the failing helper test**

Append to `web/src/lib/utils/space-album-bulk-actions.spec.ts`, following that file's existing SDK-mocking idiom:

```ts
describe('bulkDeleteAlbumsAction', () => {
  // Scenario 39
  it('returns exactly the failed subset on a partial failure', async () => {
    vi.mocked(bulkDeleteAlbums).mockResolvedValue([
      { id: 'a', success: true },
      { id: 'b', success: false },
    ]);

    await expect(bulkDeleteAlbumsAction('space-1', ['a', 'b'])).resolves.toEqual({
      failedIds: ['b'],
      failedCount: 1,
    });
  });

  // Scenario 40
  it('reports every id failed when the request throws', async () => {
    vi.mocked(bulkDeleteAlbums).mockRejectedValue(new Error('offline'));

    await expect(bulkDeleteAlbumsAction('space-1', ['a', 'b'])).resolves.toEqual({
      failedIds: ['a', 'b'],
      failedCount: 2,
    });
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

```bash
cd web && pnpm test -- --run src/lib/utils/space-album-bulk-actions.spec.ts
```

Expected: FAIL — `bulkDeleteAlbumsAction is not exported`.

- [ ] **Step 3: Implement the helper**

Add `bulkDeleteAlbums` to the `@immich/sdk` import list in `web/src/lib/utils/space-album-bulk-actions.ts`, then:

```ts
/**
 * Deletes the ALBUMS, not just their space links. Serves single delete too — the card menu sends
 * a one-element array — so there is one code path and one failure contract.
 */
export const bulkDeleteAlbumsAction = (spaceId: string, ids: string[]): Promise<BulkActionResult> =>
  runBulkAction(ids, () => bulkDeleteAlbums({ id: spaceId, sharedSpaceBulkAlbumIdsDto: { ids } }));
```

- [ ] **Step 4: Run the helper test and verify it passes**

```bash
cd web && pnpm test -- --run src/lib/utils/space-album-bulk-actions.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Generalise the name modal**

In `web/src/lib/modals/SpaceAlbumFolderNameModal.svelte`, replace the props block and the two hard-coded values:

```svelte
<script lang="ts">
  import { Field, FormModal, Input } from '@immich/ui';
  import { mdiFolderPlusOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    title: string;
    /** Pre-filled when renaming; empty when creating. */
    initialName?: string;
    /** Defaults keep every existing folder call site working unchanged. */
    icon?: string;
    label?: string;
    onClose: (name?: string) => void;
  };

  const {
    title,
    initialName = '',
    icon = mdiFolderPlusOutline,
    label = $t('space_album_folder_name_label'),
    onClose,
  }: Props = $props();

  let value = $state(initialName);

  const onSubmit = () => {
    const name = value.trim();
    onClose(name || undefined);
  };
</script>

<FormModal {title} {icon} {onClose} {onSubmit} size="small" submitText={$t('save')}>
  <Field {label}>
    <Input bind:value />
  </Field>
</FormModal>
```

- [ ] **Step 6: Write the failing card and table menu tests**

Append to `web/src/lib/components/spaces/space-album-card.spec.ts`, and the equivalent to `space-albums-table.spec.ts` (the table's menu currently holds only _Show/Hide in timeline_ and _Unlink_ — it has no `onMove` prop, so do not assert a Move item there):

```ts
describe('capability-gated menu', () => {
  // Scenario 26 — the positive case the negatives below depend on.
  it('shows Rename and Delete to an editor who owns the album', async () => {
    render(SpaceAlbumCard, { spaceId: 's', album, canManage: true, canRename: true, canDelete: true });
    await openMenu();

    expect(screen.getByText('space_album_rename')).toBeInTheDocument();
    expect(screen.getByText('space_album_delete')).toBeInTheDocument();
    expect(screen.getByText('spaces_linked_albums_unlink')).toBeInTheDocument();
  });

  // Scenario 27
  it('shows Rename but not Delete to an editor who does not own the album', async () => {
    render(SpaceAlbumCard, { spaceId: 's', album, canManage: true, canRename: true, canDelete: false });
    await openMenu();

    expect(screen.getByText('space_album_rename')).toBeInTheDocument();
    expect(screen.queryByText('space_album_delete')).not.toBeInTheDocument();
  });

  // Scenario 28
  it('shows only Rename and Delete to a viewer who owns the album', async () => {
    render(SpaceAlbumCard, { spaceId: 's', album, canManage: false, canRename: true, canDelete: true });
    await openMenu();

    expect(screen.getByText('space_album_rename')).toBeInTheDocument();
    expect(screen.getByText('space_album_delete')).toBeInTheDocument();
    expect(screen.queryByText('spaces_linked_albums_unlink')).not.toBeInTheDocument();
    expect(screen.queryByText('space_album_folder_move')).not.toBeInTheDocument();
  });

  // Scenario 29
  it('renders no menu at all for a viewer who does not own the album', () => {
    render(SpaceAlbumCard, { spaceId: 's', album, canManage: false, canRename: false, canDelete: false });

    expect(screen.queryByTestId('space-album-card-menu')).not.toBeInTheDocument();
  });

  // Scenario 30 — ownership grants rename and delete, never re-organisation.
  it('does not make the card draggable for a viewer who owns the album', () => {
    render(SpaceAlbumCard, { spaceId: 's', album, canManage: false, canRename: true, canDelete: true });

    expect(screen.getByTestId('space-album-card')).toHaveAttribute('draggable', 'false');
  });
});
```

Note `$t` returns raw keys under this repo's vitest setup, which is why the assertions match key names.

- [ ] **Step 7: Run them and verify they fail**

```bash
cd web && pnpm test -- --run src/lib/components/spaces/space-album-card.spec.ts src/lib/components/spaces/space-albums-table.spec.ts
```

Expected: FAIL — unknown props, and Rename/Delete not found.

- [ ] **Step 8: Implement the card menu**

In `web/src/lib/components/spaces/space-album-card.svelte`, extend `Props` with `canRename: boolean`, `canDelete: boolean`, `onRename?: (album: SharedSpaceLinkedAlbumDto) => void`, `onDelete?: (album: SharedSpaceLinkedAlbumDto) => void`, destructure them, then replace the menu wrapper:

```svelte
{#if canManage || canRename || canDelete}
  <div
    class="absolute inset-e-6 top-6 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
    data-testid="space-album-card-menu"
  >
    <ButtonContextMenu
      icon={mdiDotsVertical}
      title={$t('more')}
      color="secondary"
      variant="filled"
      size="medium"
      align="top-right"
      direction="left"
      buttonClass="icon-white-drop-shadow"
    >
      {#if canManage}
        <MenuOption
          text={album.showInTimeline ? $t('spaces_hide_from_timeline') : $t('spaces_linked_albums_show_in_timeline')}
          onClick={() => onToggleTimeline?.(album)}
        />
        <MenuOption text={$t('space_album_folder_move')} onClick={() => onMove?.(album)} />
        <MenuOption text={$t('spaces_linked_albums_unlink')} onClick={() => onUnlink?.(album)} />
      {/if}
      {#if canRename}
        <MenuOption text={$t('space_album_rename')} onClick={() => onRename?.(album)} />
      {/if}
      {#if canDelete}
        <MenuOption text={$t('space_album_delete')} onClick={() => onDelete?.(album)} />
      {/if}
    </ButtonContextMenu>
  </div>
{/if}
```

`draggable={canManage}` on the outer div stays exactly as it is.

- [ ] **Step 9: Implement the table menu**

Apply the same split in `web/src/lib/components/spaces/space-albums-table.svelte`: change `{#if canManage}` guarding the menu `<td>` to `{#if canManage || canRename || canDelete}`, wrap the two existing `MenuOption`s in an inner `{#if canManage}`, and append the same Rename and Delete options.

- [ ] **Step 10: Run the tests and verify they pass**

```bash
cd web && pnpm test -- --run src/lib/components/spaces/space-album-card.spec.ts src/lib/components/spaces/space-albums-table.spec.ts src/lib/utils/space-album-bulk-actions.spec.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add web/src/lib/utils/space-album-bulk-actions.ts web/src/lib/utils/space-album-bulk-actions.spec.ts \
        web/src/lib/modals/SpaceAlbumFolderNameModal.svelte \
        web/src/lib/components/spaces/space-album-card.svelte web/src/lib/components/spaces/space-album-card.spec.ts \
        web/src/lib/components/spaces/space-albums-table.svelte web/src/lib/components/spaces/space-albums-table.spec.ts
git commit -m "feat(web): capability-gated rename and delete on space album cards"
```

---

## Task 7: Web — select bar, list selection, page handlers, activity feed

**Files:**

- Modify: `web/src/lib/components/spaces/space-album-select-bar.svelte`
- Modify: `web/src/lib/components/spaces/space-albums-list.svelte`
- Modify: `web/src/routes/(user)/spaces/[spaceId]/albums/+page.svelte`
- Modify: `web/src/lib/components/spaces/space-activity-feed.svelte`
- Test: `space-album-select-bar.spec.ts`, `space-albums-list.spec.ts`, `space-albums-page.spec.ts`, `space-activity-feed.spec.ts`

**Interfaces:**

- Consumes: `bulkDeleteAlbumsAction` (Task 6), `SpaceAlbumFolderNameModal`'s `icon`/`label` props (Task 6), `renameSharedSpaceAlbum` from `@immich/sdk` (Task 4), `authManager.user.id`, `SharedSpaceLinkedAlbumDto.ownerId`.
- Produces: `space-album-select-bar.svelte` props gain `canManage?: boolean` (**default `true`**) and `canDelete?: boolean` (default `false`).

Covers spec scenarios 31–38, 41–43, 47.

- [ ] **Step 1: Write the failing select-bar tests**

Append to `web/src/lib/components/spaces/space-album-select-bar.spec.ts`:

```ts
// Scenario 31
it('shows Delete for an album selection when canDelete', () => {
  renderWithTooltips(SpaceAlbumSelectBar, { kind: 'album', count: 2, canDelete: true, onClear: vi.fn() });
  expect(screen.getByRole('button', { name: 'space_album_delete' })).toBeInTheDocument();
});

it('hides Delete for an album selection when not canDelete', () => {
  renderWithTooltips(SpaceAlbumSelectBar, { kind: 'album', count: 2, canDelete: false, onClear: vi.fn() });
  expect(screen.queryByRole('button', { name: 'space_album_delete' })).not.toBeInTheDocument();
});

// Scenario 32 — the viewer's bar.
it('shows Delete alone when canManage is false', () => {
  renderWithTooltips(SpaceAlbumSelectBar, {
    kind: 'album',
    count: 1,
    canManage: false,
    canDelete: true,
    onClear: vi.fn(),
  });
  expect(screen.getByRole('button', { name: 'space_album_delete' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'space_album_unlink_from_space' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'space_album_folder_move' })).not.toBeInTheDocument();
});

// Scenario 33
it('does not render the album Delete for a folder selection', () => {
  renderWithTooltips(SpaceAlbumSelectBar, { kind: 'folder', count: 1, canDelete: true, onClear: vi.fn() });
  expect(screen.queryByRole('button', { name: 'space_album_delete' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'space_album_folder_delete' })).toBeInTheDocument();
});

// Scenario 34
it('fires onDelete exactly once', async () => {
  const onDelete = vi.fn();
  renderWithTooltips(SpaceAlbumSelectBar, { kind: 'album', count: 2, canDelete: true, onDelete, onClear: vi.fn() });
  await fireEvent.click(screen.getByRole('button', { name: 'space_album_delete' }));
  expect(onDelete).toHaveBeenCalledTimes(1);
});

// Scenario 35 — pins the canManage = true default, which the pre-existing specs in this file rely on.
it('keeps the editor buttons when no capability props are passed at all', () => {
  renderWithTooltips(SpaceAlbumSelectBar, { kind: 'album', count: 3, onClear: vi.fn() });
  expect(screen.getByRole('button', { name: 'space_album_unlink_from_space' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd web && pnpm test -- --run src/lib/components/spaces/space-album-select-bar.spec.ts
```

Expected: FAIL — no album Delete button.

- [ ] **Step 3: Implement the select bar**

In `web/src/lib/components/spaces/space-album-select-bar.svelte`, add to `Props`:

```ts
    /** Space-Editor actions. Defaults true so existing folder/album call sites are unchanged. */
    canManage?: boolean;
    /** True only when EVERY selected album is owned by the current user. */
    canDelete?: boolean;
    onDeleteAlbums?: () => void;
```

Destructure with `canManage = true, canDelete = false, onDeleteAlbums`, then replace the album branch:

```svelte
  {#if kind === 'album'}
    {#if canManage}
      <Button variant="ghost" onclick={onUnlink}>{$t('space_album_unlink_from_space')}</Button>
      <Button variant="ghost" onclick={onMove}>{$t('space_album_folder_move')}</Button>
      <Button variant="ghost" onclick={() => onToggleTimeline?.(!allInTimeline)}>
        {$t(allInTimeline ? 'space_album_bulk_remove_from_timeline' : 'space_album_bulk_add_to_timeline')}
      </Button>
    {/if}
    {#if canDelete}
      <Button variant="ghost" color="danger" onclick={onDeleteAlbums}>{$t('space_album_delete')}</Button>
    {/if}
  {:else if kind === 'folder'}
```

`onDeleteAlbums` is a separate prop from the folder branch's `onDelete` so the two destructive actions can never be crossed.

- [ ] **Step 4: Run and verify the select-bar tests pass**

```bash
cd web && pnpm test -- --run src/lib/components/spaces/space-album-select-bar.spec.ts
```

- [ ] **Step 5: Write the failing list-selection tests**

Append to `web/src/lib/components/spaces/space-albums-list.spec.ts`, following that file's existing render harness:

```ts
// Scenario 36
it('lets a viewer select an album they own but not one they do not', async () => {});

// Scenario 37
it('does not let a viewer select a folder', async () => {});

// Scenario 38
it('hides bulk Delete once an unowned album joins the selection', async () => {});
```

Fill each body against the real component.

- [ ] **Step 6: Implement the list changes**

In `web/src/lib/components/spaces/space-albums-list.svelte`:

```ts
// Ownership is a pure derivation — ownerId is already on SharedSpaceLinkedAlbumDto.
const isOwner = (album: SharedSpaceLinkedAlbumDto) => album.ownerId === authManager.user.id;
const canSelectAlbum = (album: SharedSpaceLinkedAlbumDto) => canManage || isOwner(album);
const allSelectedAlbumsOwned = $derived(
  selection.kind === 'album' &&
    selection.count > 0 &&
    [...selection.ids].every((id) => {
      const album = allAlbums.find((a) => a.id === id);
      return !!album && isOwner(album);
    }),
);
```

Gate every album selection entry point on `canSelectAlbum(album)` and leave folder selection gated on `canManage`. Widen the bar wrapper and wire the new props:

```svelte
{#if (canManage || selection.kind === 'album') && selection.selectionActive}
  <SpaceAlbumSelectBar
    kind={selection.kind === 'folder' ? 'folder' : 'album'}
    count={selection.count}
    allInTimeline={allSelectedAlbumsInTimeline}
    {canManage}
    canDelete={allSelectedAlbumsOwned}
    onClear={() => selection.clear()}
    onUnlink={() => void runBulkAction(onBulkUnlink, selection.ids)}
    onMove={() => void runBulkAction(selection.kind === 'folder' ? onBulkMoveFolders : onBulkMoveAlbums, selection.ids)}
    onDelete={() => void runBulkAction(onBulkDeleteFolders, selection.ids)}
    onDeleteAlbums={() => void runBulkAction(onBulkDeleteAlbums, selection.ids)}
    onToggleTimeline={(showInTimeline) =>
      void runBulkAction(
        onBulkToggleAlbumsTimeline && ((ids) => onBulkToggleAlbumsTimeline(ids, showInTimeline)),
        selection.ids,
      )}
  />
{/if}
```

Add `onBulkDeleteAlbums?: (ids: string[]) => Promise<string[]>` and `onRenameAlbum?: (album: SharedSpaceLinkedAlbumDto) => void` to `Props`, and pass `canRename={canManage || isOwner(album)}`, `canDelete={isOwner(album)}`, `onRename`, `onDelete` down to every `SpaceAlbumCard` / `SpaceAlbumsTable` usage in this file.

- [ ] **Step 7: Write the failing page-handler tests**

Append to `web/src/routes/(user)/spaces/[spaceId]/albums/space-albums-page.spec.ts`:

```ts
// Scenario 41
it('deselects nothing and issues no request when the delete confirm is cancelled', async () => {});

// Scenario 42
it('keeps the failed ids selected and warns once after a partial failure', async () => {});

// Scenario 43
it('sends the trimmed name on rename and renders it', async () => {});
```

Fill each body.

- [ ] **Step 8: Implement the page handlers**

In `web/src/routes/(user)/spaces/[spaceId]/albums/+page.svelte`, beside the existing `handleBulk*` functions:

```ts
async function handleRenameAlbum(album: SharedSpaceLinkedAlbumDto) {
  const name = await modalManager.show(SpaceAlbumFolderNameModal, {
    title: $t('space_album_rename'),
    initialName: album.albumName,
    icon: mdiRenameOutline,
    label: $t('space_album_name_label'),
  });
  if (!name) {
    return;
  }
  try {
    // NOT handleUpdateAlbum — that issues PATCH /albums/{id}, which 403s for a space editor
    // who does not own the album. This route carries the editor arm.
    await renameSharedSpaceAlbum({ id: space.id, albumId: album.id, sharedSpaceAlbumRenameDto: { name } });
    await reload();
  } catch (error) {
    handleError(error, $t('space_album_error_rename'));
  }
}

// Serves single delete too — the card menu passes one id. The copy branches on length: the
// bulk title interpolates a count, so reusing it for one album would read "Delete 1 albums".
async function handleBulkDeleteAlbums(ids: string[], albumName?: string): Promise<string[]> {
  const single = ids.length === 1;
  const confirmed = await modalManager.showDialog({
    title: single ? $t('space_album_delete') : $t('space_album_bulk_delete_title', { values: { count: ids.length } }),
    prompt: single
      ? $t('space_album_delete_confirm', { values: { name: albumName ?? '' } })
      : $t('space_album_bulk_delete_confirm'),
    confirmText: $t('delete'),
    confirmColor: 'danger',
  });
  if (!confirmed) {
    // Nothing happened, so nothing should be deselected.
    return ids;
  }
  const { failedIds, failedCount } = await bulkDeleteAlbumsAction(space.id, ids);
  notifyBulkFailures(failedCount);
  await reload();
  return failedIds;
}

async function handleDeleteAlbum(album: SharedSpaceLinkedAlbumDto) {
  await handleBulkDeleteAlbums([album.id], album.albumName);
}
```

The page's reload helper is `reload()` (declared around line 120), and `handleError` is already
imported from `$lib/utils/handle-error` — use both as named. Add `mdiRenameOutline` to the `@mdi/js`
import. Match `modalManager.showDialog`'s option names against the existing `handleBulkUnlink` /
`handleBulkDeleteFolders` calls in the same file. Pass `onRenameAlbum={handleRenameAlbum}`, `onDeleteAlbum={handleDeleteAlbum}` and `onBulkDeleteAlbums={handleBulkDeleteAlbums}` into `SpaceAlbumsList`.

- [ ] **Step 9: Write the failing activity-feed test**

Append to `web/src/lib/components/spaces/space-activity-feed.spec.ts`, in the same table-driven style the file already uses:

```ts
// Scenario 47
{ type: 'album_rename', data: { oldName: 'A', newName: 'B' }, text: 'renamed album "A" to "B"' },
{ type: 'album_delete', data: { albumName: 'Trip' }, text: 'deleted album "Trip"' },
{ type: 'album_bulk_delete', data: { albumName: 'Trip', count: 3 }, text: '"Trip" and 2 other albums' },

it('renders album_bulk_delete with zero others when only one album was deleted', () => {
  // data: { albumName: 'Trip', count: 1 } must read "0 other", never a negative count.
});
```

- [ ] **Step 10: Implement the activity-feed cases**

In `web/src/lib/components/spaces/space-activity-feed.svelte`, beside the `album_bulk_unlink` case:

```ts
      case 'album_rename': {
        return $t('spaces_activity_renamed_album', {
          values: { name, oldName: String(data.previousName ?? ''), newName: String(data.albumName ?? '') },
        });
      }
      case 'album_delete': {
        return $t('spaces_activity_deleted_album', { values: { name, albumName: String(data.albumName ?? '') } });
      }
      case 'album_bulk_delete': {
        // Same convention as album_bulk_unlink: the server logs the TOTAL succeeded, and the
        // string reads "{albumName} and N other", so subtract the one already named and clamp.
        const others = Math.max(count - 1, 0);
        return $t('spaces_activity_bulk_deleted_albums', {
          values: { name, albumName: String(data.albumName ?? ''), count: others },
        });
      }
```

- [ ] **Step 11: Run all web tests and gates**

```bash
cd web && pnpm test -- --run src/lib/components/spaces src/lib/utils/space-album-bulk-actions.spec.ts \
  'src/routes/(user)/spaces/[spaceId]/albums/space-albums-page.spec.ts'
cd web && pnpm check:typescript && pnpm check:svelte && pnpm lint
```

Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add web/src/lib/components/spaces web/src/routes/'(user)'/spaces
git commit -m "feat(web): bulk-delete owned space albums and rename from the list"
```

---

## Task 8: Web — space album detail page

**Files:**

- Modify: `web/src/routes/(user)/spaces/[spaceId]/albums/[albumId=id]/[[photos=photos]]/[[assetId=id]]/+page.svelte`
- Test: `.../space-album-detail-page.spec.ts`

**Interfaces:**

- Consumes: `renameSharedSpaceAlbum`, `bulkDeleteAlbumsAction`, `SpaceAlbumFolderNameModal`, i18n keys.
- Produces: nothing consumed downstream.

Covers spec scenarios 44–46.

- [ ] **Step 1: Write the failing tests**

Append to `space-album-detail-page.spec.ts`:

```ts
// Scenario 44
it('offers Rename but not Delete to an editor who does not own the album', async () => {});

// Scenario 45
it('offers Delete to a viewer who owns the album and navigates to the album list on success', async () => {});

// Scenario 46
it('does not navigate and surfaces an error when delete fails', async () => {});
```

Fill each body using the file's existing render harness and its navigation mock.

- [ ] **Step 2: Run and verify failure**

```bash
cd web && pnpm test -- --run 'src/routes/(user)/spaces/[spaceId]/albums/[albumId=id]/[[photos=photos]]/[[assetId=id]]/space-album-detail-page.spec.ts'
```

- [ ] **Step 3: Implement**

Add the same two menu options to the detail page's action menu, gated `canManage || isOwner` for Rename and `isOwner` for Delete, where `isOwner` compares the album's `ownerId` to `authManager.user.id`. Reuse `handleRenameAlbum`'s shape from Task 7. On successful delete, navigate to the space albums list, preserving the album's folder exactly as the page's existing back button does — reuse that same route helper rather than hand-building a URL. On failure, do not navigate; surface the error via `handleError` with `space_album_error_delete`.

- [ ] **Step 4: Run and verify passing, then gates**

```bash
cd web && pnpm test -- --run 'src/routes/(user)/spaces/[spaceId]/albums/[albumId=id]'
cd web && pnpm check:typescript && pnpm check:svelte && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add web/src/routes/'(user)'/spaces
git commit -m "feat(web): rename and delete a space album from its detail page"
```

---

## Task 9: Mobile — ownership join

**Files:**

- Modify: `mobile/lib/domain/models/space_album.model.dart`
- Modify: `mobile/lib/infrastructure/repositories/space_album.repository.dart`
- Modify: `mobile/lib/providers/infrastructure/space_album.provider.dart`
- Test: `mobile/test/medium/repositories/space_album_repository_test.dart`

**Interfaces:**

- Consumes: `_db.remoteAlbumUserEntity` (columns `albumId`, `userId`, `role` as `intEnum<AlbumUserRole>`), `currentUserProvider`.
- Produces: `SpaceAlbum.isOwnedByMe: bool` (defaults `false`), and `SpaceAlbumRepository.watchLinkedAlbums(String spaceId, {String? currentUserId})`.

Covers spec scenarios 49–53.

Setup for running Flutter tests (read the pin from `mobile/mise.toml`, do not trust a remembered version):

```bash
cd mobile && flutter pub get
dart run easy_localization:generate -S ../i18n && dart run bin/generate_keys.dart
```

- [ ] **Step 1: Write the failing tests**

Append to `mobile/test/medium/repositories/space_album_repository_test.dart`, inside the existing
`group('watchLinkedAlbums', ...)`. `ctx.newRemoteAlbum(id:, ownerId:)` already inserts the matching
`remote_album_user` **owner** row, so it doubles as the "I own this" fixture. Add
`import 'package:immich_mobile/domain/models/album/album.model.dart';` for `AlbumUserRole`,
`package:drift/drift.dart` for `Value`, and
`package:immich_mobile/infrastructure/entities/remote_album_user.entity.drift.dart` for
`RemoteAlbumUserEntityCompanion`. `ctx.db` is a public `final Drift db` field. The Dart
`AlbumUserRole` enum order is `editor, viewer, owner`, stored as an int index behind a "do not change
this order!" comment — never reorder it to make a test read better.

```dart
group('isOwnedByMe', () {
  // Scenario 49
  test('is true when remote_album_user has an owner row for the current user', () async {
    final user = await ctx.newUser();
    final space = await ctx.newSharedSpace(createdById: user.id);
    final album = await ctx.newSharedSpaceAlbum(name: 'Hawaii');
    await ctx.insertSharedSpaceAlbumLink(spaceId: space.id, albumId: album.id);
    // Same id as the space-album metadata row — this is the local album the user owns.
    await ctx.newRemoteAlbum(id: album.id, ownerId: user.id);

    final albums = await repo.watchLinkedAlbums(space.id, currentUserId: user.id).first;

    expect(albums.single.isOwnedByMe, isTrue);
  });

  // Scenario 50
  test('is false when the owner row names a different user', () async {
    final me = await ctx.newUser();
    final other = await ctx.newUser();
    final space = await ctx.newSharedSpace(createdById: me.id);
    final album = await ctx.newSharedSpaceAlbum(name: 'Hawaii');
    await ctx.insertSharedSpaceAlbumLink(spaceId: space.id, albumId: album.id);
    await ctx.newRemoteAlbum(id: album.id, ownerId: other.id);

    final albums = await repo.watchLinkedAlbums(space.id, currentUserId: me.id).first;

    expect(albums.single.isOwnedByMe, isFalse);
  });

  // Scenario 51 — the join must key on role == owner, not mere presence. Without this, every
  // album shared WITH you would read as yours, handing you a Delete you must not have.
  test('is false for an album-level editor row for the current user', () async {
    final me = await ctx.newUser();
    final other = await ctx.newUser();
    final space = await ctx.newSharedSpace(createdById: me.id);
    final album = await ctx.newSharedSpaceAlbum(name: 'Hawaii');
    await ctx.insertSharedSpaceAlbumLink(spaceId: space.id, albumId: album.id);
    await ctx.newRemoteAlbum(id: album.id, ownerId: other.id);
    await ctx.db
        .into(ctx.db.remoteAlbumUserEntity)
        .insert(
          RemoteAlbumUserEntityCompanion(
            albumId: Value(album.id),
            userId: Value(me.id),
            role: const Value(AlbumUserRole.editor),
          ),
        );

    final albums = await repo.watchLinkedAlbums(space.id, currentUserId: me.id).first;

    expect(albums.single.isOwnedByMe, isFalse);
  });

  // Scenario 52 — fail-closed. The owner row simply may not have synced yet.
  test('is false when there is no remote_album_user row at all', () async {
    final user = await ctx.newUser();
    final space = await ctx.newSharedSpace(createdById: user.id);
    final album = await ctx.newSharedSpaceAlbum(name: 'Hawaii');
    await ctx.insertSharedSpaceAlbumLink(spaceId: space.id, albumId: album.id);

    final albums = await repo.watchLinkedAlbums(space.id, currentUserId: user.id).first;

    expect(albums.single.isOwnedByMe, isFalse);
  });

  // Scenario 53
  test('is false for every album and does not throw when currentUserId is null', () async {
    final user = await ctx.newUser();
    final space = await ctx.newSharedSpace(createdById: user.id);
    final album = await ctx.newSharedSpaceAlbum(name: 'Hawaii');
    await ctx.insertSharedSpaceAlbumLink(spaceId: space.id, albumId: album.id);
    await ctx.newRemoteAlbum(id: album.id, ownerId: user.id);

    final albums = await repo.watchLinkedAlbums(space.id, currentUserId: null).first;

    expect(albums.single.isOwnedByMe, isFalse);
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd mobile && flutter test test/medium/repositories/space_album_repository_test.dart
```

Expected: FAIL — `isOwnedByMe` is not defined.

- [ ] **Step 3: Add the model field**

In `mobile/lib/domain/models/space_album.model.dart`:

```dart
  /// Whether the CURRENT user owns this album.
  ///
  /// Not on the wire: SyncAlbumV2 (which SharedSpaceAlbumV1 maps to) carries no ownerId, and it is
  /// an upstream-shared DTO, so adding a fork field there would break silently on rebase. Derived
  /// instead from the local remote_album_user table, which already holds an owner row for every
  /// album this user owns.
  ///
  /// Fail-closed: false when the current user id is unknown, or when the owner row has not synced
  /// yet. The affordance is hidden rather than wrongly offered, and self-heals on the next sync.
  final bool isOwnedByMe;
```

Add `this.isOwnedByMe = false,` to the constructor.

- [ ] **Step 4: Implement the join**

In `mobile/lib/infrastructure/repositories/space_album.repository.dart`, change the signature to `Stream<List<SpaceAlbum>> watchLinkedAlbums(String spaceId, {String? currentUserId})`, and inside:

```dart
    final albumUser = _db.remoteAlbumUserEntity;
```

Add to the join list, after the existing `innerJoin(meta, ...)`:

```dart
            // Ownership, resolved locally. currentUserId == null keeps the ON clause false, so
            // every row reads as not-owned — the fail-closed case.
            leftOuterJoin(
              albumUser,
              albumUser.albumId.equalsExp(link.albumId) &
                  albumUser.userId.equals(currentUserId ?? '') &
                  albumUser.role.equalsValue(AlbumUserRole.owner),
              useColumns: false,
            ),
```

Add `albumUser.userId` to `addColumns` and to `groupBy`, and in the row mapper:

```dart
          isOwnedByMe: row.read(albumUser.userId) != null,
```

Import `AlbumUserRole` from `package:immich_mobile/domain/models/album/album.model.dart`.

- [ ] **Step 5: Pass the user id from the provider**

In `mobile/lib/providers/infrastructure/space_album.provider.dart`:

```dart
final spaceAlbumsProvider = StreamProvider.family<List<SpaceAlbum>, String>((ref, spaceId) {
  // Watched, not read: a login/logout must re-resolve ownership rather than strand a stale id.
  final currentUserId = ref.watch(currentUserProvider.select((u) => u?.id));
  return ref.watch(spaceAlbumRepositoryProvider).watchLinkedAlbums(spaceId, currentUserId: currentUserId);
});
```

Import `package:immich_mobile/providers/user.provider.dart`.

- [ ] **Step 6: Run the tests and verify they pass**

```bash
cd mobile && flutter test test/medium/repositories/space_album_repository_test.dart
```

- [ ] **Step 7: Commit**

```bash
git add mobile/lib/domain/models/space_album.model.dart \
        mobile/lib/infrastructure/repositories/space_album.repository.dart \
        mobile/lib/providers/infrastructure/space_album.provider.dart \
        mobile/test/medium/repositories/space_album_repository_test.dart
git commit -m "feat(mobile): resolve space album ownership from the local album-user table"
```

---

## Task 10: Mobile — API repo, actions, and remote-album refresh

**Files:**

- Modify: `mobile/lib/repositories/shared_space_api.repository.dart`
- Modify: `mobile/lib/providers/infrastructure/space_album_actions.dart`
- Test: `mobile/test/providers/infrastructure/space_album_actions_test.dart`

**Interfaces:**

- Consumes: the generated Dart client (Task 4); `remoteAlbumProvider` — declared in
  `mobile/lib/providers/infrastructure/album.provider.dart` as
  `NotifierProvider<RemoteAlbumNotifier, RemoteAlbumState>`, while the `RemoteAlbumNotifier` class
  itself lives in `remote_album.provider.dart`. Import the provider from `album.provider.dart`.
- Produces:
  - `SharedSpaceApiRepository.renameAlbum(String spaceId, String albumId, String name): Future<void>`
  - `SharedSpaceApiRepository.bulkDeleteAlbums(String spaceId, Set<String> albumIds): Future<List<BulkIdResponseDto>>`
  - `SpaceAlbumActions.renameAlbum(String spaceId, String albumId, String name): Future<void>` (throws on failure)
  - `SpaceAlbumActions.bulkDeleteAlbums(String spaceId, Set<String> albumIds): Future<Set<String>>` (returns the failed subset)

Covers spec scenarios 54–57.

- [ ] **Step 1: Write the failing tests**

The existing harness builds `SpaceAlbumActions` through `spaceAlbumActionsProvider` with repository
overrides, so the refresh callback is reachable only by overriding `remoteAlbumProvider` too. Add the
mock and extend `_makeContainer` / `_makeActions` to install it:

```dart
class MockRemoteAlbumNotifier extends Mock implements RemoteAlbumNotifier {}
```

`NotifierProvider` is overridden with `overrideWith(() => notifier)`, and `RemoteAlbumState` needs a
`build()` stub — return `const RemoteAlbumState(albums: [])` (match the real class's required
fields). Thread an optional `MockRemoteAlbumNotifier` through both helpers, defaulting to a fresh
one, and return it alongside the actions so tests can assert on it.

Then append:

```dart
group('renameAlbum', () {
  // Scenario 54
  test('calls the repo and nudges sync on success', () async {
    final repo = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => repo.renameAlbum(_spaceId, _albumId, 'New')).thenAnswer((_) async {});
    when(syncMgr.syncRemote).thenAnswer((_) async => true);

    await _makeActions(repo: repo, syncMgr: syncMgr).renameAlbum(_spaceId, _albumId, 'New');

    verify(() => repo.renameAlbum(_spaceId, _albumId, 'New')).called(1);
    verify(syncMgr.syncRemote).called(1);
  });

  test('rethrows and does not nudge when the API throws', () async {
    final repo = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => repo.renameAlbum(any(), any(), any())).thenThrow(Exception('boom'));

    await expectLater(
      _makeActions(repo: repo, syncMgr: syncMgr).renameAlbum(_spaceId, _albumId, 'New'),
      throwsA(isA<Exception>()),
    );
    verifyNever(syncMgr.syncRemote);
  });

  // Scenario 56 — RemoteAlbumNotifier holds a SNAPSHOT, not a Drift watch, so without this the
  // Albums tab and every picker keep showing the old name until something calls refresh().
  test('refreshes the remote album list on success but not on failure', () async {
    final repo = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    final albums = MockRemoteAlbumNotifier();
    when(() => repo.renameAlbum(any(), any(), any())).thenAnswer((_) async {});
    when(syncMgr.syncRemote).thenAnswer((_) async => true);
    when(albums.refresh).thenAnswer((_) async {});

    await _makeActions(repo: repo, syncMgr: syncMgr, albums: albums).renameAlbum(_spaceId, _albumId, 'New');
    verify(albums.refresh).called(1);

    final failing = MockRemoteAlbumNotifier();
    final failingRepo = MockSharedSpaceApiRepository();
    when(() => failingRepo.renameAlbum(any(), any(), any())).thenThrow(Exception('boom'));
    await expectLater(
      _makeActions(repo: failingRepo, syncMgr: syncMgr, albums: failing).renameAlbum(_spaceId, _albumId, 'New'),
      throwsA(isA<Exception>()),
    );
    verifyNever(failing.refresh);
  });
});

group('bulkDeleteAlbums', () {
  // Scenario 55
  test('returns the failed subset on a partial failure', () async {
    final repo = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => repo.bulkDeleteAlbums(_spaceId, {_albumId, _album2})).thenAnswer(
      (_) async => [
        BulkIdResponseDto(id: _albumId, success: true),
        BulkIdResponseDto(id: _album2, success: false),
      ],
    );
    when(syncMgr.syncRemote).thenAnswer((_) async => true);

    final failed = await _makeActions(repo: repo, syncMgr: syncMgr).bulkDeleteAlbums(_spaceId, {_albumId, _album2});

    expect(failed, {_album2});
  });

  test('returns every id when the request throws, and does not nudge', () async {
    final repo = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => repo.bulkDeleteAlbums(any(), any())).thenThrow(Exception('offline'));

    final failed = await _makeActions(repo: repo, syncMgr: syncMgr).bulkDeleteAlbums(_spaceId, {_albumId, _album2});

    expect(failed, {_albumId, _album2});
    verifyNever(syncMgr.syncRemote);
  });

  test('still nudges on a 200 where every item failed', () async {
    final repo = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => repo.bulkDeleteAlbums(any(), any())).thenAnswer(
      (_) async => [BulkIdResponseDto(id: _albumId, success: false)],
    );
    when(syncMgr.syncRemote).thenAnswer((_) async => true);

    final failed = await _makeActions(repo: repo, syncMgr: syncMgr).bulkDeleteAlbums(_spaceId, {_albumId});

    expect(failed, {_albumId});
    verify(syncMgr.syncRemote).called(1);
  });

  // Scenario 57
  test('refreshes the remote album list only when at least one delete succeeded', () async {
    final syncMgr = MockBackgroundSyncManager();
    when(syncMgr.syncRemote).thenAnswer((_) async => true);

    final okRepo = MockSharedSpaceApiRepository();
    final okAlbums = MockRemoteAlbumNotifier();
    when(() => okRepo.bulkDeleteAlbums(any(), any())).thenAnswer(
      (_) async => [BulkIdResponseDto(id: _albumId, success: true)],
    );
    when(okAlbums.refresh).thenAnswer((_) async {});
    await _makeActions(repo: okRepo, syncMgr: syncMgr, albums: okAlbums).bulkDeleteAlbums(_spaceId, {_albumId});
    verify(okAlbums.refresh).called(1);

    final noneRepo = MockSharedSpaceApiRepository();
    final noneAlbums = MockRemoteAlbumNotifier();
    when(() => noneRepo.bulkDeleteAlbums(any(), any())).thenAnswer(
      (_) async => [BulkIdResponseDto(id: _albumId, success: false)],
    );
    await _makeActions(repo: noneRepo, syncMgr: syncMgr, albums: noneAlbums).bulkDeleteAlbums(_spaceId, {_albumId});
    verifyNever(noneAlbums.refresh);
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd mobile && flutter test test/providers/infrastructure/space_album_actions_test.dart
```

- [ ] **Step 3: Implement the repository methods**

In `mobile/lib/repositories/shared_space_api.repository.dart`:

```dart
  /// Rename a space-linked album (PUT /shared-spaces/{id}/albums/{albumId}/name).
  /// SDK arg order is (albumId, id) where id = spaceId, matching its siblings above.
  Future<void> renameAlbum(String spaceId, String albumId, String name) =>
      _api.renameSharedSpaceAlbum(albumId, spaceId, SharedSpaceAlbumRenameDto(name: name));

  /// Bulk-delete albums linked to a space (POST /shared-spaces/{id}/albums/bulk-delete).
  /// Deletes the ALBUMS, not just their links. Also serves single delete, with one id.
  Future<List<BulkIdResponseDto>> bulkDeleteAlbums(String spaceId, Set<String> albumIds) =>
      checkNull(_api.bulkDeleteAlbums(spaceId, SharedSpaceBulkAlbumIdsDto(ids: albumIds.toList())));
```

If Task 4's verification showed different generated names or argument orders, use the real ones.

- [ ] **Step 4: Implement the actions**

In `mobile/lib/providers/infrastructure/space_album_actions.dart`, add a callback to the constructor so the class stays repository-only and never reaches for a notifier itself. Dart drops the leading underscore when a private field formal is used as a named parameter, which is why the existing constructor reads `{required this._repo}` while the provider passes `repo:` — follow that same shape:

```dart
class SpaceAlbumActions {
  SpaceAlbumActions({
    required this._repo,
    required this._albumApiRepo,
    required this._syncManager,
    required this._onOwnedAlbumsChanged,
  });
```

```dart
  /// Invoked after a mutation that changes the user's OWN albums, so the caller can refresh
  /// RemoteAlbumNotifier — it holds a snapshot, not a Drift watch, so the sync nudge alone leaves
  /// the Albums tab and every picker showing stale rows.
  final Future<void> Function() _onOwnedAlbumsChanged;

  /// Rename a space-linked album. Throws on failure, like the other single-item methods.
  Future<void> renameAlbum(String spaceId, String albumId, String name) async {
    await _repo.renameAlbum(spaceId, albumId, name);
    await _syncManager.syncRemote();
    await _onOwnedAlbumsChanged();
  }

  /// Bulk-delete [albumIds]. Returns the subset that failed. Same three-way failure contract as
  /// the other bulk methods: a throw folds into "every id failed" here rather than propagating.
  Future<Set<String>> bulkDeleteAlbums(String spaceId, Set<String> albumIds) async {
    try {
      final results = await _repo.bulkDeleteAlbums(spaceId, albumIds);
      await _syncManager.syncRemote();
      final failed = _bulkFailures(albumIds, results);
      if (failed.length < albumIds.length) {
        await _onOwnedAlbumsChanged();
      }
      return failed;
    } catch (_) {
      return albumIds;
    }
  }
```

Wire it in the provider:

```dart
final spaceAlbumActionsProvider = Provider<SpaceAlbumActions>((ref) {
  return SpaceAlbumActions(
    repo: ref.watch(sharedSpaceApiRepositoryProvider),
    albumApiRepo: ref.watch(driftAlbumApiRepositoryProvider),
    syncManager: ref.watch(backgroundSyncProvider),
    onOwnedAlbumsChanged: () => ref.read(remoteAlbumProvider.notifier).refresh(),
  );
});
```

- [ ] **Step 5: Run and verify passing**

```bash
cd mobile && flutter test test/providers/infrastructure/space_album_actions_test.dart
```

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/repositories/shared_space_api.repository.dart \
        mobile/lib/providers/infrastructure/space_album_actions.dart \
        mobile/test/providers/infrastructure/space_album_actions_test.dart
git commit -m "feat(mobile): space album rename and bulk delete actions"
```

---

## Task 11: Mobile — albums page wiring

**Files:**

- Modify: `mobile/lib/pages/library/spaces/space_albums.page.dart`
- Test: `mobile/test/presentation/pages/space_albums_page_test.dart`

**Interfaces:**

- Consumes: `SpaceAlbum.isOwnedByMe` (Task 9), `SpaceAlbumActions.renameAlbum` / `.bulkDeleteAlbums` (Task 10), i18n keys (Task 5).
- Produces: nothing consumed downstream.

Covers spec scenarios 58–65.

- [ ] **Step 1: Write the failing tests**

Append to `mobile/test/presentation/pages/space_albums_page_test.dart`, using its existing `pumpPage` harness and mocking `SharedSpaceApiRepository` — never `spaceAlbumActionsProvider`:

```dart
group('capability-gated album card menu', () {
  // Scenarios 58–61. 58 and 60 are the positive cases 59 and 61's negatives depend on.
  testWidgets('editor + owner: offers Rename and Delete', (tester) async {});
  testWidgets('editor + not owner: offers Rename only', (tester) async {});
  testWidgets('viewer + owner: offers Rename and Delete only', (tester) async {});
  testWidgets('viewer + not owner: renders no card menu', (tester) async {});
});

// Scenario 62
testWidgets('a viewer can long-press an album they own, but not one they do not', (tester) async {});

// Scenario 63
testWidgets('bulk Delete disappears once an unowned album joins the selection', (tester) async {});

// Scenario 64
testWidgets('a partial bulk delete leaves exactly the failures selected', (tester) async {});

// Scenario 65
testWidgets('cancelling the rename dialog fires no action call', (tester) async {});
```

Fill each body.

- [ ] **Step 2: Run and verify failure**

```bash
cd mobile && flutter test test/presentation/pages/space_albums_page_test.dart
```

- [ ] **Step 3: Implement**

In `mobile/lib/pages/library/spaces/space_albums.page.dart`:

Add the two handlers beside `renameFolder` / `deleteFolder`:

```dart
    Future<void> renameAlbum(SpaceAlbum album) async {
      final name = await _promptName(
        context,
        title: 'space_album_rename'.t(context: context),
        confirmLabel: 'save'.t(context: context),
        label: 'space_album_name_label'.t(context: context),
        initialName: album.name,
        keyPrefix: 'space-album-name',
      );
      if (name == null || !context.mounted) return;
      try {
        await ref.read(spaceAlbumActionsProvider).renameAlbum(spaceId, album.id, name);
      } catch (_) {
        if (context.mounted) {
          ImmichToast.show(
            context: context,
            msg: 'space_album_error_rename'.t(context: context),
            toastType: ToastType.error,
          );
        }
      }
    }

    // Single delete goes through the same bulk path as the selection bar — one endpoint, one
    // failure contract, one set of tests. The COPY still branches on count: the bulk title
    // interpolates {count}, so reusing it for one album would read "Delete 1 albums".
    Future<void> deleteAlbums(Set<String> ids, {String? singleAlbumName}) async {
      final single = ids.length == 1;
      final confirmed = await _confirmBulkAction(
        context,
        title: single
            ? 'space_album_delete'.t(context: context)
            : 'space_album_bulk_delete_title'.t(context: context, args: {'count': ids.length.toString()}),
        content: single
            ? 'space_album_delete_confirm'.t(context: context, args: {'name': singleAlbumName ?? ''})
            : 'space_album_bulk_delete_confirm'.t(context: context),
        confirmLabel: 'delete'.t(context: context),
        cancelKey: const Key('space-album-delete-cancel'),
        confirmKey: const Key('space-album-delete-confirm'),
        destructive: true,
      );
      if (!confirmed || !context.mounted) return;
      final failedIds = await ref.read(spaceAlbumActionsProvider).bulkDeleteAlbums(spaceId, ids);
      selectionNotifier.reconcile(failedIds);
      notifyBulkFailures(failedIds.length);
    }
```

Rename `_promptFolderName` to `_promptName` and give it `label` and `keyPrefix` parameters. The keys
are hardcoded one level down, in the `_FolderNameDialog` **widget** (`space-album-folder-name-field` /
`-cancel` / `-confirm`), so `keyPrefix` and `label` must be threaded into that widget too — renaming
only the function leaves the album path still selecting folder-named keys. Update the two existing folder call sites to pass `label: 'space_album_folder_name_label'.t(...)` and `keyPrefix: 'space-album-folder-name'`, keeping their current keys byte-identical so the existing folder tests still pass.

Give `_AlbumCard` `canRename` and `canDelete` booleans, render its `PopupMenuButton` when `canEdit || canRename || canDelete`, keep the three existing items behind `canEdit`, and append Rename (`canRename`) and Delete (`canDelete`) items with keys `space-album-card-rename-${album.id}` / `space-album-card-delete-${album.id}`. At each `_AlbumCard` construction site pass `canRename: canEdit || album.isOwnedByMe` and `canDelete: album.isOwnedByMe`.

Widen selection so a viewer can select their own albums:

```dart
    bool canSelectAlbum(SpaceAlbum album) => canEdit || album.isOwnedByMe;

    // Task 15 widened: an album selection is legitimate for a viewer who owns what is selected,
    // so the bar can no longer be gated on canEdit alone. Folder selections stay editor-only.
    final showSelectionBar =
        !selection.isEmpty && (canEdit || selection.kind == SpaceAlbumSelectionKind.album);

    final allSelectedAlbumsOwned =
        selection.kind == SpaceAlbumSelectionKind.album &&
        selection.ids.isNotEmpty &&
        selection.ids.every((id) => currentAlbums?.firstWhereOrNull((a) => a.id == id)?.isOwnedByMe == true);
```

Gate the album long-press wiring on `canSelectAlbum(album)` instead of `canEdit`, leaving folder long-press on `canEdit`.

Extend `_SelectionAppBar` with `canManage` and `canDeleteAlbums` booleans plus an `onDeleteAlbums` callback; wrap its three album actions in `if (canManage)` and append, still inside the album branch:

```dart
          if (canDeleteAlbums)
            IconButton(
              key: const Key('space-album-selection-delete-albums'),
              icon: const Icon(Icons.delete_outline),
              tooltip: 'space_album_delete'.t(context: context),
              color: Theme.of(context).colorScheme.error,
              onPressed: onDeleteAlbums,
            ),
```

Pass `canManage: canEdit`, `canDeleteAlbums: allSelectedAlbumsOwned`, and `onDeleteAlbums: () => deleteAlbums(selection.ids)`. The card's own Delete item calls `deleteAlbums({album.id}, singleAlbumName: album.name)`.

- [ ] **Step 4: Run and verify passing**

```bash
cd mobile && flutter test test/presentation/pages/space_albums_page_test.dart
```

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/pages/library/spaces/space_albums.page.dart \
        mobile/test/presentation/pages/space_albums_page_test.dart
git commit -m "feat(mobile): rename and delete space albums from the albums list"
```

---

## Task 12: Mobile — detail kebab wiring

**Files:**

- Modify: `mobile/lib/presentation/widgets/spaces/space_album_kebab.widget.dart`
- Modify: `mobile/lib/pages/library/spaces/space_album_detail.page.dart`
- Test: `mobile/test/presentation/pages/space_album_detail_page_test.dart`

**Interfaces:**

- Consumes: `SpaceAlbumActions.renameAlbum` / `.bulkDeleteAlbums`, `SpaceAlbum.isOwnedByMe`.
- Produces: `SpaceAlbumKebab` props gain `canRename: bool`, `canDelete: bool`, `onRename: VoidCallback`, `onDelete: VoidCallback`.

Covers spec scenarios 66–68.

- [ ] **Step 1: Replace the falsified existing test and add the new ones**

`mobile/test/presentation/pages/space_album_detail_page_test.dart:54` currently asserts _"viewer role (canEdit:false) — SpaceAlbumKebab renders SizedBox.shrink"_. The new capability model falsifies its premise: `canEdit: false` now means shrink **only if** the caller also cannot rename or delete. Rewrite that test to pass `canRename: false, canDelete: false` explicitly — do **not** delete it, it is the only guard on the no-affordance case — and add:

```dart
// Scenario 66
testWidgets('editor who does not own the album: Rename offered, Delete not', (tester) async {});

// Scenario 67
testWidgets('viewer who owns the album: Delete offered, and the page pops on success', (tester) async {});

// Scenario 68
testWidgets('viewer who owns the album: the kebab renders a menu rather than shrinking', (tester) async {});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd mobile && flutter test test/presentation/pages/space_album_detail_page_test.dart
```

- [ ] **Step 3: Implement the kebab**

In `mobile/lib/presentation/widgets/spaces/space_album_kebab.widget.dart`, add `canRename`, `canDelete`, `onRename`, `onDelete`; change the early return to `if (!canEdit && !canRename && !canDelete) return const SizedBox.shrink();`; wrap the three existing items in `if (canEdit) ...[...]`; append items keyed `space-album-kebab-rename` and `space-album-kebab-delete`; extend `_KebabAction` with `rename` and `delete`. **Update the class doc comment** — it currently promises "exactly 3 items".

- [ ] **Step 4: Wire the detail page**

In `mobile/lib/pages/library/spaces/space_album_detail.page.dart`, resolve `isOwnedByMe` for this album from `spaceAlbumsProvider(spaceId)`, pass `canRename: canEdit || isOwnedByMe` and `canDelete: isOwnedByMe`, reuse the rename dialog and delete confirm from Task 11, and on a delete whose failed set is empty, pop back to the albums list. On failure show `space_album_error_delete` and stay put.

- [ ] **Step 5: Run and verify passing, then gates**

```bash
cd mobile && flutter test
cd mobile && dart analyze --fatal-infos lib test && dart format --set-exit-if-changed lib test
```

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/presentation/widgets/spaces/space_album_kebab.widget.dart \
        mobile/lib/pages/library/spaces/space_album_detail.page.dart \
        mobile/test/presentation/pages/space_album_detail_page_test.dart
git commit -m "feat(mobile): rename and delete a space album from its detail page"
```

---

## Final verification

- [ ] **Run every gate**

```bash
cd server && pnpm run check && pnpm run lint
cd server && pnpm test -- --run src/services/shared-space.service.spec.ts
cd web && pnpm test -- --run && pnpm check:typescript && pnpm check:svelte && pnpm lint
cd mobile && flutter test && dart analyze --fatal-infos lib test && dart format --set-exit-if-changed lib test
cd e2e && pnpm test -- --run src/specs/server/api/shared-space-album.e2e-spec.ts
```

- [ ] **Confirm the capability matrix by hand against a running stack**

A space Owner who does not own a linked album sees Rename but **no** Delete. A space viewer who owns one sees a ⋮ with Rename and Delete only, and can select it. Selecting one owned and one unowned album hides bulk Delete.
