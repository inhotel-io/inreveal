# Space Album Multi-Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user select several space albums (or several folders) at once and act on all of them, with selection that looks and behaves exactly like photo multi-select on web and mobile.

**Architecture:** Five new fork-local bulk endpoints on the shared-space controller, each looping over ids through the _same checked helpers_ the single-item paths use and returning `BulkIdResponseDto[]` for per-item partial failure. Web gets a `SpaceAlbumMultiSelectManager` mirroring `AssetMultiSelectManager`'s shape; mobile gets a Riverpod selection provider. Selection is discriminated (albums _or_ folders, never mixed) and clears on three explicit triggers.

**Tech Stack:** NestJS 11 + Kysely + zod (`createZodDto`), SvelteKit + Svelte 5 runes, Flutter + Riverpod (hooks_riverpod), Vitest, Playwright, `flutter_test`.

**Source spec:** `docs/superpowers/specs/2026-08-06-space-album-multi-select-design.md`. Scenario ids (`S-n`) and edge-case ids (`E-n`) below refer to that spec. All 34 scenarios and 23 edge cases are covered; the coverage matrix is in the Self-Review section.

## Global Constraints

- **Working directory:** the worktree for this branch. Never `cd` to the main checkout. Never push without being asked. Never use bare `git stash`.
- **TDD is mandatory.** Behaviour change: write the failing test FIRST, run it, capture the failing output (RED), implement, capture the pass (GREEN). Pinning an existing behaviour: after it passes, mutate the code under test to prove the test can fail, capture that output, revert — that mutation evidence replaces RED.
- **Commits:** conventional style (`feat(server):`, `fix(web):`, `test(mobile):`). NO `Co-Authored-By` or `Generated-with` trailers, ever.
- **Server:** TypeScript strict; no relative imports (use the `src/` alias); ESLint zero-warnings; Prettier is a **separate** CI gate — run `pnpm exec prettier --write <files>` from `server/`.
- **Single server test file:** from `server/`, `pnpm exec vitest run --config test/vitest.config.mjs <path>` (unit) or `--config test/vitest.config.medium.mjs <path>` (medium). The bare `pnpm exec vitest run <path>` loads no config and dies with `ReferenceError: describe is not defined`; `pnpm test -- --run <path>` silently drops the path filter. Always quote the reported test-file count.
- **Medium tests need Docker running.**
- **NEVER run `make sql` without a running database** — it deletes all generated query files.
- **Kysely:** never run `this.db` queries inside a `transaction().execute(async (trx) => …)` callback — use `trx`.
- **Mobile:** Flutter is exact-pinned to **3.44.8**. The default `flutter` on PATH is 3.41.9 — invoke `~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/{flutter,dart}` directly. Two CI gates beyond tests: `dart analyze --fatal-infos lib test` must be clean (an _info_ fails CI) AND `dart format` must produce no diff on touched files.
- **Never hand-edit generated files:** `mobile/openapi/`, `*.g.dart`, `*.drift.dart`, `mobile/lib/routing/router.gr.dart`, `server/src/queries/*.sql`.
- **OpenAPI:** DTO changes require regenerating **both** clients (`make open-api`; Dart needs Java). Regenerating only the TS SDK fails CI's OpenAPI Clients job.
- **i18n:** add EN keys to `i18n/en.json` **and** translate into exactly these nine fork-maintained locales: `de`, `es`, `fr`, `it`, `nl`, `pl`, `ru`, `zh_Hans`, `zh_Hant`. Leave every other locale alone (upstream Weblate owns them). Verify the set with the command in spec §10.
- **Docs:** run Prettier on markdown under `docs/` before committing — CI Docs Build is strict.
- **Test quality (binding):** no assertion that passes for any non-throwing implementation; no test whose only assertion is that a mock was called where the real property is observable; no assertion on a filtered array being empty without first proving it would otherwise be non-empty; no unreachable assertions.

---

## File Structure

**Server — create**

- `server/src/dtos/shared-space-bulk.dto.ts` — the five fork-local bulk request DTOs. Separate file so the already-large `shared-space.dto.ts` does not grow another 60 lines, and so the `min(1).max(1000)` rule lives in one obvious place.

**Server — modify**

- `server/src/services/shared-space.service.ts` — extract checked cores; add five bulk methods; add the batch activity row.
- `server/src/controllers/shared-space.controller.ts` — five endpoints.
- `server/src/enum.ts` — one new `SharedSpaceActivityType`.
- `server/src/services/shared-space.service.spec.ts` — unit tests.
- `server/test/medium/specs/repositories/shared-space-album-folder.repository.spec.ts` — batch-ordering medium tests.
- `server/test/medium/specs/sync/shared-space-album-folder-sync.spec.ts` — batch sync checkpoint.
- `e2e/src/specs/server/api/shared-space-album-folder.e2e-spec.ts` — RBAC matrix.

**Web — create**

- `web/src/lib/managers/space-album-multi-select-manager.svelte.ts` — the manager.
- `web/src/lib/managers/space-album-multi-select-manager.svelte.spec.ts` — its tests.
- `web/src/lib/components/spaces/space-album-select-bar.svelte` — the selection bar.
- `web/src/lib/utils/space-album-bulk-actions.ts` — action functions + partial-failure result handling.
- `web/src/lib/utils/space-album-bulk-actions.spec.ts` — its tests.

**Web — modify**

- `space-albums-list.svelte` (flat list derivation, wiring), `space-album-card.svelte` and `space-album-folder-card.svelte` (check circle, click/shift), `space-albums-table.svelte` (row checkboxes), `space-album-folder-dnd.ts` (`ids: string[]`), `space-activity-feed.svelte` (batch row), and `web/src/routes/(user)/spaces/[spaceId]/albums/+page.svelte` (clear triggers, bar mount).

**Mobile — create**

- `mobile/lib/providers/spaces/space_album_selection.provider.dart` — selection state.
- `mobile/test/providers/spaces/space_album_selection_provider_test.dart` — its tests.

**Mobile — modify**

- `mobile/lib/pages/library/spaces/space_albums.page.dart` — long-press/tap, selection AppBar, `PopScope`, bulk actions.
- `mobile/test/presentation/pages/space_albums_page_test.dart` — page tests.

**i18n:** `i18n/en.json` + the nine locales.

---

## Phase A — Server

### Task 1: Fork-local bulk request DTOs

**Files:**

- Create: `server/src/dtos/shared-space-bulk.dto.ts`
- Test: `server/src/dtos/shared-space-bulk.dto.spec.ts` (create)

**Interfaces:**

- Consumes: nothing.
- Produces: `SharedSpaceBulkAlbumIdsDto`, `SharedSpaceBulkAlbumFolderMoveDto`, `SharedSpaceBulkAlbumTimelineDto`, `SharedSpaceBulkFolderParentDto`, `SharedSpaceBulkFolderIdsDto` — each with `ids: string[]`, plus the extra field named in its schema.

**Why a new file, not `shared-space.dto.ts`:** the `.min(1)` rule is the whole point of not reusing `BulkIdsDto` (spec §6.1). Keeping the five schemas together makes that rule impossible to miss.

- [ ] **Step 1: Write the failing test**

```ts
// server/src/dtos/shared-space-bulk.dto.spec.ts
import { describe, expect, it } from 'vitest';
import {
  SharedSpaceBulkAlbumFolderMoveDto,
  SharedSpaceBulkAlbumIdsDto,
  SharedSpaceBulkAlbumTimelineDto,
  SharedSpaceBulkFolderIdsDto,
  SharedSpaceBulkFolderParentDto,
} from 'src/dtos/shared-space-bulk.dto';

const uuid = (n: number) => `0000000${n}-0000-4000-8000-000000000000`.slice(-36);

describe('shared space bulk dtos', () => {
  // E-2: the whole reason these are fork-local instead of BulkIdsDto.
  it('rejects an empty ids array', () => {
    const result = SharedSpaceBulkAlbumIdsDto.zodSchema.safeParse({ ids: [] });
    expect(result.success).toBe(false);
  });

  it('accepts a single id', () => {
    const result = SharedSpaceBulkAlbumIdsDto.zodSchema.safeParse({ ids: [uuid(1)] });
    expect(result.success).toBe(true);
  });

  it('rejects more than 1000 ids', () => {
    const ids = Array.from({ length: 1001 }, (_, i) => uuid(i % 9));
    expect(SharedSpaceBulkAlbumIdsDto.zodSchema.safeParse({ ids }).success).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    expect(SharedSpaceBulkAlbumIdsDto.zodSchema.safeParse({ ids: ['nope'] }).success).toBe(false);
  });

  it('requires folderId on the album folder move dto, allowing null', () => {
    expect(SharedSpaceBulkAlbumFolderMoveDto.zodSchema.safeParse({ ids: [uuid(1)] }).success).toBe(false);
    expect(SharedSpaceBulkAlbumFolderMoveDto.zodSchema.safeParse({ ids: [uuid(1)], folderId: null }).success).toBe(
      true,
    );
  });

  // Spec §6.2: showInTimeline must be REQUIRED or the Dart client regenerates into three-state.
  it('requires showInTimeline and does not accept it as absent', () => {
    expect(SharedSpaceBulkAlbumTimelineDto.zodSchema.safeParse({ ids: [uuid(1)] }).success).toBe(false);
    expect(SharedSpaceBulkAlbumTimelineDto.zodSchema.safeParse({ ids: [uuid(1)], showInTimeline: true }).success).toBe(
      true,
    );
  });

  it('requires parentId on the folder parent dto, allowing null', () => {
    expect(SharedSpaceBulkFolderParentDto.zodSchema.safeParse({ ids: [uuid(1)] }).success).toBe(false);
    expect(SharedSpaceBulkFolderParentDto.zodSchema.safeParse({ ids: [uuid(1)], parentId: null }).success).toBe(true);
  });

  it('rejects an empty ids array on the folder ids dto', () => {
    expect(SharedSpaceBulkFolderIdsDto.zodSchema.safeParse({ ids: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm exec vitest run --config test/vitest.config.mjs src/dtos/shared-space-bulk.dto.spec.ts`
Expected: FAIL — `Cannot find module 'src/dtos/shared-space-bulk.dto'`.

- [ ] **Step 3: Write the implementation**

