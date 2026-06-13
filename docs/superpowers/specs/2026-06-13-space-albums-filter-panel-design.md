# Space Albums — FilterPanel in the in-space album page (design)

Date: 2026-06-13
Branch: `feat/space-albums`
Status: design approved pending spec review

## Goal

Bring the global album page's filtering experience to the **in-space album page**
(`web/src/routes/(user)/spaces/[spaceId]/albums/[albumId=id]/+page.svelte`) in **both**
of its modes:

1. **Browse** — the timeline shown when you open a linked album.
2. **Add** — the full-screen "Add to album" picker overlay.

"Full parity" with the global album page: a `FilterPanel` left sidebar, an
`ActiveFiltersBar` chip row, and a "no photos match your filters" empty state, in each
mode.

## Reference implementations (in-repo)

- **Global album page** — the stated reference:
  `web/src/routes/(user)/albums/[albumId=id]/[[photos=photos]]/[[assetId=id]]/+page.svelte`.
  Renders `FilterPanel` for both view and select-assets modes, wraps each config's
  `suggestionsProvider` to capture person/tag display names into `SvelteMap`s, and shows
  `ActiveFiltersBar` + a filtered-empty state per mode.
- **Space timeline page** — proves the sidebar layout co-exists with `UserPageLayout`:
  `web/src/routes/(user)/spaces/[spaceId]/[[photos=photos]]/[[assetId=id]]/+page.svelte`
  uses `<UserPageLayout>` wrapping `<div class="flex h-full">` with a `FilterPanel` left
  sidebar and the timeline in the right column.

## Reusable building blocks (already exist)

