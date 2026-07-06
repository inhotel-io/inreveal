# Support of stacked photos in Spaces — Design

- **Discussion:** [open-noodle/gallery #751 — "Support of stacked photos in Spaces"](https://github.com/open-noodle/gallery/discussions/751)
- **Date:** 2026-07-06
- **Base branch:** `space-albums-onto-main` (HEAD `92ed82afb6`)
- **Status:** Approved design, ready for implementation plan

## Problem

When a photo **stack** (RAW+JPEG, burst) is added to a shared **Space**, only the stack's
primary (cover) frame becomes a member. Worse, if the user later promotes a different frame
to primary, the stack disappears from the Space entirely — neither the old nor the new
primary is shown.

### Root cause

Two facts in the code are **independent of each other**, and their mismatch is the bug:

1. **Direct Space membership is per-asset-id.** `SharedSpaceService.addAssets`
   (`server/src/services/shared-space.service.ts:571`) inserts exactly the asset ids passed
   into `shared_space_asset` — no stack expansion
   (`SharedSpaceRepository.addAssets`, `server/src/repositories/shared-space.repository.ts:322`).
   Because the timeline UI collapses stacks, a user adding a stack only ever sends the **cover
   id**, so only the cover becomes a member.

2. **The Space timeline collapses stacks by the _global_ primary**, not by what's in the Space.
   The Space timeline query filters to `visibility = Timeline` and drops any asset where
   `stack.primaryAssetId != asset.id` (`server/src/repositories/asset.repository.ts:1389`, and
   the count builder at `:325`). This is keyed on **global** stack membership and is a separate,
   ANDed `.$if(...)` clause — completely independent of the Space-membership filter.

Promoting a new primary only writes `stack.primaryAssetId` (`stack.service.ts` →
`stack.repository.ts`); it touches **no** `shared_space_asset` rows. So:

| Step | Old primary | New primary |
|------|-------------|-------------|
| Stack added to Space | ✅ member, ✅ is global primary → **shows** | ❌ not a member |
| User promotes new primary | ✅ still member, but now ❌ non-primary → **dropped by stack filter** | ✅ now global primary, but ❌ not a member → **dropped by Space filter** |

→ neither shows. This reproduces the discussion word-for-word.

### Membership model on this base (`space-albums-onto-main`)

An asset is visible in a Space via a **3-way union**, centralized in
`server/src/utils/shared-space-album-scope.ts` → `spaceAssetPathBranches(eb, …)`:

1. **Direct** — `shared_space_asset` (asset id). _This is the path #751 is about._
2. **Library** — `shared_space_library` (by `asset.libraryId`).
3. **Album (new)** — `shared_space_album` (`spaceId`, `albumId`, `showInTimeline`) → assets
   by-reference via `album_asset`. No copy into `shared_space_asset`.

Critically, the direct path is **structurally identical to `main`** (still per-asset-id, still
zero stack awareness), and the Space filter and the `withStacked` stack-collapse filter are
still separate, ANDed `.$if` calls. The core bug and its fix are therefore unchanged by the
albums work; only line numbers moved.

## Goals

- Adding a stack to a Space (via the direct add-to-space action) puts **all of the stack's
  frames** into the Space, so it collapses to its cover exactly like the main timeline: correct
  stack-count badge, tap-in shows every frame, and promoting any frame to primary "just works"
  because every frame is already a member.
- Removing a stack from a Space removes **all** of its frames.
- The Space timeline renders the stack **collapsed to its cover** on every surface — server,
  web, and mobile.

## Non-goals (explicitly out of scope)

- **Album-path stack completeness.** If a user _links an album_ that itself contains only a
  stack's cover (because adding a stack to an album adds only the cover — longstanding upstream
  album behavior), the Space shows a partial stack via the album path. Fixing that means
  changing upstream album-stacking semantics, far outside #751. We fix the **direct
  add-to-space path** only. (The _display_ collapse fix still benefits album-linked stacks for
  free, since the timeline unions all paths before collapsing.)
- **Space-album _detail_ view collapse.** The per-album detail view inside a Space intentionally
  does **not** collapse stacks — it mirrors normal album behavior (web `album-filter-options.ts`
  never sets `withStacked`; the space-album detail page shows every frame). We keep it that way
  on all platforms.