```ts
// server/src/dtos/shared-space-bulk.dto.ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Fork-local bulk request schemas. Deliberately NOT `BulkIdsDto`: that schema is
 * `z.array(z.uuidv4())` with no `.min(1)`, so an empty array would be a silent 200-with-`[]`
 * instead of the 400 we require, and it is shared with upstream endpoints so it cannot be
 * tightened in place.
 *
 * `.max(1000)` bounds a pathological payload. It is request validation, not a product limit.
 */
const BULK_IDS_MAX = 1000;

const bulkIds = z.array(z.uuidv4()).min(1).max(BULK_IDS_MAX).describe('IDs to process');

const SharedSpaceBulkAlbumIdsSchema = z.object({ ids: bulkIds }).meta({ id: 'SharedSpaceBulkAlbumIdsDto' });

const SharedSpaceBulkAlbumFolderMoveSchema = z
  .object({
    ids: bulkIds,
    folderId: z.uuidv4().nullable().describe('Destination folder ID; null moves the albums to the space root'),
  })
  .meta({ id: 'SharedSpaceBulkAlbumFolderMoveDto' });

// showInTimeline is REQUIRED. Making it optional regenerates the Dart client into three-state
// (isPresent/absent) territory — the same reason PATCH :id/albums/:albumId keeps it required.
const SharedSpaceBulkAlbumTimelineSchema = z
  .object({
    ids: bulkIds,
    showInTimeline: z.boolean().describe('Whether the albums appear in the space timeline'),
  })
  .meta({ id: 'SharedSpaceBulkAlbumTimelineDto' });

const SharedSpaceBulkFolderParentSchema = z
  .object({
    ids: bulkIds,
    parentId: z.uuidv4().nullable().describe('Destination parent folder ID; null moves the folders to the root'),
  })
  .meta({ id: 'SharedSpaceBulkFolderParentDto' });

const SharedSpaceBulkFolderIdsSchema = z.object({ ids: bulkIds }).meta({ id: 'SharedSpaceBulkFolderIdsDto' });

export class SharedSpaceBulkAlbumIdsDto extends createZodDto(SharedSpaceBulkAlbumIdsSchema) {}
export class SharedSpaceBulkAlbumFolderMoveDto extends createZodDto(SharedSpaceBulkAlbumFolderMoveSchema) {}
export class SharedSpaceBulkAlbumTimelineDto extends createZodDto(SharedSpaceBulkAlbumTimelineSchema) {}
export class SharedSpaceBulkFolderParentDto extends createZodDto(SharedSpaceBulkFolderParentSchema) {}
export class SharedSpaceBulkFolderIdsDto extends createZodDto(SharedSpaceBulkFolderIdsSchema) {}
```

If `createZodDto` classes do not expose `zodSchema` in this codebase's `nestjs-zod` version, export each schema alongside its class and assert against the exported schema instead — check `server/src/dtos/shared-space.dto.ts` for the local convention before writing the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && pnpm exec vitest run --config test/vitest.config.mjs src/dtos/shared-space-bulk.dto.spec.ts`
Expected: PASS, `Test Files 1 passed (1)`, 8 tests.

- [ ] **Step 5: Lint, format, commit**

```bash
cd server
pnpm exec prettier --write src/dtos/shared-space-bulk.dto.ts src/dtos/shared-space-bulk.dto.spec.ts
pnpm exec eslint --max-warnings 0 src/dtos/shared-space-bulk.dto.ts src/dtos/shared-space-bulk.dto.spec.ts
cd .. && git add server/src/dtos/shared-space-bulk.dto.ts server/src/dtos/shared-space-bulk.dto.spec.ts
git commit -m "feat(server): add fork-local bulk request dtos for space albums"
```

---

### Task 2: Extract checked cores from the single-item paths

**Files:**

- Modify: `server/src/services/shared-space.service.ts:812-851` (`unlinkAlbum`), `:853-861` (`updateAlbumLink`), `:863-...` (`setAlbumFolder`)
- Test: `server/src/services/shared-space.service.spec.ts`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: three private methods used by Task 3 —
  - `#unlinkAlbumChecked(auth: AuthDto, spaceId: string, albumId: string): Promise<{ albumName: string; orphanedAssetIds: string[] }>`
  - `#setAlbumFolderChecked(auth: AuthDto, spaceId: string, albumId: string, folderId: string | null): Promise<void>`
  - `#setAlbumTimelineChecked(auth: AuthDto, spaceId: string, albumId: string, showInTimeline: boolean): Promise<void>`

**Why:** spec §6.3 requires bulk to reuse the _checked_ logic, and §6.4 requires **one** activity row per batch. `unlinkAlbum` currently writes its own activity row and queues its own grant reconcile, so calling it N times would produce N rows. Extracting the checked core without the activity write lets `unlinkAlbum` keep logging one row and lets the bulk method log one batch row.

**This task is a pure refactor — no behaviour change.** Its tests are pinning tests, so use mutation evidence instead of RED.

- [ ] **Step 1: Write the pinning tests**

```ts
// in server/src/services/shared-space.service.spec.ts, inside the album-unlink describe
it('logs exactly one activity row for a single unlink', async () => {
  // ...existing setupAlbumLinkEditor arrangement...
  await sut.unlinkAlbum(authStub.admin, spaceId, albumId);
  expect(mocks.sharedSpace.logActivity).toHaveBeenCalledTimes(1);
  expect(mocks.sharedSpace.logActivity).toHaveBeenCalledWith(
    expect.objectContaining({ type: SharedSpaceActivityType.AlbumUnlink }),
  );
});

it('queues a grant reconcile for the unlinked album', async () => {
  await sut.unlinkAlbum(authStub.admin, spaceId, albumId);
  expect(mocks.job.queue).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ ids: [albumId] }) }),
  );
});
```

- [ ] **Step 2: Run them and prove they can fail**

Run: `cd server && pnpm exec vitest run --config test/vitest.config.mjs src/services/shared-space.service.spec.ts`
Expected: PASS (they pin existing behaviour).
Then mutate: comment out the `logActivity` call in `unlinkAlbum`, re-run, capture the failure, revert. Record that output in the report — it is this task's evidence in place of RED.

- [ ] **Step 3: Perform the extraction**

Move everything in `unlinkAlbum` between the permission check and the `logActivity` call into `#unlinkAlbumChecked`, returning what the caller needs to log. `unlinkAlbum` becomes:

```ts
async unlinkAlbum(auth: AuthDto, spaceId: string, albumId: string): Promise<void> {
  const { albumName } = await this.#unlinkAlbumChecked(auth, spaceId, albumId);
  await this.sharedSpaceRepository.logActivity({
    spaceId,
    userId: auth.user.id,
    type: SharedSpaceActivityType.AlbumUnlink,
    data: { albumId, albumName },
  });
  await this.queueAlbumGrantReconcile([albumId]);
}
```

`#unlinkAlbumChecked` keeps, verbatim and in order: the Editor-or-album-owner check (the `rbac-6` block), the `hasAlbumLink` 404 guard, the album fetch, `getAlbumAssetIdsWithoutOtherSpacePath`, `removeAlbum`, and the orphaned-person cleanup. It must **not** log activity and must **not** queue the reconcile — both move to the callers so the bulk path can batch them.

Do the same for `updateAlbumLink` → `#setAlbumTimelineChecked` and `setAlbumFolder` → `#setAlbumFolderChecked`, each keeping its existing `requireRole` call inside the extracted method.

- [ ] **Step 4: Run the whole service spec**

Run: `cd server && pnpm exec vitest run --config test/vitest.config.mjs src/services/shared-space.service.spec.ts`
Expected: PASS, with the same test count as before the refactor. A changed count means behaviour moved — investigate before proceeding.

- [ ] **Step 5: Lint, format, commit**

```bash
cd server && pnpm exec prettier --write src/services/shared-space.service.ts src/services/shared-space.service.spec.ts
pnpm exec eslint --max-warnings 0 src/services/shared-space.service.ts
cd .. && git add server/src/services/shared-space.service.ts server/src/services/shared-space.service.spec.ts
git commit -m "refactor(server): extract checked cores from the single-item space album paths"
```

---

### Task 3: Bulk album service methods

**Files:**

- Modify: `server/src/services/shared-space.service.ts`, `server/src/enum.ts`
- Test: `server/src/services/shared-space.service.spec.ts`

**Interfaces:**

- Consumes: Task 1's DTOs; Task 2's `#unlinkAlbumChecked`, `#setAlbumFolderChecked`, `#setAlbumTimelineChecked`.
- Produces, all returning `Promise<BulkIdResponseDto[]>`:
  - `bulkUnlinkAlbums(auth, spaceId, dto: SharedSpaceBulkAlbumIdsDto)`
  - `bulkSetAlbumFolder(auth, spaceId, dto: SharedSpaceBulkAlbumFolderMoveDto)`
  - `bulkSetAlbumTimeline(auth, spaceId, dto: SharedSpaceBulkAlbumTimelineDto)`
  - private `#runBulk(ids: string[], fn: (id: string) => Promise<void>): Promise<BulkIdResponseDto[]>`

Also adds `SharedSpaceActivityType.AlbumBulkUnlink = 'album_bulk_unlink'` to `server/src/enum.ts` (spec §6.4; rendered in Task 9).

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/services/shared-space.service.spec.ts
describe('bulkUnlinkAlbums', () => {
  it('returns one success entry per id, in request order', async () => {
    // arrange an editor with three linked albums a1, a2, a3
    const result = await sut.bulkUnlinkAlbums(authStub.admin, spaceId, { ids: [a1, a2, a3] });
    expect(result).toEqual([
      { id: a1, success: true },
      { id: a2, success: true },
      { id: a3, success: true },
    ]);
  });

  // Spec §6.3 — per-item authorization, not one space-level check.
  it('reports no_permission for one id and still processes the rest', async () => {
    mocks.sharedSpace.hasAlbumLink.mockImplementation(async (_s, id) => id !== a2);
    const result = await sut.bulkUnlinkAlbums(authStub.admin, spaceId, { ids: [a1, a2, a3] });
    expect(result[1]).toEqual({ id: a2, success: false, error: BulkIdErrorReason.NOT_FOUND });
    expect(result[0].success).toBe(true);
    expect(result[2].success).toBe(true);
    // observable state, not just the envelope:
    expect(mocks.sharedSpace.removeAlbum).toHaveBeenCalledTimes(2);
  });

  it('does not throw when every id fails', async () => {
    mocks.sharedSpace.hasAlbumLink.mockResolvedValue(false);
    const result = await sut.bulkUnlinkAlbums(authStub.admin, spaceId, { ids: [a1, a2] });
    expect(result.every((r) => !r.success)).toBe(true);
    expect(mocks.sharedSpace.removeAlbum).not.toHaveBeenCalled();
  });

  // E-3
  it('deduplicates repeated ids', async () => {
    const result = await sut.bulkUnlinkAlbums(authStub.admin, spaceId, { ids: [a1, a1, a2] });
    expect(result).toHaveLength(2);
    expect(mocks.sharedSpace.removeAlbum).toHaveBeenCalledTimes(2);
  });

  // Spec §6.4 — one row for the batch, not one per album.
  it('writes exactly one activity row for the batch', async () => {
    await sut.bulkUnlinkAlbums(authStub.admin, spaceId, { ids: [a1, a2, a3] });
    expect(mocks.sharedSpace.logActivity).toHaveBeenCalledTimes(1);
    expect(mocks.sharedSpace.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SharedSpaceActivityType.AlbumBulkUnlink,
        data: expect.objectContaining({ count: 3 }),
      }),
    );
  });

  it('logs no activity row when every item failed', async () => {
    mocks.sharedSpace.hasAlbumLink.mockResolvedValue(false);
    await sut.bulkUnlinkAlbums(authStub.admin, spaceId, { ids: [a1, a2] });
    expect(mocks.sharedSpace.logActivity).not.toHaveBeenCalled();
  });

  it('queues one grant reconcile covering every succeeded album', async () => {
    await sut.bulkUnlinkAlbums(authStub.admin, spaceId, { ids: [a1, a2] });
    expect(mocks.job.queue).toHaveBeenCalledTimes(1);
  });
});

