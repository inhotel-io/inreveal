# Hagen face-cluster data corruption — diagnosis

**Reporter:** Hagen Meischner (fotos.meischner.info, v4.56.7, 563k assets, 3 spaces)
**Symptom:** On 2026-05-25 ~10:02 UTC, during the SharedSpace job flood, an automated process
overwrote `asset_face.personId` for a population of faces, assigning Karina's faces to Alejandra's
personal person `f0ef121e`. `face_search.embedding` is intact and still proves the faces are Karina
(0.80 sim to Karina, −0.085 to Alejandra). ~211 of Alejandra's 774 faces exceed minScore against
Karina; the contamination is broad, not a one-off.

Status: **FIXED (prevent-recurrence) — embedding-consistency guard added at the merge chokepoint.**
Data repair of the already-corrupted rows is a separate follow-up (see below).

## Root cause (confirmed)

A SharedSpace merge unified two **genuinely different people's identities**, and the personal
identity backfill then propagated that corrupted identity link into `asset_face.personId`.

### The write to `asset_face.personId`

`mergeIdentities` (`face-identity.repository.ts:2459`) never touches `asset_face.personId` — it only
rewrites `face_identity_face.identityId`, `person.identityId`, `shared_space_person.identityId`. The
`asset_face.personId` mutation comes from `repairPersonalIdentityAssignments`
(`face-identity.repository.ts:2151-2181`), which moves every face of a person to whichever **other
personal person owns the identity the face's `face_identity_face` row now points to**:

```
UPDATE asset_face SET personId = <targetPerson> WHERE personId = <person> AND id IN (<facesForIdentity>)
```

The identity layer is treated as source-of-truth. Corrupt the identity link and the repair faithfully
drags `asset_face.personId` along. So the real corruption is upstream, at the identity merge.

### The bad merge — two trigger sites, one defect class

**Trigger A — `handleSharedSpacePersonDedup` (`shared-space.service.ts:1704-1875`)**, the dominant
process during the 2026-05-25 flood:

1. Per space person it calls `findClosestSpacePerson(spaceId, person.embedding, {maxDistance, numResults:2})`
   (line 1758). `person.embedding` is the embedding of a **single representative face** — see
   `getSpacePersonsWithEmbeddings` (`shared-space.repository.ts:1934`), which joins
   `shared_space_person.representativeFaceId` only. Not a centroid.
2. `findClosestSpacePerson` (`shared-space.repository.ts:1898`) returns the closest **individual face**
   of other space persons (`face_search.embedding <=> ${embedding}`, `distance <= maxDistance`).
3. The only guard is `compatibleMatches.length === 1` (line 1784) — "merge if exactly one match within
   maxDistance." `maxDistance` defaults to `0.5` (`config.ts:296`).
4. On match: `reassignPersonFacesSafe(source, target)` moves **all** of source's faces (survivor =
   more faces, line 1791), then `mergeIdentitiesForSpacePersonEvidence` (line 1806) merges the backing
   identities, picking the **majority-face-count** identity as survivor (`shared-space.service.ts:2310-2316`)
   and merging the rest into it via `mergeIdentities`.

Hagen's query 3c proves the failure precondition: **336 of Alejandra's 774 faces sit within 0.5
distance of Karina.** The two real clusters overlap heavily, so one representative face is easily
within `maxDistance` of a single face in the other cluster → spurious wholesale merge. The
"exactly one match" guard only catches three-way ambiguity; it gives false confidence on two
overlapping clusters.

**Trigger B — `findStrictSpacePersonLocalIdentityClaim` / `applySharedSpaceIdentityReconciliationClaim`
(`shared-space.service.ts:1407-1504`)**: same shape — keys off the space person's single
representative `embedding`, searches local faces within `maxDistance`, same weak `candidates.length
!== 1` guard, same cascade into `mergeIdentities`. Recurs every 6h library scan.

### Why Karina's main cluster survived but the duplicate did not

`mergeIdentities` runs `countMergeConflicts` (`face-identity.repository.ts:2559`) and **returns early
without merging** if any source person (personal or space) would collide with the target identity for
the same owner/space. That guard protects Karina's **named main** person (it holds its own identity for
owner Hagen, so merging it into Alejandra conflicts → blocked). But a **duplicate/secondary Karina
identity** — backing the ~211 ambiguous faces, with no competing named personal person for the same
owner — has no such protection. It was silently absorbed into Alejandra (majority), and the backfill
moved those 211 faces' `asset_face.personId` onto `f0ef121e`. This exactly matches the survivor
direction (Alejandra 563 > Karina-dup 211) and the "main person untouched, duplicate absorbed" outcome.