- **Reconciling membership when a stack's composition changes _after_ it's in a Space**
  (re-stacking, adding a frame to an in-Space stack). MVP scope — see Accepted Limitations.
- **Backfilling existing partial stacks** already in Spaces. MVP scope — see Accepted Limitations.

## Design decisions (locked)

| Decision | Choice |
|---|---|
| Target behavior | Whole stack lives in the Space (the discussion's "Better" ask; subsumes "Minimum") |
| Where expansion happens | **Server-side only** — single source of truth for web, mobile, and CLI |
| Sync depth | Expand on **add and remove only** (MVP) |
| Platforms | Server + web + mobile |
| Legacy data | **No backfill migration** |
| Remove semantics | Removing any frame of a stack removes the **whole stack** from the Space |

## Detailed design

### 1. Server — stack-closure expansion (the load-bearing change)

Introduce a small, isolated, testable unit that expands a set of asset ids to include their
stack siblings, and wire it into the direct add/remove paths. No schema change.

**Add-time expansion (`SharedSpaceService.addAssets`, `shared-space.service.ts:571`)**

- After the existing role/permission checks, expand `dto.assetIds` to the stack closure via a
  new repository query, producing `expandedAssetIds`.
- **RBAC filter on the auto-pulled siblings:** only expand to siblings that are
  **`ownerId = auth.user.id`**, **`visibility = Timeline`**, and **`deletedAt IS NULL`**. The
  owner restriction guarantees the adder already has `AssetRead` on every expanded id (stacks
  are single-owner), so no additional permission check is needed and there is no throw risk;
  the visibility/deleted filters prevent pulling Archived/Hidden/Locked/trashed frames into a
  shared Space (aligned with the in-flight #753/#754 RBAC hardening). Explicitly-selected seed
  ids are always retained even if they are not timeline-visible — only the _auto-pulled
  siblings_ are filtered.
- Use `expandedAssetIds` for **both** the `shared_space_asset` insert **and** the
  `SharedSpaceFaceMatch` job fan-out (`:590`), so faces are matched on all added frames. The
  activity-log `count` continues to reflect `inserted.length` (newly-inserted rows only).

**Remove-time expansion (`SharedSpaceService.removeAssets`, `shared-space.service.ts:761`)**

- Expand `dto.assetIds` to the sibling frames of the same stack(s) that are **direct members of
  this Space**, producing `expandedAssetIds`. (Space-scoped rather than owner-scoped: any editor
  curating the Space should be able to remove the whole stack; the existing delete is already
  `spaceId`-scoped so passing extra non-member ids is a harmless no-op.)
- Use `expandedAssetIds` for the delete (`:768`), the thumbnail-reset check (`:775`), and the
  face-orphan computation `getAssetIdsWithoutOtherSpacePath` (`:788`). Because the three
  membership paths are independent, a frame still visible via a linked album correctly **stays**
  visible after its direct row is removed — `getAssetIdsWithoutOtherSpacePath` already accounts
  for this.

**Repository queries** (`shared-space.repository.ts` or `stack.repository.ts` — placement TBD in
the plan, following the existing helper-module pattern):

- Add path: `getOwnedTimelineStackSiblingIds(userId, assetIds) → assetId[]` — sibling ids
  sharing a non-null `stackId` with any seed, filtered to `ownerId = userId`,
  `visibility = Timeline`, `deletedAt IS NULL`. The service unions the result with the original
  seed ids.
- Remove path: `getStackSiblingIdsInSpace(spaceId, assetIds) → assetId[]` — sibling ids sharing a
  stack with any seed that are current direct members (`shared_space_asset`) of `spaceId`.

**No change needed** to `queueBulkAdd` / `bulkAddUserAssets` (`:598` / repo `:303`): it already
inserts _all_ of a user's timeline-visible assets, so stacks are naturally whole there.

### 2. Web — no code change expected (verify only)

The Space timeline already sends `withStacked: true`
(`web/src/lib/utils/space-filter-options.ts:6`) and collapses on the server query. Once all
frames are members, the cover shows, the badge count becomes **correct** (it was over-counting
before), and tap-to-expand shows every frame. The direct add-to-space action
(`web/src/lib/services/space.service.ts` → `addAssets`) passes the selected cover ids; the
server expands. **Verify** there is no client-side spot that assumed only-the-cover-is-a-member;
none is expected. The space-album _detail_ view stays uncollapsed by design (see Non-goals).

### 3. Mobile — collapse the aggregated-Space timeline (two Drift builders)

The mobile Space timeline is a local Drift query that omits stack-collapse
(`mobile/lib/infrastructure/repositories/timeline.repository.dart`). After the server fix, all
frames sync into local `shared_space_asset`, so without this change mobile would show N flat
tiles.

Add the same collapse the main timeline uses (`mobile/lib/infrastructure/entities/merged_asset.drift`
`stack_id IS NULL OR remote_asset.id = primary_asset_id`) — `LEFT JOIN stack_entity ON stack_id = id`
plus that predicate — to **both** the aggregated-Space asset query and its count query:

| Mobile method | Collapse? |
|---|---|
| `_watchSharedSpaceBucket` (`:452`) — aggregated Space bucket counts | **Yes — add collapse** |
| `_getSharedSpaceBucketAssets` (`:570`) — aggregated Space assets | **Yes — add collapse** |
| `_watchSpaceAlbumBucket` (`:638`) — space-album detail counts | No — leave as-is |
| `_getSpaceAlbumBucketAssets` (`:698`) — space-album detail assets | No — leave as-is |

This keeps parity with web (aggregated Space collapses via `withStacked: true`; album-detail
does not) and with normal album behavior. Tap-to-expand (`asset_stack.provider.dart`) already
fetches stack children by `stackId` globally, so it works unchanged once frames are members.
**Verify** the `shared_space_asset` sync stream propagates the newly-inserted member rows to the
device.

## After-fix behavior walkthrough

With every frame a direct member:

| Step | Behavior |
|------|----------|
| Add stack to Space | All frames inserted; timeline collapses to global primary (a member) → **cover shows**, badge count accurate |
| Promote a new primary | New primary already a member → **shows instantly**; old primary collapsed under it |
| Tap the cover | All frames shown — all are members |
| Remove the stack | All frames removed (unless still visible via a linked album) |

## Accepted limitations (MVP — documented, not silently dropped)

- **Composition drift after add.** If a stack's members change _after_ it's in a Space
  (re-stacking, adding a frame to an in-Space stack), the Space is not auto-reconciled.
  Workaround: re-add the stack.
- **Legacy partial stacks.** Stacks added to Spaces _before_ this change keep only their cover
  as a member until re-added. No backfill migration ships.
- **Album-linked partial stacks** are not completed (see Non-goals).

Both limitations follow directly from the locked decisions (add/remove-only sync depth; no
backfill).

## Testing plan

- **Server unit** — the expansion helper: stack closure correctness; owner + `visibility=Timeline`
  + non-deleted filtering on the add path; space-scoped sibling resolution on the remove path;
  seeds retained. `addAssets`/`removeAssets` call it and feed the expanded set to inserts/deletes,
  face-match jobs, thumbnail-reset, and orphan computation.
- **Server medium (real DB)** — the end-to-end proof: add a stack's cover → all frames become
  `shared_space_asset` members; query the Space timeline → one collapsed cover with correct
  count; promote a different frame to primary → Space still shows the stack; remove one frame →
  all frames gone (but a frame kept alive by a linked album stays).
- **Mobile** — Drift query test for aggregated-Space collapse (mirror the existing main-timeline
  stack test); assert the space-album detail query is unchanged.
- **Web** — light: assert the Space view renders the collapsed cover with the correct count once
  all frames are members.

## Files touched (summary)

- `server/src/services/shared-space.service.ts` — expand in `addAssets` / `removeAssets`.
- `server/src/repositories/shared-space.repository.ts` (and/or `stack.repository.ts`) — new
  stack-closure queries.
- `mobile/lib/infrastructure/repositories/timeline.repository.dart` — collapse in
  `_watchSharedSpaceBucket` and `_getSharedSpaceBucketAssets`.
- Tests: server unit + medium, mobile Drift, web component.
- Docs: user-facing note on the re-add workaround for legacy/drift cases.
