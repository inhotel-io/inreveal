# Asset Viewer Contextual Filters — Design Spec

**Date:** 2026-07-12
**Branch:** `worktree-feat+asset-viewer-contextual-filters`
**Closes:** #767 (partially — see §7)

## 1. Summary

The asset-viewer info panel is informational today. Two of its fields (camera make/model, lens
model) link to the deprecated `/search` page; one (location) conflates its value with its Edit
button. This spec turns the panel into a **filtering surface**: clicking any metadata value filters
the timeline **you are currently in** — the space, the album, or `/photos` — while every action that
exists today remains reachable.

The enabling idea is architectural: **make the URL the single source of truth for filter state on
all four timeline surfaces** (`/photos`, `/spaces/{id}`, `/albums/{id}`, `/map`). Once filters live
in the URL everywhere, "filter in the current context" reduces to _read the URL, merge one field,
write it back, navigate_ — and the space→map filter bug (#767) falls out as a side effect, because
the map link becomes an ordinary filter URL.

## 2. Goals

- Clicking a metadata value in the info panel filters the **current** context (space / album /
  photos / map), not a deprecated global search page.
- Every action available today remains available via an explicit secondary affordance.
- Retire both `Route.search(...)` links from the asset viewer.
- Fix #767: filters applied in a Space carry over to the map view.

## 3. Non-goals

- **Mobile (Flutter).** Web only. Mobile keeps its current asset-viewer behavior.
- **Smart-search (`q`) on the map.** The map-markers endpoint has no embedding search; see §7.
- **Filter-panel dropdowns for the new dimensions.** The four new dimensions are settable from the
  asset viewer, round-trip through the URL, and are removable as chips — but they get no dropdown in
  the filter panel. Deliberate follow-up. **Note:** this is cheaper than it looks — the suggestion
  repository _already_ supports both new EXIF fields (`getExifField` is typed
  `'city' | 'state' | 'country' | 'make' | 'model' | 'lensModel'`; `getStates()` at
  `search.repository.ts:1042` and `getCameraLensModels()` at `:1088` already exist). Only the
  _timeline filter_ side is missing. We are scoping the dropdowns out for size, not for difficulty.
- **Retiring the `/search` page itself.** This spec removes the asset viewer's _links_ to it.
- Making `/albums/{id}` a ⌘K "searchable page". `getSearchablePageBasePath` is deliberately left
  alone so ⌘K's behavior does not change.

## 4. Background: three incompatible filter mechanisms

| Surface                   | Filter state lives in                         | Evidence                                      |
| ------------------------- | --------------------------------------------- | --------------------------------------------- |
| `/photos`, `/spaces/{id}` | ✅ URL params                                 | `web/src/lib/utils/searchable-page-search.ts` |
| `/albums/{id}`            | ❌ component-local `$state`                   | `albums/[albumId=id]/…/+page.svelte:115`      |
| `/map`                    | ❌ component-local `$state`, **always empty** | `map/…/+page.svelte:72`                       |

`/photos` and `/spaces` already implement the full loop we want — hydrate from URL, write back on
change, react to URL changes (`photos/…/+page.svelte:434-452` and `:506-534`). Slices 3 and 4 make
albums and the map do the same thing.

### 4.1 What the timeline query already supports

`TimeBucketQueryBaseSchema` (`server/src/dtos/time-bucket.dto.ts:20+`) already accepts `city`,
`country`, `make`, `model`, `rating`, `type`, `description`, `ocr`, `originalFileName`, `personIds`,
`spacePersonIds`, `tagIds`, `isFavorite`, `isInAlbum`/`isNotInAlbum`, `albumId`, `spaceId`,
`takenAfter`/`takenBefore`.

It does **not** support `lensModel`, `state`, or an owner filter.

### 4.2 Two traps found while verifying (do not re-derive these)

- **`userId` is NOT an owner filter.** `timeline.service.ts:67-91` maps `dto.userId` →
  `userIds = [userId, ...partnerIds]`, and `withTimeBucketAssetFilters:359-373` **OR**s that against
  `timelineSpaceIds`. It expresses _timeline composition_ ("my assets **or** my spaces' assets").
  Reusing it as a contributor filter inside a Space would **widen** the result set, not narrow it.
  Contributor filtering therefore needs a genuinely new `ownerId` option that AND-s
  `asset.ownerId = X`.
- **`albumId` already takes precedence over `isInAlbum`/`isNotInAlbum`** — both are guarded with
  `&& !options.albumId` (`asset.repository.ts:321,326`). The URL codec must never emit both.

### 4.3 No migration is required

`city`/`country`/`make`/`model` are plain exact-match `=` predicates on `asset_exif`
(`asset.repository.ts:288-299`). Only the ILIKE fields (`description`, `ocr`, `originalFileName`)
needed trigram indexes back in #723. `lensModel` and `state` are exact-match too, and both columns
already exist (`asset-exif.table.ts:56,77`).

**Consequence: no `migrations-gallery/` migration, and therefore no `revert-to-immich.sql` CI gate.**

### 4.4 RBAC: non-owners MUST be able to filter assets they do not own

**Requirement:** a Space viewer or editor filtering by camera / lens / state / location must see
matching assets **contributed by other members**, not just their own. This fork has already shipped
this exact bug class once — see the comment at `search.repository.ts:1210-1213`: _"Dropping the
participant cases would give viewers empty People/Location/Camera/Tag facets for assets owned by the
album owner (issue #655)."_ The same trap is live for spaces, so it is a **first-class test target**,
not an assumption.

#### Verified: both paths are ownership-agnostic under a Space scope

**Filter path** — `buildSpaceTimelineOptions` (`space-filter-options.ts:5-6`) sends
`{ spaceId, withStacked }` and **no `userId`**. So the `userIds` narrowing at
`withTimeBucketAssetFilters:359` never fires, and the sole scope is the `spaceId` predicate
(`shared_space_asset` OR `shared_space_library`, `:331-348`). The new `make`/`model`/`lensModel`/
`state` conditions are exact-match `AND`s on an `asset_exif` inner join — they carry no ownership
predicate, so they narrow _within_ the space without re-scoping to the viewer. ✅

**Suggestion path** — `applySuggestionScope` (`search.repository.ts:1199-1295`) has three branches:

| Branch       | Condition          | Ownership predicate                                                        |
| ------------ | ------------------ | -------------------------------------------------------------------------- |
| `:1254-1256` | no album, no space | `asset.ownerId = ANY(userIds)` — **owner-scoped** (correct for `/photos`)  |
| `:1257-1274` | `spaceId` set      | **none** — space membership only ✅                                        |
| `:1217-1253` | `albumId` set      | in-album AND (owner OR album participant OR timeline space) — the #655 fix |

Access control itself is enforced upstream of all this:
`requireAccess({ permission: Permission.SharedSpaceRead, ids: [dto.spaceId] })`
(`search.service.ts:388-389`).

#### The new `ownerId` filter must narrow, never widen

`ownerId` is added as a plain `AND asset.ownerId = X`. It composes _inside_ the existing scope, so it
can only ever shrink the result set:

- In a Space: `spaceId` scope AND `ownerId=<member>` → that member's contributions to that space. ✅
- On `/photos`: `ownerId = ANY(me, partners)` AND `ownerId=<stranger>` → **empty**. No leak. ✅

This must be tested explicitly (E17–E21) — it is the one place in this spec where a mistake could
create a data leak rather than merely a broken filter.

## 5. Architecture

### 5.1 `FilterState` additions

```ts
export interface FilterState {
  // … existing …
  lensModel?: string; // NEW — exact match
  state?: string; // NEW — exact match (EXIF "state/province")
  albumId?: string; // NEW — asset is in this album
  ownerId?: string; // NEW — asset.ownerId
}
```

`createFilterState()`, `clearFilters()` and `getActiveFilterCount()` must all account for the four
new fields.

### 5.2 Shared filter-URL codec — `web/src/lib/utils/filter-url.ts` (new)

Extract the `FilterState ⇄ URLSearchParams` codec that currently lives inside
`searchable-page-search.ts` (`getSearchablePageFilterState` / `appendSearchablePageFilterParams`)
into a standalone module so all four surfaces share one implementation.

New URL params:

| Param     | FilterState field | Notes                                                           |
| --------- | ----------------- | --------------------------------------------------------------- |
| `lens`    | `lensModel`       |                                                                 |
| `state`   | `state`           |                                                                 |
| `albumId` | `albumId`         | Distinct from the existing `album` param, which is `has`/`none` |
| `owner`   | `ownerId`         |                                                                 |

**Codec invariant:** when `albumId` is set, the encoder MUST NOT emit `album=has` / `album=none`
(mirrors the server precedence in §4.2). The decoder must likewise drop `isInAlbum`/`isNotInAlbum`
if `albumId` is present.

`searchable-page-search.ts` keeps its public API and delegates to the codec — `/photos` and
`/spaces` must not change behavior.

### 5.3 Filter target resolution — `web/src/lib/utils/filter-target.ts` (new)

```ts
type FilterTarget =
  | { kind: 'photos'; basePath: '/photos' }
  | { kind: 'space'; basePath: string; spaceId: string }
  | { kind: 'album'; basePath: string; albumId: string }
  | { kind: 'map'; basePath: '/map'; spaceId?: string };

function resolveFilterTarget(url: URL): FilterTarget | null;
```

Deliberately **separate** from `getSearchablePageBasePath` (which drives ⌘K and stays unchanged).
Returns `null` for `/favorites`, `/archive`, `/trash`, `/folders`, `/memories`, person pages, tag
pages, `/search`, and shared links.

### 5.4 Applying a filter — `applyContextualFilter`

A pure URL builder plus a thin navigating wrapper, so the interesting logic is unit-testable:

```ts
// pure
function buildContextualFilterUrl(url: URL, patch: Partial<FilterState>, opts?: { global?: boolean }): string | null;
// side-effecting
function applyContextualFilter(patch: Partial<FilterState>, opts?: { global?: boolean }): void; // → goto()
```

Semantics:

1. Resolve the target from `page.url`. If `null` → **fall back to `/photos`** (authenticated
   contexts only). If `authManager.isSharedLink` → the affordance is not rendered at all.
2. `opts.global === true` forces the `/photos` target regardless of context (the 🔍 "search
   everywhere" icon).
3. Decode current filters from the URL, **merge** the patch (set those fields; preserve all others),
   re-encode.
4. Drop the `at` param (one-shot grid scroll target — see the existing rationale at
   `searchable-page-search.ts:122-128`).
5. The resulting URL is the target's **base path**, which does not include the `assetId`. So a single
   `goto()` both closes the asset viewer and applies the filter.

**Merge, don't replace.** Clicking the camera on an asset while a `people` filter is active yields
_both_ filters. Clicking a camera again overwrites only `make`/`model`.

### 5.5 Per-field filter patches

| Row                     | Patch produced                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Camera                  | `{ make, model }`                                                                                             |
| Lens                    | `{ lensModel }`                                                                                               |
| Location — city line    | `{ city, country }` (country included to disambiguate same-named cities)                                      |
| Location — state line   | `{ state, country }`                                                                                          |
| Location — country line | `{ country }`                                                                                                 |
| Date                    | `{ dateAfter: D, dateBefore: D }` where `D` = the asset's **local** date (`YYYY-MM-DD`), not a UTC conversion |
| Filename                | `{ originalFileName: <basename without extension> }` — surfaces RAW/JPEG pairs and edited variants            |
| Tag chip                | `{ tagIds: [tag.id] }`                                                                                        |
| Person chip             | `{ personIds: [getPhotosPersonFilterId(person)] }` (scoped token — `person:` / `space-person:`)               |
| Shared by               | `{ ownerId: asset.ownerId }`                                                                                  |
| Rating (icon)           | `{ rating: asset.exifInfo.rating }` — server semantics are `>= N`                                             |
| Description (icon)      | `{ description: <description text> }`                                                                         |
| Appears-in album (icon) | `{ albumId: album.id }`                                                                                       |

## 6. Interaction grammar

**Primary — click the value → filter the current context. Secondary — icon buttons → today's action.**

| Row                                               | Click value →                         | Icons →                                 |
| ------------------------------------------------- | ------------------------------------- | --------------------------------------- |
| Camera `Apple iPhone 17 Pro Max`                  | `make` + `model`                      | 🔍 filter across whole library          |
| Lens                                              | `lensModel`                           | 🔍                                      |
| Location `Berlin` / `Germany` / `State of Berlin` | `city` / `country` / `state`          | 🗺️ full map (carries context) · ✏️ edit |
| Date                                              | that day                              | ✏️ edit date                            |
| Filename                                          | `originalFileName`                    | ⓘ toggle path → folder                  |
| Tags (chips)                                      | `tagIds`                              | ↗ `/tags/{path}`                        |
| People (chips)                                    | `personIds`                           | ↗ person page                           |
| Shared by                                         | `ownerId`                             | —                                       |
| ISO, exposure, ƒ, focal, MP, dims, size           | _plain text — no filter field exists_ | —                                       |

**Three justified exceptions** (the value is already an interactive control, so filtering becomes the
icon):

| Row                    | Primary stays                    | Filter via     |
| ---------------------- | -------------------------------- | -------------- |
| Rating ⭐              | stars **set** the rating (owner) | ⚗️ filter icon |
| Description            | textarea **edits**               | ⚗️ filter icon |
| Appears-in album cards | card **opens the album**         | ⚗️ filter icon |

**The 🔍 "search everywhere" icon** replaces the deprecated `Route.search(...)` link: it applies the
same patch against `/photos` globally. It is **hidden when the current target is already `/photos`**
(where it would be a no-op duplicate of the primary click).

## 7. #767 — map ignores active filters

Three distinct bugs:

| Half  | Bug                                                                                                              | This spec                   |
| ----- | ---------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **a** | `space-map.svelte:13` builds `/map?spaceId=<id>` — drops `q` and every filter param                              | ✅ Slice 4                  |
| **b** | Map page never hydrates filters from the URL (`map/…/+page.svelte:72`)                                           | ✅ Slice 4                  |
| **c** | Map markers **cannot do smart search** — `buildMapMarkerOptions` has no `query`; `/map/markers` is metadata-only | ⚠️ Slice 5 (honest failure) |

Half (c) is the reporter's exact repro (`?q=ski`). We cannot carry a CLIP embedding query to the
map-markers endpoint without new server work, which is out of scope. **But the worst part of the bug
is that the map silently renders the entire library**, giving no hint the filter was dropped.

Slice 5 therefore: carry `q` in the URL, apply every structured filter, and render an explicit notice
that the smart-search term is not applied on the map. The user sees _why_ the result set differs
instead of being silently misled. The `q`-on-map gap is filed as a follow-up issue.

## 8. Edge-case matrix

| #       | Edge case                                                                                        | Expected behavior                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| E1      | `albumId` + `isInAlbum`/`isNotInAlbum` both present                                              | Codec drops `album=has\|none`; `albumId` wins (mirrors server)                                        |
| E2      | Asset viewer open on a **shared link**                                                           | No filter affordances rendered at all (no `/photos` to reach)                                         |
| E3      | Filter clicked from `/favorites`, `/archive`, `/trash`, `/folders`, `/memories`, person/tag page | Falls back to `/photos` with the filter applied                                                       |
| E4      | Person clicked inside a **Space**                                                                | Patch must carry the **scoped** token (`space-person:<uuid>`), not a bare uuid                        |
| E5      | Already on `/photos`                                                                             | 🔍 "search everywhere" icon is hidden (would duplicate the primary click)                             |
| E6      | Asset has no EXIF                                                                                | Camera/lens/location rows absent — nothing to click                                                   |
| E7      | Empty / whitespace-only metadata value (`make: ''`)                                              | Not rendered as clickable; no filter emitted                                                          |
| E8      | Non-owner viewing an asset in a Space                                                            | Can filter; **cannot** edit (✏️ stays owner-gated as today)                                           |
| E9      | `albumId` filter param on the album page itself                                                  | Ignored (redundant with the route); the ⚗️ icon is not offered for the album you are already in       |
| E10     | Location pin (🗺️) from within a Space                                                            | Map URL carries `spaceId` **and** the active filters, centered on the asset                           |
| E11     | `Route.map` uses a **hash** (`#zoom/lat/lng`), not query params                                  | Pin link must combine hash **and** query string correctly                                             |
| E12     | Metadata value with URL-special characters (`/`, `+`, `&` in a lens name)                        | Round-trips through `URLSearchParams` intact                                                          |
| E13     | Very long description used as a filter                                                           | Truncate the emitted `description` param to 200 chars to bound URL length                             |
| E14     | Date filter across a timezone boundary                                                           | Uses the asset's **local** date as displayed; no UTC re-bucketing                                     |
| E15     | Rating filter                                                                                    | Server is `>= N`; chip label must read "≥ N stars", not "N stars"                                     |
| E16     | Existing `/photos` + `/spaces` behavior                                                          | **Unchanged** — codec extraction is a pure refactor (regression-tested)                               |
| **E17** | **Space viewer** (non-owner) filters by camera/lens/state                                        | Sees matching assets **owned by other members**. The #655 bug class — must not re-scope to the viewer |
| **E18** | **Space editor** (non-owner) filters by camera/lens/state                                        | Same as E17                                                                                           |
| **E19** | Camera/lens/state **suggestions** inside a Space                                                 | Include values drawn from **non-owned** assets (`applySuggestionScope:1257-1274`)                     |
| **E20** | `owner=<user who is not a member of this space>`                                                 | Returns **empty**. Narrows, never widens. No leak                                                     |
| **E21** | `/photos?owner=<stranger>`                                                                       | Returns **empty** (owner-scope `AND` stranger = ∅). No leak                                           |
| E22     | **Album viewer** filters by camera on an album owned by someone else                             | Sees the album owner's matching assets (the `:1217-1253` participant branch)                          |

## 9. BDD scenarios

### Contextual filtering

```gherkin
Scenario: Filter a Space by camera from the asset viewer
  Given I am viewing an asset inside Space "Fotos Berlin"
    And the asset was taken with an "Apple iPhone 17 Pro Max"
  When I click the camera value in the info panel
  Then the asset viewer closes
    And I land on the Space timeline
    And the URL contains "make=Apple" and "model=iPhone 17 Pro Max"
    And only assets from that camera in that Space are shown
    And a removable "camera" chip is shown in the active-filters bar

Scenario: Filter an Album by tag from the asset viewer
  Given I am viewing an asset inside Album "Holiday"
    And the asset is tagged "beach"
  When I click the "beach" tag chip
  Then I land on the Album timeline filtered to tag "beach"
    And the URL contains "tags=<beachId>"

Scenario: Contextual filters merge rather than replace
  Given I am on the Space timeline filtered to person "Anna"
    And I open an asset and click its camera value
  Then both the person filter AND the camera filter are active

Scenario: Search everywhere escapes the current context
  Given I am viewing an asset inside Space "Fotos Berlin"
  When I click the 🔍 icon on the camera row
  Then I land on /photos filtered by that camera, not on the Space

Scenario: The search-everywhere icon is hidden where it is redundant
  Given I am viewing an asset opened from /photos
  Then the camera row shows no 🔍 icon

Scenario: Fallback from a non-filterable context
  Given I am viewing an asset opened from /favorites
  When I click the camera value
  Then I land on /photos filtered by that camera

Scenario: Shared links expose no filter affordances
  Given I am viewing an asset via a shared link
  Then no metadata value in the info panel is clickable as a filter

Scenario: Person filters inside a Space use the scoped token
  Given I am viewing an asset inside a Space
  When I click a person chip
  Then the emitted filter uses the "space-person:<uuid>" scoped token
```

### Location row (separating value / map / edit)

```gherkin
Scenario: Clicking the city filters the current context
  Given I am viewing an asset located in Berlin, Germany, inside a Space
  When I click "Berlin"
  Then I land on the Space timeline filtered to city=Berlin and country=Germany

Scenario: The map pin opens the map, carrying context and filters
  Given I am viewing an asset in a Space, with a person filter active
  When I click the 🗺️ pin icon on the location row
  Then I land on /map centered on the asset's coordinates
    And the map URL carries the spaceId AND the active person filter

Scenario: The pencil still edits the location
  Given I own the asset
  When I click the ✏️ icon on the location row
  Then the geolocation picker modal opens

Scenario: Non-owners cannot edit but can filter
  Given I do NOT own the asset
  Then the ✏️ icon is not shown
    And clicking "Berlin" still filters the current context
```

### Inverted rows

```gherkin
Scenario: Rating stars still set the rating
  Given I own the asset
  When I click the 4th star
  Then the asset's rating is set to 4 (unchanged behavior)

Scenario: The rating filter icon filters by rating
  When I click the ⚗️ icon on the rating row
  Then the current context is filtered to rating >= the asset's rating
    And the chip reads "≥ 4 stars"

Scenario: Album cards still navigate
  Given the asset appears in album "Holiday"
  When I click the "Holiday" card
  Then I open the Holiday album (unchanged behavior)
  But when I click the ⚗️ icon on that card
  Then the current context is filtered to albumId=<Holiday>
```

### #767 — map

```gherkin
Scenario: Structured filters carry from a Space to the map
  Given I am on Space "Fotos Berlin" filtered to make=Apple
  When I click the map icon in the top bar
  Then the map shows only geotagged assets in that Space with make=Apple
    And the map URL carries spaceId and make=Apple

Scenario: The map is honest about smart search it cannot apply
  Given I am on a Space with an active smart search "?q=ski"
  When I click the map icon
  Then the map applies every structured filter
    And an explicit notice states the smart-search term is not applied on the map
    And the map does NOT silently render the entire library

Scenario: Map filters round-trip through the URL
  Given I open /map?spaceId=X&make=Apple directly
  Then the map's filter panel shows the camera filter as active
```

### RBAC (§4.4) — the highest-risk scenarios

```gherkin
Scenario: A Space viewer filters by a camera they do not own
  Given Space "Fotos Berlin" contains assets owned by Anna and by Ben
    And Anna's assets were taken with an "Apple iPhone 17 Pro Max"
    And I am a VIEWER of the Space, and I own none of Anna's assets
  When I open one of Anna's assets and click its camera value
  Then the Space timeline is filtered to make=Apple, model=iPhone 17 Pro Max
    And Anna's matching assets ARE shown
    And the result set is NOT re-scoped to assets I own
    # This is the issue #655 bug class — see search.repository.ts:1210-1213

Scenario: A Space editor filters by lens they do not own
  Given I am an EDITOR of a Space containing another member's assets
  When I filter by that member's lens model
  Then their matching assets are shown

Scenario: Camera suggestions in a Space include other members' cameras
  Given a Space contains assets from Anna's iPhone and Ben's Canon
    And I am a viewer who owns neither
  When I open the Space's camera filter dropdown
  Then both "Apple" and "Canon" are suggested
    # applySuggestionScope:1257-1274 — the spaceId branch carries NO ownerId predicate

Scenario: The owner filter narrows but never widens — Space
  Given I am a member of Space "Fotos Berlin"
  When I filter that Space by owner=<Anna>
  Then I see exactly Anna's contributions to that Space
    And I see nothing of Anna's that is outside the Space

Scenario: The owner filter cannot leak a stranger's library
  Given "Carol" is not a member of any Space I belong to
  When I request /photos?owner=<Carol>
  Then the result is EMPTY
    And no asset of Carol's is disclosed

Scenario: An album viewer filters by the album owner's camera
  Given an album shared with me, owned by Anna, containing Anna's assets
  When I filter that album by Anna's camera
  Then Anna's matching assets are shown
```

### Regression

```gherkin
Scenario: Existing photos/spaces filtering is unchanged
  Given the filter codec has been extracted into filter-url.ts
  Then every existing /photos and /spaces filter behavior is byte-identical
```

## 10. Slices

Each slice is independently shippable and test-first. **Write the failing test, then the code.**

---

### Slice 1 — Server: `lensModel`, `state`, `ownerId`

**Files:** `server/src/dtos/time-bucket.dto.ts`, `server/src/repositories/asset.repository.ts`

1. **RED** — unit tests in `asset.repository.spec.ts` (or the medium suite) asserting the generated
   SQL / result set for `lensModel`, `state`, and `ownerId`.
2. **GREEN** —
   - Add the three fields to `TimeBucketQueryBaseSchema` and `TimeBucketOptions`.
   - In `withTimeBucketAssetFilters`: extend the `asset_exif` inner-join `$if` predicate (`:267-274`)
     to include `lensModel` and `state`; add exact-match `=` conditions alongside `make`/`model`.
   - Add `ownerId` as a **separate** top-level condition: `.$if(!!options.ownerId, qb => qb.where('asset.ownerId','=', asUuid(options.ownerId!)))`.
     **Do not** route it through `userIds` (§4.2).
3. **RBAC medium tests — the highest-value tests in this spec (§4.4).** These require a
   **two-owner Space fixture** (Anna + Ben both contributing to one Space, viewer owns neither).
   A single-owner fixture passes vacuously and would hide both the #655 bug class and the
   `ownerId`/`userIds` trap:
   - E17/E18: a Space **viewer** and **editor** filtering by `make`/`model`/`lensModel`/`state` see
     the **other owner's** matching assets.
   - E19: suggestions inside the Space surface the other owner's camera values.
   - E20: `ownerId=<non-member>` inside a Space → empty.
   - E21: `/photos?ownerId=<stranger>` → empty (no leak).
   - E22: album viewer filtering by the album owner's camera sees their assets.
4. `pnpm build && pnpm sync:open-api && make open-api`.

**Done when:** timeline queries honor the three new fields; **non-owners can filter assets they do
not own inside a Space**; `ownerId` provably narrows and never widens; SDK regenerated; no migration
added.

---

### Slice 2 — Web: shared filter-URL codec + `resolveFilterTarget` (pure, no UI)

**Files:** `web/src/lib/utils/filter-url.ts` (new), `web/src/lib/utils/filter-target.ts` (new),
`web/src/lib/components/filter-panel/filter-panel.ts`, `web/src/lib/utils/searchable-page-search.ts`

1. **RED** — exhaustive unit tests: encode/decode round-trip for every param; E1, E7, E12, E13, E16.
2. **GREEN** — extract the codec; add `lens`/`state`/`albumId`/`owner`; add the four `FilterState`
   fields; update `createFilterState`, `clearFilters`, `getActiveFilterCount`.
3. `resolveFilterTarget(url)` + tests for photos / space / album / map / asset-viewer URLs (with
   `assetId` present) / `null` cases (E3).
4. `buildContextualFilterUrl(url, patch, opts)` + tests for merge semantics, `global`, `at`-stripping
   (E5, and the merge scenario).

**Done when:** the pure layer is fully covered and `/photos` + `/spaces` still behave identically.

---

### Slice 3 — Web: album page becomes URL-backed

**Files:** `albums/[albumId=id]/[[photos=photos]]/[[assetId=id]]/+page.svelte`

Mirror the photos page loop: hydrate `albumFilters` from the URL on load, `syncFilterUrl` on change,
and a `$effect` reacting to URL changes (`photos/…/+page.svelte:434-452`, `:506-534`).

**Done when:** an album's filters survive reload, back/forward, and a shared link to the URL. E9.

---

### Slice 4 — Web: map page becomes URL-backed + space map link carries filters (#767 a+b)

**Files:** `map/…/+page.svelte`, `web/src/lib/components/spaces/space-map.svelte`,
`web/src/lib/components/album-page/AlbumMap.svelte`

1. **RED** — test that `/map?spaceId=X&make=Apple` hydrates the camera filter; test that the space
   map link carries active filters.
2. **GREEN** — hydrate map `filters` from the URL codec (replacing the always-empty
   `createFilterState()` at `:72`); build `space-map.svelte`'s `mapUrl` from live filter state
   instead of the hardcoded `/map?spaceId=<id>`.

**Done when:** #767 (a) and (b) are fixed. E10, E11.

---

### Slice 5 — Web: honest `q` handling on the map (#767 c)

When `q` is present on `/map`, render an explicit notice that the smart-search term is not applied,
while still applying every structured filter. New i18n key in `i18n/en.json` **only** (other locales
fall back).

**Done when:** the reporter's `?q=ski` repro shows filtered results + a clear explanation, never a
silent full library.

---

### Slice 6 — Web: active-filter chips for the new dimensions

**Files:** `web/src/lib/components/filter-panel/active-filters-bar.svelte`,
`web/src/lib/utils/photos-filter-options.ts` (`handlePhotosRemoveFilter`)

- New chips: `lens`, `albumId`, `owner`. **`state` folds into the existing `location` chip**, which
  already clears `city` + `country` together — it now clears all three (matching how the `camera`
  chip clears `make` + `model`).
- Name resolution: album and owner chips need display names — follow the existing
  `personNames` / `tagNames` map pattern.
- Rating chip label must read **"≥ N stars"** (E15).

---

### Slice 7 — Web: the DetailPanel grammar (3 sub-slices)

**7a — Camera + lens.** Replace both `Route.search(...)` links (`DetailPanel.svelte:225,259`) with
value→filter + 🔍 global. Hide 🔍 on `/photos` (E5).

**7b — Location.** Rewrite `DetailPanelLocation.svelte`: the row is currently a single `<button>`
wrapping both value and pencil. Split into three clickable value lines (city/state/country) + a 🗺️
pin + an owner-gated ✏️. E8, E10.

**7c — Date, filename, tags, people, shared-by, and the three inverted rows** (rating, description,
appears-in). Basename-without-extension for filename; local date for the date row (E14).

Component tests per row: correct patch emitted, correct target URL, owner vs non-owner, shared-link
suppression (E2).

---

### Slice 8 — e2e (Playwright)

Against the `make e2e` stack on **:2285** (not the dev :2283 stack):

- Space → open asset → click camera → space timeline filtered, chip present.
- Album → same.
- `/photos` → same, and no 🔍 icon.
- Location pin → `/map` centered, carrying `spaceId`.
- Space with a filter → map icon → filtered map (#767).
- **RBAC (E17):** as a Space **viewer**, open an asset owned by **another member**, click its camera
  value → that member's assets are shown. This is the end-to-end proof of §4.4 and the one e2e case
  that must not be dropped for time.

## 11. Testing strategy

- **TDD throughout.** Every slice starts with a failing test.
- **The pure layer (Slice 2) carries the edge-case burden** — codec, target resolution and URL merge
  are plain functions, so E1/E3/E5/E7/E12/E13/E16 are cheap unit tests rather than component tests.
- **RBAC (§4.4) is the highest-risk area and gets the most rigorous coverage** — medium tests in
  Slice 1 (E17–E22) plus one e2e in Slice 8. Both **require a two-owner Space fixture**; with a
  single owner every RBAC assertion passes vacuously and the #655 bug class stays invisible.
- **Regression:** `/photos` and `/spaces` behavior must be byte-identical after the codec extraction.

## 12. Verification gates

- Server: `cd server && pnpm test`, `pnpm test:medium`, `make check-server`, `make lint-server`
  (**zero warnings** — server only).
- Web: `cd web && pnpm check:typescript && pnpm lint` (web lint has **no** `--max-warnings 0`;
  the ~650 pre-existing `better-tailwindcss` warnings are expected and must not be "fixed" here).
  Note `check:svelte` reports 0 files locally — rely on CI Lint/Test Web.
- E2E: `make e2e-web-dev` / the `:2285` stack.
- OpenAPI: `make open-api` after Slice 1; commit the regenerated SDK + Dart client.

## 13. Risks

| Risk                                                                                     | Mitigation                                                                                   |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Non-owners silently get empty results when filtering in a Space (the #655 bug class)** | §4.4; E17–E22 medium tests + an e2e, all on a **two-owner Space fixture**                    |
| **`ownerId` widens instead of narrows → data leak**                                      | §4.4; `ownerId` is a plain AND inside the existing scope; E20/E21 assert empty for strangers |
| Codec extraction silently changes `/photos`/`/spaces` behavior                           | Slice 2 is a pure refactor with round-trip regression tests before any new param is added    |
| `ownerId` accidentally wired through `userIds`                                           | §4.2 documented; medium test with a ≥2-owner space                                           |
| Album/map URL-backing introduces navigation loops (`goto` → `$effect` → `goto`)          | Copy the photos page's `lastHandledSearchState` token guard verbatim (`:508-513`)            |
| Icon clutter in the location row (pin + pencil)                                          | Accepted; validated against the mockup                                                       |
| Users expect album cards to navigate                                                     | Kept as an exception (§6)                                                                    |

## 14. Follow-ups (explicitly out of scope)

1. Smart-search (`q`) support on `/map/markers` — the remaining half of #767.
2. Filter-panel dropdowns + suggestion endpoints for `lens` / `state`.
3. Mobile (Flutter) asset-viewer parity.
4. Retiring the `/search` page itself.
