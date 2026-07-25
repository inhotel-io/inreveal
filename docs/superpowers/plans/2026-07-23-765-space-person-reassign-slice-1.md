# #765 Space-Person Reassign — Slice 1: Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the backend foundation for space-member "Fix incorrect match" — relocate the projection-refresh helper to a shared service, expose the identity→owner-person lookup, and add the source-face projection query — with **no user-facing behavior change**.

**Architecture:** Pure refactor + additive read primitives. `refreshSharedSpaceFacesAfterReassign` moves from `PersonService` (private) to `IdentityMergePropagationService` (which already holds `sharedSpaceRepository` + `jobRepository` via its `deps`), so both `PersonService` (owner path) and the future `SharedSpaceService` (space path, Slice 3) can call it. `FaceIdentityRepository.getPersonByIdentity` is promoted from `private` to public for Slice 2. A new guarded `SharedSpaceRepository` query resolves `(spacePersonId, assetIds) → asset_face[]` for Slice 3.

**Tech Stack:** NestJS 11, Kysely, Vitest (unit + medium/testcontainers). Server package `immich`. Run from `server/`.

## Global Constraints

- Spec: `docs/plans/2026-07-23-765-space-person-reassign-design.md` (§4.2 P1, §4.4 relocation, D1/D2).
- No relative imports — use `src/` path alias. Prettier 120-col, single quotes, semicolons. ESLint `--max-warnings 0`.
- This slice must not change any behavior: the existing `person.service.spec.ts` `reassignFaces`/`reassignFacesById` tests must remain green unchanged.
- Commands run from `server/`. Whole unit test file: `pnpm test -- --run <path>`. Medium tests: `pnpm test:medium -- --run <path>` (needs Docker).
- **Repo tooling trap (found executing Task 1):** `pnpm test -- --run <file> -t <pattern>` double-inserts `--` and **silently runs the full suite instead of filtering**, so a "scoped" run gives misleading output. For a genuinely scoped run use:
  `pnpm exec vitest --config test/vitest.config.mjs run <file> -t <pattern>`

---

### Task 1: Relocate `refreshSharedSpaceFacesAfterReassign` to `IdentityMergePropagationService`

**Files:**

- Modify: `server/src/services/identity-merge-propagation.service.ts` (add public method)
- Modify: `server/src/services/person.service.ts:1190-1225` (remove private method), `:244`, `:271` (repoint call sites)
- Test: `server/src/services/person.service.spec.ts` (existing `reassignFaces`/`reassignFacesById` describes — must stay green)

**Interfaces:**

- Produces: `IdentityMergePropagationService.refreshSharedSpaceFacesAfterReassign(assetId: string, assetFaceId: string): Promise<void>` — evicts the stale space-person projection for the face and re-queues `SharedSpaceFaceMatch` across every space containing the asset. Identical logic to the current private `PersonService` method.
- Consumes: `this.deps.sharedSpaceRepository`, `this.deps.jobRepository` (both already on `IdentityMergePropagationDependencies`).

- [ ] **Step 1: Run the existing reassign tests to capture the green baseline**

Run: `cd server && pnpm test -- --run src/services/person.service.spec.ts -t reassign`
Expected: PASS (baseline — both `reassignFaces` and `reassignFacesById` describes green).

- [ ] **Step 2: Add the method to `IdentityMergePropagationService`**

In `server/src/services/identity-merge-propagation.service.ts`, add a public method on the class (after the constructor). `JobName` is already imported (`src/enum`, line 6). Copy the body verbatim from `person.service.ts:1197-1224`, changing `this.sharedSpaceRepository` → `this.deps.sharedSpaceRepository` and `this.jobRepository` → `this.deps.jobRepository`:

```typescript
  // Relocated from PersonService (#765) so both the owner reassign path (PersonService) and the
  // space-editor reassign path (SharedSpaceService, via this service) share one implementation.
  //
  // A reassign rewrites asset_face.personId, but every space-scoped person view reads the
  // shared_space_person_face projection instead. Evict the stale assignment synchronously so the
  // face leaves the wrong person immediately, then queue the match job to re-add it under the
  // correct one. Must run AFTER the identity swap (replaceFaceIdentity): the match job resolves the
  // target space person from face_identity_face, so evicting before the swap would re-add the OLD person.
  async refreshSharedSpaceFacesAfterReassign(assetId: string, assetFaceId: string): Promise<void> {
    const spaceIds = await this.deps.sharedSpaceRepository.getSpaceIdsForAsset(assetId);
    const refreshedSpaceIds = new Set<string>();
    for (const { spaceId } of spaceIds) {
      if (refreshedSpaceIds.has(spaceId)) {
        continue;
      }
      refreshedSpaceIds.add(spaceId);

      // getSpaceIdsForAsset is broader than the match job's own isAssetInSpace guard, which also
      // requires the asset to be present, online and visible. Only evict where that guard will
      // pass, otherwise the face would be dropped from the space with nothing to re-add it.
      if (await this.deps.sharedSpaceRepository.isAssetInSpace(spaceId, assetId)) {
        const vacatedPersonIds = await this.deps.sharedSpaceRepository.removePersonFaceAssignmentsForSpaceFace(
          spaceId,
          assetFaceId,
        );
        if (vacatedPersonIds.length > 0) {
          await this.deps.sharedSpaceRepository.recountPersons(vacatedPersonIds);
          await this.deps.sharedSpaceRepository.deleteOrphanedPersonsByIds(spaceId, vacatedPersonIds);
        }
      }

      await this.deps.jobRepository.queue({
        name: JobName.SharedSpaceFaceMatch,
        data: { spaceId, assetId },
      });
    }
  }
```

