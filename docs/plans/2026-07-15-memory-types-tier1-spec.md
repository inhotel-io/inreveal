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
- No change to `RULE_DAILY_LIMIT` or the memory generation/cleanup scheduling.

## 2. Design decisions (please confirm on review)

These are the choices that shaped the spec. Each has a default I recommend; flag any you
want changed and I'll revise before implementation.

| ID  | Decision                | Chosen default                                                                                              | Alternative                                              |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| D1  | **Trigger cadence**     | Anniversary-anchored & staggered: #3 daily · #2 on the 1st · #1 on the 15th · #4 on each season's first day | Emit-always + cooldown model (like `recent_trip`)        |
| D2  | **One shared query**    | Single parametric `getMemoryAssetsForPeriod` serves all four; rules group/curate/score in TS                | Four bespoke queries                                     |
| D3  | **Memory content i18n** | Hardcoded English titles/subtitles (consistent with `birthday`/`recent_trip`)                               | Introduce a content-localization mechanism (own project) |
| D4  | **Default enabled**     | All four `defaultEnabled: true`, `adminConfigurable: true`                                                  | Ship #4 (season) OFF by default, more conservative       |
| D5  | **Season model**        | Meteorological seasons, N-hemisphere, with winter (Dec–Feb) cross-year grouping                             | Calendar quarters (no cross-year), or hemisphere-aware   |
| D6  | **#1 vs #2 overlap**    | Accept it; the 15th/1st stagger stops same-day stacking, different `dedupeKey`s, favorites score higher     | Suppress #2 for a month already covered by #1            |
| D7  | **Scoring/thresholds**  | The constants in §5 (tunable; birthday ≈ 250–320 stays top, favorites competitive, recaps mid)              | Any other numbers                                        |

## 3. Architecture

```
memory.service.ts  (unchanged)
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

| File                                                    | Change                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/repositories/asset.repository.ts`                  | Add `getMemoryAssetsForPeriod` + `MemoryPeriodAsset` interface             |
| `src/services/memory-rules/curation.util.ts`            | New: `pickEvenlySpaced`, `sampleAssetsByTime`, `dominant` helpers          |
| `src/services/memory-rules/favorites-throwback.rule.ts` | New rule                                                                   |
| `src/services/memory-rules/month-recap.rule.ts`         | New rule                                                                   |
| `src/services/memory-rules/on-this-day-place.rule.ts`   | New rule                                                                   |
| `src/services/memory-rules/season-recap.rule.ts`        | New rule                                                                   |
| `src/services/memory-rules/season.util.ts`              | New: season ↔ months mapping + `seasonOf`, `seasonYearOf`, `isSeasonStart` |
| `src/services/memory-rules/memory-type.metadata.ts`     | Add 4 `MEMORY_TYPE_METADATA` entries                                       |
| `src/services/memory-rules/memory-type.registry.ts`     | Add 4 `RULE_FACTORIES` entries                                             |

**Server — tests**

| File                                                    | Change                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `.../favorites-throwback.rule.spec.ts`                  | New (unit, BDD)                                                  |
| `.../month-recap.rule.spec.ts`                          | New (unit, BDD)                                                  |
| `.../on-this-day-place.rule.spec.ts`                    | New (unit, BDD)                                                  |
| `.../season-recap.rule.spec.ts`                         | New (unit, BDD)                                                  |
| `.../curation.util.spec.ts`                             | New (unit)                                                       |
| `.../season.util.spec.ts`                               | New (unit)                                                       |
| `.../memory-type.metadata.spec.ts`                      | Extend: assert 4 new keys, defaults, `getMemoryTypeKeyForMemory` |
| `.../memory-type.registry.spec.ts`                      | Extend: assert factories build the right rule for each new key   |
| `test/medium/.../asset.repository.spec.ts` (or nearest) | New medium test for `getMemoryAssetsForPeriod` (real DB)         |

**Web**

| File                                                       | Change                                                |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| `src/routes/admin/system-settings/MemoriesSettings.svelte` | Add 4 keys to the hardcoded `memoryTypeKeys` array    |
| `i18n/en.json`                                             | 16 new keys (admin label+desc ×4, user label+desc ×4) |

**Verify (no code expected, but confirm):** mobile memory-type settings enumeration.
If mobile reads `availableMemoryTypes` like web user settings, only strings are needed;
if it hardcodes a list, it needs the same 4-key edit. Captured as a task in §8.

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
- Order by `localDateTime`.
- `limit` a sane bound (e.g. 5000) to cap worst-case memory usage; document it.
- Decorated with `@GenerateSql` (so `make sql` snapshots it) using `DummyValue`s.

