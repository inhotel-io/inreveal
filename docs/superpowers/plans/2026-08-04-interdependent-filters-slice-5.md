# Slice 5 — Wire availability into the filter panel (#910)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** The panel captures a no-filters baseline, hides structurally useless sections, greys transiently
empty ones, and keeps all of that out of the persisted user ledger.

**Architecture:** All rule logic already lives in slice 3's `filter-availability.ts`. This slice is
plumbing: capture two response objects into state, derive a verdict per section, and use it in three places
in the template. The legacy providers-only path is left byte-for-byte unchanged.

**Tech Stack:** Svelte 5 runes, Vitest, @testing-library/svelte, happy-dom.

- **Spec:** `docs/superpowers/specs/2026-08-04-interdependent-filter-sections-910-design.md` §2.4, §4.2, §4.3.1, §4.5, §6.2, §6.3
- **Branch:** `fix/910-interdependent-filter-sections`
- **Depends on:** Slices 3 and 4. **Must not land without slice 4's sentinel removal** — gating on emptiness
  while a failed fetch still resolves as "empty" would hide the whole panel on a network blip.
- **Scope:** `filter-panel.svelte` and the panel's test directory. **Nothing else.**

## Global Constraints

- **Base this slice on PR #926.** It rewrites the `{ selected, known }` ledger and the empty-state hint in
  `filter-panel.svelte` and `filter-panel.ts`. Read the post-#926 versions of `showAllSections`,
  `serializeSectionSet` and the "show all sections" hint before editing — the snippets below assume them.
- **Do not touch `rating-filter.svelte` or `media-type-filter.svelte`, and do not assign
  `availableRatings` or `availableMediaTypes`.** Memory `feedback_no_dynamic_rating_media_hiding` records a
  standing decision, with a real bug behind it (PR #261: filtering `visibleStars` made the fourth visible
  star select rating 5). #910 is about sections, not about stars and buttons. Spec §2.4 has the full
  reasoning; Task 1 Step 5 adds a regression guard so this cannot drift again.
- Svelte 5 runes in this file. Read state inside `$effect` via `untrack` where re-triggering is not wanted;
  the existing effects already show the pattern.
- Per `feedback_web_vitest_no_clearmocks`, mock history leaks between tests in one file — assert call
  counts against an explicitly reset mock, and remember `$t()` returns raw keys under test.
- Per `feedback_web_test_assertions_that_cannot_fail`, an assertion that a section is absent must be paired
  with one proving a sibling section is present, or a panel that rendered nothing passes it trivially.

## File Structure

| File                                                                        | Responsibility             |
| --------------------------------------------------------------------------- | -------------------------- |
| `web/src/lib/components/filter-panel/filter-panel.svelte`                   | capture, derive, gate      |
| `web/src/lib/components/filter-panel/__tests__/filter-panel.spec.ts`        | integration coverage       |
| `web/src/lib/components/filter-panel/__tests__/unified-suggestions.spec.ts` | capture + no-dimming guard |

**Interfaces consumed:** `getSectionAvailability`, `SectionAvailability`, `AvailabilityInput` from slice 3.

---

## Task 1: Capture the facets, without handing them to the controls

**Files:**

- Modify: `web/src/lib/components/filter-panel/filter-panel.svelte:81-87`, `:151-176`
- Test: `web/src/lib/components/filter-panel/__tests__/unified-suggestions.spec.ts`

- [ ] **Step 1: Extend the shared fixture**

`defaultResponse` at the top of `unified-suggestions.spec.ts` is reused by every test in the file. Add the
three slice-1 booleans so existing tests keep their sections visible once Task 2 lands:

```ts
  hasFavorites: true,
  hasAssetsInAlbum: true,
  hasAssetsNotInAlbum: true,
```

Do the same for the fixtures in `contextual-refetch.spec.ts` and `filter-panel.spec.ts`. Skipping this
makes Task 2 look like it broke a dozen unrelated tests.

- [ ] **Step 2: Write the failing test**