- `src/lib/utils/album-filter-config.ts`
  - `buildAlbumDetailFilterConfig(albumId)` — browse config (suggestions scoped to album).
  - `buildAlbumAssetPickerFilterConfig()` — picker config (suggestions over the user's library).
- `src/lib/utils/album-filter-options.ts`
  - `buildAlbumTimelineOptions(albumId, order, filters)` — browse timeline options.
  - `buildAlbumAssetPickerOptions(albumId, filters)` — picker timeline options.
- `src/lib/components/filter-panel/filter-panel.ts` — `createFilterState`, `getActiveFilterCount`,
  `clearFilters`, `FilterState`, `FilterPanelConfig`.
- `src/lib/components/filter-panel/active-filters-bar.svelte`.
- `getTimelineManagerTimeBuckets(timelineManager)` — scrubber facet buckets.

The in-space page **already** calls `buildAlbumTimelineOptions` / `buildAlbumAssetPickerOptions`,
but with an empty `createFilterState()`. The bulk of this work is feeding real filter state in
and rendering the panel.

## Approach

**A — port the album-page filter machinery into the in-space page.** The global album page is
left untouched (it is large and battle-tested; a shared-controller refactor is more risk/scope
than the duplication saves while there are only two consumers). The only shared extraction is a
small pure util for the one genuinely awkward bit (config wrapping).

### New util: `withNameCapture`

`src/lib/utils/filter-name-capture.ts`

```ts
import type { FilterPanelConfig, FilterState } from '$lib/components/filter-panel/filter-panel';

// Returns a copy of `config` whose suggestionsProvider, in addition to returning suggestions,
// records each person/tag id->name into the supplied maps so ActiveFiltersBar can label chips.
export function withNameCapture(
  config: FilterPanelConfig,
  personNames: Map<string, string>,
  tagNames: Map<string, string>,
): FilterPanelConfig;
```

Behaviour: when `config.suggestionsProvider` is undefined, return `config` unchanged. Otherwise
wrap it: call the original, then `personNames.set(p.id, p.name)` / `tagNames.set(t.id, t.name)`
for each returned person/tag, then return the original suggestions object unchanged. Pure and
unit-testable.

### Component changes (`spaces/[spaceId]/albums/[albumId=id]/+page.svelte`)

State:

- `let browseFilters = $state(createFilterState())`
- `let pickerFilters = $state(createFilterState())`
- `const browsePersonNames = new SvelteMap<string, string>()` (+ `browseTagNames`,
  `pickerPersonNames`, `pickerTagNames`)
- `let pickerTimelineManager = $state<TimelineManager>() as TimelineManager` (browse already has
  `timelineManager`)

Derived configs and options:

- `const browseFilterConfig = $derived(withNameCapture(buildAlbumDetailFilterConfig(album.id), browsePersonNames, browseTagNames))`
- `const pickerFilterConfig = $derived(withNameCapture(buildAlbumAssetPickerFilterConfig(), pickerPersonNames, pickerTagNames))`
- `browseOptions`: pass `browseFilters` (instead of `createFilterState()`).
- `pickerOptions`: pass `pickerFilters` (instead of `createFilterState()`).
- `timeBuckets`: `getTimelineManagerTimeBuckets(timelineManager)` for browse,
  `getTimelineManagerTimeBuckets(pickerTimelineManager)` for picker.

Resets:

- Entering add mode (the `add-photos` button onclick + the empty-state add button) and leaving it
  (`handleExitAddMode`, `handleAddAssetsSuccess`): `pickerFilters = createFilterState()` and clear
  the picker name maps, alongside the existing `timelineGrouping='day'` / anchor resets.
- On `album.id` change: `browseFilters = createFilterState()` and clear the browse name maps
  (via `$effect` keyed on `album.id`).

Layout — **browse** (inside `UserPageLayout`):

```svelte
<div class="flex h-full">
  {#if !assetMultiSelectManager.selectionActive}
    <FilterPanel
      config={browseFilterConfig}
      bind:filters={browseFilters}
      {timeBuckets}
      hidden={isBrowseTimelineEmpty}
      personNames={browsePersonNames}
      tagNames={browseTagNames}
    />
  {/if}
  <div class="flex flex-1 flex-col overflow-hidden pl-4">
    <!-- grouping control (existing, transparent bar) -->
    <!-- ActiveFiltersBar when getActiveFilterCount(browseFilters) > 0 -->
    <!-- <Timeline ...browseOptions> with filtered-empty + plain-empty snippets -->
  </div>
</div>
```

The FilterPanel sidebar is hidden whenever a selection/control bar is active (matches the space
timeline page).

Layout — **add overlay** (inside the existing `fixed inset-0 z-40` section):

```svelte
<section ... data-testid="add-photos-overlay">
  <div class="flex h-full">
    <FilterPanel config={pickerFilterConfig} bind:filters={pickerFilters}
      timeBuckets={pickerTimeBuckets} hidden={isPickerTimelineEmpty}
      personNames={pickerPersonNames} tagNames={pickerTagNames} />
    <main ... data-testid="add-photos-timeline-main">
      <!-- ActiveFiltersBar when getActiveFilterCount(pickerFilters) > 0 -->
      <Timeline ...pickerOptions bind:timelineManager={pickerTimelineManager} />
    </main>
  </div>
  <ControlAppBar .../>   <!-- stays AFTER the flex so it paints on top (paint-order fix) -->
</section>
```

### Empty states (full parity)

For each mode, the `<Timeline>` `empty` snippet branches:

- If `getActiveFilterCount(<mode>Filters) > 0` → "No photos match your filters" + a
  "Clear all filters" action that does `<mode>Filters = clearFilters(<mode>Filters)`.
- Else → the existing empty message (browse: album-empty/add-photos prompt; add: picker empty).

## Testing (TDD)

Unit (`src/lib/utils/filter-name-capture.spec.ts`):

- Returns config unchanged when `suggestionsProvider` is undefined.
- Wrapped provider returns the original suggestions object.
- Wrapped provider populates `personNames` and `tagNames` from the returned people/tags.

Component (`space-album-detail-page.spec.ts`, with new co-located `mock-filter-panel.test-wrapper.svelte`
and `mock-active-filters-bar.test-wrapper.svelte`; `FilterPanel`/`ActiveFiltersBar` mocked):

- Browse mode renders the FilterPanel; hidden when `selectionActive`.
- Add mode renders the FilterPanel.
- `browseOptions` carries filter fields when `browseFilters` set (assert via the existing
  `timeline-options` testid output); same for `pickerOptions`.
- `ActiveFiltersBar` renders when filters are active in each mode; absent when none.
- Entering add mode then exiting resets `pickerFilters` (active-filter count back to 0).
- Control-bar-after-main DOM order in the overlay still holds (existing regression test must
  keep passing).

## Gates

`pnpm test` (touched specs), `pnpm run check:typescript`, `pnpm run check:svelte`,
`pnpm build` (the real gate for web), eslint 0 on touched files, prettier --write. Commit
`feat(web): ...`, push `feat/space-albums`.

## Out of scope

- No changes to the global album page.
- No changes to server endpoints or filter config/options helpers.
- No shared filter-controller refactor (revisit if a third consumer appears).
