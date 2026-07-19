# Filters + item count for the "Recently Added" view (#805)

- **Discussion:** https://github.com/open-noodle/gallery/discussions/805
- **Date:** 2026-07-19
- **Scope:** Web only. No server / API / mobile changes.
- **Approach:** Mirror the existing per-view filter integration pattern (Photos), adding two new
  `web/src/lib/utils/` modules and wiring them into the Recently Added route. Do **not** modify the
  Photos page or the shared `filter-panel` / `Timeline` components.

## 1. Goal

Give the web **Recently Added** view (`/recently-added`) two things the discussion asks for:

1. **Filter navigation** — the same 10-section Filter panel used by Photos
   (Timeline, People, Location, Camera, Tags, Rating, Media type, Favorites, Albums, Text).
2. **A visible item count** — "N items" in the page header, reflecting what is currently shown and
   updating live as filters change.

…while preserving what makes the view "recently added": assets are **ordered and day-grouped by
*added* date** (`orderBy: AssetOrderBy.CreatedAt`) and the view stays scoped to **own + partner**
assets (never shared spaces).

## 2. Background: how the pieces work today

- **The route** `web/src/routes/(user)/recently-added/[[photos=photos]]/[[assetId=id]]/+page.svelte`
  renders the shared `<Timeline {options}>` with a static
  `options = { visibility: Timeline, withStacked: true, withPartners: true, orderBy: CreatedAt }`.
  It has a header **title** ("Recently Added") via `UserPageLayout` but **no count and no filters**.
  It shares the multi-select bulk-action machinery (`AssetSelectControlBar`) with Photos.

- **The Filter panel** `web/src/lib/components/filter-panel/` is reusable. Each host view supplies a
  `FilterPanelConfig` (which `sections` to show + suggestion providers) and converts the panel's
  `FilterState` into a timeline query via a per-view **options builder**
  (`buildPhotosTimelineOptions`, `buildSpaceTimelineOptions`, `buildAlbumTimelineOptions`,
  `buildMapTimelineOptions`). The **URL is the source of truth** for filter state
  (`web/src/lib/utils/searchable-page-search.ts`).

- **Photos is the full template** (`web/src/routes/(user)/photos/[[assetId=id]]/+page.svelte`):
  it seeds `FilterState` from the URL, builds an all-10-section config, feeds
  `buildPhotosTimelineOptions(filters)` into `<Timeline>`, renders `<ActiveFiltersBar>` + `<FilterToolbar>`,
  and switches between **browse mode** (`<Timeline>`) and **query mode** (`<SmartSearchResults>`) when
  free-text is entered.

- **The count is free client-side.** `TimelineManager.assetCount` is a live grand total (time buckets
  carry per-bucket counts) available once buckets load. There is **no** photos/videos split without
  backend work. The `items_count` i18n key already exists:
  `"{count, plural, one {# item} other {# items}}"`.

- **Scope subtlety in `buildPhotosTimelineOptions`:** `withPartners` and `withSharedSpaces` are only
  added when `filters.isFavorite === undefined` (favorites are treated as strictly personal). Recently
  Added must never add `withSharedSpaces` — see §4.

## 3. New & modified files

### New (source)

| File | Responsibility |
|---|---|
| `web/src/lib/utils/recently-added-filter-options.ts` | Pure functions: `buildRecentlyAddedTimelineOptions(filters)`, `buildRecentlyAddedSuggestionRequest(filters)`, `shouldShowRecentlyAddedCount(count, hasActiveFilters)`. |
| `web/src/lib/utils/recently-added-filter-config.ts` | `buildRecentlyAddedFilterConfig()` → `FilterPanelConfig` (browse-mode suggestions, own+partners scope). Phase 2 extends its `suggestionsProvider` for query mode. |

### New (tests)

| File | Covers |
|---|---|
| `web/src/lib/utils/__tests__/recently-added-filter-options.spec.ts` | The three pure functions above. |
| `web/src/lib/utils/__tests__/recently-added-filter-config.spec.ts` | The config (sections list + suggestion/provider requests), mirroring `album-filter-config.spec.ts`. |
| `e2e/src/specs/web/recently-added-filters.e2e-spec.ts` (mirrors the existing `photos-filter-panel.e2e-spec.ts`) | End-to-end: filter panel present, apply/remove a filter, count updates, URL round-trips. Flagged optional-but-recommended. |

