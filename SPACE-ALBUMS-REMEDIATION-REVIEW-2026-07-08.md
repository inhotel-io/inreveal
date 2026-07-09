# Space-Albums Remediation Review — Findings & Fix Recommendations (2026-07-08)

> **What this is.** A second, independent, multi-angle review of **PR #759**
> (`fix/space-albums-remediation`, base `space-albums-onto-main`), which itself remediated the
> 2026-07-08 comprehensive space-albums review. This document is written to be fed directly into a
> new prompt to author a follow-up remediation spec. Every finding has a file:line anchor, a concrete
> failure scenario, and a spec-ready fix.
>
> **Method.** 12 dimension-focused reviewers swept the branch at HEAD (`3dfabc41ca`); every finding
> was then handed to an independent adversarial verifier that had to trace the full
> controller→service→repository→SQL path (or the product surface / test assertions) before it could
> be **confirmed**. 49 raw findings → **48 confirmed, 1 refuted**. Line numbers are HEAD-relative and
> must be re-confirmed before editing.
>
> **Headline.** The remediation is **substantially sound** — the core visibility gates, the #757
> transition machinery, sync membership scoping, the album trash/restore lifecycle, role gating on
> writes, and PersonMerge redaction all hold up under adversarial tracing (see §5, Assurance). The
> residuals are **one HIGH leak** (trashed album assets), a cluster of **person/faces read-scope
> gaps** the remediation never touched, **retry/convergence holes** in the new async machinery, and
> a set of **mobile-parity, migration-hygiene, and product-completeness** gaps. Nothing here is a
> reason not to land the branch, but H1, M1, M2, and M11 should be fixed before it reaches
> production, and M10 needs an operational decision for already-deployed DBs.

---

## 1. Severity summary

| Sev | Count | IDs |
| --- | --- | --- |
| HIGH | 1 | H1 |
| MEDIUM | 14 | M1–M14 |
| LOW | 19 | L1–L19 |
| INFO | 2 | I1, I2 |
| Refuted | 1 | R1 (with cleanup note) |

Recommended fix order: **H1 → M1 → M2 → M11 → M3 → M13 → M10 (decision) → M4/M5/M8/M9 → M6/M7/M12/M14 → LOW/INFO.**

---

## 2. Root-cause themes

The 40 canonical issues cluster into a handful of root causes. A follow-up spec is cleanest if sliced by theme, not by finding-ID.

- **A. Album-granted read scope is missing a `deletedAt` filter and a couple of surfaces the flat gate never reached.** `AlbumRead` is granted to any space member via `checkSpaceLinkedAlbumReadAccess`; the flat `spaceVisibilityGate` was added to the album content surfaces, but (a) trashed assets are not excluded when the caller controls trash params, and (b) the person/faces read surfaces were never scoped at all. → **H1, M1, M2, L1, L3, I1.**
- **B. The #757 side-effects are best-effort, not convergent.** The purge emits run after the visibility write, gated on prior visibility, so a failed request cannot be healed by retry; the library restore leg doesn't re-deliver EXIF; the library arm doesn't mask `isFavorite`. → **M3, L4, L5.**
- **C. The new async lifecycle machinery (grant reconcile, C2 face reconcile, member-departure unlink) is fire-and-forget with no durable convergence.** No retry, deterministic-jobId dedupe, non-atomic two-commit sequences, and repair paths that only sweep in one direction. → **M6, M7, L6, L7, L8.**
- **D. Mobile lags web on the album arm.** The personal-timeline surfaces omit the album arm, owner-recourse UI is web-only, one archive site was missed, and the version gate stays closed on the exact servers used to validate the branch. → **M4, M8, L12, L13.**
- **E. Migration/revert hygiene and self-declaration drift.** One trigger migration's stored DDL drifts from `functions.ts`; the revert-guard spec has blind spots; the PR body and a mobile comment describe defenses that were later reverted. → **M12, L11, L18.**
- **F. Product completeness / UX.** Trashed-album re-share on restore, an activity-injection bug, i18n gaps, no album-side link entry point, invisible auto-unlink, broken cover tiles. → **M9, M11, L14, L15, L16, L17.**
- **G. Test-safety net has soft spots** — a privacy-relevant purge pinned only by mocks, plus several assertions that pass vacuously or were swapped to a benign actor. → **M13, L19.**
- **H. One operational gap for already-deployed DBs** (removed-creator split-brain) that the prospective guard does not repair. → **M10.**

---

## 3. Findings

### HIGH

#### H1 — Trashed album assets leak to space members through album-scoped read surfaces
**Files:** `server/src/services/search.service.ts:142`; `server/src/utils/database.ts:609` (`albumSharedSpaceScope`); `server/src/services/timeline.service.ts:133`; `server/src/repositories/asset.repository.ts:253,295`
**Root cause A.** Album-granted scope applies `spaceVisibilityGate` (visibility ∈ {timeline, archive}) but has **no `deletedAt` predicate**, and the caller controls the trash filters.

- **Primary (HIGH):** `POST /search/metadata` with `albumIds` performs only an `AlbumRead` check (granted to any space **Viewer**) and leaves `userIds` unset. Any one of `withDeleted`/`trashedAfter`/`trashedBefore`/`isOffline` flips `withDeleted` on (`database.ts:659`), which skips the `asset.deletedAt IS NULL` exclusion (`database.ts:833`). A space Viewer calling `{ albumIds:[A], withDeleted:true, withExif:true, withPeople:true }` receives **full `AssetResponseDto`s — id, checksum, originalPath, thumbhash, EXIF incl. GPS, people names — for every asset the owner trashed out of that album**, for the whole trash-retention window. This directly defeats the #757 tombstoning the branch just built.
- **Secondary (MEDIUM, was rbac-album-2):** `GET /timeline/buckets|bucket?albumId=A&isTrashed=true` — `timeBucketChecks` blocks `visibility=hidden/locked` for a space browse but not `isTrashed`; the album arm sets no `userId`, so a member enumerates trashed-asset ids, thumbhashes, coordinates, timestamps (metadata-level; binary fetch stays denied).

**Fix (spec-ready):**
1. Add `asset.deletedAt IS NULL` **inside `albumSharedSpaceScope`** (`database.ts` plain-album branch) — parameter-independent, closes both the default and trash-param paths for search.
2. AND `asset.deletedAt IS NULL` into the `albumId` arm of `withTimeBucketAssetFilters` (`asset.repository.ts:295`, and the inline copies in `getTimeBucket`/`getTimeBucketCovers`), or extend the `spaceBrowse` guard in `timeBucketChecks` to reject `isTrashed=true` when `albumId`/`spaceId`/`spacePersonId` is set.
3. Optionally also reject `withDeleted`/`trashedAfter`/`trashedBefore`/`isOffline` in `searchMetadata` when `albumIds` is the access grant (mirror the existing `withSharedSpaces` guards) — defense in depth.
4. **Tests:** e2e — space Viewer `searchMetadata { albumIds, withDeleted:true }` returns no trashed assets; `timeline/bucket?albumId&isTrashed=true` returns none (mirror the existing `albumId+visibility=locked → 401` pin).

