import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/events.model.dart';
import 'package:immich_mobile/domain/models/setting.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/models/timeline_temporal_scope.model.dart';
import 'package:immich_mobile/domain/models/timeline_zoom_anchor.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/domain/utils/event_stream.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/providers/infrastructure/setting.provider.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';
import 'package:immich_mobile/providers/timeline/overview_drilldown.provider.dart';
import 'package:immich_mobile/providers/timeline/temporal_scope.provider.dart';
import 'package:immich_mobile/providers/timeline/zoom_anchor.provider.dart';

class _OrderingProbeSettingsNotifier extends SettingsNotifier {
  _OrderingProbeSettingsNotifier(this.onSet);

  final void Function() onSet;

  @override
  Future<void> set<T>(Setting<T> setting, T value) async {
    await super.set(setting, value);
    if (setting == Setting.groupAssetsBy) {
      onSet();
    }
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Drift db;
  late ProviderContainer container;

  setUpAll(() async {
    db = Drift(drift.DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    await StoreService.init(storeRepository: DriftStoreRepository(db), listenUpdates: false);
  });

  setUp(() async {
    await Store.clear();
    container = ProviderContainer();
    addTearDown(container.dispose);
  });

  tearDownAll(() async {
    await Store.clear();
    await db.close();
  });

  test('year activation groups by month, stores a year anchor, and preserves filters without changing scope', () async {
    container.read(photosFilterProvider.notifier).setText('paris');
    container.read(timelineTemporalScopeProvider.notifier).setYear(2024);
    var scrollEvents = 0;
    final subscription = EventStream.shared.listen<ScrollToTopEvent>((_) => scrollEvents++);
    addTearDown(subscription.cancel);

    await container.read(sharedTimelineOverviewDrilldownProvider)(
      TimeBucket(date: DateTime(2025), assetCount: 4),
      GroupAssetsBy.year,
    );

    expect(container.read(timelineTemporalScopeProvider), const TimelineTemporalScope.year(2024));
    expect(container.read(timelineZoomAnchorProvider), const TimelineZoomAnchor.year(2025));
    expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.month.index);
    expect(container.read(photosFilterProvider).context, 'paris');
    await Future<void>.delayed(Duration.zero);
    expect(scrollEvents, 0);
  });

  test('month activation groups by day, stores a month anchor, and leaves temporal scope unchanged', () async {
    container.read(timelineTemporalScopeProvider.notifier).setYear(2024);
    var scrollEvents = 0;
    final subscription = EventStream.shared.listen<ScrollToTopEvent>((_) => scrollEvents++);
    addTearDown(subscription.cancel);

    await container.read(sharedTimelineOverviewDrilldownProvider)(
      TimeBucket(date: DateTime(2025, 3), assetCount: 4),
      GroupAssetsBy.month,
    );

    expect(container.read(timelineTemporalScopeProvider), const TimelineTemporalScope.year(2024));
    expect(container.read(timelineZoomAnchorProvider), TimelineZoomAnchor.month(year: 2025, month: 3));
    expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.day.index);
    await Future<void>.delayed(Duration.zero);
    expect(scrollEvents, 0);
  });

  test('year activation stores the anchor before publishing the grouping setting change', () async {
    final anchorsSeenAtGroupingChange = <TimelineZoomAnchor>[];
    late ProviderContainer orderingContainer;
    orderingContainer = ProviderContainer(
      overrides: [
        settingsProvider.overrideWith(
          () => _OrderingProbeSettingsNotifier(() {
            if (Store.get(StoreKey.groupAssetsBy) == GroupAssetsBy.month.index) {
              anchorsSeenAtGroupingChange.add(orderingContainer.read(timelineZoomAnchorProvider));
            }
          }),
        ),
      ],
    );
    addTearDown(orderingContainer.dispose);

    await orderingContainer.read(sharedTimelineOverviewDrilldownProvider)(
      TimeBucket(date: DateTime(2025), assetCount: 4),
      GroupAssetsBy.year,
    );

    expect(anchorsSeenAtGroupingChange, [const TimelineZoomAnchor.year(2025)]);
  });

  for (final groupBy in [GroupAssetsBy.day, GroupAssetsBy.auto, GroupAssetsBy.none]) {
    test('$groupBy grouping is ignored and leaves anchors, scope, and settings unchanged', () async {
      await Store.put(StoreKey.groupAssetsBy, GroupAssetsBy.year.index);
      container.read(timelineTemporalScopeProvider.notifier).setYear(2024);

      await container.read(sharedTimelineOverviewDrilldownProvider)(
        TimeBucket(date: DateTime(2025, 3), assetCount: 4),
        groupBy,
      );

      expect(container.read(timelineTemporalScopeProvider), const TimelineTemporalScope.year(2024));
      expect(container.read(timelineZoomAnchorProvider), const TimelineZoomAnchor.none());
      expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.year.index);
    });
  }

  test('photos drilldown provider aliases shared drilldown handler', () {
    expect(
      container.read(photosTimelineOverviewDrilldownProvider),
      same(container.read(sharedTimelineOverviewDrilldownProvider)),
    );
  });
}
