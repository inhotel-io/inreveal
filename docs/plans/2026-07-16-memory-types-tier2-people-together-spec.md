# Tier 2 Memory Type: `people_together` ("Anna & Ben")

> Spec for the first Tier 2 memory type from the
> [memory types roadmap](./2026-07-15-memory-types-roadmap.md) (#5, "You & [person]").
> Created 2026-07-16. Status: **spec — not yet implemented**.

## Summary

A new `MemoryRule` that surfaces **a pair of people (or pets) who were photographed
together a lot in the current calendar month of a past year**. Titled `"Anna & Ben"`,
subtitled `"18 photos together · June 2023"`.

It reuses the shipped rule-engine spine wholesale. The only genuinely new code is **one
repository query** (faces for a period) and **one pure helper** (`pairCounts`); everything
else — admin/user toggles, `availableMemoryTypes`, dedup, the daily limit, the visibility
filter — derives automatically from registering the type, exactly as the four Tier 1 types
did.

## Decisions (resolved during brainstorming)

| Question              | Decision                                                                      | Rationale                                                                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who is it about?      | **A pair** of named subjects (`A & B`), not "You & X"                         | The schema has no reliable "which person is the account owner" mapping, so a literal "You" would need a fragile heuristic. A pair needs no self-identification.                                                                  |
| What triggers it?     | **Date-anchored**: current calendar month in a past year (like `month_recap`) | A "these two are often together" fact is timeless, but the engine runs daily into dated memory slots. Anchoring to a past month keeps the surface fresh (rotates monthly), makes `memoryAt` meaningful, and makes dedup trivial. |
| Qualifying threshold  | **≥ 6 co-occurring photos** in the month-year **and ≥ 2 distinct days**       | Matches `on_this_day_place`'s appetite (it uses 4 assets); the distinct-days guard stops a single event from qualifying a "relationship".                                                                                        |
| Pets eligible?        | **Yes** — no `person.type` restriction                                        | Allows `Anna & Rex` (person–pet). Consequence: `Rex & Whiskers` (pet–pet) pairs are also possible; accepted. No special "at least one human" logic.                                                                              |
| Co-occurrence meaning | Both subjects appear in the **same asset**                                    | Matches the intuitive "photos containing both people".                                                                                                                                                                           |

## Data model grounding

- `person`: `id`, `ownerId`, `name`, `isHidden`, `type` (`'person' | 'pet'`), `thumbnailPath`, …
- `asset_face`: `id`, `assetId`, `personId`, `deletedAt`, `isVisible`, `sourceType`, …
- Named face join (from `person.repository.ts`): `asset_face.personId = person.id`, filtered
  `asset_face.deletedAt is null` and `asset_face.isVisible = true`.
- "Named, real subject" filter (from `getBirthdaysForDay` / `getAllForUser`): `person.name != ''`,
  `person.isHidden = false`. We deliberately **drop** the `type = 'person'` clause so pets qualify.

## New repository query — `getMemoryFacesForPeriod`

`AssetRepository.getMemoryFacesForPeriod(ownerId, { months, takenBefore }): Promise<MemoryPeriodFace[]>`

Same spine as the existing `getMemoryAssetsForPeriod`, but joined through `asset_face` →
`person`, returning **one row per (asset, named subject)**:

```ts
export interface MemoryPeriodFace {
  assetId: string;
  localDateTime: Date;
  year: number; // extract(year from localDateTime at UTC)::int
  personId: string;
  personName: string;
}
```

Filters (all `AND`):

- `asset.ownerId = ownerId`
- `asset.visibility = Timeline`
- `asset.deletedAt is null`
- `asset.localDateTime <= takenBefore`
- `extract(month from localDateTime at UTC) in (months)`
- `exists (asset_file preview)` — same preview guard as `getMemoryAssetsForPeriod`
- `asset_face.deletedAt is null`
- `asset_face.isVisible = true`
- `person.ownerId = ownerId`
- `person.name != ''`
- `person.isHidden = false`
- (no `person.type` filter — pets included)

Order by `asset.localDateTime asc`. Decorated with `@GenerateSql` and covered by a medium
(real-DB) test, since it's the one piece unit tests can't fully exercise.

**Why flat rows, not a SQL self-join:** the codebase grain is "one moderate query returns
rows, TS does the curation" (`on_this_day_place` fetches a period and clusters with a util).
Flat face rows keep the SQL simple/testable and let the pairing logic live in a pure,
trivially-unit-testable helper. The query returns every past year's copy of the month (not
just the ≤ 2 we ultimately emit); pair enumeration is `O(assets × facesPerAsset²)` per year —
negligible for a personal library's month-sized slices, even across many years.

