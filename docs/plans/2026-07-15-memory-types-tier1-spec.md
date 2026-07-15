# Tier 1 Memory Types — Design & Test Spec

> Implements the four 🟢 Tier-1 rules from the
> [memory types roadmap](./2026-07-15-memory-types-roadmap.md): Favorites throwback,
> This month X years ago, On this day in a place, Season recap.
> Approach: **test-driven, behavior-driven, full edge-case coverage.**
> Created 2026-07-15.

## 1. Goal & non-goals

**Goal:** add four low-risk `MemoryRule`s that keep the memories surface populated with
emotionally resonant, anniversary-flavored memories, reusing the existing rule engine and
**one** new parametric repository query.

**Non-goals (this slice):**

- No ML, embeddings, tags, faces, or camera/gear grouping (those are later tiers).
- No localization of memory _content_ (titles/subtitles stay English, matching existing
  rules). Settings _labels_ are localized.
- No changes to the memory _viewer_ (web/mobile render rule memories generically).
- No change to `RULE_DAILY_LIMIT`, the daily-limit counting, or the memory
  generation/cleanup scheduling. The only service change is a small one: rule candidates
  may declare a multi-day visibility window (see §3.2).

## 2. Design decisions (please confirm on review)

These are the choices that shaped the spec. Each has a default I recommend; flag any you
want changed and I'll revise before implementation.

| ID  | Decision                     | Chosen default                                                                                                                                                                                                                                               | Alternative                                              |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| D1  | **Trigger cadence + window** | Anniversary-anchored & staggered triggers: #3 daily · #2 on the 1st · #1 on the 15th · #4 on each season's first day. The three recaps stay **visible for a multi-day window** (§3.2), not just the trigger day; #3 stays single-day (it regenerates daily). | Emit-always + cooldown model (like `recent_trip`)        |
| D2  | **One shared query**         | Single parametric `getMemoryAssetsForPeriod` serves all four; rules group/curate/score in TS                                                                                                                                                                 | Four bespoke queries                                     |
| D3  | **Memory content i18n**      | Hardcoded English titles/subtitles (consistent with `birthday`/`recent_trip`)                                                                                                                                                                                | Introduce a content-localization mechanism (own project) |
| D4  | **Default enabled**          | All four `defaultEnabled: true`, `adminConfigurable: true`                                                                                                                                                                                                   | Ship #4 (season) OFF by default, more conservative       |
| D5  | **Season model**             | Meteorological seasons, N-hemisphere, with winter (Dec–Feb) cross-year grouping                                                                                                                                                                              | Calendar quarters (no cross-year), or hemisphere-aware   |
| D6  | **#1 vs #2 overlap**         | Accept it; the 15th/1st stagger stops same-day stacking, different `dedupeKey`s, favorites score higher                                                                                                                                                      | Suppress #2 for a month already covered by #1            |
| D7  | **Scoring/thresholds**       | The constants in §5 (tunable; birthday ≈ 250–360+ stays top, favorites ≈ 200–270, recaps ≈ 80–150 mid; a heavily-favorited month can edge a thin `birthday` fallback — accepted, both are good memories)                                                     | Any other numbers                                        |

## 3. Architecture

```
memory.service.ts  (small change: honors candidate.visibleForDays → hideAt window)
  └─ createRuleMemories → evaluateRuleCandidates → rule.evaluate({ ownerId, target })
        ├─ FavoritesThrowbackMemoryRule   (id "favorites_throwback")
        ├─ MonthRecapMemoryRule           (id "month_recap")
        ├─ OnThisDayPlaceMemoryRule       (id "on_this_day_place")
        └─ SeasonRecapMemoryRule          (id "season_recap")
             each → assetRepository.getMemoryAssetsForPeriod(ownerId, {...})
             each → curation.util (pickEvenlySpaced / sampleAssetsByTime)
```

**No rule needs `memoryRepository`** — `hasRuleMemory(ownerId, ruleId, dedupeKey)` in the
service already guarantees a given (year/month/place) memory is inserted at most once, so
rules are pure functions of `(ownerId, target, query results)`. Each rule's constructor
takes only `Pick<AssetRepository, 'getMemoryAssetsForPeriod'>`, which keeps unit tests
trivial to mock.

