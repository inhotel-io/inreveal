# Face Cleanup — full per-face resolution (durable drain) — design

**Status:** approved (brainstorm 2026-07-10); **revised 2026-07-10 post-review** — reconciled the resolve
endpoint with the retained rest-of-cluster feature, made owner-move per-face, scoped the picker to the
cluster's owner, and added the TDD mandate + full test matrix. UX validated with an interactive prototype
(Model B). Ready for `/writing-plans` → slice-by-slice implementation via `/impl-loop`.

**Branch / PR:** extends `feat/face-cleanup-console` (#664); implement on `feat/face-cleanup-resolution`.
**Origin:** user feedback from Hagen on the rc12 build (see screenshots in the PR thread) — a mixed-cluster
review needs more than move-or-keep.

**Implementation approach — TDD (non-negotiable).** Every slice follows red-green-refactor
(`superpowers:test-driven-development`): write the failing test **first**, watch it fail for the right
reason, implement the minimum to pass, then refactor. No production line lands without a test that would
fail without it. The §8 matrix is the coverage contract — every edge case E1–E15 maps to a named test.

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
3. **Move to a chosen person.** A searchable picker targets any person or unnamed cluster **owned by the
   same user as the reviewed cluster** (the scan is owner-scoped) — not just the scan's suggestion — and can
   **create a new person** under that owner. Different selections can go to different destinations. Faces are
   never reassigned across owners.
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

The old `POST /admin/face-repair/apply` (`approvedPersonIds` + `excludeFaceIds` + single `manualMove`) and
the add-faces `entireCluster` path together encode the retired 2-state UI **and** the rest-of-cluster power
feature. One resolution endpoint **replaces both** — its payload mirrors the UI buckets and also carries the
rest-of-cluster/entire-cluster moves so nothing is orphaned when the old apply is removed:

```
POST /admin/face-repair/resolve
  body FaceRepairResolveRequestDto {
    personId: uuid,
    moveToPerson: { destinationPersonId: uuid, faceIds: uuid[] }[],  // any eligible face on the person
    entireCluster?: { destinationPersonId: uuid },                   // server-enumerated whole-cluster move
    stay:   uuid[],   // FLAGGED faces only — soft decline vs each face's stored suspectedOwnerId
    lock:   uuid[],   // FLAGGED faces only — owner-agnostic lock, confirmed on personId
    detach: uuid[],   // FLAGGED faces only — unassign
  }
  → FaceRepairResolveResponseDto { moved, declined, locked, detached, skipped }
```

**Owner-move is per-face.** Each flagged face carries its own `suspectedOwnerId` in the stored snapshot
(faces in a mixed cluster can point to different owners; the UI's single owner headline is display-only).
"Move → owner" therefore is not one destination — the web groups the owner-bound faces **by each face's
`suspectedOwnerId`** into `moveToPerson` groups. "Move → chosen person" is just another group. The server
treats every `moveToPerson` group identically.

Semantics, reusing existing primitives:

- **`moveToPerson`** accepts any face **currently on `personId` and eligible** (`isVisible`, ML-sourced, not
  deleted) — this is what lets the same endpoint carry both flagged faces **and** rest-of-cluster faces the
  admin added. Group faces into `plan.toRepair` routes and call the existing `executeRepair`
  (destination-agnostic; its transaction wraps re-attribution + identity relink and regenerates
  representative-face thumbnails). Faces not on `personId` at write time are skipped (`executeRepair`
  re-checks still-on-source) and counted in `skipped`.
- **`entireCluster`** enumerates every eligible face of `personId` **server-side** (reuse
  `collectClusterFaceIds` / `streamEligibleFaces`) → one route to `destinationPersonId`. Client-confirmed
  (it empties the cluster). Mutually exclusive with the per-face buckets.
- **`stay` / `lock` / `detach`** act only on the person's **stored flagged snapshot** (read via the
  flagged-faces-persist path); the server **validates each id is in that snapshot** and 400s otherwise
  (a non-flagged rest-of-cluster face has no `suspectedOwnerId` and no "keep/lock/detach" meaning). Re-apply
  `applyDeclineFilters` so faces declined/locked/moved-off since the scan are dropped.
  - `stay` → `FaceRepairDeclineRepository.createDeclines` for each `(assetFaceId, its stored
suspectedOwnerId)`, `declinedBy` = the admin.
  - `lock` → insert `face_repair_lock(assetFaceId, personId, createdBy)` (`ON CONFLICT DO NOTHING`).
  - `detach` → `detachFaces` (§5.2).
- **Disjoint buckets.** A face may appear in at most one bucket; the server rejects overlaps with 400 (E7).
- **Guards reused**: refuse while `FacialRecognition` is active or a scan is pending/running; fail stale
  scans first.
- **Drop on _any_ resolution.** After a committed resolution — moves **or** declines **or** locks **or**
  detaches (not only `moved > 0`, unlike today's `applyRepair`) — remove `personId` (plus any unnamed
  destination cluster the move drained) from the latest scan via `removePersonsFromLatestScan`, so a person
  resolved entirely by keeping/locking still leaves the console immediately.
- **Cleanup reused**: emptied-**unnamed**-cluster auto-delete (`countEligibleFaces` / `countAllFaces` gate);
  **named** persons are never auto-deleted.
- **Owner-scoped people for the picker.** Immich's own `getAllPeople` / `createPerson` are **self-scoped**
  (the caller's own people), so an admin re-attributing another user's cluster needs dedicated admin
  endpoints: `GET /admin/face-repair/owner/:ownerId/people?query=&page=` (paginated search over that owner's
  `person` rows, named + unnamed) and `POST /admin/face-repair/owner/:ownerId/people` (create a person under
  `ownerId`). Both `@Authenticated({ admin: true })`. Create-new returns the id, which the web passes as a
  `moveToPerson[].destinationPersonId`.

The old `apply` endpoint + DTO and the standalone `entireCluster` apply path are removed once the page is
migrated (fork-only, pre-GA — no compat burden). The paginated `cluster-faces` list endpoint (add-faces)
stays — it feeds the rest-of-cluster grid.

### 5.4 Manage / undo

Extend `listDeclines` / `removeDeclines` into a **resolutions** surface: `GET
/admin/face-repair/resolutions` returns declines **and** locks (tagged `kind: 'decline' | 'lock'`, each with
face/person thumbnails and `createdAt`); `POST /admin/face-repair/resolutions/remove` deletes rows by id or
by natural key. Undo uses `z.uuid()` (rows are uuid **v7** — `z.uuidv4()` rejects them, the bug that broke
decline undo). Detach is not represented (recover via the normal unassigned-faces UI).

## 6. Web architecture

**The committed mockup [`2026-07-10-face-cleanup-resolution-mockup.html`](2026-07-10-face-cleanup-resolution-mockup.html)
is the visual source of truth** — the implementation must reproduce its layout, states, colors, and copy.
Concretely, `[personId]/+page.svelte` + `review.svelte.ts` are reworked to:

- **Header + banner** — unchanged person header; banner reads "N faces need review — every one leaves the
  queue once you apply".
- **Flagged grid** — one grid (`data-testid="flagged-grid"`), each tile (`data-testid="face-tile"`,
  `data-faceid`, `data-state`) starts in state `owner` with a **per-face** chip showing **that face's own
  suspected-owner name** (resolved from the scan's `suspectedOwners`; uniform = the headline owner, as in
  the mockup). State chips + colors exactly per §4: `owner #4f46e5`, `stay #16a34a`, `lock #7c3aed`,
  `other #d97706`, `detach #475569`; detached tiles render grayscale.
- **Selection** — click toggles; **shift-click** selects a range; **Select all** (`data-testid="select-all"`)
  and **Reset** (revert every tile to `owner`) in the grid header.
- **Sticky dock** (`data-testid="dock"`) swaps on selection:
  - **empty selection → summary**: live tally chips (`data-testid="tally"`) that always sum to N,
    "every face accounted for", and one **Apply · N faces** button (`data-testid="apply-btn"`).
  - **≥1 selected → bulk bar** (`data-testid="bulk-bar"`): `→ Owner` · `Keep here` · `Confirm / lock` ·
    `Move → person…` · `Not a face` · Clear. Each retags the selection and clears it.
- **Person-picker modal** (`data-testid="person-picker"`, opened from `Move → person…`): searches the
  **admin owner-scoped people endpoint** above (named people + unnamed clusters of the cluster's owner,
  avatar + face count + short id), plus **Create new person "<query>"** which POSTs to the owner-scoped
  create endpoint and routes the selection to the returned id. Selecting a destination sets those tiles to
  `other` with a `→ <Name>` chip.
- **View-model** (`review.svelte.ts`): tracks a per-face `state` (+ `destinationPersonId`/name for `other`),
  selection ops, the derived tally, and a **pure `buildResolveRequest()`** that emits
  `FaceRepairResolveRequestDto` — grouping `owner`/`other` faces by destination, and emitting
  `stay`/`lock`/`detach` id lists. This pure builder is the primary unit-test seam (§8).
- **Rest-of-cluster** section (add-faces) is retained but is **move-only**: its tiles feed the same
  `moveToPerson` buckets (to the owner by default, or a picked destination); they never carry
  keep/lock/detach. "Move entire cluster" posts `entireCluster`.
- **Manage page** `declined/+page.svelte` → **`resolutions/+page.svelte`**: two grouped, undoable lists
  (Declines, Locks) matching the state colors; undo hits `resolutions/remove`.
- The dashboard **person-level Dismiss** (declines all suspected owners for a person) is **unchanged**.
- i18n keys under `admin.face_cleanup_*`. OpenAPI/SDK regenerated; because the resolve DTO is a required
  `@Body()`, the SDK arg is **required** — the web must always pass `{ faceRepairResolveRequestDto: {...} }`,
  never `undefined` (see `feedback_openapi_body_required_oazapfts`). Dart client not required (web-only).

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
- **E11 — Cross-owner destination.** The picker only lists the cluster owner's people; the server
  **independently validates** every `destinationPersonId` is owned by the same user as the moved faces'
  assets and 400s otherwise — a face is never reassigned across owners.
- **E12 — Entire-cluster move without paging.** `entireCluster` is enumerated server-side, so a
  thousand-face cluster moves without the client having paged it; it is mutually exclusive with the per-face
  buckets (server 400s if both are present).
- **E13 — Resolved with no moves.** A person whose every flagged face is kept/locked (zero moves) still
  drops from the scan snapshot on Apply (drop-on-any-resolution) — it does not linger in the console.
- **E14 — Multi-owner mixed cluster.** Faces flagged toward different suspected owners are grouped per-face
  by `suspectedOwnerId`; each owner-bound face moves to **its own** owner, not one primary.
- **E15 — Keep/lock/detach on a non-flagged face.** A rest-of-cluster face id in `stay`/`lock`/`detach` is
  rejected 400 (not in the flagged snapshot; it has no suspected owner and no such meaning).

**TDD is the build discipline (see the Status block).** Each slice writes its failing test first. The tests
below are the coverage contract, not a suggestion — the matrix at the end maps every edge case to a named
test, and no slice is "done" until its rows are green.

### 8.1 Server — pure unit (`src/utils/face-repair.spec.ts`)

- **U1** `applyDeclineFilters` with a `lockedFaceIds` set drops a locked face for **every** suspected owner
  (owner-agnostic), independent of the per-owner decline map. _(E2)_
- **U2** a soft-declined `(face, ownerA)` is dropped only for `ownerA`; the same face flagged toward `ownerB`
  survives the filter. _(E3)_
- **U3** the resolve **bucket validation** helper flags overlapping ids (E7) and non-flagged ids in
  stay/lock/detach (E15) as errors.

### 8.2 Server — medium (real DB: `face-repair.service` / `.repository` / `face-repair-e2e` specs)

- **M1** move-to-owner: each flagged face → **its own** `suspectedOwnerId`; `asset_face.personId` updated,
  identity relinked, representative-face thumbnail regen queued. _(state 1)_
- **M2** move-to-chosen-person with **two distinct destinations** in one resolve → both applied. _(state 2)_
- **M3** multi-owner mixed cluster: owner-bound faces with differing `suspectedOwnerId` each land on their
  own owner. _(E14)_
- **M4** soft-stay writes a `face_repair_decline(face, suspectedOwner)` row; a re-run scan no longer flags
  that pairing; a genuinely different owner still can. _(state 3, E3)_
- **M5** lock writes a `face_repair_lock` row; a re-run scan drops the face for **any** owner; re-locking is
  idempotent (`ON CONFLICT DO NOTHING`). _(state 4, E2)_
- **M6** detach nulls `personId`, deletes the `face_identity` row, and a subsequent `FaceIdentityBackfill`
  does **not** reattach it to the source. _(state 5, E4)_
- **M7** disjoint-bucket violation → 400. _(E7)_
- **M8** empty-**unnamed**-cluster auto-delete on drain; a drained **named** person is **kept**. _(E6)_
- **M9** face moved off the person since the scan → skipped, counted in `skipped`. _(E1)_
- **M10** resolve while `FacialRecognition` / a scan is active → 409 with the review-page conflict message.
  _(E9)_
- **M11** drop-on-any-resolution: a keep/lock-only resolve (zero moves) still removes the person from the
  latest scan snapshot. _(E13)_
- **M12** cross-owner `destinationPersonId` → 400. _(E11)_
- **M13** `entireCluster` moves every eligible face (server-enumerated); `entireCluster` **and** per-face
  buckets together → 400. _(E12)_
- **M14** keep/lock/detach id not in the flagged snapshot → 400. _(E15)_
- **M15** zero-overrides resolve → all flagged faces move to owner; person drops from the console. _(E10)_
- **M16** resolutions list returns declines **and** locks tagged by `kind`; remove by **uuid-v7 id** _and_
  by natural key both succeed (regression guard for the `z.uuidv4` rejection); undoing a lock re-enables
  flagging on the next scan.

### 8.3 Server — controller (`face-repair-admin.controller.spec.ts`)

- **C1** `resolve` and `resolutions*` require an **admin** session (non-admin → 403).
- **C2** zod DTO validation is wired (malformed body → 400; `resolutions/remove` accepts `z.uuid()` v7).

### 8.4 Web — unit (`review.svelte.ts`)

- **W1** `buildResolveRequest()` groups `owner` faces by **each face's** `suspectedOwnerId`, groups `other`
  faces by chosen destination, and emits correct `stay`/`lock`/`detach`/`entireCluster`. _(E14)_
- **W2** the outcome tally **always sums to N** across every sequence of bulk actions (invariant test).
- **W3** bulk actions mutate per-face state correctly; Reset returns all tiles to `owner`.

### 8.5 Web — component (`[personId]/page.spec.ts`, `review.spec.ts`)

- **P1** selection: click toggle, **shift-click range**, Select-all, Clear.
- **P2** dock swaps summary ↔ bulk bar on selection count.
- **P3** picker lists **owner-scoped** people + unnamed clusters, filters on search, and **Create-new**
  calls `createPerson` then routes the selection; if `createPerson` **fails**, nothing is applied and the
  error surfaces. _(E8)_
- **P4** Apply posts `{ faceRepairResolveRequestDto: {...} }` (never `undefined`) matching the on-screen
  states. Avoid the onMount-awaits-rejected-promise anti-pattern from the advanced-scan notes.
- **P5** stale/empty flagged set renders the graceful state (existing behavior preserved).

### 8.6 E2E (`e2e/src/specs/web/face-cleanup.e2e-spec.ts`)

- **X1** drive select → route (one face into each of the five states) → Apply; assert the resolve payload and
  that the person **drains from the console**.
- **X2** Resolutions page: a lock/decline appears, Undo removes it, and a re-scan re-flags the face.

### 8.7 Coverage map

| Edge | Test(s)                                                               | Edge | Test(s) |
| ---- | --------------------------------------------------------------------- | ---- | ------- |
| E1   | M9                                                                    | E9   | M10     |
| E2   | U1, M5                                                                | E10  | M15     |
| E3   | U2, M4                                                                | E11  | M12     |
| E4   | M6                                                                    | E12  | M13     |
| E5   | _accepted, untestable (future recognition run) — documented, no test_ |      |         |
| E6   | M8                                                                    | E13  | M11     |
| E7   | U3, M7                                                                | E14  | M3, W1  |
| E8   | P3                                                                    | E15  | U3, M14 |

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