## New curation helper — `pairCounts`

Added to `curation.util.ts` (pure, dependency-free, unit-tested like the others):

```ts
// Structural input — decoupled from the repository type so curation.util stays
// dependency-free (any {assetId, personId, personName, localDateTime} row works).
export interface FaceRow {
  assetId: string;
  personId: string;
  personName: string;
  localDateTime: Date;
}

export interface PairStat {
  a: { id: string; name: string }; // ordered so a.id < b.id (stable, order-independent)
  b: { id: string; name: string };
  assets: { id: string; localDateTime: Date }[]; // assets containing BOTH, chronological
  distinctDays: number; // count of distinct calendar days among those assets
}

// Given face rows for a single year-bucket, return every co-occurring pair with its
// shared assets and distinct-day count, sorted by shared-asset count desc (deterministic
// tie-break on the ordered id pair).
export const pairCounts = (rows: FaceRow[]): PairStat[];
```

Algorithm: group rows by `assetId` → each asset's **set** of `{personId, name}` (dedupe a
person appearing on the same asset twice via multiple faces); for every unordered pair within
an asset's set, accumulate the asset (`{id, localDateTime}`). Derive `distinctDays` from the
UTC calendar days of those assets. Emit `PairStat[]` sorted by `assets.length` desc, tie-broken
by `` `${a.id}:${b.id}` ``. Carrying the timed assets (not just ids) lets the rule feed
`sampleAssetsByTime` directly — no second lookup.

## Rule — `people-together.rule.ts`

```
id = 'people_together'
MIN_ASSETS = 6
MIN_DISTINCT_DAYS = 2
MAX_YEARS = 2        // at most 2 candidates per run, strongest first
ASSET_CAP = 8

evaluate({ ownerId, target }):
  rows = getMemoryFacesForPeriod(ownerId, {
    months: [target.month],
    takenBefore: target.endOf('day').toJSDate(),
  })

  byYear = group rows where row.year < target.year, keyed by row.year

  candidates = []
  for [year, yearRows] of byYear:
    top = pairCounts(yearRows)[0]           // strongest pair that year
    if !top: continue
    if top.assets.length < MIN_ASSETS: continue
    if top.distinctDays < MIN_DISTINCT_DAYS: continue

    mm = zero-padded target.month
    count = top.assets.length
    candidates.push({
      ruleId: id,
      dedupeKey: `people_together:${top.a.id}:${top.b.id}:${year}-${mm}`,
      title: `${top.a.name} & ${top.b.name}`,          // names ordered by the a.id<b.id pairing
      subtitle: `${count} photos together · ${monthName(target.month)} ${year}`,
      score: 100 + count * 3 + recencyBonus(year, target.year),
      assetIds: sampleAssetsByTime(top.assets, ASSET_CAP),
      memoryAt: target.set({ year }),                  // this month, that past year
      visibleForDays: 1,                               // a specific-month memory, not a lingering recap
      context: { year, personAId, personBId, count },
    })

  return candidates.toSorted(by score desc).slice(0, MAX_YEARS)
```

Notes:

- Title name order follows the `a.id < b.id` pairing (deterministic), **not** alphabetical —
  keeps title, `dedupeKey`, and `context` consistent with each other. (Alphabetical-by-name was
  considered but two people can share a name; ordering by id is unambiguous.)
- `pairCounts` returns `PairStat.assetIds` already, but `sampleAssetsByTime` needs
  `{id, localDateTime}`; the rule maps the pair's asset ids back to their rows (or `pairCounts`
  returns timed assets). Implementation detail for the plan — either is fine.

## Candidate → memory (unchanged plumbing)

