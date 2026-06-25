# Face Cleanup Console — see & select all cluster faces — design

**Status:** approved (brainstorm 2026-06-25); ready for slice-by-slice implementation
**Branch / PR:** `feat/face-cleanup-console` — implemented and shipped on the same branch as the console.
**Prereq:** the Face Cleanup Console review screen
([`2026-06-03-face-cleanup-console-design.md`](2026-06-03-face-cleanup-console-design.md)),
its scan engine and the reattribution apply path
([`2026-05-31-face-reattribution-repair-design.md`](2026-05-31-face-reattribution-repair-design.md))
are already on this branch. Key existing primitives this design reuses:
`FaceRepairService.applyRepair` / `executeRepair`, `FaceRepairRepository.streamEligibleFaces` /
`reattributeFaces`, `PersonRepository.delete`, and `FaceRepairScanRepository.removePersonsFromLatestScan`.

## Motivation

The review screen (`/admin/face-cleanup/[personId]`) only ever shows the **scan-flagged** subset of a
cluster's faces — the 2-of-3 the detector suspected belong to another owner. The admin has no way to:

1. **See the rest of the cluster.** If the unnamed cluster is actually Pierre, the admin wants to move
   _every_ face into Pierre, not just the two the scan happened to flag.
2. **Add faces the scan missed.** A real-but-incomplete flag set leaves correct-but-unflagged faces
   stranded; the admin should be able to opt them into the same move.

This feature turns the review screen into a complete face-management surface for the cluster: the scan's
suggestions stay exactly as they are, and a new paginated section exposes the rest of the cluster so the
admin can add individual faces or move the whole cluster in one action.

## Requirements (locked in brainstorm)

1. **Extra faces follow the on-screen destination.** Faces the admin manually selects move to the same
   primary suspected owner already shown on the review screen (e.g. Pierre). No per-face destination
   picker — the screen has exactly one destination. (The primary owner is `suspectedOwners[0]`, the
   highest-count suspect, already surfaced as `primaryOwner`.)
2. **Two sections, distinct meaning.** The scan's flagged faces keep their own **Suggested by scan**
   section (pre-checked, decline/exclude unchanged — its audit meaning is preserved). A new **Rest of this
   cluster (M)** section lists every _other_ visible face, unchecked by default; the admin opts faces in.
3. **Pagination is mandatory.** A cluster can hold **thousands** of faces. The Rest section is
   server-paginated (lazy "Load more"); the client never loads the whole cluster to render or to move it.
4. **Move entire cluster.** A header action moves _every_ remaining visible face to the primary owner —
   flagged faces included — enumerated **server-side**, so it works without the client having paged through
   the cluster. It is confirmed (it empties the cluster).
5. **Auto-delete the emptied _unnamed_ cluster.** When a move leaves the source cluster with **0 visible
   faces** _and the source is unnamed_ (`person.name` empty), the source person row is deleted. Moving a
   whole unnamed cluster into Pierre therefore behaves like a clean merge — no orphan empty "Unnamed
   cluster" remains, and the console drops it. A **named** person emptied this way is **never** auto-deleted
   (its name is intentional state); the row is kept and simply leaves the console.
6. **No regression to the flagged path.** The existing approve-suggestions apply
   (`approvedPersonIds` + `excludeFaceIds`) is unchanged byte-for-byte; the manual capability is **additive**.

## Architecture

### Server

**1. List the rest of the cluster (paginated).** New admin endpoint — `POST` so the (small) flagged-id
exclude list rides in the body rather than a long URL:

```
POST /admin/face-repair/person/:personId/cluster-faces
  body: { excludeFaceIds: string[]; page: number; size: number }
  → { faces: { assetFaceId: string }[]; total: number; hasMore: boolean }
```

Backed by a new `FaceRepairRepository.getClusterFacePage(personId, { excludeFaceIds, limit, offset })`
that reuses the existing eligibility filter (`asset_face.isVisible = true`,
`sourceType = MachineLearning`, `deletedAt is null`, `asset.deletedAt is null`),
`asset_face.personId = :personId`, `id NOT IN (excludeFaceIds)`, ordered by `asset_face.id`
(stable cursor for paging), `LIMIT size OFFSET page*size`. `total` is the same filter's `COUNT(*)`;
`hasMore = (page+1)*size < total`. The client passes the flagged ids it already holds from
`getFaceRepairPersonFaces`, so the two sections never overlap and the server does **no plan rebuild per
page** (cheap at thousands of faces). `size` is validated (1–200) and `page` (≥ 0).

