# Face Cleanup — full per-face resolution (durable drain) — design

**Status:** approved (brainstorm 2026-07-10); UX validated with an interactive prototype (Model B). Ready
for `/writing-plans` → slice-by-slice implementation via `/impl-loop`.
**Branch / PR:** extends `feat/face-cleanup-console` (#664); implement on `feat/face-cleanup-resolution`.
**Origin:** user feedback from Hagen on the rc12 build (see screenshots in the PR thread) — a mixed-cluster
review needs more than move-or-keep.

**Prereqs / prior designs this builds on (all on `feat/face-cleanup-console`):**

- Console + review screen — [`2026-06-03-face-cleanup-console-design.md`](2026-06-03-face-cleanup-console-design.md)
- Reattribution engine (`applyRepair` / `executeRepair` / `reattributeFaces`) —
  [`2026-05-31-face-reattribution-repair-design.md`](2026-05-31-face-reattribution-repair-design.md)
- Per-face **decline** persistence (`face_repair_decline`, `applyDeclineFilters`, `/declined` manage page) —
  [`2026-06-05-face-cleanup-decline-design.md`](2026-06-05-face-cleanup-decline-design.md)
- **Add-faces / rest-of-cluster** — [`2026-06-25-face-cleanup-add-faces-design.md`](2026-06-25-face-cleanup-add-faces-design.md)
- **Persisted flagged-face snapshot** (apply reads stored per-face rows, no KNN) —
  [`2026-06-29-face-cleanup-flagged-faces-persist-design.md`](2026-06-29-face-cleanup-flagged-faces-persist-design.md)

> **Supersedes** add-faces Requirement 1 ("extra faces follow the on-screen destination — no per-face
> destination picker"). This design introduces a per-selection destination picker; the single-destination
> constraint no longer holds.

---

## 1. Motivation

The review screen (`/admin/face-cleanup/[personId]`) currently offers a flagged face exactly **two**
outcomes: leave it **checked** → move to the one suspected owner, or **uncheck** → stays with the reviewed
person **for this apply only** (transient — nothing persists, so the next scan re-flags it). A separate,
icon-only **⊘ Decline** (poorly discoverable) is the only durable "leave it," and it is keyed to that one
suspected owner.

Reviewing real mixed clusters, Hagen found four outcomes are needed — a flagged face may:

1. **Belong to the proposed match** → move it there. _(supported)_
2. **Belong to the reviewed person and look like them** → stay. _(only transiently supported)_
3. **Belong to the reviewed person but look nothing like them** — e.g. childhood photos of a now-elderly
   person — → stay **and be confirmed correct**, so re-clustering never flags them again. _(unsupported)_
4. **Belong to neither** the reviewed person nor the proposed match → go to a **third, chosen person**.
   _(unsupported)_

The screenshots also show a fifth: some crops are **not usable faces at all** (ski goggles) and belong to
nobody.

The deeper ask: turn review from a _this-pass action_ into a **durable queue that drains** — every flagged
face resolves to exactly one persisted terminal state and never silently reappears. "Weeks later, an
unresolved suggestion must be distinguishable from a genuinely new problem."

## 2. Requirements (locked in brainstorm 2026-07-10)

1. **Full durable drain.** Every flagged face reaches one persisted terminal state; resolved faces never
   re-surface on a later scan.
2. **Two stay-strengths.** A _soft stay_ records a decline against **this** suspected owner (a genuinely
   different owner may still be proposed later); a _confirm/lock_ records an **owner-agnostic** lock (never
   re-flagged, whatever owner a future scan proposes). This absorbs today's transient uncheck **and** the
   `⊘` into one coherent pair of explicit actions.
3. **Move to a chosen person.** A searchable picker targets **any** library person or unnamed cluster —
   not just the scan's suggestion — and can **create a new person**. Different selections can go to
   different destinations.
4. **Not a usable face → detach.** Set `asset_face.personId = null` (Immich's unassign). Non-destructive;
   the crop stays on the photo and is recoverable via the normal unassigned-faces UI.
5. **Interaction model: select + bulk action bar (Model B).** Faces default to → Owner; the admin
   multi-selects the exceptions and routes the whole selection from a bar. Chosen because it scales to the
   120–920-face clusters these mixed clusters actually reach, and mirrors Immich's existing multi-select
   face UI.
6. **Batch Apply.** One `Apply` commits every outcome together (moves + declines + locks + detaches) for
   undo-safety; nothing persists mid-review.
7. **Unified Resolutions manage page.** Soft-declines **and** locks are listed and undoable on one page
   (undo = delete the row so the face is eligible to be flagged again). Detach is **not** tracked there.
8. **Keep the rest-of-cluster power feature** ("Rest of this cluster" + "Move entire cluster") intact.

## 3. Terminal states → persistence

| #   | State                | Bulk action               | Server effect                                               | Drains because                                            |
| --- | -------------------- | ------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| 1   | Move → owner         | default chip              | `reattributeFaces(person → suspectedOwner)`                 | face is now correctly attributed                          |
| 2   | Move → chosen person | `Move → person…` (picker) | `reattributeFaces(person → chosen)`                         | same                                                      |
| 3   | Soft stay            | `Keep here`               | insert `face_repair_decline(assetFaceId, suspectedOwnerId)` | scan drops this `(face, owner)` pairing                   |
| 4   | Confirm / lock       | `Confirm / lock`          | insert `face_repair_lock(assetFaceId, personId)`            | scan drops this face for **all** owners                   |
| 5   | Detach               | `Not a face`              | `asset_face.personId = null` + delete its `face_identity`   | face leaves every cluster; scan only sees clustered faces |

The default (state 1) is a _resolution_, so with N flagged faces the outcome tally always sums to N — the
UI can prove "every face accounted for," and `Apply` removes the person from the scan snapshot.

## 4. Interaction model (Model B — validated by prototype)

Single flagged grid (the persisted scan snapshot for the person). Every tile starts with the blue **→
Owner** chip.

- **Select**: click toggles a tile; **shift-click** selects a range; **Select all** selects the grid.
- **Route**: when ≥1 tile is selected the sticky bottom **dock** swaps from the outcome tally into a dark
  **bulk bar** with: `→ Owner` · `Keep here` · `Confirm / lock` · `Move → person…` · `Not a face`. The
  action retags every selected tile with its colored state chip and clears the selection.
- **Picker** (`Move → person…`): a searchable modal listing named people and unnamed clusters (avatar +
  face count + short id), plus **Create new person "<query>"** when the query matches nothing. Selecting a
  destination retags the selection with a `→ <Name>` chip.
- **Dock tally** (nothing selected): live counts `N → Owner · N Keep · N Locked · N → other · N Detach`
  with "every face accounted for", and the single **Apply · N faces** button.
- **Retired**: the transient uncheck and the `⊘` icon are gone. Keeping a face is now the explicit (but
  cheap, bulk) `Keep here`.

State colors (also the manage page + legend): owner `#4f46e5`, stay `#16a34a`, lock `#7c3aed`, other
`#d97706`, detach `#475569`.

## 5. Server architecture

### 5.1 Scan honors locks

`FaceRepairDeclineRepository.getDeclineMaps` today returns `declinedFaceOwners: Map<assetFaceId,
Set<suspectedOwnerId>>`, consumed by `applyDeclineFilters` (`src/utils/face-repair.ts`) at **both** scan-flag
time and apply-read time. Extend it with `lockedFaceIds: Set<assetFaceId>` (loaded from `face_repair_lock`);
`applyDeclineFilters` drops any face in that set outright, before the per-owner decline check. This makes
locks owner-agnostic and reuses the one filtering seam already applied everywhere flagged faces are read.

### 5.2 Data model

- **Reuse** `face_repair_decline` for state 3 (soft stay) — unchanged.
- **New fork table** `face_repair_lock`:
  - columns: `id` (`@PrimaryGeneratedUuidV7Column`), `assetFaceId uuid` (FK `asset_face` `onDelete: CASCADE`),
    `personId uuid` (FK `person` `onDelete: CASCADE`, the reviewed person it was confirmed on),
    `createdBy uuid`, `createdAt timestamptz`.
  - **plain** `UNIQUE (assetFaceId)` index — a partial index would need a `migration_overrides` entry for
    SQL Schema Checks CI (see the decline table's note). One lock per face; re-locking is idempotent
    (`ON CONFLICT DO NOTHING`).
  - new migration in `server/src/schema/migrations-gallery/` with a round timestamp (e.g.
    `1782000000000`), after the decline table's `1781000000000`.
- **Detach**: new `FaceRepairRepository.detachFaces(personId, faceIds, trx)` mirroring `reattributeFaces`'s
  guards (`sourceType = MachineLearning`, `isVisible = true`, `deletedAt is null`, `personId = :personId`),
  setting `personId = null` and returning affected ids. In the **same transaction**, delete the
  `face_identity` rows for those faces so a later `FaceIdentityBackfill` cannot re-resolve them onto the old
  person (same failure class the A1 move-transaction fix addresses).

### 5.3 Resolve endpoint (replaces the 2-state apply for Model B)

The old `POST /admin/face-repair/apply` (`approvedPersonIds` + `excludeFaceIds` + single `manualMove`)
encodes the retired 2-state UI. Introduce a resolution endpoint whose payload mirrors the UI buckets:

```
POST /admin/face-repair/resolve
  body FaceRepairResolveRequestDto {
    personId: uuid,
    moveToPerson: { destinationPersonId: uuid, faceIds: uuid[] }[],  // owner = one group
    stay:   uuid[],   // soft decline vs each face's stored suspectedOwnerId
    lock:   uuid[],   // owner-agnostic lock, confirmed on personId
    detach: uuid[],
  }
  → FaceRepairResolveResponseDto { moved, declined, locked, detached, skipped }
```

Semantics, reusing existing primitives:

- Read the person's **stored flagged snapshot** (the flagged-faces-persist read) and re-apply
  `applyDeclineFilters` — apply only acts on faces still on the person and still eligible; anything moved
  off since the scan is silently dropped, and `executeRepair` re-checks still-on-source at write time.
- `moveToPerson` → build `plan.toRepair` routes and call the existing `executeRepair` (destination-agnostic;
  "owner" is just one group). Its transaction wraps re-attribution + identity relink, and it regenerates
  representative-face thumbnails — unchanged.
- `stay` → `FaceRepairDeclineRepository.createDeclines` for each `(assetFaceId, its stored suspectedOwnerId)`.
- `lock` → insert `face_repair_lock(assetFaceId, personId)` (`ON CONFLICT DO NOTHING`).
- `detach` → `detachFaces` (§5.2).
- **Guards reused**: refuse while `FacialRecognition` is active or a scan is pending/running; fail stale
  scans first.
- **Cleanup reused**: after mutation, run the emptied-**unnamed**-cluster auto-delete
  (`countEligibleFaces` / `countAllFaces` gate) and `removePersonsFromLatestScan([personId, …drained
destinations])`, exactly as `applyRepair` does today.
- **Create-new-person** is done client-side via Immich's existing `createPerson`; the new id arrives in
  `moveToPerson[].destinationPersonId`. No new person endpoint.

The old `apply` endpoint + DTO are removed once the page is migrated (fork-only, pre-GA — no compat burden).

### 5.4 Manage / undo

Extend `listDeclines` / `removeDeclines` into a **resolutions** surface: `GET
/admin/face-repair/resolutions` returns declines **and** locks (tagged `kind: 'decline' | 'lock'`, each with
face/person thumbnails and `createdAt`); `POST /admin/face-repair/resolutions/remove` deletes rows by id or
by natural key. Undo uses `z.uuid()` (rows are uuid **v7** — `z.uuidv4()` rejects them, the bug that broke
decline undo). Detach is not represented (recover via the normal unassigned-faces UI).

## 6. Web architecture

- **`[personId]/+page.svelte`** reworked to Model B: one flagged grid, default-owner chips, selection
  (click · shift-range · select-all), the summary↔bulk dock, the picker modal, the live tally, one Apply
  that posts the resolve buckets. The prototype
  (`.superpowers/brainstorm/…/model-b-refined.html`) is the visual reference.
- **`review.svelte.ts`** view-model reworked: track a per-face `state` (+ destination for `other`); expose
  `selection` ops; derive the tally; produce `FaceRepairResolveRequestDto`. Unit-test the bucket builder.
- **Picker**: reuse an existing people-combobox primitive if one exists in the web tree
  (search + create-new); otherwise the modal as prototyped. Lists all library people + unnamed clusters.
- **Rest-of-cluster** section is retained; with the picker present, its manual moves may target the same
  chosen destination (a natural, additive consequence — not a separate build).
- **`declined/+page.svelte`** → **`resolutions/+page.svelte`**: two grouped lists (Declines, Locks), each
  row undoable, matching the state colors.
- i18n keys added under `admin.face_cleanup_*`; OpenAPI/SDK regenerated for the new DTOs; Dart client not
  required (admin console is web-only).

## 7. Edge cases

- **E1 — Face moved off since scan.** Resolve reads the stored snapshot + `applyDeclineFilters` +
  `executeRepair`'s still-on-source re-check → silently skipped, counted in `skipped`.
- **E2 — Lock then later a different owner.** Locked face never re-flagged (owner-agnostic set), so the
  age-gap childhood photos stay put across re-clusters — the core of case 3.
- **E3 — Soft-stay then a genuinely different owner.** The `(face, ownerA)` decline does **not** suppress a
  future `(face, ownerB)` flag → a real new problem still surfaces, distinguishable from a locked face. As
  intended.
- **E4 — Detach + identity backfill.** Deleting the `face_identity` row in the detach transaction prevents
  re-resolution onto the old person.
- **E5 — Detached face re-clustered later.** A future `FacialRecognition` run could re-cluster an orphan
  face into some person and it could be flagged again. Accepted for v1; a suppression flag is a possible
  fast-follow (§9).
- **E6 — Destination drained to empty.** If a move empties an **unnamed** source (or the move-to-person
  drains an unnamed cluster), the existing auto-delete removes it; **named** persons are never auto-deleted.
- **E7 — Same face in two buckets.** The web guarantees one state per tile; the server validates the
  buckets are disjoint and rejects overlaps with 400.
- **E8 — Create-new-person race / empty name.** Client creates the person first; if creation fails the
  picker surfaces the error and the selection is untouched (nothing applied).
- **E9 — Concurrency.** Recognition/scan-active guards reused verbatim → 409 with the existing review-page
  conflict message.
- **E10 — Apply with zero overrides.** Valid: all flagged faces move to owner (today's default behavior),
  person leaves the queue.

## 8. Testing

- **Server (medium, real DB):** one spec per bucket — move-to-owner, move-to-chosen-person (incl. a second
  distinct destination), soft-stay writes a decline row + is dropped on re-scan, lock writes a lock row +
  is dropped for **any** owner on re-scan, detach nulls `personId` + removes `face_identity`. Plus:
  disjoint-bucket validation (E7), empty-unnamed-cluster cleanup (E6), still-on-source skip (E1),
  recognition-active guard (E9), drain-completeness (tally sums to N; person removed from snapshot).
- **Web (vitest):** `review.svelte.ts` bucket-builder unit tests (each state → correct bucket; picker
  destination grouping; tally sums to N); component tests for selection (click/shift/select-all), the
  dock summary↔bulk swap, and picker create-new. Avoid the onMount-awaits-rejected-promise anti-pattern
  from the advanced-scan notes.
- **E2E:** update `e2e/src/specs/web/face-cleanup.e2e-spec.ts` to drive select → route → Apply and assert
  the resolve payload + post-apply queue drain.

## 9. Non-goals / future

- **Hard-delete of a detection** (vs detach) — deferred; users can escalate later.
- **Detach suppression flag** so re-clustering can't resurface a known non-face — fast-follow if E5 bites.
- **Per-face different owner within one bulk action** — already covered: route selection A to person X,
  then selection B to person Y (two bulk actions).
- **Mobile** — the console is web-admin only.

## 10. Rollout

Pre-GA fork feature (RC only) → no deployed-DB compat burden; the `face_repair_lock` migration is additive.
Steps: new migration → server build → `pnpm sync:open-api` → `make open-api-typescript` → web. Format docs
with the **docs** package prettier before commit (CI Docs Build is strict).
