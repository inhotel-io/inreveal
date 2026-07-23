# Manual face review mode — design

**Date:** 2026-07-23
**Branch:** `feat/face-manual-review` (off `feat/face-review-unified`, PR #834)
**Depends on:** the unified verdict layer from [face review unification](./2026-07-22-face-review-unification-design.md) and its [remediation](./2026-07-23-face-verdict-layer-remediation-design.md).

## 1. Context

The admin face cleanup console today is **scan-driven end to end**. An admin runs a scan, the scan
persists a flagged-face snapshot, and every review surface reads back from that snapshot. Open a
person the scan did not flag and the console renders "no flagged faces" — there is no way to say
"I know this person's cluster is dirty, show me everything."

This adds a second entry path — **manual review** — that lets an admin pick any person and audit
**all** of that person's faces, using the same tile grid, the same bulk-select-then-apply
interaction, and the same verdict writes. Nothing about the guided (scan) flow changes.

## 2. Goals / non-goals

**Goals**

- An admin can open **any** person, with no scan in existence, and see **all** of that person's faces.
- The per-face actions are the ones that already exist, writing the rows they already write.
- Manual mode introduces **no new table, column, or status**. A manual decision is indistinguishable
  from the equivalent guided decision, and is therefore honoured by both engines.
- The guided flow keeps its current behaviour exactly, including its URL being reachable directly.

**Non-goals**

- Not user-facing. This stays admin-only; regular users keep the per-person suggestion queue they
  already have. (Considered and explicitly rejected: user-scoped manual review would mean
  generalising ~15 admin endpoints to owner-scope + space-editor RBAC.)
- No cross-owner face reassignment. `resolveFaces` refuses destinations owned by another user and
  that guard stays. "Change the owner" means "reassign the face to a different person in the same
  owner's library" — the existing `moveToPerson` action.
- No change to the review page's layout or interaction model.
- No new scan tuning, no scheduling, no bulk-across-people manual mode.

## 3. The model — how manual decisions fit the existing schema

The verdict layer stores three facts, each with exactly one home:

| Fact                                           | Home                                                    |
| ---------------------------------------------- | ------------------------------------------------------- |
| positive — "a human placed face F on person P" | `face_identity_face.source = 'manual'`                  |
| negative — "F is not P"                        | `face_person_verdict` row (status `rejected`/`ignored`) |
| not-a-face                                     | `asset_face.deletedAt`                                  |

Manual mode writes **only these**. Mapping per action:

| Manual action                    | Writes                                                                                                                                     | Same as guided?                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **Move to person**               | `asset_face.personId` → destination; `face_identity_face.source='manual'` on the destination identity; drain pending verdicts for the face | identical to guided move            |
| **Lock** ("verified, this is P") | `face_identity_face.source='manual'` on the current person's identity; drain pending                                                       | identical to guided lock            |
| **Unknown person**               | create a new unnamed person, move the faces there with manual links                                                                        | identical to guided unknown         |
| **Not a face**                   | `asset_face.deletedAt = now()`, `personId = NULL`, delete the identity link, drain pending                                                 | identical to guided detach          |
| **Keep**                         | **nothing**                                                                                                                                | n/a — see §3.1                      |
| ~~Stay~~                         | —                                                                                                                                          | **absent in manual mode**, see §3.2 |

### 3.1 "Keep" deliberately writes nothing

An admin who eyeballs 400 faces and finds them all correct writes zero rows. The alternative —
auto-locking everything reviewed — would mass-stamp `source='manual'`, and manual-linked faces are
excluded from all future scan flagging, so it would blind the cleanup engine across the whole
cluster. This is the same reasoning behind the already-signed-off R1 decision that people-merges
must preserve each face's prior source instead of mass-stamping `'manual'`.

**Consequence (accepted):** re-auditing a person later starts from scratch; there is no "I already
checked these" record. An admin who wants that durability uses **Lock** deliberately, on a selection.

### 3.2 "Stay" is scan-only, by construction

Guided "stay" means _"the scan suspected this face belongs to person Q; it does not, it correctly
belongs to P"_ and writes a negative verdict **against Q**. It reads Q from the flagged snapshot
(`snapshotOwnerByFace.get(assetFaceId)!`). With no scan there is no Q, so the action has no meaning
and no operand. Manual mode therefore does not offer it, and the server continues to reject it for
non-snapshot faces. "I looked and it's fine" is expressed by leaving the face untouched (§3.1).

## 4. What already works, and what does not

Verified against `server/src/services/face-repair.service.ts` at `7945a12dff7`.

| Capability                                                                          | Status without a scan                                                                                                                    |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `getClusterFaces(personId, {excludeFaceIds, page, size})` — all of a person's faces | **works** — takes only a personId + paging; no scan dependency (it is merely _routed_ under `scan/`)                                     |
| `getPersonFlaggedFaces` with no scan                                                | **works** — returns `{ flaggedFaces: [] }` gracefully, does not throw                                                                    |
| `moveToPerson` on a non-flagged face                                                | **works** — explicitly "accepts any eligible face currently on personId"                                                                 |
| `entireCluster` move                                                                | **works** — explicitly not snapshot-gated                                                                                                |
| `lock` / `unknown` / `detach`                                                       | **blocked** by guard E15                                                                                                                 |
| `stay`                                                                              | blocked by E15 **and** semantically undefined (§3.2)                                                                                     |
| Person name + `ownerId` on the review page                                          | **missing** — both are read off `getLatestScan()`                                                                                        |
| Owner-scoped people list for the browser                                            | **works** — `GET admin/face-repair/owner/:ownerId/people`, optional `query`, paginated, returns `{id, name, faceCount, thumbnailFaceId}` |
| Face crops for non-owned clusters                                                   | **works** — `GET admin/face-repair/faces/:assetFaceId/thumbnail`, join-free, admin-gated                                                 |

So the server work is two narrow changes (§5), and the people browser needs no new endpoint.

## 5. Server changes

### 5.1 Relax guard E15 for `lock` / `unknown` / `detach`

Today:

```ts
// stay/lock/detach/unknown (E15) act only on this person's raw flagged snapshot.
const unresolvable = findUnresolvableIds([...stay, ...lock, ...detach, ...unknown], flaggedIds);
if (unresolvable.length > 0) {
  throw new BadRequestException('Some faces are not in the flagged snapshot for this person');
}
```

E15's stated rationale — _"a face that was genuinely never flagged for this person has no suspected
owner and no keep/lock/detach meaning"_ — is true for `stay`, which needs a suspected owner, but is
stricter than necessary for the other three: locking, parking, and binning are all well-defined for
any face sitting on the person.

**Change:** `stay` keeps the snapshot gate. `lock` / `unknown` / `detach` accept any face that is
**currently eligible on `personId`**.

### 5.2 The eligibility check this requires (safety-critical)

Snapshot membership was implicitly proving _"this face is on this person"_. Dropping it for three
buckets removes that proof, so it must be replaced explicitly:

- `detach` — already person-scoped: `detachFaces(personId, detach, trx)` filters by person, so a
  foreign face id is a no-op rather than a cross-cluster mutation. Still assert this with a test.
- `unknown` — routed through `executeRepair`, whose `reattributeFaces` has a still-on-source guard
  (`personId = from`), so foreign ids are skipped at write time.
- `lock` — **not scoped**. `replaceFaceIdentities({assetFaceIds, identityId, source:'manual'})` takes
  bare face ids. Without a check, an admin could pin an arbitrary face — including one belonging to
  another user's person — onto this person's identity.

**Add:** `FaceRepairRepository.getEligibleFaceIdsForPerson(personId, faceIds)` returning the subset
currently on `personId`, not soft-deleted, on a visible asset. `resolveFaces` rejects the request
(400) when any `lock` id is not eligible. Keep it a rejection rather than a silent skip: a manual
lock is an explicit human assertion, and silently dropping it would misreport what was applied.

### 5.3 New endpoint — admin person metadata

The review page derives `personName` and `ownerId` from the scan (`+page.svelte:105,222`), and
`ownerId` is what scopes the move-picker. With no scan both are unavailable, and the user-scoped
`GET /people/:id` does not admin-bypass for non-owned people (the same class of bug already fixed
for thumbnails).

**Add:** `GET admin/face-repair/person/:personId` → `{ id, name, ownerId, faceCount, thumbnailFaceId }`,
`@Authenticated({ admin: true })`, 404 on unknown person. Reuses the shape already produced for
`OwnerPersonRow` plus `ownerId`. Requires OpenAPI regen (TS SDK + Dart client).

## 6. Web changes

### 6.1 Routes

| Route                            | Change                                                 |
| -------------------------------- | ------------------------------------------------------ |
| `/admin/face-cleanup`            | **new** — two-card mode chooser                        |
| `/admin/face-cleanup/scan`       | existing guided dashboard, **moved verbatim**          |
| `/admin/face-cleanup/people`     | **new** — manual people browser                        |
| `/admin/face-cleanup/[personId]` | review page — **route unchanged**, gains a manual mode |

SvelteKit resolves static segments before `[personId]`, and person ids are UUIDs, so `scan` and
`people` cannot collide with a real person route.

### 6.2 The chooser

Two cards carrying live context, so the landing informs rather than merely gating:

- **Guided review** — last scan age, flagged count, and flagged-people count, all read from the
  `getLatestScan()` the dashboard already calls → `/admin/face-cleanup/scan`
- **Manual review** — a static description plus the **user** count from `searchUsersAdmin`
  → `/admin/face-cleanup/people`

The manual card deliberately shows no global people total: no endpoint produces one (people are only
ever counted per owner, via `getFaceRepairOwnerPeople`'s `total`), and adding a cross-owner
aggregate purely to decorate a card is not worth an endpoint. Both counts on this landing therefore
come from calls that already exist.

Both destinations are directly linkable, so an admin who prefers one mode bookmarks it and never
sees the chooser. The admin navbar entry points at `/admin/face-cleanup`.

### 6.3 Manual people browser

Owner selector (`searchUsersAdmin`, already loaded by the dashboard for its owner column) → paginated
people grid via the existing `getFaceRepairOwnerPeople(ownerId, {query, page})`, rendering
`name`, `faceCount`, and a crop from `thumbnailFaceId` through the admin face-thumbnail route.
A search box drives the endpoint's optional `query`. On a single-user instance the owner selector
auto-selects. Clicking a person navigates to `/admin/face-cleanup/{id}?mode=manual`.

### 6.4 Review page in manual mode

Same page, same tile grid, same bulk-select-then-apply, same components. Differences when
`mode=manual`:

- Person name + `ownerId` come from the new metadata endpoint instead of the scan. Fetched from the
  URL, not passed via navigation state, so refresh and deep-links work.
- The "rest of this cluster" paginated section **becomes the primary content**: all faces, via
  `getFaceRepairClusterFaces` with `excludeFaceIds: []`. Paging already exists (`loadRestPage`).
- The flagged section and every suspected-owner affordance are absent (there is no suspicion).
- The bulk bar offers **move to person / lock / unknown / not a face**. **Stay is not offered.**
- "Move entire cluster" remains available (already snapshot-independent).

## 7. Invariants and edge cases

**Cross-engine invariant (the point of the feature).** A manual decision must be honoured by a later
scan exactly as a guided one is: a locked face is never re-flagged; a detached face is gone; a moved
face is not re-proposed. This is free _if_ manual writes the same rows — §3 — and is worth an
explicit e2e test rather than trusting the argument.

**Preserved guards (must not regress).** Empty resolve → 400. A face in two buckets → 400.
`entireCluster` combined with per-face buckets → 400. Cross-owner destination → 400. Resolve while
facial recognition is active → 409. Resolve while a scan is running → 409 — note this now also
blocks manual review mid-scan, which is intended (it prevents conflicting writes against a snapshot
being rebuilt).

**Edge cases to cover explicitly.**

_Server, E15 relaxation:_ lock a non-flagged on-person face succeeds; lock a face on a _different_
person is rejected; lock a nonexistent face id is rejected; lock a soft-deleted face is rejected;
re-locking an already-locked face is an idempotent no-op (plain unique index on `assetFaceId`);
detach a non-flagged face succeeds and does not touch other clusters; unknown on non-flagged faces
creates the parked person; unknown applied to _every_ face empties the source person and the existing
empty-unnamed cleanup still fires; `stay` on a non-flagged face still 400s; `stay` with no scan at
all still 400s; a mixed manual request (move + lock + detach together) applies every bucket; guided
resolution of flagged faces is byte-for-byte unchanged.

_Server, metadata endpoint:_ returns the row for an existing person; 404 for unknown; succeeds for a
person owned by another user (cross-user is the point); unnamed person returns a null/empty name the
client can fall back on; a person with zero faces returns `faceCount: 0` and a null
`thumbnailFaceId`; non-admin caller gets 403.

_Web:_ chooser renders both cards, and degrades sensibly when no scan has ever run; `/scan` renders
the existing dashboard unchanged; owner selector auto-selects on a single-user instance; people
search filters and pagination loads further pages; clicking a person navigates with `?mode=manual`;
manual review loads all cluster faces; the bulk bar omits stay in manual mode and offers it in
guided; the move-picker receives `ownerId` from the metadata endpoint; a hard refresh of a manual
review URL still resolves name/owner; an unnamed person renders the fallback heading; a person with
thousands of faces pages correctly; guided review renders unchanged.

## 8. Test plan

Every slice is **red-first**: write the failing test, watch it fail for the right reason, then
implement. No slice is complete while its test is skipped or its assertion weakened.

- **Server unit** (`server/src/services/*.spec.ts`) — bucket routing, guard behaviour, eligibility
  rejection, DTO validation.
- **Server medium** (`server/test/medium/specs/…`, real DB) — the actual row writes: `source='manual'`,
  `deletedAt`, verdict drains, person emptying. Run these with
  `pnpm exec vitest --config test/vitest.config.medium.mjs --run <path>` — `pnpm test:medium -- --run <path>`
  silently drops the path filter and runs all files.
- **Web unit** (`web/src/**/*.spec.ts`, vitest + testing-library) — chooser, browser, review-page mode
  behaviour. Avoid asserting on an `onMount`-awaits-rejected-promise path; that is untestable under
  vitest 4 + happy-dom and has already cost hours on this feature.
- **e2e** (`e2e/`) — the manual flow end to end plus the cross-engine invariant. Seed flagged faces
  with `source='ml'`; `utils.createFace` links with `source='manual'`, which the verdict layer
  excludes from flagging, so a naive seed produces an empty review page. Assert durable DB state
  rather than re-scan ordering (two same-`now()` scans make `getLatestScan` nondeterministic).
  `waitForQueueFinish` needs an **admin** token.

## 9. Slices

Ordered for `impl-loop`. Each is independently landable and independently verifiable.

**Server**

1. **Eligibility read.** Add `FaceRepairRepository.getEligibleFaceIdsForPerson(personId, faceIds)`
   (on-person, not soft-deleted, visible asset). Medium tests for each exclusion arm.
2. **Relax E15 for `lock`.** Wire the §5.2 check; lock accepts non-flagged on-person faces and
   rejects foreign/deleted/nonexistent ids. Includes the idempotent re-lock case and a guided
   regression test.
3. **Relax E15 for `detach`.** Accept non-flagged on-person faces; prove person-scoping stops a
   foreign id from mutating another cluster.
4. **Relax E15 for `unknown`.** Accept non-flagged on-person faces; cover the park-everything case
   that empties the source person.
5. **Pin `stay` as scan-only.** Characterization tests: `stay` on a non-flagged face and `stay` with
   no scan both still 400. This slice adds tests only — it locks in §3.2 so a later refactor cannot
   quietly widen the gate.
6. **Person metadata endpoint.** Repo query + service + DTO + `GET admin/face-repair/person/:personId`,
   with the §7 metadata edge cases.
7. **OpenAPI regen.** `mise open-api` (TS SDK + Dart). Mechanical; verify the generated client
   exposes the new call and that `mise sql` stays clean.

**Web**

8. **Move the guided dashboard to `/admin/face-cleanup/scan`.** Pure relocation — no behaviour
   change. Repoint the navbar, breadcrumbs, the table's Review links, and existing tests. Leave
   `/admin/face-cleanup` as a **temporary redirect** to `/scan` so this slice ships without a dead
   entry point (the chooser replaces the redirect in slice 9).
9. **Chooser landing at `/admin/face-cleanup`.** Replace slice 8's redirect with the two cards, live
   counts, correct destinations, and the never-scanned empty state.
10. **People browser shell + owner selector.** Route, layout, `searchUsersAdmin` wiring,
    single-user auto-select.
11. **People grid.** `getFaceRepairOwnerPeople` wiring: thumbnails, face counts, pagination.
12. **People search.** Drive the endpoint's optional `query`; cover no-results.
13. **Navigate into review.** Person click → `/admin/face-cleanup/{id}?mode=manual`.
14. **Review page reads person metadata.** Consume the new endpoint for name + `ownerId` in manual
    mode; survives refresh/deep-link; unnamed fallback.
15. **Manual mode loads all faces.** Cluster faces become the primary grid; paging across a large
    cluster.
16. **Manual mode action set.** Hide stay and the suspected-owner affordances; keep move / lock /
    unknown / not-a-face / move-entire-cluster. Guided bulk bar unchanged.
17. **Manual apply.** Build and submit the resolve request from manual selections; surface partial
    results and errors.

**Integration**

18. **e2e manual flow.** Pick a person with no scan → select → apply move, lock, and not-a-face →
    assert the resulting rows.
19. **e2e cross-engine invariant.** A manual decision survives a subsequent scan: locked faces are
    not re-flagged, detached faces stay gone.
20. **i18n + docs.** New keys in `i18n/en.json` (shared by web and mobile — grep both before touching
    existing keys) and a docs note on the two modes.
21. **Final gate.** Full sweep: `pnpm lint` (server is `--max-warnings 0`), `prettier --check .` over
    the whole server package **and** `cd docs && pnpm format` — prettier is a CI gate separate from
    eslint, and docs prettier reaches this spec file — plus type checks, web checks, and the full
    server/web/e2e suites.

## 10. Accepted tradeoffs

1. **"Keep" is not recorded** (§3.1) — re-audits start fresh; Lock is the deliberate opt-in.
2. **Manual review is blocked while a scan runs** — a consequence of reusing `resolveFaces`'s
   concurrency guard, and the correct trade against conflicting writes.
3. **The chooser adds a click** in front of the dashboard admins land on today, mitigated by making
   `/scan` and `/people` directly linkable.
4. **Moving a face writes no negative verdict against the source person** — unnecessary, because the
   face ends up assigned and the suggestion engine only proposes unassigned faces.
