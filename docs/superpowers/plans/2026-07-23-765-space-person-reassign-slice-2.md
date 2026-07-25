# #765 Space-Person Reassign — Slice 2: Core Target Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the identity-aware core that reassigns already-resolved source faces to a target person — resolving/creating the target **owned by each face's asset owner** — with the projection refreshed per face.

**Architecture:** One new public method on `IdentityMergePropagationService` (which after Slice 1 owns `refreshSharedSpaceFacesAfterReassign`). It takes the rows Slice 1's `getSourceFacesForSpacePersonAssets` returns plus a target descriptor, and per face does: resolve target person → `reassignFace` → relink identity → refresh projection. Slice 3 wraps it with RBAC + source resolution + the HTTP route.

**Tech Stack:** NestJS 11, Kysely, Vitest. Server package `immich`. Commands from `server/`.

## Global Constraints

- Governing spec: `docs/plans/2026-07-23-765-space-person-reassign-design.md` (§4.2 step 3, D1, D3, D4).
- **D1 — owner alignment:** any person _created_ here is owned by **the face's `assetOwnerId`**, never the acting user.
- **D3 — no cross-owner gate:** a single-face reassign is a re-point. Do NOT add `confirmCrossOwner` or call `createCrossOwnerMergeAuthorizer`.
- **D4 — create-new grouping:** `target: {type:'new'}` creates **one new person per distinct `assetOwnerId`** across the batch, not one per face.
- **No authorization logic in this method.** Role/membership is Slice 3's service concern.
- Real enum values (verified in code, and they differ from the spec's §4.1 sketch):
  `ScopedPersonProfileRefDto` (`src/dtos/person.dto.ts:59-64`) is `{ type: 'person' | 'space-person'; id: string; spaceId?: string }`.
  The value is **`'person'`** for a global person — NOT `'user-person'`. (`'user-person'` belongs to the _other_ enum, `PersonResponseDto.primaryProfile.type`; Slice 4's frontend must map between them.)
- No relative imports (`src/` alias). Prettier 120-col, single quotes, semicolons. ESLint `--max-warnings 0`.
- **Repo tooling trap:** `pnpm test -- --run <file> -t <pattern>` double-inserts `--` and silently runs the FULL suite. For a scoped run use `pnpm exec vitest --config test/vitest.config.mjs run <file> -t <pattern>` (medium: `test/vitest.config.medium.mjs`).

---

### Task 1: `reassignSpaceFacesToTarget` on `IdentityMergePropagationService`

**Files:**

- Modify: `server/src/services/identity-merge-propagation.service.ts` (types + one public method)
- Test: `server/src/services/identity-merge-propagation.service.spec.ts` (existing unit spec; `sut` is constructed directly at ~`:526` with hand-rolled `vi.fn()` deps and returns `{ sut, mocks: { database, faceIdentity, job, logger, person, sharedSpace } }`)

**Interfaces:**

- Consumes (Slice 1): row shape from `SharedSpaceRepository.getSourceFacesForSpacePersonAssets` → `{ assetFaceId: string; assetId: string; personId: string | null; assetOwnerId: string }`; `IdentityMergePropagationService.refreshSharedSpaceFacesAfterReassign(assetId, assetFaceId)`; public `FaceIdentityRepository.getPersonByIdentity(ownerId, identityId, excludePersonId?) → Promise<{id: string} | undefined>`.
- Consumes (existing): `FaceIdentityRepository.ensureSpacePersonIdentity(spacePersonId) → Promise<FaceIdentity>`; `FaceIdentityRepository.ensurePersonIdentity(personId) → Promise<FaceIdentity>`; `FaceIdentityRepository.replaceFaceIdentity({assetFaceId, identityId, source})`; `PersonRepository.create(Insertable<PersonTable>)` (returns the created row); `PersonRepository.reassignFace(assetFaceId, newPersonId) → Promise<number>`.
- Produces (for Slice 3): `reassignSpaceFacesToTarget(faces: SpaceReassignSourceFace[], target: SpaceFaceReassignTarget) → Promise<{ reassigned: number; targetPersonIds: string[] }>`, plus exported types `SpaceReassignSourceFace` and `SpaceFaceReassignTarget`.

- [ ] **Step 1: Write the failing unit tests**

Add a `describe('reassignSpaceFacesToTarget', ...)` to `server/src/services/identity-merge-propagation.service.spec.ts`, using that file's existing `setup()`/sut+mocks helper.

**First, extend the hand-rolled dependency mocks in that helper.** Unlike the `newTestService` autompocked specs, this file builds its `faceIdentityRepository` / `personRepository` / `sharedSpaceRepository` stubs by hand (~`:400-535`), so any method this new code calls that is not already stubbed must be added, in the same `vi.fn().mockResolvedValue(...)` style as its neighbours. Check for and add as needed:

- `faceIdentityRepository`: `ensureSpacePersonIdentity`, `ensurePersonIdentity`, `replaceFaceIdentity`, `getPersonByIdentity` (**newly public in Slice 1** — almost certainly absent)
- `personRepository`: `create`, `reassignFace`
- `sharedSpaceRepository`: the ones the relocated refresh helper calls — `getSpaceIdsForAsset`, `isAssetInSpace`, `removePersonFaceAssignmentsForSpaceFace`, `recountPersons`, `deleteOrphanedPersonsByIds`
- `jobRepository`: `queue`

Give them sane defaults (e.g. `getSpaceIdsForAsset` → `[]`) so the existing merge tests are unaffected, and override per-test as each case below requires. If adding a stub changes any existing test's behaviour, that is a signal you have altered a shared default — report it rather than adjusting the old tests.

Cover exactly these eight behaviours:

```typescript
// A. target 'new' -> creates an owner-aligned, IDENTITY-LESS person and reassigns to it
it('creates a new person owned by the asset owner (no identityId) and reassigns the face', async () => {
  // faces: [{assetFaceId:'f1', assetId:'a1', personId:'p-old', assetOwnerId:'owner-1'}]
  // mocks.person.create -> {id:'p-new'}
  // expect mocks.person.create called ONCE with { ownerId: 'owner-1' } and NO identityId key
  // expect mocks.person.reassignFace called with ('f1','p-new')
  // expect result { reassigned: 1, targetPersonIds: ['p-new'] }
});

// B. D4 grouping: one new person PER DISTINCT asset owner
it('creates one new person per distinct asset owner', async () => {
  // faces: owner-1 x2 faces, owner-2 x1 face
  // expect mocks.person.create called exactly TWICE (once per owner)
  // expect both owner-1 faces reassigned to the same new person id
});

// C. existing space-person target, owner-aligned person ALREADY in the identity -> reuse, no create
it("reuses the asset owner's existing person in the target identity", async () => {
  // target {type:'existing', profile:{type:'space-person', id:'sp-1', spaceId:'space-1'}}
  // mocks.faceIdentity.ensureSpacePersonIdentity -> {id:'identity-1'}
  // mocks.faceIdentity.getPersonByIdentity -> {id:'p-existing'}
  // expect mocks.person.create NOT called; reassignFace called with ('f1','p-existing')
});

// D. THE TRAP: existing space-person target, NO owner person in identity -> create WITH identityId
it('creates the owner-aligned person WITH the target identityId when absent', async () => {
  // mocks.faceIdentity.getPersonByIdentity -> undefined
  // expect mocks.person.create called with { ownerId:'owner-1', identityId:'identity-1' }
  // (identity MUST be set at creation: ensurePersonIdentity mints a FRESH identity for an
  //  identity-less person, which would spawn a duplicate space person and re-break #765)
});

// E. existing 'person' (global) target -> used directly
it('uses a global person target directly without identity resolution', async () => {
  // target {type:'existing', profile:{type:'person', id:'p-global'}}
  // expect ensureSpacePersonIdentity NOT called, getPersonByIdentity NOT called, create NOT called
  // expect reassignFace called with ('f1','p-global')
});

// F. per-face ordering is load-bearing
it('reassigns, then relinks identity, then refreshes the projection, in that order', async () => {
  // assert invocationCallOrder: person.reassignFace < faceIdentity.replaceFaceIdentity
  //   < sharedSpace.getSpaceIdsForAsset  (the refresh helper's first repo call)
});

// G. projection refresh actually runs per face
it('refreshes the shared-space projection for each reassigned face', async () => {
  // mocks.sharedSpace.getSpaceIdsForAsset -> [{spaceId:'space-1'}]; isAssetInSpace -> true
  // expect mocks.job.queue called with SharedSpaceFaceMatch {spaceId:'space-1', assetId:'a1'}
});

// H. empty input is a no-op
it('does nothing for an empty face list', async () => {
  // expect result {reassigned:0, targetPersonIds:[]} and NO repository calls
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && pnpm exec vitest --config test/vitest.config.mjs run src/services/identity-merge-propagation.service.spec.ts -t reassignSpaceFacesToTarget`
Expected: FAIL — `sut.reassignSpaceFacesToTarget is not a function`.

- [ ] **Step 3: Implement the method**

In `server/src/services/identity-merge-propagation.service.ts`, export the two types near the other exported types at the top of the file, and add the public method to the class:

```typescript
export type SpaceReassignSourceFace = {
  assetFaceId: string;
  assetId: string;
  personId: string | null;
  assetOwnerId: string;
};

export type SpaceFaceReassignTarget = { type: 'new' } | { type: 'existing'; profile: ScopedPersonProfileRefDto };
```

```typescript
  /**
   * Reassign already-resolved source faces to a target person (#765).
   *
   * The target person is always owner-aligned: it is resolved (or created) under the *asset's* owner,
   * matching how every other face-holding person is created in this codebase. Per D4, a `new` target
   * mints one person per distinct asset owner, not one per face.
   */
  async reassignSpaceFacesToTarget(
    faces: SpaceReassignSourceFace[],
    target: SpaceFaceReassignTarget,
  ): Promise<{ reassigned: number; targetPersonIds: string[] }> {
    if (faces.length === 0) {
      return { reassigned: 0, targetPersonIds: [] };
    }

    // A space-person target resolves to ONE identity for the whole batch; the per-owner person that
    // carries it is resolved (or created) below, per face's asset owner.
    let targetIdentityId: string | undefined;
    if (target.type === 'existing' && target.profile.type === 'space-person') {
      const identity = await this.deps.faceIdentityRepository.ensureSpacePersonIdentity(target.profile.id);
      targetIdentityId = identity.id;
    }

    const personIdByOwner = new Map<string, string>();
    const targetPersonIds = new Set<string>();
    let reassigned = 0;

    for (const face of faces) {
      let targetPersonId: string;

      if (target.type === 'existing' && target.profile.type === 'person') {
        // A global person id the caller already holds — use it as-is.
        targetPersonId = target.profile.id;
      } else {
        const cached = personIdByOwner.get(face.assetOwnerId);
        if (cached) {
          targetPersonId = cached;
        } else if (targetIdentityId) {
          const existing = await this.deps.faceIdentityRepository.getPersonByIdentity(
            face.assetOwnerId,
            targetIdentityId,
          );
          // The identity MUST be set at creation. replaceFaceIdentity below calls ensurePersonIdentity,
          // which mints a BRAND-NEW identity for an identity-less person — that would project the face
          // under a duplicate space person instead of the target, silently re-breaking #765.
          targetPersonId =
            existing?.id ??
            (
              await this.deps.personRepository.create({
                ownerId: face.assetOwnerId,
                identityId: targetIdentityId,
              })
            ).id;
          personIdByOwner.set(face.assetOwnerId, targetPersonId);
        } else {
          // target.type === 'new': deliberately identity-less so ensurePersonIdentity mints a fresh
          // identity, which is what makes this a genuinely new person/space person.
          const created = await this.deps.personRepository.create({ ownerId: face.assetOwnerId });
          targetPersonId = created.id;
          personIdByOwner.set(face.assetOwnerId, targetPersonId);
        }
      }

      await this.deps.personRepository.reassignFace(face.assetFaceId, targetPersonId);
      const identity = await this.deps.faceIdentityRepository.ensurePersonIdentity(targetPersonId);
      await this.deps.faceIdentityRepository.replaceFaceIdentity({
        assetFaceId: face.assetFaceId,
        identityId: identity.id,
        source: 'manual',
      });
      // Must run AFTER the identity relink — the match job resolves the target space person from
      // face_identity_face.
      await this.refreshSharedSpaceFacesAfterReassign(face.assetId, face.assetFaceId);

      targetPersonIds.add(targetPersonId);
      reassigned += 1;
    }

    return { reassigned, targetPersonIds: [...targetPersonIds] };
  }
```

Import `ScopedPersonProfileRefDto` — it is **already imported** in this file (`src/dtos/person.dto`, line 5). Do not add a duplicate import.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && pnpm exec vitest --config test/vitest.config.mjs run src/services/identity-merge-propagation.service.spec.ts -t reassignSpaceFacesToTarget`
Expected: PASS, 8/8, output pristine.

- [ ] **Step 5: Full spec + typecheck + lint**

Run:

```bash
cd server
pnpm exec vitest --config test/vitest.config.mjs run src/services/identity-merge-propagation.service.spec.ts
pnpm check 2>&1 | tail -5
pnpm lint src/services/identity-merge-propagation.service.ts 2>&1 | tail -5
```

Expected: whole spec green (no regressions in the existing merge tests), tsc clean, lint clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/pierre/dev/gallery/.claude/worktrees/fix-765-space-editor-face-reassign
git add server/src/services/identity-merge-propagation.service.ts server/src/services/identity-merge-propagation.service.spec.ts
git commit -m "feat(people): resolve owner-aligned reassign targets for space faces (#765)"
```

---

## Slice 2 exit criteria

- 8 new unit tests green; existing `identity-merge-propagation.service.spec.ts` tests unregressed; `pnpm check` and lint clean.
- No DTO, controller route, service wrapper, or frontend code (those are Slices 3–4).
- No `confirmCrossOwner` / cross-owner authorizer anywhere (D3).

## Self-review notes (author)

- Spec coverage: §4.2 step 3.1 all three target branches (A/B/C/D/E) ✓; step 3.2 identity-link trap (test D) ✓; steps 3.3-3.5 reassign→relink→refresh with ordering (F/G) ✓; D1 owner alignment (A/D) ✓; D4 per-owner grouping (B) ✓; D3 no cross-owner gate (constraint + exit criteria) ✓.
- Placeholders: none — every test names its exact mock setup and assertions; the implementation is complete code.
- Type consistency: the `faces` row shape is exactly Slice 1's `getSourceFacesForSpacePersonAssets` return; `{reassigned, targetPersonIds}` is what Slice 3's endpoint returns as `{reassigned, targets}` after mapping ids to `SharedSpacePersonResponseDto`.