**2. Apply: manual faces + whole cluster.** Extend `FaceRepairApplyRequestDto` — the existing fields are
untouched; one optional block is added:

```ts
manualMove?: {
  personId: string;            // the reviewed cluster (source)
  destinationPersonId: string; // its primary suspected owner
  faceIds?: string[];          // explicit extra faces to move (partial add)
  entireCluster?: boolean;     // move ALL remaining visible faces of the cluster
};
```

`applyRepair` runs the existing flagged plan first (unchanged), **then** the manual move:

- **Resolve the face set.** `entireCluster` → server enumerates all visible ML faces of `personId`
  (via `streamEligibleFaces({ personId })` / a dedicated id query); otherwise the explicit `faceIds`.
- **Route + execute** through the _same_ machinery as flagged moves: build a single route
  `from = personId → to = destinationPersonId` and run it through `executeRepair`'s per-route logic — the
  **still-on-source re-check** (a face already moved is skipped), the destination-exists check, the
  `manual` identity link (`replaceFaceIdentity({ source: 'manual' })`), the representative-face reconcile,
  and the thumbnail-regen queue. Reusing `executeRepair` means the manual path inherits every durability
  guarantee the flagged path already has, and double-moves (a face that is both flagged and in
  `entireCluster`) are inherently safe.
- **Auto-delete empty source.** After all moves, if the source cluster has 0 visible ML faces left **and
  the source person is unnamed** (`person.name` null/empty), `personRepository.delete([personId])`. A named
  source emptied this way is **kept** (its name is deliberate state). The existing
  `removePersonsFromLatestScan` step still runs regardless, so the console drops the cluster either way.

The existing 409 guards (`FacialRecognition` queue active, or a scan pending/running) already wrap
`applyRepair` and now protect the manual path too — no new guard code.

**Entire-cluster vs. flagged-path interplay.** When the admin chooses **Move entire cluster**, the client
omits the person from `approvedPersonIds` and sends only `manualMove.entireCluster = true`, so _all_ faces
(flagged included) go to the **primary** owner rather than their per-face suspected owners. For a partial
add, the client sends both `approvedPersonIds: [personId]` (flagged → their suspects, minus
excludes/declines) and `manualMove.faceIds` (the unflagged picks → primary owner); the two sets are
disjoint, and the still-on-source re-check makes any accidental overlap a no-op.

### Web

**View model** (`[personId]/review.svelte.ts`) gains, alongside the existing `excluded` / `declined` sets:

- `manualSelected: SvelteSet<string>` — unflagged faces opted into the move.
- `entireCluster: boolean` — whole-cluster mode.
- `toggleManual(id)`, `selectAllLoaded(ids)`, `clearManual()`, `setEntireCluster(on)`.
- `movingCount` extended: `entireCluster` → `clusterTotal`; else flagged-not-excluded-not-declined +
  `manualSelected.size`.
- `applyPayload()` helper that produces the `{ approvedPersonIds, excludeFaceIds, manualMove }` body for
  the two cases above (entire-cluster vs. partial), keeping payload construction unit-testable in isolation
  from the Svelte component.

**Screen** (`[personId]/+page.svelte`): the top half (banner, Stays→Moves strip, Suggested grid) is
unchanged. Below it, the **Rest of this cluster (M)** section:

- Loads page 0 of `cluster-faces` on mount (passing the flagged ids as `excludeFaceIds`); a **Load more**
  button fetches subsequent pages. `M = total`.