### Modified

| File | Change |
|---|---|
| `web/src/routes/(user)/recently-added/[[photos=photos]]/[[assetId=id]]/+page.svelte` | Add filter state seeded from the URL, the filter config, `<FilterPanel>` / `<ActiveFiltersBar>` / `<FilterToolbar>`, browse/query mode switch, header count. Keep the existing title and the entire bulk-action `AssetSelectControlBar` block unchanged. |

No i18n changes are required for Phase 1 (`items_count` exists). Phase 2 reuses existing search keys
(`filter_result_count`, etc.) already used by Photos.

## 4. The options builder (the load-bearing unit)

```ts
// recently-added-filter-options.ts
import { AssetOrderBy } from '@immich/sdk';
import type { FilterState } from '$lib/components/filter-panel/filter-panel';
import { buildPhotosTimelineOptions } from '$lib/utils/photos-filter-options';

export function buildRecentlyAddedTimelineOptions(filters: FilterState): Record<string, unknown> {
  // Reuse Photos' predicate mapping, then apply the two Recently-Added invariants:
  //   1. never surface shared-space assets (strip withSharedSpaces in every case)
  //   2. always order/group by *added* date
  const { withSharedSpaces: _omitShared, ...base } = buildPhotosTimelineOptions(filters);
  return { ...base, orderBy: AssetOrderBy.CreatedAt };
}
```

**Why this exact shape:**

- **`orderBy: AssetOrderBy.CreatedAt` always.** This is the defining trait of Recently Added and must
  hold under every filter combination. (`buildPhotosTimelineOptions` never sets `orderBy`, so Photos
  defaults to taken-at; we override.)
- **`withSharedSpaces` stripped always.** Recently Added is an own+partner surface; adding shared-space
  assets would silently broaden what appears. Stripping is safe whether or not the key is present
  (it is absent when a favorites filter is active).
