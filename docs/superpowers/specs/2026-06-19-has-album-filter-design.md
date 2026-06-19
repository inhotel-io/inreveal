# "Has album" filter — design

**Issue:** [open-noodle/gallery#675](https://github.com/open-noodle/gallery/issues/675)
**Date:** 2026-06-19

## Problem

The timeline filter panel's Album section offers only two states:

- **All**
- **Has no album**

The logical third state is missing:

- **Has album** — show only assets assigned to at least one album.

Without it the filter is asymmetric: a user can find unorganized photos (Has no album) but cannot do the reverse — filter to photos that are already in an album. Both directions are equally useful for organizing a large library.

## Approach

Add a parallel boolean `isInAlbum` everywhere the existing fork-only `isNotInAlbum` boolean is wired. The two are **mutually exclusive in the UI** — selecting one clears the other — so the only reachable states are _All / Has album / Has no album_.

This was chosen over a tri-state enum (`albumFilter: 'all' | 'inAlbum' | 'notInAlbum'`) because:

- It is purely **additive** — every existing `isNotInAlbum` site gains a mirrored `isInAlbum` site, never rewriting existing behavior. This keeps upstream rebases low-conflict (the fork's guiding constraint).
- **No API/URL migration.** Existing `?album=none` deep links and persisted state keep working; we only add a new value `?album=has`.
- **Mechanical and low-risk** — easy to TDD, easy to review, nothing existing can regress.

The enum's only real advantage — type-level impossibility of a contradictory state — is already guaranteed in practice by the UI, and defended server-side (see Edge cases).

Scope: mirror `isInAlbum` on **every surface `isNotInAlbum` already lives** (timeline/photos, shared-space, map markers, smart search). `AlbumsFilter.svelte` is a single shared component and the filter-option utils already each thread `isNotInAlbum`, so full symmetry is the natural result — restricting to the timeline panel would require _extra_ branching to suppress the new button elsewhere.

## Changes

### 1. UI — `web/src/lib/components/filter-panel/albums-filter.svelte`

The only genuinely new code. Convert the 2-button group to 3 buttons. Change the prop contract from `selected?: boolean` to an explicit tri-state:

```ts
interface Props {
  selected: 'all' | 'has' | 'none';
  onChange: (value: 'all' | 'has' | 'none') => void;
}
```

Buttons (preserve existing test ids, add one):

- **All** — `data-testid="albums-all"` (`selected === 'all'`)
- **Has album** — `data-testid="albums-has"` (new, icon `mdiImageAlbum`)
- **Has no album** — `data-testid="albums-none"` (existing, icon `mdiImageOffOutline`)

`filter-panel.svelte` maps the two booleans ↔ tri-state, clearing the other on select:

```svelte
<AlbumsFilter
  selected={filters.isInAlbum ? 'has' : filters.isNotInAlbum ? 'none' : 'all'}
  onChange={(v) =>
    updateFilters({
      ...filters,
      isInAlbum: v === 'has' ? true : undefined,
      isNotInAlbum: v === 'none' ? true : undefined,
    })}
/>
```

### 2. Web plumbing (mirror `isNotInAlbum` 1:1)

- `web/src/lib/types.ts` — `SearchDisplayFilters.isInAlbum`
- `web/src/lib/components/filter-panel/filter-panel.ts` — `FilterState`, `createFilterState`, `getActiveFilterCount`, `FilterContext`, `buildFilterContext`, `clearFilters`
- `web/src/lib/components/filter-panel/filter-panel.svelte` — effect-tracking `current` object; `hasActiveFilter('albums')` returns true if **either** boolean is set
- `web/src/lib/components/filter-panel/active-filters-bar.svelte` — new chip with `labelKey: 'filter_has_album'` for `isInAlbum === true`
- `web/src/lib/utils/searchable-page-search.ts` — new URL param value `?album=has` (existing `?album=none` untouched); `parseAlbumFilter` returns `'has' | 'none' | undefined`; parse + serialize + the `SearchablePageFilterState` field union
- filter-option utils — build-option + remove-filter cases (a "remove albums" action clears **both** booleans):
  - `web/src/lib/utils/photos-filter-options.ts`
  - `web/src/lib/utils/space-filter-options.ts`
  - `web/src/lib/utils/space-search.ts`
  - `web/src/lib/utils/map-filter-options.ts`
  - `web/src/lib/utils/map-filter-config.ts`
- test stubs — carry `isInAlbum` + new button/data-attr:
  - `web/src/test-data/mocks/filter-panel-favorites.stub.svelte`
  - `web/src/test-data/mocks/bindable-filter-panel.stub.svelte`
  - `web/src/test-data/mocks/smart-search-results.stub.svelte`
- `i18n/en.json` — `"filter_has_album": "Has album"` (next to `filter_has_no_album`). Other locales fall back to English until Weblate sync.

### 3. Server (mirror `isNotInAlbum` 1:1)

- DTOs:
  - `server/src/dtos/search.dto.ts` — base schema field, the `SmartSearchFacets` pick list, and the two `stringToBool` variants
  - `server/src/dtos/time-bucket.dto.ts`
  - `server/src/dtos/gallery-map.dto.ts`
- Repos / SQL — the inverse is the **same `EXISTS(album_asset)` subquery without `NOT`**, guarded by the same `!options.albumId(s)` condition:
  - `server/src/repositories/asset.repository.ts` — option type + the two SQL sites
  - `server/src/repositories/search.repository.ts` — option types + the two SQL sites
  - `server/src/utils/database.ts` — `searchAssetBuilder`
- `server/src/services/shared-space.service.ts` — map `isInAlbum: dto.isInAlbum`
- `server/src/services/timeline.service.ts` — **no change** (`buildTimeBucketOptions` spreads the DTO, so the field flows once added to the DTO + option type)

### 4. SDK / OpenAPI

Regenerate the spec + TS SDK (required: the web passes `isInAlbum` through generated `@immich/sdk` types, so it must typecheck) via the documented workflow: build server → `pnpm sync:open-api` → `make open-api` (regenerates TS + Dart clients).

## Testing (TDD — failing test first, then implementation)

### Server

- `server/src/dtos/search.dto.spec.ts` — accept/coerce `isInAlbum` on smart search, facets, filter-suggestion, and dependent-suggestion requests (mirror existing `isNotInAlbum` cases)
- `server/src/dtos/time-bucket.dto.spec.ts` — coerce `isInAlbum` `'true'`/`'false'`
- `server/src/dtos/gallery-map.dto.spec.ts` — coerce `isInAlbum`
- `server/src/repositories/search.repository.spec.ts` — `compileFilteredAssetIds(sut, { isInAlbum: true })` emits an `EXISTS (… album_asset …)` predicate (and crucially **not** `NOT EXISTS`)
- `server/src/services/timeline.service.spec.ts` — `getTimeBuckets` / `getTimeBucket` forward `isInAlbum`
- `server/src/services/shared-space.service.spec.ts` — `getFilteredMapMarkers` forwards `isInAlbum`

### Web

- `web/src/lib/utils/__tests__/photos-filter-options.spec.ts` — `isInAlbum: true` maps onto options; `false`/unset omitted; remove `'albums'` clears both booleans; remove `'isInAlbum'` clears it
- `web/src/lib/utils/__tests__/space-search.spec.ts` — sets/omits `isInAlbum`
- `web/src/lib/utils/__tests__/map-filter-options.spec.ts` — includes/omits `isInAlbum`
- space-filter-options coverage (mirror)
- searchable-page-search — `?album=has` round-trips to `isInAlbum: true`; `?album=none` still → `isNotInAlbum: true`
- `albums-filter` component test — three buttons; clicking each calls `onChange` with `'all' | 'has' | 'none'`; correct active styling
- `filter-panel` — `hasActiveFilter('albums')` true for either boolean; `getActiveFilterCount` counts `isInAlbum`

### E2E

Mirror any existing Playwright coverage for the "Has no album" toggle if present; otherwise the unit/component coverage above is sufficient for this UI-symmetry change.

## Edge cases

- **Both booleans `true`** (unreachable via UI): the SQL ANDs both predicates → `EXISTS … AND NOT EXISTS …` → empty result, which is the literally-correct intersection. No special handling required.
- **Album-scoped queries** (`albumId` / `albumIds` set): the existing `isNotInAlbum` predicates already no-op in that case; `isInAlbum` uses the same guard, so it likewise no-ops when an explicit album scope is present.