---

### MEDIUM

#### M1 — `GET /people/:id/faces` lets space members enumerate faces on the owner's hidden/locked/never-shared assets — and across all users sharing the identity
**File:** `server/src/repositories/person.repository.ts:427` (`getRepresentativeFaces`); `server/src/services/person.service.ts:322` (`getFacesForPicker`)
**Root cause A.** `PersonRead` is deliberately widened to space members (rbac-7) — correctly gated at the *grant* — but `getFacesForPicker` then calls `getRepresentativeFaces`, which filters only `asset_face.deletedAt`, `isVisible`, `asset.deletedAt`, `asset.isOffline` — **no visibility predicate, no ownership/space-path scoping.** A space Viewer paging `GET /people/<id>/faces` receives every face row (assetId, bounding box, dimensions, fileCreatedAt) for that person across the owner's **entire library**, including Hidden/Locked and never-shared assets. **Widening confirmed by verifier:** the join also expands through `face_identity_face` → `person.identityId` (no owner column), so a member receives face rows for assets owned by **every user** whose person is linked into the same identity. Pixels stay blocked (`getFaceThumbnail` re-checks `AssetRead`), so this is a metadata/existence disclosure; the person id is discoverable from any shared photo (`asset.service.ts` keeps the raw global `person.id` on `data.people`).

**Fix:** In `getFacesForPicker`, distinguish owner vs space-granted caller (like `requireThumbnailAccess`). For a non-owner, restrict `getRepresentativeFaces` to faces on assets satisfying `spaceVisibilityGate` **AND** reachable via `spaceAssetPathBranches({ memberUserId })` — applied **inside the identity-expanded join**, not just the `personId` branch. Owner keeps the full list. `getFaceThumbnail` needs no change.

#### M2 — Space VIEWER can mutate the owner's person (representative face) — write gated by read permission
**File:** `server/src/services/person.service.ts:368` (`updateRepresentativeFace`); controller `person.controller.ts:184`
**Root cause A.** The mutation is gated on `Permission.PersonRead` ("which shared-space members can also do") whose space arm has **no role filter**, so a role=**viewer** member qualifies. It writes `person.faceAssetId` on the **owner's** person row (and, when `identityId` is set, the identity-level representative face) and queues `PersonGenerateThumbnail` — changing the owner's global People-page cover for everyone. **Decisive internal contradiction:** the space-side sibling `updateSpacePersonRepresentativeFace` requires `SharedSpaceRole.Editor` and touches only the space-person profile row; `access.ts:322`'s own comment says person mutations stay owner-only.

**Fix:** Keep `PersonRead` for reachability, then additionally require `checkOwnerAccess` **OR** a role-filtered (owner/editor) shared-space variant — mirror how album writes use the Owner/Editor `checkSpaceLinkedAlbumAccess`. Add a role predicate to the `shared_space_member` join in the `memberUserId` scope.

#### M3 — Visibility-purge is not retry-convergent; the "recoverable" claim is false
**Files:** `server/src/services/asset.service.ts:391,441` (`applyVisibilityTransitionSideEffects`); `server/src/services/metadata.service.ts:890`
**Root cause B.** The visibility UPDATE commits first (`updateAll:387`, single PUT `:261`), then the purge emits run — gated on **prior** visibility (`purgeIds = ids whose prior was shareable`). If any emit throws or the server crashes after the write, the asset is persisted Hidden/Locked with **no (or partial) tombstones**, and the user's retry re-reads the now-Hidden prior → empty purge set → **silent no-op success**. Member devices keep the hidden/locked bytes and link rows indefinitely; the only recovery is a manual re-flip. The in-code comment (`asset.service.ts:402-408`) claiming "a crash … leaves a RECOVERABLE state (re-run converges)" is **false** for the retry path. The same pattern is in `metadata.service.ts:890` (motion re-extract): the `visibility === Timeline` guard means a job retry after the write never re-emits `AssetHide`. (For Locked, the album strip `removeAssetsFromAll` is equally non-retryable.)

**Fix (pick one, fail-closed):**
- **(a)** Emit purge tombstones (and run `removeAssetsFromAll` for Locked) **before** the visibility UPDATE — a failure then over-purges a still-visible asset (privacy-safe) and the retry re-runs the full set because prior state is unmutated; **or**
- **(b)** Drop the prior-visibility gate on the **purge** side only — emit purge whenever `next` is Hidden/Locked regardless of prior (tombstones are idempotent); keep the restore-side gate and the Timeline↔Archive no-op.

Apply the same to `metadata.service.ts:890` (emit `AssetHide` before the update / unconditionally on re-extract). Fix the misleading comment. **Test:** medium test that forces an emit failure mid-transition, retries, and asserts the member still converges (tombstone present).

#### M4 — Mobile personal timeline / map / video / place surfaces miss the space-ALBUM arm
**File:** `mobile/lib/infrastructure/repositories/viewer_visibility.dart:118`; `mobile/lib/infrastructure/entities/merged_asset.drift:60`
**Root cause D.** `buildViewerVisibilityJoins` / `viewerVisibilityPredicate` and the raw `merged_asset.drift` query cover only the **direct** (`shared_space_asset`) and **library** (`shared_space_library`) arms — there is **no** `shared_space_album_asset ⋈ shared_space_album_link(showInTimeline)` arm. The server's equivalents (`asset.repository.ts:1436-1455`, `map.repository.ts:123/167`) include the album leg. A member who enables the space's timeline toggle sees album-linked space photos in the **web** home timeline/map but **none** on mobile home/map/video/place. Under-inclusion, not a leak; the in-space grid queries already have the album arm, so the gap is exclusively the personal main-timeline surfaces.

**Fix:** Add a third arm to `viewerVisibilityPredicate`/`buildViewerVisibilityJoins` and `merged_asset.drift`, gating on **both** toggles (`shared_space_album_link.show_in_timeline` per-album AND `shared_space_member.show_in_timeline` per-member). Add `import`s for the two album entities to `merged_asset.drift` so `.watch()` reactivity tracks them; add two LEFT JOINs + `isNotNull()` to the six call sites in `timeline.repository.dart` (875/908, 988/1029, 1171/1224).

#### M5 — Asset-level album activity leaks participant emails to space-only readers
**File:** `server/src/services/activity.service.ts:39`
**Root cause A.** The C1 fix filters out album-level activity for space-only readers but keeps asset-level activity, serialized via `mapActivity → mapUser`, which includes **full email + name** of every commenter/liker. A space Viewer (not an album participant) calling `GET /activities?albumId=A` receives PII security-8 just redacted from `albumUsers` — one endpoint over. The shipped e2e pins that asset-level entries *are* returned but asserts nothing about the user payload.

**Fix:** In `getAll`, when `!hasDirectAccess`, redact `user.email` (`= ''`, matching security-8; redact **after** `mapUser` so the avatarColor email-fallback still computes) or restrict the payload to id/name/profileImagePath. Extend the C1 e2e to assert `body[i].user.email === ''` for the space viewer. (Related INFO: `getStatistics` counts — I2.)