Rules pass `takenBefore = target.endOf('day')` and **drop `year >= target.year`** in TS
(prior years only — matches on-this-day's `year - 1` upper bound). No current-year memory.

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
  (`>= 60%` of that year's geotagged day-photos). One candidate per qualifying year.
- **Fields:**
  - `title`: `On this day in ${city}`
  - `subtitle`: `${count} photos from ${year}`
  - `memoryAt`: `target.set({ year })`
  - `dedupeKey`: `on_this_day_place:${year}-${MM}-${dd}:${placeKeyLower}`
  - `score`: `100 + count * 3 + recencyBonus(year, target)`
  - `assetIds`: that year+city assets → `sampleAssetsByTime(cap = 8)`
- **Determinism:** on a dominant-city tie, pick the greater count then the lexicographically
  smaller city (so tests and reruns are stable).

### 5.2 `month_recap` — "[Month] [Year]"

- **Trigger:** `target.day === 1`.
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

### 5.3 `favorites_throwback` — "Favorite moments from [Month] [Year]"

- **Trigger:** `target.day === 15` (offset from #2's 1st so they never stack same-day).
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

### 5.4 `season_recap` — "[Season] [Year]"

- **Trigger:** first day of a meteorological season → `target.day === 1 && target.month ∈ {3,6,9,12}`.
- **Season → months** (N hemisphere): Spring `[3,4,5]`, Summer `[6,7,8]`,
  Autumn `[9,10,11]`, Winter `[12,1,2]`. `season.util` provides `seasonStartingOn(target)`.
- **Query:** `{ months: seasonMonths, takenBefore: target.endOf('day') }`.
- **Grouping:** map each asset to its **season-year** via `seasonYearOf(month, year, season)`
  — for Winter, Jan/Feb belong to the previous December's winter (`seasonYear = year - 1`
  for Jan/Feb, `= year` for Dec); other seasons `seasonYear = year`. Drop the current
  season-year. Group by season-year.
- **Emit when:** a season-year has `>= MIN_ASSETS (15)`. Emit top `MAX_YEARS (2)` by score.
- **Fields:**
  - `title`: `${SeasonName} ${seasonYear}` (e.g. `Summer 2024`)
  - `subtitle`: `${count} photos`
  - `memoryAt`: `medianTime` of that season-year's assets
  - `dedupeKey`: `season_recap:${seasonYear}-${seasonName}`
  - `score`: `90 + min(count, 40) + recencyBonus(seasonYear, target)`
  - `assetIds`: `sampleAssetsByTime(cap = 30)`
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
- `recencyBonus(year, target): number` = `max(0, 10 - (target.year - year))` — small nudge so
  newer memories edge out older ones without overpowering `count`.

## 6. Test plan (TDD / BDD)

Write tests **first**, watch them fail, then implement. Mirror the existing
`birthday.rule.spec.ts` / `recent-trip.rule.spec.ts` style: construct the rule with a mock
`assetRepository`, call `evaluate`, assert on the returned candidates. Use fixed
`DateTime.fromObject({...}, { zone: 'utc' })` targets — never `DateTime.now()` — so tests
are deterministic.

### 6.1 Unit — each rule `.spec.ts`

Common structure (`describe` = "given", `it` = "then"):

**`favorites_throwback.rule.spec.ts`**

- given the target day is not the 15th → emits no candidates (and does **not** hit the repo).
- given the target is the 15th and ≥ 4 favorites exist in a prior-year copy of this month →
  emits one candidate for that year; title/subtitle/memoryAt/dedupeKey/score match §5.3.
- given favorites across three prior years → emits three candidates, sorted by score desc.
- given favorites across five prior years → emits only the top `MAX_YEARS (3)`.
- given a year with exactly 3 favorites → that year is skipped (below `MIN_FAVORITES`).
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
- given a year with 9 photos → skipped.
- given only current-year photos → nothing.
- given > 24 photos → `assetIds.length === 24`, chronological.
- newer year outscores older year at equal count (recencyBonus).

**`on_this_day_place.rule.spec.ts`**

- given prior-year photos on this day dominated (≥ 60%, ≥ 4) by one city → one candidate;
  fields per §5.1; `title` names the city.
- given photos split across cities with no ≥ 60% majority → no candidate for that year.
- given ≥ 4 in the dominant city but it's only 50% → no candidate (majority gate).
- given all photos ungeotagged (null city) → no candidate.
- given two years each with a dominant city → two candidates.
- given a dominant-city tie (equal counts) → deterministic pick (greater count, then
  lexicographically smaller city).
- given only current-year photos → nothing.
- `memoryAt` is `target.set({ year })`; `dedupeKey` includes month, day, and place.

**`season_recap.rule.spec.ts`**

- given `target` is not a season start (e.g. day 2, or Jan 1) → no candidates, no repo call.
- given `target` is Jun 1 and a prior summer has ≥ 15 photos → one `Summer <year>` candidate.
- **winter cross-year:** given `target` is Dec 1 2026 and photos exist in Dec 2024 +
  Jan/Feb 2025 → they group into **one** `Winter 2024` season-year candidate (Jan/Feb 2025
  map to seasonYear 2024).
- given a season-year with 14 photos → skipped (below `MIN_ASSETS`).
- given three qualifying season-years → only top `MAX_YEARS (2)` emitted.
- given only the current season-year → nothing.
- given > 30 photos → `assetIds.length === 30`.
- `seasonStartingOn(Mar 1)=Spring`, `(Jun 1)=Summer`, `(Sep 1)=Autumn`, `(Dec 1)=Winter`.

### 6.2 Unit — `curation.util.spec.ts`

- `pickEvenlySpaced`: count ≤ 0 → `[]`; count ≥ length → all; count === 1 → middle element;
  count === 2 → first & last; even spacing for count between (parity with the current
  `recent_trip` behavior — port its existing cases).
- `sampleAssetsByTime`: unsorted input → chronological output; cap larger than input → all;
  cap === 0 → `[]`; stable ids.
- `recencyBonus`: same year → 10; 10+ years ago → 0; never negative.

### 6.3 Unit — `season.util.spec.ts`

- `seasonOf(month)` for all 12 months.
- `seasonYearOf` — Dec 2024 → 2024; Jan 2025 → 2024; Feb 2025 → 2024; Jul 2024 → 2024;
  Mar 2025 → 2025.
- `isSeasonStart` / `seasonStartingOn` — true only on Mar/Jun/Sep/Dec 1; correct season.

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
- non-geotagged assets returned with `city: null`.
- `year` is the correct UTC year; assets without a Preview file are excluded; deleted /
  non-Timeline assets excluded.

### 6.6 Edge cases consolidated (must each have a test)

| Edge case                                      | Owning test       | Expected                             |
| ---------------------------------------------- | ----------------- | ------------------------------------ |
| Wrong trigger day                              | each rule spec    | no candidates, **no repo call**      |
| Empty library / no matching assets             | each rule spec    | `[]`                                 |
| Only current-year assets                       | each rule spec    | `[]` (prior years only)              |
| Below-threshold year                           | each rule spec    | that year skipped                    |
| More qualifying years than `MAX_YEARS`         | #1/#2/#4 specs    | capped, score-sorted                 |
| Asset count above cap                          | each rule spec    | `assetIds` capped, chronological     |
| Ungeotagged photos (place rule)                | #3 spec           | no place candidate                   |
| No dominant-city majority                      | #3 spec           | no candidate                         |
| Dominant-city tie                              | #3 spec           | deterministic pick                   |
| Winter Dec/Jan/Feb cross-year grouping         | #4 spec           | single season-year memory            |
| Leap-day target (Feb 29) for place/on-this-day | #3 spec           | handled; no crash                    |
| `dedupeKey` stability across target days       | each rule spec    | identical key for same period        |
| Score ordering vs `birthday`/`recent_trip`     | metadata/reasoned | birthday stays top; documented in §5 |

## 7. Verification gates (before PR)

- `cd server && pnpm test -- --run src/services/memory-rules/` → all rule/util specs green.
- `pnpm test:medium` for the new repo query (Docker DB up).
- `make sql` (DB up) → regenerate the `getMemoryAssetsForPeriod` SQL snapshot; commit it.
  **Never run `make sql` without a running DB** — it deletes query files.
- `make check-server` (tsc) + `make lint-server` + `prettier --check` on **every** modified
  server file (source included — eslint-green ≠ prettier-green).
- Web: from `web/`, `check:typescript` + `check:svelte` + `pnpm lint`.
- `prettier --write` on both docs under `docs/plans/` (Docs CI is strict).
- Manual smoke (optional): `make dev`, enable the types, run the `MemoryGenerate` job with a
  seeded library that has prior-year photos, confirm memories appear and toggles hide them.

## 8. Open tasks / follow-ups

- [ ] Confirm the §2 design decisions (esp. D1 cadence, D4 defaults, D5 season model).
- [ ] Verify mobile memory-type settings enumeration; edit if it hardcodes a list.
- [ ] Decide whether to refactor `recent_trip` to import the shared `pickEvenlySpaced`
      (optional cleanup; keep behavior identical + its existing tests green).
- [ ] Later tier: keep `MemoryRuleCandidate` shaped so an embedding-backed rule (#12) needs
      no engine change.
