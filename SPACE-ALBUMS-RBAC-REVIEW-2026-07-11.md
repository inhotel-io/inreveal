# Space-Albums RBAC / Security Review — Findings (2026-07-11)

> **What this is.** A third, independent, security-focused review of the branch `space-albums-onto-main`
> at HEAD `b1e9f4628e`, scoped to **role-based access control and asset/metadata leakage**: no file, photo,
> asset, thumbnail, or asset-derived datum (EXIF, faces, map point, activity, search facet) may reach a
> user who should not see it. It re-verifies the two prior passes (the 2026-07-08 comprehensive review +
> PR #759 remediation, captured in `SPACE-ALBUMS-REMEDIATION-REVIEW-2026-07-08.md`) **and** hunts for
> leaks neither prior pass caught.
>
> **Method.** 5 angle-focused finders swept the branch (list/query read scope; people-faces + direct byte
> fetch; sync deltas + mobile parity; write-authz + lifecycle convergence; SQL/migration/trigger integrity
> + surface completeness), each at high reasoning effort. Every raw finding was handed to an independent
> adversarial verifier that had to re-trace the full controller→service→repository→SQL path (not trust the
> reporter) before it could be **confirmed**. A completeness critic then mapped coverage gaps and produced a
> live-probe list. **23 raw findings → 19 CONFIRMED, 1 PLAUSIBLE, 3 REFUTED.** Line numbers are HEAD-relative
> and must be re-confirmed before editing. Static confirmations were **not** dynamically exercised — see
> §6 (no clean stack was available; the `mise dev` singleton was serving another worktree).
>
> **Headline.** The static read-scope and direct-fetch surface is, at HEAD, **tighter than the prior doc
> implies** — `albumSharedSpaceScope` and every `access.repository` space arm are fully `deletedAt`+visibility
> gated, and the completeness sweep found **no unscoped asset-returning surface**. The residual risk is
> concentrated in two places: **(1) one HIGH** — the two `searchAssetBuilder` space arms have a
> caller-toggleable trash gate (a sibling of the fixed prior H1, left unpatched), and **(2) a convergence /
> stale-device cluster** (MEDIUM) that static reading cannot falsify and the test harness never exercises.
> None of this is a reason not to land the branch, but **the HIGH and the two trash-related findings
> (H-1, M-2) should be fixed before production**, and the M10 removed-creator item (M-3) needs an
> operational fleet check + decision.

---

## 1. Severity summary

| Sev | Count | IDs (this review) | Re-opens prior |
| --- | --- | --- | --- |
| **HIGH** | 1 | H-1 | sibling of prior H1 |
| **MEDIUM** | 3 | M-1, M-2, M-3 | M-1↔M3, M-3↔M10 |
| **LOW** | 3 | L-1, L-2, L-3 | — |
| Cleared (refuted / holds) | 16 | see §4, §5 | H1, M1, M2, M4, M6, M7, M8, M9, M11, M12, M13, L1, L3, L4, L5, L7, L8, L11, L18, I1 |

Recommended fix order: **H-1 → M-2 → M-1 → M-3 (fleet check first) → L-2 → L-1 → L-3.**

De-duplication note: the two Locked-transition findings (finder ids F3-1, F4-1) are **one issue** (M-1); the
three removed-creator findings (F5-2, F3-3, F4-3) are **one issue** (M-3), independently confirmed by three
finders. Higher independent-confirmation count = higher confidence, not more findings.

---

## 2. HIGH

### H-1 — Trashed assets of other space members leak through space-scoped search via caller-controlled trash params
- **Finder/verdict:** read-scope F1-1 — **CONFIRMED** (HIGH). Anchors refined by the completeness critic.
- **Files (HEAD):**
  - `server/src/utils/database.ts:688-709` — `searchAssetBuilder` `spaceId` arm (no per-branch `deletedAt`)
  - `server/src/utils/database.ts:710-730` — `searchAssetBuilder` `timelineSpaceIds` (`withSharedSpaces`) arm (no per-branch `deletedAt`)
  - `server/src/utils/database.ts:676` — `trashedAfter`/`trashedBefore`/`isOffline` implicitly flip `withDeleted` on
  - `server/src/utils/database.ts:850` — the terminal, caller-skippable `.$if(!options.withDeleted, …)` trash filter
  - `server/src/services/search.service.ts:130-249` — `searchMetadata`/`searchRandom`/`searchLargeAssets`/`searchStatistics` (no service-level rejection of trash params for space scopes)
  - `server/src/dtos/search.dto.ts:60-66` — `withDeleted` exposed alongside `spaceId`/`withSharedSpaces` with no sibling constraint
  - Generated SQL confirms the gap: `server/src/queries/search.repository.sql` (space arm carries no `deletedAt`)
- **Actor / scenario.** Any space member, **including a read-only VIEWER**. Owner O shares an asset into space S
  (direct add, linked library, or linked album) and then **trashes** it — `deletedAt` is set but the
  `shared_space_asset` / `shared_space_library` / `album_asset` link rows survive trashing (no trigger fires on
  trash). The Viewer calls `POST /search/metadata` with `{ spaceId: S, withDeleted: true, withExif: true,
  withPeople: true }` — or equivalently `trashedAfter`/`trashedBefore`/`isOffline` (each flips `withDeleted` at
  `database.ts:676`), or `withSharedSpaces: true` to sweep **all** timeline-enabled spaces at once. The response
  returns full `AssetResponseDto` rows for every asset O trashed out of the space — **id, checksum, originalPath,
  thumbhash, EXIF including GPS, people names** — for the whole trash-retention window (30 days default). Also
  fires on `POST /search/random`, `/search/large-assets`, `/search/smart`, and `/search/statistics` (trashed-count
  disclosure).
- **Root cause.** The prior H1 remediation moved `asset.deletedAt IS NULL` **inside** `albumSharedSpaceScope`
  (parameter-independent, on every disjunct) and rejected `isTrashed` on the timeline (`timeBucketChecks`,
  `timeline.service.ts:144`) — but never touched the **sibling `spaceId` / `timelineSpaceIds` arms** of
  `searchAssetBuilder`, which still depend entirely on the caller-toggleable terminal `deletedAt` filter at
  `database.ts:850`. This is the exact H1 pattern left unpatched on the two non-helper arms. The `timeBucket`
  twin is **not** affected (`timeBucketChecks` rejects trash for both space-browse and `withSharedSpaces`).
- **Fix.** Mirror the H1 fix on both space arms: AND `eb('asset.deletedAt', 'is', null)` with
  `spaceVisibilityGate` inside the *other-members* branch of each arm (at `:703-706` and `:717-727`), keeping the
  `ownerId IN userIds` branch unfiltered so callers retain own/partner trash search. Defense-in-depth: in
  `search.service.ts`, reject `withDeleted`/`trashedAfter`/`trashedBefore`/`isOffline` with a 400 when `spaceId`
  or `withSharedSpaces` is set (mirror `timeBucketChecks`). Regenerate SQL docs (`make sql`).
- **Tests.** Clone the H1 medium/e2e negatives (`search.service.spec.ts:659`,
  `shared-space-visibility-negatives.e2e-spec.ts:511`) for `{spaceId, withDeleted:true}` and
  `{withSharedSpaces:true, withDeleted:true}` across metadata/random/largeAssets/statistics/smart — assert the
  other member's trashed asset is absent while a live sibling is present. Add coverage for the
  `trashedAfter`/`isOffline` implicit-flip variants.

---

## 3. MEDIUM

### M-1 — Locked-transition album arm is not retry-convergent: a failed strip leaves a durable on-device leak + silent re-share on unlock (re-opens prior M3, album arm only)
- **Finders/verdict:** sync F3-1 **+** writes-lifecycle F4-1 — both **CONFIRMED** (MEDIUM). Same issue, two independent traces.
- **Files (HEAD):** `server/src/services/asset.service.ts:437` (the `prior !== Locked` gate on `lockIds`),
  `asset.service.ts:435-441`, `asset.service.ts:450-453` (album purge tombstone skipped for Locked),
  `asset.service.ts:280`, `server/src/repositories/shared-space.repository.ts:466-484`, pinned-as-intended by
  `server/src/services/asset.service.spec.ts:1388-1397`.
- **Scenario.** Owner Alice has photo P in album A linked to space S; member Bob has already synced P to his phone
  via the space-album sync arms. Alice flips P to **Locked**. The visibility `UPDATE` commits, then the process
  crashes (or `albumRepository.removeAssetsFromAll` throws — DB blip, pod kill) **before** the album strip runs —
  a non-transactional window. On **retry**, `priorVisibilities` now reads `Locked`, so `lockIds = []` skips
  `removeAssetsFromAll` forever (`:437`), and the album tombstone emit is `Hidden`-only so it is skipped too
  (`:450-453`). Consequences: **(1)** the `album_asset` row survives, no `album_asset_audit` tombstone is written,
  `SharedSpaceAlbumToAssetSync.getDeletes` has nothing to deliver, so **Bob's device durably retains P's bytes,
  EXIF and album row** (leak class 6); **(2)** later, when Alice **unlocks** P, `emitAlbumAssetVisibilityRestore`
  bumps the surviving `album_asset` rows and **P silently re-shares into space S to every member**, contradicting
  the branch's documented "Locked strips from all albums" (A8) semantics. Nothing sweeps it — the nightly
  reconcile job is grants-only. Heals only via a manual unlock → re-lock cycle or a full device resync.
- **Root cause.** The M3 remediation made the direct/library purge **emits** unconditional-and-idempotent, but
  left the fourth side effect — the Locked album **strip** (`removeAssetsFromAll`) — on the old `prior !== Locked`
  "lock-once" gate, and kept the album purge tombstone `Hidden`-only. The review's own parenthetical ("For
  Locked, the album strip is equally non-retryable") was never addressed; the unit test at `:1388` pins the
  non-convergent behavior as correct.
- **Fix.** Drop the prior-visibility gate on the strip: when `nextVisibility === Locked`, call
  `removeAssetsFromAll(ids)` **unconditionally** (an already-stripped asset matches zero rows — an idempotent
  no-op; the failed-first-attempt case deletes the surviving rows and fires the delete-audit trigger). Belt-and-
  braces: also emit `emitAlbumAssetVisibilityPurge` for Locked (idempotent tombstone). Update `asset.service.spec.ts:1388`
  to assert `removeAssetsFromAll` **is** called on a re-lock; add a `sync-space-visibility-purge-cross-path`-style
  medium test for `prior=Locked` + album arm.

### M-2 — Sync backfill streams TRASHED assets (full metadata, thumbhash, checksum, GPS EXIF) to newly-joined members (sync-side sibling of H1)
- **Finder/verdict:** sync F3-2 — **CONFIRMED** (MEDIUM).
- **Files (HEAD):** `server/src/repositories/sync.repository.ts:1690-1710` (`SharedSpaceAlbumAssetSync.getBackfill`),
  `:1764-1776` (`…ExifSync.getBackfill`), `:987-1005`, `:1278-1295` (direct + library backfill arms),
  `server/src/database.ts:519-538`, `:609-636` (`spaceVisibilityGate`).
- **Scenario.** Owner O trashes photo X in album A linked to space S (trash removes X from every REST read surface
  post-H1). O then invites a **new** member N. N's initial per-album backfill runs: `getBackfill` filters
  `album.deletedAt IS NULL` and `spaceVisibilityGate` (visibility ∈ timeline/archive) but has **no
  `asset.deletedAt IS NULL`** predicate, and the selected columns include `deletedAt, checksum, thumbhash,
  originalFileName, latitude/longitude/city`. N's Drift DB now permanently holds the trashed photo's filename,
  a reconstructable thumbhash preview, and its GPS — **data N could never obtain through any REST surface at
  HEAD**. The mobile UI hides it (`deletedAt.isNull()` filters) but `POST /api/sync/stream` returns the JSON
  directly, so no device forensics are needed. The direct arm (`SharedSpaceAssetSync`/`ToAssetSync.getBackfill`)
  and the non-owner library arm (`LibraryAssetSync.getBackfill`) have the identical gap.
- **Root cause.** `spaceVisibilityGate` encodes only visibility ∈ {timeline, archive}; H1 added `deletedAt IS
  NULL` to the REST scopes but never to the sync arms. This is upstream-parity behaviour (upstream
  `AlbumAssetSync.getBackfill` also streams trashed assets to `album_user` shares, relying on client-side
  hiding) — but the fork's own H1 finding reclassified trashed-asset metadata reaching a space member as a leak
  and closed it on REST, leaving **sync** as the one surface still delivering it, including to members who joined
  *after* the trash.
- **Fix.** Add `asset.deletedAt IS NULL` to the space-member-facing **backfill / getCreates** arms
  (`SharedSpaceAlbumAssetSync`/`ExifSync`, `SharedSpaceAlbumToAssetSync`, `SharedSpaceAssetSync`/`ExifSync` +
  `ToAssetSync`, and the non-owner branch of `LibraryAsset(Exif)Sync`), or fold it into `spaceVisibilityGate`
  with an owner-stream opt-out. **Keep `getUpdates` delivering trashed rows to *existing* members** — that is how
  their devices learn to hide/purge the asset (restore convergence rides the `asset.updateId` bump); filtering
  updates would leave a stale visible copy, which is worse. Add a medium test: trash asset → add member → run
  backfill → assert zero rows.
- **Note.** No **bytes** leak (original/preview fetch is separately gated and denies trashed via H1); this is
  metadata + thumbhash only. That, plus upstream-parity, is why it is MEDIUM not HIGH.

### M-3 — Removed-creator sync split-brain on already-deployed DBs (re-opens prior M10; three-finder confirmation)
- **Finders/verdict:** sql-integrity F5-2 **+** sync F3-3 **+** writes-lifecycle F4-3 — all **CONFIRMED**. F5-2/F3-3
  rate it MEDIUM (live leak if such a DB exists); F4-3 frames it INFO because the residual is **de-scoped by an
  explicit documented decision** and prospectively closed. Net: **MEDIUM, conditional on an operational fleet check.**
- **Files (HEAD):** `server/src/utils/shared-space-album-scope.ts:90-101` (the immutable `createdById` union in
  `accessibleSpaces`), `server/src/schema/functions.ts:407-414` (`user_has_library_path` branch 3),
  `functions.ts:545-554` (`user_has_album_path` branch 3), `server/src/services/shared-space.service.ts:472-478`
  (remove-creator guard), `:597-602` (demote-creator guard).
- **Scenario.** On any DB deployed **before** this branch's creator guard shipped (the whole netcup fleet ran
  v5.0.0-rc space-albums builds without it), a promoted co-Owner removed (or demoted-then-removed) the space
  creator C. After upgrading to this branch, C's phone still satisfies `accessibleSpaces` via the
  `shared_space.createdById` union — independent of membership — so **every** fork sync stream keeps delivering
  S's new photos, EXIF, album/link rows to C **forever**, and C's `shared_space_album_user`/`library_user` grants
  survive every revocation trigger and the reconcile sweep via `user_has_*_path` branch 3. The members list shows
  C as **not a member**; no content-revocation delta is ever emitted. The vulnerable data state is **creatable
  today** on every deployed build (main has the union and no guard), then frozen in place by the upgrade.
