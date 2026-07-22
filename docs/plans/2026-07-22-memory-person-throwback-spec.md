# Person Throwback Memory — Design & Test Spec

> Implements roadmap item **#9 "Someone you haven't seen"** from the
> [memory types roadmap](./2026-07-15-memory-types-roadmap.md), reframed (§2 D1).
> Stacked on **PR #812** (`feat/memory-types-tier3`).
> Branch: `feat/memory-person-throwback`.
> Approach: **test-driven, behavior-driven, full edge-case coverage.**
> Created 2026-07-22.
> Status: **spec — not yet implemented.**

## 1. Goal & non-goals

**Goal:** add one `MemoryRule` that resurfaces a warm chapter with a person who has not
appeared in the user's photos for a year or more.

| Key                | Memory                                       | Trigger day | Window |
| ------------------ | -------------------------------------------- | ----------- | ------ |
| `person_throwback` | "Times with Anna" · "8 photos · August 2019" | **26**      | 7 d    |

**Non-goals (this batch):**

- **No per-person "exclude from memories" control.** That is a deliberate follow-up PR (§8) that
  spans every person-based rule, not just this one.
- No engine change to `memory.service.ts` scheduling, `RULE_DAILY_LIMIT`, the multi-day slot cap,
  or cleanup. The rule is a pure function of `(ownerId, target, injected repositories)`.
- No localization of memory _content_ (titles/subtitles stay English, matching every existing rule).
- No `MemoryType` enum or `memory` table schema change.
- No change to the shipped `birthday` rule, including the sampling issue noted in §7.3.

## 2. Design decisions

| #   | Decision                                                                          | Rationale                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **The dormancy gap is never shown to the user**                                   | The gap is a _selection heuristic only_. Titling it ("You haven't seen Anna in 2 years") makes the app assert something about a relationship — which lands badly when the person has died or the friendship ended. As a silent selector it reads like any other memory.                                                    |
| D2  | Key is **`person_throwback`**, not `someone_missed`                               | The name must not smuggle back the emotional claim D1 removed. Rhymes with the shipped `favorites_throwback`.                                                                                                                                                                                                              |
| D3  | Dormancy threshold **12 months, no upper bound**                                  | Photo-absence ≠ real absence, so a shorter threshold admits many people the user still sees — harmless false positives under D1, and they **dilute** how much the rule concentrates on people who are genuinely gone. No upper bound because `month_recap` / `favorites_throwback` already surface arbitrarily old photos. |
| D4  | Show the person's **densest chapter**, not their last or a career-spanning spread | Densest cluster ≈ a real event (trip, wedding, summer) ≈ the best photos of them, and it is visually coherent. "Last chapter" is the heaviest possible cut if the person died; an all-years spread reads as an in-memoriam reel.                                                                                           |
| D5  | **Gap length is not scored**                                                      | Ranking by dormancy would put the most-likely-deceased person first. Rank by chapter richness so the best-documented relationships win.                                                                                                                                                                                    |
| D6  | `recencyBonus` **is** applied to the chapter year                                 | Conventional (every rule uses it) _and_ it mildly favours recently-dormant people, further diluting the concentration in D3. One lever, two jobs.                                                                                                                                                                          |
| D7  | **Pets excluded** (`person.type = 'person'`)                                      | A pet dormant 12+ months has overwhelmingly died — it lacks the "maybe I just don't photograph them" ambiguity that makes the human case safe. Roadmap #10 owns pets and can frame them deliberately.                                                                                                                      |
| D8  | Rule returns **up to 5 candidates**, not 1                                        | `hasRuleMemory` dedup happens in the engine _after_ the rule returns. A 1-candidate rule whose key already fired contributes nothing — permanently. This is the exact trap Tier 3 hit. Multiple candidates let the engine skip fired keys and reach a fresh person.                                                        |
| D9  | Chapter density computed from **daily counts**, not fetched assets                | Lets the rule find the true densest window without fetching a heavy subject's whole history (an ex-partner may have thousands of photos). Also makes the core algorithm a pure function over small integers.                                                                                                               |
| D10 | `defaultEnabled: true`                                                            | Matches every other type and how Apple/Google actually behave. Escape hatches until the §8 follow-up: the per-user type toggle and `person.isHidden`.                                                                                                                                                                      |
| D11 | Rule **exports its constants**                                                    | Private statics make thresholds untestable — the Tier 3 D8 lesson.                                                                                                                                                                                                                                                         |

## 3. Architecture

### 3.1 Every site a new memory type touches

