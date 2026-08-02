# Timeline grouping: separate the fork's overview mode from upstream's grid grouping

**Date:** 2026-08-02
**Branch:** `worktree-fix-903-photo-grid-group-by` (PR #911)
**Status:** design approved, pending implementation

## Background

PR #911 fixes [#903](https://github.com/open-noodle/gallery/discussions/903): choosing **Month** under
Settings → Photo Grid → **Group by** produced the month-card overview instead of a month-headered photo
grid. The cause was PR #625, which made the on-page Years / Months / All selector read and write
`SettingsKey.timelineGroupAssetsBy` — the same key behind the settings picker. Any month/year value in
that key routes the timeline to `TimelineOverviewSegmentBuilder`, so the setting became unusable.

#911 separates the two at the provider level and ships the user-visible fix. A review of the diff against
`upstream/main` found that the fix, as written, pays for that separation in the wrong currency: it adds
fork concepts to upstream-owned files, and in one case triples a file's rebase surface for no behavioural
reason. It also leaves the underlying type confusion in place.

This design covers both: reducing the divergence #911 introduced, and removing the ambiguity that made
#625's mistake possible.

### Measured divergence from `upstream/main`

| File                             | Owner          | Before #911 | After #911  |
| -------------------------------- | -------------- | ----------- | ----------- |
| `timeline.state.dart`            | upstream       | 17+/4-      | **48+/20-** |
| `timeline.model.dart`            | upstream       | 2+/2-       | **12+/2-**  |
| `asset_list_group_settings.dart` | upstream       | 4+/0-       | 3+/1-       |
| `timeline.service.dart`          | already forked | 143+/44-    | 145+/48-    |
| `main_timeline.page.dart`        | already forked | 94+/5-      | 95+/5-      |

All 12 test files touched by #911 are fork-only and carry no rebase cost.

### Ownership of the grouping call chain

Everything that speaks the _selector's_ meaning is already fork-only, which is what makes this change
contained.

| Fork-only — free to change                                     | Upstream-owned — fork types must not leak in |
| -------------------------------------------------------------- | -------------------------------------------- |
| `timeline_grouping_selector.widget.dart`                       | `timeline.widget.dart` (280+/64-)            |
| `overview_drilldown.provider.dart`                             | `timeline.repository.dart` (1083+/120-)      |
| `timeline_grouping_anchor.dart`                                | `header.widget.dart` (20+/5-)                |
| `timeline_scroll_target.dart`                                  | `fixed/segment_builder.dart` (1+/0-)         |
| `overview_card.dart`, `overview_segment_builder.dart`          | `segment_builder.dart` (1+/0-)               |
| `scrubber.dart`, `scrubber_segments.dart`                      | `timeline.state.dart`, `timeline.model.dart` |
| `timeline_grouping.provider.dart`, `timeline_route_scope.dart` |                                              |

## Problem statement

One type, `GroupAssetsBy`, carries two unrelated meanings:

- **Upstream's meaning** — how coarse the photo grid's date headers are. `month` = one header per month
  instead of one per day. This is the persisted Group by setting.
- **The fork's meaning** — which zoom level the timeline is at. `months` = render the month **cards**
  overview instead of photos. This is the Years / Months / All pill.

Both meanings inhabit the same enum, so no call site — and no compiler — can tell which one it is being
handed. #903 is the direct consequence.

#911 separates the providers but not the vocabulary. The ambiguity survives in live code, for example
`timeline_scroll_target.dart:29`:

```dart
TimelineZoomMonthAnchor(...) when groupBy == GroupAssetsBy.day => ...
```

Here `day` means "the user has drilled down to All", not "day headers". Passing the header granularity
instead compiles cleanly and silently scrolls to the wrong place.

## Goals

1. Return `timeline.state.dart` and `timeline.model.dart` to approximately their pre-#911 divergence.
2. Make the two grouping concepts distinct types, so mixing them is a compile error.
3. Keep the persisted setting's meaning defined in exactly one place.
4. No user-visible behaviour change beyond the #903 fix #911 already ships.

## Non-goals

`GroupAssetsBy.year` and `HeaderType.year` stay in upstream's enums. The query layer genuinely needs year
bucketing (`timeline.repository.dart` lines 1445, 1526, 1532, 1688, 1709) and `HeaderType.year` renders
the overview's year headers. Two single-line divergences therefore remain, in `fixed/segment_builder.dart`
and `segment_builder.dart`, both forced by Dart's exhaustive switches over those enums.

Evicting `year` from `GroupAssetsBy` was considered and rejected: it would make
`fixed/segment_builder.dart` byte-identical to upstream at a cost of 36 repository method signatures, 15
`TimelineFactory` methods, 15 timeline-service builder call sites and five blocks of bucketing SQL — and
would push a fork type into upstream's repository signatures, entangling the two more rather than less.

## Design

### 1. New fork-only vocabulary

New file `mobile/lib/domain/models/timeline_grouping.model.dart`. Being a new fork-only file, it has zero
rebase surface. Living in `domain/` lets `TimelineFactory` import it without the layering inversion that
originally pushed `normalizeGridGrouping` into `timeline.model.dart`.

```dart
/// Which zoom level the timeline is at. Fork-only: upstream has no overview.
/// Deliberately NOT GroupAssetsBy — that type means "how coarse are the grid's
/// date headers", and conflating the two is what caused #903.
enum TimelineOverviewMode { years, months, all }

/// The persisted "Photo Grid" -> "Group by" setting, clamped to the two
/// granularities the grid renders.
GroupAssetsBy normalizeGridGrouping(GroupAssetsBy groupBy) =>
    groupBy == GroupAssetsBy.month ? GroupAssetsBy.month : GroupAssetsBy.day;
```

`normalizeGridGrouping` moves here from `timeline.model.dart`, which reverts to 2+/2- — the two `year`
enum values that predate this work.

`normalizeTimelineGrouping` is **deleted**. It existed to clamp `GroupAssetsBy` down to the three selector
positions; `TimelineOverviewMode` is already that closed set, so there is nothing to clamp. Two
confusably-named normalize functions become one.

### 2. Provider layer

| Today                                              | After                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `timelineGroupingProvider` → `GroupAssetsBy`       | `timelineOverviewModeProvider` → `TimelineOverviewMode`, `build() => all`               |
| `timelineGridGroupingProvider` → `GroupAssetsBy`   | unchanged — the persisted setting                                                       |
| `timelineBucketGroupingProvider` → `GroupAssetsBy` | `timelineGroupingSpecProvider` → `({TimelineOverviewMode mode, GroupAssetsBy groupBy})` |

```dart
final timelineGroupingSpecProvider = Provider<TimelineGroupingSpec>((ref) {
  final mode = ref.watch(timelineOverviewModeProvider);
  return switch (mode) {
    TimelineOverviewMode.years  => (mode: mode, groupBy: GroupAssetsBy.year),
    TimelineOverviewMode.months => (mode: mode, groupBy: GroupAssetsBy.month),
    TimelineOverviewMode.all    => (mode: mode, groupBy: ref.watch(timelineGridGroupingProvider)),
  };
}, dependencies: [timelineOverviewModeProvider]);
```

One provider answers both questions the timeline asks — _cards or grid?_ and _at what granularity?_ —
which is what allows `timeline.state.dart` to watch a single provider.

`timelineGroupingSpecProvider` must declare `dependencies: [timelineOverviewModeProvider]`, and
`TimelineRouteScope` must keep overriding the mode provider, so that a detail route's auto-scoped copy
resolves the route-local mode rather than the root one.

### 3. `timeline.state.dart` returns to upstream's shape

```dart
  final spec = groupByArg != null
      ? (mode: TimelineOverviewMode.all, groupBy: groupByArg)
      : ref.watch(timelineGroupingSpecProvider);

  final timelineService = ref.watch(timelineServiceProvider);
  yield* timelineService.watchBuckets().map((buckets) {
    // A date-less bucket source (relevance-sorted search, `fromAssets`) has no dates
    // to group by — fall back to the flat grid.
    final isDateless = buckets.isNotEmpty && buckets.first is! TimeBucket;
    if (spec.mode != TimelineOverviewMode.all && !isDateless) {
      return TimelineOverviewSegmentBuilder(buckets: buckets, mode: spec.mode).generate();
    }
    return FixedSegmentBuilder(
      buckets: buckets,
      tileHeight: tileExtent,
      columnCount: columnCount,
      spacing: spacing,
      groupBy: isDateless ? GroupAssetsBy.day : spec.groupBy,
    ).generate();
  });
}, dependencies: [timelineServiceProvider, timelineArgsProvider, timelineGroupingSpecProvider]);
```

The single-provider dependency list is 96 characters against the 120 limit set by `analysis_options.yaml`,
so `dart format` leaves the one-line trailing form alone and the whole provider body keeps upstream's
indentation. This is the mechanism behind the 48+/20- → ~12+/3- reduction: the current four-entry list is
124 characters, which forces the multi-line argument form and reindents ~25 otherwise-untouched upstream
lines.

The `groupByArg != null` short-circuit is preserved, so the one caller that pins a grouping
(`cleanup_preview.page.dart:38`, `GroupAssetsBy.day`) does not begin watching a provider it never needed.

### 4. Retyping the fork-only chain

Mechanical, no behaviour change:

- `timeline_grouping_selector.widget.dart` — the pill's three positions and labels
- `overview_drilldown.provider.dart` — `.set(months)` / `.set(all)` replace `.set(month)` / `.set(day)`
- `overview_card.dart`, `overview_segment_builder.dart` — take the mode; the builder maps it to
  `HeaderType`
- `scrubber.dart`, `scrubber_segments.dart` — take the mode
- `timeline_grouping_anchor.dart` — `previousGroupBy` → `previousMode`
- `timeline_route_scope.dart` — overrides `timelineOverviewModeProvider`, reads the spec
- `timeline_scroll_target.dart` — the guards become `when mode == TimelineOverviewMode.all` / `.months`

The last one is the payoff: the guard finally states what it means, and passing a header granularity there
stops compiling.

### 5. Upstream files touched by item 4

Only `timeline.widget.dart`, at three lines (223 `listenManual`, 472, 611), in a file already 280+/64-
diverged. Those sites split: the **mode** feeds the zoom anchor, `spec.groupBy` feeds the scrubber.

That split is a small correctness improvement in its own right. Today the scrubber receives the selector
position while rendering segments built at the _bucket_ granularity. It is harmless at present because
`day` and `month` take the same branch in `scrubber_segments.dart` — only `year` is special-cased — but it
is wrong on paper, and the retype fixes it at no extra cost.

### 6. Settings screen

`asset_list_group_settings.dart` watches `timelineGridGroupingProvider` rather than re-normalizing
`appConfigProvider` itself. The line count barely moves; the point is that the definition of what the
setting means lives in exactly one place instead of two.

## Test strategy

### TDD discipline

This is a refactor of working code, so the usual TDD ordering needs one adjustment: **the behaviour is
already specified by the existing suite.** The rule for this work is therefore:

1. **Characterise before you change.** For each behaviour below that is not already asserted, write the
   test against the _current_ implementation and watch it pass. That is the safety net. Only then retype.
2. **RED first for anything genuinely new.** The `timelineGroupingSpecProvider` mapping, the pinned-grouping
   path and the legacy-value cases are new behaviour with no existing coverage. Write those tests first,
   run them, and confirm they fail for the stated reason before writing the provider.
3. **One behaviour per test.** No test asserts both "which builder ran" and "at what granularity" unless
   the scenario is specifically about their interaction.
4. **Mutation-check every test not written RED-first.** A characterisation test that passes against the
   old code proves nothing until you have seen it fail. Revert the specific line it guards, confirm the
   red, restore. This is not optional — it is the only evidence a characterisation test is load-bearing.
   Two tests in #911 were caught this way.
5. **No assertion that cannot fail.** Watch for the usual shapes: asserting a setting nothing writes any
   more, substring matches that collide with other numbers on screen, and querying a widget that is absent
   in both the pass and fail case.
6. **A behavioural rewrite of an existing test is a red flag.** Nothing in this design changes what the app
   does. If a test needs its _assertions_ changed rather than just its _names_, stop: the retype has
   changed semantics somewhere it should not have.

### BDD scenarios

Written Given/When/Then. Each maps to one test; the file column names where it belongs.

#### The #903 guard — the setting and the pill are independent

| #   | Given                                        | When                             | Then                                                          | File                                   |
| --- | -------------------------------------------- | -------------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| G-1 | Group by = **Month**, pill = **All**         | the timeline builds segments     | `FixedSegmentBuilder` runs with `GroupAssetsBy.month`         | `timeline_segment_provider_test.dart`  |
| G-2 | Group by = **Month + day**, pill = **All**   | the timeline builds segments     | `FixedSegmentBuilder` runs with `GroupAssetsBy.day`           | `timeline_segment_provider_test.dart`  |
| G-3 | Group by = **Month**, pill = **Months**      | the timeline builds segments     | `TimelineOverviewSegmentBuilder` runs; the setting is ignored | `timeline_segment_provider_test.dart`  |
| G-4 | Group by = **Month + day**, pill = **Years** | the timeline builds segments     | `TimelineOverviewSegmentBuilder` runs at year granularity     | `timeline_segment_provider_test.dart`  |
| G-5 | any Group by value                           | the pill is moved to **Months**  | `SettingsKey.timelineGroupAssetsBy` is **not** written        | `timeline_grouping_selector_test.dart` |
| G-6 | pill = **Months**                            | Group by is changed to **Month** | the pill stays on **Months**                                  | `asset_list_group_settings_test.dart`  |

G-1 and G-5 are the two that would have caught #903. Both must be present and both must have been seen to
fail.

#### Mode → spec mapping

| #   | Given                             | When                | Then                                  | File                               |
| --- | --------------------------------- | ------------------- | ------------------------------------- | ---------------------------------- |
| M-1 | mode = `years`                    | the spec is read    | `(years, GroupAssetsBy.year)`         | `timeline_grouping_spec_test.dart` |
| M-2 | mode = `months`                   | the spec is read    | `(months, GroupAssetsBy.month)`       | `timeline_grouping_spec_test.dart` |
| M-3 | mode = `all`, setting = `day`     | the spec is read    | `(all, GroupAssetsBy.day)`            | `timeline_grouping_spec_test.dart` |
| M-4 | mode = `all`, setting = `month`   | the spec is read    | `(all, GroupAssetsBy.month)`          | `timeline_grouping_spec_test.dart` |
| M-5 | mode = `years`, setting = `month` | the spec is read    | `groupBy` is `year` — setting ignored | `timeline_grouping_spec_test.dart` |
| M-6 | mode = `all`                      | the setting changes | the spec's `groupBy` follows it       | `timeline_grouping_spec_test.dart` |
| M-7 | mode = `months`                   | the setting changes | the spec is unchanged                 | `timeline_grouping_spec_test.dart` |

#### Legacy and out-of-range persisted values

The Year radio shipped in a fork build, so `year` can be sitting in a real user's store. `auto` and `none`
are upstream legacy values. None of them are reachable through the UI any more.

| #   | Given stored `timelineGroupAssetsBy` | Then `normalizeGridGrouping` | And the settings screen shows | File                                  |
| --- | ------------------------------------ | ---------------------------- | ----------------------------- | ------------------------------------- |
| L-1 | `day`                                | `day`                        | **Month + day** selected      | `timeline_grouping_model_test.dart`   |
| L-2 | `month`                              | `month`                      | **Month** selected            | `timeline_grouping_model_test.dart`   |
| L-3 | `year` (removed option)              | `day`                        | **Month + day** selected      | `asset_list_group_settings_test.dart` |
| L-4 | `auto` (upstream legacy)             | `day`                        | **Month + day** selected      | `timeline_grouping_model_test.dart`   |
| L-5 | `none` (upstream legacy)             | `day`                        | **Month + day** selected      | `timeline_grouping_model_test.dart`   |

L-3 is the one with a real user behind it. It must assert a radio is _selected_, not merely that the
screen renders — "renders without a selection" is exactly the failure mode.

#### Route scoping

| #   | Given                                   | When                            | Then                                                   | File                             |
| --- | --------------------------------------- | ------------------------------- | ------------------------------------------------------ | -------------------------------- |
| R-1 | main timeline pill = **Years**          | an album route opens            | the album opens at **All**                             | `timeline_route_scope_test.dart` |
| R-2 | inside an album                         | the pill is moved to **Months** | the main timeline's pill is unchanged                  | `timeline_route_scope_test.dart` |
| R-3 | main timeline pill = **Months**         | navigate away and back          | the pill is still **Months** (`sharedGrouping: true`)  | `timeline_route_scope_test.dart` |
| R-4 | inside an album with a route-local mode | the segment provider is read    | it resolves the **route-local** mode, not the root one | `timeline_route_scope_test.dart` |
| R-5 | app cold start                          | the main timeline opens         | the pill is **All** regardless of the stored setting   | `timeline_route_scope_test.dart` |

R-4 is the `dependencies:` correctness test. It is the one that silently regresses if a provider is added
to the chain without being declared, and it must fail if `timelineGroupingSpecProvider` drops its
`dependencies: [timelineOverviewModeProvider]`.

#### Segment builder selection and its edge cases

| #   | Given                                                   | Then                                                           | File                                  |
| --- | ------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------- |
| S-1 | date-less buckets (relevance search), mode = **All**    | `FixedSegmentBuilder` with `day`                               | `timeline_segment_provider_test.dart` |
| S-2 | date-less buckets, mode = **Months**                    | `FixedSegmentBuilder` with `day` — **never** the overview      | `timeline_segment_provider_test.dart` |
| S-3 | date-less buckets, mode = **Years**                     | `FixedSegmentBuilder` with `day`                               | `timeline_segment_provider_test.dart` |
| S-4 | **empty** bucket list, mode = **Months**                | no crash; segments are empty                                   | `timeline_segment_provider_test.dart` |
| S-5 | empty bucket list, mode = **All**, Group by = **Month** | no crash; segments are empty                                   | `timeline_segment_provider_test.dart` |
| S-6 | `groupByArg` pinned to `day`, mode = **Months**         | `FixedSegmentBuilder` with `day`; the overview is never chosen | `timeline_segment_provider_test.dart` |
| S-7 | `groupByArg` pinned                                     | the spec provider is not watched                               | `timeline_segment_provider_test.dart` |

S-4 deserves emphasis. `isDateless` is computed as `buckets.isNotEmpty && buckets.first is! TimeBucket`,
so an **empty** list yields `isDateless == false` and an overview-mode timeline will call
`TimelineOverviewSegmentBuilder` with no buckets. That path exists today and is untested. Characterise it
before touching anything; if it turns out to throw, that is a pre-existing bug to fix in this PR, not to
introduce.

S-7 guards the short-circuit described in §3 — a pinned grouping must not create a subscription.

#### Zoom anchor and drill-down

This is the highest-risk area of the retype, because the anchor guards are exactly the call sites where
the two meanings were previously indistinguishable.

| #   | Given                                                            | When                   | Then                                           | File                                        |
| --- | ---------------------------------------------------------------- | ---------------------- | ---------------------------------------------- | ------------------------------------------- |
| Z-1 | mode = **Years**                                                 | a year card is tapped  | mode becomes **Months**, anchored on that year | `overview_drilldown_provider_test.dart`     |
| Z-2 | mode = **Months**                                                | a month card is tapped | mode becomes **All**, anchored on that month   | `overview_drilldown_provider_test.dart`     |
| Z-3 | a `YearAnchor` is pending                                        | mode = **Months**      | it resolves to the matching year segment       | `timeline_zoom_anchor_resolution_test.dart` |
| Z-4 | a `MonthAnchor` is pending                                       | mode = **All**         | it resolves to the matching month segment      | `timeline_zoom_anchor_resolution_test.dart` |
| Z-5 | a `MonthAnchor` is pending                                       | mode = **Months**      | it does **not** resolve                        | `timeline_zoom_anchor_resolution_test.dart` |
| Z-6 | a `MonthAnchor` is pending, **Group by = Month**, mode = **All** | resolution runs        | it **still** resolves                          | `timeline_zoom_anchor_resolution_test.dart` |
| Z-7 | an anchor was scheduled for one mode                             | the mode changes first | resolution bails out                           | `main_timeline_zoom_test.dart`              |
| Z-8 | no anchor set                                                    | segments render        | nothing scrolls                                | `main_timeline_zoom_test.dart`              |

**Z-6 is the critical one.** It is the test that fails if someone "helpfully" feeds `spec.groupBy` to the
anchor instead of `spec.mode`: with Group by = Month the bucket grouping is `month`, so a `MonthAnchor`
would stop matching an `all`-mode guard and drilling from Months into All would silently fail to scroll.
This scenario did not exist before this design and must be written RED against a deliberately wrong
implementation first.

#### Scrubber labels

| #   | Given                                | Then                                      | File                          |
| --- | ------------------------------------ | ----------------------------------------- | ----------------------------- |
| B-1 | mode = **Years**                     | labels are year-only (`DateFormat.y`)     | `scrubber_segments_test.dart` |
| B-2 | mode = **Months**                    | labels are month+year (`DateFormat.yMMM`) | `scrubber_segments_test.dart` |
| B-3 | mode = **All**, Group by = **Month** | labels are month+year                     | `scrubber_segments_test.dart` |

B-3 pins the behaviour that makes the §5 scrubber change safe.

#### `TimelineFactory.groupBy` fallback

Reached only by routes that do not pass an explicit grouping.

| #   | Given stored setting | Then `TimelineFactory.groupBy` | File                         |
| --- | -------------------- | ------------------------------ | ---------------------------- |
| F-1 | `month`              | `month`                        | `timeline_service_test.dart` |
| F-2 | `day`                | `day`                          | `timeline_service_test.dart` |
| F-3 | `year`               | `day`                          | `timeline_service_test.dart` |
| F-4 | `auto`               | `day`                          | `timeline_service_test.dart` |

### Migrating the existing suite

All 12 fork-only test files touched by #911 need the rename applied. Rules:

- Renames only. `GroupAssetsBy.day` as a _pill position_ becomes `TimelineOverviewMode.all`;
  `GroupAssetsBy.month` as a _pill position_ becomes `TimelineOverviewMode.months`. Where the same literal
  meant header granularity, it stays `GroupAssetsBy`.
- The mock timeline-service factories in `main_timeline_zoom_test.dart` must keep honouring the `groupBy`
  the production code passes them rather than re-reading the setting. #911 already fixed this; do not let
  the retype reintroduce it, or the tests will shadow the wiring instead of exercising it.
- Any test whose _assertions_ change is escalated, not edited. See TDD rule 6.

### Gates

From `mobile/`, with the pinned Flutter 3.44.8 (`mobile/mise.toml`):

```
flutter test
dart analyze --fatal-infos lib test
dart format lib
```

`dart analyze --fatal-infos` and `dart format` are separate CI gates and both are blocking. `dart analyze`
alone is not a substitute for `flutter test`: generated-code compile errors only surface when a test
actually compiles.

Baseline to beat: 2902 passing, 0 failures.

## Expected outcome

| File                             | After #911 | After this work |
| -------------------------------- | ---------- | --------------- |
| `timeline.state.dart`            | 48+/20-    | ~12+/3-         |
| `timeline.model.dart`            | 12+/2-     | 2+/2-           |
| `asset_list_group_settings.dart` | 3+/1-      | ~2+/1-          |
| `timeline.widget.dart`           | 280+/64-   | ~283+/67-       |

Plus one new fork-only file and a fork-only chain that can no longer be confused with upstream's.

## Delivery

All four items land in PR #911, per Pierre's decision. The PR therefore carries the #903 fix, the
divergence reduction, and the type separation together.