The service already turns `MemoryRuleCandidate` into a `MemoryType.Rule` record, dedupes by
`dedupeKey` + `hasRuleMemory(ownerId, ruleId, dedupeKey)`, sorts all rules' candidates by
`score`, and inserts up to `RULE_DAILY_LIMIT` (2) per day. `people_together` competes in that
same pool; its `score` family (`100 + count*3 + recency`) matches `on_this_day_place` so it
neither dominates nor is dominated by design.

## Registration, settings, i18n (boilerplate)

1. **`memory-type.metadata.ts`** — add `{ key: 'people_together', kind: 'rule', defaultEnabled: true, adminConfigurable: true }`.
2. **`memory-type.registry.ts`** — import the rule; add
   `people_together: (deps) => new PeopleTogetherMemoryRule(deps.assetRepository)`.
3. **`web/src/routes/admin/system-settings/MemoriesSettings.svelte`** — add `'people_together'`
   to the hardcoded `memoryTypeKeys` array.
4. **`i18n/en.json`** — 4 keys (others fall back to en):
   - `memory_type_people_together_setting`: `"People together memories"`
   - `memory_type_people_together_setting_description`: `"Generate memories of two people or pets often photographed together in a past year."`
   - `memory_type_people_together`: `"People together"`
   - `memory_type_people_together_description`: `"Two people or pets often photographed together in a past year."`

(Exact copy is a knob; finalize during implementation.)

## Test plan (TDD, mirroring Tier 1)

Ordered slices, each red→green:

1. **`pairCounts` util spec** — single asset with 2 subjects → one pair; 3 subjects → 3 pairs;
   a subject with two faces on one asset counted once; distinct-day counting; deterministic sort
   & id-ordered pairs; empty input → `[]`.
2. **Rule spec** (`people-together.rule.spec.ts`, mocked repo):
   - below `MIN_ASSETS` → no candidate
   - `MIN_ASSETS` met but all on one day (`distinctDays < 2`) → no candidate
   - clean qualifying pair → title/subtitle/dedupeKey/score/memoryAt/`visibleForDays: 1`
   - two competing pairs same year → the higher-count pair wins that year
   - multi-year → sorted by score, capped at `MAX_YEARS`
   - current/future-year rows (`year >= target.year`) ignored
   - a pet pair and a person–pet pair both qualify (pets included)
   - `dedupeKey` identical regardless of input row order (id-ordering)
   - `assetIds` capped at `ASSET_CAP` and chronologically sampled
3. **Repository medium test** — `getMemoryFacesForPeriod` honors visibility/deleted/preview,
   `asset_face.isVisible`/`deletedAt`, `person.isHidden`, `person.name != ''`, and **includes
   pets**; excludes other owners.
4. **Metadata/registry expectation updates** — `people_together` present, default-enabled,
   admin-configurable; `availableMemoryTypes` includes it.
5. **Admin settings spec** (`MemoriesSettings.spec.ts`) — the new toggle renders with a real
   (non-blank) label/description.

## Edge cases & determinism

- **Groups (3+ always together):** only the top _pair_ surfaces. Group memories are out of scope.
- **Same person, multiple faces on one asset:** deduped to one subject per asset in `pairCounts`.
- **Ties:** `pairCounts` and the candidate sort both tie-break deterministically (ordered id
  pair / score then implicit order), so repeated runs are stable — same discipline as `dominantBy`.
- **Overlap with `birthday`:** different trigger (birthday is a person's birth date; this is a
  past month's co-occurrence), different `ruleId`/`dedupeKey` — they can co-exist and dedup
  independently.

## Out of scope (YAGNI)

- "You & X" owner identification.
- Group (3+) memories.
- Localizing memory **content** (titles/subtitles stay English server-side, like all rules).
- Cross-owner / shared-space people (rules operate on `ownerId`'s own people, as today).
- Tuning `RULE_DAILY_LIMIT` (unchanged at 2).

## Roadmap bookkeeping

On landing, mark #5 **Shipped — `people_together`** in
[`2026-07-15-memory-types-roadmap.md`](./2026-07-15-memory-types-roadmap.md) and link this spec,
mirroring the Tier 1 row treatment.