- **Root cause.** The rbac-4 plan required both (a) forbidding creator removal/demotion **and** (b) dropping the
  `createdById` arm (or repairing existing DBs). HEAD ships **(a) only** — prospective guards, fail-closed on a
  missing space row — and keeps the `createdById` arms. No repair migration or startup sweep exists in
  `migrations-gallery/` or the service bootstrap.
- **Fix (accepted-risk unless a fleet DB is affected).** First **size the blast radius** on the personal/staging
  DBs:
  ```sql
  SELECT id FROM shared_space ss
   WHERE NOT EXISTS (SELECT 1 FROM shared_space_member m
                      WHERE m."spaceId" = ss.id AND m."userId" = ss."createdById");
  ```
  If any row is affected, ship the one-off repair as a fork migration / startup sweep:
  ```sql
  INSERT INTO shared_space_member ("spaceId", "userId", role)
  SELECT id, "createdById", 'owner' FROM shared_space ss
   WHERE NOT EXISTS (SELECT 1 FROM shared_space_member m
                      WHERE m."spaceId" = ss.id AND m."userId" = ss."createdById");
  ```
  restoring the creator-is-always-a-member invariant the guards now assume — after which the `createdById` arms
  become provably redundant and can be dropped. Document which invariant the code rests on.

---