- Each tile toggles `manualSelected`; selected tiles get the same `→ {owner}` treatment as suggested tiles.
- Header actions: **Select all** (adds the currently-loaded face ids to `manualSelected`) and **Move entire
  cluster** (sets `entireCluster`, opens a confirm dialog — "This moves all M faces to {owner} and removes
  the empty _Unnamed cluster_").
- The Stays/Moves strip counts and the sticky **Move N faces** button fold in manual picks / entire-cluster
  live. Apply calls the extended `applyFaceRepair`.

### OpenAPI

New endpoint + DTO fields require a **full `make open-api`** (Java — TS + Dart). A TS-only regen passes
locally but hides Dart drift and fails the "OpenAPI Clients" CI check. Commit `open-api/immich-openapi-specs.json`
and the regenerated Dart client alongside the TS SDK.

## Edge cases (all must be covered by tests — see Testing)

| #   | Case                                                                                                           | Expected behaviour                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Cluster with **only** flagged faces (Rest is empty)                                                            | Rest section shows empty state; `total = 0`, `hasMore = false`; Move-entire-cluster still moves the flagged faces.                           |
| E2  | Cluster with **thousands** of faces                                                                            | Rest paginates; first page renders fast; Move-entire-cluster moves all without the client paging through them.                               |
| E3  | `excludeFaceIds` covers a whole page boundary                                                                  | Pagination math stays correct (`total`/`hasMore` computed against the filtered count, not the raw count).                                    |
| E4  | Move **entire cluster**                                                                                        | Every visible face (flagged + unflagged) → primary owner; source ends with 0 faces → **deleted**; console drops it.                          |
| E5  | Partial add: some unflagged picks + some flagged excluded                                                      | Flagged-not-excluded → per-face suspects; picks → primary owner; counts reflect the union; source survives (faces remain) → **not** deleted. |
| E6  | Manual face already moved by a concurrent job                                                                  | Still-on-source re-check skips it; `skipped` counts it; no error.                                                                            |
| E7  | Destination (primary owner) **deleted/merged** since the scan                                                  | Route's destination-exists check skips the whole route; nothing moved; surfaced as a no-op/conflict, never a corrupt write.                  |
| E8  | `manualMove.faceIds` contains an id **not in the cluster** / already on the destination / non-visible / non-ML | Filtered out by the still-on-source + eligibility re-check; never moved; counted as skipped.                                                 |
| E9  | `entireCluster = true` **and** the person also in `approvedPersonIds`                                          | Idempotent: flagged faces moved once (second attempt no-ops via still-on-source); final state identical to entire-cluster alone.             |
| E10 | Recognition queue active **or** scan pending/running at apply                                                  | Existing 409 guard rejects the _entire_ request (manual move included); nothing moved.                                                       |
| E11 | Empty `manualMove` (no `faceIds`, `entireCluster` false)                                                       | No-op manual move; behaves exactly like the legacy flagged-only apply.                                                                       |
| E12 | Source person becomes empty but is a **named** person (not an unnamed cluster)                                 | **Not** auto-deleted — the named row is kept (name is deliberate state); only unnamed clusters are pruned. Asserted by test.                 |
| E13 | Representative face of the destination/source changes after the move                                           | Reconcile repoints it and queues a thumbnail regen (reused `executeRepair` behaviour) — asserted.                                            |
| E14 | `size`/`page` out of range on `cluster-faces`                                                                  | Validation rejects (`size` 1–200, `page` ≥ 0).                                                                                               |
| E15 | Web: **Select all** then deselect a few, then **Move entire cluster**                                          | Entire-cluster supersedes individual selection; count = cluster total; payload uses `entireCluster`.                                         |
| E16 | Web: apply returns 409                                                                                         | Existing conflict banner shown; manual selection state preserved (not lost).                                                                 |

## Testing — **TDD is mandatory**

**Every slice is written test-first.** For each unit below: (1) write the failing test that pins the
behaviour, (2) run it and confirm it fails for the right reason, (3) implement the minimum to pass, (4)
refactor. No production line lands without a test that fails before it and passes after. The brainstorm
explicitly calls for **full test and edge-case coverage** — every row in the Edge-cases table above maps to
at least one named test below.

### Server — unit (`server/src/...spec.ts`, vitest, `newTestService`)

- **`FaceRepairRepository.getClusterFacePage`** — covered in the medium tier (it is a real SQL query); the
  unit tier asserts the service wiring calls it with the right args.
- **`FaceRepairService.applyRepair` with `manualMove`** (mocked repos):
  - explicit `faceIds` → one route `personId → destinationPersonId`, `executeRepair` invoked with it (E5, E8).
  - `entireCluster` → enumerates all visible faces, routes them all to primary (E4).
  - flagged path still runs and is unchanged when `manualMove` absent (E11) and when present (E5).
  - auto-delete: `personRepository.delete([personId])` called **iff** source visible-face count hits 0
    **and** the source is unnamed (E4 deletes an unnamed cluster, E5 does not delete a surviving cluster,
    E12 keeps an emptied **named** person).
  - guards: 409 when recognition active / scan running short-circuits before any move (E10).
  - idempotency: person in both `approvedPersonIds` and `entireCluster` does not double-count (E9).
- **`applyPayload()` builder is exercised** indirectly here via the controller DTO; see web unit for the
  client side.

### Server — controller (`face-repair-admin.controller.spec.ts`)

- `POST /admin/face-repair/person/:personId/cluster-faces` — admin-guarded (401/403 without admin),
  validates body (`size`/`page` ranges → 400, E14), returns `{ faces, total, hasMore }`.
- `POST /admin/face-repair` apply — accepts the new optional `manualMove` block, rejects malformed shapes
  (missing `destinationPersonId`, non-array `faceIds`), passes it through to the service.

### Server — medium (`server/test/medium/specs/services/face-repair*.spec.ts`, real DB via testcontainers)

These exercise the real SQL and the real reattribution, which is where the durability guarantees live.

- **`getClusterFacePage`**: seed a cluster of N visible ML faces + some non-visible / non-ML / deleted /
  other-person faces; assert only the eligible same-person faces are returned, `excludeFaceIds` removes the
  flagged ones, pagination returns disjoint pages whose union = filtered set, `total`/`hasMore` correct at
  the last-page boundary (E1, E2, E3).
- **apply `entireCluster`**: seed a mixed cluster, move all → every visible face now on the destination,
  identities are `manual`, source person **row deleted**, representative/thumbnail reconcile observed,
  scan snapshot no longer lists the cluster (E4, E13).
- **apply partial add**: flagged-not-excluded land on their per-face suspects, manual picks land on the
  primary owner, source **survives** with its remaining faces, identities `manual` (E5).
- **concurrency / staleness**: a face moved out-of-band before apply is skipped not errored (E6); a
  destination deleted before apply skips the route (E7); ids outside the cluster are no-ops (E8).
- **guard**: apply while a scan row is `running` → 409, DB unchanged (E10).

### Web — unit (`web/src/...spec.ts`, vitest + testing-library)

- **`review.svelte.ts` view model**: `toggleManual` add/remove; `selectAllLoaded` unions loaded ids;
  `movingCount` for partial (flagged−excluded−declined + manual) and for `entireCluster` (= cluster total);
  `entireCluster` supersedes individual picks (E15); `applyPayload()` emits the correct
  `{ approvedPersonIds, excludeFaceIds, manualMove }` for both the partial and entire-cluster cases.
- **`[personId]/+page.svelte`**: Rest section renders the first page and a working **Load more**; empty Rest
  shows the empty state (E1); clicking a Rest tile updates Stays/Moves counts and the sticky button; **Move
  entire cluster** opens the confirm and, on confirm, issues an `entireCluster` apply; a 409 apply shows the
  conflict banner and preserves selection (E16). SDK calls mocked.

### E2E (optional, only if the existing console has an e2e lane)

If the branch already has a Playwright lane for the console, add one happy-path spec: open a flagged
cluster, expand the Rest section, select a couple of extra faces, Move, and assert the console no longer
lists the moved faces. If no such lane exists, do **not** add one for this feature — unit + medium coverage
is the bar.

### Verification gate (before "done")

Run, and paste real output into the slice notes (no "should pass"):

- `cd server && pnpm test -- --run` (unit) and the new medium specs against a live test DB.
- `cd web && pnpm test -- --run` (the new + existing review specs).
- `make check-web` and `make check-server` (types) and a final `make lint-*` pass at the end (per the
  defer-lint-to-end convention).
- `make open-api` and confirm the working tree shows the regenerated TS **and** Dart clients + specs.json.

## Out of scope (noted, not built)

- Reaching this flexible view for **clean** clusters the scan never flagged — they don't appear in the
  console, so this would need a new entry point. Future work.
- Pulling faces **into** Pierre from _other_ clusters — that is Immich's existing merge / face-assignment
  surface, not this screen.
- A per-face destination picker — the screen has one destination by design (Requirement 1).
