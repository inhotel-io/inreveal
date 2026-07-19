# Tier 3 Memory Types — Design & Test Spec

> Implements roadmap items **#6 Trip anniversary**, **#7 Themed** (reframed onto smart search),
> and **#11 Video moments** from the
> [memory types roadmap](./2026-07-15-memory-types-roadmap.md).
> Stacked on **PR #792** (`feat/memory-types-tier2`), which is stacked on **PR #789**
> (`feat/memory-types-tier1`). Branch: `feat/memory-types-tier3`.
> Approach: **test-driven, behavior-driven, full edge-case coverage.**
> Created 2026-07-19. Status: **spec — not yet implemented.**

## 1. Goal & non-goals

**Goal:** add three new `MemoryRule`s to the shipped rule engine:

| Key                | Memory                                                      | Anchor                                     | Window   |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------ | -------- |
| `trip_anniversary` | "Your trip to Rome" · "3 years ago · 42 photos over 5 days" | anniversary of a past trip's **start day** | 3–7 days |
| `themed`           | "Sunsets from 2023" · "18 photos"                           | rotating theme, one per day                | 7 days   |
| `video_moments`    | "Video moments from July 2023" · "6 videos"                 | **day 8** of the month                     | 7 days   |

Plus one mobile fix: the memory viewer force-autoplays video regardless of the user's global
`viewer.autoPlayVideo` setting.

**Non-goals (this batch):**

- No engine change to `memory.service.ts`'s scheduling, `RULE_DAILY_LIMIT`, the multi-day slot cap,
  or the cleanup job. All three rules are pure functions of `(ownerId, target, injected ports)`.