## 4. LOW

### L-1 — Re-timestamped `AlbumSoftDelete` trigger migration ships with no compatibility alias (boot-availability hazard, PLAUSIBLE)
- **Finder/verdict:** sql-integrity F5-1 — **PLAUSIBLE** (LOW). Code-level mechanism is certain; whether any
  affected DB *exists* cannot be determined from the repo.
- **Files (HEAD):** `server/src/schema/migrations-gallery/1782050000000-AddAlbumSoftDeleteSharedSpaceAlbumTrigger.ts:1`,
  `server/bin/sync-gallery-migrations.mjs:6` (`compatibilityAliases` still holds only the `ChangeDurationToInteger`
  entry), `scripts/revert-to-immich.sql:369`.
- **Scenario.** Commit `860dd535ef` (2026-07-10) renamed the migration from `1782000000000` to `1782050000000` to
  resolve a timestamp collision. Any persistent DB that booted an RC image of this branch built in the ~2-day
  window between `261c240cad` (2026-07-08) and `860dd535ef^` recorded the **old** name in `kysely_migrations`.
  Upgrading such a DB to HEAD makes Kysely find a recorded migration name with no matching file → **hard boot
  failure** until manual `kysely_migrations` surgery. Secondary: `revert-to-immich.sql` step-8 DELETE list only
  carries the new name, so reverting such a DB to upstream Immich strands the old-name row. Not a data leak —
  availability/ops only.