The observable deliverable of this task is the guarantee that the facets reach the panel **without**
reaching the controls. That is what this test pins, and it fails today for a different reason than you
might expect: with `ratings: [2]` nothing is dimmed either way, so the test needs the panel to have
consumed the response at all. Assert both halves.

```ts
it('consumes the facets without dimming the controls (#910, feedback_no_dynamic_rating_media_hiding)', async () => {
  const suggestionsProvider = vi.fn().mockResolvedValue({
    ...defaultResponse,
    ratings: [2],
    mediaTypes: ['IMAGE', 'VIDEO'],
  });
  const config = { sections: ['rating', 'media'] as FilterSection[], suggestionsProvider };

  render(FilterPanel, { props: { config, timeBuckets: [] } });

  await waitFor(() => expect(suggestionsProvider).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByTestId('rating-star-5')).toBeInTheDocument());

  // Re-introducing `availableRatings` would dim stars 1, 3, 4 and 5 here. Re-introducing
  // `availableMediaTypes` would drop a media button. Neither may happen.
  for (const star of [1, 2, 3, 4, 5]) {
    expect(screen.getByTestId(`rating-star-${star}`).className).not.toContain('opacity-50');
  }
  for (const type of ['all', 'image', 'video']) {
    expect(screen.getByTestId(`media-type-${type}`)).toBeInTheDocument();
  }
});
```

- [ ] **Step 3: Run it — it should pass**

```bash
cd web && pnpm test -- --run src/lib/components/filter-panel/__tests__/unified-suggestions.spec.ts
```

Expected: PASS. This is the rare guard-first case: the behaviour is already correct and the test exists to
keep it correct through Task 2, which is where the temptation to assign the props arises. Note it in the
commit message so a reviewer knows it was not expected to fail.

- [ ] **Step 4: Add the state and capture the response**

Alongside the existing fetched-data state (around `:81-87`):

```ts
// #910: the facets for the filters in force right now, and for the same scope with none applied.
// The baseline answers "could this section EVER do anything here", which is what separates hiding a
// section from merely greying it.
let currentSuggestions = $state<FilterSuggestionsResponse | undefined>();
let baseline = $state<FilterSuggestionsResponse | undefined>();
let baselineRequested = false;
```

`FilterSuggestionsResponse` is already exported from `./filter-panel`; extend the existing type import
rather than adding a second one.

In the unified effect's `.then` (`:151-166`), add **one** line and change nothing else:

```ts
        .then((result) => {
          if (controller.signal.aborted) {
            return;
          }
          people = result.people;
          countries = result.countries;
          cameraMakes = result.cameraMakes;
          tags = result.tags;
          // Note: availableRatings and availableMediaTypes are intentionally NOT set from
          // suggestionsProvider. Hiding or dimming rating stars and media type buttons based on the
          // current result set breaks their positional meaning (PR #261) and the E2E suites that click
          // them. #910 gates the *sections* instead — the facets reach getSectionAvailability through
          // `currentSuggestions` below, never the controls. See spec §2.4.
          hasUnnamedPeople = result.hasUnnamedPeople;
          currentSuggestions = result;
        })
```

The comment is rewritten, not deleted: it now says why the decision survives #910 rather than merely
asserting it.

- [ ] **Step 5: Run the whole panel suite**

```bash
cd web && pnpm test -- --run src/lib/components/filter-panel/
```

Expected: PASS. `currentSuggestions` and `baseline` are captured but nothing reads them yet, so this task
changes no behaviour — which is exactly what the suite should confirm.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/components/filter-panel/
git commit -m "refactor(web): keep the filter suggestions response for availability decisions (#910)

The no-dimming guard passes on first write by design: it locks
feedback_no_dynamic_rating_media_hiding through the gating work in the next commit."
```

---

## Task 2: Capture the baseline and gate the sections

**Files:**

- Modify: `web/src/lib/components/filter-panel/filter-panel.svelte`
- Test: `web/src/lib/components/filter-panel/__tests__/filter-panel.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
const availableEverything = {
  countries: ['Germany'],
  cameraMakes: ['Canon'],
  tags: [{ id: 't', name: 'Tag' }],
  people: [{ id: 'p', name: 'Alice' }],
  ratings: [5],
  mediaTypes: ['IMAGE', 'VIDEO'],
  hasUnnamedPeople: false,
  hasFavorites: true,
  hasAssetsInAlbum: true,
  hasAssetsNotInAlbum: true,
};

