# Timeline Grouping Upstream-Divergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the fork's Years/Months/All timeline selector its own type so it can no longer be confused with upstream's Group-by header granularity, and return the upstream-owned files PR #911 touched to near their original divergence.

**Architecture:** A new fork-only `TimelineOverviewMode { years, months, all }` becomes the selector's state type. A single derived provider, `timelineGroupingSpecProvider`, resolves that mode plus the persisted Group-by setting into one record `(mode, groupBy)` — the only thing `timeline.state.dart` needs to watch. Upstream's `GroupAssetsBy` keeps its original meaning everywhere else: buckets, headers, the scrubber, and the query layer.

**Tech Stack:** Flutter 3.44.8, Dart, Riverpod (`hooks_riverpod`), Drift, `flutter_test` + `mocktail`.

**Spec:** `docs/superpowers/specs/2026-08-02-timeline-grouping-upstream-divergence-design.md`

## Global Constraints

- **Flutter 3.44.8 exactly.** Pinned in `mobile/mise.toml` (`"aqua:flutter/flutter" = "3.44.8"`). `mise exec` resolves the wrong version — invoke the binaries directly: `~/.local/share/mise/installs/flutter/3.44.8/bin/flutter` and `.../bin/dart`.
- **All commands run from `mobile/`.**
- **Formatter page width is 120** (`mobile/analysis_options.yaml:13`). Exceeding it changes how `dart format` wraps and can silently reindent whole blocks.
- **Three blocking CI gates, all required:** `flutter test`, `dart analyze --fatal-infos lib test`, `dart format lib`. `dart analyze` is not a substitute for `flutter test`.
- **Baseline: 2902 tests passing, 0 failures.** The count may only go up.
- **No behaviour change.** Nothing in this plan alters what the app does. If an existing test needs its _assertions_ changed rather than just its _identifiers_, stop and escalate — the retype has changed semantics.
- **No production line before a failing test names it.** Every scenario must be observed red before it is trusted, by one of two routes: write-first for new behaviour, or characterise-then-mutate for existing behaviour.
- **`normalizeGridGrouping` applies only where the persisted setting is read.** Never to a grouping a caller passed explicitly — `GroupAssetsBy.none` is live for relevance search.
- **Commit after every task.** Never use `--no-verify`. Never add a `Co-Authored-By` trailer.
- **Landing branch:** `worktree-fix-903-photo-grid-group-by`, on top of PR #911.

---

## File Structure

### Created

| File                                                              | Responsibility                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `mobile/lib/domain/models/timeline_grouping.model.dart`           | Fork-only vocabulary: `TimelineOverviewMode`, `TimelineGroupingSpec`, `normalizeGridGrouping`. Zero rebase surface. |
| `mobile/test/domain/models/timeline_grouping_model_test.dart`     | L-1, L-2, L-4, L-5                                                                                                  |
| `mobile/test/providers/timeline/timeline_grouping_spec_test.dart` | M-1…M-7                                                                                                             |
| `mobile/test/domain/services/timeline_factory_grouping_test.dart` | F-1…F-4                                                                                                             |

### Modified — fork-only (free to retype)

| File                                                                       | Change                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------ |
| `lib/providers/timeline/timeline_grouping.provider.dart`                   | Rewrite: mode provider + grid provider + spec provider |
| `lib/providers/timeline/overview_drilldown.provider.dart`                  | Handler typedef and switch take the mode               |
| `lib/providers/timeline/overview_representative_cache.provider.dart`       | `keyFor` takes the mode                                |
| `lib/presentation/widgets/timeline/timeline_grouping_selector.widget.dart` | Pill positions, labels, zoom cycle                     |
| `lib/presentation/widgets/timeline/timeline_grouping_anchor.dart`          | `previousGroupBy` → `previousMode`                     |
| `lib/presentation/widgets/timeline/timeline_scroll_target.dart`            | Anchor guards take the mode                            |
| `lib/presentation/widgets/timeline/timeline_route_scope.dart`              | Overrides the mode provider, reads the spec            |
| `lib/presentation/widgets/timeline/overview/overview_segment_builder.dart` | Takes the mode                                         |
| `lib/presentation/widgets/timeline/overview/overview_segment.model.dart`   | Segment carries the mode                               |
| `lib/presentation/widgets/timeline/overview/overview_card.dart`            | Card takes the mode                                    |

### Modified — upstream-owned (keep the delta minimal)

| File                                                                      | Change                                               | Divergence target    |
| ------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------- |
| `lib/domain/models/timeline.model.dart`                                   | Remove `normalizeGridGrouping`                       | 12+/2- → 2+/2-       |
| `lib/presentation/widgets/timeline/timeline.state.dart`                   | Single-provider watch, upstream indentation restored | 48+/20- → ~12+/3-    |
| `lib/widgets/settings/asset_list_settings/asset_list_group_settings.dart` | Watch `timelineGridGroupingProvider`                 | 3+/1- → ~2+/1-       |
| `lib/domain/services/timeline.service.dart`                               | Import moves to the new model file                   | ~unchanged           |
| `lib/presentation/widgets/timeline/timeline.widget.dart`                  | 4 sites split between mode and `spec.groupBy`        | 280+/64- → ~284+/68- |

### Explicitly NOT changed

- `scrubber.widget.dart` (upstream, 45+/82-) and `scrubber_segments.dart` — the whole chain stays on `GroupAssetsBy` and receives `spec.groupBy`. Its `groupBy` is a pure granularity; only `year` is special-cased.
- `timeline_query.provider.dart` — the explicit query grouping, including `GroupAssetsBy.none` for relevance search, is untouched.
- `timeline.repository.dart`, `fixed/segment_builder.dart`, `segment_builder.dart`, `header.widget.dart` — `GroupAssetsBy.year` and `HeaderType.year` stay.

---

## Task 1: Fork-only vocabulary

Pure addition. Nothing else changes yet, so the suite stays green throughout.

**Files:**

- Create: `mobile/lib/domain/models/timeline_grouping.model.dart`
- Create: `mobile/test/domain/models/timeline_grouping_model_test.dart`
- Modify: `mobile/lib/domain/models/timeline.model.dart` (remove `normalizeGridGrouping`, lines 5-14)
- Modify: `mobile/lib/domain/services/timeline.service.dart` (import only)

**Interfaces:**

- Consumes: `GroupAssetsBy` from `package:immich_mobile/domain/models/timeline.model.dart`
- Produces:
  - `enum TimelineOverviewMode { years, months, all }`
  - `typedef TimelineGroupingSpec = ({TimelineOverviewMode mode, GroupAssetsBy groupBy})`
  - `GroupAssetsBy normalizeGridGrouping(GroupAssetsBy groupBy)`

**Scenarios:** L-1, L-2, L-4, L-5 (Route A — this function has no direct test today).

- [ ] **Step 1: Write the failing test**