### 3.1 New/changed files

**Server — source**

| File                                                    | Change                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/repositories/asset.repository.ts`                  | Add `getMemoryAssetsForPeriod` + `MemoryPeriodAsset` interface                            |
| `src/services/memory-rules/curation.util.ts`            | New: `pickEvenlySpaced`, `sampleAssetsByTime`, `medianTime`, `dominantBy`, `recencyBonus` |
| `src/services/memory-rules/favorites-throwback.rule.ts` | New rule                                                                                  |
| `src/services/memory-rules/month-recap.rule.ts`         | New rule                                                                                  |
| `src/services/memory-rules/on-this-day-place.rule.ts`   | New rule                                                                                  |
| `src/services/memory-rules/season-recap.rule.ts`        | New rule                                                                                  |
| `src/services/memory-rules/season.util.ts`              | New: season ↔ months + `seasonOf`, `seasonYearOf`, `seasonStartingOn`, `isSeasonStart`    |
| `src/services/memory-rules/memory-rule.interface.ts`    | Add optional `visibleForDays?: number` to `MemoryRuleCandidate`                           |
| `src/services/memory.service.ts`                        | `createRuleMemories`: derive `hideAt` from `candidate.visibleForDays` (§3.2)              |
| `src/services/memory-rules/memory-type.metadata.ts`     | Add 4 `MEMORY_TYPE_METADATA` entries                                                      |
| `src/services/memory-rules/memory-type.registry.ts`     | Add 4 `RULE_FACTORIES` entries                                                            |

**Server — tests**

| File                                                      | Change                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `.../favorites-throwback.rule.spec.ts`                    | New (unit, BDD)                                                          |
| `.../month-recap.rule.spec.ts`                            | New (unit, BDD)                                                          |
| `.../on-this-day-place.rule.spec.ts`                      | New (unit, BDD)                                                          |
| `.../season-recap.rule.spec.ts`                           | New (unit, BDD)                                                          |
| `.../curation.util.spec.ts`                               | New (unit)                                                               |
| `.../season.util.spec.ts`                                 | New (unit)                                                               |
| `.../memory-type.metadata.spec.ts`                        | Extend: assert 4 new keys, defaults, `getMemoryTypeKeyForMemory`         |
| `.../memory-type.registry.spec.ts`                        | Extend: assert factories build the right rule for each new key           |
| `src/services/memory.service.spec.ts`                     | Extend: `visibleForDays` → correct `hideAt`; default (absent) → 1-day    |
| `test/repositories/asset.repository.mock.ts`              | Add `getMemoryAssetsForPeriod: vitest.fn()` (service spec depends on it) |
| `test/medium/specs/repositories/asset.repository.spec.ts` | New `describe('getMemoryAssetsForPeriod')` medium test (real DB)         |

**Web**

| File                                                       | Change                                                |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| `src/routes/admin/system-settings/MemoriesSettings.svelte` | Add 4 keys to the hardcoded `memoryTypeKeys` array    |
| `i18n/en.json`                                             | 16 new keys (admin label+desc ×4, user label+desc ×4) |

**Verify (no code expected, but confirm):** mobile memory-type settings enumeration.
If mobile reads `availableMemoryTypes` like web user settings, only strings are needed;
if it hardcodes a list, it needs the same 4-key edit. Captured as a task in §8.

### 3.2 Multi-day visibility window

A memory surfaces while `showAt <= now` and (`hideAt is null` or `hideAt >= now`)
(`memory.repository.ts` `baseSearchBuilder`). Today every rule memory is pinned to its
trigger day (`showAt = target.startOf('day')`, `hideAt = target.endOf('day')`), so a
monthly recap generated on the 1st would vanish on the 2nd. To let recaps linger:

- Add optional `visibleForDays?: number` to `MemoryRuleCandidate` (**default 1** — existing
  `birthday`/`recent_trip` behavior is unchanged).
- In `createRuleMemories`, keep `showAt = target.startOf('day')` and compute
  `hideAt = target.startOf('day').plus({ days: (candidate.visibleForDays ?? 1) - 1 }).endOf('day')`.

**Windows chosen:** `month_recap` 7 days, `favorites_throwback` 7 days, `season_recap`
10 days, `on_this_day_place` 1 day (it is date-anchored and regenerates every day, so it
does not need a window).

**Daily-limit interaction (unchanged logic, documented):** `RULE_DAILY_LIMIT` (2) is
enforced by counting rule memories **visible on `target`** (`search({ type: Rule, for:
target })`). A multi-day recap therefore holds one of the two slots for its whole window.
Because the daily rules (`on_this_day_place`, `birthday`, `recent_trip`) are 1-day and do
not accumulate, one active recap still leaves a slot free each day for a daily memory. The
only crunch is when **two** recaps overlap — the four season-starts, where `month_recap`
(days 1–7) and `season_recap` (days 1–10) coincide — during which the two recaps can take
both slots and briefly suppress `on_this_day_place`. This is rare (~4×/yr), self-healing,
and no worse than an existing birthday+trip day. If it ever matters, bumping
`RULE_DAILY_LIMIT` to 3 is the lever — **explicitly out of scope here** (flagged in §8).

## 4. Shared repository query

```ts
export interface MemoryPeriodAsset {
  id: string;
  localDateTime: Date; // interpreted at UTC, matching getByDayOfYear
  year: number; // EXTRACT(year FROM localDateTime AT TIME ZONE 'UTC')
  country: string | null;
  city: string | null;
  isFavorite: boolean;
}