- **Fix.** Either (a) confirm no surviving DB ran the old name (check staging/mobile-test `kysely_migrations`) and
  document it, or (b) add a startup `UPDATE kysely_migrations SET name='1782050000000-…' WHERE
  name='1782000000000-AddAlbumSoftDeleteSharedSpaceAlbumTrigger'` before the migrator runs (a file-copy alias
  alone would double-run on fresh installs), and add the old name to `revert-to-immich.sql`'s DELETE list. Verify
  the trigger's `up()` is idempotent before shipping any alias.

### L-2 — `requireRole` and the bulk-add handler fail OPEN on an unrecognized member role
- **Finder/verdict:** writes-lifecycle F4-2 — **CONFIRMED** (LOW, defense-in-depth / corruption-gated).
- **Files (HEAD):** `server/src/services/shared-space.service.ts:2935-2941` (`requireRole`), `:2356-2359`
  (`handleSharedSpaceBulkAddAssets`), `:71-77` (the fail-closed helper `getSharedSpaceRoleScore`),
  `server/src/schema/tables/shared-space-member.table.ts:90-91` (role is unconstrained `varchar`, no enum/CHECK).
- **Scenario.** `shared_space_member.role` has no Postgres enum/CHECK. If any row ever carries a role outside
  `{viewer, editor, owner}` (hand-run SQL, migration bug, a future write path that skips the zod enum),
  `ROLE_HIERARCHY[role]` is `undefined` and `undefined < n` is `false` (NaN semantics), so `requireRole`
  **passes** — that member clears every Editor- and Owner-gated write in the service (~17 sites: rename, add/remove
  members, link/unlink albums, add/remove assets, delete people, bulk-add). Not reachable via the API today (all
  role writes go through `z.enum(SharedSpaceRole)`), so it is corruption-gated defense-in-depth — but it silently
  **inverts the entire role model** on a single bad row.