describe('section availability (#910)', () => {
  beforeEach(() => localStorage.clear());

  it('hides a structurally unavailable section and its toggle', async () => {
    const config = {
      sections: ['rating', 'media'] as FilterSection[],
      suggestionsProvider: vi.fn().mockResolvedValue({ ...availableEverything, ratings: [] }),
    };

    render(FilterPanel, { props: { config, timeBuckets: [] } });

    // The sibling assertion matters: without it a panel that rendered nothing would pass.
    await waitFor(() => expect(screen.getByTestId('filter-section-media')).toBeInTheDocument());
    expect(screen.queryByTestId('filter-section-rating')).not.toBeInTheDocument();
    expect(screen.queryByTestId('section-toggle-rating')).not.toBeInTheDocument();
    expect(screen.getByTestId('section-toggle-media')).toBeInTheDocument();
  });

  it('greys a section the current filters emptied, rather than hiding it', async () => {
    const suggestionsProvider = vi
      .fn()
      .mockResolvedValueOnce(availableEverything)
      .mockResolvedValue({ ...availableEverything, tags: [] });
    const config = { sections: ['tags', 'media'] as FilterSection[], suggestionsProvider };
    const filters = { ...createFilterState() };

    const { rerender } = render(FilterPanel, { props: { config, timeBuckets: [], filters } });
    await waitFor(() => expect(suggestionsProvider).toHaveBeenCalledTimes(1));

    await rerender({ config, timeBuckets: [], filters: { ...filters, personIds: ['p'] } });

    await waitFor(() => {
      const button = within(screen.getByTestId('filter-section-tags')).getByRole('button');
      expect(button).toBeDisabled();
      expect(button.textContent).toContain('(0)');
    });
  });

  it('never writes availability into the stored ledger', async () => {
    const config = {
      sections: ['rating', 'media'] as FilterSection[],
      suggestionsProvider: vi.fn().mockResolvedValue({ ...availableEverything, ratings: [] }),
    };

    render(FilterPanel, { props: { config, timeBuckets: [], storageKey: 'test-key' } });
    await waitFor(() => expect(screen.getByTestId('filter-section-media')).toBeInTheDocument());

    const stored = JSON.parse(localStorage.getItem('test-key')!);
    // Both halves matter: `selected` keeps it un-hidden, `known` keeps PR #926 from re-introducing it
    // as a brand-new section on the next load.
    expect(stored.selected).toContain('rating');
    expect(stored.known).toContain('rating');
  });

  it('shows a section again once its facet comes back', async () => {
    const suggestionsProvider = vi
      .fn()
      .mockResolvedValueOnce({ ...availableEverything, ratings: [] })
      .mockResolvedValue(availableEverything);
    const config = { sections: ['rating', 'media'] as FilterSection[], suggestionsProvider };
    const filters = { ...createFilterState() };

    const { rerender } = render(FilterPanel, { props: { config, timeBuckets: [], filters } });
    await waitFor(() => expect(screen.queryByTestId('filter-section-rating')).not.toBeInTheDocument());

    await rerender({ config, timeBuckets: [], filters: { ...filters, personIds: ['p'] } });

    await waitFor(() => expect(screen.getByTestId('filter-section-rating')).toBeInTheDocument());
  });

  it('fetches a baseline separately when it mounts with filters applied', async () => {
    const suggestionsProvider = vi.fn().mockResolvedValue(availableEverything);
    const config = { sections: ['rating'] as FilterSection[], suggestionsProvider };

    render(FilterPanel, { props: { config, timeBuckets: [], filters: { ...createFilterState(), rating: 5 } } });

    await waitFor(() => expect(suggestionsProvider).toHaveBeenCalledTimes(2));
    expect(suggestionsProvider).toHaveBeenCalledWith(expect.objectContaining({ rating: undefined }));
  });

  it('fetches no extra baseline when it mounts clean', async () => {
    const suggestionsProvider = vi.fn().mockResolvedValue(availableEverything);
    const config = { sections: ['rating'] as FilterSection[], suggestionsProvider };

    render(FilterPanel, { props: { config, timeBuckets: [] } });

    await waitFor(() => expect(suggestionsProvider).toHaveBeenCalledTimes(1));
    // Give any stray second request time to land before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(suggestionsProvider).toHaveBeenCalledTimes(1);
  });

  it('hides nothing when the baseline request rejects', async () => {
    const suggestionsProvider = vi
      .fn()
      .mockImplementation((next) =>
        next.rating === undefined
          ? Promise.reject(new Error('baseline failed'))
          : Promise.resolve({ ...availableEverything, ratings: [] }),
      );
    const config = { sections: ['rating'] as FilterSection[], suggestionsProvider };

    render(FilterPanel, { props: { config, timeBuckets: [], filters: { ...createFilterState(), rating: 5 } } });

    await waitFor(() => expect(screen.getByTestId('filter-section-rating')).toBeInTheDocument());
  });

  it('keeps a section with an active filter visible even when its facet is empty', async () => {
    const config = {
      sections: ['rating'] as FilterSection[],
      suggestionsProvider: vi.fn().mockResolvedValue({ ...availableEverything, ratings: [] }),
    };

    render(FilterPanel, { props: { config, timeBuckets: [], filters: { ...createFilterState(), rating: 5 } } });

    await waitFor(() => expect(screen.getByTestId('filter-section-rating')).toBeInTheDocument());
  });

  it('leaves the legacy providers path ungated', async () => {
    const config = {
      sections: ['people', 'camera'] as FilterSection[],
      providers: { people: vi.fn().mockResolvedValue([]), cameras: vi.fn().mockResolvedValue([]) },
    };

    render(FilterPanel, { props: { config, timeBuckets: [] } });

    await waitFor(() => expect(screen.getByTestId('filter-section-people')).toBeInTheDocument());
    expect(screen.getByTestId('filter-section-camera')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd web && pnpm test -- --run src/lib/components/filter-panel/__tests__/filter-panel.spec.ts
```

Expected: FAIL on hide, grey, re-show, and baseline-request. The ledger, reject, active-filter and legacy
tests pass already — they are the guards against over-correcting.

- [ ] **Step 3: Import the rule module**

```ts
import { getSectionAvailability, type SectionAvailability } from './filter-availability';
```

`createFilterState` and `getActiveFilterCount` are already imported from `./filter-panel`; extend that
import rather than adding a second one.

- [ ] **Step 4: Capture the baseline**

In the unified effect's `.then`, after `currentSuggestions = result;` from Task 1:

```ts
if (getActiveFilterCount(currentFilters) === 0) {
  // Mounted clean, so this response is already the no-filters baseline — no second request.
  baseline = result;
}
```

Then add a one-shot effect next to the other `$effect`s:

```ts
// Only fires when the panel mounts with filters already applied (a deep link, or restored state) —
// otherwise the effect above captures the baseline for free. Scope changes remount the panel, so this
// needs no invalidation: see spec §4.5 for the `{#key}` blocks that guarantee it.
$effect(() => {
  const provider = config.suggestionsProvider;
  if (!provider || baselineRequested) {
    return;
  }
  baselineRequested = true;

  if (untrack(() => getActiveFilterCount(filters)) === 0) {
    return;
  }

  void provider(createFilterState())
    .then((result) => {
      baseline = result;
    })
    .catch(() => {
      // Leave it undefined. A section is never hidden on missing information.
    });
});
```

- [ ] **Step 5: Derive the verdicts**

After `hasActiveFilter` (`:621-659`):

```ts
// Availability is derived, never persisted — the storage effect keeps writing `config.sections`.
// Conflating the two would record a section as user-hidden the moment it went unavailable, and it
// would never come back.
let availability = $derived<Map<FilterSectionType, SectionAvailability>>(
  new Map(
    config.sections.map((section) => [
      section,
      config.suggestionsProvider && currentSuggestions
        ? getSectionAvailability(section, {
            current: currentSuggestions,
            baseline,
            hasActiveFilter: hasActiveFilter(section),
            timeBucketCount: timeBuckets.length,
          })
        : 'available',
    ]),
  ),
);

let renderableSections = $derived(config.sections.filter((section) => availability.get(section) !== 'unavailable'));
```

The `config.suggestionsProvider && currentSuggestions` guard is what keeps the legacy path unchanged.

- [ ] **Step 6: Use them in the template**

Three edits. The toggle row (`:727`) and the section render loop (`:753`) both become:

```svelte
            {#each renderableSections as section (section)}
```

The `count` prop (`:761-771`):

```svelte
                count={config.suggestionsProvider
                  ? availability.get(section) === 'empty'
                    ? 0
                    : undefined
                  : filterContext
                    ? section === 'people'
                      ? people.length
                      : section === 'location'
                        ? countries.length
                        : section === 'camera'
                          ? cameraMakes.length
                          : section === 'tags'
                            ? tags.length
                            : undefined
                    : undefined}
```

`filterContext` stays for the legacy branch — do not delete it, and do not touch its #858 exclusion list.

- [ ] **Step 7: Point the empty-state hint at renderable sections**

Post-#926 the hint asks whether every section _this surface renders_ is hidden. Change that check to use
`renderableSections`, so a user whose only available section is hidden still gets the hint. Read the
post-#926 code for the exact expression before editing.

- [ ] **Step 8: Run the whole panel suite**

```bash
cd web && pnpm test -- --run src/lib/components/filter-panel/
```

Expected: PASS, including `filter-panel.spec.ts:403` (`#858 §3.3`) with no edits — that test uses the
legacy providers path and proves the carve-out still holds there.

- [ ] **Step 9: Full web gate**

```bash
cd web && pnpm test && pnpm check:typescript && pnpm check:svelte && pnpm lint && pnpm format
```

- [ ] **Step 10: Commit**

```bash
git add web/src/lib/components/filter-panel/
git commit -m "feat(web): hide filter sections that cannot filter anything (#910)"
```

---

## Task 3: Lock the `{#key}` remount invariant

**Files:**

- Test: the three query-mode page specs

Baseline caching is correct only because each surface remounts the panel when its non-filter scope changes.
Nothing in the panel enforces that, and deleting a `{#key}` would be a silent correctness regression.

- [ ] **Step 1: Write the test**

One per query-mode page. In `photos-page.spec.ts`:

```ts
it('remounts the filter panel when the committed query changes, so the baseline is re-fetched (#910)', async () => {
  const before = sdkMock.searchSmartFacets.mock.calls.length;

  await commitQuery('beach');

  await waitFor(() => expect(sdkMock.searchSmartFacets.mock.calls.length).toBeGreaterThan(before));
});
```

Read the neighbouring smart-search test in the same file for the actual query-commit mechanism and reuse it
verbatim; do not invent a `commitQuery` helper if one does not exist.

- [ ] **Step 2: Run and confirm green without source changes**

```bash
cd web && pnpm test -- --run "src/routes/(user)/photos/[[assetId=id]]/photos-page.spec.ts"
```

Expected: PASS. If it fails, the `{#key}` block at `+page.svelte:600` has changed and the baseline design
assumption is broken — stop and report rather than adjusting the test.

- [ ] **Step 3: Commit**

```bash
git add "web/src/routes/(user)/"
git commit -m "test(web): lock the filter-panel remount that scopes the #910 baseline"
```

---

## Done when

- `pnpm test`, `pnpm check:typescript`, `pnpm check:svelte`, `pnpm lint`, `pnpm format` are all green in
  `web/`.
- `filter-panel.spec.ts:403` passes unmodified.
- `git diff --name-only` for this slice lists **no** `rating-filter.svelte` or `media-type-filter.svelte`.
- `grep -n "availableRatings =" web/src/lib/components/filter-panel/filter-panel.svelte` returns nothing.
- `filterContext` still exists and still carries its #858 exclusion list.