// asset.repository.ts
getMemoryAssetsForPeriod(
  ownerId: string,
  options: {
    months: number[];        // 1..12, calendar months to include
    day?: number;            // optional day-of-month filter (on-this-day)
    favoritesOnly?: boolean;  // default false
    takenBefore: Date;        // exclude current-day/future assets
  },
): Promise<MemoryPeriodAsset[]>
```

**Query shape** (mirrors the conventions in `getByDayOfYear` / `getMemoryLocationClusters`):

- `asset` join `asset_exif` (LEFT — non-geotagged assets still returned with null city).
- `asset.ownerId = ownerId`, `visibility = Timeline`, `deletedAt is null`.
- `EXISTS` a `Preview` `asset_file` (same guard the other memory queries use).
- `localDateTime <= takenBefore`.
- `EXTRACT(MONTH FROM (localDateTime at time zone 'UTC')) = ANY(months)`.
- `$if(day)` → `EXTRACT(DAY FROM (localDateTime at time zone 'UTC')) = day`.
- `$if(favoritesOnly)` → `asset.isFavorite = true`.
- Select `id`, `localDateTime`, `year` (extracted), `asset_exif.city`, `asset_exif.country`,
  `asset.isFavorite`.
- Order by `localDateTime` ascending (rules re-sort/sample anyway; ascending keeps the
  medium-test assertions readable).
- **No flat total `LIMIT`.** The rules derive counts from these rows to test thresholds
  (`>= 10`, `>= 15`, …), so a total cap ordered by time would silently drop whole
  year-groups (e.g. drop the newest years) and corrupt those counts — the exact bug the
  per-year lateral `LIMIT` in `getByDayOfYear` avoids. The slice is naturally bounded (one
  calendar month, or one day, for a single user, across all years) and this runs in a
  background job. If a pathological library ever makes the row count a problem, the fix is a
  **per-group** lateral cap (like `getByDayOfYear`), not a flat total cap — noted in §8.
- Decorated with `@GenerateSql` (so `make sql` snapshots it) using `DummyValue`s.

Rules pass `takenBefore = target.endOf('day')` and **drop `year >= target.year`** in TS
(prior years only — matches on-this-day's `year - 1` upper bound). No current-year memory.
`takenBefore` is a defensive guard against future-dated assets; the year-drop is what
actually excludes the current period.

## 5. Per-rule behavior

Shared conventions: `ruleId === metadata key`. `memoryAt` is a representative time within
the memory's period. `dedupeKey` is stable across days so a memory inserts once. All
constants below are the values referenced by the tests; treat them as the spec's contract.

### 5.1 `on_this_day_place` — "On this day in [city]"

- **Trigger:** every day.
- **Query:** `{ months: [target.month], day: target.day, takenBefore: target.endOf('day') }`.
- **Grouping:** drop `year >= target.year`; group remaining by `year`; within a year, find
  the **dominant city** (most geotagged assets; ignore null-city assets).
- **Emit when:** dominant city has `>= MIN_ASSETS (4)` **and** is a clear majority
  (`count / geotaggedDayPhotosThatYear >= 0.6`, inclusive). One candidate per qualifying
  year; emit the **top `MAX_YEARS (3)`** by score (bounds candidate volume — see note).
- **`placeKey`** = `` `${country ?? ''}:${city}`.toLowerCase() `` (country-qualified so two
  same-named cities in different countries don't collide in the dedupe key).
- **Fields:**
  - `title`: `On this day in ${city}`
  - `subtitle`: `${count} photos from ${year}`
  - `memoryAt`: `target.set({ year })`
  - `dedupeKey`: `on_this_day_place:${year}-${MM}-${dd}:${placeKey}`
  - `score`: `100 + count * 3 + recencyBonus(year, target)`
  - `assetIds`: **only the dominant-city assets** for that year → `sampleAssetsByTime(cap = 8)`
    (not the whole day)
  - `visibleForDays`: **1** (omit — date-anchored, regenerates daily)
- **Determinism:** on a dominant-city tie, pick the greater count then the lexicographically
  smaller city (so tests and reruns are stable).
- **Candidate-volume note:** unlike the recaps, `on_this_day_place` is single-day, so any
  candidate not picked into the 2 daily slots is lost until the date recurs next year (it
  cannot drain over following days via dedupe). The `MAX_YEARS` cap and score ordering mean
  the best place-year(s) for a given day surface; this is intended, not a regression.

### 5.2 `month_recap` — "[Month] [Year]"

- **Trigger:** `target.day === 1`. **Guard first:** if the day doesn't match, `return []`
  _before_ touching the repository (the "no repo call" test asserts this).
- **Query:** `{ months: [target.month], takenBefore: target.endOf('day') }`.
- **Grouping:** drop `year >= target.year`; group by `year`.
- **Emit when:** a year has `>= MIN_ASSETS (10)`. Emit the **top `MAX_YEARS (3)`** years by
  score (bounds backlog flood).
- **Fields:**
  - `title`: `${MonthName} ${year}` (e.g. `July 2023`)
  - `subtitle`: `${count} photos`
  - `memoryAt`: `medianTime` of that year's month assets
  - `dedupeKey`: `month_recap:${year}-${MM}`
  - `score`: `80 + min(count, 30) + recencyBonus(year, target)`
  - `assetIds`: `sampleAssetsByTime(cap = 24)`
  - `visibleForDays`: **7** (visible through the first week of the month)

### 5.3 `favorites_throwback` — "Favorite moments from [Month] [Year]"

- **Trigger:** `target.day === 15` (offset from #2's 1st so they never stack same-day).
  **Guard first:** wrong day → `return []` before querying.
- **Query:** `{ months: [target.month], favoritesOnly: true, takenBefore: target.endOf('day') }`.
- **Grouping:** drop `year >= target.year`; group by `year`.
- **Emit when:** a year has `>= MIN_FAVORITES (4)`. Emit top `MAX_YEARS (3)` by score.
- **Fields:**
  - `title`: `Favorite moments from ${MonthName} ${year}`
  - `subtitle`: `${count} favorites`
  - `memoryAt`: `medianTime` of that year's favorites
  - `dedupeKey`: `favorites_throwback:${year}-${MM}`
  - `score`: `200 + min(count, 20) * 3 + recencyBonus(year, target)` (favorites rank high —
    curated; the `min` cap keeps a heavily-favorited month from outscoring `birthday`'s rich path)
  - `assetIds`: `sampleAssetsByTime(cap = 12)`
  - `visibleForDays`: **7** (visible through the second half of the month)

### 5.4 `season_recap` — "[Season] [Year]"

- **Trigger:** first day of a meteorological season → `target.day === 1 && target.month ∈ {3,6,9,12}`.
  **Guard first:** `seasonStartingOn(target)` returns `null` off a season-start day →
  `return []` before querying.
- **Season → months** (N hemisphere): Spring `[3,4,5]`, Summer `[6,7,8]`,
  Autumn `[9,10,11]`, Winter `[12,1,2]`. `seasonStartingOn(target)` gives the starting season.
- **Query:** `{ months: seasonMonths, takenBefore: target.endOf('day') }`.
- **Grouping:** map each asset to its **season-year** via `seasonYearOf(month, year)` (season
  derived from `month` internally) — for Winter, Jan/Feb belong to the previous December's
  winter (`seasonYear = year - 1` for Jan/Feb, `= year` for Dec); other seasons
  `seasonYear = year`. **Drop the current season-year** (the season starting today, still in
  progress — e.g. on Dec 1 2026, drop Winter 2026). Group the rest by season-year.
- **Emit when:** a season-year has `>= MIN_ASSETS (15)`. Emit top `MAX_YEARS (2)` by score.
- **Fields:**
  - `title`: `${SeasonName} ${seasonYear}` (e.g. `Summer 2024`)
  - `subtitle`: `${count} photos`
  - `memoryAt`: `medianTime` of that season-year's assets
  - `dedupeKey`: `season_recap:${seasonYear}-${seasonName}`
  - `score`: `90 + min(count, 40) + recencyBonus(seasonYear, target)`
  - `assetIds`: `sampleAssetsByTime(cap = 30)`
  - `visibleForDays`: **10** (a season is long; a longer welcome-to-the-season window)
- **Limitation:** N-hemisphere seasons only (documented). A future hemisphere-aware
  version can key off the user's home country/latitude.

### 5.5 Shared helpers (`curation.util.ts`)

- `pickEvenlySpaced<T>(items: T[], count: number): T[]` — extracted from the identical logic
  in `recent-trip.rule.ts` (optionally refactor `recent_trip` to import it — flagged
  optional to limit blast radius).
- `sampleAssetsByTime(assets: {id; localDateTime}[], cap: number): string[]` — sort by time
  ascending, evenly sample to `cap`, return ids in chronological order.
- `medianTime(assets: {localDateTime}[]): Date` — the lower-middle `localDateTime` after
  sorting ascending (used for `memoryAt` in the recap rules). Empty input is unreachable
  (rules only build a candidate once past the min-count gate).
- `dominantBy<T>(items: T[], key: (t: T) => string): { key; items; ratio }` — groups by
  `key`, returns the largest group with its share of the total; used by `on_this_day_place`
  for the dominant-city test. Tie-break: larger group, then lexicographically smaller key.
- `recencyBonus(year, target): number` = `max(0, 10 - (target.year - year))` — small nudge so
  newer memories edge out older ones without overpowering `count`.

## 6. Test plan (TDD / BDD)

### 6.0 TDD build order (red → green → refactor per unit)

Build bottom-up so each unit is real before its consumer is tested. For **every** unit:
write the spec, run it and watch it **fail for the right reason**, implement the minimum to
pass, then refactor with the test green.

1. `curation.util` (pure — no deps) → `curation.util.spec.ts`
2. `season.util` (pure) → `season.util.spec.ts`
3. `getMemoryAssetsForPeriod` + `MemoryPeriodAsset` → medium DB test; add the
   `asset.repository.mock.ts` entry so downstream mocks compile
4. the four rules (each mocks only `getMemoryAssetsForPeriod`) → four `.rule.spec.ts`
5. `memory-rule.interface.ts` field + `memory.service.ts` window → extend
   `memory.service.spec.ts`
6. registry + metadata → extend the two existing specs
7. web `MemoriesSettings.svelte` + `en.json` labels (no logic; verified via `check:svelte`)

### Conventions (match the existing rule specs)

Write tests **first**. Mirror `birthday.rule.spec.ts` / `recent-trip.rule.spec.ts`
exactly: construct the rule directly with inline `vi.fn()` mocks cast `as never` (no
`newTestService` for rule units), drive it with a fixed
`DateTime.fromISO('2026-07-15', { zone: 'utc' })` target — never `DateTime.now()` — and
assert the candidate with `toMatchObject`, **including the exact numeric `score`** (the
existing specs assert `score: 254`, so ours must pin exact scores too). The service and
registry/metadata specs use their existing harnesses (`newTestService`, direct imports).

### 6.1 Unit — each rule `.spec.ts`

BDD structure (`describe` = "given …", `it` = "then …"); the bullets below are the
then-assertions:

**`favorites_throwback.rule.spec.ts`**

- given the target day is not the 15th → emits no candidates (and does **not** hit the repo).
- given the target is the 15th and ≥ 4 favorites exist in a prior-year copy of this month →
  emits one candidate for that year; title/subtitle/memoryAt/dedupeKey/score match §5.3.
- given favorites across three prior years → emits three candidates, sorted by score desc.
- given favorites across five prior years → emits only the top `MAX_YEARS (3)`.
- given a year with exactly 3 favorites → that year is skipped (below `MIN_FAVORITES`).
- given a year with exactly 4 favorites → included (inclusive threshold boundary).
- given only current-year favorites (`year === target.year`) → emits nothing.
- given non-favorite assets leak through (defensive) → they're ignored (query already
  filters, but the rule must not assume ordering).
- given more than 12 favorites in a year → `assetIds.length === 12`, chronological, evenly
  sampled.
- `dedupeKey` is stable for the same (year, month) across different target days.

**`month_recap.rule.spec.ts`**

- given `target.day !== 1` → no candidates, no repo call.
- given ≥ 10 photos in a prior-year copy of this month → one candidate; fields per §5.2.
- given four qualifying years → only top `MAX_YEARS (3)` emitted, score-sorted.
- given a year with 9 photos → skipped; given exactly 10 → included (inclusive boundary).
- given only current-year photos → nothing.
- given > 24 photos → `assetIds.length === 24`, chronological.
- newer year outscores older year at equal count (recencyBonus).

**`on_this_day_place.rule.spec.ts`**

- given prior-year photos on this day dominated (≥ 60%, ≥ 4) by one city → one candidate;
  fields per §5.1; `title` names the city.
- given photos split across cities with no ≥ 60% majority → no candidate for that year.
- given exactly 60% in the dominant city (and ≥ 4) → candidate (inclusive boundary).
- given ≥ 4 in the dominant city but it's only 50% → no candidate (majority gate).
- given a dominant city that is ≥ 60% but has only 3 photos → no candidate (`MIN_ASSETS`).
- given a qualifying year with a second, minor city that day → `assetIds` contains **only**
  the dominant-city assets, not the whole day.
- given all photos ungeotagged (null city) → no candidate.
- given two years each with a dominant city → two candidates.
- given four qualifying years → only top `MAX_YEARS (3)` emitted.
- given a dominant-city tie (equal counts) → deterministic pick (greater count, then
  lexicographically smaller city).
- given only current-year photos → nothing.
- given a leap-day target (Feb 29) → no crash; queries `day: 29, month: 2`.
- `memoryAt` is `target.set({ year })`; `dedupeKey` includes month, day, and place.

**`season_recap.rule.spec.ts`**

- given `target` is not a season start (e.g. day 2, or Jan 1) → no candidates, no repo call.
- given `target` is Jun 1 and a prior summer has ≥ 15 photos → one `Summer <year>` candidate.
- **winter cross-year:** given `target` is Dec 1 2026 and photos exist in Dec 2024 +
  Jan/Feb 2025 → they group into **one** `Winter 2024` season-year candidate (Jan/Feb 2025
  map to seasonYear 2024).
- given a season-year with 14 photos → skipped; exactly 15 → included (inclusive boundary).
- given three qualifying season-years → only top `MAX_YEARS (2)` emitted.
- given only the current (in-progress) season-year → nothing (e.g. Dec 1 2026 drops Winter 2026).
- given > 30 photos → `assetIds.length === 30`.
- `seasonStartingOn(Mar 1)=Spring`, `(Jun 1)=Summer`, `(Sep 1)=Autumn`, `(Dec 1)=Winter`.

### 6.2 Unit — `curation.util.spec.ts`

- `pickEvenlySpaced`: count ≤ 0 → `[]`; count ≥ length → all; count === 1 → middle element;
  count === 2 → first & last; even spacing for count between (parity with the current
  `recent_trip` behavior — port its existing cases).
- `sampleAssetsByTime`: unsorted input → chronological output; cap larger than input → all;
  cap === 0 → `[]`; stable ids.
- `medianTime`: odd count → middle; even count → lower-middle; unsorted input handled.
- `dominantBy`: single group → ratio 1; tie → larger group then lexicographically smaller
  key; ratio computed against the total.
- `recencyBonus`: same year → 10; 10+ years ago → 0; never negative.

### 6.3 Unit — `season.util.spec.ts`

- `seasonOf(month)` for all 12 months.
- `seasonYearOf(month, year)` — Dec 2024 → 2024; Jan 2025 → 2024; Feb 2025 → 2024;
  Jul 2024 → 2024; Mar 2025 → 2025.
- `seasonStartingOn(target)` — returns the season only on Mar/Jun/Sep/Dec 1 (Spring/Summer/
  Autumn/Winter respectively); **returns `null`** on any other day (e.g. Jun 2, Jan 1).
- `isSeasonStart(target)` — `true` iff `seasonStartingOn(target) !== null`.

### 6.4 Registry & metadata specs (extend existing)

- `memory-type.metadata.spec.ts`:
  - all four new keys present with `kind: 'rule'`, `defaultEnabled: true`,
    `adminConfigurable: true`.
  - `buildDefaultMemoryTypeMap()` includes the four keys → true.
  - `getMemoryTypeKeyForMemory(MemoryType.Rule, { ruleId: 'season_recap' })` → `'season_recap'`
    (and the other three) so the visibility filter resolves them.
  - `getAdminAvailableMemoryTypeKeys({})` (empty config) includes all four (default-on).
  - `isMemoryTypeEnabledForUser(undefined, 'favorites_throwback')` → true.
- `memory-type.registry.spec.ts`:
  - `createMemoryRules(['favorites_throwback','month_recap','on_this_day_place','season_recap'], deps)`
    returns four rules with matching `id`s in registry order.
  - a disabled key is not instantiated.

### 6.5 Medium test — `getMemoryAssetsForPeriod` (real DB)

Using the `test/medium` harness (real Postgres via testcontainers), seed assets with known
`localDateTime`, `isFavorite`, and exif city/country, then assert:

- `months` filter returns only in-month assets; multi-month `months` unions correctly.
- `day` filter narrows to that day-of-month across years.
- `favoritesOnly` returns only favorites.
- `takenBefore` excludes later assets.
- non-geotagged assets returned with `city: null` **and** `country: null` (LEFT join).
- geotagged assets return the correct `city` **and** `country` (place rule needs both).
- `year` is the correct UTC year; assets without a Preview file are excluded; deleted /
  non-Timeline assets excluded; another owner's assets excluded.
- results are ordered by `localDateTime` ascending (so the rules' sampling is deterministic).

### 6.6 Service — visibility window (extend `memory.service.spec.ts`)

Drive `createRuleMemories` with a stubbed rule returning a single candidate and assert the
persisted `showAt`/`hideAt`:

- given a candidate with `visibleForDays: 7` on target `2026-07-01` → `showAt = 2026-07-01
00:00`, `hideAt = 2026-07-07 23:59:59`.
- given a candidate with **no** `visibleForDays` → `hideAt = target.endOf('day')` (1-day;
  proves `birthday`/`recent_trip` behavior is unchanged).
- given a candidate with `visibleForDays: 1` → identical to the no-field case.
- regression: an active multi-day recap counts as one visible rule memory for the daily
  limit on subsequent days (stub `memory.search` to return it for `for: target+1`), leaving
  `remainingSlots = 1` so a daily `on_this_day_place` candidate is still inserted.

### 6.7 Edge cases consolidated (must each have a test)

| Edge case                                      | Owning test       | Expected                             |
| ---------------------------------------------- | ----------------- | ------------------------------------ |
| Wrong trigger day                              | each rule spec    | no candidates, **no repo call**      |
| Empty library / no matching assets             | each rule spec    | `[]`                                 |
| Only current-year assets                       | each rule spec    | `[]` (prior years only)              |
| Below-threshold year                           | each rule spec    | that year skipped                    |
| More qualifying years than `MAX_YEARS`         | all four specs    | capped, score-sorted                 |
| Asset count above cap                          | each rule spec    | `assetIds` capped, chronological     |
| Ungeotagged photos (place rule)                | #3 spec           | no place candidate                   |
| No dominant-city majority                      | #3 spec           | no candidate                         |
| Dominant-city tie                              | #3 spec           | deterministic pick                   |
| Winter Dec/Jan/Feb cross-year grouping         | #4 spec           | single season-year memory            |
| Leap-day target (Feb 29) for place/on-this-day | #3 spec           | handled; no crash                    |
| `dedupeKey` stability across target days       | each rule spec    | identical key for same period        |
| Score ordering vs `birthday`/`recent_trip`     | metadata/reasoned | birthday stays top; documented in §5 |
| Multi-day recap window (`hideAt`)              | service spec §6.6 | `hideAt` spans `visibleForDays`      |
| Absent `visibleForDays` (existing rules)       | service spec §6.6 | 1-day window unchanged               |
| Two recaps overlapping a season-start          | service spec §6.6 | both fit in 2 slots; documented §3.2 |

## 7. Verification gates (before PR)

- `cd server && pnpm test -- --run src/services/memory-rules/` → all rule/util specs green.
- `pnpm test:medium` for the new repo query (Docker DB up).
- `make sql` (DB up) → regenerate the `getMemoryAssetsForPeriod` SQL snapshot; commit it.
  **Never run `make sql` without a running DB** — it deletes query files.
- `make check-server` (tsc) + `make lint-server` + `prettier --check` on **every** modified
  server file (source included — eslint-green ≠ prettier-green).
- Web: from `web/`, `check:typescript` + `check:svelte` + `pnpm lint`.
- **i18n completeness:** all 16 new `en.json` keys must exist. The settings components read
  them via `$t(\`memory*type*${key}...\` as Translations)`, so a missing key renders a
**blank label at runtime, not a compile error** — grep each of the 16 keys after editing
(and note `memory*type*<key>`is the user-settings key,`admin.memory*type*<key>\_setting`the admin one). Only`en.json` is required; other locales fall back.
- `prettier --write` on both docs under `docs/plans/` (Docs CI is strict).
- **No e2e added** — parity with the existing `birthday`/`recent_trip` rules, which have
  unit + medium coverage and no dedicated e2e. Add one later only if the generation path
  regresses.
- Manual smoke (optional): `make dev`, enable the types, run the `MemoryGenerate` job with a
  seeded library that has prior-year photos, confirm memories appear and toggles hide them.

## 8. Open tasks / follow-ups

- [x] §2 design decisions confirmed: D1 staggered triggers **+ multi-day recap windows**
      (§3.2); D4 all four default-on; D5 meteorological N-hemisphere seasons.
- [ ] Verify mobile memory-type settings enumeration; edit if it hardcodes a list.
- [ ] Decide whether to refactor `recent_trip` to import the shared `pickEvenlySpaced`
      (optional cleanup; keep behavior identical + its existing tests green).
- [ ] Out of scope, revisit if `on_this_day_place` feels starved: bump `RULE_DAILY_LIMIT`
      from 2 → 3 now that six rule types compete (§3.2).
- [ ] Out of scope unless profiling demands it: add a **per-group** lateral `LIMIT` to
      `getMemoryAssetsForPeriod` (like `getByDayOfYear`) if huge libraries make the unbounded
      row count a problem — never a flat total cap (§4).
- [ ] Later tier: keep `MemoryRuleCandidate` shaped so an embedding-backed rule (#12) needs
      no engine change.