Create `mobile/test/domain/models/timeline_grouping_model_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/models/timeline_grouping.model.dart';

void main() {
  group('normalizeGridGrouping', () {
    test('L-1: day stays day', () {
      expect(normalizeGridGrouping(GroupAssetsBy.day), GroupAssetsBy.day);
    });

    test('L-2: month stays month', () {
      expect(normalizeGridGrouping(GroupAssetsBy.month), GroupAssetsBy.month);
    });

    test('L-4: auto falls back to day', () {
      expect(normalizeGridGrouping(GroupAssetsBy.auto), GroupAssetsBy.day);
    });

    test('L-5: none falls back to day as a persisted setting value', () {
      expect(normalizeGridGrouping(GroupAssetsBy.none), GroupAssetsBy.day);
    });

    test('year, left behind by the removed Year option, falls back to day', () {
      expect(normalizeGridGrouping(GroupAssetsBy.year), GroupAssetsBy.day);
    });
  });

  group('TimelineOverviewMode', () {
    test('has exactly the three selector positions', () {
      expect(TimelineOverviewMode.values, [
        TimelineOverviewMode.years,
        TimelineOverviewMode.months,
        TimelineOverviewMode.all,
      ]);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
~/.local/share/mise/installs/flutter/3.44.8/bin/flutter test test/domain/models/timeline_grouping_model_test.dart
```

Expected: FAIL — `Target of URI doesn't exist: 'package:immich_mobile/domain/models/timeline_grouping.model.dart'`.

- [ ] **Step 3: Create the model file**

Create `mobile/lib/domain/models/timeline_grouping.model.dart`:

```dart
import 'package:immich_mobile/domain/models/timeline.model.dart';

/// Which zoom level the timeline is at. Fork-only: upstream has no overview.
///
/// Deliberately NOT [GroupAssetsBy]. That type means "how coarse are the photo
/// grid's date headers"; this one means "which zoom level is the timeline at".
/// Storing the second in the first is what caused #903.
enum TimelineOverviewMode { years, months, all }

/// What the timeline should render for the current scope: which zoom level, and
/// the bucket/header granularity that goes with it.
typedef TimelineGroupingSpec = ({TimelineOverviewMode mode, GroupAssetsBy groupBy});

/// Clamps the persisted "Photo Grid" -> "Group by" setting to the two granularities
/// the grid renders: month + day headers ([GroupAssetsBy.day]) or month-only headers
/// ([GroupAssetsBy.month]).
///
/// Legacy `auto`/`none`, and `year` left behind by the removed Year option, all fall
/// back to day.
///
/// Apply this ONLY where the persisted setting is read. Never apply it to a grouping a
/// caller passed explicitly: `timeline_query.provider.dart` passes [GroupAssetsBy.none]
/// deliberately for relevance-sorted search, and normalizing it to day would silently
/// re-introduce date bucketing there.
GroupAssetsBy normalizeGridGrouping(GroupAssetsBy groupBy) =>
    groupBy == GroupAssetsBy.month ? GroupAssetsBy.month : GroupAssetsBy.day;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
~/.local/share/mise/installs/flutter/3.44.8/bin/flutter test test/domain/models/timeline_grouping_model_test.dart
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Remove the duplicate from the upstream model file**

In `mobile/lib/domain/models/timeline.model.dart`, delete the whole `normalizeGridGrouping` block added by #911 (the doc comment and the function, between the `HeaderType` enum and `enum SortAssetsBy`). The file must read:

```dart
enum GroupAssetsBy { day, month, auto, none, year }

enum HeaderType { none, month, day, monthAndDay, year }

enum SortAssetsBy { taken, uploaded }
```

- [ ] **Step 6: Repoint the one production consumer**

In `mobile/lib/domain/services/timeline.service.dart`, add the import (keep the existing `timeline.model.dart` import — `GroupAssetsBy` still comes from there):

```dart
import 'package:immich_mobile/domain/models/timeline_grouping.model.dart';
```

The `TimelineFactory.groupBy` getter body is unchanged:

```dart
  /// Fallback only: timeline routes pass groupBy explicitly from
  /// `timelineGroupingSpecProvider`. The persisted setting is a grid header granularity, so
  /// anything other than month (legacy `auto`/`none`, or `year` from the removed Year option)
  /// falls back to day.
  GroupAssetsBy get groupBy => normalizeGridGrouping(_settingsRepository.appConfig.timeline.groupAssetsBy);
```

- [ ] **Step 7: Verify divergence dropped and the suite is green**

```bash
cd /Users/pierre/dev/gallery/.claude/worktrees/fix-903-photo-grid-group-by
git diff --numstat upstream/main:mobile/lib/domain/models/timeline.model.dart HEAD:mobile/lib/domain/models/timeline.model.dart
```

Expected: this still reports the pre-edit `12 2` because it compares committed trees. Instead check the working tree:

```bash
git diff --numstat upstream/main:mobile/lib/domain/models/timeline.model.dart -- mobile/lib/domain/models/timeline.model.dart
```

Expected: `2	2`.

```bash
cd mobile
~/.local/share/mise/installs/flutter/3.44.8/bin/flutter test
~/.local/share/mise/installs/flutter/3.44.8/bin/dart analyze --fatal-infos lib test
~/.local/share/mise/installs/flutter/3.44.8/bin/dart format lib
```

Expected: 2908 passing (2902 + 6), analyze clean, format reports no changes.

- [ ] **Step 8: Commit**

```bash
git add mobile/lib/domain/models/timeline_grouping.model.dart \
        mobile/test/domain/models/timeline_grouping_model_test.dart \
        mobile/lib/domain/models/timeline.model.dart \
        mobile/lib/domain/services/timeline.service.dart
git commit -m "refactor(mobile): move the grid grouping vocabulary to a fork-only model file

Takes timeline.model.dart back to two enum values of divergence from upstream."
```

---

## Task 2: Guard the `none` invariant before anything can break it

Test-only. This characterises live behaviour that later tasks must not disturb, and it must be in place _before_ `normalizeGridGrouping`'s call sites move around.

**Files:**

- Modify: `mobile/test/providers/photos_filter/timeline_query_provider_test.dart`

**Interfaces:**

- Consumes: `normalizeGridGrouping` (Task 1) — only to prove it is _not_ applied here.
- Produces: nothing. Pure guard.

**Scenarios:** Q-1 (Route B — the behaviour exists at `timeline_query.provider.dart:54`).

- [ ] **Step 1: Read the existing relevance test**

The file already contains `smart filter with relevance sort uses groupBy=none (flat)` around line 516-539, which captures `groupBy` from the factory call. Read it — the new test copies its capture harness exactly.

- [ ] **Step 2: Write the characterisation test**

Add to `mobile/test/providers/photos_filter/timeline_query_provider_test.dart`, next to the existing relevance test:

```dart
    test('Q-1: relevance sort keeps groupBy=none even when the grid setting is month', () async {
      // The persisted Group by setting must not reach a relevance-sorted search:
      // it has no date order, so it queries flat. Normalizing `none` to `day` here
      // would silently re-introduce date bucketing.
      when(() => factory.groupBy).thenReturn(GroupAssetsBy.month);
      GroupAssetsBy? capturedGroupBy;
      when(
        () => factory.fromAssetStream(
          any(),
          groupBy: any(named: 'groupBy'),
          temporalScope: any(named: 'temporalScope'),
        ),
      ).thenAnswer((inv) {
        capturedGroupBy = inv.namedArguments[const Symbol('groupBy')] as GroupAssetsBy;
        return service;
      });

      buildPhotosTimelineQuery(ref, relevanceSortedSmartFilter);

      expect(capturedGroupBy, GroupAssetsBy.none);
    });