- No open-ended semantic discovery (roadmap #12). `themed` uses a **fixed, curated theme vocabulary**;
  it is a pragmatic subset of the north star, not the north star.
- No localization of memory _content_ (titles/subtitles stay English, matching every existing rule).
  Settings _labels_ are localized.
- No new ML model, no new inference type. `themed` reuses embeddings CLIP **already computed** for
  smart search. No dependency on the fork's auto-classification / `tag_asset`.
- No mobile memory auto-advance timer. The mobile memory viewer has **no** auto-advance at all today
  (pre-existing, affects every memory type) — tracked as a follow-up in §8, explicitly out of scope.
- No changes to the web memory viewer: it already plays video with a duration-aware progress timer.
- No `MemoryType` enum or `memory` table schema change.

## 2. Design decisions (confirmed with Pierre 2026-07-19)

| #   | Decision                                                                                               | Rationale                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Trip anniversary queries location data fresh** (roadmap option A), not stored `recent_trip` memories | Covers imported historical libraries. `recent_trip` only ever fired for trips taken _while already running Gallery_, so option B would miss everyone's back-catalog — exactly the emotional payoff |
| D2  | **`themed` rides smart-search CLIP embeddings**, not auto-classification                               | Embeddings already exist per asset; no classification dependency, no new infra                                                                                                                     |
| D3  | **`themed` is period-scoped to a past _year_** ("Sunsets from 2023"), not all-time                     | Keeps the throwback identity; each `(theme, year)` fires exactly once, so dedupe is natural. All-time would repeat forever since the top matches never change                                      |
| D4  | **Small theme vocabulary + one theme per day** (rotation)                                              | Bounds vector-search cost to ~3 queries/user/night and keeps the surface varied                                                                                                                    |
| D5  | **`trip_anniversary` and `on_this_day_place` share a dedupe namespace**                                | They collide by construction; a shared key lets the engine's existing `seenDedupeKeys` collapse them with **zero engine change** (§3.3)                                                            |
| D6  | **Mobile: force autoplay in the memory card**                                                          | Videos in memories currently sit frozen on frame 1 unless the user's global autoplay is on                                                                                                         |
| D7  | **`themed` returns images only** (`type: Image`)                                                       | Clean separation from `video_moments`; a "Sunsets" reel of videos is off-brief                                                                                                                     |

## 3. Architecture

### 3.1 Every site a new memory type touches

Derived by tracing `people_together` (the type added in PR #792) across the repo. **All 16 sites**
must be updated for **each** of the three new keys — missing any one is the classic failure mode
(the e2e fixture in particular is _not_ covered by the server suite):

| #   | File                                                            | What changes                                                                   |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | `server/src/services/memory-rules/memory-type.metadata.ts`      | `MEMORY_TYPE_METADATA` entry                                                   |
| 2   | `server/src/services/memory-rules/memory-type.metadata.spec.ts` | assert key, kind, defaults                                                     |
| 3   | `server/src/services/memory-rules/memory-type.registry.ts`      | `RULE_FACTORIES` entry (+ `MemoryRuleDeps` for `themed`)                       |
| 4   | `server/src/services/memory-rules/memory-type.registry.spec.ts` | assert factory builds the right rule                                           |
| 5   | `server/src/services/memory-rules/<rule>.rule.ts`               | the rule itself                                                                |
| 6   | `server/src/services/memory-rules/<rule>.rule.spec.ts`          | unit/BDD spec                                                                  |
| 7   | `server/src/utils/preferences.spec.ts`                          | default per-user type map gains the key                                        |
| 8   | `server/src/services/server.service.spec.ts`                    | exact `toEqual` on `availableMemoryTypes`                                      |
| 9   | `server/test/medium/specs/services/memory.service.spec.ts`      | end-to-end generation medium test                                              |
| 10  | `e2e/src/specs/server/api/server.e2e-spec.ts`                   | **`availableMemoryTypes` fixture — the server unit suite does NOT catch this** |
| 11  | `web/src/routes/admin/system-settings/MemoriesSettings.svelte`  | hardcoded `memoryTypeKeys` array                                               |
| 12  | `web/src/routes/admin/system-settings/MemoriesSettings.spec.ts` | switch-count assertions                                                        |
| 13  | `i18n/en.json`                                                  | 4 keys per type (see §3.5)                                                     |
| 14  | `docs/docs/features/memories.md`                                | user-facing type list                                                          |
| 15  | `docs/docs/install/config-file.md`                              | `memories.types` config keys                                                   |
| 16  | `docs/plans/2026-07-15-memory-types-roadmap.md`                 | Status column → **Shipped**                                                    |

### 3.2 New / changed source files

| File                                                  | Change                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/repositories/asset.repository.ts`                | `getMemoryAssetsForPeriod`: select `type` + `duration`, add optional `type` filter                    |
| `src/services/memory-rules/trip.util.ts`              | **New** — pure: `placeKeyOf`, `inferHome`, `isAwayFromHome`, `findTripStartingOn`, `curateTripAssets` |
| `src/services/memory-rules/recent-trip.rule.ts`       | Refactor to consume `trip.util.ts` (removes ~90 lines of private duplication)                         |
| `src/services/memory-rules/on-this-day-place.rule.ts` | `dedupeKey` → shared place-day namespace (§3.3)                                                       |
| `src/services/memory-rules/trip-anniversary.rule.ts`  | **New** rule                                                                                          |
| `src/services/memory-rules/theme.catalog.ts`          | **New** — the fixed theme vocabulary + rotation                                                       |
| `src/services/memory-rules/theme-search.port.ts`      | **New** — `ThemeSearchPort` interface (the rule's only dependency)                                    |
| `src/services/memory-rules/theme-search.adapter.ts`   | **New** — port impl over `MachineLearningRepository` + `SearchRepository`                             |
| `src/services/memory-rules/themed.rule.ts`            | **New** rule                                                                                          |
| `src/services/memory-rules/video-moments.rule.ts`     | **New** rule                                                                                          |
| `src/services/memory-rules/memory-type.registry.ts`   | `MemoryRuleDeps` gains `themeSearchPort`; 3 factories                                                 |
| `src/services/memory.service.ts`                      | Build + memoize the `ThemeSearchPort` adapter; pass into `getMemoryRules` deps                        |
| `mobile/.../asset_viewer/video_viewer.widget.dart`    | `NativeVideoViewer` gains `forceAutoPlay` (default `false`)                                           |
| `mobile/.../memory/memory_card.widget.dart`           | `DriftMemoryCard` passes `forceAutoPlay: true`                                                        |

### 3.3 Cross-rule dedupe: the shared place-day namespace (D5)

`trip_anniversary` and `on_this_day_place` fire on the same signal. When a past trip's start day
comes round, the on-this-day photos for that year are (almost by definition) dominated by the trip's
city — so **both** rules produce a candidate about the same place, same year, same day, and with only
`RULE_DAILY_LIMIT = 2` slots they would occupy both with near-identical content.

The engine already has the mechanism to resolve this. In `memory.service.ts:136-155`,
`createRuleMemories` builds `seenDedupeKeys` over the **flattened, score-sorted candidate list from
all rules**, and skips any candidate whose `dedupeKey` was already taken. So two different rules
emitting the **same `dedupeKey`** collapse to the higher-scoring one, with **no engine change**.

Both rules therefore emit:

```
place_day:${year}-${mm}-${dd}:${placeKeyOf(country, city)}
```

⚠️ **The key formats must match byte-for-byte or the collapse silently never fires.** Today the two
rules build their place keys differently — `on_this_day_place` uses
`` `${country ?? ''}:${city}` `` (`on-this-day-place.rule.ts:5`) while `recent_trip` uses
`` `${country}:${city ?? ''}` `` (`recent-trip.rule.ts:61`). This batch introduces **one canonical
helper** in `trip.util.ts`, and both place-based rules must use it:

```ts
export const placeKeyOf = (country: string | null, city: string | null): string =>
  `${country ?? ''}:${city ?? ''}`.toLowerCase();
```

`trip_anniversary` is scored to **always** beat `on_this_day_place` (§4.1 — a guaranteed, tested
invariant, not a heuristic), so it wins whenever it qualifies and `on_this_day_place` silently yields
the slot.

**Migration impact: none.** `on_this_day_place` ships in PR #789, which is **not yet merged**, so no
production database holds a memory under the old `on_this_day_place:...` key format. If #789 merges
and deploys _before_ this batch lands, the key change would cause each affected
`on_this_day_place` memory to be eligible for one regeneration (`hasRuleMemory` is keyed on
`(ownerId, ruleId, dedupeKey)`); that is cosmetic and self-limiting, not a correctness bug.

> **Accepted edge:** on days 2..N of a multi-day trip's anniversary, `on_this_day_place` may still
> surface "On this day in Rome" while the `trip_anniversary` memory is lingering. The dedupe only
> collapses same-day collisions. This is mild and shows genuinely different photos; not worth an
> engine change.

### 3.4 `themed` dependency wiring — the `ThemeSearchPort` seam

The themed rule needs two capabilities the other rules don't: encode a text prompt (an **ML HTTP
call**) and run a **pgvector** similarity search. Two constraints shape the design:

1. **Encoding must not happen per user.** `createMemoryRules` runs once **per user per day**
   (`memory.service.ts:203`). Encoding inside the rule would mean one ML round-trip per user per
   night. Theme text is user-independent, so it must be encoded once and reused.
2. **The rule must stay trivially unit-testable**, like every other rule (which takes a narrow
   `Pick<Repository, 'method'>`).

Both are solved by a single narrow port that the rule depends on, with a memoizing adapter behind it:

```ts
// theme-search.port.ts
export interface ThemeSearchAsset {
  id: string;
  localDateTime: Date;
}

export interface ThemeSearchPort {
  /** Returns null when smart search is disabled or the embedding cannot be produced. */
  resolveEmbedding(themeKey: string, query: string): Promise<string | null>;
  /** Assets ordered by similarity, best first. */
  searchByEmbedding(params: {
    ownerId: string;
    embedding: string;
    takenAfter: Date;
    takenBefore: Date;
    size: number;
  }): Promise<ThemeSearchAsset[]>;
}
```

`MemoryThemeSearchAdapter` implements it over `MachineLearningRepository.encodeText` +
`SearchRepository.searchSmart`, holding a `Map<`${modelName}:${themeKey}`, string>` embedding cache.
`MemoryService` constructs it **once** (lazy field, reused across users and days) and passes it into
`getMemoryRules`'s deps. Both repositories are already on `BaseService`
(`machineLearningRepository` at `base.service.ts:187`, `searchRepository` at `:200`), so no
constructor plumbing is required.

**Key facts that make this safe** (verified against the code):

- `encodeText(text, { modelName, language? })` returns the **pgvector-serialized embedding string**
  (`ClipTextualResponse = { [ModelTask.SEARCH]: string }`) — exactly the type
  `SmartSearchOptions.embedding` expects. No conversion.
- `searchSmart(pagination, options)` takes a **precomputed embedding**, needs **no ML service**, and
  supports every filter we need: `userIds`, `takenAfter`/`takenBefore` (`SearchDateOptions`),
  `type` and `isFavorite` (`SearchStatusOptions`), and `visibility`.
- `maxDistance` applies a cosine-distance ceiling **in SQL**
  (`search.repository.ts:428-430`), active only when `0 < maxDistance < 2`
  (`isActiveDistanceThreshold`). The product default `clip.maxDistance` is `0` (disabled), so the
  themed rule must pass **its own** threshold — see §4.2 and the calibration gate in Slice 8.
- `searchSmart` does **not** return a per-asset distance, so quality gating relies entirely on
  `maxDistance`; the rule cannot re-rank by similarity beyond the returned order.

### 3.5 i18n

4 keys per type in `i18n/en.json` only (the repo's `i18n/` is shared by web **and** mobile; new keys
need only the EN source):

```
memory_type_<key>                       memory_type_<key>_description
admin.memory_type_<key>_setting         admin.memory_type_<key>_setting_description
```

Copy:

| key                | user label         | user description                                                      |
| ------------------ | ------------------ | --------------------------------------------------------------------- |
| `trip_anniversary` | Trip anniversaries | Past trips resurfaced on the anniversary of the day they began.       |
| `themed`           | Themes             | Photo themes like sunsets, food, and beach days, found automatically. |
| `video_moments`    | Video moments      | Videos you filmed in this month of a past year.                       |

## 4. Per-rule behavior

### 4.1 `trip_anniversary` — "Your trip to Rome"

**Shape:** `class TripAnniversaryMemoryRule implements MemoryRule`, `id = 'trip_anniversary'`,
ctor `(assetRepository: Pick<AssetRepository, 'getMemoryAssetsForPeriod' | 'getMemoryLocationClusters' | 'getMemoryAssetsForLocation'>)`.

**Constants:** `MIN_PROBE_ASSETS = 3`, `MIN_PROBE_DOMINANCE = 0.6`, `MAX_PROBE_YEARS = 4`,
`GAP_DAYS = 5`, `TRIP_WINDOW_DAYS = 21`, `MIN_TRIP_ASSETS = 7`, `MIN_TRIP_DAYS = 2`,
`HOME_BASELINE_DAYS = 90`, `HOME_DOMINANCE_RATIO = 1.25`, `ASSET_CAP = 12`, `MAX_CANDIDATES = 2`.

**Algorithm — cheap probe first, then confirm:**

1. **Probe (1 cheap query, prunes most days).**
   `getMemoryAssetsForPeriod(ownerId, { months: [target.month], day: target.day, takenBefore: target.endOf('day') })`
   — the same shape `on_this_day_place` uses. Bucket by year, drop `year >= target.year` and assets
   with a blank city. For each past year run
   `dominantBy(assets, (a) => placeKeyOf(a.country, a.city))`; keep years where
   `dominant.items.length >= MIN_PROBE_ASSETS && dominant.ratio >= MIN_PROBE_DOMINANCE`.
   **If no year qualifies, return `[]` immediately** — this is the common case and costs one query.
   Take the most recent `MAX_PROBE_YEARS` qualifying years.

2. **Confirm each candidate year (2 cluster queries per year).** For year `Y`, let
   `anniversary = target.set({ year: Y }).startOf('day')`:
   - **Home baseline:** `getMemoryLocationClusters(ownerId, { takenAfter: anniversary - HOME_BASELINE_DAYS, takenBefore: anniversary - GAP_DAYS - 1 })`
     → `inferHome(clusters, HOME_DOMINANCE_RATIO)`. Returns `null` when the top cluster has no
     `country`, or when a runner-up in a different country is within the dominance ratio (ambiguous
     home). `null` → skip this year.
   - **Trip window:** `getMemoryLocationClusters(ownerId, { takenAfter: anniversary - GAP_DAYS, takenBefore: min(anniversary + TRIP_WINDOW_DAYS, target.endOf('day')) })`
     → `findTripStartingOn(clusters, anniversary, home, thresholds)`.

   **Why one window covering the gap works.** The window deliberately starts `GAP_DAYS` **before**
   the anniversary. A cluster whose `firstDate` falls on the anniversary day therefore had **no
   photos at that place in the preceding `GAP_DAYS`** — it is a genuine arrival, not the middle of an
   ongoing stay. Because such a cluster has no pre-window assets, its `assetCount` / `dayCount` are
   purely in-window and can be used directly as the trip's size. A cluster qualifies when:
   `firstDate` is on the anniversary day **and** `isAwayFromHome(cluster, home)` **and**
   `assetCount >= MIN_TRIP_ASSETS` **and** `dayCount >= MIN_TRIP_DAYS`.

3. **Build the candidate.** Fetch assets with
   `getMemoryAssetsForLocation(ownerId, { country, city, takenAfter: firstDate, takenBefore: lastDate })`
   and curate with the shared `curateTripAssets` (burst-collapse at 2 min + per-day coverage),
   capped to `ASSET_CAP`.

**Candidate fields:**

| Field            | Value                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `dedupeKey`      | `place_day:${Y}-${mm}-${dd}:${placeKey}` — **shared namespace** (§3.3)                    |
| `title`          | `Your trip to ${city}, ${country}` (or `${country}` when city is null)                    |
| `subtitle`       | `${yearsAgo} year${s} ago · ${assetCount} photos over ${dayCount} days`                   |
| `score`          | `260 + dayCount * 4 + Math.min(assetCount, 20) + recencyBonus(Y, target.year)`            |
| `memoryAt`       | `DateTime.fromJSDate(cluster.firstDate, { zone: 'utc' })` — points at the original trip   |
| `visibleForDays` | `Math.min(Math.max(dayCount, 3), 7)`                                                      |
| `context`        | `{ year, placeKey, placeLabel, country, city, assetCount, dayCount, tripStart, tripEnd }` |

Emit at most `MAX_CANDIDATES`, sorted by score desc.

**Scoring invariant (required for D5 to be deterministic).** `on_this_day_place` currently scores
`100 + count * 3 + recencyBonus` with **no cap on `count`** (`on-this-day-place.rule.ts:57`), so a
heavily-photographed day scores 250+ — which would beat `trip_anniversary` precisely when the trip
was well documented, inverting the intended precedence. Two coupled changes make the precedence
total and provable:

1. **Cap `on_this_day_place`'s count term:** `100 + Math.min(count, 30) * 3 + recencyBonus`.
   Bounded range **[112, 200]** (min `count` is 4, max `recencyBonus` is 10).
2. **Floor `trip_anniversary` above it:** base `260` ⇒ minimum
   `260 + 2*4 + 7 + 0 = 275` (at `MIN_TRIP_DAYS` and `MIN_TRIP_ASSETS`).

**275 > 200**, so `trip_anniversary` wins the shared key unconditionally. §5.3 asserts this as an
explicit invariant test rather than trusting the arithmetic to survive future tuning.

This is a scoring change to a rule that has **not yet shipped** (PR #789), so it carries no
migration or user-visible regression; `on-this-day-place.rule.spec.ts` pins exact scores and must be
updated in the same slice. The high base is intentional and safe: `trip_anniversary` fires only on
genuine trip anniversaries, and on such a day it _should_ take a slot.

### 4.2 `themed` — "Sunsets from 2023"

**Shape:** `class ThemedMemoryRule implements MemoryRule`, `id = 'themed'`,
ctor `(themeSearchPort: ThemeSearchPort)`. The rule is deliberately **unaware of `maxDistance`** —
the adapter already reads system config (for `isSmartSearchEnabled`) and owns the threshold, so
tuning it never touches rule code or rule tests.

**Theme catalog** (`theme.catalog.ts`) — 6 themes, deliberately small (D4):

| key          | CLIP prompt                   | title label |
| ------------ | ----------------------------- | ----------- |
| `sunset`     | `a beautiful sunset`          | Sunsets     |
| `beach`      | `a beach with sand and ocean` | Beach days  |
| `food`       | `a plate of food at a meal`   | Food        |
| `mountains`  | `mountains and hiking trails` | Mountains   |
| `snow`       | `a snowy winter landscape`    | Snow days   |
| `city_night` | `a city skyline at night`     | City lights |

**Rotation:** exactly one theme per day —
`THEMES[(target.ordinal - 1) % THEMES.length]` (Luxon `ordinal` = day-of-year, 1-based). Global, not
per-user, so the theme is deterministic and reproducible for a given date.

**Constants:** `MAX_YEARS_BACK = 3`, `FETCH_SIZE = 40`, `MIN_ASSETS = 8`, `ASSET_CAP = 16`,
`VISIBLE_FOR_DAYS = 7`.

**Algorithm:**

1. Pick the day's theme by rotation.
2. `embedding = await port.resolveEmbedding(theme.key, theme.query)`. **`null` → return `[]`**
   (smart search disabled, ML unreachable, or model mismatch). Never throws.
3. For each of the last `MAX_YEARS_BACK` past years `Y` (i.e. `target.year - 1 .. target.year - 3`):
   - `takenAfter = DateTime.utc(Y, 1, 1).startOf('day')`
   - `takenBefore = min(DateTime.utc(Y, 12, 31).endOf('day'), target.endOf('day'))`
   - `assets = await port.searchByEmbedding({ ownerId, embedding, takenAfter, takenBefore, size: FETCH_SIZE })`
   - Skip when `assets.length < MIN_ASSETS`.
4. Emit a candidate per qualifying year; sort by score desc; **cap to 1 candidate** (one themed
   memory per day is plenty — the daily rotation already provides variety).

**Candidate fields:**

| Field            | Value                                                      |
| ---------------- | ---------------------------------------------------------- |
| `dedupeKey`      | `themed:${theme.key}:${Y}`                                 |
| `title`          | `${theme.label} from ${Y}`                                 |
| `subtitle`       | `${count} photos`                                          |
| `score`          | `70 + Math.min(count, 25) + recencyBonus(Y, target.year)`  |
| `assetIds`       | `sampleAssetsByTime(assets, ASSET_CAP)`                    |
| `memoryAt`       | `DateTime.fromJSDate(medianTime(assets), { zone: 'utc' })` |
| `visibleForDays` | `7`                                                        |
| `context`        | `{ year: Y, theme: theme.key, count }`                     |

Base `70` keeps themed **below** the date-anchored rules, so a real anniversary always wins the slot.

**Adapter behavior (`MemoryThemeSearchAdapter`):**

- `resolveEmbedding`: read `getConfig({ withCache: true })`; return `null` when
  `!isSmartSearchEnabled(config.machineLearning)`. Cache key `${clip.modelName}:${themeKey}` so a
  **model change invalidates naturally**. On `encodeText` failure, log and return `null` (never
  throw — a themed failure must not abort the night's other rules; note `evaluateRuleCandidates`
  already try/catches per rule, this is defence in depth).
- `searchByEmbedding`: `searchSmart({ page: 1, size }, { embedding, userIds: [ownerId], takenAfter, takenBefore, type: AssetType.Image, visibility: AssetVisibility.Timeline, maxDistance })`,
  mapping results to `{ id, localDateTime }`.

**Threshold (`maxDistance`) — the one real risk.** Sourced from system config so it is tunable
without a deploy: add `memories.themeMaxDistance` (default **`0.30`**) alongside `retentionDays`.
Too loose ⇒ "Sunsets" full of orange-ish noise; too tight ⇒ no memories at all. **Slice 8 gates
merge on empirical calibration against a real library.**

> **Accepted edge:** `searchSmart` inner-joins `smart_search`, so only ML-processed assets are
> reachable, and it does not verify a Preview `asset_file` exists (unlike the other memory queries).
> In practice thumbnail generation precedes CLIP encoding, so an asset with an embedding
> effectively always has a preview. Documented, not defended.

### 4.3 `video_moments` — "Video moments from July 2023"

**Shape:** `class VideoMomentsMemoryRule implements MemoryRule`, `id = 'video_moments'`,
ctor `(assetRepository: Pick<AssetRepository, 'getMemoryAssetsForPeriod'>)`.

**Constants:** `TRIGGER_DAY = 8`, `MIN_DURATION_MS = 3_000`, `MAX_DURATION_MS = 180_000`,
`MIN_ASSETS = 3`, `MAX_YEARS = 3`, `ASSET_CAP = 8`, `VISIBLE_FOR_DAYS = 7`.

**Anchor:** `if (target.day !== TRIGGER_DAY) return []`. Day 8 deliberately staggers against
`month_recap` (day 1), `favorites_throwback` (day 15) and `people_together` (day 20), so the
multi-day rules never contend for the same trigger day.

**Algorithm:**

1. `getMemoryAssetsForPeriod(ownerId, { months: [target.month], type: AssetType.Video, takenBefore: target.endOf('day') })`.
2. Bucket by year, dropping `year >= target.year`.
3. **Memorability band:** keep only assets with
   `duration !== null && duration >= MIN_DURATION_MS && duration <= MAX_DURATION_MS`. This drops
   accidental 1-second taps and long screen recordings. `duration` is an **integer of
   milliseconds** (`asset.table.ts:96-97`; the `ChangeDurationToInteger` migration converts
   `HH:MM:SS.mmm` → ms).
4. Skip years with `< MIN_ASSETS` surviving videos.
5. **Selection favours favourites, deterministically:** take favourites first (chronological), then
   fill the remainder with `pickEvenlySpaced` over the non-favourites; sort the final set
   chronologically. Capped at `ASSET_CAP`.

**Candidate fields:**

| Field            | Value                                                                             |
| ---------------- | --------------------------------------------------------------------------------- |
| `dedupeKey`      | `video_moments:${Y}-${MM}`                                                        |
| `title`          | `Video moments from ${monthName(month)} ${Y}`                                     |
| `subtitle`       | `${count} video${count === 1 ? '' : 's'}`                                         |
| `score`          | `60 + Math.min(count, 15) * 2 + favoriteCount * 3 + recencyBonus(Y, target.year)` |
| `memoryAt`       | `DateTime.fromJSDate(medianTime(selected), { zone: 'utc' })`                      |
| `visibleForDays` | `7`                                                                               |
| `context`        | `{ year: Y, month, count, favoriteCount }`                                        |

Emit at most `MAX_YEARS`, sorted by score desc.

### 4.4 Repository change — `getMemoryAssetsForPeriod`

Purely **additive**; the four tier-1 rules and `on_this_day_place` keep identical behavior (they
simply receive two extra fields they ignore).

```ts
export interface MemoryPeriodAsset {
  id: string;
  localDateTime: Date;
  year: number;
  country: string | null;
  city: string | null;
  isFavorite: boolean;
  type: AssetType; // NEW
  duration: number | null; // NEW — milliseconds
}

export interface MemoryPeriodOptions {
  months: number[];
  day?: number;
  favoritesOnly?: boolean;
  type?: AssetType; // NEW
  takenBefore: Date;
}
```

Implementation: add `'asset.type'` and `'asset.duration'` to the `.select([...])`, and
`.$if(type !== undefined, (qb) => qb.where('asset.type', '=', type!))` alongside the existing
`favoritesOnly` guard. The `@GenerateSql` snapshot must be regenerated.

> ⚠️ `make sql` **deletes every query file when no database is running.** Only run it against a live
> dev DB, and confirm the resulting `asset.repository.sql` diff contains only the two new columns
> and the optional type predicate.

### 4.5 Mobile — force autoplay (D6)

`NativeVideoViewer` currently gates playback on the user's global setting
(`video_viewer.widget.dart:221-222`):

```dart
final autoPlayVideo = ref.read(appConfigProvider).viewer.autoPlayVideo;
if (autoPlayVideo || widget.asset.isMotionPhoto) {
  await _notifier.play();
}
```

Because `DriftMemoryCard` builds it with `showControls: false`, a user with autoplay off gets a
**frozen first frame and no play button**. Change:

1. `NativeVideoViewer` gains `final bool forceAutoPlay;` (constructor default `false`) — no existing
   call site changes behavior.
2. The gate becomes `if (widget.forceAutoPlay || autoPlayVideo || widget.asset.isMotionPhoto)`.
3. `DriftMemoryCard` (`memory_card.widget.dart:63-70`) passes `forceAutoPlay: true`.

## 5. Test plan (TDD / BDD)

### 5.0 TDD discipline (per unit, non-negotiable)

Every slice follows **red → green → refactor**:

1. Write the listed tests first. Run the named command and confirm they fail **for the expected
   reason** — capture the failure summary in the slice's commit body or PR notes.
2. Implement the minimal code to pass.
3. Re-run; confirm green. Run the slice's type/lint gate.
4. Commit with the slice's message.

**Anti-tautology rule:** every rule spec must include at least one **negative** case that fails for
a _different_ reason than the positive case passes (e.g. threshold missed by exactly one), and the
medium tests must include a negative case proving the rule does **not** fire.

### 5.1 Conventions (match the existing rule specs)

- Unit specs live beside the rule, `vitest`, no DB. Repository/port deps are hand-rolled fakes or
  `vitest.fn()`; assert on the returned `MemoryRuleCandidate[]`.
- `target` is a Luxon UTC `DateTime`; build fixtures with explicit `DateTime.utc(...)`.
- **Pin exact `score` values** in at least one test per rule (the tier-2 spec's convention) so a
  scoring regression is loud rather than silent.
- Assert `dedupeKey` **stability**: the same period evaluated on two different `target` days
  produces an identical key.

### 5.2 `trip.util.spec.ts` (pure — write first, Slice 4)

`inferHome`:

- returns the top cluster when it dominates.
- returns `null` when the top cluster's `country` is `null`.
- returns `null` when a runner-up in a **different country** has `assetCount >= top/1.25` (ambiguous).
- returns the top cluster when the runner-up is in the **same** country (not ambiguous).
- returns `null` for an empty list.

`placeKeyOf` (the §3.3 collision contract):

- `('Italy', 'Rome')` → `'italy:rome'` (lower-cased).
- `(null, 'Rome')` → `':rome'`; `('Italy', null)` → `'italy:'` — **both null positions handled**,
  which is exactly what the two pre-existing divergent implementations got wrong.
- case-insensitive: `('ITALY', 'ROME')` and `('italy', 'rome')` produce the same key.

`isAwayFromHome`:

- different country → `true`.
- same country, different non-null city → `true`.
- same country, same city → `false`.
- same country, home city `null` → `false` (cannot prove away).
- same country, candidate city `null` → `false`.

`findTripStartingOn`:

- picks a cluster whose `firstDate` is on the anniversary day and meets both thresholds.
- **rejects `firstDate` one day before** the anniversary (mid-stay, not an arrival).
- **rejects `firstDate` one day after** the anniversary.
- rejects `assetCount === MIN_TRIP_ASSETS - 1` (boundary) and accepts `=== MIN_TRIP_ASSETS`.
- rejects `dayCount === 1` and accepts `=== 2`.
- rejects a qualifying cluster that is **not** away from home.
- returns the highest-`assetCount` cluster when two qualify on the same day (deterministic).
- returns `null` for an empty list.

`curateTripAssets` (behavior ported from `recent-trip.rule.ts`, now shared):

- collapses assets within the 2-minute burst window to one representative.
- returns all when `<= SMALL_TRIP_MAX` after collapsing.
- covers distinct days before topping up, and never exceeds the target size.
- output is chronologically sorted and free of duplicate ids.

### 5.3 `trip-anniversary.rule.spec.ts`

- **fires** on the anniversary of a qualifying past trip: exact `title`, `subtitle`, `score`,
  `memoryAt` (= trip `firstDate`), `visibleForDays`, and `dedupeKey` in the **shared** `place_day:`
  namespace.
- emits the `place_day:` key **identical** to what `on_this_day_place` produces for the same
  year/day/place (assert against the other rule's **real** output, not a hand-written string — this
  is the §3.3 contract and the only test that would catch the two rules drifting apart again).
- **scoring invariant (§4.1):** the _minimum_ `trip_anniversary` score (built at
  `MIN_TRIP_DAYS` / `MIN_TRIP_ASSETS` / `recencyBonus` 0) is strictly greater than the _maximum_
  `on_this_day_place` score (count ≥ 30, `recencyBonus` 10). Assert with both rules' real scoring,
  so future tuning of either rule cannot silently invert the precedence D5 depends on.
- **probe short-circuit:** when no past year has a dominant city, returns `[]` and
  `getMemoryLocationClusters` is **never called** (asserts the cheap-first design).
- returns `[]` when the probe year's dominance ratio is just below `MIN_PROBE_DOMINANCE`.
- returns `[]` when home is ambiguous (baseline runner-up within the ratio).
- returns `[]` when the trip cluster starts a day before the anniversary.
- returns `[]` when the trip is 1 day long / has 6 assets (both boundaries).
- skips the **current** year and future-dated assets.
- caps at `MAX_CANDIDATES`; caps assets at `ASSET_CAP`.
- `subtitle` pluralization: `1 year ago` vs `3 years ago`.
- city `null` → title falls back to country only.
- evaluates at most `MAX_PROBE_YEARS` years (assert cluster-query call count).

### 5.4 `themed.rule.spec.ts` (fake `ThemeSearchPort`)

- **fires** for a qualifying year: exact `title` (`Sunsets from 2023`), `subtitle`, `score`,
  `dedupeKey`, `visibleForDays: 7`.
- **rotation:** day-of-year `N` and `N + THEMES.length` select the **same** theme; consecutive days
  select **different** themes; rotation is stable for a fixed date.
- `resolveEmbedding` → `null` ⇒ returns `[]` **and never calls `searchByEmbedding`** (smart search
  disabled path).
- `resolveEmbedding` rejects ⇒ the rule surfaces `[]` rather than throwing (defence in depth).
- returns `[]` when the year yields `MIN_ASSETS - 1` assets; fires at exactly `MIN_ASSETS`.
- searches exactly `MAX_YEARS_BACK` years, never the current year, and passes a `takenBefore`
  clamped to `target` for the most recent year.
- emits **one** candidate even when two years qualify (the higher score wins).
- caps `assetIds` at `ASSET_CAP` and preserves chronological order.
- passes `size: FETCH_SIZE` through to the port (the rule never sees `maxDistance` — §4.2).

### 5.5 `theme-search.adapter.spec.ts`

- returns `null` from `resolveEmbedding` when `isSmartSearchEnabled` is false; `encodeText` not called.
- calls `encodeText` **once** for two identical `(modelName, themeKey)` requests (cache hit).
- calls `encodeText` **again** when `clip.modelName` changes (cache key includes the model).
- returns `null` and logs when `encodeText` rejects.
- `searchByEmbedding` forwards `userIds: [ownerId]`, `type: Image`, `visibility: Timeline`,
  the date bounds, `size`, and `maxDistance`; maps rows to `{ id, localDateTime }`.

### 5.6 `video-moments.rule.spec.ts`

- returns `[]` on any `target.day !== 8` (assert at least days 1, 7, 9, 15).
- **fires** on day 8: exact `title`, `subtitle`, `score`, `dedupeKey`, `visibleForDays`.
- duration band boundaries: `2_999` ms excluded, `3_000` included, `180_000` included,
  `180_001` excluded, `null` excluded.
- returns `[]` at `MIN_ASSETS - 1` surviving videos; fires at exactly `MIN_ASSETS`.
- favourites are selected first, then non-favourites fill to `ASSET_CAP`; final order is chronological.
- `favoriteCount` contributes to `score` (pin an exact value).
- subtitle pluralization: `1 video` vs `6 videos`.
- skips current/future years; caps at `MAX_YEARS`.
- passes `type: AssetType.Video` to the repository (assert the call argument).

### 5.7 Registry & metadata specs (extend existing)

- `memory-type.metadata.spec.ts`: the three new keys exist, `kind: 'rule'`,
  `defaultEnabled: true`, `adminConfigurable: true`; `buildDefaultMemoryTypeMap()` contains them;
  `getMemoryTypeKeyForMemory(MemoryType.Rule, { ruleId: '<key>' })` round-trips.
- `memory-type.registry.spec.ts`: each new key builds a rule whose `id` equals the key; the existing
  **completeness guard** (`createMemoryRules(MEMORY_TYPE_KEYS, deps)` returns one rule per
  `kind: 'rule'` entry) must be updated for the new count and continues to catch a metadata entry
  with no factory.
- `preferences.spec.ts`: default `memories.types` gains the three keys.
- `server.service.spec.ts`: the exact `toEqual` on `availableMemoryTypes` gains the three keys **in
  registry order**.

### 5.8 Medium tests (real DB)

`server/test/medium/specs/repositories/asset.repository.spec.ts` — extend
`describe('getMemoryAssetsForPeriod')`:

- returns `type` and `duration` on each row.
- `type: AssetType.Video` returns only videos; omitting `type` returns both (proves the filter is
  opt-in and existing callers are unaffected).
- a video with `duration: null` is still returned by the query (the band filter is the rule's job,
  not the query's).

`server/test/medium/specs/services/memory.service.spec.ts` — one positive + one negative per rule,
following the tier-2 pattern:

- `video_moments`: seeded videos in the target month of a past year on day 8 → a memory row with the
  expected `data.ruleId`, `title`, and asset set; **negative** — same data on day 7 → no memory.
- `trip_anniversary`: seeded away-from-home multi-day cluster plus a home baseline → memory;
  **negative** — same cluster with `dayCount: 1` → no memory.
- `themed`: exercised with a **stubbed `ThemeSearchPort`** (medium tests must not require a live ML
  service); positive returns ids, negative returns `null` embedding → no memory.

### 5.9 Web & e2e

- `MemoriesSettings.spec.ts`: switch count grows by 3; each new key renders on by default and toggles
  into `configToEdit.memories.types[key]`.
- `e2e/src/specs/server/api/server.e2e-spec.ts`: `availableMemoryTypes` fixture gains the three keys.
  **This file is not covered by the server unit suite — update it in the same slice as the metadata.**

### 5.10 Mobile

- `NativeVideoViewer` defaults `forceAutoPlay` to `false` (constructor default assertion).
- `DriftMemoryCard` constructs `NativeVideoViewer` with `forceAutoPlay: true` for a video asset —
  a widget test locating `find.byType(NativeVideoViewer)` and reading the widget's field.

> **Honest constraint:** `NativeVideoViewer` initialises a platform video controller on mount, so a
> full pump may be flaky in CI. If the widget test proves unstable, downgrade it to a
> **construction-only** assertion (build the widget tree without pumping frames) and record the
> manual verification steps in the PR. Do **not** paper over a flaky test with a retry — per fork
> policy, flakes are fixed at the root or the test is scoped down deliberately.

### 5.11 Edge-case catalog (each needs a test)

| #   | Edge case                                          | Handling                                             | Covered in    |
| --- | -------------------------------------------------- | ---------------------------------------------------- | ------------- |
| 1   | No geotagged on-this-day assets                    | probe short-circuits, zero cluster queries           | 5.3           |
| 2   | Ambiguous home (two countries)                     | `inferHome` → `null`, year skipped                   | 5.2, 5.3      |
| 3   | Trip mid-stay (arrived before the anniversary)     | `GAP_DAYS` pre-window ⇒ `firstDate` guard rejects    | 5.2, 5.3      |
| 4   | Trip longer than `TRIP_WINDOW_DAYS`                | measured span truncates; still fires                 | 5.3           |
| 5   | `trip_anniversary` vs `on_this_day_place` same day | shared `place_day:` key; higher score wins           | 5.3           |
| 6   | Smart search disabled / ML down                    | `resolveEmbedding` → `null` ⇒ `[]`, no search issued | 5.4, 5.5      |
| 7   | CLIP model changed                                 | cache key includes `modelName` ⇒ re-encode           | 5.5           |
| 8   | Theme yields too few matches                       | `MIN_ASSETS` boundary                                | 5.4           |
| 9   | Same theme+year already surfaced                   | `hasRuleMemory` on stable `dedupeKey`                | 5.4, 5.8      |
| 10  | Video with `null` duration                         | excluded by the band, query still returns it         | 5.6, 5.8      |
| 11  | 1-second accidental clip / 10-minute recording     | duration band boundaries                             | 5.6           |
| 12  | Only one video in the month                        | `MIN_ASSETS` boundary ⇒ no memory                    | 5.6           |
| 13  | Existing rules see new `MemoryPeriodAsset` fields  | additive select; tier-1 specs stay green unchanged   | 5.8, gates    |
| 14  | Multi-day rules contending for a trigger day       | day 8 staggering vs days 1/15/20                     | 5.6           |
| 15  | User has autoplay disabled globally                | `forceAutoPlay` overrides in the memory card         | 5.10          |
| 16  | New type missing from the e2e fixture              | explicit checklist item (§3.1 row 10)                | 5.9           |
| 17  | Future-dated assets                                | `takenBefore: target.endOf('day')` on every query    | 5.3, 5.4, 5.6 |

## 6. Verification gates (before PR)

Run from the repo root unless stated:

```bash
cd server && pnpm test -- --run src/services/memory-rules/          # all rule + util specs
cd server && pnpm test -- --run src/utils/preferences.spec.ts src/services/server.service.spec.ts
cd server && pnpm test:medium -- --run test/medium/specs/repositories/asset.repository.spec.ts
cd server && pnpm test:medium -- --run test/medium/specs/services/memory.service.spec.ts
cd server && pnpm check                                             # tsc --noEmit
cd server && npx prettier --check <every modified server file>      # eslint green != prettier green
make lint-server
cd web && pnpm test -- --run src/routes/admin/system-settings/MemoriesSettings.spec.ts
make check-web
cd mobile && dart analyze --fatal-infos lib test && dart format --set-exit-if-changed .
npx prettier --check "docs/**/*.md"                                 # CI Docs Build is strict
```

Plus:

- `make sql` **against a running dev DB only**, then verify the `asset.repository.sql` diff is limited
  to the new columns / predicate.
- Feature branches trigger **no** CI on push — dispatch explicitly:
  `gh workflow run test.yml --ref feat/memory-types-tier3` (and check job-level status; a run-level
  "success" can hide a failed job).

## 7. Implementation slices (for `/impl-loop`)

Each slice is independently green, independently committable, and ordered so foundations land first.

### Slice 1 — `getMemoryAssetsForPeriod` returns `type` + `duration`

**Files:** `asset.repository.ts` (interfaces + query), medium spec.
**Red:** `cd server && pnpm test:medium -- --run test/medium/specs/repositories/asset.repository.spec.ts` — new cases from §5.8.
**Green:** add the two selected columns + the optional `type` predicate.
**Verify:** medium green; **all tier-1 rule specs still green unchanged**; `pnpm check`; `make sql` on a live DB.
**Commit:** `feat(memories): return asset type and duration from getMemoryAssetsForPeriod`

### Slice 2 — `video_moments` rule (end-to-end; pattern-setter for the 16 sites)

**Files:** `video-moments.rule.ts` + spec, metadata, registry (+ their specs), `preferences.spec.ts`,
`server.service.spec.ts`, e2e fixture, `MemoriesSettings.svelte` + spec, `i18n/en.json`.
**Red:** `cd server && pnpm test -- --run src/services/memory-rules/video-moments.rule.spec.ts` — §5.6.
**Green:** implement the rule and register the key at **all 16 sites** (§3.1).
**Verify:** §6 server + web gates; e2e fixture updated.
**Commit:** `feat(memories): add video_moments memory type`

### Slice 3 — Mobile force-autoplay in the memory viewer

**Files:** `video_viewer.widget.dart`, `memory_card.widget.dart`, mobile test.
**Red:** mobile test from §5.10 (see the honest-constraint note).
**Green:** add `forceAutoPlay` + pass `true` from the memory card.
**Verify:** `dart analyze --fatal-infos lib test`; `dart format --set-exit-if-changed .`.
**Commit:** `fix(mobile): force autoplay for videos in the memory viewer`

### Slice 4 — `trip.util.ts` (pure) + `recent_trip` refactor

**Files:** `trip.util.ts` + spec; refactor `recent-trip.rule.ts` onto the shared helpers (deleting its
private `curateTripAssets`/`collapseBurstAssets`/`groupAssetsByDay`/`pickDayCoverage` and its
duplicate `pickEvenlySpaced`).
**Red:** `cd server && pnpm test -- --run src/services/memory-rules/trip.util.spec.ts` — §5.2.
**Green:** implement the helpers, then rewire `recent-trip.rule.ts`.
**Verify:** `recent-trip.rule.spec.ts` passes **unchanged** — it is the regression guard for the refactor.
**Commit:** `refactor(memories): extract shared trip detection and curation helpers`

### Slice 5 — `trip_anniversary` rule + shared place-day dedupe

**Files:** `trip-anniversary.rule.ts` + spec; `on-this-day-place.rule.ts` (**two** changes: dedupeKey
→ shared `place_day:` namespace via `placeKeyOf`, and cap the count term at `Math.min(count, 30)`)

- its spec; the 16 registration sites.
  **Red:** `cd server && pnpm test -- --run src/services/memory-rules/trip-anniversary.rule.spec.ts` — §5.3.
  **Green:** implement the rule; change the `on_this_day_place` key **and** score cap; register everywhere.
  **Verify:** the cross-rule key-equality test **and** the scoring-invariant test (§5.3) pass;
  `on-this-day-place.rule.spec.ts` updated for the new key format and the capped score only — no other
  behavior change.
  **Commit:** `feat(memories): add trip_anniversary memory type`

### Slice 6 — Theme catalog + `ThemeSearchPort` + adapter

**Files:** `theme.catalog.ts` (+ spec for rotation), `theme-search.port.ts`,
`theme-search.adapter.ts` + spec; `config.ts` + `system-config.dto.ts` for
`memories.themeMaxDistance`; SDK regeneration.
**Red:** `cd server && pnpm test -- --run src/services/memory-rules/theme-search.adapter.spec.ts` — §5.5.
**Green:** implement catalog + adapter + config field.
**Verify:** `pnpm check`; regenerate the SDK (`cd server && pnpm build && pnpm sync:open-api`, then
`make open-api-typescript`) and commit the generated output.
**Commit:** `feat(memories): add theme catalog and smart-search port for themed memories`

### Slice 7 — `themed` rule (end-to-end)

**Files:** `themed.rule.ts` + spec; `memory.service.ts` (construct + memoize the adapter, pass into
`getMemoryRules` deps); `memory-type.registry.ts` (`MemoryRuleDeps.themeSearchPort`); the 16 sites.
**Red:** `cd server && pnpm test -- --run src/services/memory-rules/themed.rule.spec.ts` — §5.4.
**Green:** implement the rule and wire the adapter through the service.
**Verify:** **existing `memory.service.spec.ts` spies on `getMemoryRules`/`createRuleMemories` are
arg-agnostic — confirm they stay green unchanged**; full server suite.
**Commit:** `feat(memories): add themed memory type backed by smart search`

### Slice 8 — Calibration, medium tests, docs, roadmap

**Files:** medium `memory.service.spec.ts` cases (§5.8), `docs/docs/features/memories.md`,
`docs/docs/install/config-file.md`, roadmap Status column.
**Red:** the medium generation tests (positive + negative per rule).
**Green:** make them pass; write the docs.
**Calibration (gates merge):** deploy an RC to the personal instance (real photos) and tune
`memories.themeMaxDistance`:

1. For each of the 6 themes, run the themed search against a real library at candidate thresholds
   (e.g. `0.22 / 0.26 / 0.30 / 0.34`).
2. Record, per theme, how many assets return and eyeball precision on the top 16.
3. Pick the highest threshold at which **no theme returns obvious false positives** in its top 16;
   record the chosen default and the per-theme counts in the PR description.
4. If a theme cannot be made precise at any threshold, **drop that theme from the catalog** rather
   than loosening the global default.

**Verify:** every gate in §6.
**Commit:** `docs(memories): document tier 3 memory types and calibrate theme threshold`

### Slice dependency graph

```
Slice 1 ──▶ Slice 2 ──▶ Slice 3
Slice 4 ──▶ Slice 5
Slice 6 ──▶ Slice 7
Slices 2,5,7 ──▶ Slice 8
```

Slices 1–3, 4–5 and 6–7 are three independent chains and may be implemented in any interleaving.

## 8. Open tasks / follow-ups (explicitly out of scope)

| Item                                                                    | Why deferred                                                                                                                                                            |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile memory viewer has **no auto-advance timer** at all               | Pre-existing, affects every memory type, not just video. `DriftMemoryCard.onVideoEnded` is already plumbed but unused by `drift_memory.page.dart` — a natural follow-up |
| Web: cap the progress timer for very long videos                        | `MemoryViewer.svelte:120-125` uses full `asset.duration`; only matters once long videos actually surface                                                                |
| Per-theme thresholds instead of one global `themeMaxDistance`           | Start simple; revisit if calibration shows themes diverging widely                                                                                                      |
| Widening `themed` beyond `MAX_YEARS_BACK = 3` as libraries age          | Cheap to raise later; keeps night-time cost bounded now                                                                                                                 |
| Roadmap #8 (Shot on camera/lens), #9 (Someone you haven't seen), #12–14 | Not in this batch; #9 in particular needs a sensitivity frame                                                                                                           |
| `statistics()` still counts memories of disabled types                  | Pre-existing documented limitation from the config-driven design                                                                                                        |
