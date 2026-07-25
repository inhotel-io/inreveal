# #765 Space-Person Reassign — Slice 4: Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Fix incorrect match" actually work for a Space member — route the reassign to the new space endpoint, populate the picker with space people, and stop the toast from claiming success when nothing moved.

**Architecture:** All changes live in `UnmergeFaceSelector.svelte`. It already receives the full `PersonResponseDto` as `personAssets`, so the space id and source space-person id both come off `personAssets.primaryProfile` — **no change to the caller page is required**. Existing helpers `isSpaceScopedPerson` / `toScopedPersonRef` (`web/src/lib/utils/scoped-person-ref.ts`) already map `primaryProfile.type` (`'user-person' | 'space-person'`) onto the API's `ScopedPersonProfileRefDto.type` (`'person' | 'space-person'`) — do not hand-roll that mapping.

**Tech Stack:** SvelteKit + Svelte 5, `@immich/sdk`, Vitest + `@testing-library/svelte`, `sdkMock` (`web/src/lib/__mocks__/sdk.mock.ts`).

## Global Constraints

- Governing spec: `docs/plans/2026-07-23-765-space-person-reassign-design.md` §4.3, §6.4.
- Backend (already merged & pushed) provides SDK function:
  `reassignSpacePersonFaces({ id, personId, sharedSpacePersonReassignDto }) → Promise<{ reassigned: number }>`
  where `id` = **space id**, `personId` = **source space-person id**, and the body is
  `{ assetIds: string[]; target: { type: 'new' } | { type: 'existing'; profile: ScopedPersonProfileRefDto } }`.
- The **personal** (non-space) path must keep working exactly as today via the global `reassignFaces`. Do not regress it.
- Web style: Svelte 5 runes where the file already uses them; Prettier; ESLint `--max-warnings 0`.
- Run web tests from `web/`: `pnpm test -- --run src/...`. Typecheck: `pnpm check`.

---

### Task 1: Route space-person reassigns to the space endpoint, fix the picker and the toast

**Files:**

- Modify: `web/src/routes/(user)/people/[personId]/[[photos=photos]]/[[assetId=id]]/UnmergeFaceSelector.svelte`
- Test: create `web/src/routes/(user)/people/[personId]/[[photos=photos]]/[[assetId=id]]/UnmergeFaceSelector.spec.ts` (mirror the harness of the sibling `person-detail-page.spec.ts`: vitest + `@testing-library/svelte` + `sdkMock`, which auto-stubs every exported SDK function including the new one)

**Interfaces:**

- Consumes: `reassignSpacePersonFaces`, `getAllPeople`, `createPerson`, `reassignFaces` from `@immich/sdk`; `isSpaceScopedPerson`, `toScopedPersonRef` from `$lib/utils/scoped-person-ref`.
- Props unchanged: `assetIds: string[]`, `personAssets: PersonResponseDto`, `onConfirm`, `onClose`.

- [ ] **Step 1: Write the failing tests**