```

Match the surrounding tests' setup: reuse whatever local names they use for `factory`, `ref`, `service` and the relevance-sorted filter fixture rather than inventing new ones.

- [ ] **Step 3: Run it and confirm it passes**

```bash
~/.local/share/mise/installs/flutter/3.44.8/bin/flutter test test/providers/photos_filter/timeline_query_provider_test.dart
```

Expected: PASS. A characterisation test starts green — Step 4 is what makes it real.

- [ ] **Step 4: Mutate to prove the test bites**

Temporarily edit `mobile/lib/providers/photos_filter/timeline_query.provider.dart:54` to normalize the explicit grouping — the exact mistake this guards:

```dart
  final effectiveGroupBy = normalizeGridGrouping(isRelevance ? GroupAssetsBy.none : (groupBy ?? factory.groupBy));
```

Re-run the file.

Expected: FAIL — `Expected: <GroupAssetsBy.none> Actual: <GroupAssetsBy.day>`.

**Revert the mutation.** Re-run and confirm PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/test/providers/photos_filter/timeline_query_provider_test.dart
git commit -m "test(mobile): pin relevance search to flat grouping regardless of the grid setting"
```

---

## Task 3: The provider layer

Introduces the three providers. The old `timelineGroupingProvider` and `timelineBucketGroupingProvider` are **kept temporarily** so the tree still compiles; Task 4 migrates the consumers and deletes them.

**Files:**

- Modify: `mobile/lib/providers/timeline/timeline_grouping.provider.dart`
- Create: `mobile/test/providers/timeline/timeline_grouping_spec_test.dart`

**Interfaces:**

- Consumes: `TimelineOverviewMode`, `TimelineGroupingSpec`, `normalizeGridGrouping` (Task 1); `appConfigProvider` from `package:immich_mobile/providers/infrastructure/settings.provider.dart`
- Produces:
  - `class TimelineOverviewModeNotifier extends Notifier<TimelineOverviewMode>` with `Future<void> set(TimelineOverviewMode mode)`
  - `final timelineOverviewModeProvider` — `NotifierProvider<TimelineOverviewModeNotifier, TimelineOverviewMode>`, `build() => TimelineOverviewMode.all`
  - `final timelineGridGroupingProvider` — `Provider<GroupAssetsBy>`
  - `final timelineGroupingSpecProvider` — `Provider<TimelineGroupingSpec>`, `dependencies: [timelineOverviewModeProvider]`

**Scenarios:** M-1…M-7 (Route A — none of these providers exist yet).

- [ ] **Step 1: Write the failing test**

Create `mobile/test/providers/timeline/timeline_grouping_spec_test.dart`. Follow the container/Drift setup already used by `test/providers/timeline/photos_overview_zoom_provider_test.dart` (in-memory Drift, `SettingsRepository.ensureInitialized`) so the persisted setting can be written:

```dart
import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/settings_key.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/models/timeline_grouping.model.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/settings.repository.dart';
import 'package:immich_mobile/providers/timeline/timeline_grouping.provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Drift db;
  late ProviderContainer container;

  setUpAll(() async {
    db = Drift(drift.DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    await SettingsRepository.ensureInitialized(db);
  });

  setUp(() {
    container = ProviderContainer();
  });

  tearDown(() => container.dispose());

  Future<void> setGridSetting(GroupAssetsBy value) =>
      SettingsRepository.instance.write(SettingsKey.timelineGroupAssetsBy, value);

  Future<void> setMode(TimelineOverviewMode mode) =>
      container.read(timelineOverviewModeProvider.notifier).set(mode);

  group('timelineGroupingSpecProvider', () {
    test('M-1: years queries and renders at year granularity', () async {
      await setMode(TimelineOverviewMode.years);
      final spec = container.read(timelineGroupingSpecProvider);
      expect(spec.mode, TimelineOverviewMode.years);
      expect(spec.groupBy, GroupAssetsBy.year);
    });

    test('M-2: months queries and renders at month granularity', () async {
      await setMode(TimelineOverviewMode.months);
      final spec = container.read(timelineGroupingSpecProvider);
      expect(spec.mode, TimelineOverviewMode.months);
      expect(spec.groupBy, GroupAssetsBy.month);
    });

    test('M-3: all with Month + day selected renders day headers', () async {
      await setGridSetting(GroupAssetsBy.day);
      await setMode(TimelineOverviewMode.all);
      final spec = container.read(timelineGroupingSpecProvider);
      expect(spec.mode, TimelineOverviewMode.all);
      expect(spec.groupBy, GroupAssetsBy.day);
    });

    test('M-4: all with Month selected renders month headers — the #903 case', () async {
      await setGridSetting(GroupAssetsBy.month);
      await setMode(TimelineOverviewMode.all);
      final spec = container.read(timelineGroupingSpecProvider);
      expect(spec.mode, TimelineOverviewMode.all);
      expect(spec.groupBy, GroupAssetsBy.month);
    });

    test('M-5: years ignores the grid setting', () async {
      await setGridSetting(GroupAssetsBy.month);
      await setMode(TimelineOverviewMode.years);
      expect(container.read(timelineGroupingSpecProvider).groupBy, GroupAssetsBy.year);
    });

    test('M-6: on all, the spec follows a setting change', () async {
      await setGridSetting(GroupAssetsBy.day);
      await setMode(TimelineOverviewMode.all);
      expect(container.read(timelineGroupingSpecProvider).groupBy, GroupAssetsBy.day);

      await setGridSetting(GroupAssetsBy.month);
      await container.pump();
      expect(container.read(timelineGroupingSpecProvider).groupBy, GroupAssetsBy.month);
    });

    test('M-7: on months, a setting change leaves the spec alone', () async {
      await setGridSetting(GroupAssetsBy.day);
      await setMode(TimelineOverviewMode.months);
      expect(container.read(timelineGroupingSpecProvider).groupBy, GroupAssetsBy.month);

      await setGridSetting(GroupAssetsBy.month);
      await container.pump();
      expect(container.read(timelineGroupingSpecProvider).groupBy, GroupAssetsBy.month);
    });

    test('the mode starts at all', () {
      expect(container.read(timelineOverviewModeProvider), TimelineOverviewMode.all);
    });
  });
}
```

If `container.pump()` is unavailable in this Riverpod version, use `await Future<void>.delayed(Duration.zero)` — match whatever the existing timeline provider tests already do.

- [ ] **Step 2: Run test to verify it fails**

```bash
~/.local/share/mise/installs/flutter/3.44.8/bin/flutter test test/providers/timeline/timeline_grouping_spec_test.dart
```

Expected: FAIL — `Undefined name 'timelineOverviewModeProvider'` and `'timelineGroupingSpecProvider'`.

- [ ] **Step 3: Add the three providers**

In `mobile/lib/providers/timeline/timeline_grouping.provider.dart`, add above the existing declarations (leave `TimelineGroupingNotifier`, `timelineGroupingProvider` and `timelineBucketGroupingProvider` in place for now — Task 4 removes them):

