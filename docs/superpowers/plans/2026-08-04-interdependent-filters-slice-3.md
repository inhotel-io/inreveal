# Slice 3 — The `filter-availability` rule module (#910)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** A pure function that answers, for one filter section, whether it should render normally, render
greyed with `(0)`, or not render at all — from facet data alone, with no component, DOM or fetch involved.

**Architecture:** One exported function over a plain input record. All of spec §4.3 and §4.4 lives here, so
the rules are testable as data and the panel wiring in slice 5 stays mechanical.

**Tech Stack:** TypeScript, Vitest.

- **Spec:** `docs/superpowers/specs/2026-08-04-interdependent-filter-sections-910-design.md` §4.1, §4.3, §4.4, §6.1
- **Branch:** `fix/910-interdependent-filter-sections`
- **Depends on:** nothing at runtime. It types against `FilterSuggestionsResponse`, which slice 4 widens —
  see Task 1 Step 3 for how to avoid blocking on that.
- **Scope:** one new web source file, one new web test file. Nothing else.

## Global Constraints

- Web uses Svelte 5 runes in new code, but this module is plain TypeScript — no runes, no `$state`.
- Prettier: 120-char lines, single quotes, trailing commas, semicolons. `eslint --max-warnings 0`.
- Web unit tests: `cd web && pnpm test -- --run <path>`. Per `feedback_local_verify_command_traps`, the
  `--run` flag must come **before** the path or vitest silently ignores the filter.
- Per `feedback_web_vitest_no_clearmocks`, mock history leaks across a file. This module has no mocks, so
  it does not apply here — but do not add any.

## File Structure

| File                                                                        | Responsibility              |
| --------------------------------------------------------------------------- | --------------------------- |
| `web/src/lib/components/filter-panel/filter-availability.ts`                | the rules, and nothing else |
| `web/src/lib/components/filter-panel/__tests__/filter-availability.spec.ts` | the rules as a truth table  |

**Interfaces produced** (slice 5 consumes these exact names):

```ts
export type SectionAvailability = 'available' | 'empty' | 'unavailable';

export interface AvailabilityInput {
  current: FilterSuggestionsResponse;
  baseline: FilterSuggestionsResponse | undefined;
  hasActiveFilter: boolean;
  timeBucketCount: number;
}

export function getSectionAvailability(section: FilterSection, input: AvailabilityInput): SectionAvailability;
```

---

## Task 1: The rule module

**Files:**