Six behaviours (the spec's §6.4 22-27):

```
1. PICKER — space context: when `personAssets.primaryProfile.type === 'space-person'`, the candidate
   list is loaded with shared spaces included, i.e. getAllPeople is called with
   { withHidden: false, withSharedSpaces: true }. (Today it is called without withSharedSpaces, which
   is why a Space member sees an EMPTY picker — they own no people.)
2. ROUTING (create) — space context + "Create new person" calls
   reassignSpacePersonFaces({ id: <primaryProfile.spaceId>, personId: <primaryProfile.id>,
   sharedSpacePersonReassignDto: { assetIds, target: { type: 'new' } } })
   and does NOT call createPerson or the global reassignFaces.
3. ROUTING (reassign to existing) — space context + a selected candidate calls
   reassignSpacePersonFaces with target { type: 'existing', profile: toScopedPersonRef(selected) }.
   Assert BOTH shapes: a candidate whose primaryProfile.type is 'space-person' maps to
   { type: 'space-person', id, spaceId }, and one whose primaryProfile.type is 'user-person' maps to
   { type: 'person', id } — this is the enum mismatch that would otherwise 400.
4. PERSONAL path unchanged — when personAssets is a normal owned person, "Create new person" still
   calls createPerson + global reassignFaces, and reassignSpacePersonFaces is NOT called.
5. HONEST TOAST — when reassignSpacePersonFaces resolves { reassigned: 0 }, the success toast is NOT
   shown; an error/warning is surfaced instead. When it resolves { reassigned: 2 }, success IS shown.
   (Today the toast fires unconditionally with assetIds.length and never reads the response, which is
   exactly why the bug looked like it "worked".)
6. REAPED SOURCE — after a successful space reassign that empties the source person, the component
   does not simply refresh a now-deleted person page. Assert onConfirm/navigation is invoked (pin
   whatever the implementation does, deliberately).
```

- [ ] **Step 2: Run to verify RED**

Run: `cd web && pnpm test -- --run src/routes/\(user\)/people/\[personId\]/\[\[photos=photos\]\]/\[\[assetId=id\]\]/UnmergeFaceSelector.spec.ts`
Expected: FAIL (no such routing; `reassignSpacePersonFaces` never called; picker called without `withSharedSpaces`).

- [ ] **Step 3: Implement**

In `UnmergeFaceSelector.svelte`:

1. Import `reassignSpacePersonFaces` from `@immich/sdk` and `{ isSpaceScopedPerson, toScopedPersonRef }` from `$lib/utils/scoped-person-ref`.
2. Derive the space context once:

```typescript
const spaceRef = $derived(
  personAssets.primaryProfile?.type === 'space-person' && personAssets.primaryProfile.spaceId
    ? { spaceId: personAssets.primaryProfile.spaceId, personId: personAssets.primaryProfile.id }
    : undefined,
);
```

3. Load candidates including space people:

```typescript
const data = await getAllPeople({ withHidden: false, withSharedSpaces: true });
```

4. Add one shared helper used by both buttons, so create/reassign cannot drift:

```typescript
const reassignInSpace = async (target: { type: 'new' } | { type: 'existing'; profile: ScopedPersonProfileRefDto }) => {
  const { reassigned } = await reassignSpacePersonFaces({
    id: spaceRef!.spaceId,
    personId: spaceRef!.personId,
    sharedSpacePersonReassignDto: { assetIds, target },
  });
  return reassigned;
};
```

5. In `handleCreate`: if `spaceRef` is set, `const reassigned = await reassignInSpace({ type: 'new' })`; otherwise keep the existing `createPerson` + `reassignFaces` path (and treat it as `assetIds.length` reassigned).
6. In `handleReassign`: if `spaceRef` is set, `await reassignInSpace({ type: 'existing', profile: toScopedPersonRef(selectedPerson) })`; otherwise keep the existing global `reassignFaces` path.
7. **Toast honestly** in both handlers: only call `toastManager.primary($t('reassigned_assets_to_...'))` when `reassigned > 0`, using `reassigned` (not `assetIds.length`) as the count. When `reassigned === 0`, surface the existing failure string rather than success — reuse `errors.unable_to_reassign_assets_new_person` / `errors.unable_to_reassign_assets_existing_person` (they already exist in `i18n/en.json`); only add a new fork string if a distinct "no matching faces" wording is wanted.
8. Keep `onConfirm()` being called at the end of both handlers so the caller refreshes/navigates as it does today.

- [ ] **Step 4: Run to verify GREEN**

Same command as Step 2. Expected: all six pass, output pristine.

- [ ] **Step 5: Typecheck + lint**

```bash
cd web && pnpm check 2>&1 | tail -8
pnpm lint 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
cd /Users/pierre/dev/gallery/.claude/worktrees/fix-765-space-editor-face-reassign
git add web/src/routes/\(user\)/people/\[personId\]/
git commit -m "fix(web): route space-person 'Fix incorrect match' to the space reassign endpoint (#765)"
```

---

## Slice 4 exit criteria

- Six tests green; `pnpm check` and lint clean.
- Personal (owned-person) reassign path demonstrably unchanged.
- No backend files touched.

## Self-review notes (author)

- Spec coverage: §6.4 test 22 → Step 1.1; 23 → 1.2/1.3; 25 → 1.3 (both ref shapes); 24 → 1.5; 27 → 1.6; personal-path regression → 1.4. Test 26 ("viewers not offered the action") is **not** applicable at this entry point: `/people/{scopedId}` renders for any member, and the server rejects viewers — the action's visibility gating lives on the space-person page, which §7 of the spec puts out of scope. Recorded here rather than silently dropped.
- No caller/page change needed: `spaceId` and the source space-person id both come from `personAssets.primaryProfile`, which the component already receives.
- Type consistency: `toScopedPersonRef` already emits the API enum (`'person' | 'space-person'`), so the `user-person` → `person` mismatch is handled by an existing, tested helper rather than re-derived here.