- **`withPartners` inherited from `buildPhotosTimelineOptions` unchanged.** That means:
  - No favorites filter → `withPartners: true` (own + partners — matches today's static options).
  - Favorites filter active → `withPartners` absent (own-only). This matches Photos' semantics
    (a favorite is a *personal* flag; a partner's favorite is not yours) and is a *new* behavior for a
    *new* capability (there is no pre-existing favorites-filtering in Recently Added to regress).
- **`order` (asc/desc) inherited** from `filters.sortOrder`; default desc = newest-added first.
- **Date filters map to `takenAfter`/`takenBefore`** (inherited). Documented semantic: the **Timeline**
  date filter filters on *taken* date, while day-groups ("Today") reflect *added* date. This is
  intentional and useful (e.g. old photos just imported); we do not remap to created-at (no created-at
  range predicate exists on the timeline query — that would be backend work, a non-goal).

### Suggestion request payload

```ts
export function buildRecentlyAddedSuggestionRequest(filters: FilterState) {
  const context = buildFilterContext(filters);
  return {
    personIds: filters.personIds.length > 0 ? filters.personIds : undefined,
    country: filters.country,
    city: filters.city,
    make: filters.make,
    model: filters.model,
    tagIds: filters.tagIds.length > 0 ? filters.tagIds : undefined,
    rating: filters.rating,
    isFavorite: filters.isFavorite,
    mediaType:
      filters.mediaType === 'all'
        ? undefined
        : filters.mediaType === 'image' ? AssetTypeEnum.Image : AssetTypeEnum.Video,
    takenAfter: context?.takenAfter,
    takenBefore: context?.takenBefore,
    // NOTE: no withSharedSpaces, no albumId, no spaceId — own+partners scope only.
  };
}
```

This mirrors `album-filter-config.ts`'s private `toSuggestionRequest` (which likewise omits
`withSharedSpaces`), so suggestion lists stay scoped to the same asset set the timeline shows.

## 5. The filter config

```ts
// recently-added-filter-config.ts — Phase 1 (browse mode), mirrors album-filter-config.ts
export function buildRecentlyAddedFilterConfig(): FilterPanelConfig {
  return {
    // Phase 1: 9 metadata sections. 'text' is appended in Phase 2 together with its search path (§7),
    // so the text input is never present without a working submit.
    sections: ['timeline', 'people', 'location', 'camera', 'tags', 'rating', 'media', 'favorites', 'albums'],
    suggestionsProvider: async (filters) =>
      mapSuggestions(await getFilterSuggestions(buildRecentlyAddedSuggestionRequest(filters))),
    providers: {
      cities: (country, context) => getSearchSuggestions({ $type: SearchSuggestionType.City, country, ...context }),
      cameraModels: (make, context) => getSearchSuggestions({ $type: SearchSuggestionType.CameraModel, make, ...context }),
    },
  };
}
```

- `sections` is 9 in Phase 1; Phase 2 appends `'text'` for the full 10 (same plan order Photos uses).
- `mapSuggestions` = the same mapping album/photos use (`getPhotosPersonFilterId` /
  `getPhotosPersonFilterThumbnailUrl` for people, `{id, value}`→`{id, name}` for tags). Reuse the
  exported helpers from `photos-filter-options.ts`; the small mapping wrapper is local to this file
  (consistent with album-filter-config).
- The page wraps this config with `withNameCapture(config, personNames, tagNames)` so `ActiveFiltersBar`
  can label person/tag chips (same as the album/space pages).
- **Phase 2** extends `suggestionsProvider` to branch on an active free-text query and pull
  `searchSmartFacets` results (with `withSharedSpaces: false`), mirroring Photos' inline provider — see §7.

## 6. Page wiring (browse mode + count) — Phase 1

Mirror the Photos page, dropping Photos-only extras (memories `ImageCarousel`/`memoryManager`, and the
`RotateAction` which the current Recently Added page does not include). Keep the existing
`AssetSelectControlBar` block verbatim.

**State & derivations** (mirroring Photos §102–156, minus smart-facet state in Phase 1):

- `filters = $state<FilterState>()` seeded from the URL via `getSearchablePageFilterState` /
  `getSearchablePageState`, exactly as Photos seeds it.
- `timelineGrouping = $state<TimelineGrouping>('day')`, `temporalAnchor`, `committedQuery = ''`
  (search unreachable in Phase 1 — no `text` submission path yet), and the URL-sync bookkeeping
  (`lastHandledSearchState`, `pendingFilterUrlSync`).
- `options = $derived({ ...buildRecentlyAddedTimelineOptions(filters), grouping: timelineGrouping })`
  → `<Timeline {options}>`.
- `$effect(() => globalSearchManager.registerSearchablePageFilters(() => filters))`.

**Handlers** — reuse Photos' logic and its **exported** helper `handlePhotosRemoveFilter`
(operates on `FilterState`, view-agnostic):

- `syncFilterUrl`, `handleFiltersChange`, `handleRemoveActiveFilter` (→ `handlePhotosRemoveFilter`),
  `handleClearAllFilters`, `handleTimelineGroupingChange`, and the URL→filters `$effect`.

**Markup** — replicate Photos' body structure *inside* the existing `UserPageLayout` header:

```svelte
<UserPageLayout hideNavbar={assetMultiSelectManager.selectionActive} title={data.meta.title} description={countLabel} scrollbar={false}>
  <div class="flex h-full">
    <FilterPanel bind:filters bind:collapsed={filterCollapsed} externalToggle config={filterConfig}
      timeBuckets={timelineBuckets} storageKey="gallery-filter-visible-sections-recently-added"
      hidden={isTimelineEmpty} {personNames} {tagNames} onFiltersChange={handleFiltersChange} />
    <div class="flex flex-1 flex-col overflow-hidden pl-4">
      <FilterToolbar ... showFilters={hasActiveFilters} filters={activeFiltersBarSnippet} ... />
      <Timeline enableRouting bind:timelineManager {options} assetInteraction={assetMultiSelectManager}
        removeAction={AssetAction.ARCHIVE} onEscape={handleEscape} grouping={timelineGrouping}
        onGroupingChange={handleTimelineGroupingChange} {temporalAnchor}
        onTemporalAnchorResolved={() => (temporalAnchor = undefined)}
        onTimelineBucketActivate={handleTimelineBucketActivate} withStacked>
        {#snippet empty()}<EmptyPlaceholder text={$t('no_assets_message')} onClick={() => openFileUploadDialog()} .../>{/snippet}
      </Timeline>
    </div>
  </div>
</UserPageLayout>
<!-- existing {#if selectionActive} AssetSelectControlBar … {/if} unchanged -->
```

### The count

- `storageKey="gallery-filter-visible-sections-recently-added"` (its own per-view persisted section set).
- `hasActiveFilters = $derived(getActiveFilterCount(filters) > 0)` (Phase 1; `|| showSearchResults` in Phase 2).
- `count = $derived(timelineManager?.assetCount ?? 0)` (Phase 1; `showSearchResults ? smartFacetTotal : assetCount` in Phase 2).
- `countLabel = $derived(shouldShowRecentlyAddedCount(count, hasActiveFilters) ? $t('items_count', { values: { count } }) : undefined)`,
  passed as `description` to `UserPageLayout` — it renders next to the "Recently Added" title.
- `isTimelineEmpty = $derived(!!timelineManager?.isEmptyForOptions(options) && !hasActiveFilters)` — reused
  verbatim from Photos for `hidden`/toolbar gating (avoids the panel unmounting for a tick when clearing a
  zero-result filter).

```ts
// pure — fully unit-tested
export function shouldShowRecentlyAddedCount(count: number, hasActiveFilters: boolean): boolean {
  return count > 0 || hasActiveFilters;
}
```

Rationale for `shouldShowRecentlyAddedCount`:

- Before buckets load (`count === 0`, no filters) → **hidden**: no "0 items" flash on entry.
- Genuinely empty account (`count === 0`, no filters) → **hidden**: the `EmptyPlaceholder` already
  communicates emptiness.
- A filter that matches nothing (`count === 0`, filters active) → **"0 items"**: informative.
- Any non-empty result → **"N items"**, live-updating as buckets load / filters change.

### Single count, no duplicate

`ActiveFiltersBar` can render its own `resultCount` (via `filter_result_count`) and an "Add all N to
collection" button. To keep **one** unambiguous count (the header), Phase 1 passes the bar **no**
`resultCount` and **no** `onAddAllToCollection`. Chips + "Clear all" still work.

> **Default decision (open to override at review):** "Add all to collection" is **omitted** from Recently
> Added to avoid a second count. It is an additive follow-up if wanted (pass `resultCount` +
> `onAddAllToCollection`, and suppress the header count while filters are active to avoid duplication).

## 7. Phase 2 — the Text / smart-search section

The `text` section switches the view to query mode. Because a text query is inherently
relevance-ordered, this mode is (as in Photos) indistinguishable from Photos search — it abandons the
added-date ordering. It requires the most page-coupled, least-unit-testable plumbing, so it is a
**separate, later slice** (the sections array only really needs `text` once this lands; until then the
panel shows the other 9). End state = all 10 sections.

Phase 2 mirrors Photos' inline search wiring **with `withSharedSpaces` forced to `false`** everywhere:

- `committedQuery` from the URL; `showSearchResults = committedQuery.trim().length > 0`.
- `smartFacets` state + `loadSmartFacets(filters)` via `searchSmartFacets({ ...buildSmartSearchFacetsParams({ query, filters, withSharedSpaces: false, language }) })`, with AbortController cancellation and the key-cache, exactly like Photos `§216–266` but `withSharedSpaces` pinned false.
- `suggestionsProvider` branches: browse → `getFilterSuggestions` (§5); query → map `searchSmartFacets` facets.
- Render `<SmartSearchResults searchQuery={committedQuery} {filters} withSharedSpaces={false} total={smartFacetTotal} />` in the `{#if showSearchResults}` branch; `<Timeline>` otherwise.
- `timeBuckets={showSearchResults ? (smartFacets?.timeBuckets ?? []) : timelineBuckets}`.
- Header count uses `smartFacetTotal` in query mode; `hasActiveFilters` also true whenever `showSearchResults`.
- `clearSearch` / the query-clearing paths mirror Photos.

**Scope invariant:** own+partners, never shared spaces — enforced in all three data paths (timeline
options §4, browse suggestions §5, smart search here). This is the single rule distinguishing Recently
Added from Photos.

## 8. Development process — TDD

Every pure unit is built **red → green → refactor** using `superpowers:test-driven-development`.
Order (each step: write failing spec, run, implement, run, refactor):

1. `shouldShowRecentlyAddedCount` — smallest; pins the count-visibility rules.
2. `buildRecentlyAddedTimelineOptions` — the invariants (`orderBy` always CreatedAt; `withSharedSpaces`
   never present; `withPartners` inherited) + predicate passthrough.
3. `buildRecentlyAddedSuggestionRequest` — own+partners payload shape.
4. `buildRecentlyAddedFilterConfig` — sections list + suggestion/provider requests (mock `@immich/sdk`,
   mirror `album-filter-config.spec.ts`).
5. Page wiring — landed behind the tested units; verified by the e2e spec (§9) and manual smoke, since a
   full SvelteKit `+page.svelte` with all managers is impractical to mount in vitest. All *decision logic*
   is already in the pure units above, so the page is thin glue.
6. Phase 2 (Text) — config search-branch unit tests where the provider is separable; otherwise e2e.

Gate before "done" (per repo conventions): `cd web && pnpm check:typescript && pnpm check:svelte && pnpm lint && pnpm test`
plus the e2e web run for the new spec.

## 9. Test plan & edge cases

### Unit — `recently-added-filter-options.spec.ts`

`buildRecentlyAddedTimelineOptions`:

- **default** → `toEqual({ visibility: Timeline, withStacked: true, withPartners: true, order: Desc, orderBy: CreatedAt })`.
- **never has `withSharedSpaces`** — default; with a non-favorite filter (`country`); with `isFavorite: true`.
- **`orderBy` is always `CreatedAt`** — default; with `country`; with `isFavorite: true`; with `sortOrder: 'asc'`.
- **`withPartners` inherited** — present (`true`) with a non-favorite filter; **absent** when `isFavorite: true`.
- **`order`** — `Desc` for default/`relevance`, `Asc` for `sortOrder: 'asc'`.
- **predicate passthrough** — `personIds`, `city`+`country`, `make`+`model`, `tagIds`, `rating`,
  `mediaType`→`$type` (image/video) and omitted for `all`, trimmed `description`/`originalFileName`/`ocr`
  and omitted when blank, `isNotInAlbum`/`isInAlbum` true-only, `takenAfter`/`takenBefore` for year /
  year+month / custom-bounded / from-only / to-only ranges.
- **multi-filter** case with `orderBy` still `CreatedAt` and no `withSharedSpaces`.

`buildRecentlyAddedSuggestionRequest`:

- omits `withSharedSpaces`, `albumId`, `spaceId` (always).
- maps `mediaType`; passes `takenAfter`/`takenBefore`, `isFavorite`, `personIds`/`tagIds` (undefined when empty).

`shouldShowRecentlyAddedCount`:

- `(0, false) → false`; `(0, true) → true`; `(5, false) → true`; `(5, true) → true`.

### Unit — `recently-added-filter-config.spec.ts` (mirror `album-filter-config.spec.ts`)

- `sections` equals the 9 metadata sections in plan order (Phase 1); the assertion is updated to the full
  10 (with `'text'`) when Phase 2 lands.
- `suggestionsProvider` calls `getFilterSuggestions` **without** `withSharedSpaces`/`albumId`/`spaceId`;
  maps tags (`{id, name}`), people (scoped id via `getPhotosPersonFilterId`, incl. a space-primary
  thumbnail case), `hasUnnamedPeople`; passes custom dates and `isFavorite`.
- `providers.cities` / `cameraModels` call `getSearchSuggestions` without `withSharedSpaces`/`albumId`/`spaceId`.

### E2E — `recently-added.e2e-spec.ts` (Playwright, `--project=web`)

- `/recently-added` renders the Filter panel and the header count.
- Applying **Media type = Video** narrows the grid, updates the URL (filter param present), and updates
  the header count; a person/tag chip appears in `ActiveFiltersBar`.
- **Remove** the chip / **Clear all** restores the full view and count.
- **Deep-link** to `/recently-added?...` with a filter param seeds the panel state on load.
- Reload preserves filters (URL is source of truth).
- *(Phase 2)* Typing a text query shows `SmartSearchResults` and a search-total count; clearing returns to browse.

### Edge cases (each has a test above or an explicit e2e assertion)

| Edge case | Expected | Verified by |
|---|---|---|
| Empty account (no assets) | Empty placeholder; count hidden; panel hidden (`isEmptyForOptions && !hasActiveFilters`) | `shouldShowRecentlyAddedCount(0,false)=false` + e2e |
| Filter matches zero assets | Panel/chips stay visible; count shows "0 items"; user can clear | `shouldShowRecentlyAddedCount(0,true)=true` + e2e |
| Initial load, buckets not yet counted | No "0 items" flash | `shouldShowRecentlyAddedCount(0,false)=false` |
| `withSharedSpaces` leakage | Never sent in options, suggestions, or search | options + config unit tests |
| Favorites filter | Own-only (partners excluded), consistent with Photos | options unit test |
| Any filter combination | `orderBy` stays `CreatedAt` | options unit tests |
| Sort asc/desc | `order` flips; `orderBy` unchanged | options unit tests |
| Deep-link / reload with filter params | Filters seeded from URL | e2e |
| Multi-select active | Header (title+count) hidden; selection bar shown; Escape clears selection | existing behavior preserved (unchanged block) + e2e smoke |
| Grouping day↔month via toolbar | Grouping changes; temporal anchor preserved | mirrors Photos (manual/e2e) |
| Suggestion fetch failure | Panel handles via its AbortController path; no uncaught throw | mirrors album/Photos (no new handling) |
| *(Phase 2)* Smart-facet fetch failure | Caught, `console.error`, falls back to prior facets | mirrors Photos |

## 10. Error handling

- **Filter-suggestion fetch:** the browse `suggestionsProvider` does not add its own try/catch (matching
  `album-filter-config.ts`); `FilterPanel` owns debouncing + `AbortController` cancellation.
- **Smart-facet fetch (Phase 2):** catch → `console.error` → fall back to the last good facets (mirror
  Photos `§252–257`).
- **URL navigation:** mirror Photos — `goto(..., { replaceState, keepFocus, noScroll })`; no special handling.

## 11. Non-goals

- Any server / API / DTO change.
- Photos/videos count breakdown (needs a server stats change — `/search/statistics` returns total only;
  `/assets/statistics` lacks the filters).
- Per-day-group counts in the timeline day headers (would edit the shared `Timeline` component → affects
  all timeline views).
- Mobile parity (separate filter stack).
- Extracting a shared `<FilteredTimelinePage>` component or shared logic helpers (Approaches B/C — a
  cross-cutting refactor of all filter surfaces, out of scope here).
- Fixing the pre-existing cross-view filter-parity issues #802 / #797 / #796.

## 12. Decisions taken (flagged for review)

1. **Text/smart-search is Phase 2**, sequenced after the browse filters + count, to isolate the risky,
   page-coupled, least-unit-testable plumbing. End state still includes all 10 sections.
2. **"Add all to collection" omitted** from Recently Added's `ActiveFiltersBar` so the header carries the
   single count. Easy to add back later.
3. **Favorites filter excludes partner assets** (own-only), matching Photos, rather than forcing
   `withPartners` on. It is new behavior for a new capability, so no regression.
4. **The Timeline date filter filters taken-at** while day-grouping reflects added-at; kept as-is (no
   created-at range predicate exists; adding one is backend work / non-goal).