#### M6 — Grant-reconcile job is fire-and-forget: no retry, jobId dedupe drops racing enqueues, `removeOnFail:false` can silence it permanently
**Files:** `server/src/services/shared-space.service.ts:1425`; `server/src/repositories/job.repository.ts:490,508`; `config.repository.ts:299`
**Root cause C.** `queueAlbumGrantReconcile` (correctness-4's TOCTOU closer) has three convergence holes: (a) `JobService.onJobRun` swallows handler errors and `attempts:1`, so a transient failure abandons the reconcile with no cron sweep; (b) deterministic jobId `space-album-grant-reconcile-<sorted ids>` + `unlinkAlbum` always enqueuing `[albumId]` means a second enqueue racing an active run is silently dropped; (c) `removeOnFail:false` means a hard worker crash/stall while the job is active leaves a **failed** job whose jobId key then **permanently** blocks all future reconciles for that album (until an admin clears failed jobs). Consequence: a stranded `shared_space_album_user` grant keeps feeding sync upserts (never tombstoned), so an ex-path member retains the album's assets/EXIF indefinitely. Same trap on `SharedSpaceFaceMatchAll`, which C2 now relies on. `FaceIdentityBackfill` already sets `removeOnFail:true`, proving the trap is known. *(Verifier note: the one-transient-error path is guarded by the error-swallow; the durable failure needs a crash/stall or a double DB failure, so this is stacked-rare — medium, not critical.)*

**Fix:** Add `removeOnFail:true` to `SharedSpaceAlbumGrantReconcile` and `SharedSpaceFaceMatchAll` (match `FaceIdentityBackfill`). Make failures re-drivable — catch-and-requeue with a nonce'd jobId inside `handleSharedSpaceAlbumGrantReconcile` (setting `attempts` alone is insufficient because the worker swallows errors), or add a low-frequency cron sweep calling `reconcileAlbumGrants` over all linked albums as a terminal backstop. Consider `deduplication:{ id, ttl }` (dedupes only while pending) instead of a raw jobId.

#### M7 — Create-side missing-grant race has no repair path; the doc test asserts a false self-heal
**Files:** `server/test/medium/specs/sync/shared-space-album-create-triggers.spec.ts:122`; `server/src/repositories/sync.repository.ts:1466`; `shared-space.repository.ts:651`
**Root cause C.** Concurrent member-join (T1) and album-link (T2) can each miss the other's uncommitted row under READ COMMITTED, so neither trigger writes the `shared_space_album_user` grant for the (new-member, new-album) pair. The spec's RESOLUTION comment claims `getCreatedAfter` "re-delivers ALL accessible albums on reconnect, so a missed grant self-heals" — **false**: `getCreatedAfter` SELECTs **from the grant table itself**, and all three asset backfills key off that grant `createId`. `reconcileAlbumGrants` is revoke-only. Result: the member sees the album shell/link on web (live-path REST) but the mobile device **never backfills its content** — a permanently **empty** album; heals only on unlink+relink or leave+rejoin.

**Fix:** Make `reconcileAlbumGrants` **bidirectional** — alongside the revocation sweep, `INSERT INTO shared_space_album_user (userId, albumId) SELECT ssm.userId, ssa.albumId FROM shared_space_album ssa JOIN shared_space_member ssm USING (spaceId) JOIN album a ON a.id = ssa.albumId AND a.deletedAt IS NULL WHERE ssa.albumId IN (...) ON CONFLICT DO NOTHING` — and enqueue it from `linkAlbum` and `addMember`, not just delete paths. **At minimum, correct the false RESOLUTION comment** so the gap isn't treated as closed.

#### M8 — rbac-6 owner recourse (view + revoke album space-links) is web-only; mobile album owners are blind
**File:** `web/src/lib/components/album-page/AlbumSharedSpaceLinks.svelte:14`; no mobile consumer of `sharedSpaceLinks`
**Root cause D / F.** A space editor can link an album owned by a non-member into a space (`linkAlbum` requires space-Editor + `AlbumUpdate`, and the album owner need not be a space member). The server exposes `AlbumResponseDto.sharedSpaceLinks` to the owner and web renders a revoke button — but **no mobile UI reads `sharedSpaceLinks`** (only the generated Dart model exists), and all mobile unlink affordances are space-role-gated. A mobile-only album owner whose co-editor linked the album into a space cannot **discover or revoke** it. Given spouse/friend album co-editing is the normal setup, the security-relevant owner control silently doesn't exist for mobile users.

**Fix:** Add a "Linked spaces" section to the mobile album detail/options sheet for owned albums, fetching `GET /albums/:id` on demand (the field is owner-only, not in the Drift sync stream), with a per-link unlink calling `DELETE /shared-spaces/{spaceId}/albums/{albumId}` (server already allows the owner path without space membership).

#### M9 — Departing member's TRASHED own album stays linked; restoring it later re-shares it into the space they left
**File:** `server/src/repositories/shared-space.repository.ts:596` (`removeOwnedAlbumLinksAddedBy`)
**Root cause F.** albums-6 unlinks a departing member's own albums, but the query filters `album.deletedAt IS NULL`, so a link to the member's **trashed** own album survives departure. The soft-delete trigger keeps the `shared_space_album` row; its restore arm re-creates grants for **current** members with fresh `createId` and re-drives backfill. Scenario: member D links their album into space S, trashes it, leaves S; weeks later D restores from trash → the surviving link fires the restore trigger and **all of S's members instantly regain the album's photos**, breaking the albums-6 promise, with no notification. Affects both self-leave and owner-removal arms.

**Fix:** Drop the `album.deletedAt IS NULL` predicate at `shared-space.repository.ts:596` (deleting a trashed album's link is safe — grants were already revoked by the soft-delete trigger; the delete-audit tombstone is idempotent; permanent purge already cascades). Update the comment block at `:577-582`. **Test:** medium — trash own linked album → leave → restore → album does NOT reappear, no grants (belongs next to `shared-space-member-album-lifecycle.spec.ts`, which has zero trash coverage).

#### M10 — rbac-4(b) deferral leaves already-deployed DBs with a removed-creator sync split-brain
**Files:** `server/src/utils/shared-space-album-scope.ts:90` (`accessibleSpaces`); `server/src/schema/functions.ts:412,551`; guards at `shared-space.service.ts:463,580`
**Root cause H (+ spec deviation, was sync-3).** The plan chose **both** (a) forbid removing/demoting the creator **and** (b) drop the immutable `createdById` arm from `accessibleSpaces`/`user_has_*_path`, warning "(a) alone leaves the createdById read-path." HEAD ships **(a) only**. That is safe **prospectively**, but released Gallery (whole fleet on v5.0.0-rc) had no creator guard — a promoted co-Owner could already have removed/demoted-then-left the creator. On any such deployed DB, after upgrade the ex-creator's phone keeps syncing **all** space content forever (space resurrects on the next `shared_space` update via the `createdById` arm) while the UI says they're not a member. No repair migration ships.

**Fix (operational decision required):**
- **Preferred** (matches the branch's creator-is-always-a-member invariant): ship a one-off fork migration / startup sweep that re-inserts the creator as an Owner member for every `shared_space` whose `createdById` lacks a member row — `INSERT INTO shared_space_member (spaceId, userId, role) SELECT id, "createdById", 'owner' FROM shared_space ss WHERE NOT EXISTS (SELECT 1 FROM shared_space_member m WHERE m."spaceId"=ss.id AND m."userId"=ss."createdById")`. Then dropping arm (b) becomes truly safe.
- **Alternative:** if removal should stand, emit member-scoped delete tombstones for those (space, ex-creator) pairs, implement part (b), and revisit `user_has_album_path` branch 3 (which still preserves the ex-creator's album grants against the reconcile job).
- Either way, **document which invariant the code now rests on.** (Check `SELECT id FROM shared_space ss WHERE NOT EXISTS (...member for createdById)` on personal/staging DBs to size the blast radius.)

#### M11 — `unlinkAlbum` owner path injects AlbumUnlink activity into arbitrary spaces and 500s on a nonexistent spaceId
**File:** `server/src/services/shared-space.service.ts:713`; controller `shared-space.controller.ts:605`
**Root cause F — regression from the rbac-6 fix.** The owner arm authorizes on album ownership only (`checkAccess(AlbumDelete)`) and never verifies the album is actually linked to the given space or that the caller has any relationship to the space. `removeAlbum` is a silent no-op when no link matches, but `logActivity` **unconditionally** inserts a `SharedSpaceActivityType.AlbumUnlink` row into the target space's member-visible feed. Two failures: (1) **activity injection** — a removed ex-member (or anyone with a leaked space UUID) repeatedly calls `DELETE /shared-spaces/{spaceId}/albums/{theirOwnAlbumId}` and spams attacker-chosen album-name strings into that space's feed; (2) **500** — a well-formed but nonexistent `spaceId` passes the owner check (`getMember` → null) and the bare INSERT violates the `shared_space_activity.spaceId` FK → unhandled Postgres 23503 → HTTP 500. Before this remediation the Editor-role requirement made both impossible. (Blast radius also includes benign face-cleanup churn against the victim space.)

**Fix:** In the non-editor path, first check `hasAlbumLink(spaceId, albumId)` (method exists at `shared-space.repository.ts:705`) — or make `removeAlbum` return the deleted count — and return early (404 / no-op 200) when no link exists, skipping `logActivity`, face cleanup, and reconcile. Add unit/e2e negatives for album-not-linked and nonexistent-space.

#### M12 — `1782000000000` migration's function DDL + `migration_overrides` drift from `functions.ts`
**File:** `server/src/schema/migrations-gallery/1782000000000-AddAlbumSoftDeleteSharedSpaceAlbumTrigger.ts:77`
**Root cause E.** The migration's executed `CREATE OR REPLACE FUNCTION` and its `migration_overrides` JSON both differ from the registered function in `functions.ts`: they omit the four `-- soft-delete:`/`-- restore:` comment lines and the override's `sql` value is truncated (ends `...RETURN NULL;\n    END`, missing `\n  $$;`). `sql-tools` compares overrides with exact string equality, so any future `pnpm migrations:generate` against a DB that ran this migration emits a spurious `FunctionCreate` + `OverrideUpdate`, polluting rebase regen output and masking real drift. Sibling migrations (`1779100000000`, `1782100000000`) match byte-for-byte — this one is the outlier. No runtime impact (function is behaviorally identical).

**Fix:** Regenerate the two SQL strings in the migration's `up()` so both the executed DDL and the `migration_overrides` `sql` value are byte-identical to `asFunctionExpression(album_soft_delete_shared_space_album)` — include the comment lines and the `\n  $$;` tail (mirror `1782100000000`). The **`migration_overrides` JSON is the load-bearing one** (`haveEqualOverrides` short-circuits before expression comparison). Optionally add a unit spec that reconstructs each migrations-gallery override literal and asserts equality to the registered function's expression, so future hand-written trigger migrations can't drift.

#### M13 — Motion-photo hide/show purge (#757 motion bypass) is pinned only by mock-called unit tests
**File:** `server/src/services/asset.service.spec.ts:980`; `metadata.service.spec.ts`
**Root cause G.** The fix (824b451c67) is tested only by (a) calling `sut.onAssetHide()`/`onAssetShow()` directly and asserting mocked `emit*` calls, and (b) asserting `event.emit('AssetHide')` was called. The **seam** — the `@OnEvent({name:'AssetHide'})` subscription firing, and the **seeded-Timeline-prior invariant** (the handler only works because all three emit sites write Hidden to the DB *before* emitting, so the handler must hand-seed a Timeline prior) surviving through to a member-visible tombstone — has **zero medium/e2e coverage** across any arm. A refactor that renames the event, drops the decorator, or re-derives prior visibility from the DB (now Hidden → no boundary crossing) keeps all tests green while motion videos silently stop purging from member devices.

**Fix:** Add one medium test (pattern of `sync-space-visibility-purge-cross-path.spec.ts`): seed a space-linked library with a Timeline motion video, sync+ack a member, emit the real `AssetHide` event (or drive `MetadataService.linkLivePhotos`), assert the member's next `/sync` carries the library-arm delete tombstone; mirror with `AssetShow` → re-upsert.

#### M14 — mobile-1 server-side drop-unknown filter was reverted; sync-outage protection now rests solely on a fragile client version constant
**Files:** `server/src/dtos/sync.dto.ts:723`; `mobile/lib/infrastructure/repositories/sync_api.repository.dart:114`
**Root cause D/E.** Commit 334385a546 added a `z.preprocess` to drop unknown `SyncRequestType` values (defense-in-depth); b195a3d279 **reverted** it (restoring strict reject-with-400) plus deleted its tests. The only remaining protection is the mobile gate `serverVersion > 5.0.0`, which encodes an unenforced release-order assumption. Because mobile and server release independently, a server hotfix cut from a pre-space-albums commit (e.g. v5.0.1) would see `5.0.1 > 5.0.0` from every gated mobile build → the older server's `z.enum` **400s the whole `POST /sync/stream`** → total remote-sync outage, no client recovery. *(Verifier: real latent release-process hazard, severe if hit, but fires only on a release-sequencing error — medium, not high.)* The mobile comment at `sync_api.repository.dart:112-113` still claims the (now-nonexistent) server drop-unknown filter is the complementary defense.

**Fix:** (a) Fix/remove the stale mobile comment. (b) Make the assumption enforceable: pin the client gate to the **actual** first-feature-release version at mobile release time (per the plan's reconciliation note) + a release-checklist/CI guard that no `>5.0.0` server without the `SharedSpaceAlbum` enum values can ship ahead of the gated mobile build. Add a Dart guard test asserting the set of ungated request types equals the known-upstream set (see L19/testq-3). Re-landing the server filter was explicitly rejected for breaking the reject-unknown contract, so the enforcement route is preferred.

---

### LOW

#### L1 — `contributorCounts` on `GET /albums/:id` is ungated and exposed to space-only readers
**File:** `server/src/services/album.service.ts:152`; `server/src/repositories/album.repository.ts:575`
*(Merges rbac-album-5, rbac-contributorCounts-leak, albums-product-4, webpii-4 — four dimensions, one issue.)* `getContributorCounts` filters only `deletedAt` (no visibility) and `album.service.get` returns it to every `AlbumRead` caller of a **shared** album. Two leaks to a space-only reader: (a) raw contributor **userIds** (the exact class security-8 stripped from `albumUsers`, one field over — the code comment admits it's an undone follow-up); (b) `sum(contributorCounts) − assetCount` reveals the count of Hidden/Locked assets (assetCount is visibility-gated, contributorCounts is not). Only triggers when the album is *also* album-shared (`isShared`).
**Fix:** `contributorCounts: isShared && hasDirectAccess ? ... : undefined` (the boolean is already computed at `album.service.ts:109`), **and** apply `withDefaultVisibility` inside `getContributorCounts` so the hidden-count inference is closed for all callers (matches the grid).

#### L2 — `albumSharedSpaceScope` over-restricts album-scoped search (diverges from the grid)
**File:** `server/src/utils/database.ts:618`
*(Merges rbac-album-8, fresh-3.)* The plain-album branch excludes any asset in **any** `shared_space_asset` row (or whose library is in **any** `shared_space_library`), globally unscoped; excluded assets are re-admitted only via the caller's `timelineSpaceIds` — which requires membership AND `showInTimeline=true`. So an album_user Viewer (or a space member with the timeline toggle off) gets album-scoped `searchMetadata` results that silently **omit** library-backed / directly-space-linked album assets the album grid shows. Functional divergence, no leak; the library arm can drop an entire external-library album. If the searcher has zero timeline-enabled spaces, `timelineSpaceIds` is undefined and the exclusion is unconditional.
**Fix:** Since `AlbumRead` already authorizes the content and the grid shows it flat-gated, replace the anti-join with the plain flat gate (`spaceVisibilityGate` + `deletedAt IS NULL`) for album-granted scope — matching `withAssets`/`withDefaultVisibility`. At minimum drop the `showInTimeline` filter on the re-admission arms used by album-scoped search.

#### L3 — `person.getStatistics` legacy (null-identityId) path returns library-wide counts to space members
**File:** `server/src/services/person.service.ts:399`; `person.repository.ts:604`
For a person with `identityId` it routes to the viewer-scoped `getAccessiblePersonStatistics`, but for `identityId IS NULL` (post-upgrade / Immich-migrated / backfill-in-progress) it falls to `personRepository.getStatistics(id)`, counting **all** of the owner's Timeline faces with no space scoping. A space Viewer learns the owner has N photos of a person while only a few are shared. Transient window (backfill is auto-queued and every face path calls `ensurePersonIdentity`).
**Fix:** In the null-identityId branch, if `auth.user.id !== person.ownerId`, restrict the count to space-reachable assets (`spaceAssetPathBranches({ memberUserId })` + gate), mirroring `getAccessiblePersonStatistics`.

#### L4 — Library-arm hide→restore cycle permanently loses EXIF on member devices
**File:** `server/src/repositories/sync.repository.ts:1393`; `asset.service.ts:425`
**Root cause B.** Direct/album restore arms bump their join-row `updateId` (and their EXIF sync is keyed on it), so content + EXIF re-deliver. The library arm has no restore emit — true for the asset row (keyed on `asset.updateId`) but **not** for `LibraryAssetExifSync` (keyed on `asset_exif.updateId`, which a visibility flip never touches). Sequence: member syncs a library asset + EXIF → owner hides → member's device deletes the row (EXIF cascades) → owner unhides → asset row re-upserts but EXIF never re-streams → member shows the restored asset with **empty EXIF** (no GPS/date/camera) indefinitely. Only for assets reaching the member *exclusively* via the library link.
**Fix:** Add `emitLibraryAssetVisibilityRestore` to the restore branch that bumps `asset_exif.updatedAt` (→ `updateId` via its trigger) for restored assets whose `libraryId ∈ shared_space_library` — mirror `emitDirect/AlbumAssetVisibilityRestore`. Server-only (mobile handler already exists).

#### L5 — Library sync arm streams the owner's `isFavorite` unmasked to space members
**File:** `server/src/repositories/sync.repository.ts:1295`
**Root cause B.** `SharedSpaceAssetSync` and `SharedSpaceAlbumAssetSync` mask `isFavorite` to the syncing user's own rows via a CASE ("a space member must not learn another owner's favorite flag"). `LibraryAssetSync.getBackfill/getUpserts` select `columns.syncAsset` raw (includes `asset.isFavorite`), so a member syncing another owner's linked library receives the owner's true favorite flags. Existing medium test `sync-library-asset.spec.ts:217-251` already reproduces it (unasserted).
**Fix:** Split `isFavorite` out of `columns.syncAsset` for these two queries and apply the same ownership CASE. Update `@GenerateSql` docs (`make sql`); note previously-synced devices retain the flag until re-upsert.

#### L6 — C2 removal-side reconcile cannot converge; `cleanupDepartingMemberAlbums` retry is an unrecoverable no-op
**File:** `server/src/services/shared-space.service.ts:2898,1441`
**Root cause C.** The `SharedSpaceFaceMatchAll` chain is purely **additive** (re-projects assets *currently in* the space); nothing deletes `shared_space_person_face` rows whose asset lost its space path, and `deleteOrphanedPersons` only drops zero-face persons. So a failed `onAlbumDelete`/`onAlbumAssetsRemove` leaves **stale person-faces** forever (inflated faceCount/assetCount, possibly a permanently-404 auto avatar). `cleanupDepartingMemberAlbums` has no fallback at all, and its retry is a no-op (`removeOwnedAlbumLinksAddedBy` returns `[]` the second time). *(Verifier: the claimed lingering-**content** leak is refuted — every read path re-checks the current space path, so stale faces are never rendered; this is data-hygiene/UX polish, downgraded to low.)*
**Fix:** Add a space-path-scoped stale-face sweep to the durable reconcile (delete `shared_space_person_face` rows whose asset has no remaining space path, reuse the NOT-EXISTS trio, then recount + `deleteOrphanedPersons`); wrap `cleanupDepartingMemberAlbums`' face cleanup in try/catch that enqueues it.

#### L7 — Member removal is not atomic with the departing-member album unlink
**File:** `server/src/services/shared-space.service.ts:563,583`
*(Merges lifecycle-4, sync-2.)* **Root cause C.** `removeMember` and `cleanupDepartingMemberAlbums` are two separate auto-committing statements. A crash/DB error between them leaves the ex-member's own album still linked (remaining members keep read + future-asset access), with no automatic repair (the reconcile job correctly skips it — the surviving link is a live path). The **self-leave** retry is structurally blocked (`requireMembership` now throws). Remove/re-add race: the stale second commit deletes a re-added member's links.
**Fix:** Wrap the membership delete and `removeOwnedAlbumLinksAddedBy` in **one repository transaction** (both plain DML; the AFTER-statement audit triggers fire inside it, keeping tombstones atomic — pass `trx` through, mirroring `recountPersons`). Keep face cleanup + job enqueues outside (fork's no-`this.db`-in-transaction rule) and make them re-drivable via the L6 reconcile. *(Owner-kick path is idempotently re-drivable; only self-leave is fully stuck.)*

#### L8 — Cascade deletion paths fire the raced revocation triggers but never enqueue the reconcile
**File:** `server/src/services/shared-space.service.ts:1421`; `functions.ts:615`
**Root cause C.** `queueAlbumGrantReconcile` is called only from `remove`/`removeMember`/`unlinkAlbum`. **User hard-deletion** cascades the user's memberships and (via `createdById ON DELETE CASCADE`) their created spaces, firing the same READ-COMMITTED-gated delete-audit triggers with no reconcile queued; a strand persists until an unrelated unlink happens to sweep it. Also `remove()` and `removeMember` capture the linked-album set in a **separate** transaction before the delete, so an album linked in that window is cascade-unlinked but missing from the reconcile set. Compound race → low. *(Album hard-delete cannot strand: `shared_space_album_user.albumId` is `ON DELETE CASCADE`.)*
**Fix:** (a) A low-frequency scheduled sweep running `reconcileAlbumGrants` over all albums in `shared_space_album_user` (makes the mechanism path-independent — also backstops M6/L7); or (b) enqueue the reconcile from the user-deletion handler and capture `getLinkedAlbumIds` inside the delete transaction.

#### L9 — `AlbumSharedSpaceLinks` snapshots links once (`$state` init) → stale/wrong-album list, wrong-target unlink
**File:** `web/src/lib/components/album-page/AlbumSharedSpaceLinks.svelte:17`
`let links = $state([...(album.sharedSpaceLinks ?? [])])` runs once per instance; the page component is reused across same-album refresh and cross-album navigation without keying. After navigating from owned album A (with links) to album B, B's page renders A's rows; clicking unlink sends `{ id: staleSpaceId, albumId: B.id }` — either a wrong-album unlink (if B is linked to that space and the caller is B's owner/space-editor) or a silent 204 no-op that fakes success. *(A ForbiddenException toast for unrelated callers narrows it.)*
**Fix:** Replace the snapshot with `$derived((album.sharedSpaceLinks ?? []).filter(l => !removed.has(l.spaceId)))` plus a `removedSpaceIds` `$state` for optimistic unlink, and/or `{#key album.id}`.

#### L10 — Global `/albums/:id` page shows always-failing manage affordances to space-only readers
**File:** `web/src/routes/(user)/albums/[albumId=id]/.../+page.svelte:725`
A space-only reader can deep-link to the global album route (not just the C4-pinned space route). "Set as album cover" appears whenever one asset is selected (no role gate) and fires `updateAlbumInfo` → `AlbumUpdate` (no space arm) → guaranteed 400 error toast; `CreateSharedLink`/`AddToAlbom` similarly. No data leak, all mutations server-rejected — affordance/UX only. *(Pre-existing upstream gap; fork widens the exposed population.)*
**Fix:** Gate the set-as-cover MenuOption behind the existing `isEditor` derived (`+page.svelte:368`, = the server's `AlbumUpdate` set — **not** `isOwned`, which would regress album Editors); optionally hide the two selection-bar options when `!isAllUserOwned`.

#### L11 — `revert-to-immich.spec.ts` guard has two blind spots
**File:** `server/src/schema/revert-to-immich.spec.ts:16,34`
**Root cause E.** (a) The table test derives the expected set **from the DROP statements themselves**, so a fork table added without a `DROP TABLE` line shrinks the expected set instead of failing → silent incomplete revert. (b) The migration-name test uses whole-file `sql.includes('${name}')`, not scoped to the step-8 DELETE block (latent today — no name currently matches outside it). *(Partly a documented scope limitation; the `shared_space` prefix filter also excludes other fork-table families.)*
**Fix:** Derive the expected fork-table set from the schema/`migrations-gallery` `CREATE TABLE` names and assert each has **both** a `DROP TABLE` and a step-9 guard entry; scope the migration-name assertion to the text between `DELETE FROM "kysely_migrations"` and its closing `);`.

#### L12 — Mobile `sharedSpacePerson` timeline drops archived assets (7th archive site missed)
**File:** `mobile/lib/infrastructure/repositories/timeline.repository.dart:971`
**Root cause D.** The space-person timeline filters `visibility == timeline` only; the server (`getPersonAssetIds`) returns Archive+Timeline. Commit 9185ff58e2 fixed 6 sites and missed this one. A space person's archived photos show on web but are silently dropped on mobile. Not a leak.
**Fix:** `(visibility == timeline | visibility == archive)` at `:971` + a repository test mirroring the 9185ff58e2 archive cases.

#### L13 — Version gate stays closed on RC/dev servers reporting ≤ 5.0.0
**File:** `mobile/lib/infrastructure/repositories/sync_api.repository.dart:114`
**Root cause D.** The gate is strictly-after-5.0.0, but (1) RC images built without explicit `FORK_VERSION` fall back to `git describe` → `v5.0.0-rc.0`, which mobile reads as `5.0.0` (prerelease dropped at `sync_stream.service.dart:66`; and semver would keep `5.0.0-rc.N < 5.0.0` anyway); (2) unbranded `make dev` reports `package.json` `3.0.1`. So the feature stays silently off on exactly the servers used to validate this branch. Fail-safe direction; GA unaffected.
**Fix:** Validate this branch via a build whose (major,minor,patch) strictly exceeds 5.0.0 (e.g. `v5.1.0-rc.0` through `gallery-prerelease-server.yml`, which takes an explicit version — `gallery-rc-build.yml` deliberately has no version input). Optionally add a debug build flag forcing the album request types on for dev. Fix the misleading gate comment at `:110-111`.

#### L14 — Album-in-space UI strings are hardcoded English
**File:** `web/src/lib/components/spaces/space-activity-feed.svelte:75`; multiple `mobile/lib/.../spaces/*` pages/widgets
**Root cause F.** The web activity feed uses raw template literals for album_link/unlink/person_* entries amid `$t()` siblings; the entire mobile space-albums surface ('Link Albums', 'Add photos', 'Unlink from space', 'Albums (N)', '$count photos', …) is hardcoded while sibling space pages use `.tr()`. Non-English users see mixed-language UI. *(i18n ships ~89 locale files, not just 7.)*
**Fix:** Add keys to `i18n/en.json` and route web strings through `$t`; use `.tr()` consistently across the mobile space-album pages/widgets.

#### L15 — No "link to a space" entry point from the album itself
**File:** `web/src/lib/modals/SpaceLinkAlbumModal.svelte`; mobile `space_link_album.page.dart`
**Root cause F.** Linking is discoverable only from inside a space (web Albums tab / mobile shelf). The album page offers user-share + shared-link but no "add to a space"; `AlbumSharedSpaceLinks` self-hides when there are no links, so an unlinked album shows zero hint that spaces support albums. Asset-level "add to space" exists via cmdk, making the album-level omission inconsistent. Discoverability only.
**Fix:** Add a "Link to space" option to the album share/context menu (web) and album options sheet (mobile) opening a space picker (Owner/Editor spaces) → `PUT /shared-spaces/{id}/albums/{albumId}`.

#### L16 — Auto-unlink on member departure is invisible
**File:** `server/src/services/shared-space.service.ts:564`
**Root cause F.** `cleanupDepartingMemberAlbums` silently deletes the departing member's own album links but logs only `MemberLeave`/`MemberRemove` (no per-album `AlbumUnlink`, unlike the interactive path). Remaining members see albums vanish with no record of which/why; the leave dialog warns the leaver only about what *they* lose, not that their linked albums are withdrawn from everyone.
**Fix:** Capture the ids `cleanupDepartingMemberAlbums` already returns and log one `AlbumUnlink` per album (fallback name for deleted albums); extend `spaces_leave_confirmation` (all locales) with an "albums you linked will be removed" note, conditioned on the leaver having such links.

#### L17 — Space shelf cards show a "broken asset" tile when the album cover is not space-visible
**File:** `server/src/repositories/shared-space.repository.ts:608` (`getLinkedAlbums`)
**Root cause F.** `getLinkedAlbums` returns `albumThumbnailAssetId` verbatim; the member's gated thumbnail request 403s → web renders `BrokenAsset`. **Persistent case is a Hidden cover** (asset stays in the album with `deletedAt NULL`, so `updateThumbnails` treats it as valid forever while the gate blocks members). *(Locked/trashed covers self-heal via `updateThumbnails` on the next albums-page load; picker rows are unaffected.)*
**Fix:** In `getLinkedAlbums`, substitute the cover per-viewer — COALESCE `albumThumbnailAssetId` only when it passes the flat `spaceVisibilityGate` + `deletedAt IS NULL`, else fall back to the newest space-visible album asset (or null → NoCover).

#### L18 — Stale self-declarations: PR body + mobile comment describe reverted defenses
**File:** `mobile/lib/infrastructure/repositories/sync_api.repository.dart:112`; PR #759 body
**Root cause E.** (1) The mobile comment still says "The server drop-unknown filter … is the complementary defense" — reverted by b195a3d279; concretely invites the M14 bug class (an engineer adds a `SyncRequestType` without a version gate, believing the server drops unknowns). (2) PR body slice-5 still lists "+ server drop-unknown filter" and slice-3 "gaps-5 (owner-gate deletes)" unqualified (the direct arm was deliberately reverted to *not* owner-gate — dual-purpose audit table). (3) The ⚠️ CI-deferred section is stale — a58211f573 fixed the SQL-doc regen and CI is green. Documentation/audit-trail only; the reverts themselves are sound.
**Fix:** Update the PR body (slice 5 → "client version gate only; server filter reverted", slice 3 → "gaps-5 owner-gate on ALBUM + LIBRARY arms only; direct arm intentionally ungated"), replace the ⚠️ section with "CI has since validated", and fix `sync_api.repository.dart:112-113` to state the server rejects unknown types with 400 and every future request type must be client version-gated.

#### L19 — Test-hardening cluster (assertions that pass without the fix)
**Root cause G.** Four independent soft spots:
- **testq-2** (`shared-space-visibility-negatives.e2e-spec.ts:605`): the PUT-locked album-removal test asserts `assetCount === 0`, which is vacuous (assetCount is visibility-filtered, so 0 whether or not the `album_asset` row was deleted). **Fix:** after locking, PUT back to timeline and assert `assetCount` stays 0 (row deleted → no resurrection). Correct the false comment.
- **testq-4** (`search.service.spec.ts:626`): the `albumIds+personIds` bypass test was swapped from a space **member** to the **owner**, leaving the member person-filter path untested. Members cannot person-filter album-scoped search (forced-empty) — an unpinned contract. **Fix:** re-add a member-actor test pinning the forced-empty outcome.
- **testq-5** (`shared-space-visibility-negatives.e2e-spec.ts:481`): the map-marker negative has no positive control that the *hidden* asset would produce a marker (a different fixture proves the pipeline). **Fix:** before hiding, drain then assert the owner sees `hidden.id`'s marker; then flip to Hidden and run the negatives.
- **testq-6** (`shared-space.service.spec.ts:2033`): creator remove/demote protection has unit-only negatives, and most `updateMember`/`removeMember` tests stub `getById → undefined`, routing through the guard's **fail-open** branch as their happy path — a repository-shape refactor would silently disable the guard with all tests green. **Fix:** add two e2e negatives (co-Owner DELETE / PATCH role=viewer on the creator → 403) and consider making the guard **fail-closed** (throw on missing space — safe, since membership FK-guarantees the space row).

---

### INFO

#### I1 — Filter/exif suggestion `albumId` scope keeps an owner exception
**File:** `server/src/repositories/search.repository.ts:1224`
`applySuggestionScope`'s albumId arm exempts the caller's own assets from the gate and resolves visibility as "not-locked", so the owner's own **Hidden** album asset feeds People/Location/Camera facets even though the album grid/map/timeline/download were made flat. Self-data only; produces a dead facet (a value with zero matching grid assets). **Fix:** AND the ownerId branch with `spaceVisibilityGate` (or drop it) in the albumId arm only — leave the `spaceId`/`timelineSpaceIds` arms' owner exception intact.

#### I2 — Space-only album reader can read album comment/like counts via `getStatistics`
**File:** `server/src/services/activity.service.ts:48`
`getAll` (C1) excludes album-level activity for space-only readers, but `getStatistics` returns aggregate `{comments, likes}` counts with no `hasDirectAlbumReadAccess` check — the album-level portion leaks as a count. Documented deliberate deferral; aggregate integers only. **Fix (low priority):** mirror `getAll`'s gate, or exclude `assetId IS NULL` rows for space-only readers.

---

### Refuted

#### R1 — Duplicate-resolution visibility merge bypasses the #757 purge — **REFUTED**
**File:** `server/src/services/duplicate.service.ts:251`
Claimed that `resolveGroup`'s raw `updateAll(idsToKeep, {...assetUpdate})` could write Locked/Hidden without purge side-effects. **Refuted:** `duplicateRepository.get` applies `withDefaultVisibility` (Archive+Timeline only), so the group — and the keeper — can never be Hidden/Locked; the only possible transitions are shareable↔shareable, which `applyVisibilityTransitionSideEffects` itself no-ops. **Cleanup note (not a bug):** (1) the `Locked` entry in `visibilityOrder` and the `Hidden` fallback in `getSyncMergeResult` (`duplicate.service.ts:307-311`) are **dead code** — remove or assert; (2) a narrow TOCTOU exists if the owner locks the keeper between `get()` and line 251 (merge overwrites back to shareable with no restore emit) — a deterministic fix is to exclude `visibility` from the raw `updateAll` and route any visibility write through the shared transition helper.

---

## 4. Suggested remediation slices (for the follow-up spec)

Group by root cause so each slice is independently testable (TDD, red→green):

1. **Album-read `deletedAt` + person/faces scope (A):** H1, M1, M2, L1, L3, I1. Highest priority; all server-side, all with clear e2e negatives.
2. **Purge convergence (B):** M3, L4, L5. Fail-closed transition ordering + library restore emit + isFavorite mask.
3. **Async lifecycle durability (C):** M6, M7, L6, L7, L8. Bidirectional reconcile + `removeOnFail` + one cron sweep backstop closes most of these together; transactional member-removal.
4. **Mobile parity (D):** M4, M8, L12, L13. Album arm in the personal-timeline surfaces + mobile owner-recourse UI + gate/version fixes.
5. **Product/UX + the injection bug (F):** M9, M11, L14, L15, L16, L17. M11 is security-adjacent (feed spam / 500) and should ride at the front of this slice.
6. **Migration & self-declaration hygiene (E):** M12, L11, L18.
7. **Test hardening (G) + operational decision (H):** M13, L19, and **M10** (needs a product/ops call before coding — repair migration vs. tombstone-and-drop-arm).

---

## 5. Assurance — what was verified SOUND (do not re-litigate)

The adversarial trace confirmed these areas are correct at HEAD; they are the load-bearing parts of the feature and they hold:

- **Album read-access gate.** `checkSpaceLinkedAlbumReadAccess` requires `album.deletedAt IS NULL` + a current member row; `shared_space_album` is hard-delete (no soft-delete grant hole); the write variant correctly requires Owner/Editor. `AlbumUpdate/Delete/Share` have **no** space arm. `GET /albums/:id` `withAssets`, album map-markers, download (album + space arms), timeline buckets (default path), asset-level binary/exif access, and search's album arm all carry the **flat** `spaceVisibilityGate` + `deletedAt` with no owner exception — hidden/locked/trashed binaries are denied; locked requires elevated auth (401). Memories, duplicates, tags CRUD, stacks stay owner-only. Stack children are not reachable via album membership.
- **Write / RBAC.** Every space write path is Owner/Editor-gated; no Viewer-reachable write exists (except the two person-write bugs M2 and, indirectly, M11). `addAssets` requires `AssetShare` (rbac-2, closes read→re-share→write). Visibility + `livePhotoVideoId` are owner-gated **before** the destructive cascade in both single PUT and bulk. Trash/restore/delete require owner `AssetDelete` — space grants don't permit deleting non-owned assets. Creator remove/demote/self-leave guards work prospectively. **PersonMerge redaction (C3) is complete** — cross-space UUIDs stripped to `{activityRole}`; activity is not synced, so `getActivities` redaction suffices. All compound routes are UUID-validated (400 not 500). Permission enum scoping prevents narrow API keys reaching space endpoints.
- **Sync streams.** Membership scoping of every fork stream is correct; all member-facing asset arms carry the flat gate; `isFavorite` is masked on the direct/album arms (library arm is L5). The **gaps-5 direct-arm revert is legitimate** — `shared_space_asset_audit` is genuinely dual-purpose (purge + physical delete), so owner-gating it would suppress the owner's own delete-convergence; the album arm's owner-gate is safe (purge-only audit table); library arm owner-gate + partner exclusion is sound. The **album trash/restore lifecycle converges** — soft-delete revokes grants + tombstones links, restore re-grants with fresh `createId` and bumps `updateId`, link rows are excluded while trashed, stream order lets mobile apply in one pass. Member-removal deletes reach everything (removed user + peers). Checkpoint/ack semantics are monotonic over UUIDv7 audit ids. The 3dfabc41ca de-flake did **not** weaken the order assertion.
- **#757 transition machinery.** `applyVisibilityTransitionSideEffects` implements boundary-crossers-only correctly (Timeline↔Archive no-op, Hidden↔Locked no double purge, Locked strips albums once, restore doesn't resurrect album membership). All four visibility-write paths route through it. The only true bypass hunt result was R1 (refuted). The convergence gap is the retry/failure story (M3), not the boundary logic.
- **Migrations.** Trigger semantics of `1782000000000` (statement-level, transition-table guarded, no recursion, ungated revocation correct because `user_has_album_path` is false once trashed), the `1782100000000` re-link `createId` migration (byte-identical override, symmetric down), and the `1782300000000` index migration all verified; timestamps collide with nothing; revert-to-immich drops all fork tables/functions/triggers/overrides/migrations in dependency order. The only migration issues are the DDL-string drift (M12) and the spec-guard blind spots (L11). *(No `migration_overrides` runtime JSON.parse safeguard exists in server source — the PR's mention doesn't correspond to code; overrides are read only by sql-tools at codegen.)*
- **Mobile sync safety.** Version-gate semantics are a correct fail-safe (null/unknown aborts sync; downgrade closes the gate without 400s); `SyncResetV1` clears all 8 fork Drift tables in one transaction; `pruneAssets` keep-set is correct (space-album-reachable assets kept, every join-row class has a delete channel, NULL-safe library term); archive inclusion is correct at the 6 remediated sites (L12 is the 7th); shelf count matches the timeline. Old-mobile-vs-new-server response skew is safe (unknown entity types logged-and-skipped).
- **Web.** rbac-6 owner-only link exposure is correctly gated and PII-free (spaceId/name/linkedById-UUID/showInTimeline only); revoke is server-gated; C4 viewer affordances are hidden on the space route (L10 is the non-space route); security-8 PII strip collapses the activity UI safely for space-only readers; public shared-link path excludes `sharedSpaceLinks`; SDK/OpenAPI artifacts are consistent with server DTOs.
- **CI.** Every gating workflow ran green against HEAD, including the first-time-in-CI items (Medium, E2E server/CLI/web, Docs, Revert-to-Immich, migration apply via SQL Schema Checks). The 6 skipped checks are all publish/release-only jobs. `make sql` regen is machine-verified at fixed point. The `correctness-4` **library-path** deferral is genuinely low-risk (no `shared_space_library_user` grant table exists, so nothing is stranded server-side; a raced member converges at the next completed mobile sync).

**Explicitly not exercised anywhere in this review:** live DB / medium / e2e execution (read-only, static tracing + fast unit tests only). Web realtime is a fork-wide limitation (space members get no live updates when a linked album changes; all web space surfaces are load-time) — flagged for the record, classified as pre-existing, not an album-arm regression.

---

*Generated 2026-07-08 from a 12-dimension, 61-agent adversarially-verified review of PR #759 at `3dfabc41ca`. 48 confirmed findings deduped to 40 canonical issues + 1 refuted.*