- [ ] **Step 3: Delete the private method from `PersonService` and repoint call sites**

In `server/src/services/person.service.ts`: delete the entire private method at `:1190-1225` (the comment block `// A reassign rewrites…` through the closing brace of `refreshSharedSpaceFacesAfterReassign`). Then repoint both call sites — at `:244` and `:271` change:

```typescript
await this.refreshSharedSpaceFacesAfterReassign(face.assetId, face.id);
```

to

```typescript
await this.identityMergePropagationService.refreshSharedSpaceFacesAfterReassign(face.assetId, face.id);
```

(`this.identityMergePropagationService` is provided by `BaseService`; `PersonService` extends it. Confirm both call sites use variable `face` — `reassignFaces` loops `for (const face of faces)`, `reassignFacesById` uses `face`.)

- [ ] **Step 4: Typecheck + run the reassign tests (must still be green — proves the refactor is behavior-preserving)**

Run: `cd server && pnpm check 2>&1 | tail -5 && pnpm test -- --run src/services/person.service.spec.ts -t reassign`
Expected: `tsc` clean; PASS. The tests assert on `mocks.sharedSpace.*` / `mocks.job.queue` (repository-level), which are the same injected mocks the relocated method uses via `this.deps`, so no test edit is needed. If any test references the removed private method by name, that is a real coupling to fix — there should be none.

- [ ] **Step 5: Commit**

```bash
cd /Users/pierre/dev/gallery/.claude/worktrees/fix-765-space-editor-face-reassign
git add server/src/services/identity-merge-propagation.service.ts server/src/services/person.service.ts
git commit -m "refactor(people): relocate space-face reassign refresh to IdentityMergePropagationService (#765)"
```

---

### Task 2: Expose `getPersonByIdentity` on `FaceIdentityRepository`

**Files:**

- Modify: `server/src/repositories/face-identity.repository.ts:2598` (visibility)

**Interfaces:**

- Produces: public `getPersonByIdentity(ownerId: string, identityId: string, excludePersonId?: string): Promise<{ id: string } | undefined>` — the global person owned by `ownerId` carrying `identityId`, if any. Used by Slice 2 to resolve/create an owner-aligned target.

- [ ] **Step 1: Change visibility from `private` to public**

In `server/src/repositories/face-identity.repository.ts:2598`, change:

```typescript
  private getPersonByIdentity(ownerId: string, identityId: string, excludePersonId?: string) {
```

to:

```typescript
  getPersonByIdentity(ownerId: string, identityId: string, excludePersonId?: string) {
```

(No body change. It is already an unused-in-this-slice public accessor consumed in Slice 2.)

- [ ] **Step 2: Typecheck + lint**

Run: `cd server && pnpm check 2>&1 | tail -5 && pnpm lint src/repositories/face-identity.repository.ts 2>&1 | tail -5`
Expected: clean. (No new test — the method has no new behavior; Slice 2 covers its use. If lint flags it as unused, that resolves in Slice 2; for this slice add `// eslint-disable-next-line` ONLY if the build fails, otherwise leave as-is.)

- [ ] **Step 3: Commit**

```bash
git add server/src/repositories/face-identity.repository.ts
git commit -m "refactor(face-identity): expose getPersonByIdentity for space-person reassign (#765)"
```

---

### Task 3: Add `getSourceFacesForSpacePersonAssets` to `SharedSpaceRepository`

**Files:**

- Modify: `server/src/repositories/shared-space.repository.ts` (add query method, near the other `getSpacePerson*`/face queries ~`:2139`)
- Test: `server/test/medium/specs/repositories/shared-space.repository.spec.ts` if it exists, else co-locate in `server/test/medium/specs/services/people-identity-rbac.spec.ts` (real-DB medium)

**Interfaces:**

- Produces: `getSourceFacesForSpacePersonAssets(spacePersonId: string, assetIds: string[]): Promise<Array<{ assetFaceId: string; assetId: string; personId: string | null; assetOwnerId: string }>>` — the visible, non-deleted `asset_face`(s) that project to `spacePersonId` (via `shared_space_person_face`) for the given assets, plus each asset's owner (for Slice 2 owner-aligned target resolution). Empty `assetIds` → `[]`. An asset with a face not projecting to `spacePersonId` → excluded.

- [ ] **Step 1: Write the failing medium test**