- Create: `web/src/lib/components/filter-panel/filter-availability.ts`
- Create: `web/src/lib/components/filter-panel/__tests__/filter-availability.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import type { FilterSection, FilterSuggestionsResponse } from '../filter-panel';
import { getSectionAvailability, type AvailabilityInput } from '../filter-availability';

/** A scope in which every section is usable. Individual tests knock out one dimension at a time. */
const full = (): FilterSuggestionsResponse => ({
  countries: ['Germany'],
  cameraMakes: ['Canon'],
  tags: [{ id: 'tag-1', name: 'Vacation' }],
  people: [{ id: 'person-1', name: 'Alice' }],
  ratings: [5],
  mediaTypes: ['IMAGE', 'VIDEO'],
  hasUnnamedPeople: false,
  hasFavorites: true,
  hasAssetsInAlbum: true,
  hasAssetsNotInAlbum: true,
});

/** A scope in which no section can filter anything. */
const barren = (): FilterSuggestionsResponse => ({
  countries: [],
  cameraMakes: [],
  tags: [],
  people: [],
  ratings: [],
  mediaTypes: ['IMAGE'],
  hasUnnamedPeople: false,
  hasFavorites: false,
  hasAssetsInAlbum: false,
  hasAssetsNotInAlbum: true,
});

const input = (overrides: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  current: full(),
  baseline: full(),
  hasActiveFilter: false,
  timeBucketCount: 3,
  ...overrides,
});

const GATED: FilterSection[] = ['people', 'location', 'camera', 'tags', 'rating', 'media', 'favorites', 'albums'];

describe('getSectionAvailability', () => {
  describe('the three verdicts', () => {
    it.each(GATED)('reports %s available when its facet is populated', (section) => {
      expect(getSectionAvailability(section, input())).toBe('available');
    });

    it.each(GATED)('reports %s empty when only the current facet is bare', (section) => {
      expect(getSectionAvailability(section, input({ current: barren() }))).toBe('empty');
    });

    it.each(GATED)('reports %s unavailable when both facets are bare', (section) => {
      expect(getSectionAvailability(section, input({ current: barren(), baseline: barren() }))).toBe('unavailable');
    });
  });

  describe('per-section emptiness rules', () => {
    it('treats a single media type as unusable', () => {
      const single = { ...full(), mediaTypes: ['IMAGE'] };
      expect(getSectionAvailability('media', input({ current: single, baseline: single }))).toBe('unavailable');
    });

    it('treats two media types as usable', () => {
      expect(getSectionAvailability('media', input())).toBe('available');
    });

    it('keeps people available when unnamed faces exist', () => {
      const unnamed = { ...barren(), hasUnnamedPeople: true };
      expect(getSectionAvailability('people', input({ current: unnamed, baseline: unnamed }))).toBe('available');
    });

    it('hides people when there are none at all', () => {
      expect(getSectionAvailability('people', input({ current: barren(), baseline: barren() }))).toBe('unavailable');
    });

    it('hides albums when nothing is filed', () => {
      const none = { ...full(), hasAssetsInAlbum: false };
      expect(getSectionAvailability('albums', input({ current: none, baseline: none }))).toBe('unavailable');
    });

    it('hides albums when everything is filed', () => {
      const all = { ...full(), hasAssetsNotInAlbum: false };
      expect(getSectionAvailability('albums', input({ current: all, baseline: all }))).toBe('unavailable');
    });

    it('keeps albums available only when both sides exist', () => {
      expect(getSectionAvailability('albums', input())).toBe('available');
    });

    it('hides favorites when nothing is favourited', () => {
      const none = { ...full(), hasFavorites: false };
      expect(getSectionAvailability('favorites', input({ current: none, baseline: none }))).toBe('unavailable');
    });
  });

  describe('overriding rules', () => {
    it.each(GATED)('never hides or greys %s while it has an active filter', (section) => {
      const state = input({ current: barren(), baseline: barren(), hasActiveFilter: true });
      expect(getSectionAvailability(section, state)).toBe('available');
    });

    it.each(GATED)('never hides %s while the baseline is unknown', (section) => {
      expect(getSectionAvailability(section, input({ current: barren(), baseline: undefined }))).toBe('empty');
    });
  });

  describe('exempt sections', () => {
    it('greys timeline on an empty bucket list but never hides it', () => {
      const state = input({ current: barren(), baseline: barren(), timeBucketCount: 0 });
      expect(getSectionAvailability('timeline', state)).toBe('empty');
    });

    it('keeps timeline available while it has buckets', () => {
      expect(getSectionAvailability('timeline', input())).toBe('available');
    });

    it('keeps timeline available while a date filter is active', () => {
      const state = input({ timeBucketCount: 0, hasActiveFilter: true });
      expect(getSectionAvailability('timeline', state)).toBe('available');
    });

    it('always reports text available', () => {
      const state = input({ current: barren(), baseline: barren(), timeBucketCount: 0 });
      expect(getSectionAvailability('text', state)).toBe('available');
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd web && pnpm test -- --run src/lib/components/filter-panel/__tests__/filter-availability.spec.ts
```

Expected: FAIL — `Failed to resolve import "../filter-availability"`.

- [ ] **Step 3: Handle the type dependency**

The tests construct `FilterSuggestionsResponse` objects carrying `hasFavorites`, `hasAssetsInAlbum` and
`hasAssetsNotInAlbum`. Slice 4 adds those to the interface; this slice needs them now.

Add them to `web/src/lib/components/filter-panel/filter-panel.ts:80-90` **as part of this slice**:

```ts
export interface FilterSuggestionsResponse {
  countries: string[];
  cities?: string[];
  cameraMakes: string[];
  cameraModels?: string[];
  tags: TagOption[];
  people: PersonOption[];
  ratings: number[];
  mediaTypes: string[];
  hasUnnamedPeople: boolean;
  hasFavorites: boolean;
  hasAssetsInAlbum: boolean;
  hasAssetsNotInAlbum: boolean;
}
```

This breaks `check:typescript` for every surface config until slice 4 lands, which is expected and is why
slice 4 immediately follows. Do not add optional markers (`?`) to dodge it — optional fields would let a
surface silently forget to forward one, and `undefined` would then read as "structurally empty".

- [ ] **Step 4: Write the module**