- **Fix.** Use `getSharedSpaceRoleScore(member.role) < ROLE_HIERARCHY[minimumRole]` at both sites (unknown → 0 =
  Viewer, denied), matching the fail-closed helper already used by `unlinkAlbum`. Optionally add a CHECK
  constraint / enum on `shared_space_member.role`.

### L-3 — `searchRandom` / `searchStatistics` / `searchLargeAssets` accept `albumIds` with no `AlbumRead` check (latent fragility, net-new from the completeness critic)
- **Source/verdict:** completeness critic — traced **currently SAFE**, reported as hardening.
- **Files (HEAD):** `server/src/services/search.service.ts:212` (`searchRandom`), `:186` (`searchStatistics`), and
  the large-assets path; contrast `searchMetadata` at `:141-146` (which *does* `requireAccess(AlbumRead)`).
- **Why safe today.** Unlike `searchMetadata` (which deliberately leaves `userIds` unset to make `AlbumRead` the
  sole gate), these three unconditionally set `userIds = getUserIdsToSearch(auth,…)`, so `inAlbums` becomes an
  intersection ANDed with the ownership/space row-scope, not the sole gate.
- **Why report it.** Their safety rests **entirely** on `userIds` never being unset for the `albumIds` path — an
  invariant nothing in the shared `searchAssetBuilder` enforces. A future refactor that mirrors `searchMetadata`'s
  "unset `userIds` when `albumIds` present" into these endpoints (an easy parity change) would silently open a
  cross-user album leak with no `AlbumRead` gate to catch it.
