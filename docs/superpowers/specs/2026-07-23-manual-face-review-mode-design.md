# Manual face review mode — design

**Date:** 2026-07-23
**Branch:** `feat/face-manual-review` (off `feat/face-review-unified`, PR #834)
**Depends on:** the unified verdict layer from [face review unification](./2026-07-22-face-review-unification-design.md) and its [remediation](./2026-07-23-face-verdict-layer-remediation-design.md).

> **Revision note (post-review).** The first draft of this spec claimed manual mode could reuse the
> guided review page behind a mode flag. A verification pass against `review.svelte.ts` disproved
> that — see §6.5. The design now **forks the review UI**. Several other first-draft claims were also
> wrong and are corrected inline; §11 lists them so reviewers can see what changed and why.

## 1. Context

The admin face cleanup console is **scan-driven end to end**. An admin runs a scan, the scan persists
a flagged-face snapshot, and every review surface reads back from that snapshot. Open a person the
scan did not flag and the console renders "no flagged faces" — there is no way to say "I know this
person's cluster is dirty, show me everything."

This adds a second entry path — **manual review** — letting an admin pick any person and audit **all**
of that person's faces, with the same tile-grid / bulk-select / apply interaction and the same verdict
writes. The guided flow is not modified.

## 2. Goals / non-goals

**Goals**

- An admin can open **any** person, with no scan in existence, and see **all** of that person's faces.
- The per-face actions are the ones that already exist, writing the rows they already write.
- Manual mode introduces **no new table, column, or status**.
- **The guided flow is untouched.** It is shipped and CI-green; this feature must not destabilise it.

**Non-goals**

- **Not user-facing.** Admin-only; regular users keep their per-person suggestion queue. (Rejected:
  user-scoped manual review would mean generalising ~15 admin endpoints to owner-scope + space-editor
  RBAC.)
- **Shared-space people are out of scope.** The verdict table has a `spacePersonId` arm, but the
  people browser is built on `searchOwnerPeople`, which is `person`-table and owner-scoped. Manual
  review covers **personal people only**. Space-person cleanup remains the suggestion flow's job.
- **No cross-owner face reassignment.** `resolveFaces` refuses destinations owned by another user and
  that guard stays. "Change the owner" means "reassign to a different person in the same owner's
  library" — the existing `moveToPerson`.
- No new scan tuning, scheduling, or bulk-across-people manual mode.
- **No migration.** This feature adds no table and no column.

## 3. The model — how manual decisions fit the existing schema

The verdict layer stores three facts, each with exactly one home:

| Fact                                           | Home                                                    |
| ---------------------------------------------- | ------------------------------------------------------- |
| positive — "a human placed face F on person P" | `face_identity_face.source = 'manual'`                  |
| negative — "F is not P"                        | `face_person_verdict` row (status `rejected`/`ignored`) |
| not-a-face                                     | `asset_face.deletedAt`                                  |

Manual mode writes **only these**:

| Manual action                    | Writes                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Move to person**               | `asset_face.personId` → destination; `face_identity_face.source='manual'` on the destination identity; drain pending verdicts |
| **Lock** ("verified, this is P") | `face_identity_face.source='manual'` on the current person's identity; drain pending                                          |
| **Unknown person**               | create a new unnamed person, move the faces there with manual links                                                           |
| **Not a face**                   | `asset_face.deletedAt = now()`, `personId = NULL`, delete the identity link, drain pending                                    |
| **Keep** (default)               | **nothing** — the face is omitted from the request entirely                                                                   |
| ~~Stay~~                         | **not offered** — see §3.2                                                                                                    |

### 3.1 "Keep" deliberately writes nothing

An admin who eyeballs 400 faces and finds them correct writes zero rows. Auto-locking everything
reviewed would mass-stamp `source='manual'`, and manual-linked faces are excluded from all future
scan flagging — blinding the cleanup engine across the cluster. This is the same reasoning as the
signed-off R1 decision that people-merges preserve each face's prior source.

**Consequence (accepted):** re-auditing later starts fresh; there is no "already checked" record.
**Lock** is the deliberate opt-in for durability.

This is also why manual mode needs its own view-model: the guided model has **no neutral state**
(§6.5).

### 3.2 "Stay" is scan-only, by construction

Guided "stay" means _"the scan suspected this face is person Q; it is not, it is correctly P"_ and
writes a negative verdict **against Q**, read from the snapshot via
`snapshotOwnerByFace.get(assetFaceId)!` (`face-repair.service.ts:917,923`). With no scan there is no
Q — the non-null assertion would yield `undefined` and produce a 500 / FK violation. So `stay` keeps
its snapshot gate on the server **and** is absent from the manual UI. "I looked and it's fine" is
expressed by leaving the face on the default `keep` state.

## 4. What already works, and what does not

Verified against the tree at `7945a12dff7`.

| Capability                                                | Status without a scan                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `getClusterFaces(personId, {excludeFaceIds, page, size})` | **works** — personId + paging only; no scan dependency (merely _routed_ under `scan/`)                     |
| `getPersonFlaggedFaces` with no scan                      | **works** — returns `{ flaggedFaces: [] }`, does not throw                                                 |
| `moveToPerson` on a non-flagged face                      | **works** — explicitly accepts any eligible face currently on personId                                     |
| `entireCluster` move                                      | **works server-side** — not snapshot-gated (but see §6.4: the guided _UI_ binds it to the scan)            |
| `lock` / `unknown` / `detach`                             | **blocked** by guard E15                                                                                   |
| `stay`                                                    | blocked by E15 **and** semantically undefined (§3.2)                                                       |
| Person name + `ownerId` for the review page               | **missing** — both read off `getLatestScan()`                                                              |
| Owner-scoped people list                                  | **works** — `getFaceRepairOwnerPeople`, optional `query`, paginated, `{id,name,faceCount,thumbnailFaceId}` |
| Face crops for non-owned clusters                         | **works** — `GET admin/face-repair/faces/:assetFaceId/thumbnail`, join-free, admin-gated                   |

## 5. Server changes

### 5.1 Relax guard E15 for `lock` / `unknown` / `detach`

`face-repair.service.ts:841-845`:

```ts
// stay/lock/detach/unknown (E15) act only on this person's raw flagged snapshot.
const unresolvable = findUnresolvableIds([...stay, ...lock, ...detach, ...unknown], flaggedIds);
if (unresolvable.length > 0) {
  throw new BadRequestException('Some faces are not in the flagged snapshot for this person');
}
```

E15's rationale — _"a face never flagged has no suspected owner and no keep/lock/detach meaning"_ —
holds for `stay` (§3.2) but is stricter than necessary for the other three: locking, parking, and
binning are well-defined for any face on the person.

**Change:** `stay` keeps the gate. `lock` / `unknown` / `detach` accept any face **currently eligible
on `personId`**.

This is a **permissive** server change with respect to every existing client: the guided web client
only ever puts flagged ids into those buckets (`review.svelte.ts:93-94`), so no web or e2e test
depends on the rejection.

### 5.2 The eligibility check this requires (safety-critical)

Snapshot membership implicitly proved _"this face is on this person"_. Dropping it for three buckets
removes that proof:

- `detach` — **already person-scoped**: `detachFaces` filters `WHERE personId = personId`
  (`face-repair.repository.ts:275-284`), and the identity-strip is keyed on the `RETURNING` output,
  not the caller's raw ids, so it inherits the same scope. A foreign id is inert.
- `unknown` — routed through `executeRepair`, whose `reattributeFaces` has a still-on-source guard
  (`face-repair.repository.ts:228-237`). A foreign id is skipped at write time.
- `lock` — **not scoped.** `replaceFaceIdentities` is a bare insert with no join to `asset_face` and
  no person/owner predicate (`face-identity.repository.ts:2369-2402`); the only constraints are two
  FKs. Any existing `asset_face.id`, including another user's, would be linked to this identity.
  (Contrast `linkPersonFaces` at `:2405-2443`, which _is_ person-scoped — the codebase has both
  shapes.)

**Add** `FaceRepairRepository.getEligibleFaceIdsForPerson(personId, faceIds)` returning the subset
currently on `personId`, not soft-deleted, on a visible asset. `resolveFaces` **rejects** (400) when
any `lock` id is not eligible — a rejection, not a silent skip, because a manual lock is an explicit
human assertion and silently dropping it would misreport what was applied.

Two constraints on the implementation:

- **Mirror `getClusterFacePage`'s predicate** (`face-repair.repository.ts:181-190`) exactly. That is
  the canonical "eligible faces of a person" filter; a third subtly-different variant is a bug farm.
- **Do not add `@GenerateSql`.** `FaceRepairRepository` carries zero SQL-generation decorators, so no
  `mise sql` regeneration is required. (The first draft said otherwise and named a non-existent
  decorator.)
- The read is **advisory** — it races the write-time guards, which remain authoritative. It exists to
  turn a silent no-op into an explicit 400, not to be the safety mechanism of record.

### 5.3 Lock is an upsert that overwrites — a real hazard, not a no-op

`face_identity_face` is keyed by `assetFaceId` as its **PRIMARY KEY**
(`face-identity-face.table.ts:26-27`; migration `1778400000000:44`) — not "a plain unique index", and
the only other index is non-unique. The upsert is `ON CONFLICT … DO UPDATE` **with no `WHERE` on the
conflict action** (`face-identity.repository.ts:2393-2399`). Therefore re-locking a face that is
already linked **to a different identity silently re-points it**, overwrites `source`/`confidence`,
and churns `updatedAt`/`updateId` via the trigger.

Guided mode barely reaches this (its lock targets are snapshot faces already on the person). **Manual
mode makes it reachable**, since an admin can lock any face on the person. The eligibility check in
§5.2 constrains the face to this person, which is the meaningful mitigation; the identity-steal case
must still be covered by an explicit test (§8).

Also note `replaceFaceIdentities` (plural) omits the `preserveManualSource` guard its singular
sibling `replaceFaceIdentity` applies (`:2361` vs `:2396`). Both current callers pass `'manual'`, so
it is latent — but do not add a non-manual caller without revisiting it.

### 5.4 Relaxing `unknown` changes one existing behaviour

Medium test `face-repair.resolve.spec.ts:2003` covers a face that was **moved off the person since
the scan**, not a rest-of-cluster face. Today E15 rejects it with a 400. After relaxation the guard
no longer fires, `executeRepair`'s still-on-source check skips it, and the fresh cluster is deleted
because nothing moved (`face-repair.service.ts:1049-1054`) — so the admin gets a **success with
`unknown: 0`** instead of an error. That is acceptable (the response count truthfully reports zero
parks) but it is a deliberate behaviour change and gets its own test.

### 5.5 New endpoint — admin person metadata

The review page derives `personName` and `ownerId` from the scan (`[personId]/+page.svelte:105,222`),
and `ownerId` scopes the move-picker. With no scan both are unavailable, and user-scoped
`GET /people/:id` does not admin-bypass for non-owned people.

**Add** `GET admin/face-repair/person/:personId` → `{ id, name, ownerId, faceCount, thumbnailFaceId }`,
`@Authenticated({ admin: true })`, 404 on unknown person. Requires OpenAPI regen (`mise open-api`).

## 6. Web changes

### 6.1 Routes

| Route                                   | Change                                                       |
| --------------------------------------- | ------------------------------------------------------------ |
| `/admin/face-cleanup`                   | **new** — two-card mode chooser                              |
| `/admin/face-cleanup/scan`              | existing guided dashboard, **moved verbatim** (10 files)     |
| `/admin/face-cleanup/people`            | **new** — manual people browser                              |
| `/admin/face-cleanup/people/[personId]` | **new** — manual review page (own view-model)                |
| `/admin/face-cleanup/[personId]`        | guided review page — **untouched** except navigation targets |

Nesting manual review under `/people/` keeps it entirely clear of the guided `[personId]` route.
SvelteKit resolves static segments before dynamic ones, and person ids are UUIDs, so `scan`/`people`
cannot collide.

### 6.2 The chooser

- **Guided review** — last scan age, flagged count, flagged-people count, from the `getLatestScan()`
  the dashboard already calls → `/admin/face-cleanup/scan`
- **Manual review** — static description plus the **user** count from `searchUsersAdmin` →
  `/admin/face-cleanup/people`

No global people total is shown: no endpoint produces one (people are only counted per owner), and an
aggregate endpoint purely to decorate a card is not worth it.

Both destinations are directly linkable. **The admin navbar needs no change** — it already points at
`/admin/face-cleanup` and `NavbarItem` highlights by `pathname.startsWith(href)`, so it stays active
across `/scan` and `/people`. (The first draft listed repointing the navbar as work; it is a no-op.)

### 6.3 Manual people browser

Owner selector (`searchUsersAdmin`) → paginated people grid via `getFaceRepairOwnerPeople(ownerId,
{query, page})`, rendering `name`, `faceCount`, and a crop from `thumbnailFaceId` via the admin
face-thumbnail route. Search drives the endpoint's optional `query`. Single-user instances
auto-select the owner. Clicking a person → `/admin/face-cleanup/people/{id}`.

The browser shows whatever `searchOwnerPeople` returns; its treatment of hidden and non-`person`-type
rows is pinned by test rather than changed (§8).

### 6.4 Manual review page

A **new page with its own view-model**, reusing the guided page's tile presentation, `PersonPicker`,
and the `resolveFaces` SDK call. Interaction is identical to guided: tile grid → bulk select → Apply.

`manual-review.svelte.ts`:

- `ManualFace = { assetFaceId: string }` — **no `suspectedOwnerId`**.
- `ManualFaceState = 'keep' | 'move' | 'lock' | 'unknown' | 'detach'`, **default `'keep'`**.
- **Stable across pagination.** The model owns its face list and exposes `appendFaces(...)`; it is
  **not** `$derived` over the array. This is the direct fix for the guided page's latent state-loss
  bug (§6.5), and is why manual paging is safe where reusing the guided model would not be.
- `buildResolveRequest`: `keep` faces are **omitted entirely**; `move` groups by destination (+lock
  flag); `lock`/`unknown`/`detach` become id lists. **`stay` is never emitted.**
- Apply is **disabled when every face is `keep`** — an all-keep request would be an empty resolve,
  which the server 400s.

Person name and `ownerId` come from the §5.5 endpoint, fetched from the URL so refresh and deep-links
work. Faces come from `getFaceRepairClusterFaces(personId, {excludeFaceIds: [], page, size})`.

**Move entire cluster** is offered, but — unlike guided, where it rides the scan's suspected owner —
it requires choosing a destination through `PersonPicker`.

### 6.5 Why a separate page (the finding that changed this design)

The guided view-model cannot serve manual mode without being rewritten:

- `FlaggedFace.suspectedOwnerId` is **required** (`review.svelte.ts:42-47`); the cluster endpoint
  returns only `{ assetFaceId }`, so `createReviewModel(restFaces)` does not typecheck.
- Every face initialises to `'owner'` (`review.svelte.ts:100`) and `buildResolveRequest` dereferences
  `face.suspectedOwnerId` for that state (`:229-235`). With no scan, an **untouched** manual review
  would POST `moveToPerson: [{ destinationPersonId: undefined, faceIds: [all] }]` — silent mass
  mis-assignment.
- There is **no neutral state**: six terminal states (`:13`) with a tested invariant that the tally
  always sums to total (`review.spec.ts:172`). §3.1 requires one.
- `vm = $derived(createReviewModel(flaggedFaces))` (`+page.svelte:102`) — feeding a growing paginated
  list rebuilds the model and **wipes staged decisions**.
- `scanPerson` gates the move-picker (`+page.svelte:217-225`) and `flaggedFaces.length` gates the page
  body, the dock, and `loadRestPage` (`:402,:655,:162`).
- "Move entire cluster" is hard-bound to `ownerPersonId` client-side (`:262-274`, `:571`, `:580`),
  which is always null without a scan.

Generalising would also require rewriting five **load-bearing characterization tests** that encode the
guided defaults (`[personId]/page.spec.ts:186,:316`; `review.spec.ts:36,:172`;
`ActionsHelpModal.spec.ts:38`). Forking leaves all nine guided web specs untouched.

The two modes genuinely differ in default semantics — guided: _every face is a pending decision_;
manual: _every face is fine until I say otherwise_ — and one model cannot hold both defaults.

### 6.6 Navigation targets to repoint (guided page, unavoidable)

The route move requires updating, in `web/src/lib/route.ts` (add `faceCleanupScan()`; `faceCleanup()`
becomes the chooser) and its call sites:

- `[personId]/+page.svelte:278` (Cancel `goto`), `:305` (post-Apply `goto`), `:347` (breadcrumb),
  `:351` (back link)
- `resolutions/+page.svelte:97` (breadcrumb), `:145` (back button)

Ten dashboard files move to `scan/` (`+page.svelte`, `+page.ts`, `page.spec.ts`, `FaceCleanupTable`,
`face-cleanup.svelte.ts`, `face-cleanup.spec.ts`, `ScanChecklist` + spec, `AdvancedScanModal` + spec);
they are a self-contained cluster with no cross-imports from `[personId]/` or `resolutions/`.
`declined/+page.ts` redirects to `resolutions`, not the dashboard, and is unaffected.

## 7. Invariants and edge cases

**Cross-engine invariant (the point of the feature).** A manual decision must be honoured by a later
scan exactly as a guided one: a locked face is never re-flagged, a detached face is gone, a moved face
is not re-proposed. Free _if_ manual writes the same rows (§3), and worth an explicit e2e test rather
than trusting the argument.

**Preserved guards (must not regress).** Empty resolve → 400. Face in two buckets → 400.
`entireCluster` + per-face buckets → 400. Cross-owner destination → 400. Facial recognition active → 409. Scan running → 409 — note this now also blocks manual review mid-scan, which is intended.

**Manual mode ignores scan state entirely.** Opening the manual page for a person the scan _did_ flag
shows all faces with no flagged badging. Manual is a separate lens, not an overlay; mixing them would
reintroduce the suspected-owner coupling this design removes.

**Concurrency.** Two admins resolving the same person simultaneously is not locked out. The write-time
guards (`reattributeFaces` still-on-source, `detachFaces` person scope) make the outcome converge —
the second resolve's already-moved faces are skipped and truthfully reported as not moved.

**Edge cases to cover.**

_E15 relaxation:_ lock a non-flagged on-person face succeeds; lock a face on a **different** person is
rejected 400; lock a nonexistent id → 400; lock a soft-deleted face → 400; **re-locking a face already
linked to a different identity** (§5.3 hazard); detach a non-flagged face succeeds and does not touch
other clusters; unknown on non-flagged faces creates the parked person; unknown on a **moved-since-scan**
face returns success with `unknown: 0` (§5.4); unknown on every face empties the source person, whose
cleanup is gated on `countAllFaces` (not `countEligibleFaces`) plus unnamed; `stay` on a non-flagged
face still 400s; `stay` with no scan still 400s; mixed request (move + lock + detach) applies every
bucket; guided resolution unchanged.

_Metadata endpoint:_ existing person returns the row; 404 unknown; succeeds for another user's person;
unnamed person returns a null/empty name; zero-face person returns `faceCount: 0` + null
`thumbnailFaceId`; non-admin → 403.

_Manual view-model (pure):_ default state is `keep` for every face; an all-keep request builds to
empty and Apply is disabled; `keep` faces never appear in any bucket; `stay` is never emitted;
`appendFaces` preserves existing states **and** selection; move groups by destination and threads the
lock flag; a face cannot occupy two buckets.

_Manual page:_ loads all cluster faces with no scan; pages a large cluster without losing staged
decisions or selection; move-picker receives `ownerId` from the metadata endpoint; hard refresh
resolves name/owner; unnamed person renders the fallback heading; detach requires the destructive
confirm; entire-cluster move requires a picked destination; a person the scan flagged shows no flagged
badging.

_Browser/chooser:_ chooser renders both cards and degrades when no scan has ever run; owner selector
auto-selects on single-user; search filters; pagination loads further pages; hidden / non-`person`-type
rows behave as `searchOwnerPeople` already returns (pinned, not changed).

## 8. Test plan

**Where tests live** — corrected from the first draft: **there are no unit specs for `resolveFaces`.**
All of its coverage is medium (`server/test/medium/specs/services/face-repair.resolve.spec.ts`, 2,363
lines) plus a controller spec that mocks the service. Server behaviour work therefore lands in
**medium**, not unit.

- **Server medium** — real DB; assert the actual rows (`source='manual'`, `deletedAt`, verdict drains,
  person emptying). Run from `server/` as
  `pnpm exec vitest --config test/vitest.config.medium.mjs --run test/medium/specs/services/face-repair.resolve.spec.ts`.
  The path must be **relative to `serverRoot`**. `pnpm test:medium -- --run <path>` silently drops the
  filter and runs everything — and so does the bare-substring form `pnpm test:medium -- <name>`.
- **Server controller** (`face-repair-admin.controller.spec.ts`) — DTO validation + admin-gating for
  the new metadata endpoint.
- **Web unit** (vitest + testing-library) — the manual view-model is a pure module and should carry the
  bulk of the logic coverage, as `review.spec.ts` does for guided. Avoid asserting on an
  `onMount`-awaits-rejected-promise path: untestable under vitest 4 + happy-dom, already a known
  time-sink on this feature.
- **e2e** — one spec file exists (`e2e/src/specs/web/face-cleanup.e2e-spec.ts`, `describe.serial`).
  Seed with the existing `seedFlaggedScan` helper; note `utils.createFace` links faces
  `source='manual'` (`utils.ts:529-530`), which the verdict layer excludes from flagging, so seeds are
  downgraded to `'ml'` — there is a `preserveSource` escape hatch for durability tests.
  `waitForQueueFinish` needs the **admin** token (the queue endpoint is admin-only) and can return
  "done" before a job is enqueued, so poll the post-condition. A failure in a `.serial` file skips
  everything after it.

**TDD.** Slices 1–20 are **red-first**: write the failing test, confirm it fails for the right reason,
then implement. Slice 2 is the exception by design — a regression guard that must be **green on
arrival**. Slices 21–24 are mechanical/verification and carry no new red test.

## 9. Slices

**Server**

1. **Eligibility read.** `getEligibleFaceIdsForPerson`, mirroring `getClusterFacePage`'s predicate; no
   `@GenerateSql`. Medium tests per exclusion arm (wrong person, soft-deleted, invisible asset,
   non-ML source).
2. **Regression guard for `stay` (green on arrival).** Pin `stay`-on-non-flagged → 400 and `stay`
   with no scan → 400 **before** touching E15, so the invariant is documented ahead of the change.
   Lands ahead of slices 3–5 deliberately.
3. **Relax E15 for `lock` + eligibility rejection.** Rewrite medium `:1372` from rejection to success
   and invert its side-effect assertions. Add the §5.3 identity-steal case and the
   foreign/deleted/nonexistent rejections.
4. **Relax E15 for `detach`.** Rewrite medium `:1467`; prove person-scoping leaves other clusters
   untouched.
5. **Relax E15 for `unknown`.** Rewrite medium `:2003` to the §5.4 semantics (success, `unknown: 0`,
   no orphan cluster); cover park-everything and the `countAllFaces`-gated source cleanup.
6. **Person metadata endpoint.** Repo + service + DTO + route, with the §7 metadata edge cases and the
   controller-level admin gate.
7. **OpenAPI regen.** `mise open-api` (TS SDK + Dart). Mechanical; verify the new call is exposed.

**Web — route move (must precede the new surfaces)**

8. **Move the dashboard to `/admin/face-cleanup/scan`.** `git mv` the 10-file cluster, add
   `Route.faceCleanupScan()`, repoint the six §6.6 call sites, and leave `/admin/face-cleanup` as a
   temporary 307 redirect so the slice ships without a dead entry point. Navbar unchanged.
9. **Repair the e2e assertions the move breaks.** Four in `face-cleanup.e2e-spec.ts`: `:151` and
   `:295` (`goto`), `:361` and `:541` (`waitForURL('**/admin/face-cleanup')`, which will not match
   `/scan`). **`:363-365` must be fixed, not repointed** — pointed at a chooser it would pass
   vacuously, silently gutting the drain check.

**Web — new surfaces**

10. **Chooser landing.** Replace slice 8's redirect with the two cards, live counts, correct
    destinations, and the never-scanned state. Novel UI in admin — no existing chooser to copy; the
    307-redirect pattern is the only precedent reused.
11. **People browser shell + owner selector.** Route, layout, `searchUsersAdmin`, single-user
    auto-select.
12. **People grid.** Thumbnails, face counts, pagination; pin hidden / non-`person`-type behaviour.
13. **People search.** Optional `query` wiring; no-results state.
14. **Manual review page shell.** Route, person metadata from slice 6, navigation in from the browser,
    refresh/deep-link, unnamed fallback.
15. **Manual view-model (pure).** `manual-review.svelte.ts` per §6.4 — states, `keep` default,
    `appendFaces` preserving state + selection, `buildResolveRequest` omitting `keep` and never
    emitting `stay`. Heaviest unit-test slice.
16. **Manual tile grid + selection + server paging.** Click / shift-range / select-all semantics
    honest about server paging; paging must not lose staged decisions.
17. **Manual bulk bar.** Move (via `PersonPicker` with `ownerId`), lock, unknown, not-a-face, plus the
    destructive confirm on detach.
18. **Manual entire-cluster move.** With its own destination picker (no suspected owner to ride).
19. **Manual Apply.** Submit, report results, surface 409/errors, disable on all-keep.
20. **Manual actions help.** A manual-mode help modal listing this mode's actions; the guided
    `ActionsHelpModal` and its "names all six actions" test are left alone.

**Integration**

21. **e2e manual flow.** Browse → pick a person with no scan → move, lock, not-a-face → assert rows.
22. **e2e cross-engine invariant.** A manual decision survives a later scan: locked faces are not
    re-flagged, detached faces stay gone.
23. **i18n + docs.** Keys in `i18n/en.json` (shared by web **and** mobile — grep both before touching
    existing keys) and a docs note on the two modes.
24. **Final gate.** `pnpm lint` (server is `--max-warnings 0`), `prettier --check .` across the server
    package **and** `cd docs && pnpm format` — prettier is a CI gate separate from eslint and docs
    prettier reaches this file — plus type checks, web checks, and the full server/web/e2e suites.

## 10. Accepted tradeoffs

1. **"Keep" is not recorded** (§3.1) — re-audits start fresh; Lock is the opt-in.
2. **Manual review is blocked while a scan runs** — inherited from `resolveFaces`'s concurrency guard;
   correct against conflicting writes.
3. **The chooser adds a click** in front of the dashboard, mitigated by `/scan` being directly
   linkable.
4. **Moving a face writes no negative verdict against the source** — unnecessary; the face ends up
   assigned and the suggestion engine only proposes unassigned faces.
5. **Some duplication between the guided and manual review UIs** — accepted deliberately in exchange
   for zero regression risk to the shipped guided flow (§6.5).

## 11. Corrections from the first draft

Recorded so reviewers can see what was verified rather than assumed:

| First-draft claim                                       | Reality                                                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Manual mode reuses the guided page behind a mode flag   | **False** — model has a required `suspectedOwnerId`, no neutral state, and a `$derived` rebuild bug (§6.5) |
| Re-lock is an idempotent no-op via a plain unique index | **False** — PRIMARY KEY, and `DO UPDATE` that can steal a face from another identity (§5.3)                |
| Adding a repo method needs `mise sql` regeneration      | **False** — decorator is `@GenerateSql`; `FaceRepairRepository` has none                                   |
| Slice 8 must repoint the navbar                         | **False** — `NavbarItem` matches by prefix; no-op                                                          |
| `resolveFaces` has server unit-test coverage            | **False** — medium only; unit specs cover other seams                                                      |
| "Move entire cluster remains available" in manual mode  | **False client-side** — bound to a null `ownerPersonId`; needs its own picker (§6.4)                       |
| Relaxing `unknown` is purely permissive                 | **Incomplete** — it converts one 400 into a success with `unknown: 0` (§5.4)                               |

The lock claim originated from a **stale code comment** (`face-repair.service.ts:949`) referencing
`insertLocks`, a function that no longer exists in `server/src`.