```dart
/// The active zoom level of the Years / Months / All selector.
///
/// View state only: it always starts at "All" and is never written to
/// [SettingsKey.timelineGroupAssetsBy]. Persisting it there is what made the
/// "Photo Grid" -> "Group by" setting flip the timeline into the overview cards (#903).
class TimelineOverviewModeNotifier extends Notifier<TimelineOverviewMode> {
  @override
  TimelineOverviewMode build() => TimelineOverviewMode.all;

  Future<void> set(TimelineOverviewMode mode) async {
    state = mode;
  }
}

/// The active zoom level for the current scope.
///
/// Scoped per-route by `TimelineRouteScope` (unless the route opts into `sharedGrouping`),
/// so a change inside an album does not leak into the main Photos timeline. Widgets resolve
/// the nearest scope automatically, but any PROVIDER that reads this must list it in its own
/// `dependencies:` — otherwise its auto-scoped copy silently resolves the root mode.
final timelineOverviewModeProvider = NotifierProvider<TimelineOverviewModeNotifier, TimelineOverviewMode>(
  TimelineOverviewModeNotifier.new,
);

/// The persisted "Photo Grid" -> "Group by" setting: how coarse the grid's headers are.
final timelineGridGroupingProvider = Provider<GroupAssetsBy>(
  (ref) => normalizeGridGrouping(ref.watch(appConfigProvider.select((config) => config.timeline.groupAssetsBy))),
);

/// What to render for the current scope, and at what granularity.
///
/// Years / Months render the overview cards at that granularity. All renders the photo
/// grid, whose header granularity is the persisted Group by setting.
final timelineGroupingSpecProvider = Provider<TimelineGroupingSpec>((ref) {
  final mode = ref.watch(timelineOverviewModeProvider);
  return switch (mode) {
    TimelineOverviewMode.years => (mode: mode, groupBy: GroupAssetsBy.year),
    TimelineOverviewMode.months => (mode: mode, groupBy: GroupAssetsBy.month),
    TimelineOverviewMode.all => (mode: mode, groupBy: ref.watch(timelineGridGroupingProvider)),
  };
  // timelineOverviewModeProvider must be listed so the auto-scoped copy of this provider
  // inside a TimelineRouteScope resolves the ROUTE-LOCAL mode rather than the root one.
}, dependencies: [timelineOverviewModeProvider]);
```

Add the import if missing:

```dart
import 'package:immich_mobile/domain/models/timeline_grouping.model.dart';
```

If `timelineGridGroupingProvider` already exists from #911, keep the single definition — do not declare it twice.

- [ ] **Step 4: Run test to verify it passes**

```bash
~/.local/share/mise/installs/flutter/3.44.8/bin/flutter test test/providers/timeline/timeline_grouping_spec_test.dart
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Run the whole suite**

```bash
~/.local/share/mise/installs/flutter/3.44.8/bin/flutter test
```

Expected: 2916 passing (2908 + 8), 0 failures. The old providers are untouched, so nothing regresses.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/providers/timeline/timeline_grouping.provider.dart \
        mobile/test/providers/timeline/timeline_grouping_spec_test.dart
git commit -m "feat(mobile): add the timeline overview mode and grouping spec providers"
```

---

## Task 4: Migrate every consumer and delete the old providers

Dart types flip atomically — the tree will not compile between Step 2 and Step 11. That is expected. The task's _deliverable_ is green; its middle is not.

Work through the steps in order and only run the suite where the plan says to. Use `dart analyze` as the intermediate signal.

**Files:**

- Modify: `lib/providers/timeline/timeline_grouping.provider.dart` (delete the old)
- Modify: `lib/providers/timeline/overview_drilldown.provider.dart`
- Modify: `lib/providers/timeline/overview_representative_cache.provider.dart`
- Modify: `lib/presentation/widgets/timeline/overview/overview_card.dart`
- Modify: `lib/presentation/widgets/timeline/overview/overview_segment.model.dart`
- Modify: `lib/presentation/widgets/timeline/overview/overview_segment_builder.dart`
- Modify: `lib/presentation/widgets/timeline/timeline_grouping_selector.widget.dart`
- Modify: `lib/presentation/widgets/timeline/timeline_grouping_anchor.dart`
- Modify: `lib/presentation/widgets/timeline/timeline_scroll_target.dart`
- Modify: `lib/presentation/widgets/timeline/timeline_route_scope.dart`
- Modify: `lib/presentation/widgets/timeline/timeline.widget.dart`
- Modify: `lib/presentation/widgets/timeline/timeline.state.dart`

**Interfaces:**

- Consumes: everything Task 3 produced.
- Produces:
  - `typedef TimelineOverviewDrilldownHandler = Future<void> Function(TimeBucket bucket, TimelineOverviewMode mode)`
  - `TimelineOverviewRepresentativeCacheNotifier.keyFor(TimelineOverviewMode mode, DateTime date)`
  - `TimelineOverviewSegmentBuilder({required List<Bucket> buckets, required TimelineOverviewMode mode})`
  - `TimelineOverviewSegment(... required TimelineOverviewMode mode ...)`
  - `TimelineOverviewCard({required TimeBucket bucket, required TimelineOverviewMode mode, ...})`
  - `DateTime resolveGroupingChangeAnchorDate({required DateTime topBucketDate, required TimelineOverviewMode previousMode, DateTime? remembered})`
  - `Segment? findTimelineZoomAnchorSegment(List<Segment> segments, TimelineZoomAnchor anchor, TimelineOverviewMode mode)`
  - `const timelineOverviewModeSelectorOrder = <TimelineOverviewMode>[years, months, all]`

**Scenarios:** G-1…G-5, S-1…S-7, R-1…R-5, Z-1…Z-8, A-1…A-3, P-1…P-5, B-1…B-5.

- [ ] **Step 1: Capture the pre-change baseline**

```bash
cd mobile && ~/.local/share/mise/installs/flutter/3.44.8/bin/flutter test 2>&1 | tail -3
```

Record the count. It must be matched or exceeded at Step 12.

- [ ] **Step 2: Retype the drilldown provider**

Replace the body of `mobile/lib/providers/timeline/overview_drilldown.provider.dart`:

```dart
typedef TimelineOverviewDrilldownHandler = Future<void> Function(TimeBucket bucket, TimelineOverviewMode mode);

final timelineOverviewDrilldownProvider = Provider<TimelineOverviewDrilldownHandler?>((ref) => null);

final sharedTimelineOverviewDrilldownProvider = Provider<TimelineOverviewDrilldownHandler>((ref) {
  return (bucket, mode) async {
    switch (mode) {
      case TimelineOverviewMode.years:
        ref.read(timelineZoomAnchorProvider.notifier).setYear(bucket.date.year);
        await ref.read(timelineOverviewModeProvider.notifier).set(TimelineOverviewMode.months);
      case TimelineOverviewMode.months:
        ref.read(timelineZoomAnchorProvider.notifier).setMonth(year: bucket.date.year, month: bucket.date.month);
        await ref.read(timelineOverviewModeProvider.notifier).set(TimelineOverviewMode.all);
      case TimelineOverviewMode.all:
        return;
    }
  };
  // timelineOverviewModeProvider must be listed so a drilldown inside a TimelineRouteScope
  // sets the ROUTE-LOCAL mode rather than the root one.
}, dependencies: [timelineZoomAnchorProvider, timelineOverviewModeProvider]);

final photosTimelineOverviewDrilldownProvider = sharedTimelineOverviewDrilldownProvider;
```

Note the three dead `day || auto || none` cases collapse to one honest `all` case.

- [ ] **Step 3: Retype the representative cache key**