- **Fix.** Add an unconditional `requireAccess(AlbumRead)` on any `albumIds` path across all four search endpoints,
  collapsing the invariant into an enforced rule. Add a test pinning that a non-member's `searchRandom{albumIds}`
  returns only own assets.

---

## 5. Cleared — refuted findings and re-verified prior fixes

**Refuted (checked and cleared this pass):**

- **F1-2 (REFUTED):** prior **H1** (trashed album assets via `albumIds` search + timeline buckets) **holds fixed**
  — `albumSharedSpaceScope` carries `deletedAt IS NULL` on every disjunct (parameter-independent), and the
  timeline bucket is closed twice (service 400 on `isTrashed` + data-layer flat gate). *(This is the album arm;
  H-1 above is the distinct, still-open space arm.)*
- **F2-2 (REFUTED):** space-person **auto-thumbnail fallback** does **not** serve a crop from a non-space asset —
  the space-visibility/membership conditions apply to the very asset the `thumbnailPath` was cropped from; Archive
  inclusion is documented design; hidden space-people are enumerable by any member via `withHidden=true`, so
  `isHidden` is a UI preference not access control. Only residual is a sub-minute thumbnail-regeneration freshness
  race (INFO-grade).
- **F3-4 (REFUTED):** prior **M7** reconcile self-heal — the album metadata upsert arm is **membership-scoped**
  (`accessibleSpaceAlbums`), not grant-scoped, and the link trigger bumps `album.updateId` unconditionally at race
  time, so the healed member **does** receive the metadata row on first post-join sync. A defensive `updateId`
  bump in reconcile step 1 would be harmless hardening but is not required.

**Re-verified as landed and holding at HEAD (do not re-review):**

- **People / faces + direct-fetch:** H1, **M1** (person-faces picker no longer leaks hidden/never-shared/cross-user
  faces), **M2** (space Viewer can no longer mutate the owner's representative face), **L1** (contributorCounts no
  longer exposes userIds / hidden-count inference), **L3** (legacy null-identityId statistics no longer library-wide),
  **I1** (filter/exif suggestion `albumId` scope). Every `access.repository` space arm (`checkSpaceAccess`,
  `checkSpaceEditAccess`, `checkSpaceAccessForSpace`, `isFaceInSpace`, `getSpaceRepresentativeFaceForUpdate`) carries
  `deletedAt IS NULL` + `spaceVisibilityGate` + membership/grant join. **Direct byte/thumbnail/face fetch by a
  non-member or for a hidden/locked/trashed asset is closed on every path reachable.**
- **Sync + lifecycle:** M3 (core direct/library arms), M4, M6, M7, M8, M9, M13, L4, L5, L7, L8, L13-support, plus
  the full revocation-delta matrix and the write-authz/role-gating matrix (M2, M3 Hidden legs, M6, M7, M9, M11,
  L4, L5, L6, L7, L8, L16). Mobile `viewer_visibility.dart` and local timeline filtering verified.
- **SQL / migration / trigger:** H1, M1, M2, M11, M12, L11, L18 lane all landed; **completeness sweep found no
  unscoped asset-returning surface** — repositories the branch did not touch are owner-/system-scoped or funnel
  through the space-gated access layer.
- **Still-open-by-decision (informational):** **M14** — the mobile space-albums sync gate remains an unenforced
  `> 5.0.0` release-order assumption (a post-branch server hotfix cut from a pre-space-albums commit would 400 the
  whole `/sync/stream` for gated mobile builds). Acknowledged TODO.