## Defect summary

1. **Single-representative-face merge decision.** Both dedup and reconciliation decide a wholesale,
   irreversible merge from one representative face vs one neighbour face — no cluster-level agreement.
2. **`maxDistance` reused for merging.** Dedup/reconciliation use the detection threshold (0.5) for an
   irreversible global identity unification. The wrongly-merged faces are ~0.711 distance (0.289 sim)
   from the target on aggregate — a strict dedup band would never have merged them.
3. **No embedding-consistency guard on the identity-merge cascade.** `mergeIdentities` /
   `mergeIdentitiesForSpacePersonEvidence` never check that the two identities' aggregate embeddings
   actually agree before unifying them globally.
4. **`countMergeConflicts` protects only named main persons.** Duplicate/secondary identities backing
   a substantial, embedding-distinct face population are absorbed silently instead of being refused or
   flagged.

## What was implemented

**Embedding-consistency guard at the merge chokepoint** (`face-identity.repository.ts`,
`mergeIdentities`). For automatic merges only (`source === 'shared-space-evidence'` — the dedup,
reconciliation, and evidence-merge paths), before unifying identities we compare each source
identity's bounded-sample embedding **centroid** against the target centroid (`avg(embedding) <=>
avg(embedding)` over `face_identity_face ⋈ face_search`). Any source whose centroid is farther than
`MERGE_IDENTITY_MAX_CENTROID_DISTANCE = 0.5` is dropped from the merge; if all sources are dropped the
merge is a no-op. Manual merges (`source === 'manual'`) bypass the guard — a human overrides.

This is the universal sink for every automatic SharedSpace merge (dedup → `mergeIdentitiesForSpacePersonEvidence`,
reconciliation → `applySharedSpaceIdentityReconciliationClaim`), so one guard covers all trigger sites.
Refusing the identity merge keeps `face_identity_face` pointed at the real source identity, so the
personal backfill repair never drags `asset_face.personId` onto the wrong person — the reported
corruption. Identities with no embedded faces are treated as consistent (cannot assess → do not block).

Tests (medium, real DB): refuses an embedding-distinct automatic merge; still performs an
embedding-consistent automatic merge; manual merges bypass the guard. Full server unit suite (4480),
the face-identity medium spec (86), and the shared-space face-matching medium spec (33) stay green;
tsc + eslint clean.

Threshold rationale: the wrongly-fused clusters were ~0.71 centroid distance apart (Hagen 3b: 0.289
avg similarity), so 0.5 blocks them with margin while leaving same-person duplicate dedup (centroid
distance typically < 0.4) untouched. Tunable.

## Remaining: data repair (separate follow-up)

## Recommended remediation (not yet implemented)

**Code (prevent recurrence) — pick the chokepoint:**

- **(High leverage, low risk) Embedding-consistency guard at the merge chokepoint.** Before any
  `mergeIdentities` driven by automatic SharedSpace evidence, verify the two identities' aggregate
  (centroid or mutual k-NN majority) embeddings agree within a **strict** threshold; refuse otherwise.
  Protects all callers at once.
- **Require cluster agreement, not a single rep face**, in dedup/reconciliation (e.g. a majority of A's
  faces within threshold of B), and/or a **dedicated strict `dedupMaxDistance`** distinct from
  detection's 0.5.
- **Don't silently absorb embedding-distinct secondary identities** — refuse/flag for review.

**Data (repair existing corruption):** `face_search.embedding` is intact, so corruption is
recoverable. Identify affected faces by `asset_face.personId` ↔ embedding disagreement (face closer to
a different person's cluster by a margin) and reassign. **The code fix must land first / together** —
the reconciliation defect recurs every 6h and will re-corrupt any manual repair.

## Open verification items

- Confirm against prod logs which trigger (dedup vs reconciliation) actually fired at 10:02 UTC
  (`Dedup: merging person …` log at `shared-space.service.ts:1794`).
- Confirm the exact `machineLearning.facialRecognition.maxDistance` configured on Hagen's instance
  (default 0.5; report references minScore 0.6 which is a separate detection knob).