`mobile/lib/providers/timeline/overview_representative_cache.provider.dart:24`:

```dart
  static String keyFor(TimelineOverviewMode mode, DateTime date) => '${mode.name}:${date.toIso8601String()}';
```

Add the `timeline_grouping.model.dart` import.

- [ ] **Step 4: Retype the overview card**

In `mobile/lib/presentation/widgets/timeline/overview/overview_card.dart`, rename the field and collapse each switch. The `all` branches keep the previous `day || auto || none` behaviour:

```dart
  final TimelineOverviewMode mode;

  String _label(BuildContext context) {
    final locale = context.locale.toLanguageTag();
    return switch (mode) {
      TimelineOverviewMode.years => DateFormat.y(locale).format(bucket.date),
      TimelineOverviewMode.months => DateFormat.yMMM(locale).format(bucket.date),
      TimelineOverviewMode.all => DateFormat.yMMMEd(locale).format(bucket.date),
    };
  }

  String _semanticsPeriod(BuildContext context) {
    final locale = context.locale.toLanguageTag();
    return switch (mode) {
      TimelineOverviewMode.years => DateFormat.y(locale).format(bucket.date),
      TimelineOverviewMode.months => DateFormat.yMMMM(locale).format(bucket.date),
      TimelineOverviewMode.all => DateFormat.yMMMMEEEEd(locale).format(bucket.date),
    };
  }
```

`_actionLabel()` gets the same treatment — `years => 'timeline_overview_show_months'`, `months => 'timeline_overview_show_days'`, `all => null` — in both the key switch and the fallback switch.

Rename the constructor parameter `groupBy` → `mode`.

- [ ] **Step 5: Retype the overview segment model**

In `mobile/lib/presentation/widgets/timeline/overview/overview_segment.model.dart`: change `final GroupAssetsBy groupBy;` to `final TimelineOverviewMode mode;`, the constructor parameter to `required this.mode`, and in `_TimelineOverviewSegmentCard.build`:

```dart
    final onTap = drilldown != null && bucket.assetCount > 0
        ? () => unawaited(drilldown(bucket, segment.mode))
        : null;

    final key = TimelineOverviewRepresentativeCacheNotifier.keyFor(segment.mode, bucket.date);
```

and the card construction:

```dart
    return TimelineOverviewCard(
      bucket: bucket,
      mode: segment.mode,
      representativeAsset: cachedAsset,
      onTap: onTap,
    );
```

- [ ] **Step 6: Retype the overview segment builder**

`mobile/lib/presentation/widgets/timeline/overview/overview_segment_builder.dart`. It extends the upstream `SegmentBuilder`, whose `groupBy` field defaults to `GroupAssetsBy.day` and is unused here — leave it at its default and carry the mode as this class's own field:

```dart
class TimelineOverviewSegmentBuilder extends SegmentBuilder {
  const TimelineOverviewSegmentBuilder({required super.buckets, required this.mode});

  /// The zoom level these cards represent. The inherited [SegmentBuilder.groupBy] is
  /// unused for overview segments and stays at its upstream default.
  final TimelineOverviewMode mode;

  List<Segment> generate() {
    if (mode == TimelineOverviewMode.all) {
      throw ArgumentError.value(mode, 'mode', 'Overview segments support only years and months');
    }
    ...
        TimelineOverviewSegment(
          ...
          mode: mode,
          header: mode == TimelineOverviewMode.years ? HeaderType.year : HeaderType.month,
        ),
```

Keep the rest of `generate()` byte-identical.

- [ ] **Step 7: Retype the selector widget**

In `mobile/lib/presentation/widgets/timeline/timeline_grouping_selector.widget.dart`:

```dart
const timelineOverviewModeSelectorOrder = <TimelineOverviewMode>[
  TimelineOverviewMode.years,
  TimelineOverviewMode.months,
  TimelineOverviewMode.all,
];
```

Replace `ref.watch(timelineGroupingProvider)` with `ref.watch(timelineOverviewModeProvider)` and both `ref.read(timelineGroupingProvider.notifier).set(...)` calls with `ref.read(timelineOverviewModeProvider.notifier).set(...)`. Change `final Future<void> Function(GroupAssetsBy groupBy) onSelected;` to take `TimelineOverviewMode mode`.

`_selectNext` becomes:

```dart
    final TimelineOverviewMode next;
    switch (selected) {
      case TimelineOverviewMode.years:
        next = TimelineOverviewMode.months;
        direction.state = true; // continue zooming in toward All
      case TimelineOverviewMode.months:
        if (direction.state) {
          next = TimelineOverviewMode.all;
          direction.state = false; // reached the zoom-in extreme (All); bounce back up next
        } else {
          next = TimelineOverviewMode.years;
          direction.state = true; // reached the zoom-out extreme (Years); bounce back down next
        }
      case TimelineOverviewMode.all:
        next = TimelineOverviewMode.months;
        direction.state = false; // continue zooming out toward Years
    }
```

`_label` becomes:

```dart
String _label(BuildContext context, TimelineOverviewMode mode) {
  return switch (mode) {
    TimelineOverviewMode.years => _translated('timeline_grouping_years', 'Years'),
    TimelineOverviewMode.months => _translated('timeline_grouping_months', 'Months'),
    TimelineOverviewMode.all => _translated('timeline_grouping_all', 'All'),
  };
}
```

Rename any remaining local `groupBy` identifiers in this file to `mode`. Do not rename `timelineGroupingZoomingInProvider` — it is a direction flag, not a grouping.

- [ ] **Step 8: Retype the anchor helpers**

`mobile/lib/presentation/widgets/timeline/timeline_grouping_anchor.dart`:

```dart
DateTime resolveGroupingChangeAnchorDate({
  required DateTime topBucketDate,
  required TimelineOverviewMode previousMode,
  DateTime? remembered,
}) {
  if (remembered == null) {
    return topBucketDate;
  }
  final within = switch (previousMode) {
    TimelineOverviewMode.years => remembered.year == topBucketDate.year,
    TimelineOverviewMode.months =>
      remembered.year == topBucketDate.year && remembered.month == topBucketDate.month,
    TimelineOverviewMode.all => false,
  };
  return within ? remembered : topBucketDate;
}
```

`mobile/lib/presentation/widgets/timeline/timeline_scroll_target.dart:29` — this is the payoff:

```dart
Segment? findTimelineZoomAnchorSegment(
  List<Segment> segments,
  TimelineZoomAnchor anchor,
  TimelineOverviewMode mode,
) {
  return switch (anchor) {
    TimelineZoomAnchorNone() => null,
    TimelineZoomYearAnchor(:final year) when mode == TimelineOverviewMode.months => segments.firstWhereOrNull(
      (segment) => _matchesDate(segment, (segmentDate) => segmentDate.year == year),
    ),
    TimelineZoomMonthAnchor(:final year, :final month) when mode == TimelineOverviewMode.all =>
      segments.firstWhereOrNull(
        (segment) => _matchesDate(segment, (segmentDate) => segmentDate.year == year && segmentDate.month == month),
      ),
    // A date anchor preserves the visible position across mode changes, so it
    // resolves to the closest matching segment (day -> month -> year) in any mode.
    TimelineZoomDateAnchor(:final date) => findTimelineScrollTargetSegment(segments, date),
    _ => null,
  };
}
```

