# Space-Albums RBAC Remediation — Implementation Spec (2026-07-11)

> **Source.** Turns the confirmed findings of `SPACE-ALBUMS-RBAC-REVIEW-2026-07-11.md` into an
> implementable, test-first plan. Scope was deliberately trimmed with the maintainer to the three
> real code fixes (**H-1, M-2, M-1**) plus a comprehensive behavioral e2e safety-net for the whole
> space-albums feature. Findings **L-1, L-2, L-3, and M-3 are out of scope** (see §"Deliberately out
> of scope" for the rationale that makes each a non-fix or an operational check, not code).
>
> **Branch.** `fix/space-albums-rbac-review-2026-07-11`, cut from `space-albums-onto-main` @ `b1e9f4628e`,
> in worktree `.claude/worktrees/space-albums-reconsolidate-v302`. Server-only fixes; the e2e slice adds
> web (Playwright) + API specs. One PR into `space-albums-onto-main`.
>
> **Method.** Strict TDD — every slice writes the failing test(s) first, watches them fail for the right
> reason, then implements the minimum to make them green. Line numbers below are HEAD-relative to
> `b1e9f4628e` and **must be re-confirmed before editing** (they have already drifted once from the
> review doc). Anchors were re-verified against HEAD while writing this spec.
>
> **No `Co-Authored-By` / `Generated-with` trailers on any commit.**

---

## Slice overview

| Slice | Finding / goal | Primary files | SQL regen | Test layers |
| --- | --- | --- | --- | --- |
| **S1** | H-1 (HIGH) — caller-proof trash gate on the two `searchAssetBuilder` space arms + service 400 guard | `server/src/utils/database.ts`, `server/src/services/search.service.ts` | ✅ | medium + unit + api-e2e |
| **S2** | M-2 (MED) — `deletedAt IS NULL` on space-member-facing sync **backfill/getCreates** arms | `server/src/repositories/sync.repository.ts` | ✅ | medium (sync) |
| **S3** | M-1 (MED) — Locked album strip made retry-convergent | `server/src/services/asset.service.ts` | ❌ | unit + medium (sync) |
| **S4** | Comprehensive space-albums **behavioral** e2e safety net (link → space/main timeline, viewer show/hide, hide/lock/trash/restore/unlink round-trips) | `e2e/src/specs/server/api/*`, `e2e/src/specs/web/*` | ❌ | api-e2e + web-e2e |
| **S5** | Validation & PR — full gate, `make sql` clean, §6 live-probe run (human), open PR | — | — | — |

**Order rationale.** H-1 → M-2 → M-1 matches the review's recommended fix order. S4 lands after the
three fixes so its trash/hide behavioral assertions are green regression locks (any that fail on the
fixed code reveal a genuine additional gap to fix inside S4). S5 is the human-run validation gate.

---

## Shared conventions (apply to every slice)

- **Server unit tests** (`server/src/**/*.spec.ts`): Vitest with `newTestService()` auto-mocking. Fast,
  mock-level — good for the service 400 guard (S1) and the `asset.service` side-effect assertions (S3).
- **Server medium tests** (`server/test/medium/specs/**`): real Postgres via testcontainers. This is the
  **only** layer that exercises real SQL, so the H-1 `deletedAt` gate (S1) and the M-2 sync arms (S2)
  are proven here. Repos that need registration live in `server/test/medium.factory.ts` (see
  `feedback_medium_factory_repo_registration` — a missing entry throws "Unable to create repository
  instance").
- **API e2e** (`e2e/src/specs/server/api/**`, Vitest against the `make e2e` stack on :2285): behavioral
  HTTP round-trips. Home for the H-1 negative and most of the S4 matrix.
- **Web e2e** (`e2e/src/specs/web/**`, Playwright): UI round-trips for S4.
- **SQL regen.** Any change to a `@GenerateSql`-decorated repository method (S1 `searchAssetBuilder`
  feeds `search.repository.sql`; S2 sync arms feed the sync SQL) requires `make sql` **with a running
  DB** and committing the regenerated `server/src/queries/**`. Never run `make sql` without a DB — it
  deletes all query files (`feedback_make_sql_no_db`).
- **Gates per slice** (run yourself, do not trust a subagent's "green" — `feedback_impl_loop_subagent_gaps_vs_gates`):
  from `server/`: `pnpm test -- --run <touched spec>` then the full `pnpm test`, `pnpm check` (tsc),
  and `make sql` clean (no diff) when repository SQL changed. Defer the single slow full-package eslint
  pass to S5 (`feedback_defer_lint_to_end`).

---

## S1 — H-1: caller-proof trash gate on the two search space arms

### Problem (confirmed)
`searchAssetBuilder` (`server/src/utils/database.ts`) has two space-scoped arms whose *other-members*
branch relies entirely on the terminal, caller-toggleable trash filter at
`database.ts:850` (`.$if(!options.withDeleted, …)`). A space member — **including a read-only Viewer** —
can flip `withDeleted` on (directly, or implicitly via `trashedAfter` / `trashedBefore` / `isOffline`,
each of which sets `withDeleted` at `database.ts:676`) and receive full `AssetResponseDto` rows (id,
checksum, `originalPath`, thumbhash, EXIF incl. GPS, people names) for assets another owner **trashed**
out of the space, for the whole trash-retention window. The album helper `albumSharedSpaceScope` was
already fixed (it ANDs `deletedAt IS NULL` on every disjunct, `database.ts:632/647/658`); these two
sibling arms were never patched.

### Fix — two layers, both required

**Layer 1 — caller-proof SQL gate (load-bearing).** In `searchAssetBuilder`, AND
`eb('asset.deletedAt', 'is', null)` into **only the other-members branch** of each space arm, mirroring
`albumSharedSpaceScope`. Keep the `ownerId IN userIds` branch unfiltered so a caller retains
own/partner trash search.

- `spaceId` arm (~`database.ts:703-706`): the `eb.or([ …ownerId…, spaceVisibilityGate(eb) ])` becomes
  `eb.or([ …ownerId…, eb.and([spaceVisibilityGate(eb), eb('asset.deletedAt', 'is', null)]) ])`.
- `timelineSpaceIds` / `withSharedSpaces` arm (~`database.ts:717-727`): add
  `eb('asset.deletedAt', 'is', null)` inside the existing other-members `eb.and([spaceVisibilityGate(eb),
  …spaceAssetPathBranches… ])`; leave the `ownerId` branch (~`:714`) unfiltered.

**Layer 2 — service 400 guard (defense-in-depth, mirrors `timeBucketChecks`).** In `search.service.ts`,
reject `withDeleted` / `trashedAfter` / `trashedBefore` / `isOffline` with `BadRequestException` when
`spaceId` **or** `withSharedSpaces` is set. Factor a private helper
`rejectTrashParamsForSpaceScope(dto)` and call it from **`searchMetadata`, `searchRandom`,
`searchLargeAssets`, `searchStatistics`, `searchSmart`** — each already opens with the sibling
`if (dto.spaceId && dto.withSharedSpaces) throw` block, so this slots in beside it. Mirror the message
style of `timeBucketChecks` (`timeline.service.ts:144-146`).

Rationale for both: the 400 gives a clean contract and closes the whole class at the door; the SQL gate
makes it caller-proof for any internal caller that sets `withDeleted` without passing the guard, and
satisfies the review's cross-cutting rule — *every asset-scoping arm carries its own `deletedAt` and
never relies on the terminal `:850` gate*.

> **Deliberately NOT doing** the belt-and-braces suggestion to fold `deletedAt` into `spaceVisibilityGate`
> itself — that helper is shared by `getUpdates` and the owner branch where trashed rows must still flow;
> folding it there would break M-2's convergence channel and the owner's own-trash search. Keep the gate
> at the branch, not in the shared helper.

### TDD test plan

Write these first; confirm each fails against HEAD for the stated reason before implementing.

1. **Medium (SQL gate — the load-bearing proof)** — `server/test/medium/specs/utils/shared-space-album-scope-sql.medium.spec.ts`
   (co-locate with the existing album-arm gate tests) **or** `server/test/medium/specs/repositories/search.repository.spec.ts`:
   - Seed: owner **O**, member **V**; space **S**; O owns asset `LIVE` (Timeline, in S) and asset `TRASH`
     (Timeline, in S, then `deletedAt` set). V is a member of S.
   - `spaceId` arm: build `searchAssetBuilder({ spaceId: S, userIds: [V.id], withDeleted: true })` →
     result **contains `LIVE`**, **excludes `TRASH`** (other member's trash). *(Fails at HEAD: `TRASH` present.)*
   - Owner-branch control: same builder with `userIds: [O.id]` and O's own trashed asset → O's **own**
     trash **present** (owner branch stays unfiltered).
   - `timelineSpaceIds` arm: `searchAssetBuilder({ timelineSpaceIds: [S], userIds: [V.id], withDeleted: true })`
     → `LIVE` present, `TRASH` absent.
   - Implicit-flip variants: `{ spaceId: S, userIds: [V.id], trashedAfter: <epoch> }` and `{ …, isOffline: true }`
     and `{ …, trashedBefore: <future> }` each independently exclude `TRASH` (they flip `withDeleted` at `:676`).
2. **Unit (400 guard)** — `server/src/services/search.service.spec.ts`:
   - For each of `searchMetadata / searchRandom / searchLargeAssets / searchStatistics / searchSmart`:
     `{ spaceId }` × `{ withDeleted:true | trashedAfter | trashedBefore | isOffline }` → rejects with
     `BadRequestException`; and `{ withSharedSpaces:true }` × the same 4 → rejects. *(Fails at HEAD: resolves.)*
   - Negative controls (no over-block): `{ spaceId }` with **no** trash param resolves; `{ withDeleted:true }`
     with **neither** `spaceId` nor `withSharedSpaces` (a plain personal-scope search) resolves.
3. **API e2e** — `e2e/src/specs/server/api/shared-space-visibility-negatives.e2e-spec.ts` (extend the
   existing H1 `describe`):
   - As Viewer V, after O trashes a **direct** space asset and an **album-linked** space asset:
     `POST /search/metadata { spaceId, withDeleted:true, withExif:true }` → **400**; same with
     `trashedAfter:"1970-01-01"`, `isOffline:true`, and `withSharedSpaces:true` → **400**.
     Repeat for `/search/random`, `/search/large-assets`, `/search/statistics`, `/search/smart`.
   - Positive control: `POST /search/metadata { spaceId }` (no trash param) still returns the **live** sibling.

### Edge cases to cover
- `withSharedSpaces:true` sweeping **multiple** timeline-enabled spaces at once (the arm scopes by
  `timelineSpaceIds` array) — no other member's trash from any of them.
- A member who has hidden S from their timeline (`member.showInTimeline=false`) is already excluded from
  the `timelineSpaceIds` arm — assert the trash gate does not accidentally re-admit them.
- Owner's own-trash search **outside** a space scope (plain `userId` scope, no `spaceId`/`withSharedSpaces`)
  is unaffected — the 400 guard must not fire and the terminal `:850` gate still governs.
- Mixed request `{ spaceId, albumIds }` — the album arm (`albumSharedSpaceScope`) and the space arm must
  both exclude trash; assert no leak via either.

### Verify
`cd server && pnpm test -- --run src/services/search.service.spec.ts` + the medium SQL spec + `pnpm check`;
`make sql` (DB up) and commit the regenerated `server/src/queries/search.repository.sql`; run the extended
e2e negatives against the `make e2e` stack.

---

## S2 — M-2: `deletedAt IS NULL` on space-member-facing sync backfill/creates

### Problem (confirmed)
The space-member-facing sync arms in `server/src/repositories/sync.repository.ts` gate on
`spaceVisibilityGate(eb)` (visibility ∈ {Timeline, Archive}) and, for album arms, `album.deletedAt IS NULL`,
but **not `asset.deletedAt IS NULL`**. Selected columns include `checksum`, `thumbhash`,
`originalFileName`, `latitude/longitude/city` and full EXIF. When owner O trashes an asset and then a
**new** member N joins (or an album is newly linked), N's initial **backfill** streams the trashed asset's
metadata + a reconstructable thumbhash + GPS into N's Drift DB — data N can obtain through **no** REST
surface post-H1. Sync-side sibling of H-1. (No bytes leak — original/preview fetch is separately gated;
this is metadata + thumbhash, hence MEDIUM.)

### Fix — rule + arm inventory
**Rule:** every space-member-facing **backfill** and **getCreates** *content* arm ANDs
`.where('asset.deletedAt', 'is', null)`. **`getUpdates` / `getUpserts` convergence arms are never
filtered** — that is precisely how an already-synced device learns to hide/purge a newly-trashed asset
(the `asset.updateId` bump rides `getUpdates` through; filtering it would strand a stale visible copy).

**Content arms to gate** (carry metadata/thumbhash/EXIF — the real leak), add unconditional
`asset.deletedAt IS NULL`:
- `SharedSpaceAssetSync.getBackfill` (~`:1003`), `.getCreates` (~`:1029`)
- `SharedSpaceAssetExifSync.getBackfill` (~`:1072`), `.getCreates` (~`:1084`)
- `SharedSpaceAlbumAssetSync.getBackfill` (~`:1708`), `.getCreates` (~`:1755`)
- `SharedSpaceAlbumAssetExifSync.getBackfill` (~`:1774`), `.getCreates` (~`:1805`)

**Library arms** — add `asset.deletedAt IS NULL` **to the non-owner branch only**, preserving the owner's
own-library trash sync. The branch is `eb.or([eb('asset.ownerId','=',userId), spaceVisibilityGate(eb)])`
→ becomes `eb.or([eb('asset.ownerId','=',userId), eb.and([spaceVisibilityGate(eb), eb('asset.deletedAt','is',null)])])`:
- `LibraryAssetSync.getBackfill` (~`:1293`), `LibraryAssetExifSync.getBackfill` (~`:1404`).

**Link-row arms** (metadata-light: only `assetId`/`albumId`/`spaceId`/`updateId`) — gate **backfill** for
consistency (a new member shouldn't even learn a trashed asset is linked); leave their **`getUpserts`**
(convergence) unfiltered:
- `SharedSpaceToAssetSync.getBackfill` (~`:1122`), `SharedSpaceAlbumToAssetSync.getBackfill` (~`:1619`).

> Every listed arm already `.innerJoin('asset', …)` (or joins `asset` alongside `asset_exif`), so
> `asset.deletedAt` is in scope — re-confirm each join before adding the predicate.

### TDD test plan
Home: the existing sync medium specs — `server/test/medium/specs/sync/shared-space-album-asset-sync.spec.ts`,
`…-exif-sync.spec.ts`, `sync-library-asset.spec.ts`, and add a direct-arm case (new file
`shared-space-asset-sync.spec.ts` if none exists, else extend the nearest).

1. **Backfill excludes trashed (the leak, TDD-red first)** — per content arm: seed a space/album, add an
   asset, **trash it**, then **add a new member** (or newly link the album), run that arm's `getBackfill`
   → assert **zero rows** for the trashed asset; a live sibling in the same album/space → **present**.
   *(Fails at HEAD: trashed row present.)*
2. **getCreates excludes trashed** — asset created, then trashed such that its create-side row is fresh
   past the checkpoint → `getCreates` yields **no** trashed row.
3. **getUpdates STILL delivers trashed (convergence guard — must stay green)** — existing member already
   synced the live asset; O trashes it; `getUpdates` for that member **includes** the now-trashed row
   (deletedAt set) so the device can purge. Assert present. *(Green at HEAD and after fix — locks the
   invariant that we did not over-filter.)*
4. **Library non-owner vs owner** — owner's own trashed library asset **still** appears in
   `LibraryAssetSync.getBackfill` for the owner (owner branch unfiltered); a member's non-owner backfill
   excludes it.

### Edge cases
- **Restore after trash converges** — trash → (backfill now skips) → restore (bumps `updateId`) → a
  subsequent `getCreates`/backfill for a fresh member includes the restored live asset. No permanent
  starvation.
- **Exif arm parity** — the EXIF sibling of each content arm must exclude the trashed asset's EXIF
  (GPS is the sensitive datum); assert on `asset_exif` rows, not just the asset row.
- **Album soft-delete interaction** — a trashed asset in a *soft-deleted* album stays excluded (both
  `album.deletedAt` and now `asset.deletedAt` gates apply; no double-count / no accidental re-admit).
- **`getBackfill` for a space with a mix** — trashed + live + Hidden + Archive assets → only Timeline/Archive
  *non-trashed* rows stream.

### Verify
`cd server && pnpm test -- --run <touched sync specs>` + full `pnpm test` + `pnpm check`; `make sql`
(DB up) and commit regenerated sync query SQL.

---

## S3 — M-1: make the Locked album strip retry-convergent

### Problem (confirmed)
In `applyVisibilityTransitionSideEffects` (`server/src/services/asset.service.ts`), the Locked album strip
is gated `lockIds = ids.filter(id => priorVisibilities.get(id) !== AssetVisibility.Locked)` (`:437`). If the
visibility `UPDATE` commits but the process crashes (or `removeAssetsFromAll` throws) **before** the strip
runs, a **retry** re-reads `prior === Locked`, so `lockIds = []` skips `removeAssetsFromAll` **forever**;
and the album purge tombstone is `Hidden`-only (`:450-452`), so it is skipped too. Result: the `album_asset`
row survives, no tombstone is emitted, `SharedSpaceAlbumToAssetSync.getDeletes` delivers nothing → a synced
member's device **durably retains** the asset's bytes/EXIF/album row; and on a later **unlock**,
`emitAlbumAssetVisibilityRestore` bumps the surviving rows and the asset **silently re-shares** to the space,
contradicting the branch's "Locked strips from all albums" semantics. The nightly reconcile is grants-only —
nothing sweeps it.

### Fix
Drop the `prior !== Locked` gate: when `nextVisibility === AssetVisibility.Locked`, call
`this.albumRepository.removeAssetsFromAll(ids)` **unconditionally**.
- Normal lock: strips the rows, fires the `album_asset` delete-audit trigger → tombstone via the
  `album_asset_audit` arm of `SharedSpaceAlbumToAssetSync.getDeletes` (`sync.repository.ts:1632-1655`);
  the album stays space-accessible so the member receives "asset removed from album A".
- Post-crash retry: `removeAssetsFromAll(ids)` deletes the **surviving** rows and fires the tombstone the
  crashed first attempt never sent.
- Already-stripped re-lock: matches **zero** rows → idempotent no-op (one negligible extra DELETE).

> The unconditional strip alone closes the leak (the delete trigger is the tombstone source). We are
> **not** adding the alternative `emitAlbumAssetVisibilityPurge`-for-Locked tombstone — it would fire a
> redundant second tombstone on every lock. It stays documented as the fallback **only** if S5 probe 2
> shows the trigger tombstone is not delivered; if so, add it and a test, otherwise leave it out.

### TDD test plan
1. **Rewrite the pinning unit test** — `server/src/services/asset.service.spec.ts:1388`
   ("removes from albums exactly once (lock-once) …"). It currently asserts
   `expect(mocks.album.removeAssetsFromAll).not.toHaveBeenCalled()` on a re-lock (prior already Locked).
   Flip it: on a re-lock the strip **is** called → `expect(mocks.album.removeAssetsFromAll).toHaveBeenCalledWith(['asset-1'])`.
   Retitle to reflect convergence. *(This is the red step: the current impl leaves it uncalled.)*
2. **Keep the mixed-bulk purge test green** (`:1370`) — unchanged behavior for the direct/library purge
   emits (already unconditional from M3); assert the album strip now fires for the Locked ids in a mixed flip.
3. **Medium convergence test** — extend `server/test/medium/specs/sync/sync-shared-space-album-visibility-purge.spec.ts`:
   member M has album asset A synced; simulate the crash window (apply the visibility `UPDATE` to Locked
   **without** the side effects — i.e. write `visibility=Locked` directly, leaving the `album_asset` row),
   then invoke the real `updateAll`/side-effect path for a re-lock → assert `album_asset` row is deleted and
   M's `SharedSpaceAlbumToAssetSync.getDeletes` yields the delete tombstone for A. *(Fails at HEAD.)*

### Edge cases
- **Unlock-after-recovered-lock does not re-share** — after the fixed re-lock strips the rows, an unlock
  (`emitAlbumAssetVisibilityRestore`) finds **no** surviving `album_asset` rows → the asset does **not**
  re-appear in the space. Assert absence.
- **Multiple albums** — asset in 2+ linked albums; `removeAssetsFromAll` clears all; tombstones for each.
- **Asset in no album** — Locked flip on an asset with zero album rows → no-op, no error, no spurious tombstone.
- **Hidden path untouched** — a Hidden transition still emits `emitAlbumAssetVisibilityPurge` (`:450`) and
  does **not** call `removeAssetsFromAll`; assert no regression to the Hidden branch.

### Verify
`cd server && pnpm test -- --run src/services/asset.service.spec.ts` + the medium purge spec + full
`pnpm test` + `pnpm check`. No repository SQL change → **no `make sql`**.

---

## S4 — Comprehensive space-albums behavioral e2e safety net

### Goal
Existing e2e coverage is strong on **structure** (affordance/permission matrix, API RBAC gates,
single-endpoint visibility negatives, sync convergence). The gap — and the maintainer's explicit ask — is
**behavioral round-trips**: does a linked album's photos actually *appear/disappear* across the **space
Photos timeline**, the **member's personal (main) timeline**, the **album view**, and **search**, as
owners/editors/viewers perform the real actions. This slice adds that net. It also serves as the
end-to-end regression lock for S1–S3.

Split by cost: an **API e2e behavioral matrix** carries the exhaustive edge cases (fast, deterministic);
a focused **web Playwright** suite proves the UI surfaces reflect it (the "solid in the UI" confidence).
Reuse existing fixtures/helpers (`e2e/src/specs/server/api/shared-space-album.e2e-spec.ts` fixtures;
`spaces-albums-journey.e2e-spec.ts` role/context setup) — do not rebuild space/album/member scaffolding.

> Two `showInTimeline` toggles exist and mean different things — the spec and tests must keep them
> distinct: **album-level** `shared_space_album.showInTimeline` = "include this album's assets in the
> **space** Photos timeline"; **member-level** `shared_space_member.showInTimeline` = "include this
> space's assets in **my personal/main** timeline". Verified in `shared-space.dto.ts:108/114/133/169`.

### S4a — API e2e behavioral matrix
New spec `e2e/src/specs/server/api/shared-space-album-timeline.e2e-spec.ts` (or extend
`shared-space-album.e2e-spec.ts`). Fixture: owner **O**, editor **E**, viewer **V**, non-member **X**;
space **S**; O owns album **A** with assets; link A → S. Assert **data presence** (asset ids in the
relevant list responses), not just status codes.

1. **Link → space timeline contains album assets.** After `PUT /shared-spaces/S/albums/A`, the space Photos
   timeline (`GET /timeline/buckets?spaceId=S` + `/timeline/bucket`) for V **contains** A's assets.
2. **Album `showInTimeline=false` removes them from the space timeline but not the album view.**
   `PATCH /shared-spaces/S/albums/A { showInTimeline:false }` → A's assets **absent** from the space
   timeline for V, yet `GET /timeline/bucket?albumId=A` (album view) still **returns** them; toggle back
   `true` → reappear in the space timeline.
3. **Member `showInTimeline` gates the personal/main timeline.** With `withSharedSpaces=true`
   (`GET /timeline/buckets?withSharedSpaces=true` as V), A's assets **appear**; after V sets
   `shared_space_member.showInTimeline=false` for S (member self-toggle endpoint), A's assets **disappear**
   from V's main timeline; back to `true` → reappear.
4. **Unlink → assets leave the space timeline.** `DELETE /shared-spaces/S/albums/A` → A's assets absent from
   the space timeline and V loses `GET /albums/A` access (400), while O still owns A directly.
5. **Editor add/remove asset reflects for the viewer.** E adds asset N to A (`PUT /albums/A/assets`) → N
   appears in V's space timeline; E removes N → N disappears for V.
6. **Hide / Lock / restore round-trip (regression lock for the fixed lifecycle).** O sets an A-asset
   `visibility=Hidden` → absent for V across space timeline + `/albums/A` + main timeline + search; restore
   to `Timeline` → **reappears** across all. Repeat for `Locked` (also asserts, post-S3, that a re-lock
   after a simulated first-attempt failure still tombstones — cross-link to the S3 medium test rather than
   duplicating the crash injection here).
7. **Trash round-trip (regression lock for H-1/M-2).** O trashes an A-asset → absent for V across space
   timeline + album view + `POST /search/metadata {spaceId}` and `{withSharedSpaces}` (incl. the `withDeleted`
   / `trashedAfter` / `isOffline` attempts → 400 per S1); restore → reappears.
8. **Positive controls / non-member.** V always sees the **live** A-assets in the space timeline & album
   view (no over-block). X (non-member) sees **none** of S's timeline, album, or search surfaces (403/400).

### S4b — Web (Playwright) UI round-trips
New spec `e2e/src/specs/web/spaces-albums-timeline.e2e-spec.ts`. Keep it focused (Playwright is slow/flaky);
one assertion path per behavior, reusing the journey's role contexts.

1. **Viewer sees linked-album photos in the space Photos tab timeline** — V opens `/spaces/S` (Photos tab),
   the grid shows A's photos; opening a photo lands on the space photo viewer (positive control from the
   journey, extended to assert *presence of the specific asset thumbnails*, not just navigation).
2. **Album `showInTimeline` toggle reflects in the space Photos timeline** — as O/E, toggle A's
   "show in timeline" control → the space Photos grid drops/re-adds A's photos (V's view, or re-login).
3. **Viewer main-timeline show/hide of the space** — V toggles S's "show in my timeline" and the main
   `/photos` timeline gains/loses A's photos.
4. **Owner hides a photo → viewer no longer sees it; restore → viewer sees it again** — the visibility
   round-trip as visible in the viewer's space grid.
5. **Unlink album → viewer's space Albums grid and Photos timeline both drop it.**

> Web-e2e practicalities (`reference_local_web_e2e_runs`, `feedback_e2e_stack_port_2285_vs_dev_2283`):
> Playwright runs against the `make e2e` stack on :2285; a "broken UI" is often a **stale image** — rebuild
> before trusting a failure. Use existing `data-testid` selectors where present; add stable testids rather
> than text selectors for any new assertion target. Role-badge text renders lowercase+CSS-capitalize — use
> `{ ignoreCase:true }` (`feedback_space_role_badge_lowercase_ignorecase`).

### TDD note for S4
These are largely **characterization/regression** tests over behavior that S1–S3 have made correct. Write
each test to the **expected** behavior first and run it: a **green** result locks the behavior; a **red**
result is a genuine additional bug — fix it inside S4 (or, if it belongs to a fix slice's surface, in that
slice) before moving on. Do not weaken an assertion to make it pass.

### Edge cases (S4)
- Album linked to **two** spaces — toggling `showInTimeline` in space S1 does not affect the same album's
  presence in space S2's timeline.
- Asset in **both** a linked album and directly added to the space — hiding via the album path vs. the
  direct path; assert it disappears only per the correct scope and reappears correctly.
- Empty album linked → space timeline unaffected; adding the first asset makes it appear.
- Video asset (spaces exclude videos from `recentAssetIds` per `shared-space.e2e-spec.ts`) — confirm the
  space **timeline** inclusion rule for videos is asserted consistently with product intent.
- Viewer has S **hidden** from their main timeline but still opens the space directly → still sees photos in
  the space Photos tab (member-level `showInTimeline` gates the *main* timeline only, not the space page).

### Verify
Run the API matrix against `make e2e` (`make e2e-api-dev` or the api project) and the web suite via
`make e2e-web-dev`. Rebuild the stack first if any server code from S1–S3 is involved.

---

## S5 — Validation & PR (human-run)

1. **Full local gate** from `server/`: `pnpm test` (all unit + medium), `pnpm check` (tsc), one full
   `pnpm lint` pass (deferred from the slices), and `make sql` producing **no** diff.
2. **e2e**: the extended API negatives + the S4 matrix + web suite green against a **clean stack built from
   this worktree**.
3. **§6 live-probe run** (from the findings doc) against that clean stack — probes **1 (H-1)**, **2 (M-1
   tombstone)**, **3 (M-2 backfill)** must flip leak→clean/tombstone-present; probes 4–8 are re-confirmations.
   **Not impl-loop-automated:** `mise dev` is a machine-wide singleton
   (`reference_mise_dev_singleton_across_worktrees`) — claim the stack, coordinate with any other worktree
   session, do not clobber. If probe 2 shows no tombstone despite S3, add the Locked album purge tombstone
   (see S3 note) and re-run.
4. **PR** into `space-albums-onto-main`. No `Co-Authored-By` / `Generated-with` trailers. Dispatch the
   gating CI set; babysit to green.

---

## Deliberately out of scope (rationale recorded for traceability)

- **M-3 (removed-creator split-brain).** Prospective guard already ships. Residual risk is conditional on a
  pre-guard DB **and** an actually-removed creator; on the small personal/staging fleet the blast radius is
  almost certainly zero. The "repair" migration also *re-grants* a deliberately-removed creator, so it is not
  a pure no-op decision. **Action = a 1-minute operational check, not code** — run the fleet-sizing query
  (Appendix A) against personal + staging; if it returns rows, reopen with a maintainer decision (re-add vs.
  evict, then optionally drop the `createdById` arm). Not implemented here.
- **L-1 (re-timestamped migration, no compat alias).** Availability/ops only, conditional on a DB that booted
  an RC in a ~2-day window recording the old migration name. **Action = check staging/mobile-test
  `kysely_migrations` for the pre-rename name** (Appendix B); add the startup rename only if found. Not a leak.
- **L-2 (`requireRole` fails-open on unknown role).** Not reachable via the API (all role writes go through
  `z.enum(SharedSpaceRole)`); corruption-gated defense-in-depth only. Trimmed by maintainer.
- **L-3 (`albumIds` without `AlbumRead` on 3 search endpoints).** Zero current risk — safe today because those
  endpoints always set `userIds`. Pure latent-fragility hardening against a hypothetical future refactor.
  Trimmed by maintainer.

## Appendix A — M-3 fleet-sizing query (operational, run manually)
```sql
SELECT id FROM shared_space ss
 WHERE NOT EXISTS (SELECT 1 FROM shared_space_member m
                    WHERE m."spaceId" = ss.id AND m."userId" = ss."createdById");
```
Zero rows → document accepted-safe, no code. Rows → reopen M-3 with a maintainer decision.

## Appendix B — L-1 recorded-migration check (operational, run manually)
```sql
SELECT name FROM kysely_migrations
 WHERE name = '1782000000000-AddAlbumSoftDeleteSharedSpaceAlbumTrigger';
```
Any row on staging/mobile-test → add the startup rename to `1782050000000-…` before the migrator runs and
add the old name to `scripts/revert-to-immich.sql`'s DELETE list. No rows → document confirmed-safe.

## Appendix C — §6 live-probe list
The full 8-probe list lives in `SPACE-ALBUMS-RBAC-REVIEW-2026-07-11.md` §6 (same worktree). S5 runs it;
probes 1/2/3 are the leak→clean flips gated by S1/S3/S2 respectively.