---

## 6. Live-probe plan (NOT yet run — required next-session step)

Static confirmations above were **not** dynamically exercised. Reason: the only running stack was the machine-wide
`mise dev` singleton serving the **`mobile-filter-parity`** worktree (which does not contain the space-albums search
code), and repointing it to this worktree would clobber that other session's DB/source. The convergence/stale-device
findings (M-1, M-2, M-3) are **untestable by static reading** and the unit/medium harness never replays a real member
device after a revocation — these need live probes.

Bring up a clean `make e2e`/dev stack **against this worktree** with users **O** (owner of asset+album), **E**
(editor), **V** (viewer), **X** (removed ex-member); space **S** with linked album **A** (O's) and a linked library.
Run in order:

1. **H-1 (confirm + regression-pin).** As V: `POST /search/metadata {spaceId:S, trashedAfter:"1970-01-01",
   withExif:true}` and `{withSharedSpaces:true, trashedAfter:…}` after O trashes a shared asset → expect **zero**
   trashed rows. Repeat with `isOffline:true` and `trashedBefore` (each independently flips `withDeleted`). *(Currently
   expected to LEAK.)*
2. **M-1 (Locked retry hole).** As O, add asset to A (V/E have it synced). Inject a fault (or kill the worker)
   between the visibility `UPDATE` and `removeAssetsFromAll`, then flip asset→Locked. Reconnect V's sync stream →
   assert an album-arm **delete tombstone** arrives. *(Currently expected: no tombstone.)*
3. **M-2 (backfill streams trashed).** O trashes an album-A asset. Add a **new** member N. Drive N's initial
   `POST /sync/stream` backfill → assert the trashed asset is absent. *(Currently expected to LEAK metadata.)*
4. **Removed-member replay (class 1/6).** As X (previously fully synced), after O removes X: replay X's
   `POST /sync/stream` with X's last ack → assert DELETE deltas for every S asset across all three arms and an empty
   backfill; then direct-GET a known S asset's `/thumbnail` and `/original` as X → expect 400/403.
5. **M-3 (removed-creator split-brain).** Seed a DB where `shared_space.createdById` has **no**
   `shared_space_member` row (simulate the pre-guard RC state via SQL). Boot, replay the ex-creator's sync →
   assert they do **not** keep receiving space content. *(Currently expected to LEAK.)*
6. **Trashed-album re-share on restore (prior M9).** As member D: link own album, trash it, leave S, restore it →
   assert S members do **not** regain D's photos and no grants are re-created.
7. **Viewer-write negatives (class 5).** As V: `PUT /people/:id/representative-face`, album mutations, and an
   `AlbumUnlink` on a not-actually-linked album / nonexistent spaceId → expect 403/clean-404, no activity-feed spam.
8. **Direct byte-fetch as a total non-member (class 2).** GET `/assets/:id/thumbnail`, `/original`,
   `/people/:personId/thumbnail`, `GET /shared-spaces/S/people/:pid/thumbnail` for S assets/people → all 403/404.

---

## 7. Cross-cutting patterns (why per-angle finders each miss these)

1. **`deletedAt` lives at two altitudes; only one is caller-proof.** The branch moved `deletedAt IS NULL` *inside*
   the helpers it owns (`albumSharedSpaceScope`, `checkSpaceAccess*`, `isFaceInSpace`) but left the two non-helper
   `searchAssetBuilder` arms relying on the terminal, caller-toggleable `.$if(!withDeleted)`. A "does surface X
   route through the helper?" audit ticks the box (the *album* arm does); a "is `deletedAt` present?" audit ticks
   the box (it is, at `:850`) — the composition failure is invisible to either finder alone. **Every asset-scoping
   arm should carry its own `deletedAt` and never depend on the terminal gate.** (→ H-1, M-2.)
2. **"Gated by `userIds` being set" is an invariant, not a guarantee.** Four search endpoints share
   `searchAssetBuilder`; their `albumIds` safety is a function of whether the *service* sets `userIds`. Nothing in
   the shared builder enforces "if `albumIds` and not `userIds`, an `AlbumRead` check happened." (→ L-3.)
3. **Convergence holes are systematically under-tested** because the harness has no device-replay — correctness
   depends on what a *previously-synced client* receives *after* a state change, and the suite only checks
   steady-state SQL. (→ M-1, M-2, M-3; probes 2–5.)

---

## 8. Pickup prompt — start here in a new session

```
Continue the RBAC/security remediation of the space-albums branch.

CONTEXT
- Branch: space-albums-onto-main, checked out in worktree:
  /Users/pierre/dev/gallery/.claude/worktrees/space-albums-reconsolidate-v302  (HEAD b1e9f4628e at review time — re-check).
- Full findings + line anchors: SPACE-ALBUMS-RBAC-REVIEW-2026-07-11.md (this file, in that worktree root).
- Prior passes already landed: SPACE-ALBUMS-REMEDIATION-REVIEW-2026-07-08.md + PR #759. Those fixes are
  re-verified as HOLDING (see §5) — do NOT re-review them. The static read-scope + direct-fetch surface is clean;
  the completeness sweep found no unscoped asset-returning surface.
- The review workflow can be resumed/re-run for cached agent results:
  Workflow({scriptPath: "/Users/pierre/.claude/projects/-Users-pierre-dev-gallery/bcf2aebd-fa64-4711-ba49-a123b08ebcc9/workflows/scripts/space-albums-rbac-review-wf_6755eab9-26a.js",
            resumeFromRunId: "wf_6755eab9-26a"})

WHAT TO FIX (priority order; each with TDD — write the failing test first):
1. HIGH  H-1 — Trashed assets leak via the two searchAssetBuilder space arms. AND `asset.deletedAt IS NULL` into
         the other-members branch of the spaceId arm (database.ts:703-706) and the withSharedSpaces arm
         (database.ts:717-727); keep the ownerId-IN-userIds branch unfiltered. Add a 400 in search.service.ts
         rejecting withDeleted/trashedAfter/trashedBefore/isOffline when spaceId/withSharedSpaces is set. Regen
         SQL (make sql). Tests across metadata/random/largeAssets/statistics/smart incl. the implicit-flip params.
2. MED   M-2 — Add `asset.deletedAt IS NULL` to the space-member-facing sync BACKFILL/getCreates arms
         (sync.repository.ts SharedSpaceAlbumAsset/Exif + direct + non-owner library). Keep getUpdates delivering
         trashed rows to existing members (that's how devices learn to purge). Test: trash→add member→backfill→0 rows.
3. MED   M-1 — Make the Locked album strip retry-convergent: call removeAssetsFromAll(ids) unconditionally on
         nextVisibility===Locked (asset.service.ts:437) and/or emit the album purge tombstone for Locked
         (:450-453). Update asset.service.spec.ts:1388 to assert the call on re-lock; add a cross-path medium test.
4. MED   M-3 — FIRST size the fleet: run the NOT-EXISTS query (§3 M-3) on personal/staging DBs. If any row is
         affected, ship the creator-reinsert repair migration and drop the createdById arms; else document the
         accepted risk. This is partly an operational decision, not pure code.
5. LOW   L-2 — Use getSharedSpaceRoleScore() in requireRole + bulk-add handler (fail closed on unknown role);
         optionally add a CHECK constraint on shared_space_member.role.
6. LOW   L-1 — Confirm no surviving DB ran the pre-rename migration name (staging/mobile kysely_migrations);
         if unsure add a startup rename of the kysely_migrations row + the old name to revert-to-immich.sql.
7. LOW   L-3 — Add unconditional requireAccess(AlbumRead) on any albumIds path in
         searchRandom/searchStatistics/searchLargeAssets (defense-in-depth); test a non-member albumIds search.

THEN run the §6 live-probe list against a CLEAN stack built from THIS worktree (probes 1,3,5 should flip from
leak→clean once H-1/M-2/M-3 land). NOTE: `mise dev` is a machine-wide singleton — a stack was serving the
mobile-filter-parity worktree; coordinate one stack at a time, do not clobber another session's.

GATES before PR: server `pnpm test` + tsc; `make sql` if any repository SQL changed; e2e negatives
(shared-space-visibility-negatives.e2e-spec.ts) extended for the new cases; do NOT add Co-Authored-By trailers.
```