- [ ] **Step 9: Update `timeline.widget.dart` — four sites**

Line 223:

```dart
    ref.listenManual(timelineOverviewModeProvider, _onGroupingChanged);
```

Line 292 signature and its `resolveGroupingChangeAnchorDate` call:

```dart
  void _onGroupingChanged(TimelineOverviewMode? previous, TimelineOverviewMode next) {
```

```dart
    final resolved = resolveGroupingChangeAnchorDate(
      topBucketDate: topBucketDate,
      previousMode: previous,
      remembered: anchorNotifier.lastPositionDate,
    );
```

Line 472 — the anchor takes the **mode**, and a pinned `groupByArg` means "All":

```dart
    final TimelineOverviewMode activeMode = ref.read(timelineArgsProvider).groupBy != null
        ? TimelineOverviewMode.all
        : ref.read(timelineOverviewModeProvider);
    if (activeMode != mode) {
      return;
    }

    final targetSegment = findTimelineZoomAnchorSegment(segments, anchor, mode);
```

Rename the method's `required GroupAssetsBy groupBy` parameter to `required TimelineOverviewMode mode` on both `_scheduleZoomAnchorResolution` and `_resolveZoomAnchor`.

Line 611 — split: the anchor gets the mode, the scrubber gets the granularity:

```dart
              final spec = ref.watch(timelineGroupingSpecProvider);
              final pinnedGroupBy = ref.watch(timelineArgsProvider).groupBy;
              final TimelineOverviewMode activeMode = pinnedGroupBy != null ? TimelineOverviewMode.all : spec.mode;
              final GroupAssetsBy activeGroupBy = pinnedGroupBy ?? spec.groupBy;
              final zoomAnchor = ref.watch(timelineZoomAnchorProvider);
              _scheduleZoomAnchorResolution(anchor: zoomAnchor, mode: activeMode, segments: segments);
```

`Scrubber(groupBy: activeGroupBy, ...)` at line ~674 is unchanged — it keeps receiving a `GroupAssetsBy`.

- [ ] **Step 10: Rewrite `timeline.state.dart` to upstream's shape**

Replace the whole `timelineSegmentProvider` declaration with the single-provider form. Keep upstream's indentation — do **not** let the argument list go multi-line:

```dart
final timelineSegmentProvider = StreamProvider.autoDispose<List<Segment>>((ref) async* {
  // maxHeight is left out on purpose, a height-only change must not restart the bucket stream
  final (maxWidth, columnCount, spacing, groupByArg) = ref.watch(
    timelineArgsProvider.select((args) => (args.maxWidth, args.columnCount, args.spacing, args.groupBy)),
  );
  final availableTileWidth = maxWidth - (spacing * (columnCount - 1));
  final tileExtent = math.max(0, availableTileWidth) / columnCount;

  // A pinned groupBy (the cleanup preview) always means the flat grid at that granularity.
  final spec = groupByArg != null
      ? (mode: TimelineOverviewMode.all, groupBy: groupByArg)
      : ref.watch(timelineGroupingSpecProvider);

  final timelineService = ref.watch(timelineServiceProvider);
  yield* timelineService.watchBuckets().map((buckets) {
    // A date-less bucket source (relevance-sorted search, or a `fromAssets` timeline) has no
    // dates to group by — fall back to the flat grid regardless of the mode.
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
  // timelineGroupingSpecProvider must be listed so the auto-scoped copy of this provider
  // inside a TimelineRouteScope resolves the ROUTE-LOCAL mode rather than the root one.
}, dependencies: [timelineServiceProvider, timelineArgsProvider, timelineGroupingSpecProvider]);
```

That final line is 96 characters — under the 120 limit, so `dart format` leaves it alone.

- [ ] **Step 11: Update the route scope and delete the old providers**

`mobile/lib/presentation/widgets/timeline/timeline_route_scope.dart`:

```dart
        if (!sharedGrouping) timelineOverviewModeProvider.overrideWith(TimelineOverviewModeNotifier.new),
```

```dart
            // The bucket granularity, not the zoom level: on "All" the query must group by the
            // persisted "Group by" setting so month-only headers get month buckets.
            final groupBy = ref.watch(timelineGroupingSpecProvider).groupBy;
```

Then delete from `timeline_grouping.provider.dart`: `normalizeTimelineGrouping`, `TimelineGroupingNotifier`, `timelineGroupingProvider`, `timelineBucketGroupingProvider`.

- [ ] **Step 12: Make it compile**

```bash
cd mobile && ~/.local/share/mise/installs/flutter/3.44.8/bin/dart analyze --fatal-infos lib
```

Fix every remaining reference the compiler names. Expected final: `No issues found!`

- [ ] **Step 13: Migrate the test suite**

```bash
~/.local/share/mise/installs/flutter/3.44.8/bin/dart analyze --fatal-infos test
```

Apply **renames only**, per this mapping:

| Old, as a pill position          | New                                              |
| -------------------------------- | ------------------------------------------------ |
| `GroupAssetsBy.year`             | `TimelineOverviewMode.years`                     |
| `GroupAssetsBy.month`            | `TimelineOverviewMode.months`                    |
| `GroupAssetsBy.day`              | `TimelineOverviewMode.all`                       |
| `timelineGroupingProvider`       | `timelineOverviewModeProvider`                   |
| `timelineBucketGroupingProvider` | `timelineGroupingSpecProvider` (then `.groupBy`) |

Where the same literal meant **header granularity**, it stays `GroupAssetsBy`. Two files must keep `GroupAssetsBy` throughout — `scrubber_segments_test.dart` and `timeline_query_provider_test.dart`. A rename applied there means the boundary has been crossed.

In `main_timeline_zoom_test.dart`, the mock timeline-service factories must keep honouring the `groupBy` the production code passes rather than re-reading the setting. #911 fixed this; do not reintroduce it.

**If any test needs its assertions changed rather than its identifiers, stop and escalate.**

- [ ] **Step 14: Run the full suite**

```bash
~/.local/share/mise/installs/flutter/3.44.8/bin/flutter test
```

Expected: at least the Step 1 baseline, 0 failures.

- [ ] **Step 15: Mutation-check the six highest-risk guards**

For each row: apply the mutation, run the named test file, confirm the expected red, then **revert**.

| Mutation                                                                              | Must break                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------- |
| `timelineGroupingSpecProvider`: make `all` return `GroupAssetsBy.day` unconditionally | `timeline_grouping_spec_test.dart` (M-4)    |
| `timelineGroupingSpecProvider`: make `months` read `timelineGridGroupingProvider`     | `timeline_grouping_spec_test.dart` (M-5)    |
| Drop `dependencies: [timelineOverviewModeProvider]` from the spec provider            | `timeline_route_scope_test.dart` (R-4)      |
| `TimelineRouteScope`: stop overriding the mode provider                               | `timeline_route_scope_test.dart` (R-1, R-2) |
| `timeline.state.dart`: drop `&& !isDateless` from the overview condition              | `timeline_segment_provider_test.dart` (S-2) |
| `timeline.widget.dart:472`: pass `spec.groupBy` where the mode is expected            | compile error — that is the guarantee       |

If a mutation stays green, the guard is missing. Write it before continuing.

- [ ] **Step 16: Gates and commit**

