# #765 Space-Person Reassign — Slice 3: Endpoint (DTO + Service + Controller) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the space-scoped reassign as an Editor-gated HTTP endpoint that resolves source faces (Slice 1) and delegates target resolution (Slice 2), proving end-to-end that a misassigned photo leaves the wrong space person and stays gone.

**Architecture:** `POST /shared-spaces/:id/people/:personId/reassign`. `SharedSpaceService.reassignSpacePersonFaces` does RBAC + validation + source resolution, then delegates to `IdentityMergePropagationService.reassignSpaceFacesToTarget`. Mirrors `mergeSpacePeople` exactly.

**Tech Stack:** NestJS 11, Kysely, Zod DTOs, Vitest (unit + medium), e2e (vitest).

## Global Constraints

- Governing spec: `docs/plans/2026-07-23-765-space-person-reassign-design.md` (§4.1, §4.2, §4.5, §5 AC1-AC3, §6.1/6.2/6.3).
- **RBAC:** controller `@Authenticated({ permission: Permission.SharedSpaceUpdate })` + service `await this.requireRole(auth, spaceId, SharedSpaceRole.Editor)` — exactly the `mergeSpacePeople` pattern. Viewers and non-members → **403**.
- **D3:** no `confirmCrossOwner`, no cross-owner authorizer.
- **Response is `{ reassigned: number }` only.** Do NOT try to return the resulting space people: the target space person is materialized asynchronously by the `SharedSpaceFaceMatch` job, so it is not reliably resolvable in the request. (This supersedes the spec's §4.1 `targets` field.)
- Real enum: `ScopedPersonProfileRefDto` is `{ type: 'person' | 'space-person'; id; spaceId? }` — global person is **`'person'`**.
- No relative imports (`src/` alias). Prettier 120-col, single quotes, semicolons. ESLint `--max-warnings 0`.
- **Tooling trap:** `pnpm test -- --run <file> -t <pattern>` silently runs the FULL suite. Use `pnpm exec vitest --config test/vitest.config.mjs run <file> -t <pattern>` (medium: `test/vitest.config.medium.mjs`).
- After any DTO/controller change run `pnpm build && pnpm sync:open-api` then `make open-api` from repo root (Slice 4 consumes the SDK).

---

### Task 1: DTO + `SharedSpaceService.reassignSpacePersonFaces` + unit tests

**Files:**

- Modify: `server/src/dtos/person.dto.ts:59` (export `ScopedPersonProfileRefSchema`)
- Modify: `server/src/dtos/shared-space-person.dto.ts` (new request + response DTOs)
- Modify: `server/src/services/shared-space.service.ts` (new method, near `mergeSpacePeople` ~`:1670`)
- Test: `server/src/services/shared-space.service.spec.ts` (new `describe('reassignSpacePersonFaces')`)

**Interfaces:**

- Consumes: `SharedSpaceRepository.getSourceFacesForSpacePersonAssets(spacePersonId, assetIds)` (Slice 1); `IdentityMergePropagationService.reassignSpaceFacesToTarget(faces, target) → { reassigned, targetPersonIds }` (Slice 2); `SharedSpaceRepository.getPersonById(id)`; `this.requireRole(auth, spaceId, SharedSpaceRole.Editor)`; `this.accessRepository.person.checkOwnerAccess(userId, Set<string>)` and `.checkSharedSpaceEditAccess(userId, Set<string>)`.
- Produces: `reassignSpacePersonFaces(auth, spaceId, personId, dto) → Promise<{ reassigned: number }>`; `SharedSpacePersonReassignDto`; `SharedSpacePersonReassignResponseDto`.

- [ ] **Step 1: Write the failing unit tests**

Add `describe('reassignSpacePersonFaces')` to `server/src/services/shared-space.service.spec.ts` following that file's existing `newTestService(SharedSpaceService)` setup and its `mergeSpacePeople` tests as the shape reference. Cover exactly:

```
1. viewer role -> rejected (403/Forbidden); getSourceFacesForSpacePersonAssets and
   reassignSpaceFacesToTarget never called.
2. non-member -> rejected; no mutation calls.
3. source space person not found, or found but belongs to a DIFFERENT space -> BadRequestException
   ('Person not found'); no mutation calls.
4. target {type:'existing', profile:{type:'space-person'}} that is NOT in this space
   -> BadRequestException; no mutation calls.
5. target space-person id === the source :personId -> BadRequestException
   ('Cannot reassign a person into themselves'); no mutation calls.
6. target {type:'existing', profile:{type:'person', id:'p-global'}} the caller can neither own
   nor space-edit -> BadRequestException; no mutation calls.
   (checkOwnerAccess -> empty Set AND checkSharedSpaceEditAccess -> empty Set)
7. target {type:'person'} the caller owns -> allowed; delegates with that target.
8. happy path: resolves faces via getSourceFacesForSpacePersonAssets(personId, dto.assetIds) and
   passes EXACTLY those rows plus dto.target to reassignSpaceFacesToTarget; returns
   { reassigned } from its result.
9. no faces resolve (empty array) -> returns { reassigned: 0 } without throwing; delegate still
   called once with [] (or short-circuits — assert whichever the implementation does, and make it
   deliberate).
```

- [ ] **Step 2: Run to verify RED**

Run: `cd server && pnpm exec vitest --config test/vitest.config.mjs run src/services/shared-space.service.spec.ts -t reassignSpacePersonFaces`
Expected: FAIL — `sut.reassignSpacePersonFaces is not a function`.

- [ ] **Step 3: Export the scoped-ref schema**

`server/src/dtos/person.dto.ts:59` — change `const ScopedPersonProfileRefSchema = z` to `export const ScopedPersonProfileRefSchema = z`. Nothing else in that file changes.

- [ ] **Step 4: Add the DTOs**

In `server/src/dtos/shared-space-person.dto.ts`, following the file's existing `createZodDto` + `.meta({ id })` conventions (see `SharedSpacePersonMergeSchema` ~`:47`):

```typescript
const SharedSpacePersonReassignSchema = z
  .object({
    assetIds: z.array(z.uuidv4()).min(1).max(100).describe('Assets whose face on this person is misassigned'),
    target: z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('new') }),
        z.object({ type: z.literal('existing'), profile: ScopedPersonProfileRefSchema }),
      ])
      .describe('Where the faces should be reassigned to'),
  })
  .meta({ id: 'SharedSpacePersonReassignDto' });

const SharedSpacePersonReassignResponseSchema = z
  .object({
    reassigned: z.int().min(0).describe('Number of faces actually reassigned'),
  })
  .meta({ id: 'SharedSpacePersonReassignResponseDto' });

export class SharedSpacePersonReassignDto extends createZodDto(SharedSpacePersonReassignSchema) {}
export class SharedSpacePersonReassignResponseDto extends createZodDto(SharedSpacePersonReassignResponseSchema) {}
```

Import `ScopedPersonProfileRefSchema` from `src/dtos/person.dto`.

- [ ] **Step 5: Implement the service method**

In `server/src/services/shared-space.service.ts`, immediately after `mergeSpacePeople`:

```typescript
  /**
   * Reassign a space person's misassigned faces to another person (#765).
   *
   * Editor-gated like every other space person mutation. The client only ever sends space-scoped ids
   * (or a global person id it already holds); the owner-aligned target person is resolved server-side.
   */
  async reassignSpacePersonFaces(
    auth: AuthDto,
    spaceId: string,
    personId: string,
    dto: SharedSpacePersonReassignDto,
  ): Promise<{ reassigned: number }> {
    await this.requireRole(auth, spaceId, SharedSpaceRole.Editor);

    const source = await this.sharedSpaceRepository.getPersonById(personId);
    if (!source || source.spaceId !== spaceId) {
      throw new BadRequestException('Person not found');
    }

    if (dto.target.type === 'existing') {
      const { profile } = dto.target;
      if (profile.type === 'space-person') {
        if (profile.id === personId) {
          throw new BadRequestException('Cannot reassign a person into themselves');
        }
        const target = await this.sharedSpaceRepository.getPersonById(profile.id);
        if (!target || target.spaceId !== spaceId) {
          throw new BadRequestException('Target person not found in this space');
        }
      } else {
        // A global person id supplied by the client. Without this the caller could inject a face into
        // an arbitrary stranger's person by passing any UUID. Mirrors PersonService's reassign target
        // gate: owner fast path, then shared-space Editor access.
        const ids = new Set([profile.id]);
        const isOwner = await this.accessRepository.person.checkOwnerAccess(auth.user.id, ids);
        if (!isOwner.has(profile.id)) {
          const canEdit = await this.accessRepository.person.checkSharedSpaceEditAccess(auth.user.id, ids);
          if (!canEdit.has(profile.id)) {
            throw new BadRequestException('Not found or no person.update access');
          }
        }
      }
    }

    const faces = await this.sharedSpaceRepository.getSourceFacesForSpacePersonAssets(personId, dto.assetIds);
    const { reassigned } = await this.identityMergePropagationService.reassignSpaceFacesToTarget(faces, dto.target);

    return { reassigned };
  }
```

- [ ] **Step 6: Verify GREEN + typecheck + lint**

```bash
cd server
pnpm exec vitest --config test/vitest.config.mjs run src/services/shared-space.service.spec.ts -t reassignSpacePersonFaces
pnpm exec vitest --config test/vitest.config.mjs run src/services/shared-space.service.spec.ts
pnpm check 2>&1 | tail -5
pnpm lint src/services/shared-space.service.ts src/dtos/shared-space-person.dto.ts src/dtos/person.dto.ts 2>&1 | tail -5
```

Expected: 9/9 new green, whole spec green, tsc + lint clean.

- [ ] **Step 7: Commit**

```bash
git add server/src/dtos/person.dto.ts server/src/dtos/shared-space-person.dto.ts server/src/services/shared-space.service.ts server/src/services/shared-space.service.spec.ts
git commit -m "feat(shared-space): add space-person face reassign service (#765)"
```

---

### Task 2: Controller route + OpenAPI regeneration + e2e

**Files:**

- Modify: `server/src/controllers/shared-space.controller.ts` (route after `mergeSpacePeople` ~`:520`)
- Test: `e2e/src/specs/server/api/shared-space.e2e-spec.ts`
- Regenerated: `open-api/**`, `mobile/openapi/**`

**Interfaces:**

- Consumes: `SharedSpaceService.reassignSpacePersonFaces` (Task 1), `SharedSpacePersonParamDto` (`src/dtos/shared-space.dto.ts:236`).
- Produces: `POST /shared-spaces/:id/people/:personId/reassign` → `SharedSpacePersonReassignResponseDto`; SDK function `reassignSpacePersonFaces` for Slice 4.

- [ ] **Step 1: Write the failing e2e tests**

In `e2e/src/specs/server/api/shared-space.e2e-spec.ts`, following its existing space/person fixtures:

```
1. editor: POST .../people/:sp/reassign with {assetIds:[a1], target:{type:'new'}} -> 200 and
   body { reassigned: 1 }.
2. viewer -> 403.
3. non-member (outsider) -> 403.
4. unauthenticated -> 401.
```

- [ ] **Step 2: Run to verify RED**

Run the e2e spec (per `e2e/`'s README/package scripts, e.g. `pnpm test -- shared-space`). Expected: FAIL — route 404 / function missing.

- [ ] **Step 3: Add the controller route**

In `server/src/controllers/shared-space.controller.ts`, after `mergeSpacePeople`:

```typescript
  @Post(':id/people/:personId/reassign')
  @Authenticated({ permission: Permission.SharedSpaceUpdate })
  @Endpoint({
    summary: 'Reassign faces from a person in a shared space',
    description: 'Reassign the selected assets\' faces from this person to another person, or to a new person.',
    history: new HistoryBuilder().added('v1').beta('v1'),
  })
  reassignSpacePersonFaces(
    @Auth() auth: AuthDto,
    @Param() { id, personId }: SharedSpacePersonParamDto,
    @Body() dto: SharedSpacePersonReassignDto,
  ): Promise<SharedSpacePersonReassignResponseDto> {
    return this.service.reassignSpacePersonFaces(auth, id, personId, dto);
  }
```

**CORRECTION (proved during execution):** the line above originally claimed "no `@HttpCode` needed, the default 200 is correct" — that is **wrong**. NestJS defaults `@Post` to **201 Created**, empirically confirmed by a first GREEN run returning 201. Since the contract requires 200, the route MUST carry `@HttpCode(HttpStatus.OK)`. (It still must not use `mergeSpacePeople`'s `NO_CONTENT`, since this route returns a body.)

- [ ] **Step 4: Regenerate the API surface**

```bash
cd server && pnpm build && pnpm sync:open-api
cd .. && mise run open-api
```

**Note (found during execution):** `make open-api` is a hard-coded stub that always exits 1 and redirects to mise; use `mise run open-api`, which works with no Java/Postgres blockers. Commit the regenerated `open-api/`, `mobile/openapi/` **and `packages/sdk/src/fetch-client.ts`** (the actual TS SDK source Slice 4 imports). Do not hand-edit generated files; check `git status` and exclude unrelated `mise.lock` churn.

- [ ] **Step 5: Verify GREEN**

Re-run the e2e spec: all 4 pass. Then `cd server && pnpm check`.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/shared-space.controller.ts e2e/src/specs/server/api/shared-space.e2e-spec.ts open-api mobile/openapi
git commit -m "feat(shared-space): expose space-person face reassign endpoint (#765)"
```

---

### Task 3: Medium (real-DB) acceptance tests — the #765 regression guards

**Files:**

- Create: `server/test/medium/specs/services/space-person-reassign.spec.ts`

**Interfaces:**

- Consumes everything from Slices 1-3. Use the harness style of `server/test/medium/specs/services/people-identity-rbac.spec.ts` (real DB, `newMediumService`, space/person/face fixtures).

- [ ] **Step 1: Write the failing acceptance tests**

These are the spec's §5 acceptance criteria and are the whole point of the feature — each must fail if the fix regresses:

```
AC1 (reassign-to-new, the reported bug):
  Given an editor and a space person whose set includes a misassigned face on ANOTHER member's asset,
  When the editor reassigns that asset with target {type:'new'},
  Then: the face's asset_face.personId changes; the new global person is owned by the ASSET'S OWNER
  (not the editor); after running the queued SharedSpaceFaceMatch work the face no longer projects
  under the original space person; and re-reading the original space person does NOT show it again.

AC2 (reassign-to-existing cross-owner space person):
  Given a second space person 'Grandma' backed by an asset-owner-owned identity,
  When the editor reassigns with target {type:'existing', profile:{type:'space-person', id, spaceId}},
  Then the face joins the TARGET identity (face_identity_face repointed), an owner-aligned person
  carrying that identity is resolved-or-created, and the face projects under the target space
  person — NOT under a newly minted duplicate. (This is the identity-link trap guard.)

AC3 (permission): a viewer performing AC1 is rejected and nothing in the projection changes.

Plus:
  - source space person emptied by the reassign is reaped from the space.
  - an asset shared into TWO spaces refreshes both projections.
  - re-running the same reassign is idempotent (no duplicate people/faces).
```

- [ ] **Step 2: Run to verify RED** (they must fail before Tasks 1-2 exist; if Tasks 1-2 are already committed, verify each assertion fails when you temporarily neuter the relevant behaviour, and record that evidence).

Run: `cd server && pnpm exec vitest --config test/vitest.config.medium.mjs run test/medium/specs/services/space-person-reassign.spec.ts`

- [ ] **Step 3: Make them pass** — no new production code should be needed; if one fails, that is a real defect in Slice 1-3 code. Fix the production code, not the test.

- [ ] **Step 4: Commit**

```bash
git add server/test/medium/specs/services/space-person-reassign.spec.ts
git commit -m "test(shared-space): acceptance coverage for space-person face reassign (#765)"
```

---

## Slice 3 exit criteria

- Endpoint live and Editor-gated; viewers/non-members 403.
- Unit, e2e, and medium suites green; `pnpm check` + lint clean.
- OpenAPI/SDK regenerated and committed (Slice 4 depends on it).
- No frontend code.

## Self-review notes (author)

- Spec coverage: §4.1 endpoint/DTO ✓ (response narrowed to `{reassigned}` with rationale); §4.2 steps 1-2 + delegation ✓; §4.5 RBAC ✓; §6.1 tests 6-9,11-12 → Task 1 tests 1-9 ✓; §6.3 19-21 → Task 2 ✓; §6.2 13-18 → Task 3 ✓.
- Added beyond spec, deliberately: the **global-person target access check** (Task 1 test 6/7). Without it an Editor could pass an arbitrary person UUID and inject a face into a stranger's person — a real privilege hole the spec's §4.2 did not name.
- Type consistency: `reassignSpaceFacesToTarget(faces, target)` args match Slice 2's exported signature exactly; `dto.target` is structurally the `SpaceFaceReassignTarget` union.
