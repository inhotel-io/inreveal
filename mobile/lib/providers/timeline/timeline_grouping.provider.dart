import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/setting.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/providers/infrastructure/setting.provider.dart';

/// Clamps a grouping value to the three options the timeline grouping selector
/// exposes (Years / Months / All). Legacy `auto`/`none` values map to All.
GroupAssetsBy _normalizeTimelineGrouping(GroupAssetsBy groupBy) {
  return switch (groupBy) {
    GroupAssetsBy.year || GroupAssetsBy.month || GroupAssetsBy.day => groupBy,
    GroupAssetsBy.auto || GroupAssetsBy.none => GroupAssetsBy.day,
  };
}

/// Decodes a persisted [Setting.groupAssetsBy] index, normalizing out-of-range
/// and legacy values to All.
GroupAssetsBy _timelineGroupingFromSettingIndex(int index) {
  if (index < 0 || index >= GroupAssetsBy.values.length) {
    return GroupAssetsBy.day;
  }

  return _normalizeTimelineGrouping(GroupAssetsBy.values[index]);
}

/// Root behavior — used by the main Photos timeline: the active grouping follows
/// the persisted [Setting.groupAssetsBy] and [set] writes it back, so the choice
/// survives restarts and stays in sync with the settings screen.
class TimelineGroupingNotifier extends Notifier<GroupAssetsBy> {
  @override
  GroupAssetsBy build() => _timelineGroupingFromSettingIndex(
    ref.watch(settingsProvider.select((settings) => settings.get(Setting.groupAssetsBy))),
  );

  Future<void> set(GroupAssetsBy groupBy) async {
    await ref.read(settingsProvider.notifier).set(Setting.groupAssetsBy, groupBy.index);
  }
}

/// Route-local override — used by detail timelines (albums, spaces, favorites, ...):
/// every route opens grouped at "All" ([GroupAssetsBy.day]) regardless of the
/// persisted setting, and grouping changes stay local to that route. This keeps a
/// persisted Years/Months grouping on the main Photos timeline from leaking into
/// albums (and album grouping changes from leaking back out).
class RouteTimelineGroupingNotifier extends TimelineGroupingNotifier {
  @override
  GroupAssetsBy build() => GroupAssetsBy.day;

  @override
  Future<void> set(GroupAssetsBy groupBy) async {
    state = _normalizeTimelineGrouping(groupBy);
  }
}

/// The active timeline grouping for the current scope.
///
/// Overridden per-route by `TimelineRouteScope` (with [RouteTimelineGroupingNotifier])
/// unless the route opts into `persistGrouping`. Widgets resolve the nearest scope
/// automatically, but any PROVIDER that reads this must list it in its own
/// `dependencies:` — otherwise its auto-scoped copy silently resolves the root
/// (persisted) grouping inside detail routes.
final timelineGroupingProvider = NotifierProvider<TimelineGroupingNotifier, GroupAssetsBy>(
  TimelineGroupingNotifier.new,
);