Traced from `themed` (added in PR #812). **All 16 sites.** Because D10 makes the key
admin-available by default, rows 8, 10 and 7 **do** change (they would not have under an opt-in
default) — so this branch serialises against any other branch adding a memory type.

| #   | File                                                             | What changes                                                           |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | `server/src/services/memory-rules/memory-type.metadata.ts`       | `MEMORY_TYPE_METADATA` entry (appended last)                           |
| 2   | `server/src/services/memory-rules/memory-type.metadata.spec.ts`  | assert key, kind, defaults                                             |
| 3   | `server/src/services/memory-rules/memory-type.registry.ts`       | `RULE_FACTORIES` entry (no `MemoryRuleDeps` change — §3.2)             |
| 4   | `server/src/services/memory-rules/memory-type.registry.spec.ts`  | factory builds the right rule + completeness guard **10 → 11**         |
| 5   | `server/src/services/memory-rules/person-throwback.rule.ts`      | the rule                                                               |
| 6   | `server/src/services/memory-rules/person-throwback.rule.spec.ts` | unit/BDD spec                                                          |
| 7   | `server/src/utils/preferences.spec.ts`                           | default per-user type map gains the key                                |
| 8   | `server/src/services/server.service.spec.ts`                     | **TWO** `availableMemoryTypes` assertions                              |
| 9   | `server/test/medium/specs/services/memory.service.spec.ts`       | end-to-end generation medium test                                      |
| 10  | `e2e/src/specs/server/api/server.e2e-spec.ts`                    | `availableMemoryTypes` fixture — **the server unit suite misses this** |
| 11  | `web/src/routes/admin/system-settings/MemoriesSettings.svelte`   | hardcoded `memoryTypeKeys` array                                       |
| 12  | `web/src/routes/admin/system-settings/MemoriesSettings.spec.ts`  | switch count **and** the full `types` object literal in the save test  |
| 13  | `i18n/en.json`                                                   | 4 keys (§3.6)                                                          |
| 14  | `docs/docs/features/memories.md`                                 | user-facing type list                                                  |
| 15  | `docs/docs/install/config-file.md`                               | `memories.types` config keys                                           |
| 16  | `docs/plans/2026-07-15-memory-types-roadmap.md`                  | #9 Status → **Shipped**; also correct #12's status (§8)                |

Expected `availableMemoryTypes` (registry order) after this branch — **12** entries:

```
on_this_day, birthday, recent_trip, month_recap, favorites_throwback, on_this_day_place,
season_recap, people_together, video_moments, trip_anniversary, themed, person_throwback
```

The registry completeness guard asserts one rule per `kind: 'rule'` entry: **10 → 11**
(`on_this_day` is not rule-kind).

### 3.2 New / changed source files, with exact signatures

| File                                                 | Change                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/repositories/person.repository.ts`              | **New** `getDormantPeople`                                             |
| `src/repositories/asset.repository.ts`               | **New** `getMemoryPersonDailyCounts`, `getMemoryAssetsForPersonWindow` |
| `src/services/memory-rules/chapter.util.ts`          | **New**, pure                                                          |
| `src/services/memory-rules/person-throwback.rule.ts` | **New** rule                                                           |
| `src/services/memory-rules/memory-type.registry.ts`  | one factory entry                                                      |
| `src/services/memory-rules/memory-type.metadata.ts`  | one metadata entry                                                     |

`MemoryRuleDeps` already carries `personRepository` and `assetRepository`, so the registry's deps
interface is **unchanged**:

```ts
person_throwback: (deps) => new PersonThrowbackMemoryRule(deps.personRepository, deps.assetRepository),
```

### 3.3 Repository queries

Three queries, all `@GenerateSql`-decorated (so `make sql` must be re-run — §6.2).

```ts
// person.repository.ts
export interface DormantPerson {
  id: string;
  name: string;
  lastSeenAt: Date;
  assetCount: number;
}

getDormantPeople(
  ownerId: string,
  { lastSeenBefore, minAssets, limit }: { lastSeenBefore: Date; minAssets: number; limit: number },
): Promise<DormantPerson[]>;
```

`FROM person JOIN asset_face JOIN asset`, filtered by:

| Side   | Predicates                                                                              |
| ------ | --------------------------------------------------------------------------------------- |
| person | `ownerId = :ownerId`, `type = 'person'` (D7), `name != ''`, `isHidden = false`          |
| face   | `deletedAt IS NULL`, `isVisible = true`                                                 |
| asset  | `ownerId = :ownerId`, `visibility = Timeline`, `deletedAt IS NULL`, preview file EXISTS |

then `GROUP BY person.id` `HAVING max(asset."localDateTime") < :lastSeenBefore AND count(DISTINCT asset.id) >= :minAssets`,
`ORDER BY count(DISTINCT asset.id) DESC, person.id ASC` (deterministic tie-break), `LIMIT :limit`.

The asset-side predicates **must match `getMemoryFacesForPeriod` exactly**, otherwise a person can
look dormant merely because their recent photos are archived or lack a preview.

```ts
// asset.repository.ts
export interface MemoryPersonDayCount {
  personId: string;
  day: Date;   // date-truncated localDateTime, UTC
  count: number;
}

getMemoryPersonDailyCounts(
  ownerId: string,
  personIds: string[],
  { takenBefore }: { takenBefore: Date },
): Promise<MemoryPersonDayCount[]>;   // ORDER BY personId, day ASC

getMemoryAssetsForPersonWindow(
  ownerId: string,
  personId: string,
  { from, to }: { from: Date; to: Date },
): Promise<MemoryAsset[]>;            // ORDER BY localDateTime ASC
```

`getMemoryPersonDailyCounts` returns one row per (person, calendar day) — small even for a heavy
subject — and is the input to the pure density algorithm (D9). `getMemoryAssetsForPersonWindow` is
bounded by a ≤14-day window, so it needs no `LIMIT` guess.

**Why not reuse `getMemoryAssetsForPerson`:** it is
`DISTINCT ON (asset.id) ORDER BY asset.id … LIMIT 60`, which returns the 60 **lowest UUIDs** — an
arbitrary sample, not the 60 most recent. Unusable for density. (See §7.3.)

### 3.4 `chapter.util.ts` — exact exports

```ts
export const CHAPTER_MAX_SPAN_DAYS = 14;

export interface DayCount {
  day: Date;
  count: number;
}

export interface Chapter {
  from: Date;      // first day of the winning window
  to: Date;        // last day of the winning window
  count: number;   // assets inside it
  dayCount: number;// distinct days inside it
}

/**
 * Widest-count window of at most `maxSpanDays` consecutive calendar days.
 * `days` must be sorted ascending. Ties resolve to the MOST RECENT window.
 * Returns null for empty input.
 */
export const densestChapter = (days: DayCount[], maxSpanDays: number): Chapter | null;
```

Two-pointer sweep: for each right index, advance `left` while
`day[right] - day[left] > maxSpanDays - 1`; track the running sum. Update the best window on
`sum >= best` (`>=`, not `>`, so the last — most recent — maximal window wins, per D4's tie rule).

### 3.5 The rule

```ts
export const TRIGGER_DAY = 26;
export const DORMANCY_MONTHS = 12;
export const MIN_TOTAL_ASSETS = 10;
export const MIN_CHAPTER_ASSETS = 6;
export const CANDIDATE_POOL = 10;
export const MAX_CANDIDATES = 5;
export const ASSET_CAP = 8;
export const VISIBLE_FOR_DAYS = 7;
export const SCORE_BASE = 110;
```

Flow:

1. Return `[]` unless `target.day === TRIGGER_DAY`. Day 26 is free (1, 8, 15, 20, 22 are taken) and
   is `≤ 28`, so it never hits the Luxon month-length clamp that bit Tier 3.
2. `lastSeenBefore = target.startOf('day').minus({ months: DORMANCY_MONTHS })`. Dormant means
   `lastSeenAt < lastSeenBefore`, **strictly** — a person last seen exactly at the cutoff is not yet
   dormant. (`minus({months: 12})` from day 26 always lands on day 26; no clamping.)
3. `getDormantPeople(ownerId, { lastSeenBefore, minAssets: MIN_TOTAL_ASSETS, limit: CANDIDATE_POOL })`.
   Pool of 10 > the 5 returned, so chapter-density ranking has room to reorder the SQL's
   total-count ordering.
4. `getMemoryPersonDailyCounts(ownerId, ids, { takenBefore: lastSeenBefore })`.
5. Per person: `densestChapter(days, CHAPTER_MAX_SPAN_DAYS)`; drop if `null` or
   `count < MIN_CHAPTER_ASSETS`. No distinct-day minimum — a wedding is one day and is a fine memory.
6. Score, sort desc (tie-break `personId` asc), take `MAX_CANDIDATES`.
7. For each survivor, `getMemoryAssetsForPersonWindow` → `sampleAssetsByTime(assets, ASSET_CAP)`,
   `memoryAt = medianTime(assets)` (both existing `curation.util.ts` helpers).

```
score = SCORE_BASE + min(chapter.count, 20) + recencyBonus(chapterYear, target.year)
```

`chapterYear` is the year of `medianTime`. Score band rationale:

| Rule                                    | Base    | Relation                                                        |
| --------------------------------------- | ------- | --------------------------------------------------------------- |
| `birthday` / `trip_anniversary`         | 300/260 | **Above us** — date-anchored; miss the day and they wait a year |
| `person_throwback`                      | **110** | rare (once ever per person), highly personal                    |
| `on_this_day_place` / `people_together` | 100     | just below                                                      |
| `season_recap` / `month_recap`          | 90 / 80 | generic recaps                                                  |
| `themed` / `video_moments`              | 70 / 60 | generic recaps                                                  |

Candidate shape:

```ts
{
  ruleId: 'person_throwback',
  dedupeKey: `person_throwback:${person.id}`,   // once ever, per D8's pool
  title: `Times with ${person.name}`,
  subtitle: `${count} photos · ${monthName(month)} ${year}`,
  score,
  assetIds,
  memoryAt,
  visibleForDays: VISIBLE_FOR_DAYS,
  context: { personId, chapterFrom, chapterTo, count },
}
```

### 3.6 i18n keys (`i18n/en.json`, EN only)

| Key                                              | Value                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `admin.memory_type_person_throwback`             | Person throwback                                                                         |
| `admin.memory_type_person_throwback_description` | Resurface a warm chapter with someone who has not appeared in photos for a year or more. |
| `memory_type_person_throwback`                   | Times with someone                                                                       |
| `memory_type_person_throwback_description`       | Occasionally resurface photos of a person you have not photographed in a long while.     |

Exact key naming must be copied from the `themed` keys already in `en.json` — web and mobile share
one `i18n/` directory, and only `en.json` needs the new keys.

## 4. Behaviour spec (tests)

### 4.1 `chapter.util.spec.ts` — pure

| #   | Given                                        | Expect                                                                |
| --- | -------------------------------------------- | --------------------------------------------------------------------- |
| 1   | empty input                                  | `null`                                                                |
| 2   | one day, 3 assets                            | window of that day, `count 3`, `dayCount 1`                           |
| 3   | all days inside the span                     | whole set                                                             |
| 4   | two clusters, second denser                  | the second                                                            |
| 5   | two clusters, **equally dense**              | the **more recent** one (D4 tie rule)                                 |
| 6   | days exactly `maxSpanDays - 1` apart         | both included — the window covers exactly `maxSpanDays` calendar days |
| 7   | days exactly `maxSpanDays` apart             | split into separate windows                                           |
| 8   | dense window at the very start of the series | found (no off-by-one at `left = 0`)                                   |

### 4.2 `person-throwback.rule.spec.ts`

| #   | Given                                                | Expect                                                                                                                                                                          |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `target.day !== 26`                                  | `[]`, **no repository call**                                                                                                                                                    |
| 2   | no dormant people                                    | `[]`                                                                                                                                                                            |
| 3   | dormant person, rich chapter                         | one candidate, exact title/subtitle/score/assetIds                                                                                                                              |
| 4   | last seen **exactly** at the cutoff                  | not dormant → excluded (strict `<`)                                                                                                                                             |
| 5   | last seen one day before the cutoff                  | dormant → included                                                                                                                                                              |
| 6   | chapter has 5 assets (`< MIN_CHAPTER_ASSETS`)        | excluded                                                                                                                                                                        |
| 7   | person has 9 assets total (`< MIN_TOTAL_ASSETS`)     | excluded — asserted at the **query argument**                                                                                                                                   |
| 8   | 7 qualifying people                                  | exactly `MAX_CANDIDATES` (5) returned, score desc                                                                                                                               |
| 9   | two people with identical scores                     | ordered by `personId` asc (deterministic)                                                                                                                                       |
| 10  | chapter spans a month boundary                       | subtitle uses the **median** asset's month/year                                                                                                                                 |
| 11  | single-day chapter of 8 assets                       | included (no distinct-day minimum)                                                                                                                                              |
| 12  | chapter year is 4 years back                         | `recencyBonus` = 6 in the score (D6)                                                                                                                                            |
| 13  | equal chapters, one dated 2 yrs back, one 8 yrs back | the **2-years-back** chapter scores higher (D6). Note the bonus keys off the _chapter year_, not the dormancy gap — a recently-dormant person can still have an ancient chapter |
| 14  | assets exceed `ASSET_CAP`                            | 8 ids, evenly spaced by time                                                                                                                                                    |
| 15  | every candidate                                      | `visibleForDays === 7`, `dedupeKey` has **no** year                                                                                                                             |

Pet, hidden-person and unnamed-person exclusion (D7) live in SQL, so they are asserted in the
**medium** test (§4.4), not here — a unit test against a mocked repository would only be asserting
the mock.

### 4.3 Registry / metadata / preferences specs

Mechanical, per §3.1 rows 2, 4, 7, 8: key present, `kind: 'rule'`, `defaultEnabled: true`,
`adminConfigurable: true`; factory returns a `PersonThrowbackMemoryRule`; completeness guard
10 → 11; default preference map gains `person_throwback: true`; both `availableMemoryTypes`
assertions gain the key in registry order.

### 4.4 Medium test (real DB)

| #   | Scenario                                                | Expect                                                                |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | dormant named person with a dense chapter, type enabled | memory created, correct assets                                        |
| 2   | same person, but `person.type = 'pet'`                  | **no** memory (D7)                                                    |
| 3   | same person, but `isHidden = true`                      | no memory                                                             |
| 4   | same person, but `name = ''`                            | no memory                                                             |
| 5   | recent photos exist but are `Archived`                  | **still** dormant → memory (predicate parity, §3.3)                   |
| 6   | user has the type toggled off                           | no memory                                                             |
| 7   | rule already fired for that person                      | no second memory; a **different** dormant person is used instead (D8) |

Scenario 7 is the Tier-3 regression guard and is the single most important row in this table.

## 5. Risks

| Risk                                                                                | Mitigation                                                                                                            |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Resurfacing a deceased or estranged person                                          | D1 (no gap claim), D3 (dilution), D5/D6 (never rank by dormancy), D7 (no pets); per-user toggle; §8 follow-up         |
| Rule goes permanently dry after firing once per person                              | D8 multi-candidate pool; medium test §4.4 #7                                                                          |
| Heavy subject (thousands of photos) makes the density query expensive               | D9 — density runs on daily counts; asset fetch is window-bounded                                                      |
| Slot starvation of the 1-day rules                                                  | Trigger day 26 fires monthly, `visibleForDays: 7`, and the engine's existing multi-day one-slot cap applies unchanged |
| `defaultEnabled: true` ships it to every user on upgrade with no per-person opt-out | Accepted (D10). §8 follow-up is the durable answer.                                                                   |

## 6. Verification

### 6.1 Gates

`pnpm test` (server), `pnpm test:medium`, `tsc --noEmit`, `eslint --max-warnings 0`,
`prettier --check .` over the **whole** server package, web `check:typescript` + `check:svelte` +
`pnpm lint`, and `prettier` over `docs/`.

### 6.2 Codegen

The three new repository methods are `@GenerateSql`-decorated, so `make sql` must be re-run —
**with a running DB, and after a build**; running it without one deletes every query file. No DTO
or endpoint changes, so **no** OpenAPI regeneration and **no** Dart client regeneration.

## 7. Notes for the implementer

1. `person.type` is a plain `character varying` defaulting to `'person'`; pets are `'pet'`. There is
   no enum — filter on the string literal, as `person.repository.ts` already does elsewhere.
2. `getMemoryFacesForPeriod` does **not** filter `person.type`, so the shipped `people_together`
   rule can already pair a human with a pet ("Anna & Rex"). That is charming and out of scope here.
3. **Adjacent, not in scope:** `getMemoryAssetsForPerson`'s `DISTINCT ON (asset.id) ORDER BY
asset.id … LIMIT 60` means the shipped `birthday` rule samples an arbitrary 60 assets by UUID for
   anyone with more than 60 photos, skewing its per-year distribution. Worth its own issue.

## 8. Follow-up PR (not this branch)

Add `person.excludeFromMemories` (migration in `server/src/schema/migrations-gallery/`), honoured by
**every** person-based rule — `person_throwback`, `people_together`, and especially `birthday`,
which currently wishes a deceased person a happy birthday with no opt-out short of `isHidden`.
Needs: migration, DTO, web person UI, mobile person UI.

Also correct the roadmap while there: **#12 Semantic themes (CLIP)** is listed as an unshipped 🔴
north star, but PR #812's `themed` rule already rides smart-search CLIP embeddings — the remaining
work is vocabulary breadth and the `themeMaxDistance` calibration, not new infrastructure.