Add to the chosen medium spec (real DB). Given a space, a `shared_space_person` with a projected face on member A's asset, and a second asset with a face NOT projecting to that space person:

```typescript
it('resolves only the projected, visible faces for a space person + assets (#765)', async () => {
  // Arrange: space person SP with projected face F1 on asset A1 (owner U); asset A2 has face F2 not projecting to SP.
  // (Use the suite's existing space/person/face fixtures; see sibling tests for the builder helpers.)
  const rows = await sharedSpaceRepository.getSourceFacesForSpacePersonAssets(SP.id, [A1.id, A2.id]);
  expect(rows).toEqual([{ assetFaceId: F1.id, assetId: A1.id, personId: expect.any(String), assetOwnerId: U.id }]);
  expect(await sharedSpaceRepository.getSourceFacesForSpacePersonAssets(SP.id, [])).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && pnpm test:medium -- --run <chosen-spec-path> -t 'resolves only the projected'`
Expected: FAIL with "getSourceFacesForSpacePersonAssets is not a function".

- [ ] **Step 3: Implement the query**

In `server/src/repositories/shared-space.repository.ts`, add (mirror the visibility guards used by `getAllForUser` in `person.repository.ts:334-335` — `deletedAt is null`, `isVisible is true` — and by sibling asset joins here):

```typescript
  getSourceFacesForSpacePersonAssets(spacePersonId: string, assetIds: string[]) {
    if (assetIds.length === 0) {
      return Promise.resolve([] as Array<{ assetFaceId: string; assetId: string; personId: string | null; assetOwnerId: string }>);
    }
    return this.db
      .selectFrom('shared_space_person_face')
      .innerJoin('asset_face', 'asset_face.id', 'shared_space_person_face.assetFaceId')
      .innerJoin('asset', 'asset.id', 'asset_face.assetId')
      .select([
        'asset_face.id as assetFaceId',
        'asset_face.assetId as assetId',
        'asset_face.personId as personId',
        'asset.ownerId as assetOwnerId',
      ])
      .where('shared_space_person_face.personId', '=', spacePersonId)
      .where('asset_face.assetId', 'in', assetIds)
      .where('asset_face.deletedAt', 'is', null)
      .where('asset_face.isVisible', 'is', true)
      .where('asset.deletedAt', 'is', null)
      .execute();
  }
```

Add a `@GenerateSql` decorator matching the sibling methods' style if they carry one (check `getSpaceRepresentativeFaces` ~`:2180`); if unsure, follow the immediate neighbor. Run `make sql` from repo root after if decorated.

**CORRECTION (post-review):** the code block above is INSUFFICIENT — it under-delivers against spec §4.2 step 2, which requires **parity with the sibling queries' guards**. Beyond the three guards shown, the query MUST also enforce, like `getSpaceRepresentativeFaceForUpdate` (`:2138-2177`) and `getSpaceRepresentativeFaces` (`:2179-2222`):

- `asset.isOffline = false`
- `asset.visibility` within `visibleSpaceAssetVisibilities`
- an in-space existence check (`shared_space_asset` / `shared_space_library` / `spaceAlbumAssetExists`), deriving the `spaceId` by joining `shared_space_person` on the source space-person id.

This is security-relevant: a space Editor's authority to reassign a face on another member's asset derives from that asset actually being in-scope for the space, so a face whose asset has gone offline, changed visibility, or left the space must not be resolvable here even if a stale `shared_space_person_face` row still exists.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server && pnpm test:medium -- --run <chosen-spec-path> -t 'resolves only the projected'`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd server && pnpm check 2>&1 | tail -5
cd /Users/pierre/dev/gallery/.claude/worktrees/fix-765-space-editor-face-reassign
git add server/src/repositories/shared-space.repository.ts server/test/medium/specs/**/*.spec.ts server/src/repositories/shared-space.repository.sql 2>/dev/null
git commit -m "feat(shared-space): add getSourceFacesForSpacePersonAssets projection query (#765)"
```

---

## Slice 1 exit criteria

- `pnpm check` clean; `pnpm lint` clean (`--max-warnings 0`).
- `pnpm test -- --run src/services/person.service.spec.ts` fully green (behavior preserved by the relocation).
- New medium test green.
- Three commits present. Nothing from Slices 2–4 implemented (no DTO, no controller route, no FE changes, no `reassignFaceToResolvedTarget`).

## Self-review notes (author)

- Spec coverage: §4.4 relocation (Task 1) ✓; `getPersonByIdentity` exposure (Task 2, spec §4.2.3.1 + Appendix) ✓; §4.2 P1 source query (Task 3) ✓.
- No placeholders except the `<chosen-spec-path>` and fixture-builder references in Task 3, which the executor resolves by reading the sibling medium spec (the suite's fixture helpers are established there).
- Type consistency: `refreshSharedSpaceFacesAfterReassign(assetId, assetFaceId)` signature unchanged from the original; `getSourceFacesForSpacePersonAssets` return shape is the exact input Slice 2/3 consume (`assetFaceId`, `assetId`, `personId`, `assetOwnerId`).
