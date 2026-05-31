# Face re-attribution repair — Slice 2 (Flag rule) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> Strict TDD: failing test first, RUN it (capture red), minimal impl, RUN green. Report red+green output.
> Build ONLY on Slice 1 (the `ReattributionTally` from `src/utils/face-repair.ts` and `FaceRepairService`).
> Do NOT implement Slice 3+ (review-only routing, contamination cap, repair, report, endpoint).

**Goal:** Turn the Slice-1 vote tally into a flag decision — flag a face only when a confident external owner `Q`
both out-votes the current person `P` (or `P` doesn't claim it) AND is closer to the face than `P` by a hard
distance margin (the family-lookalike guard).

**Architecture:** A pure `decideReattribution(tally, params)` function (exhaustive margin/boundary coverage as
unit tests) + a thin `FaceRepairService.findFlaggedFaces` that streams Slice-1 candidates through it and yields
only flagged faces. The hard distance margin is what prevents shuffling faces between similar relatives.

**Tech stack:** NestJS, Kysely, Vitest (unit + medium). Spec:
`docs/plans/2026-05-31-face-reattribution-repair-design.md` (Detector §, flag rule step 3).

**Read first:** `src/utils/face-repair.ts` (the `ReattributionTally` shape from Slice 1) and
`src/services/face-repair.service.ts` (`findReattributionCandidates`, `ReattributionCandidate`).

---

### Task 1: Pure flag-decision function

**Files:**

- Modify: `server/src/utils/face-repair.ts` (add `decideReattribution` + types)
- Modify: `server/src/utils/face-repair.spec.ts` (add a `decideReattribution` describe block)

- [ ] **Step 1: Write the failing unit tests**

```typescript
import { decideReattribution, ReattributionTally } from 'src/utils/face-repair';

const tally = (over: Partial<ReattributionTally>): ReattributionTally => ({
  ownCount: 0,
  ownNearest: null,
  topOtherPersonId: null,
  topOtherCount: 0,
  topOtherNearest: null,
  ...over,
});
const params = { minFaces: 3, voteMargin: 2, distanceMargin: 0.1 };

describe('decideReattribution', () => {
  it('flags when Q out-votes P by the vote margin and is closer by the distance margin', () => {
    const d = decideReattribution(
      tally({ ownCount: 1, ownNearest: 0.5, topOtherPersonId: 'Q', topOtherCount: 8, topOtherNearest: 0.2 }),
      params,
    );
    expect(d).toEqual({ flagged: true, suspectedOwnerId: 'Q' });
  });

  it("flags when P does not claim F (ownCount < minFaces) and Q is confident and closer", () => {
    const d = decideReattribution(
      tally({ ownCount: 1, ownNearest: 0.5, topOtherPersonId: 'Q', topOtherCount: 5, topOtherNearest: 0.2 }),
      params,
    );
    expect(d.flagged).toBe(true);
    expect(d.suspectedOwnerId).toBe('Q');
  });

  it('does NOT flag a within-vote-margin rival when P also claims F', () => {
    // ownCount >= minFaces (P claims), Q only 1 more vote (< voteMargin=2)
    const d = decideReattribution(
      tally({ ownCount: 6, ownNearest: 0.2, topOtherPersonId: 'Q', topOtherCount: 7, topOtherNearest: 0.18 }),
      params,
    );
    expect(d.flagged).toBe(false);
    expect(d.suspectedOwnerId).toBeNull();
  });

  it('does NOT flag when Q is not confident (topOtherCount < minFaces)', () => {
    const d = decideReattribution(
      tally({ ownCount: 0, ownNearest: null, topOtherPersonId: 'Q', topOtherCount: 2, topOtherNearest: 0.1 }),
      params,
    );
    expect(d.flagged).toBe(false);
  });

  it('enforces the distance (family) guard at the boundary', () => {
    // Q out-votes P, but only 0.05 closer (< distanceMargin 0.1) -> NOT flagged (family guard)
    const tooClose = decideReattribution(
      tally({ ownCount: 1, ownNearest: 0.25, topOtherPersonId: 'Q', topOtherCount: 9, topOtherNearest: 0.2 }),
      params,
    );
    expect(tooClose.flagged).toBe(false);
    // Q is 0.12 closer (>= 0.1) -> flagged
    const farEnough = decideReattribution(
      tally({ ownCount: 1, ownNearest: 0.32, topOtherPersonId: 'Q', topOtherCount: 9, topOtherNearest: 0.2 }),
      params,
    );
    expect(farEnough.flagged).toBe(true);
  });

  it('flags when P has no nearby faces at all (ownNearest null) and Q is confident', () => {
    const d = decideReattribution(
      tally({ ownCount: 0, ownNearest: null, topOtherPersonId: 'Q', topOtherCount: 5, topOtherNearest: 0.2 }),
      params,
    );
    expect(d.flagged).toBe(true);
  });
});
```

- [ ] **Step 2: Run, confirm red** — `cd server && pnpm test -- --run src/utils/face-repair.spec.ts` → FAIL (`decideReattribution` not exported).

- [ ] **Step 3: Implement** (append to `src/utils/face-repair.ts`):

```typescript
export interface FlagParams {
  minFaces: number;
  voteMargin: number;
  distanceMargin: number;
}

export interface FlagDecision {
  flagged: boolean;
  suspectedOwnerId: string | null;
}

// Decide whether a face should be re-attributed away from its current person. Flag only when a confident
// external owner Q (>= minFaces neighbors) either out-votes P by voteMargin or P does not claim F
// (ownCount < minFaces), AND Q is closer to F than P by distanceMargin (the family-lookalike guard — a hard
// distance edge, not just vote share, is required to move a face between similar relatives).
export const decideReattribution = (tally: ReattributionTally, params: FlagParams): FlagDecision => {
  const { topOtherPersonId, topOtherCount, topOtherNearest, ownCount, ownNearest } = tally;

  if (topOtherPersonId === null || topOtherNearest === null || topOtherCount < params.minFaces) {
    return { flagged: false, suspectedOwnerId: null };
  }

  const outvotesOrUnclaimed = topOtherCount - ownCount >= params.voteMargin || ownCount < params.minFaces;
  const closerByMargin = ownNearest === null || ownNearest - topOtherNearest >= params.distanceMargin;
  const flagged = outvotesOrUnclaimed && closerByMargin;

  return { flagged, suspectedOwnerId: flagged ? topOtherPersonId : null };
};
```

- [ ] **Step 4: Run, confirm green** — same command → PASS.
- [ ] **Step 5: Commit** — `git add server/src/utils/face-repair.ts server/src/utils/face-repair.spec.ts && git commit -m "feat(server): add face re-attribution flag decision"`

---

### Task 2: Service `findFlaggedFaces` + family-guard medium test

**Files:**

- Modify: `server/src/services/face-repair.service.ts`
- Modify: `server/test/medium/specs/services/face-repair.service.spec.ts`

- [ ] **Step 1: Write the failing medium test.** Add a `findFlaggedFaces` describe block. Helpers: reuse
  `axisEmbedding` (disjoint) and add a `nearAxisEmbedding` pair that is ~0.3 apart (similar relatives):
  `firstAxis = '[' + Array.from({length:512},(_, i)=> i<256?1:0).join(',') + ']'` (= `axisEmbedding('first')`),
  and `relativeAxis = '[' + Array.from({length:512},(_, i)=> (i<180 || (i>=256 && i<332))?1:0).join(',') + ']'`
  (180 first-half + 76 second-half ones → cosine distance ≈ 0.30 from `firstAxis`, within maxDistance 0.6).

  Three assertions, all with `{ maxDistance: 0.6, voteWindow: 50, minFaces: 3, voteMargin: 2, distanceMargin: 0.1 }`:
  - **Leak flagged:** Karina-main = 10 `axisEmbedding('first')` faces; 3 leaked `axisEmbedding('first')` faces on
    Alexia. `findFlaggedFaces` yields exactly the 3 leaked faces, each `suspectedOwnerId === karina.id`.
  - **Family guard — no cross-flag:** personA = 4 `firstAxis` faces; personB = 12 `relativeAxis` faces (B larger,
    to stress the vote condition). Assert NONE of personA's or personB's faces are flagged (B out-votes A, but the
    0.30 inter-cluster distance is not ≥ A's own 0 nearest + 0.1 margin → distance guard blocks).
  - **Clean cluster:** a lone unrelated person's faces are not flagged.

- [ ] **Step 2: Run, confirm red** — `cd server && pnpm test:medium run test/medium/specs/services/face-repair.service.spec.ts` → FAIL (`findFlaggedFaces` is not a function).

- [ ] **Step 3: Implement** (add to `FaceRepairService`):

```typescript
import { decideReattribution, FlagParams } from 'src/utils/face-repair';

export interface FlaggedFace {
  assetFaceId: string;
  currentPersonId: string;
  suspectedOwnerId: string;
}

// in the class:
async *findFlaggedFaces(
  options: { ownerId?: string; personId?: string; maxDistance: number; voteWindow: number } & FlagParams,
): AsyncIterableIterator<FlaggedFace> {
  for await (const candidate of this.findReattributionCandidates(options)) {
    const decision = decideReattribution(candidate, options);
    if (decision.flagged && decision.suspectedOwnerId) {
      yield {
        assetFaceId: candidate.assetFaceId,
        currentPersonId: candidate.currentPersonId,
        suspectedOwnerId: decision.suspectedOwnerId,
      };
    }
  }
}
```

(`findReattributionCandidates`'s `options` already accepts `maxDistance`/`voteWindow`; the extra `FlagParams`
fields are ignored by it and consumed by `decideReattribution`.)

- [ ] **Step 4: Run, confirm green** — same command → PASS.
- [ ] **Step 5: Validate + commit** — `cd server && pnpm exec prettier --write <changed files> && pnpm exec eslint <changed files> --max-warnings 0 && pnpm exec tsc --noEmit`; then `git add -A && git commit -m "feat(server): stream flagged re-attribution faces"`.

---

## Self-review (run after writing, fix inline)

- Spec coverage (Slice 2 matrix rows): vote-margin branch ✓ (T1); P-doesn't-claim branch ✓ (T1); tie/within-margin
  not flagged ✓ (T1); distanceMargin boundary in/out ✓ (T1); Q-not-confident ✓ (T1); family-similar no cross-flag ✓
  (T2, near-axis); leak still flagged ✓ (T2). No review-only/cap/repair logic (those are Slice 3/4). Types
  consistent with Slice 1 (`ReattributionTally`). No placeholders.
- Confirm the `nearAxisEmbedding` cosine distance is < `maxDistance` (so B faces ARE neighbors of A — the test is
  only meaningful if the guard, not absence-of-neighbors, is what prevents the flag). If the computed distance is
  ≥ 0.6, reduce the second-half ones until it lands ~0.3 and re-confirm in the test.