```bash
~/.local/share/mise/installs/flutter/3.44.8/bin/dart analyze --fatal-infos lib test
~/.local/share/mise/installs/flutter/3.44.8/bin/dart format lib
```

```bash
git add mobile/lib mobile/test
git commit -m "refactor(mobile): give the timeline overview selector its own type

The Years/Months/All selector and the Photo Grid \"Group by\" setting both spoke
GroupAssetsBy, so nothing distinguished \"month cards\" from \"month headers\" — the
ambiguity behind #903. The selector now uses a fork-only TimelineOverviewMode and a
single derived spec provider resolves the granularity to query and render.

Also restores timeline.state.dart to upstream's shape: one provider in the
dependencies list keeps the line under the formatter's width, so the whole body
stops showing as reindented against upstream."
```

---

## Task 5: Fill the remaining scenario gaps

Everything compiles and the retype is done. This task adds the scenarios the existing suite never covered.

**Files:**

- Modify: `mobile/test/presentation/widgets/timeline/timeline_segment_provider_test.dart`
- Modify: `mobile/test/presentation/widgets/timeline/timeline_zoom_anchor_resolution_test.dart`
- Modify: `mobile/test/presentation/widgets/timeline/scrubber_segments_test.dart`
- Modify: `mobile/test/widgets/settings/asset_list_group_settings_test.dart`
- Create: `mobile/test/domain/services/timeline_factory_grouping_test.dart`

**Interfaces:**

- Consumes: everything from Tasks 1, 3 and 4.
- Produces: nothing. Coverage only.

**Scenarios:** S-4, S-5, S-6, S-7, Z-6, B-4, B-5, L-3, F-1…F-4.

- [ ] **Step 1: Write the failing empty-bucket tests (S-4, S-5)**

Add to `timeline_segment_provider_test.dart`. `isDateless` is `buckets.isNotEmpty && buckets.first is! TimeBucket`, so an **empty** list is _not_ dateless and an overview-mode timeline reaches `TimelineOverviewSegmentBuilder` with no buckets:

```dart
    test('S-4: empty buckets in Months mode produce no segments and do not throw', () async {
      await setMode(TimelineOverviewMode.months);
      bucketController.add(<Bucket>[]);
      final segments = await readSegments();
      expect(segments, isEmpty);
    });

    test('S-5: empty buckets in All mode with the month setting produce no segments', () async {
      await setGridSetting(GroupAssetsBy.month);
      await setMode(TimelineOverviewMode.all);
      bucketController.add(<Bucket>[]);
      final segments = await readSegments();
      expect(segments, isEmpty);
    });
```

Reuse the file's existing harness names for the bucket stream and segment read.

- [ ] **Step 2: Run them**

```bash
~/.local/share/mise/installs/flutter/3.44.8/bin/flutter test test/presentation/widgets/timeline/timeline_segment_provider_test.dart
```

Expected: PASS — the loop in `generate()` never runs on an empty list.

**If either throws**, that is a real pre-existing bug on `main`. Fix it here by returning early from `TimelineOverviewSegmentBuilder.generate()` on empty input, and say so in the commit message.

- [ ] **Step 3: Write the pinned-grouping tests (S-6, S-7)**

```dart
    test('S-6: a pinned groupBy never reaches the overview builder', () async {
      await setMode(TimelineOverviewMode.months);
      setPinnedGroupBy(GroupAssetsBy.day);
      bucketController.add(timeBuckets);
      final segments = await readSegments();
      expect(segments.every((s) => s is! TimelineOverviewSegment), isTrue);
    });

    test('S-7: with a pinned groupBy, mode and setting changes leave the segments alone', () async {
      setPinnedGroupBy(GroupAssetsBy.day);
      bucketController.add(timeBuckets);
      final before = await readSegments();

      await setMode(TimelineOverviewMode.years);
      await setGridSetting(GroupAssetsBy.month);
      final after = await readSegments();

      expect(after.length, before.length);
      expect(after.every((s) => s is! TimelineOverviewSegment), isTrue);
    });
```

- [ ] **Step 4: Write the critical anchor test (Z-6)**

Add to `timeline_zoom_anchor_resolution_test.dart`:

```dart
    test('Z-6: a month anchor still resolves in All mode when Group by is Month', () async {
      // Regression guard: if the anchor is fed spec.groupBy instead of spec.mode, the
      // month setting makes the granularity `month`, the `all` guard stops matching, and
      // drilling from Months into All silently fails to scroll.
      await setGridSetting(GroupAssetsBy.month);
      final segments = monthGranularitySegments;
      final target = findTimelineZoomAnchorSegment(
        segments,
        const TimelineZoomMonthAnchor(year: 2026, month: 3),
        TimelineOverviewMode.all,
      );
      expect(target, isNotNull);
    });
```

- [ ] **Step 5: Run it, then mutate to prove it bites**

```bash
~/.local/share/mise/installs/flutter/3.44.8/bin/flutter test test/presentation/widgets/timeline/timeline_zoom_anchor_resolution_test.dart
```

Expected: PASS.

Then temporarily change the test's third argument from `TimelineOverviewMode.all` to `TimelineOverviewMode.months` — simulating the anchor being handed the wrong concept. Re-run.

Expected: FAIL — `Expected: not null; Actual: <null>`.

**Revert** and confirm PASS.

- [ ] **Step 6: Add the scrubber pins (B-4, B-5)**

```dart
    test('B-4: All mode with Month + day still labels month+year', () {
      final segments = buildScrubberSegments(
        layoutSegments: dayGranularitySegments,
        timelineHeight: 800,
        groupBy: GroupAssetsBy.day,
      );
      expect(segments.first.scrollLabel, matches(RegExp(r'^\w+ \d{4}$')));
    });

    test('B-5: date-less layout segments produce no scrubber segments', () {
      final segments = buildScrubberSegments(
        layoutSegments: datelessSegments,
        timelineHeight: 800,
        groupBy: GroupAssetsBy.day,
      );
      expect(segments, isEmpty);
    });
```

- [ ] **Step 7: Add the legacy settings test (L-3)**

Add to `asset_list_group_settings_test.dart`. Assert a radio is **selected** — "renders with nothing selected" is the actual failure mode:

```dart
    testWidgets('L-3: a stored year value falls back to Month + day selected', (tester) async {
      await setGridSetting(GroupAssetsBy.year);
      await pumpGroupSettings(tester);

      final monthDayTile = tester.widget<RadioListTile<GroupAssetsBy>>(
        find.byWidgetPredicate(
          (w) => w is RadioListTile<GroupAssetsBy> && w.value == GroupAssetsBy.day,
        ),
      );
      expect(monthDayTile.groupValue, GroupAssetsBy.day);
    });
```

Match the widget type the settings screen actually renders — read `settings_radio_list_tile.dart` and assert against that type rather than assuming `RadioListTile`.

- [ ] **Step 8: Create the factory fallback tests (F-1…F-4)**

Create `mobile/test/domain/services/timeline_factory_grouping_test.dart`, modelled on the existing `timeline_factory_temporal_scope_test.dart` in the same directory:

```dart
    test('F-1: month is preserved', () {
      when(() => settingsRepository.appConfig).thenReturn(configWith(GroupAssetsBy.month));
      expect(factory.groupBy, GroupAssetsBy.month);
    });

    test('F-2: day is preserved', () {
      when(() => settingsRepository.appConfig).thenReturn(configWith(GroupAssetsBy.day));
      expect(factory.groupBy, GroupAssetsBy.day);
    });

    test('F-3: a stored year falls back to day', () {
      when(() => settingsRepository.appConfig).thenReturn(configWith(GroupAssetsBy.year));
      expect(factory.groupBy, GroupAssetsBy.day);
    });

    test('F-4: auto falls back to day', () {
      when(() => settingsRepository.appConfig).thenReturn(configWith(GroupAssetsBy.auto));
      expect(factory.groupBy, GroupAssetsBy.day);
    });
```

- [ ] **Step 9: Run everything**

```bash
~/.local/share/mise/installs/flutter/3.44.8/bin/flutter test
~/.local/share/mise/installs/flutter/3.44.8/bin/dart analyze --fatal-infos lib test
~/.local/share/mise/installs/flutter/3.44.8/bin/dart format lib
```

Expected: all green, count up by ~12.

- [ ] **Step 10: Commit**

```bash
git add mobile/test
git commit -m "test(mobile): cover the empty-bucket, pinned-grouping and legacy-setting edges"
```

---

## Task 6: Filter and integration scenarios, then verify the outcome

**Files:**

- Modify: `mobile/test/presentation/pages/dev/timeline_filter_grouping_integration_test.dart`
- Modify: `mobile/test/providers/photos_filter/timeline_query_provider_test.dart`
- Modify: `docs/superpowers/specs/2026-08-02-timeline-grouping-upstream-divergence-design.md`

**Interfaces:**

- Consumes: everything above.
- Produces: nothing.

**Scenarios:** Q-2…Q-7.

- [ ] **Step 1: Confirm the existing integration coverage**

`timeline_filter_grouping_integration_test.dart` already carries Q-4, Q-5 and Q-6 in substance:

- `Filtered + Months → month TimelineOverviewSegments, asset counts sum to total` (Q-4)
- `Filtered + All with the month Group by setting produces month buckets on the grid` (Q-5)
- `Changing the grouping while a filter is active rebuilds service buckets at new granularity` (Q-6)

Verify each still asserts the same thing after Task 4's rename, and that none needed an assertion change. If one did, that is the escalation signal.

- [ ] **Step 2: Mutation-check Q-5**

Q-5 is the #903 case under a filter and it must bite. Temporarily make `timelineGroupingSpecProvider`'s `all` branch return `GroupAssetsBy.day` unconditionally, run the file, confirm FAIL, then **revert**.

- [ ] **Step 3: Add Q-2, Q-3 and Q-7 if absent**

`timeline_query_provider_test.dart` already covers:

- `smart filter with newest sort uses active grouping setting (not none)` (Q-2)
- `non-smart filter uses active grouping setting and defaults to descending` (Q-3)
- `empty filter → delegates to main-library service` (Q-7)

Confirm each reads the **spec** grouping after the rename. Add any that is missing rather than assuming.

- [ ] **Step 4: Verify the divergence targets were met**

```bash
cd /Users/pierre/dev/gallery/.claude/worktrees/fix-903-photo-grid-group-by
for f in mobile/lib/presentation/widgets/timeline/timeline.state.dart \
         mobile/lib/domain/models/timeline.model.dart \
         mobile/lib/widgets/settings/asset_list_settings/asset_list_group_settings.dart; do
  printf "%-60s " "$(basename $f)"
  git diff --numstat "upstream/main:$f" -- "$f" | awk '{print $1"+/"$2"-"}'
done
```

Expected, per the spec's outcome table:

| File                             | Target                 |
| -------------------------------- | ---------------------- |
| `timeline.state.dart`            | ~12+/3- (from 48+/20-) |
| `timeline.model.dart`            | 2+/2- (from 12+/2-)    |
| `asset_list_group_settings.dart` | ~2+/1- (from 3+/1-)    |

If `timeline.state.dart` is materially above target, check whether `dart format` re-wrapped the `dependencies:` line — that is the failure mode, and it means the line exceeded 120 characters.

- [ ] **Step 5: Record the two files the spec missed**

The spec's §4 list omits `overview_segment.model.dart` and `overview_representative_cache.provider.dart`, both of which this plan retypes. Add them to the §4 bullet list in the design doc, then:

```bash
export PATH="$HOME/.local/share/mise/shims:$PATH"
npx prettier --write docs/superpowers/specs/2026-08-02-timeline-grouping-upstream-divergence-design.md
npx prettier --check docs/superpowers/specs/2026-08-02-timeline-grouping-upstream-divergence-design.md
```

- [ ] **Step 6: Final gates**

```bash
cd mobile
~/.local/share/mise/installs/flutter/3.44.8/bin/flutter test
~/.local/share/mise/installs/flutter/3.44.8/bin/dart analyze --fatal-infos lib test
~/.local/share/mise/installs/flutter/3.44.8/bin/dart format lib
```

Expected: 0 failures, `No issues found!`, no formatting changes.

- [ ] **Step 7: Commit and push**

```bash
git add mobile/test docs/superpowers/specs
git commit -m "test(mobile): confirm filter-backed timelines follow the grouping spec"
git push
```

- [ ] **Step 8: Update the PR description**

PR #911's body describes the original three-provider fix. Rewrite the "The fix" section to describe `TimelineOverviewMode` + `timelineGroupingSpecProvider`, and add a line noting the upstream-divergence reduction with the measured before/after numbers.

---

## Self-Review

**Spec coverage.** Every design section maps to a task: §1 → Task 1; §2 → Task 3; §3 → Task 4 Step 10; §4 → Task 4 Steps 2-8; §5 → Task 4 Step 9; §6 → Task 2; §7 → Task 5 Step 7. All 63 scenarios are assigned: G-1…G-5, S-1…S-3 and R-1…R-5, Z-1…Z-5, Z-7…Z-8, A-1…A-4, P-1…P-5, B-1…B-3 are existing tests migrated in Task 4 Step 13; S-4…S-7, Z-6, B-4, B-5, L-3, F-1…F-4 are added in Task 5; L-1, L-2, L-4, L-5 in Task 1; M-1…M-7 in Task 3; Q-1 in Task 2; Q-2…Q-7 in Task 6.

**Two spec gaps found and handled here:** `overview_segment.model.dart` and `overview_representative_cache.provider.dart` are in the retype blast radius but absent from the spec's §4 list. Both are retyped in Task 4 (Steps 5 and 3) and the spec is corrected in Task 6 Step 5.

**Type consistency.** `TimelineOverviewMode` values are `years`/`months`/`all` everywhere — never `year`/`month`/`day`. `TimelineGroupingSpec` is a record with fields `mode` and `groupBy`; every read uses `spec.mode` or `spec.groupBy`. The drilldown handler's second parameter is `mode` in the typedef, the implementation and the call site. `TimelineOverviewSegmentBuilder` takes `mode`, not `groupBy` — its inherited `SegmentBuilder.groupBy` stays at the upstream default and is unused.

**Known risk.** Task 4 leaves the tree uncompilable between Steps 2 and 12. That is inherent to a Dart type flip and cannot be avoided without a temporary shim that would itself be churn. The task ends green, `dart analyze` is the intermediate signal, and Step 1 records the baseline to return to.