Create `web/src/lib/components/filter-panel/filter-availability.ts`:

```ts
import type { FilterSection, FilterSuggestionsResponse } from './filter-panel';

/**
 * Whether a filter section can do anything for the user right now (#910).
 *
 * - `available`   — render normally.
 * - `empty`       — the current filters narrowed it to nothing; grey it out with `(0)`.
 * - `unavailable` — nothing in this scope could ever populate it; do not render it at all.
 */
export type SectionAvailability = 'available' | 'empty' | 'unavailable';

export interface AvailabilityInput {
  /** Facets for the filters the user has applied right now. */
  current: FilterSuggestionsResponse;
  /** Facets for the same scope with no filters applied. `undefined` while it is still in flight. */
  baseline: FilterSuggestionsResponse | undefined;
  /** Whether this section itself currently holds a filter value. */
  hasActiveFilter: boolean;
  /** Timeline is fed by the page's own buckets rather than a server facet. */
  timeBucketCount: number;
}

/**
 * Whether this section's facet offers the user a choice. Not simply "is the list empty": a control that
 * can only select everything, or only select nothing, is equally useless.
 */
function isSectionEmpty(section: FilterSection, facets: FilterSuggestionsResponse): boolean {
  switch (section) {
    case 'people': {
      // Zero named people is still useful while unnamed faces exist — the empty state is the only
      // prompt to name one.
      return facets.people.length === 0 && !facets.hasUnnamedPeople;
    }
    case 'location': {
      return facets.countries.length === 0;
    }
    case 'camera': {
      return facets.cameraMakes.length === 0;
    }
    case 'tags': {
      return facets.tags.length === 0;
    }
    case 'rating': {
      return facets.ratings.length === 0;
    }
    case 'media': {
      // One media type means "Photos" (or "Videos") is a synonym for "All" and the other is empty.
      return facets.mediaTypes.length < 2;
    }
    case 'favorites': {
      return !facets.hasFavorites;
    }
    case 'albums': {
      // Needs both sides: with nothing filed "Has album" is empty, with everything filed "Has no
      // album" is, and either way the control cannot discriminate.
      return !(facets.hasAssetsInAlbum && facets.hasAssetsNotInAlbum);
    }
    default: {
      return false;
    }
  }
}

export function getSectionAvailability(section: FilterSection, input: AvailabilityInput): SectionAvailability {
  // Free text has no enumerable domain to be empty of.
  if (section === 'text') {
    return 'available';
  }

  // Never strand a filter the user cannot then reach to clear. Cross-section narrowing can empty a
  // facet whose own filter is set — person X plus rating 5, where X has no rated photos.
  if (input.hasActiveFilter) {
    return 'available';
  }

  // Timeline's emptiness means "this page has no assets", which the surfaces handle with the panel's
  // `hidden` prop, so it greys but never hides.
  if (section === 'timeline') {
    return input.timeBucketCount === 0 ? 'empty' : 'available';
  }

  if (!isSectionEmpty(section, input.current)) {
    return 'available';
  }

  // A section is never hidden on missing information.
  if (input.baseline === undefined) {
    return 'empty';
  }

  return isSectionEmpty(section, input.baseline) ? 'unavailable' : 'empty';
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd web && pnpm test -- --run src/lib/components/filter-panel/__tests__/filter-availability.spec.ts
```

Expected: PASS. The `it.each(GATED)` blocks give 8 cases each, so the count should be well above 30.

- [ ] **Step 6: Lint and format**

```bash
cd web && pnpm lint && pnpm format
```

`check:typescript` will **fail** at this point because of Step 3 — that is expected and slice 4 fixes it.
Do not run it as a gate here.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/components/filter-panel/filter-availability.ts \
        web/src/lib/components/filter-panel/__tests__/filter-availability.spec.ts \
        web/src/lib/components/filter-panel/filter-panel.ts
git commit -m "feat(web): add the filter-section availability rules (#910)"
```

---

## Done when

- `pnpm test -- --run src/lib/components/filter-panel/__tests__/filter-availability.spec.ts` is green.
- `pnpm lint` and `pnpm format` are green.
- `check:typescript` is knowingly red on the surface configs, and only there. Confirm with
  `pnpm check:typescript 2>&1 | grep -c "filter-availability"` returning `0` — no error may point at the
  new module itself.
- The panel component is untouched. Wiring is slice 5.
