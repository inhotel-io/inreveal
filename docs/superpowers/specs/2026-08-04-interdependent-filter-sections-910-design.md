# Do not offer unusable filters — interdependent filter sections (#910)

- **Issue:** [#910](https://github.com/open-noodle/gallery/issues/910) — "Do not offer unusable/unnecessary filters"
- **Reported on:** Gallery 5.2.2
- **Branch:** `fix/910-interdependent-filter-sections`
- **Status:** ready for `/impl-loop`

---

## 1. Goal

A filter section must not be offered when using it cannot change what the user sees. The reporter's
words:

> The filters on the left side are always displayed, even though filtering would lead into zero
> results. [...] do not offer filtering and hide the complete section:
>
> - for media types if there isn't at least one photo of each type
> - for favorites if there are no photos favorized
> - for rating if there are no photos with a rating
> - ... and so on

After this change, every filter section on web and mobile derives its own usability from the same
faceted data the panel already fetches, and either hides or greys itself out accordingly.

## 2. Decisions taken

Four product decisions were settled before design. They are recorded here because the work sits on top
of two earlier deliberate decisions — §2.4 keeps one, §4.2 supersedes the other — and a future reader
needs to know which is which, and why.

### 2.1 Hide structural, grey transient

A section that is empty **for the whole scope regardless of filters** is hidden outright. A section
that is empty **only because of the filters the user currently has applied** keeps today's treatment:
50% opacity, a `(0)` suffix, collapsed and disabled (`filter-section.svelte:21-36`).

Rejected: hiding in both cases (sections would pop in and out on every filter change, and the
section-toggle row would shift under the cursor); greying in both cases (does not do what the issue
asks — the unusable section is still listed).

### 2.2 All eight enumerable sections, not just the four always-on ones

Rating, Media, Favorites and Albums are the sections named in the issue, but People, Location, Camera
and Tags are equally unusable on a library with no faces, no GPS, no EXIF or no tags. All eight take
the rule. Timeline and Text are exempt (§4.3).

### 2.3 Web **and** mobile

Mobile's filter sheet consumes the same `/search/filter-suggestions` endpoint
(`mobile/lib/providers/photos_filter/filter_suggestions.provider.dart`) and has the same
always-visible sections. Both clients change in this spec so they cannot drift.

### 2.4 What this does **not** reverse: no per-star or per-button dimming

`filter-panel.svelte:160-164` discards the `ratings` and `mediaTypes` the server already sends:

> Note: availableRatings and availableMediaTypes are intentionally NOT set from suggestionsProvider.
> Hiding rating stars and media type buttons based on the current result set is too aggressive — it
> breaks existing E2E tests and confuses users who expect these fixed options to always be visible.

That is a **standing decision**, not an incidental comment — recorded in
`feedback_no_dynamic_rating_media_hiding` and load-bearing on `rating_stars_section.widget.dart`,
which cites it. Its three grounds still hold:

1. **A real bug (PR #261).** Filtering `visibleStars` by `availableRatings` made the stars positional
   liars: with `[1, 2, 3, 5]` available, clicking the fourth visible star selected rating 5. Stars
   derive their meaning from position, unlike labelled values such as countries or tags.
2. **It breaks e2e.** Suites click `rating-star-5` and `media-type-video` directly; hidden elements
   time out.
3. **Dimming specifically was rejected too**, not only hiding.

**#910 does not require reversing any of it.** The issue is about _sections_ — "hide the complete
section" — not about individual stars and buttons. This spec therefore reads `ratings` and
`mediaTypes` **only** to decide section availability, and never assigns `availableRatings` /
`availableMediaTypes`. All five stars keep rendering uniformly whenever the Rating section renders at
all; all three media buttons keep rendering whenever Media does.

A useful corollary: because the props stay unset, the latent `>=` mismatch inside
`rating-filter.svelte:27` stays dead. The rating filter is a **minimum**
(`asset.repository.ts:309`, `database.ts:897` via `ratingIsMinimum`), so `!availableRatings.includes(star)`
would have dimmed star 1 on a library whose only rated assets are 2-star — a fourth reason the
standing decision is the right one. §6.2 leaves that code untouched and documents why.

**The #858 §3.3 carve-out** (`filter-panel.svelte:92`) excludes `country`, `city`, `make`, `model`
and `mediaType` from `filterContext` so that a section-local filter cannot grey out its own section.
It stops applying on every production surface — see §4.2 — while remaining in force on the legacy
path it was written for. This is the one prior decision the spec does supersede, and only because the
condition that motivated it becomes structurally impossible (§4.2).

## 3. Current state

The interdependency machinery exists and is half-wired. `getFilterSuggestions`
(`search.repository.ts:1254-1273`) already computes every facet **with that facet's own filter
excluded**:

```ts
const [countries, cameraMakes, tags, peopleResult, ratings, mediaTypes] = await Promise.all([
  this.getFilteredCountries(userIds, without(options, 'country', 'city')),
  this.getFilteredCameraMakes(userIds, without(options, 'make', 'model')),
  this.getFilteredTags(userIds, without(options, 'tagIds')),
  this.getFilteredPeople(userIds, without(options, 'personIds', 'identityIds')),
  this.getFilteredRatings(userIds, without(options, 'rating')),
  this.getFilteredMediaTypes(userIds, without(options, 'mediaType')),
]);
```

| Section   | Narrowed by the other filters?                         | Disabled when it would yield 0?               |
| --------- | ------------------------------------------------------ | --------------------------------------------- |
| timeline  | yes — timeline-manager buckets, or smart-search facets | never                                         |
| people    | yes                                                    | only while a _cross-section_ filter is active |
| location  | yes                                                    | only while a _cross-section_ filter is active |
| camera    | yes                                                    | only while a _cross-section_ filter is active |
| tags      | yes                                                    | only while a _cross-section_ filter is active |
| rating    | **no** — server sends `ratings`, client discards it    | never                                         |
| media     | **no** — server sends `mediaTypes`, client discards it | never                                         |
| favorites | **no** — no facet exists                               | never                                         |
| albums    | **no** — no facet exists                               | never                                         |
| text      | n/a — free text, no enumerable domain                  | never                                         |

Two gaps, then: four sections whose facet is computed but ignored or missing, and a disable gate
(`filter-panel.svelte:761-771`) that only fires when `filterContext` is truthy — so a library with
zero tags shows a fully-enabled, permanently empty Tags section.

## 4. The availability model

### 4.1 One signal, two verdicts

Each section resolves against its own facet under two filter states:

| Facet under **current** filters | Facet under **no** filters (baseline) | Verdict                                                  |
| ------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| non-empty                       | —                                     | `available` — render normally                            |
| empty                           | non-empty                             | `empty` — `(0)`, collapsed, disabled (today's grey)      |
| empty                           | empty                                 | `unavailable` — section and its toggle icon not rendered |

### 4.2 Two panel paths, and what happens to the #858 carve-out

`FilterPanel` has two data paths. The **suggestions path** (`config.suggestionsProvider` set) fetches
one faceted response per filter change. The **legacy providers path** (`config.providers` only) fires
per-dimension fetches and has no `ratings` / `mediaTypes` / favourites / albums data at all.

**Every production surface sets `suggestionsProvider`** — verified across all six mount sites in §6.4.
The legacy path survives only as the fallback that the panel's own unit tests exercise.

Availability therefore applies **on the suggestions path only**. On the legacy path the panel keeps
today's behaviour byte for byte, including `filterContext` and the #858 §3.3 carve-out, and including
the test that locks it (`filter-panel.spec.ts:403`, which must stay green untouched).

On the suggestions path the carve-out is moot rather than removed. It exists because `filterContext`
was a proxy for "did something narrow the panel?", so a section-local filter — a selected camera make
— would have made Camera grey itself out. That is structurally impossible under the new gate: each
verdict reads the facet the **server already computed with that section's own filter excluded**, so
selecting a make cannot empty the makes facet. The gate becomes facet length directly.

`filterContext` (`filter-panel.svelte:92`) is **not** deleted: `filter-panel.svelte:761` is its only
consumer, and that consumer still exists for the legacy path. Removing the legacy path altogether
would mean deleting four mount effects, the temporal re-fetch effect and a large share of the panel's
test suite — a refactor #910 does not justify.

### 4.3 Per-section rules

| Section   | Facet consulted                           | `unavailable` when                              |
| --------- | ----------------------------------------- | ----------------------------------------------- |
| people    | `people`, `hasUnnamedPeople`              | `people` empty **and** `hasUnnamedPeople` false |
| location  | `countries`                               | `countries` empty                               |
| camera    | `cameraMakes`                             | `cameraMakes` empty                             |
| tags      | `tags`                                    | `tags` empty                                    |
| rating    | `ratings`                                 | `ratings` empty                                 |
| media     | `mediaTypes`                              | `mediaTypes.length < 2`                         |
| favorites | `hasFavorites`                            | `hasFavorites` false                            |
| albums    | `hasAssetsInAlbum`, `hasAssetsNotInAlbum` | either is false                                 |
| timeline  | `timeBuckets`                             | never — greys when `timeBuckets` empty          |
| text      | none                                      | never                                           |

Notes on the three non-obvious rows:

- **media** uses `< 2`, not "empty". The section offers All / Photos / Videos; with only images
  present, _Photos_ is identical to _All_ and _Videos_ is empty, so the control cannot discriminate.
- **albums** needs both booleans for the same reason. With no albums, _Has album_ → 0 and _Has no
  album_ → everything; with a fully-filed library, the reverse.
- **favorites** takes one boolean, deliberately asymmetric with albums. "Nothing favourited" is the
  common state worth detecting. "Everything favourited" is not a state real libraries reach, and
  hiding the section for it would be more surprising than the degenerate control.

**people** keeps the carve-out because `PeopleFilter`'s empty state renders
`$t('filter_name_people_hint')` when `hasUnnamedPeople` is true (`filter-panel.svelte:790`) — the
discoverability path to making the filter useful at all. Hiding the section would remove the only
prompt to name a face.

**timeline** never hides. Its bucket list is the page's own data rather than a server facet, and it is
the one section whose emptiness means "this page has no assets" rather than "this control is
useless" — a state the surfaces already handle with the panel's `hidden` prop (photos `:609`,
recently-added `:509`, spaces `:829`, albums `:523`/`:535`, space-albums `:349`/`:527`; the map passes
no `hidden` and simply greys).

### 4.3.1 Section-level only — the facets never reach the controls

`ratings` and `mediaTypes` feed `getSectionAvailability` and nothing else. Per §2.4,
`availableRatings` and `availableMediaTypes` stay unset, so:

- whenever the Rating section renders, all five stars render uniformly;
- whenever the Media section renders, all three buttons render;
- `rating-filter.svelte` and `media-type-filter.svelte` are not modified by this work at all.

The section rules remain sound without the controls participating. `ratings: []` means no
`rating >= N` can match for any N, so the whole section is dead. `mediaTypes.length < 2` means the
one present type is a synonym for _All_ and the other button is empty, so the control cannot
discriminate. Both verdicts are about the section, which is exactly what #910 asks about.

### 4.4 Three overriding rules

1. **A section with an active filter is never `unavailable` and never `empty`.** Cross-section
   narrowing can empty a facet whose own filter is set — person X plus rating 5, where X has no rated
   photos, empties the ratings facet while `rating: 5` is applied. Greying Rating there would trap the
   user with a filter they cannot reach to clear. `hasActiveFilter(section)`
   (`filter-panel.svelte:621-659`) already exists and is the guard.
2. **Availability is never persisted.** §6.3.
3. **A section absent from `config.sections` is untouched** — album detail's documented omission of
   `albums` (`filter-section-parity.spec.ts`) is unrelated and stays.

### 4.5 Where the baseline comes from

Client-side, cached per panel instance:

- The panel's mount effect (`filter-panel.svelte:100-184`) already fires one request. When
  `getActiveFilterCount(filters) === 0`, that response **is** the baseline — captured for free.
- When the panel mounts with filters already applied (a deep link such as `/photos?rating=5`, or
  restored space filters), one extra `suggestionsProvider(createFilterState())` call fires alongside.
- The baseline is held for the component's lifetime.

Rejected: a server-side `scopeFacets` block returned with every response. It adds ~8 `EXISTS`
subqueries to every suggestions request, including the debounced refetch that fires on each filter
tweak, to answer a question whose answer changes when the library changes. The expensive path is the
one that repeats.

#### The `{#key}` invariant this depends on

"Component lifetime is the cache scope" is only true because every surface already remounts the panel
whenever its **non-filter** scope changes — the album, the space, or the committed smart-search query,
none of which the panel can see:

| Surface        | `{#key}` expression                                                                           |
| -------------- | --------------------------------------------------------------------------------------------- |
| photos         | `showSearchResults ? \`photos-search-${committedQuery}:${$lang}\` : 'photos-browse'` (`:600`) |
| spaces         | `` `${space.id}:${showSearchResults ? …search… : 'spaces-browse'}` `` (`:822`)                |
| recently-added | `showSearchResults ? \`recently-added-search-…\` : 'recently-added-browse'` (`:501`)          |
| albums         | `` `picker-${album.id}` `` / `` `album-${album.id}` `` (`:517`, `:527`)                       |
| space-albums   | `` `space-album-${album.id}` `` / `` `space-album-picker-${album.id}` `` (`:341`, `:521`)     |
| map            | no query mode; route change remounts                                                          |

This is load-bearing and invisible: deleting a `{#key}` in a later refactor would leave a stale
baseline behind with no compile error and no failing test. §8.3 adds a guard.

Even a stale baseline fails safe, which is why no `scopeKey` prop is needed. A committed query can
only **narrow** the scope, so `facet(query) ⊆ facet(browse)`. Hiding requires _both_ the current and
the baseline facet to be empty; a baseline from a wider scope can therefore only fail to hide, never
hide wrongly. The same argument covers the `withSharedSpaces` coupling in §4.6.

### 4.6 Degenerate inputs that must not read as "structurally empty"

An all-empty facet response is currently produced by three paths that do **not** mean "this scope has
none of these". Each has to be handled or the panel will hide every section at once.

**A failed facet fetch returns an empty sentinel.** All three query-mode surfaces resolve their
provider with `emptyFilterSuggestions()` — every array empty, `hasUnnamedPeople: false` — when the
smart-facets request fails or is aborted:

- `photos/…/+page.svelte:271-273`
- `spaces/[spaceId]/…/+page.svelte:305-307`
- `recently-added/…/+page.svelte:266-269`

Today that renders empty pickers, which is harmless. Under this model it is indistinguishable from a
genuinely empty scope and would hide **every** section. The `baseline === undefined` safeguard in §6.1
does not catch it, because the sentinel is a defined object.

**Fix:** the sentinel becomes a rejection. Each of the three sites throws instead of returning
`emptyFilterSuggestions()`, so the panel's existing `.catch` (`filter-panel.svelte:167-171`) runs and
neither `current` nor `baseline` is overwritten — the panel keeps showing the last good facets, which
is also better behaviour than blanking the pickers. `emptyFilterSuggestions()` is then deleted from
all three surfaces. This belongs to slice 4, not to slice 5: the gating is unsafe until it lands.

**`forceEmptyResult` deliberately empties everything.** `buildFilteredAssetIds` honours it
(`search.repository.ts:1402`); `SearchService.getSearchSuggestions` sets it when a scoped person token
is inaccessible (#858 §2.1). Every facet then comes back empty **for the current filters only** — the
baseline, built from an empty filter state, carries no person token and is unaffected. The sections
grey rather than hide, which is the correct outcome. Needs a test, not a code change.

**Favourites narrows the scope, not just the filter.** The photos page couples `withSharedSpaces` to
the favourites filter (`:200`, `:230`, `:282`, `:289`) because favourites are per-user (#763): with
`isFavorite` set, suggestions are computed over own+partner assets only, while the baseline (no
filters) includes shared spaces. Current and baseline therefore span different scopes. By the subset
argument above this can only produce a grey where a hide might have been justified — never a wrong
hide. Documented and tested, not changed.

## 5. Server

### 5.1 New facets

Three booleans on both `FilterSuggestionsResponseSchema` (`search.dto.ts:248`) and
`SmartSearchFacetsResponseSchema` (`search.dto.ts:260`), and on the matching
`FilterSuggestionsResult` / `SmartSearchFacetsResult` interfaces:

```ts
hasFavorites: boolean; // ignores isFavorite
hasAssetsInAlbum: boolean; // ─ both ignore isInAlbum / isNotInAlbum
hasAssetsNotInAlbum: boolean; // ─
```

### 5.2 Browse path — mechanical

Three more entries in `getFilterSuggestions`' `Promise.all`, reusing `buildFilteredAssetIds`
(`search.repository.ts:1385-1457`):

```ts
this.getFilteredHasFavorites(userIds, without(options, 'isFavorite')),
this.getFilteredAlbumMembership(userIds, without(options, 'isInAlbum', 'isNotInAlbum')),
```

Each probe is shaped `select exists(select 1 from asset where id in (<filteredIds>) and <predicate>)`
so Postgres short-circuits on the first matching row instead of aggregating the filtered set.
`getFilteredAlbumMembership` issues two such probes and returns both booleans.

`@GenerateSqlQueries`' `sortQueries` list (`search.repository.ts:1245-1252`) gains the new prefixes.

**No album-scope special case.** Inside album detail the probes naturally return
`hasAssetsInAlbum: true, hasAssetsNotInAlbum: false`, hiding the section by the ordinary rule — the
same outcome `asset.repository.ts`'s `&& !options.albumId` guards already produce, reached without a
branch.

### 5.3 Smart-search path — one structural change

Smart-search facets read a per-transaction temp table, `smart_search_facet_candidates`
(`search.repository.ts:628-637`). Only predicates applied **outside** that table, in
`buildSmartFacetFilteredAssetIds` (`search.repository.ts:639-709`), can be excluded per-facet.

- `isFavorite` is already in the candidate query's `without(...)` list
  (`search.repository.ts:597-616`) and re-applied at `search.repository.ts:666` — but
  **unconditionally**, with no `exclude` guard. Adding `exclude !== 'favorites'` is a one-line change
  and also corrects a latent asymmetry: every other dimension there is guarded.
- `isInAlbum` / `isNotInAlbum` are **not** in that list, so they bake into the temp table and cannot
  be excluded. They move into `without(...)` and get re-applied in `buildSmartFacetFilteredAssetIds`
  behind `exclude !== 'albums'`, mirroring exactly how favourites already works.

`SmartFacetExclude` (`search.repository.ts:187-188`) gains `'favorites' | 'albums'`.

**Cost.** The candidate table is no longer pruned by album membership, so each facet query filters it
instead. This is the same trade already accepted for favourites and for every other excludable
dimension; the album predicate is an `EXISTS` over `album_asset`, cheap per row.

### 5.4 Ripple

`make sql` to regenerate `server/src/queries/search.repository.sql` — **requires a running database;
it deletes every query file otherwise** — then `pnpm build`, `pnpm sync:open-api`, and `make open-api`
for the TypeScript SDK and the Dart client (Java required).

## 6. Web

### 6.1 A pure rule module

New `web/src/lib/components/filter-panel/filter-availability.ts`:

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

No component, no DOM, no fetch. The whole of §4.3 and §4.4 is data in, verdict out — which is what
makes the TDD loop in §8.2 cheap and exhaustive. `baseline === undefined` (still in flight, or the
extra request failed) resolves to `available` or `empty`, never `unavailable`: a section is never
hidden on missing information.

The module is only consulted on the suggestions path (§4.2). The legacy path never captures a
baseline and never calls it.

### 6.2 Panel wiring

`filter-panel.svelte`:

- Capture the whole response into `currentSuggestions`, and `baseline` per §4.5. `ratings` and
  `mediaTypes` reach `getSectionAvailability` through that object.
- **Leave `availableRatings` and `availableMediaTypes` unset**, and leave the
  `filter-panel.svelte:160-164` comment in place with a pointer to §2.4 — it records a standing
  decision this spec does not overturn. Do not "tidy" it away.
- Derive `availability` per section and gate **both** the render loop (`filter-panel.svelte:753`) and
  the section-toggle icon row (`filter-panel.svelte:727`) on `!== 'unavailable'`.
- Feed `count = 0` on `'empty'`. The `filterContext ? … : undefined` ladder at
  `filter-panel.svelte:761-771` stays as the legacy-path branch:

  ```
  count = config.suggestionsProvider
    ? (availability(section) === 'empty' ? 0 : undefined)
    : <existing filterContext ladder, unchanged>
  ```

`filter-section.svelte` is unchanged — it already renders `(0)`, collapses and disables on
`count === 0`.

### 6.3 Availability is not user-hiding

`visibleSections` is a persisted per-browser ledger, `{ selected, known }` in `localStorage`.
Availability is derived state and **must never be written to it**. If it were, a section that goes
unavailable would be recorded as deliberately hidden and would not come back when the library gains
its first video. Two independent gates, ANDed at render:

```
rendered = visibleSections.has(section) && availability(section) !== 'unavailable'
```

The empty-state hint ("all sections hidden — show all") must count only sections that are
**available**, or a user whose available sections are all hidden gets no hint.

### 6.4 Surfaces

Six config/mapper sites forward the three new fields:

- `web/src/lib/utils/map-filter-config.ts`
- `web/src/lib/utils/album-filter-config.ts` (both builders)
- `web/src/lib/utils/recently-added-filter-config.ts`
- `web/src/lib/utils/space-search.ts` (`mapSmartSearchFacetsToFilterSuggestions`)
- `routes/(user)/photos/[[assetId=id]]/+page.svelte`
- `routes/(user)/spaces/[spaceId]/…/+page.svelte` and `routes/(user)/albums/[albumId=id]/…/+page.svelte`

Widening `FilterSuggestionsResponse` (`filter-panel.ts:80-90`) with three required booleans makes
`tsc` name every site that has not been updated — the compiler is the checklist.

The same slice removes `emptyFilterSuggestions()` from the three query-mode surfaces in favour of a
rejection, per §4.6. Note that `tsc` will **not** catch this one: the sentinel is a plain object
literal, so widening the type flags it as missing the new fields, and the tempting fix is to add
`hasFavorites: false` to it — which is precisely the bug. Delete it instead.

## 7. Mobile

Mobile's taxonomy differs, so the same rules land at a different granularity. Its sections
(`filter_section_id.dart`) are `people, places, tags, camera, when, rating, media, toggles` — no
`text`, and no standalone `favorites` or `albums`.

**Six sections take the section-level rule:** `people` (with the unnamed carve-out), `places`, `tags`,
`camera`, `rating`, `media`. `when` never hides, matching web's Timeline.

**`toggles` is gated per switch, not per section.** `toggles_section.widget.dart` renders four
independent switches — favourites, archived, not-in-album, untagged. Favourites gates on
`hasFavorites`; not-in-album gates on `hasAssetsNotInAlbum`. Archived and untagged have no facet and
stay on, so the section itself never hides.

**A prerequisite gap.** `filter_suggestions.provider.dart` forwards `isFavorite` but **not**
`isNotInAlbum`, although `SearchDisplayFilters` carries it (`search_filter.model.dart:182`). The
facets therefore ignore the not-in-album toggle today. Slice 7 forwards it; without that, the
albums facet would be computed against the wrong asset set.

Mobile has no `isInAlbum` ("has album") equivalent, so only `hasAssetsNotInAlbum` is consulted there.

**`hidden_sections.provider.dart`** is mobile's user ledger and takes the identical separation rule
from §6.3. `manage_sections_sheet.widget.dart` iterates `FilterSectionId.values` and must not offer a
switch for an unavailable section.

`rating_stars_section.widget.dart` and `media_type_section.widget.dart` are **not modified**. The
former's doc comment already cites `feedback_no_dynamic_rating_media_hiding` ("Always renders 5
stars"); §2.4 keeps that true on both clients. Mobile gates the `rating` and `media` sections as
wholes, exactly like web, and leaves their contents alone.

## 8. Test plan

TDD throughout: each slice writes the failing test first and records why it failed.

### 8.1 Server

Medium tests in `server/test/medium/specs/repositories/search.repository.spec.ts`, against a real
database:

| Case                                                    | Asserts                                                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| library with no favourites                              | `hasFavorites` false                                                                                              |
| library with one favourite                              | `hasFavorites` true                                                                                               |
| `isFavorite: true` applied                              | `hasFavorites` still true — own filter excluded                                                                   |
| favourite exists but only outside the active tag filter | `hasFavorites` false — other dimensions honoured                                                                  |
| no albums                                               | `hasAssetsInAlbum` false, `hasAssetsNotInAlbum` true                                                              |
| every asset filed                                       | `hasAssetsInAlbum` true, `hasAssetsNotInAlbum` false                                                              |
| mixed                                                   | both true                                                                                                         |
| `isNotInAlbum: true` applied                            | both unchanged — own filter excluded                                                                              |
| `albumId` scope                                         | `hasAssetsInAlbum` true, `hasAssetsNotInAlbum` false                                                              |
| smart-search path, each of the above                    | same verdicts via `getSmartSearchFacets`                                                                          |
| smart-search with `isFavorite` set                      | `hasFavorites` unaffected — regression guard for the `exclude !== 'favorites'` fix                                |
| smart-search with `isNotInAlbum` set                    | other facets (`ratings`, `tags`, …) still reflect it — proves the candidate-query move did not drop the predicate |
| `forceEmptyResult` set                                  | all three false — §4.6, so the client greys rather than hides                                                     |
| `withSharedSpaces` with a shared-space favourite        | `hasFavorites` true; false without the flag — locks the §4.6 scope coupling                                       |

The two rows above the last are the ones that fail loudest if the §5.3 candidate-query move is done
wrong: dropping the album predicate entirely makes the second pass trivially, so it must be paired
with an assertion that a **non**-album facet still reflects `isNotInAlbum`.

Plus unit-level fixture updates in `search.service.spec.ts` and `search.controller.spec.ts`.

### 8.2 Web — the rule module

Exhaustive table-driven tests over `getSectionAvailability`, one case per row of §4.3 × each verdict
of §4.1, plus:

- every override in §4.4 — active filter beats both `empty` and `unavailable`, for each of the eight
  sections
- `baseline === undefined` never yields `unavailable`
- `mediaTypes: ['IMAGE']` → `unavailable`; `['IMAGE', 'VIDEO']` → `available`
- `people: [], hasUnnamedPeople: true` → `available`; `hasUnnamedPeople: false` → `unavailable`
- `hasAssetsInAlbum: true, hasAssetsNotInAlbum: false` → `unavailable`, and the mirror
- timeline and text never `unavailable`, for any input

Separately, a guard that §2.4's standing decision survives this work — the panel must reach
`getSectionAvailability` without ever handing the facets to the controls:

- with `ratings: [2]` and the Rating section available, all five stars render and none carries the
  `opacity-50` dimming class
- with `mediaTypes: ['IMAGE', 'VIDEO']`, all three media buttons render undimmed

Both fail if a later change re-introduces `availableRatings` / `availableMediaTypes` assignment, which
is the point: `feedback_no_dynamic_rating_media_hiding` has been re-litigated twice already.

### 8.3 Web — panel integration

In `web/src/lib/components/filter-panel/__tests__/`:

- an unavailable section renders neither `filter-section-<id>` nor `section-toggle-<id>`
- an `empty` section renders `(0)`, is collapsed and is disabled
- a section that goes unavailable is **not** written to `localStorage`, and reappears when the next
  response reports it available — the §6.3 regression guard
- an unavailable section still appears in the stored `known` array, so PR #926's
  "introduced since the ledger" logic cannot mistake it for a new section on the next load
- the panel mounts with filters active → a second `suggestionsProvider` call with an empty filter
  state; mounts clean → exactly one call
- baseline request rejects → no section is hidden
- **a later `suggestionsProvider` rejection leaves the previous facets and baseline in place** — the
  §4.6 sentinel guard, at panel level
- `showAllSections` and the empty-state hint count only available sections
- a section with an active filter survives an empty facet
- **the legacy providers path is unaffected** — `filter-panel.spec.ts:403` (`#858 §3.3`) stays green
  without edits, and no section is ever hidden when `config.suggestionsProvider` is absent

At surface level, one test per query-mode page (photos, spaces, recently-added) that a failing
`searchSmartFacets` makes `suggestionsProvider` **reject** rather than resolve with empty arrays
(§4.6). These fail against today's `emptyFilterSuggestions()` and are what makes slice 4 TDD rather
than a refactor.

A guard for the `{#key}` invariant in §4.5: one test per surface that changing the committed query (or
album/space id) mounts a fresh panel — asserted by the panel re-issuing its baseline request. Without
it, deleting a `{#key}` is a silent correctness regression.

`filter-section-parity.spec.ts` guards `config.sections` parity, which this change does not touch, so
it must stay green. Widen its `getFilterSuggestions` mock with the three new fields so the mocked
response matches the runtime shape.

### 8.4 e2e

Both suites click controls that will now be gated:

- `photos-filter-panel.e2e-spec.ts` already rates an asset (`:28`) so Rating stays available, but
  seeds **only images** — the Media section becomes unavailable and the `media-type-image` click at
  `:78` fails.
- `spaces-filter-panel.e2e-spec.ts` asserts `filter-section-rating` and `filter-section-media` are
  visible (`:95-96`) and clicks `rating-star-N` / `media-type-*` ~25 times.

Fix the seed data, not the feature. `recently-added-filters.e2e-spec.ts:102-110` shows the existing
pattern: `utils.createAsset(token, { assetData: { filename: 'example-0.mp4' } })` — random image bytes
with an `.mp4` name, typed from the extension. Add a video and, where absent, a rating, a favourite
and an album membership to each suite's `beforeAll`.

New e2e coverage: a library with no videos does not render `filter-section-media`; favouriting an
asset makes `filter-section-favorites` appear on reload.

### 8.5 Mobile

Widget tests under Flutter **3.44.8** (`mobile/mise.toml`), with `dart analyze --fatal-infos lib test`
and `dart format` as separate gates:

- an unavailable section is absent from the deep sheet and from `manage_sections_sheet`
- the favourites and not-in-album switches disappear when their facet is false; archived and untagged
  always render
- availability is never written to `hiddenSectionsProvider`
- `photosFilterSuggestionsProvider` forwards `isNotInAlbum`

## 9. Slices

Each row names the test that must fail first, so the slice cannot be started implementation-first.

| #   | Slice                                                                                     | First failing test                                                                | Gate                             |
| --- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Server facets, DTOs, `SmartFacetExclude`, candidate-query move, `make sql`                | medium: `hasFavorites` on a library with one favourite (§8.1)                     | server unit + medium             |
| 2   | OpenAPI regen — TypeScript SDK + Dart client                                              | none — generated output, covered by slice 1 and 4                                 | build                            |
| 3   | `filter-availability.ts` + its tests, no wiring                                           | the §4.3 table, driven as data (§8.2)                                             | web unit                         |
| 4   | Widen `FilterSuggestionsResponse`; six configs/mappers; delete `emptyFilterSuggestions()` | per-surface: a failing facet fetch **rejects** rather than resolving empty (§8.3) | web unit + `check:typescript`    |
| 5   | Panel wiring: capture facets, baseline capture, section gating, ledger separation         | an unavailable section renders neither its body nor its toggle icon (§8.3)        | web unit + `check:svelte` + lint |
| 6   | e2e seed and assertion updates                                                            | a library with no videos does not render `filter-section-media`                   | e2e web                          |
| 7   | Mobile: `isNotInAlbum` forwarding, section and toggle gating, manage-sections sheet       | provider forwards `isNotInAlbum` (§8.5)                                           | flutter test, analyze, format    |
| 8   | Docs                                                                                      | none                                                                              | docs prettier                    |

Slice 4 precedes slice 5 because widening the response type breaks every config until they are
updated; `tsc` then enumerates the work. It also carries the §4.6 sentinel removal, which slice 5's
gating depends on for safety — slice 5 must not land without it.

## 10. Sequencing and risks

**PR #926 conflicts directly.** It rewrites the `{ selected, known }` ledger in
`filter-panel.svelte` and `filter-panel.ts` — the same files slice 5 edits heavily, and the same
concern §6.3 depends on. Branch off #926, or land #926 first. Do not develop the two in parallel on
`main`.

**Risk: a near-empty panel on a fresh library.** A freshly imported library with no faces named, no
GPS, no tags, no albums and no favourites will show Timeline, People (unnamed hint), Media and Text
only. This is the intended behaviour per §2.2 — the hidden sections genuinely cannot filter anything —
but it is a visible change for new users and should be called out in the PR description.

**Risk: one extra request on filtered mount.** Deep links carrying filters pay one additional
suggestions request. Measured against the alternative in §4.5, this is the cheaper side.

**Non-goal: the Text section.** Description, filename and OCR are free text with no enumerable
domain. Gating them would need `hasDescription` / `hasOcrText` probes over columns not indexed for
it, on the hot suggestions path. Out of scope; if it is ever wanted it belongs in its own issue.
