import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/settings_key.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/models/timeline_grouping.model.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';

/// Clamps a grouping value to the three options the timeline grouping selector
/// exposes (Years / Months / All). Legacy `auto`/`none` values map to All.
GroupAssetsBy normalizeTimelineGrouping(GroupAssetsBy groupBy) {
  return switch (groupBy) {
    GroupAssetsBy.year || GroupAssetsBy.month || GroupAssetsBy.day => groupBy,
    GroupAssetsBy.auto || GroupAssetsBy.none => GroupAssetsBy.day,
  };
}

/// The active view mode of the Years / Months / All selector.
///
/// This is view state only: it always starts at "All" ([GroupAssetsBy.day]) and is never
/// written to [SettingsKey.timelineGroupAssetsBy]. Persisting it there used to make the
/// "Photo Grid" -> "Group by" setting flip the timeline into the overview cards (#903);
/// the two are independent — see [timelineGridGroupingProvider].
class TimelineGroupingNotifier extends Notifier<GroupAssetsBy> {
  @override
  GroupAssetsBy build() => GroupAssetsBy.day;

  Future<void> set(GroupAssetsBy groupBy) async {
    state = normalizeTimelineGrouping(groupBy);
  }
}

/// The active timeline grouping for the current scope.
///
/// Scoped per-route by `TimelineRouteScope` (unless the route opts into `sharedGrouping`),
/// so a grouping change inside an album does not leak into the main Photos timeline.
/// Widgets resolve the nearest scope automatically, but any PROVIDER that reads this must
/// list it in its own `dependencies:` — otherwise its auto-scoped copy silently resolves
/// the root (app-level) grouping inside detail routes.
final timelineGroupingProvider = NotifierProvider<TimelineGroupingNotifier, GroupAssetsBy>(
  TimelineGroupingNotifier.new,
);

/// The persisted "Photo Grid" -> "Group by" setting: how coarse the headers on the photo
/// grid are. Only [GroupAssetsBy.day] (month + day headers) and [GroupAssetsBy.month]
/// (month-only headers) are reachable; everything else falls back to day.
final timelineGridGroupingProvider = Provider<GroupAssetsBy>(
  (ref) => normalizeGridGrouping(ref.watch(appConfigProvider.select((config) => config.timeline.groupAssetsBy))),
);

/// The bucket granularity to query and render for the current scope.
///
/// Years / Months group the timeline into the overview cards at that granularity. "All"
/// renders the photo grid, whose header granularity is the persisted Group by setting.
final timelineBucketGroupingProvider = Provider<GroupAssetsBy>((ref) {
  final grouping = ref.watch(timelineGroupingProvider);
  return grouping == GroupAssetsBy.day ? ref.watch(timelineGridGroupingProvider) : grouping;
  // timelineGroupingProvider must be listed so the auto-scoped copy of this provider inside
  // a TimelineRouteScope resolves the ROUTE-LOCAL grouping rather than the root one.
}, dependencies: [timelineGroupingProvider]);