describe('bulkSetAlbumTimeline', () => {
  it('applies the explicit boolean to every id', async () => {
    const result = await sut.bulkSetAlbumTimeline(authStub.admin, spaceId, { ids: [a1, a2], showInTimeline: true });
    expect(result.every((r) => r.success)).toBe(true);
    expect(mocks.sharedSpace.setAlbumShowInTimeline).toHaveBeenCalledWith(spaceId, a1, true);
    expect(mocks.sharedSpace.setAlbumShowInTimeline).toHaveBeenCalledWith(spaceId, a2, true);
  });
});

describe('bulkSetAlbumFolder', () => {
  it('moves every album to the destination folder', async () => {
    const result = await sut.bulkSetAlbumFolder(authStub.admin, spaceId, { ids: [a1, a2], folderId: f1 });
    expect(result.every((r) => r.success)).toBe(true);
    expect(mocks.sharedSpace.setAlbumLinkFolder).toHaveBeenCalledTimes(2);
  });

  it('maps a name-conflict rejection to a validation entry, not a 500', async () => {
    mocks.sharedSpace.setAlbumLinkFolder.mockRejectedValueOnce(new BadRequestException('nope'));
    const result = await sut.bulkSetAlbumFolder(authStub.admin, spaceId, { ids: [a1, a2], folderId: f1 });
    expect(result[0]).toEqual({ id: a1, success: false, error: BulkIdErrorReason.VALIDATION, errorMessage: 'nope' });
    expect(result[1].success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd server && pnpm exec vitest run --config test/vitest.config.mjs src/services/shared-space.service.spec.ts`
Expected: FAIL — `sut.bulkUnlinkAlbums is not a function`.

- [ ] **Step 3: Implement**

```ts
// server/src/enum.ts, next to AlbumUnlink
AlbumBulkUnlink = 'album_bulk_unlink',
```

```ts
// server/src/services/shared-space.service.ts

/**
 * Runs `fn` per id and converts each outcome into a BulkIdResponseDto. Deliberately sequential:
 * folder moves mutate the tree that later items are validated against (E-9/E-10), so parallelism
 * would make results order-dependent in a way callers cannot reason about.
 *
 * Never throws for a per-item failure — the endpoint returns 200 with per-item reasons.
 */
async #runBulk(ids: string[], fn: (id: string) => Promise<void>): Promise<BulkIdResponseDto[]> {
  const results: BulkIdResponseDto[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      await fn(id);
      results.push({ id, success: true });
    } catch (error) {
      results.push({ id, success: false, ...this.#bulkErrorFor(error) });
    }
  }
  return results;
}

#bulkErrorFor(error: unknown): { error: BulkIdErrorReason; errorMessage?: string } {
  const message = error instanceof Error ? error.message : undefined;
  if (error instanceof ForbiddenException) {
    return { error: BulkIdErrorReason.NO_PERMISSION, errorMessage: message };
  }
  if (error instanceof NotFoundException) {
    return { error: BulkIdErrorReason.NOT_FOUND, errorMessage: message };
  }
  if (error instanceof BadRequestException) {
    return { error: BulkIdErrorReason.VALIDATION, errorMessage: message };
  }
  this.logger.error(`Bulk operation item failed: ${message}`);
  return { error: BulkIdErrorReason.UNKNOWN, errorMessage: message };
}

async bulkUnlinkAlbums(auth: AuthDto, spaceId: string, dto: SharedSpaceBulkAlbumIdsDto): Promise<BulkIdResponseDto[]> {
  const names = new Map<string, string>();
  const results = await this.#runBulk(dto.ids, async (albumId) => {
    const { albumName } = await this.#unlinkAlbumChecked(auth, spaceId, albumId);
    names.set(albumId, albumName);
  });

  const succeeded = results.filter((r) => r.success).map((r) => r.id);
  if (succeeded.length > 0) {
    // ONE row for the batch (spec §6.4). albumName carries the first album so the feed can render
    // "X and N others", mirroring how person_merge renders {personName, count}.
    await this.sharedSpaceRepository.logActivity({
      spaceId,
      userId: auth.user.id,
      type: SharedSpaceActivityType.AlbumBulkUnlink,
      data: { count: succeeded.length, albumName: names.get(succeeded[0]) ?? '' },
    });
    await this.queueAlbumGrantReconcile(succeeded);
  }
  return results;
}

async bulkSetAlbumFolder(
  auth: AuthDto,
  spaceId: string,
  dto: SharedSpaceBulkAlbumFolderMoveDto,
): Promise<BulkIdResponseDto[]> {
  return this.#runBulk(dto.ids, (albumId) => this.#setAlbumFolderChecked(auth, spaceId, albumId, dto.folderId));
}

async bulkSetAlbumTimeline(
  auth: AuthDto,
  spaceId: string,
  dto: SharedSpaceBulkAlbumTimelineDto,
): Promise<BulkIdResponseDto[]> {
  return this.#runBulk(dto.ids, (albumId) =>
    this.#setAlbumTimelineChecked(auth, spaceId, albumId, dto.showInTimeline),
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd server && pnpm exec vitest run --config test/vitest.config.mjs src/services/shared-space.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
cd server && pnpm exec prettier --write src/services/shared-space.service.ts src/services/shared-space.service.spec.ts src/enum.ts
pnpm exec eslint --max-warnings 0 src/services/shared-space.service.ts src/enum.ts
cd .. && git add server/src/services/shared-space.service.ts server/src/services/shared-space.service.spec.ts server/src/enum.ts
git commit -m "feat(server): add bulk unlink, folder and timeline space album operations"
```

---

### Task 4: Bulk folder service methods

**Files:**

- Modify: `server/src/services/shared-space.service.ts`
- Test: `server/src/services/shared-space.service.spec.ts`

**Interfaces:**

- Consumes: Task 1's DTOs, Task 3's `#runBulk`.
- Produces:
  - `bulkMoveAlbumFolders(auth, spaceId, dto: SharedSpaceBulkFolderParentDto): Promise<BulkIdResponseDto[]>`
  - `bulkDeleteAlbumFolders(auth, spaceId, dto: SharedSpaceBulkFolderIdsDto): Promise<BulkIdResponseDto[]>`
  - private `#moveAlbumFolderOrThrow(spaceId: string, folderId: string, destinationParentId: string \| null, name?: string): Promise<void>` — extracted from `updateAlbumFolder`'s move branch and called by both it and the bulk mover.

**Read this before writing code — the naming is a trap.** `moveAlbumFolderChecked` is a **repository** method, not a service method:

```ts
// server/src/repositories/shared-space.repository.ts:1423
moveAlbumFolderChecked(
  spaceId: string,
  folderId: string,
  newParentId: string | null,
  name?: string,
): Promise<'ok' | 'cycle' | 'notfound'>;
```

It takes no `auth`, and it **resolves with an outcome string — it does not throw**. The service's move branch (`shared-space.service.ts:1015-1044`) wraps it with three things the repository does not do:

1. the depth check against `SHARED_SPACE_ALBUM_FOLDER_MAX_DEPTH`;
2. `assertNoAlbumFolderNameConflict(spaceId, destinationParentId, name, folderId)`;
3. `withAlbumFolderNameConflictMapped(...)` plus mapping `'cycle'` and `'notfound'` to `BadRequestException`.

**Calling the repository directly from the bulk method would skip all three** — which is precisely the bypass this task exists to prevent. Extract the service's move branch into `#moveAlbumFolderOrThrow` and have both callers use it. Do not duplicate its body.

- [ ] **Step 1: Write the failing tests**

```ts
describe('bulkMoveAlbumFolders', () => {
  beforeEach(() => {
    // The repo method RESOLVES with an outcome; it never rejects. Default every call to 'ok'.
    mocks.sharedSpace.moveAlbumFolderChecked.mockResolvedValue('ok');
  });

  // Spec §6.3 — the guard against reopening the bypass that narrowing updateAlbumFolder closed.
  it('delegates every move to the repository moveAlbumFolderChecked and never to a raw update', async () => {
    await sut.bulkMoveAlbumFolders(authStub.admin, spaceId, { ids: [f1, f2], parentId: f3 });
    expect(mocks.sharedSpace.moveAlbumFolderChecked).toHaveBeenCalledTimes(2);
    expect(mocks.sharedSpace.updateAlbumFolder).not.toHaveBeenCalled();
  });

  // The repo takes (spaceId, folderId, newParentId, name?) — no auth. Pin the argument order so a
  // refactor cannot silently swap folderId and parentId.
  it('passes spaceId, folderId and the destination parent in that order', async () => {
    await sut.bulkMoveAlbumFolders(authStub.admin, spaceId, { ids: [f1], parentId: f3 });
    expect(mocks.sharedSpace.moveAlbumFolderChecked).toHaveBeenCalledWith(spaceId, f1, f3, undefined);
  });

  it('processes ids in request order so an earlier move constrains a later one', async () => {
    await sut.bulkMoveAlbumFolders(authStub.admin, spaceId, { ids: [f1, f2], parentId: f3 });
    expect(mocks.sharedSpace.moveAlbumFolderChecked.mock.calls.map((c) => c[1])).toEqual([f1, f2]);
  });

  // The 'cycle' OUTCOME, not a rejection. A test that mocked a rejection here would pass against an
  // implementation that ignores the outcome value entirely.
  it('maps a cycle outcome to a validation entry and continues with the next id', async () => {
    mocks.sharedSpace.moveAlbumFolderChecked.mockResolvedValueOnce('cycle');
    const result = await sut.bulkMoveAlbumFolders(authStub.admin, spaceId, { ids: [f1, f2], parentId: f3 });
    expect(result[0]).toMatchObject({ id: f1, success: false, error: BulkIdErrorReason.VALIDATION });
    expect(result[1].success).toBe(true);
  });

  it('maps a notfound outcome to a validation entry', async () => {
    mocks.sharedSpace.moveAlbumFolderChecked.mockResolvedValueOnce('notfound');
    const result = await sut.bulkMoveAlbumFolders(authStub.admin, spaceId, { ids: [f1], parentId: f3 });
    expect(result[0]).toMatchObject({ id: f1, success: false, error: BulkIdErrorReason.VALIDATION });
  });

  // E-12: the depth guard lives in the SERVICE, above the repo call. If the bulk path called the
  // repository directly this test fails — which is the point.
  it('rejects a move that would exceed the depth limit before touching the repository', async () => {
    mocks.sharedSpace.getAlbumFolderDepth.mockResolvedValue(SHARED_SPACE_ALBUM_FOLDER_MAX_DEPTH);
    const result = await sut.bulkMoveAlbumFolders(authStub.admin, spaceId, { ids: [f1], parentId: f3 });
    expect(result[0]).toMatchObject({ success: false, error: BulkIdErrorReason.VALIDATION });
    expect(mocks.sharedSpace.moveAlbumFolderChecked).not.toHaveBeenCalled();
  });
});

describe('bulkDeleteAlbumFolders', () => {
  it('deletes each folder through the promoting deleter', async () => {
    const result = await sut.bulkDeleteAlbumFolders(authStub.admin, spaceId, { ids: [f1, f2] });
    expect(result.every((r) => r.success)).toBe(true);
    expect(mocks.sharedSpace.deleteAlbumFolderPromotingChildren).toHaveBeenCalledTimes(2);
  });

  it('reports not_found for a folder in another space and still deletes the rest', async () => {
    mocks.sharedSpace.getAlbumFolderById.mockImplementation(async (_s, id) => (id === f1 ? undefined : { id }));
    const result = await sut.bulkDeleteAlbumFolders(authStub.admin, spaceId, { ids: [f1, f2] });
    expect(result[0]).toMatchObject({ id: f1, success: false, error: BulkIdErrorReason.NOT_FOUND });
    expect(mocks.sharedSpace.deleteAlbumFolderPromotingChildren).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd server && pnpm exec vitest run --config test/vitest.config.mjs src/services/shared-space.service.spec.ts`
Expected: FAIL — `sut.bulkMoveAlbumFolders is not a function`.

- [ ] **Step 3: Implement**

```ts
/**
 * The move branch lifted verbatim out of updateAlbumFolder (:1015-1044) so the single-item and
 * bulk paths cannot drift. Everything here sits ABOVE the repository call and is exactly what a
 * direct repository call would skip: the depth guard, the name-conflict pre-check, and turning the
 * repository's outcome string into an exception.
 */
async #moveAlbumFolderOrThrow(
  spaceId: string,
  folderId: string,
  destinationParentId: string | null,
  name?: string,
): Promise<void> {
  // ...depth check against SHARED_SPACE_ALBUM_FOLDER_MAX_DEPTH, moved here unchanged...
  await this.assertNoAlbumFolderNameConflict(spaceId, destinationParentId, name, folderId);

  const outcome = await this.withAlbumFolderNameConflictMapped(() =>
    this.sharedSpaceRepository.moveAlbumFolderChecked(spaceId, folderId, destinationParentId, name),
  );
  if (outcome === 'cycle') {
    throw new BadRequestException('A folder cannot be moved into one of its own descendants');
  }
  if (outcome === 'notfound') {
    throw new BadRequestException('Folder not found');
  }
}

async bulkMoveAlbumFolders(
  auth: AuthDto,
  spaceId: string,
  dto: SharedSpaceBulkFolderParentDto,
): Promise<BulkIdResponseDto[]> {
  await this.requireRole(auth, spaceId, SharedSpaceRole.Editor);
  // Sequential and per-item on purpose: the repository call takes the advisory lock and runs cycle
  // detection against the tree AS IT IS NOW, and earlier items in this batch change that tree
  // (E-9, E-10). A raw bulk UPDATE — or a direct repository call — bypasses the depth and
  // name-conflict guards above it.
  return this.#runBulk(dto.ids, (folderId) => this.#moveAlbumFolderOrThrow(spaceId, folderId, dto.parentId));
}

async bulkDeleteAlbumFolders(
  auth: AuthDto,
  spaceId: string,
  dto: SharedSpaceBulkFolderIdsDto,
): Promise<BulkIdResponseDto[]> {
  await this.requireRole(auth, spaceId, SharedSpaceRole.Editor);
  // deleteAlbumFolder re-checks the role per item; that is redundant here but harmless, and
  // reusing it verbatim keeps the promoting-delete semantics in exactly one place.
  return this.#runBulk(dto.ids, (folderId) => this.deleteAlbumFolder(auth, spaceId, folderId));
}
```

Then rewrite `updateAlbumFolder`'s `if (isMove)` branch to call `#moveAlbumFolderOrThrow` too, and re-run the existing folder tests to prove the extraction changed nothing.

- [ ] **Step 4: Run to verify they pass**

Run: `cd server && pnpm exec vitest run --config test/vitest.config.mjs src/services/shared-space.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Lint, format, commit**

```bash
cd server && pnpm exec prettier --write src/services/shared-space.service.ts src/services/shared-space.service.spec.ts
pnpm exec eslint --max-warnings 0 src/services/shared-space.service.ts
cd .. && git add server/src/services/shared-space.service.ts server/src/services/shared-space.service.spec.ts
git commit -m "feat(server): add bulk move and delete for space album folders"
```

---

### Task 5: Controller endpoints

**Files:**

- Modify: `server/src/controllers/shared-space.controller.ts`
- Test: `e2e/src/specs/server/api/shared-space-album-folder.e2e-spec.ts`

**Interfaces:**

- Consumes: Tasks 1, 3, 4.
- Produces: the five HTTP routes of spec §6.1, all returning `BulkIdResponseDto[]` with status 200.

- [ ] **Step 1: Write the failing e2e tests**

Add to the existing spec file, following its `R-xx` numbering and principal setup (`owner`, `editor`, `viewer`, `stranger`, `space`, `otherSpace`):

```ts
describe('bulk endpoints', () => {
  // S-27
  it('R-20 unlinks a batch and reports per-item outcomes', async () => {
    const { status, body } = await request(app)
      .post(`/shared-spaces/${space.id}/albums/bulk-unlink`)
      .set(asBearerAuth(editor.accessToken))
      .send({ ids: [albumA.id, foreignAlbum.id] });
    expect(status).toBe(200);
    expect(body).toEqual([
      { id: albumA.id, success: true },
      expect.objectContaining({ id: foreignAlbum.id, success: false, error: 'not_found' }),
    ]);

    const list = await request(app).get(`/shared-spaces/${space.id}/albums`).set(asBearerAuth(editor.accessToken));
    expect(list.body.map((l: { albumId: string }) => l.albumId)).not.toContain(albumA.id);
  });

  // S-28
  it('R-21 refuses a viewer with 403', async () => {
    const { status } = await request(app)
      .post(`/shared-spaces/${space.id}/albums/bulk-unlink`)
      .set(asBearerAuth(viewer.accessToken))
      .send({ ids: [albumB.id] });
    expect(status).toBe(403);
  });

  // S-29
  it('R-22 refuses a non-member with 403', async () => {
    const { status } = await request(app)
      .post(`/shared-spaces/${space.id}/albums/bulk-unlink`)
      .set(asBearerAuth(stranger.accessToken))
      .send({ ids: [albumB.id] });
    expect(status).toBe(403);
  });

  // E-2
  it('R-23 rejects an empty ids array with 400', async () => {
    const { status } = await request(app)
      .post(`/shared-spaces/${space.id}/albums/bulk-unlink`)
      .set(asBearerAuth(editor.accessToken))
      .send({ ids: [] });
    expect(status).toBe(400);
  });

  it('R-24 moves a batch of albums into a folder and the list reflects it', async () => {
    const { status, body } = await request(app)
      .put(`/shared-spaces/${space.id}/albums/bulk-folder`)
      .set(asBearerAuth(editor.accessToken))
      .send({ ids: [albumB.id, albumC.id], folderId: folder.id });
    expect(status).toBe(200);
    expect(body.every((r: { success: boolean }) => r.success)).toBe(true);

    const list = await request(app).get(`/shared-spaces/${space.id}/albums`).set(asBearerAuth(editor.accessToken));
    const placed = list.body.filter((l: { folderId: string | null }) => l.folderId === folder.id);
    expect(placed).toHaveLength(2);
  });

  it('R-25 applies the timeline flag to a batch', async () => {
    const { status } = await request(app)
      .put(`/shared-spaces/${space.id}/albums/bulk-timeline`)
      .set(asBearerAuth(editor.accessToken))
      .send({ ids: [albumB.id], showInTimeline: false });
    expect(status).toBe(200);
    const list = await request(app).get(`/shared-spaces/${space.id}/albums`).set(asBearerAuth(editor.accessToken));
    expect(list.body.find((l: { albumId: string }) => l.albumId === albumB.id).showInTimeline).toBe(false);
  });

  // S-30
  it('R-26 rejects a cycle in a bulk folder move with a validation entry', async () => {
    const { status, body } = await request(app)
      .put(`/shared-spaces/${space.id}/album-folders/bulk-parent`)
      .set(asBearerAuth(editor.accessToken))
      .send({ ids: [parentFolder.id], parentId: childFolder.id });
    expect(status).toBe(200);
    expect(body[0]).toMatchObject({ success: false, error: 'validation' });
  });

  // S-21
  it('R-27 bulk deletes folders and promotes their children', async () => {
    const { status } = await request(app)
      .post(`/shared-spaces/${space.id}/album-folders/bulk-delete`)
      .set(asBearerAuth(editor.accessToken))
      .send({ ids: [folder.id] });
    expect(status).toBe(200);
    const list = await request(app).get(`/shared-spaces/${space.id}/albums`).set(asBearerAuth(editor.accessToken));
    expect(list.body.find((l: { albumId: string }) => l.albumId === albumB.id).folderId).toBeNull();
  });

  it('R-28 refuses a viewer on bulk folder delete with 403', async () => {
    const { status } = await request(app)
      .post(`/shared-spaces/${space.id}/album-folders/bulk-delete`)
      .set(asBearerAuth(viewer.accessToken))
      .send({ ids: [folder.id] });
    expect(status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Bring the e2e stack up once (expensive — do it once, not per run), then:
Run: `cd e2e && pnpm exec vitest run src/specs/server/api/shared-space-album-folder.e2e-spec.ts`
Expected: FAIL with 404s — the routes do not exist.

**Before running:** check `lsof -nP -iTCP:5435 -sTCP:LISTEN` shows only Docker and `pgrep -fl socat` is empty. A stray forwarder on 5435 makes `resetDatabase()` truncate a different database.

- [ ] **Step 3: Implement the endpoints**

```ts
@Post(':id/albums/bulk-unlink')
@Authenticated({ permission: Permission.SharedSpaceAlbumDelete })
@Endpoint({
  summary: 'Unlink several albums from a shared space',
  description: 'Per-item results; the request succeeds with 200 even when every item fails.',
  history: new HistoryBuilder().added('v1').beta('v1'),
})
bulkUnlinkAlbums(
  @Auth() auth: AuthDto,
  @Param() { id }: UUIDParamDto,
  @Body() dto: SharedSpaceBulkAlbumIdsDto,
): Promise<BulkIdResponseDto[]> {
  return this.service.bulkUnlinkAlbums(auth, id, dto);
}
```

Repeat the same shape for the remaining four, using the method/path/permission/DTO rows from spec §6.1: `PUT :id/albums/bulk-folder` → `bulkSetAlbumFolder` (`SharedSpaceAlbumUpdate`), `PUT :id/albums/bulk-timeline` → `bulkSetAlbumTimeline` (`SharedSpaceAlbumUpdate`), `PUT :id/album-folders/bulk-parent` → `bulkMoveAlbumFolders` (`SharedSpaceAlbumFolderUpdate`), `POST :id/album-folders/bulk-delete` → `bulkDeleteAlbumFolders` (`SharedSpaceAlbumFolderDelete`). None carries `@HttpCode(HttpStatus.NO_CONTENT)` — they all return a body.

- [ ] **Step 4: Run to verify they pass**

Run: `cd e2e && pnpm exec vitest run src/specs/server/api/shared-space-album-folder.e2e-spec.ts`
Expected: PASS. Quote the test-file count to prove the filter took.

- [ ] **Step 5: Lint, format, commit**

```bash
cd server && pnpm exec prettier --write src/controllers/shared-space.controller.ts
pnpm exec eslint --max-warnings 0 src/controllers/shared-space.controller.ts
cd ../e2e && pnpm run lint && pnpm exec prettier --write src/specs/server/api/shared-space-album-folder.e2e-spec.ts && pnpm run check
cd .. && git add server/src/controllers/shared-space.controller.ts e2e/src/specs/server/api/shared-space-album-folder.e2e-spec.ts
git commit -m "feat(server): expose bulk space album and folder endpoints"
```

---

### Task 6: Medium tests — batch ordering, cycles and sync

**Files:**

- Test: `server/test/medium/specs/repositories/shared-space-album-folder.repository.spec.ts`, `server/test/medium/specs/sync/shared-space-album-folder-sync.spec.ts`

**Interfaces:** consumes Tasks 3–4. Produces no code.

These run against a real database, so they catch what mocked unit tests structurally cannot: that an earlier move in a batch genuinely changes what is legal for a later one.

- [ ] **Step 1: Write the tests**

```ts
// E-9 / E-10: intra-batch ordering against the real tree.
//
// The dto carries ONE parentId for the whole batch, so the cycle must be built from that shape:
// moving both A and B under B is legal for A and illegal for B (a folder cannot be its own parent).
// The property under test is that item 2 is validated against the tree item 1 produced, which only
// a sequential implementation gives — a Promise.all version can pass or fail depending on timing.
it('validates each move against the tree the previous move produced', async () => {
  const { space } = await ctx.newSpace();
  const a = await ctx.newAlbumFolder(space.id, { name: 'A' });
  const b = await ctx.newAlbumFolder(space.id, { name: 'B' });

  const results = await sut.bulkMoveAlbumFolders(auth, space.id, { ids: [a.id, b.id], parentId: b.id });

  expect(results[0]).toMatchObject({ id: a.id, success: true });
  expect(results[1]).toMatchObject({ id: b.id, success: false, error: 'validation' });

  const rows = await ctx.getAlbumFolders(space.id);
  expect(rows.find((r) => r.id === a.id)!.parentId).toBe(b.id);
  expect(rows.find((r) => r.id === b.id)!.parentId).toBeNull();
});

// S-21 against the real DB.
it('bulk delete promotes children and never unlinks an album', async () => {
  const { space } = await ctx.newSpace();
  const parent = await ctx.newAlbumFolder(space.id, { name: 'Parent' });
  const child = await ctx.newAlbumFolder(space.id, { name: 'Child', parentId: parent.id });
  const album = await ctx.newLinkedAlbum(space.id, { folderId: parent.id });

  await sut.bulkDeleteAlbumFolders(auth, space.id, { ids: [parent.id] });

  const folders = await ctx.getAlbumFolders(space.id);
  expect(folders.map((f) => f.id)).toEqual([child.id]);
  expect(folders[0].parentId).toBeNull();
  const link = await ctx.getAlbumLink(space.id, album.albumId);
  expect(link).toBeDefined();
  expect(link!.folderId).toBeNull();
});
```

```ts
// Batch sync: one checkpoint advance, driven through the handler.
it('delivers a bulk folder move as a single checkpoint advance', async () => {
  // owner creates two folders, member syncs and acks
  // owner bulk-moves both
  const response = await ctx.syncStream(auth, [SyncRequestType.SharedSpaceAlbumFoldersV1]);
  const upserts = response.filter((r) => r.type === SyncEntityType.SharedSpaceAlbumFolderV1);
  expect(upserts).toHaveLength(2);
  const acks = response.filter((r) => r.type === SyncEntityType.SyncAckV1);
  expect(acks).toHaveLength(1);
});
```

- [ ] **Step 2: Run them**

Run: `cd server && pnpm exec vitest run --config test/vitest.config.medium.mjs test/medium/specs/repositories/shared-space-album-folder.repository.spec.ts test/medium/specs/sync/shared-space-album-folder-sync.spec.ts`
Expected: PASS. Quote the reported file/test counts.

- [ ] **Step 3: Prove they can fail**

Mutate `#runBulk` to process ids in parallel (`Promise.all`) instead of sequentially, re-run, capture the ordering test's failure, revert. Then mutate the bulk delete to skip the promotion, capture, revert. Record both in the report — this is the evidence that the medium tests test something.

- [ ] **Step 4: Commit**

```bash
cd server && pnpm exec prettier --write test/medium/specs/repositories/shared-space-album-folder.repository.spec.ts test/medium/specs/sync/shared-space-album-folder-sync.spec.ts
cd .. && git add server/test/medium
git commit -m "test(server): cover bulk album folder batching against a real database"
```

---

## Phase B — Contracts

### Task 7: Regenerate the API clients

**Files:** `open-api/`, `packages/sdk/`, `mobile/openapi/` (all generated — never hand-edited).

**Interfaces:** consumes Tasks 1–5. Produces the generated `bulkUnlinkAlbums`, `bulkSetAlbumFolder`, `bulkSetAlbumTimeline`, `bulkMoveAlbumFolders`, `bulkDeleteAlbumFolders` client functions used by Phases C and D.

- [ ] **Step 1: Build the server and regenerate**

```bash
cd server && pnpm build && pnpm sync:open-api
cd .. && make open-api
```

Java is required for the Dart generation. Regenerating only the TypeScript SDK fails CI's OpenAPI Clients job.

- [ ] **Step 2: Verify both clients moved**

```bash
git status --short open-api packages/sdk mobile/openapi
```

Expected: changes in all three. Dart model files are BOM'd, so `git diff` may show `Bin N -> M bytes` with no textual diff — verify content with `grep`, not `git diff`:

```bash
grep -rl "bulkUnlinkAlbums" mobile/openapi/lib | head
```

- [ ] **Step 3: Typecheck the SDK consumers**

```bash
cd web && pnpm check:typescript
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add open-api packages/sdk mobile/openapi
git commit -m "chore: regenerate api clients for the space album bulk endpoints"
```

---

### Task 8: i18n keys

**Files:** `i18n/en.json` and the nine fork locales.

**Interfaces:** produces the key names consumed by Phases C and D.

Keys to add:

| Key                                      | EN value                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `space_album_selected_count`             | `{count, plural, one {# selected} other {# selected}}`                                    |
| `space_album_bulk_unlink_title`          | `{count, plural, one {Unlink 1 album?} other {Unlink # albums?}}`                         |
| `space_album_bulk_unlink_confirm`        | `They will be removed from this space. The albums themselves are kept.`                   |
| `space_album_bulk_folder_delete_title`   | `{count, plural, one {Delete 1 folder?} other {Delete # folders?}}`                       |
| `space_album_bulk_folder_delete_confirm` | `Albums inside will move up one level. Nothing is unlinked.`                              |
| `space_album_bulk_add_to_timeline`       | `Add to timeline`                                                                         |
| `space_album_bulk_remove_from_timeline`  | `Remove from timeline`                                                                    |
| `space_album_bulk_partial_failure`       | `{count, plural, one {# item could not be updated} other {# items could not be updated}}` |
| `spaces_activity_bulk_unlinked_albums`   | `{name} unlinked {albumName} and {count, plural, one {# other} other {# others}}`         |

- [ ] **Step 1: Add the EN keys**

Insert into `i18n/en.json` in alphabetical position (the file is sorted; Prettier's `prettier-plugin-sort-json` enforces it).

- [ ] **Step 2: Translate into the nine locales**

Match each locale's existing terminology rather than inventing: folder is `Ordner` / `Carpeta` / `Dossier` / `Cartella` / `Map` / `Folder` / `Папка` / `文件夹` / `資料夾`; "Space" stays untranslated in de/es/nl/pl/ru/zh, fr uses _espaces_, it uses _Space_; `zh_Hans` uses `相簿` in this surface, not `相册`.

Plural categories must be correct per CLDR: `pl` and `ru` need `one/few/many/other`, `zh` a single form.

- [ ] **Step 3: Verify the plurals actually render**

Do not eyeball them. From `web/`, run every new plural string through `intl-messageformat` for each locale at n = 0, 1, 2, 3, 5, 11, 21, 101 and assert no throw. A missing `few`/`many` category throws at format time, which is the only reliable check.

- [ ] **Step 4: Run the i18n CI gate**

```bash
pnpm exec prettier --check i18n
```

Expected: `All matched files use Prettier code style!` — CI runs `pnpm format:fix` and fails if any `i18n/**` file changes.

- [ ] **Step 5: Commit**

```bash
git add i18n
git commit -m "feat(i18n): add space album multi-select strings across all nine locales"
```

---

## Phase C — Web

### Task 9: The selection manager

**Files:**

- Create: `web/src/lib/managers/space-album-multi-select-manager.svelte.ts`, `web/src/lib/managers/space-album-multi-select-manager.svelte.spec.ts`

**Interfaces:**

- Consumes: nothing.
- Produces, for Tasks 10–12:
  - `class SpaceAlbumMultiSelectManager`
  - `kind: 'none' | 'album' | 'folder'` (derived), `ids: string[]` (derived), `count: number`, `selectionActive: boolean`
  - `has(kind: 'album' | 'folder', id: string): boolean`
  - `isCandidate(id: string): boolean`
  - `toggle(kind: 'album' | 'folder', id: string, ordered: string[]): void`
  - `selectRange(kind, toId: string, ordered: string[]): void`
  - `previewRange(kind, toId: string, ordered: string[]): void` and `candidates: string[]`
  - `reconcile(presentIds: string[]): void` — drops ids that have disappeared from the page's data (E-5)
  - `clear(): void`

`ordered` is the derived flat visual list (spec §4.3), passed in by the caller rather than owned by the manager — the manager must not know about grouping, search or view modes.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { SpaceAlbumMultiSelectManager } from '$lib/managers/space-album-multi-select-manager.svelte';

const order = ['a', 'b', 'c', 'd', 'e'];

describe('SpaceAlbumMultiSelectManager', () => {
  it('starts empty and inactive', () => {
    const m = new SpaceAlbumMultiSelectManager();
    expect(m.selectionActive).toBe(false);
    expect(m.kind).toBe('none');
  });

  it('toggles an album on and off', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'b', order);
    expect(m.ids).toEqual(['b']);
    m.toggle('album', 'b', order);
    expect(m.selectionActive).toBe(false);
  });

  // S-4
  it('selects an inclusive range from the anchor', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.selectRange('album', 'd', order);
    expect(m.ids.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  // E-8
  it('selects a backwards range in visual order', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'd', order);
    m.selectRange('album', 'b', order);
    expect(m.ids.sort()).toEqual(['b', 'c', 'd']);
  });

  // E-7
  it('treats a range with no anchor as a plain selection', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.selectRange('album', 'c', order);
    expect(m.ids).toEqual(['c']);
  });

  // S-7 — the ordered list excludes collapsed items, so a range cannot pass through them.
  // Positive control: the visible items ARE included, so this cannot pass vacuously.
  it('cannot range through items missing from the ordered list', () => {
    const m = new SpaceAlbumMultiSelectManager();
    const visible = ['a', 'b', 'e'];
    m.toggle('album', 'a', visible);
    m.selectRange('album', 'e', visible);
    expect(m.ids.sort()).toEqual(['a', 'b', 'e']);
    expect(m.ids).not.toContain('c');
    expect(m.ids).not.toContain('d');
  });

  // S-5
  it('previews a range without committing it', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.previewRange('album', 'c', order);
    expect(m.candidates.sort()).toEqual(['b', 'c']);
    expect(m.ids).toEqual(['a']);
  });

  // S-11 — with a positive control that the album selection was non-empty first.
  it('replaces an album selection when a folder is selected', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.toggle('album', 'b', order);
    expect(m.ids).toHaveLength(2);
    expect(m.kind).toBe('album');

    m.toggle('folder', 'f1', ['f1', 'f2']);
    expect(m.kind).toBe('folder');
    expect(m.ids).toEqual(['f1']);
  });

  // S-12
  it('replaces a folder selection when an album is selected', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('folder', 'f1', ['f1']);
    expect(m.ids).toHaveLength(1);
    m.toggle('album', 'a', order);
    expect(m.kind).toBe('album');
    expect(m.ids).toEqual(['a']);
  });

  // S-8
  it('clears everything', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.previewRange('album', 'c', order);
    m.clear();
    expect(m.selectionActive).toBe(false);
    expect(m.candidates).toEqual([]);
  });

  // E-5
  it('drops ids that no longer exist when reconciled', () => {
    const m = new SpaceAlbumMultiSelectManager();
    m.toggle('album', 'a', order);
    m.toggle('album', 'b', order);
    m.reconcile(['b']);
    expect(m.ids).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && pnpm exec vitest run src/lib/managers/space-album-multi-select-manager.svelte.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { SvelteSet } from 'svelte/reactivity';

export type SpaceAlbumSelectionKind = 'album' | 'folder';

/**
 * Mirrors AssetMultiSelectManager's shape deliberately rather than sharing code with it: that
 * manager is asset-typed throughout (ownedAssets, isAllTrashed, isAllArchived, isAllFavorite), so a
 * shared generic would either drag asset concepts into the album domain or dissolve into type
 * parameters. This is ~40 lines; copying beats abstracting.
 *
 * The manager never learns about grouping, search or view mode. Callers pass `ordered` — the flat
 * visual list for the CURRENT mode — so range semantics stay correct without the manager
 * understanding why an item is or is not in it.
 */
export class SpaceAlbumMultiSelectManager {
  #kind = $state<SpaceAlbumSelectionKind | 'none'>('none');
  #ids = new SvelteSet<string>();
  #anchor = $state<string | null>(null);

  candidates = $state<string[]>([]);

  kind = $derived(this.#kind);
  ids = $derived(Array.from(this.#ids));
  count = $derived(this.#ids.size);
  selectionActive = $derived(this.#ids.size > 0);

  has(kind: SpaceAlbumSelectionKind, id: string) {
    return this.#kind === kind && this.#ids.has(id);
  }

  isCandidate(id: string) {
    return this.candidates.includes(id);
  }

  toggle(kind: SpaceAlbumSelectionKind, id: string, ordered: string[]) {
    // Never-mixed: switching kind replaces the selection wholesale (spec §4.2).
    if (this.#kind !== kind) {
      this.#kind = kind;
      this.#ids.clear();
    }
    if (this.#ids.has(id)) {
      this.#ids.delete(id);
      if (this.#ids.size === 0) {
        this.#kind = 'none';
        this.#anchor = null;
      }
    } else {
      this.#ids.add(id);
      this.#anchor = id;
    }
    this.candidates = [];
    void ordered;
  }

  #range(toId: string, ordered: string[]): string[] {
    const from = this.#anchor;
    if (from === null) {
      return [toId];
    }
    const i = ordered.indexOf(from);
    const j = ordered.indexOf(toId);
    if (i === -1 || j === -1) {
      return [toId];
    }
    return ordered.slice(Math.min(i, j), Math.max(i, j) + 1);
  }

  selectRange(kind: SpaceAlbumSelectionKind, toId: string, ordered: string[]) {
    if (this.#kind !== kind) {
      this.#kind = kind;
      this.#ids.clear();
      this.#anchor = null;
    }
    for (const id of this.#range(toId, ordered)) {
      this.#ids.add(id);
    }
    this.candidates = [];
  }

  previewRange(kind: SpaceAlbumSelectionKind, toId: string, ordered: string[]) {
    if (this.#kind !== kind || this.#anchor === null) {
      this.candidates = [];
      return;
    }
    this.candidates = this.#range(toId, ordered).filter((id) => !this.#ids.has(id));
  }

  /** Drop ids that have disappeared from the page's data (E-5). */
  reconcile(presentIds: string[]) {
    const present = new Set(presentIds);
    for (const id of this.#ids) {
      if (!present.has(id)) {
        this.#ids.delete(id);
      }
    }
    if (this.#ids.size === 0) {
      this.#kind = 'none';
      this.#anchor = null;
    }
  }

  clear() {
    this.#kind = 'none';
    this.#ids.clear();
    this.#anchor = null;
    this.candidates = [];
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd web && pnpm exec vitest run src/lib/managers/space-album-multi-select-manager.svelte.spec.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
cd web && pnpm exec prettier --write src/lib/managers/space-album-multi-select-manager.svelte.ts src/lib/managers/space-album-multi-select-manager.svelte.spec.ts
cd .. && git add web/src/lib/managers/space-album-multi-select-manager.svelte.ts web/src/lib/managers/space-album-multi-select-manager.svelte.spec.ts
git commit -m "feat(web): add the space album multi-select manager"
```

---

### Task 10: Bulk action utilities and partial-failure handling

**Files:**

- Create: `web/src/lib/utils/space-album-bulk-actions.ts`, `web/src/lib/utils/space-album-bulk-actions.spec.ts`

**Interfaces:**

- Consumes: Task 7's generated SDK functions.
- Produces: `applyBulkResult(ids: string[], results: BulkIdResponseDto[]): { failedIds: string[]; failedCount: number }` and the five thin action wrappers used by Task 11.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { applyBulkResult } from '$lib/utils/space-album-bulk-actions';

describe('applyBulkResult', () => {
  // S-24
  it('returns only the failed ids so the caller can keep them selected', () => {
    const r = applyBulkResult(['a', 'b', 'c'], [
      { id: 'a', success: true },
      { id: 'b', success: false, error: 'no_permission' },
      { id: 'c', success: true },
    ] as never);
    expect(r.failedIds).toEqual(['b']);
    expect(r.failedCount).toBe(1);
  });

  // S-26
  it('returns no failures when everything succeeded', () => {
    const r = applyBulkResult(['a'], [{ id: 'a', success: true }] as never);
    expect(r.failedIds).toEqual([]);
  });

  // S-25
  it('returns every id when everything failed', () => {
    const r = applyBulkResult(['a', 'b'], [
      { id: 'a', success: false, error: 'unknown' },
      { id: 'b', success: false, error: 'unknown' },
    ] as never);
    expect(r.failedIds).toEqual(['a', 'b']);
  });

  // E-19: a transport failure yields no results at all — treat every id as failed so nothing
  // is silently deselected.
  it('treats a missing result set as a total failure', () => {
    const r = applyBulkResult(['a', 'b'], []);
    expect(r.failedIds).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && pnpm exec vitest run src/lib/utils/space-album-bulk-actions.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { BulkIdResponseDto } from '@immich/sdk';

export const applyBulkResult = (ids: string[], results: BulkIdResponseDto[]) => {
  const succeeded = new Set(results.filter((r) => r.success).map((r) => r.id));
  const failedIds = ids.filter((id) => !succeeded.has(id));
  return { failedIds, failedCount: failedIds.length };
};
```

Add the five wrappers calling the generated SDK functions, each returning `applyBulkResult(...)`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd web && pnpm exec vitest run src/lib/utils/space-album-bulk-actions.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd web && pnpm exec prettier --write src/lib/utils/space-album-bulk-actions.ts src/lib/utils/space-album-bulk-actions.spec.ts
cd .. && git add web/src/lib/utils/space-album-bulk-actions.ts web/src/lib/utils/space-album-bulk-actions.spec.ts
git commit -m "feat(web): add space album bulk action helpers"
```

---

### Task 11: Card affordances, clearing triggers and the selection bar

**Files:**

- Create: `web/src/lib/components/spaces/space-album-select-bar.svelte`
- Modify: `space-album-card.svelte`, `space-album-folder-card.svelte`, `space-albums-table.svelte`, `space-albums-list.svelte`, `web/src/routes/(user)/spaces/[spaceId]/albums/+page.svelte`
- Test: `web/src/lib/components/spaces/space-albums-list.spec.ts`

**Interfaces:** consumes Tasks 8–10.

**The clearing rule is the part most likely to be got wrong.** `AppNavigate` is NOT emitted for same-route transitions (`+layout.svelte:185-193`), and entering a folder only changes `?folder=` on the same route. Three explicit triggers are required.

- [ ] **Step 1: Write the failing tests**

```ts
const props = {
  spaceId: 'space-1',
  albums: [linkedAlbum('a'), linkedAlbum('b')],
  folders: [folderDto('f')],
  canManage: true,
  currentFolderId: null,
  searchQuery: '',
};

// S-1
it('clicking the check circle enters selection without navigating', async () => {
  const onOpen = vi.fn();
  render(SpaceAlbumsList, { ...props, onOpenAlbum: onOpen });
  await fireEvent.click(screen.getByTestId('space-album-select-a'));
  expect(screen.getByTestId('space-album-select-bar')).toBeInTheDocument();
  expect(onOpen).not.toHaveBeenCalled();
});

// S-2
it('clicking a card while a selection is active toggles instead of navigating', async () => {
  const onOpen = vi.fn();
  render(SpaceAlbumsList, { ...props, onOpenAlbum: onOpen });
  await fireEvent.click(screen.getByTestId('space-album-select-a'));
  await fireEvent.click(screen.getByTestId('space-album-card-b'));
  expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('2');
  expect(onOpen).not.toHaveBeenCalled();
});

// S-3
it('clicking a card with no selection opens the album', async () => {
  const onOpen = vi.fn();
  render(SpaceAlbumsList, { ...props, onOpenAlbum: onOpen });
  await fireEvent.click(screen.getByTestId('space-album-card-b'));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  expect(screen.queryByTestId('space-album-select-bar')).not.toBeInTheDocument();
});

// S-9 — the trigger AppNavigate does NOT cover.
it('clears the selection when currentFolderId changes', async () => {
  const { rerender } = render(SpaceAlbumsList, { ...props, currentFolderId: null });
  await fireEvent.click(screen.getByTestId('space-album-select-a'));
  await fireEvent.click(screen.getByTestId('space-album-select-b'));
  expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('2');

  await rerender({ ...props, currentFolderId: 'folder-1' });
  expect(screen.queryByTestId('space-album-select-bar')).not.toBeInTheDocument();
});

// S-9b — searchQuery is local $state, so no navigation fires at all.
it('clears the selection when searchQuery changes', async () => {
  const { rerender } = render(SpaceAlbumsList, { ...props, searchQuery: 'be' });
  await fireEvent.click(screen.getByTestId('space-album-select-a'));
  expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1');

  await rerender({ ...props, searchQuery: 'bea' });
  expect(screen.queryByTestId('space-album-select-bar')).not.toBeInTheDocument();
});

// S-10
it('renders no check circle when canManage is false', async () => {
  render(SpaceAlbumsList, { ...props, canManage: false });
  // Positive control: the cards themselves ARE rendered, so this is not vacuous.
  expect(screen.getByTestId('space-album-card-a')).toBeInTheDocument();
  expect(screen.queryByTestId('space-album-select-a')).not.toBeInTheDocument();
});

// S-13
it('offers move and delete but not unlink for a folder selection', async () => {
  render(SpaceAlbumsList, props);
  await fireEvent.click(screen.getByTestId('space-album-folder-select-f'));
  const bar = screen.getByTestId('space-album-select-bar');
  expect(within(bar).getByRole('button', { name: 'space_album_folder_move' })).toBeInTheDocument();
  expect(within(bar).getByRole('button', { name: 'space_album_folder_delete' })).toBeInTheDocument();
  expect(within(bar).queryByRole('button', { name: 'space_album_unlink_from_space' })).not.toBeInTheDocument();
});

// S-11 at the component level: selecting a folder replaces an album selection.
it('replaces an album selection when a folder is selected', async () => {
  render(SpaceAlbumsList, props);
  await fireEvent.click(screen.getByTestId('space-album-select-a'));
  expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1'); // positive control
  await fireEvent.click(screen.getByTestId('space-album-folder-select-f'));
  expect(screen.getByTestId('space-album-select-bar')).toHaveTextContent('1');
  expect(screen.getByTestId('space-album-card-a')).not.toHaveAttribute('data-selected', 'true');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && pnpm exec vitest run src/lib/components/spaces/space-albums-list.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Derive the flat visual list in `space-albums-list.svelte` per spec §4.3 — it does not exist today:

```ts
const orderedIds = $derived.by(() => {
  if (isSearching) {
    return searchHitAlbums.map((a) => a.id);
  }
  if (isGrouped) {
    return groups
      .filter((g) => !isSpaceAlbumGroupCollapsed($spaceAlbumViewSettings, g.id))
      .flatMap((g) => g.albums.map((a) => a.id));
  }
  return sorted.map((a) => a.id);
});
```

Add the three clearing effects in `+page.svelte`:

```ts
// AppNavigate is suppressed for same-route transitions (+layout.svelte:185-193), and entering a
// folder only changes ?folder= on the SAME route — so relying on resetOnNavigate alone would carry
// a selection across folder levels. These two effects are load-bearing, not belt-and-braces.
$effect(() => {
  void requestedFolderId;
  selection.clear();
});
$effect(() => {
  void searchQuery;
  selection.clear();
});
```

Construct the manager with `resetOnNavigate` semantics for the third trigger (leaving the route entirely) via `eventManager.on({ AppNavigate: () => selection.clear() })`.

Add the check circle to both card components (gated on `canManage`), route clicks through `selection.toggle` / `selection.selectRange` based on `keyboardManager.shift`, add `onmouseenter` → `selection.previewRange` while Shift is held, and add row checkboxes to `space-albums-table.svelte`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd web && pnpm exec vitest run src/lib/components/spaces/space-albums-list.spec.ts`
Expected: PASS.

- [ ] **Step 5: Web gates and commit**

```bash
cd web && pnpm exec prettier --write src/lib/components/spaces src/routes/\(user\)/spaces
pnpm run lint && pnpm check:typescript && pnpm check:svelte
cd .. && git add web/src
git commit -m "feat(web): add multi-select affordances to the space albums page"
```

---

### Task 12: Wire the bulk actions and drag-and-drop

**Files:** modify `space-album-select-bar.svelte`, `+page.svelte`, `web/src/lib/utils/space-album-folder-dnd.ts`, `space-activity-feed.svelte`
**Test:** `web/src/lib/utils/space-album-folder-dnd.spec.ts`, `space-albums-list.spec.ts`

**Interfaces:**

- Consumes: Task 9's manager, Task 10's `applyBulkResult`, Task 8's i18n keys.
- Produces, in `space-album-folder-dnd.ts`:
  - `type DragPayload = { kind: 'album' | 'folder'; ids: string[] }` (was `{ kind; id: string }`)
  - `buildDragPayload(item: { kind: 'album' | 'folder'; id: string }, selectedIds: string[], selectedKind: 'album' | 'folder' | 'none'): DragPayload` — returns every selected id when `item` is part of the current selection and that selection is the same kind, otherwise `{ kind: item.kind, ids: [item.id] }`.
  - `writeDragPayload(dataTransfer, payload)` and `readDragPayload(dataTransfer)` keep their names and signatures; only the payload type widens.

- [ ] **Step 1: Write the failing tests**

```ts
// S-22
it('dragging a selected card carries the whole selection', () => {
  const payload = buildDragPayload({ kind: 'album', id: 'b' }, ['a', 'b', 'c'], 'album');
  expect(payload.ids.sort()).toEqual(['a', 'b', 'c']);
});

// S-23
it('dragging an unselected card carries only that card', () => {
  const payload = buildDragPayload({ kind: 'album', id: 'd' }, ['a', 'b'], 'album');
  expect(payload.ids).toEqual(['d']);
});

// S-19: every selected album is already in the timeline -> the button offers to remove.
it('labels the timeline button "Remove from timeline" when all are included', async () => {
  render(SpaceAlbumSelectBar, {
    props: { kind: 'album', selected: [albumIn('a'), albumIn('b')], onAction: vi.fn() },
  });
  expect(screen.getByRole('button', { name: 'space_album_bulk_remove_from_timeline' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'space_album_bulk_add_to_timeline' })).not.toBeInTheDocument();
});

// S-18: a mixed selection resolves toward include.
it('labels the timeline button "Add to timeline" when any is excluded', async () => {
  render(SpaceAlbumSelectBar, {
    props: { kind: 'album', selected: [albumIn('a'), albumOut('b')], onAction: vi.fn() },
  });
  expect(screen.getByRole('button', { name: 'space_album_bulk_add_to_timeline' })).toBeInTheDocument();
});

it('sends showInTimeline true for a mixed selection', async () => {
  const onAction = vi.fn();
  render(SpaceAlbumSelectBar, { props: { kind: 'album', selected: [albumIn('a'), albumOut('b')], onAction } });
  await fireEvent.click(screen.getByRole('button', { name: 'space_album_bulk_add_to_timeline' }));
  expect(onAction).toHaveBeenCalledWith({ type: 'timeline', showInTimeline: true });
});

// S-24: exactly the failures stay selected, and the successes do not.
it('keeps exactly the failed items selected after a partial failure', async () => {
  const manager = new SpaceAlbumMultiSelectManager();
  const order = ['a', 'b', 'c'];
  for (const id of order) {
    manager.toggle('album', id, order);
  }
  expect(manager.count).toBe(3); // positive control

  vi.mocked(bulkUnlinkAlbums).mockResolvedValue([
    { id: 'a', success: true },
    { id: 'b', success: false, error: 'no_permission' },
    { id: 'c', success: true },
  ] as never);

  await runBulkUnlink(manager, 'space-1', order);

  expect(manager.ids).toEqual(['b']);
  expect(manager.kind).toBe('album');
});

// S-26
it('clears the selection when every item succeeded', async () => {
  const manager = new SpaceAlbumMultiSelectManager();
  manager.toggle('album', 'a', ['a']);
  vi.mocked(bulkUnlinkAlbums).mockResolvedValue([{ id: 'a', success: true }] as never);
  await runBulkUnlink(manager, 'space-1', ['a']);
  expect(manager.selectionActive).toBe(false);
});

// E-19: a thrown request must not deselect anything.
it('keeps the whole selection when the request throws', async () => {
  const manager = new SpaceAlbumMultiSelectManager();
  for (const id of ['a', 'b']) {
    manager.toggle('album', id, ['a', 'b']);
  }
  vi.mocked(bulkUnlinkAlbums).mockRejectedValue(new Error('offline'));
  await runBulkUnlink(manager, 'space-1', ['a', 'b']);
  expect(manager.ids.sort()).toEqual(['a', 'b']);
});
```

`albumIn(id)` / `albumOut(id)` are local helpers returning a `SharedSpaceLinkedAlbumDto`-shaped object with `showInTimeline` true/false. `runBulkUnlink(manager, spaceId, ids)` is the action wrapper from Task 10; it must catch a thrown request and treat every id as failed, which is what the last test pins.

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && pnpm exec vitest run src/lib/utils/space-album-folder-dnd.spec.ts src/lib/components/spaces/space-albums-list.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Change `DragPayload` to `{ kind: 'album' | 'folder'; ids: string[] }` and update `writeDragPayload` / `readDragPayload` / `onDropItem` consumers. A single-item drag becomes a one-element array. Add `isAllInTimeline` derivation and the confirm dialogs. On a result, call `applyBulkResult` and re-select exactly `failedIds`. Add the `album_bulk_unlink` branch to `space-activity-feed.svelte` using `spaces_activity_bulk_unlinked_albums`.

- [ ] **Step 4: Run to verify they pass**

Run the same commands. Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
cd web && pnpm run lint && pnpm check:typescript && pnpm check:svelte
cd .. && git add web/src && git commit -m "feat(web): wire space album bulk actions and multi-drag"
```

---

## Phase D — Mobile

### Task 13: The mobile selection provider

**Files:**

- Create: `mobile/lib/providers/spaces/space_album_selection.provider.dart`, `mobile/test/providers/spaces/space_album_selection_provider_test.dart`

**Interfaces:** produces `SpaceAlbumSelection` (`kind`, `ids`, `isEmpty`, `count`) and `SpaceAlbumSelectionNotifier` (`toggle(kind, id)`, `clear()`, `reconcile(ids)`).

Mirrors Task 9's semantics minus ranges (no Shift on mobile).

- [ ] **Step 1: Write the failing tests**

```dart
test('toggling an album selects it', () {
  notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
  final state = container.read(provider);
  expect(state.kind, SpaceAlbumSelectionKind.album);
  expect(state.ids, {'a'});
  expect(state.isEmpty, isFalse);
});
test('selecting a folder replaces an album selection', () {
  notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
  notifier.toggle(SpaceAlbumSelectionKind.album, 'b');
  expect(container.read(provider).ids.length, 2);      // positive control
  notifier.toggle(SpaceAlbumSelectionKind.folder, 'f');
  expect(container.read(provider).kind, SpaceAlbumSelectionKind.folder);
  expect(container.read(provider).ids, {'f'});
});
test('toggling the last item empties the selection', () {
  notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
  expect(container.read(provider).isEmpty, isFalse); // positive control
  notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
  final state = container.read(provider);
  expect(state.isEmpty, isTrue);
  expect(state.kind, SpaceAlbumSelectionKind.none);
});
// E-5
test('reconcile drops ids that no longer exist', () {
  notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
  notifier.toggle(SpaceAlbumSelectionKind.album, 'b');
  notifier.reconcile({'b'});
  expect(container.read(provider).ids, {'b'});
});
// E-17: selection is page state, so it survives a rebuild.
test('selection survives a provider rebuild', () {
  notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
  container.refresh(someUnrelatedProvider);
  expect(container.read(provider).ids, {'a'});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/flutter test test/providers/spaces/space_album_selection_provider_test.dart`
Expected: FAIL — file not found.

- [ ] **Step 3: Implement the provider** following the shape of `mobile/lib/providers/timeline/multiselect.provider.dart`.

- [ ] **Step 4: Run to verify they pass.** Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/dart analyze --fatal-infos lib test
~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/dart format lib/providers/spaces/space_album_selection.provider.dart test/providers/spaces/space_album_selection_provider_test.dart
cd .. && git add mobile/lib/providers/spaces mobile/test/providers/spaces
git commit -m "feat(mobile): add the space album selection provider"
```

---

### Task 14: Mobile gestures, selection AppBar and the PopScope

**Files:** modify `mobile/lib/pages/library/spaces/space_albums.page.dart`, `mobile/test/presentation/pages/space_albums_page_test.dart`

**This is the task with the cross-feature hazard.** The page's folder-vanished self-pop calls `context.maybePop()` (`space_albums.page.dart:221`), which a `PopScope` can absorb — and `trySelfPop` clears its guard flag before `maybePop` resolves, so a refused pop leaves a visible dead page. Two rules keep them apart:

1. The `PopScope` is inert unless a selection exists: `canPop: selection.isEmpty`.
2. The folder-vanished listener clears the selection **first**, so `canPop` is true by the time `maybePop` runs.

**Do not modify the self-pop logic itself.**

- [ ] **Step 1: Write the failing tests**

```dart
// S-14, S-15
// S-14
testWidgets('long-press enters selection mode with that album selected', (tester) async {
  await pumpSpaceAlbumsPage(tester, albums: [album('a'), album('b')], canManage: true);
  await tester.longPress(find.byKey(const Key('space-album-card-a')));
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('space-album-selection-bar')), findsOneWidget);
  expect(find.text('1'), findsOneWidget);
  expect(openedAlbumIds, isEmpty); // long-press must not also open the album
});

// S-15
testWidgets('tap toggles a second album once selection mode is active', (tester) async {
  await pumpSpaceAlbumsPage(tester, albums: [album('a'), album('b')], canManage: true);
  await tester.longPress(find.byKey(const Key('space-album-card-a')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('space-album-card-b')));
  await tester.pumpAndSettle();
  expect(find.text('2'), findsOneWidget);
  expect(openedAlbumIds, isEmpty); // tap must not navigate while selecting
});

// S-3 on mobile
testWidgets('tap with no selection opens the album', (tester) async {
  await pumpSpaceAlbumsPage(tester, albums: [album('a')], canManage: true);
  await tester.tap(find.byKey(const Key('space-album-card-a')));
  await tester.pumpAndSettle();
  expect(openedAlbumIds, ['a']);
  expect(find.byKey(const Key('space-album-selection-bar')), findsNothing);
});

// S-10 on mobile
testWidgets('long-press does nothing when canManage is false', (tester) async {
  await pumpSpaceAlbumsPage(tester, albums: [album('a')], canManage: false);
  await tester.longPress(find.byKey(const Key('space-album-card-a')));
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('space-album-selection-bar')), findsNothing);
});

// S-16
testWidgets('back exits selection before popping', (tester) async {
  // enter selection, press back, assert page still displayed AND selection empty
  // press back again, assert the page popped
});

// S-16a / E-21 — the interaction guard.
testWidgets('the selection PopScope does not veto the folder-vanished self-pop', (tester) async {
  // push root -> A(folderA) with a selection active on A
  // emit a folder list without folderA
  // assert A left the stack
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/flutter test test/presentation/pages/space_albums_page_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implement** the long-press/tap routing, the selection `AppBar`, and the `PopScope` with `canPop: selection.isEmpty`. Add the selection clear at the top of the existing vanished-folder `ref.listen` callback, above the self-pop scheduling.

- [ ] **Step 4: Run to verify they pass.** Expected: PASS.

- [ ] **Step 5: Prove the interaction test is real**

Remove the "clear selection first" line, re-run, capture the S-16a failure, restore it. Without that evidence the test could pass for the wrong reason — a page that pops for any reason satisfies a naive assertion. Record the output in the report.

- [ ] **Step 6: Gates and commit**

```bash
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/dart analyze --fatal-infos lib test
~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/dart format lib/pages/library/spaces/space_albums.page.dart test/presentation/pages/space_albums_page_test.dart
cd .. && git add mobile && git commit -m "feat(mobile): add multi-select gestures and selection bar to space albums"
```

---

### Task 15: Mobile bulk actions

**Files:** modify `mobile/lib/pages/library/spaces/space_albums.page.dart`, its test file, and the space album actions provider.

- [ ] **Step 1: Write the failing tests**

```dart
// S-17
testWidgets('confirming bulk unlink calls the bulk endpoint once for the whole batch', (tester) async {
  await pumpSpaceAlbumsPage(tester, albums: [album('a'), album('b')], canManage: true);
  await selectAlbums(tester, ['a', 'b']);
  await tester.tap(find.byKey(const Key('space-album-selection-unlink')));
  await tester.pumpAndSettle();
  // One confirm dialog for the batch, naming the count.
  expect(find.textContaining('2'), findsWidgets);
  await tester.tap(find.byKey(const Key('space-album-bulk-unlink-confirm')));
  await tester.pumpAndSettle();
  verify(() => api.bulkUnlinkAlbums(spaceId, {'a', 'b'})).called(1);
});

// S-18 / S-19
testWidgets('the timeline action resolves toward include for a mixed selection', (tester) async {
  await pumpSpaceAlbumsPage(
    tester,
    albums: [album('a', showInTimeline: true), album('b', showInTimeline: false)],
    canManage: true,
  );
  await selectAlbums(tester, ['a', 'b']);
  expect(find.text('space_album_bulk_add_to_timeline'), findsOneWidget);
  await tester.tap(find.byKey(const Key('space-album-selection-timeline')));
  await tester.pumpAndSettle();
  verify(() => api.bulkSetAlbumTimeline(spaceId, {'a', 'b'}, showInTimeline: true)).called(1);
});

testWidgets('the timeline action offers removal when every album is already included', (tester) async {
  await pumpSpaceAlbumsPage(
    tester,
    albums: [album('a', showInTimeline: true), album('b', showInTimeline: true)],
    canManage: true,
  );
  await selectAlbums(tester, ['a', 'b']);
  expect(find.text('space_album_bulk_remove_from_timeline'), findsOneWidget);
});

// S-24
testWidgets('a partial failure keeps exactly the failed albums selected', (tester) async {
  when(() => api.bulkUnlinkAlbums(any(), any())).thenAnswer(
    (_) async => [
      BulkIdResponseDto(id: 'a', success: true),
      BulkIdResponseDto(id: 'b', success: false, error: BulkIdErrorReason.no_permission),
    ],
  );
  await pumpSpaceAlbumsPage(tester, albums: [album('a'), album('b')], canManage: true);
  await selectAlbums(tester, ['a', 'b']);
  expect(find.text('2'), findsOneWidget); // positive control
  await tester.tap(find.byKey(const Key('space-album-selection-unlink')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('space-album-bulk-unlink-confirm')));
  await tester.pumpAndSettle();
  expect(container.read(spaceAlbumSelectionProvider).ids, {'b'});
  expect(find.textContaining('space_album_bulk_partial_failure'), findsOneWidget);
});

// S-20
testWidgets('bulk move places every selected album in the folder', (tester) async {
  await pumpSpaceAlbumsPage(tester, albums: [album('a'), album('b')], folders: [folder('f')], canManage: true);
  await selectAlbums(tester, ['a', 'b']);
  await tester.tap(find.byKey(const Key('space-album-selection-move')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('space-album-folder-picker-f')));
  await tester.pumpAndSettle();
  verify(() => api.bulkSetAlbumFolder(spaceId, {'a', 'b'}, folderId: 'f')).called(1);
});
```

- [ ] **Step 2: Run to verify they fail.** Expected: FAIL.

- [ ] **Step 3: Implement** the action handlers calling the generated Dart bulk client, one confirm dialog per batch (reusing the existing `AlertDialog` shape at `space_albums.page.dart:752`), and the partial-failure re-selection.

- [ ] **Step 4: Run to verify they pass.** Expected: PASS.

- [ ] **Step 5: Full mobile suite, gates and commit**

```bash
cd mobile && ~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/flutter test
~/.local/share/mise/installs/aqua-flutter-flutter/3.44.8/flutter/bin/dart analyze --fatal-infos lib test
cd .. && git add mobile && git commit -m "feat(mobile): wire space album bulk actions"
```

---

## Self-Review

### Scenario coverage (all 34)

| Scenario                | Task   |
| ----------------------- | ------ |
| S-1, S-2, S-3           | 11     |
| S-4, S-5, S-7, S-8      | 9      |
| S-6                     | 9, 11  |
| S-9, S-9a, S-9b         | 11     |
| S-10                    | 11     |
| S-11, S-12              | 9      |
| S-13                    | 11     |
| S-14, S-15, S-16, S-16a | 13, 14 |
| S-17                    | 15     |
| S-18, S-19              | 12, 15 |
| S-20                    | 15     |
| S-21                    | 5, 6   |
| S-22, S-23              | 12     |
| S-24, S-25, S-26        | 10, 15 |
| S-27, S-28, S-29, S-30  | 5      |
| S-31                    | 3      |

### Edge-case coverage (all 23)

| Edge case  | Task                          |
| ---------- | ----------------------------- |
| E-1        | 11                            |
| E-2        | 1, 5                          |
| E-3        | 3                             |
| E-4        | 3                             |
| E-5        | 9, 13                         |
| E-6        | 11                            |
| E-7, E-8   | 9                             |
| E-9, E-10  | 4, 6                          |
| E-11, E-12 | 4, 6                          |
| E-13       | n/a — no bulk create in scope |
| E-14       | 9                             |
| E-15       | 11                            |
| E-16       | 1 (`.max(1000)`)              |
| E-17       | 13                            |
| E-18       | 14                            |
| E-19       | 10                            |
| E-20       | 3                             |
| E-21       | 14                            |
| E-22, E-23 | 11                            |

### Known deviations from the spec

- **`.max(1000)` on the request schemas** means a selection above 1000 returns 400 rather than succeeding, which narrows E-16's "one request, no chunking". Raise or remove the cap if unbounded selections are wanted.
- **§6.4's one-activity-row-per-batch** costs more than the spec implied: a new `SharedSpaceActivityType`, a feed renderer branch, and a plural string in all ten locales. Planned as specified (Tasks 3, 8, 12), following the existing `person_merge` precedent which already renders `{name, count, personName}`.
