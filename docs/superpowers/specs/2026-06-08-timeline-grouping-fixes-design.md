# Timeline Grouping — Feedback Fixes (Bug 1 + Bug 2)

**Date:** 2026-06-08
**Status:** Design — awaiting review
**Related:** [2026-05-19-timeline-grouping-design.md](./2026-05-19-timeline-grouping-design.md), [2026-05-22-mobile-timeline-overview-design.md](./2026-05-22-mobile-timeline-overview-design.md) (PR #625)

## Context

Hagen reported two issues against the timeline grouping feature (Year / Month / Day zoom levels, shipped in PR #625):

1. **Drill-up skips a level (mobile).** Drill-down works (Year → Month → Day, via the top control or by tapping tiles). But tapping the grouping control while in Day view jumps straight to Year instead of going up one level to Month.
2. **Year-tile cover thumbnails load slowly.** In Year view, each year tile's cover shows a grey placeholder for several seconds on every visit. Noticeable at 220k assets; expected to be worse at 550k+.

This spec covers the fixes for both. The two bugs are independent and can ship together or separately.

## Bug 1 — Mobile drill-up bounce

### Root cause

The control Hagen taps is the **compact** grouping selector (`TimelineGroupingSelector.compact()` in the timeline app bar, `mobile/lib/presentation/pages/dev/main_timeline.page.dart`). Its tap handler `_selectNext()` (`mobile/lib/presentation/widgets/timeline/timeline_grouping_selector.widget.dart:168`) is a one-directional **wrap** cycle:

```dart
year  => month,
month => day,
day   => year,   // from Day, wraps straight back to Year — the reported bug
```

So from Day, one tap lands on Year. The full 3-segment selector (overview header) and the long-press menu both use direct selection and are correct; only the compact tap cycle is wrong.

### Desired behaviour (ping-pong)

Tapping bounces between the extremes, inverting direction at each end:

```
Year → Month → Day → Month → Year → Month → Day → …
```

(The compact chip labels the bottom level **"Day"**; the web control labels the same level **"All"**. We keep "Day" on mobile — label alignment is out of scope.)

### Design

The ends (Year, Day) are self-correcting — from Year you can only go down, from Day only up. Only the **middle** (Month) is ambiguous, so we need to remember the current direction.

`_TimelineGroupingCompactSelector` becomes a `StatefulWidget` holding an ephemeral `bool _zoomingIn`:

- `year → month`, set `_zoomingIn = true`
- `day → month`, set `_zoomingIn = false`
- `month → _zoomingIn ? day : year` (preserve direction)
- `didUpdateWidget`: when `selected` changes externally to an extreme, sync `_zoomingIn` (Year ⇒ true, Day ⇒ false; Month leaves it unchanged).
- Default `_zoomingIn = true` on first mount.

The long-press menu (`_showMenu`) and the full selector are unchanged — they keep direct, explicit selection.

### Testing (TDD)

Rewrite the compact-selector test in
`mobile/test/presentation/widgets/timeline/timeline_grouping_selector_test.dart`:

- Starting at Day, tap → Month (was the buggy `Day → Year` assertion).
- Full bounce from each starting level: `Year→Month→Day→Month→Year`.
- Direction is preserved through Month in both directions.
- Long-press menu still selects directly (regression guard).

### Scope

Mobile only. Single widget + its test. No server/SDK/web changes.

## Bug 2 — Slow year/month covers

### Root cause (web/server)

`AssetRepository.getTimeBuckets` (`server/src/repositories/asset.repository.ts:879`) always computes a per-bucket cover via a `bucket_representatives` CTE:

```sql
SELECT DISTINCT ON (timeBucket) id, thumbhash, ratio
ORDER BY timeBucket, ("localDateTime" AT TIME ZONE 'UTC')::date <order>, fileCreatedAt <order>
```

Problems:

- **Unconditional.** There is no request flag — every `getTimeBuckets` call computes covers, including the default month-scrubber timeline that never displays a cover. Upstream Immich returns only `{ timeBucket, count }`; this CTE is a fork addition that regressed the hot path.
- **Full sort.** The bucket key is a `date_trunc` expression. There is a functional index for **month** (`asset_localDateTime_month_idx`) and one on the date cast (`asset_localDateTime_idx`), but **none for year**, so `DISTINCT ON` over year buckets sorts the entire filtered asset set.
- **Uncached.** The response JSON is dynamic and not HTTP-cached, so it recomputes on every visit. Year buckets are the largest → slowest.

Symptom chain: open Year view → web refetches `getTimeBuckets(bucketSize=year)` on mount (`web/.../timeline-manager.svelte.ts:285`) → server sorts all assets → several seconds → tiles grey until the response lands.

### Mobile reality (investigated — verify-only)

Mobile is **already** lazy and disk-cached, so the cover symptom is a web/server problem:

- Covers load per-visible-segment via `FutureBuilder` (`overview_segment.model.dart:75`) from the local Drift DB.
- Remote thumbnails are disk-cached across launches (iOS `URLSession returnCacheDataElseLoad`; Android OkHttp disk cache).
- Mobile's real O(n)-per-visit scale cost is the `mergedBucket` **count** query (the core watched timeline stream), which is a separate concern and the backbone of the whole timeline.

**Mobile scope = verify-only:** confirm covers stay lazy + disk-cached; do **not** rewrite `mergedBucket` as part of this fix.

### Design (web/server): counts-only buckets + dedicated lazy cover endpoint

The cleanest realisation of "optimize + lazy-load": stop computing covers inside `getTimeBuckets` entirely, and resolve them on demand for visible buckets via a dedicated, index-friendly endpoint.

**Server**

1. **Remove the `bucket_representatives` CTE from `getTimeBuckets`.** It returns counts only — restoring the fast, upstream-shaped hot path. Drop the `representativeAssetId/Thumbhash/Ratio` fields from `TimeBucketsResponseDto`.

   _Design decision — remove vs. gate:_ we **remove** covers from `getTimeBuckets` and serve them only from the dedicated endpoint (single mechanism, clean API). The lower-blast-radius alternative is to keep the fields and add a `withCover` flag (default `false`) so the shape is unchanged; rejected because it leaves two redundant cover paths. The trade-off is that removal touches the e2e API assertions and the web UI mock generator (see Testing).
2. **New cover endpoint** — `getTimeBucketCovers`: takes the standard timeline filters (shared with `TimeBucketDto`) + `bucketSize` + the set of `timeBuckets` to resolve, and returns one representative per requested bucket: `[{ timeBucket, representativeAssetId, representativeThumbhash, representativeRatio }]`.
3. **Index-friendly per-bucket resolution.** Resolve each requested bucket's representative with a per-bucket lookup that can use `asset_localDateTime_month_idx` / `asset_localDateTime_idx`, rather than a global sort. Validate the plan with `EXPLAIN ANALYZE` on the 220k+ personal instance before/after. Year/Month grouping have at most a few hundred buckets, so a handful of index seeks per request is cheap.

**Web**

- Render tiles immediately from counts (thumbhash skeleton — no grey wait). Call `getTimeBuckets` without covers.
- `TimelineRepresentativeBuckets` already windows the visible buckets; have it request covers for visible (+ small overscan) buckets via the new endpoint, store them on the `TimelineBucket`, and render when they arrive. Memoize resolved covers in the `TimelineManager` so they are instant within a session; the cover images themselves stay HTTP-cached (`max-age=86400`) across visits.

### Data flow (web, after)

1. Mount Year view → `getTimeBuckets(bucketSize=year)` → counts only (fast) → all year tiles render with thumbhash skeletons.
2. Viewport windowing yields visible bucket keys → `getTimeBucketCovers(filters, year, [keys])` (batched) → covers stream into the visible tiles.
3. Scroll → new visible buckets request their covers; resolved covers are memoized; images are HTTP-cached on re-fetch.

### Testing (TDD)

- **Server (medium, real DB):** `getTimeBuckets` returns counts only and no longer runs the representative sort; `getTimeBucketCovers` returns the correct representative per bucket for ASC and DESC order and honours every filter (person / space-person / tag / album / shared-space / visibility / favourite / type / date range). Edge: empty bucket set, unknown bucket key.
- **Server (manual):** `EXPLAIN ANALYZE` before/after on the personal instance; record timings in the PR.
- **Web (vitest):** manager loads covers only for visible buckets, memoizes them, and tiles render before covers arrive; `getTimeBuckets` is called without covers.
- **Mobile (verify):** assert covers remain lazy; add tests only if a concrete change is made (none planned).
- **E2E (blast radius from removing the fields):**
  - `e2e/src/specs/server/api/timeline.e2e-spec.ts` currently asserts `getTimeBuckets` returns `representativeAssetId/Thumbhash/Ratio` — update to assert counts-only, and add coverage for `getTimeBucketCovers`.
  - `e2e/src/ui/generators/timeline/rest-response.{ts,spec.ts}` (Playwright UI mock generator) inlines representatives into bucket responses — update it to serve covers via the new endpoint mock so web UI tests match the new flow.

### OpenAPI / codegen

New endpoint + changed `TimeBucketsResponseDto` ⇒ regenerate the SDK and Dart client (`pnpm -C server sync:open-api` then `make open-api`; the "OpenAPI Clients" CI job runs `generate-open-api.sh` + git-diff, and `make open-api-typescript` alone leaves Dart stale).

## Out of scope

- Mobile `mergedBucket` count-query optimization (separate, higher-risk).
- Mobile chip label "Day" → "All" alignment.
- Server-side caching / materialised cover table (the index-friendly per-bucket query is expected to be fast enough; revisit only if benchmarks say otherwise).

## Rollout / validation

- Benchmark Bug 2 on the personal instance (220k+) and, if needed, a Hagen-scale personal-clone via the RC/clone tooling.
- Ship behind no flag; both are bug fixes. Bug 1 and Bug 2 are independent and can be separate commits/PRs.
