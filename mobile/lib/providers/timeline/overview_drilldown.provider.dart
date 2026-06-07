import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/setting.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/providers/infrastructure/setting.provider.dart';
import 'package:immich_mobile/providers/timeline/zoom_anchor.provider.dart';

typedef TimelineOverviewDrilldownHandler = Future<void> Function(TimeBucket bucket, GroupAssetsBy groupBy);

final timelineOverviewDrilldownProvider = Provider<TimelineOverviewDrilldownHandler?>((ref) => null);

final sharedTimelineOverviewDrilldownProvider = Provider<TimelineOverviewDrilldownHandler>((ref) {
  return (bucket, groupBy) async {
    switch (groupBy) {
      case GroupAssetsBy.year:
        ref.read(timelineZoomAnchorProvider.notifier).setYear(bucket.date.year);
        await ref.read(settingsProvider.notifier).set(Setting.groupAssetsBy, GroupAssetsBy.month.index);
      case GroupAssetsBy.month:
        ref.read(timelineZoomAnchorProvider.notifier).setMonth(year: bucket.date.year, month: bucket.date.month);
        await ref.read(settingsProvider.notifier).set(Setting.groupAssetsBy, GroupAssetsBy.day.index);
      case GroupAssetsBy.day:
      case GroupAssetsBy.auto:
      case GroupAssetsBy.none:
        return;
    }
  };
}, dependencies: [timelineZoomAnchorProvider]);

final photosTimelineOverviewDrilldownProvider = sharedTimelineOverviewDrilldownProvider;
