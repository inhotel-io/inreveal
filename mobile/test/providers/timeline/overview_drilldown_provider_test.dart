import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/events.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/models/timeline_temporal_scope.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/domain/utils/event_stream.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';
import 'package:immich_mobile/providers/timeline/overview_drilldown.provider.dart';
import 'package:immich_mobile/providers/timeline/temporal_scope.provider.dart';

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

  test('year drilldown sets year scope, groups by month, and preserves filter text', () async {
    container.read(photosFilterProvider.notifier).setText('paris');
    var scrollEvents = 0;
    final subscription = EventStream.shared.listen<ScrollToTopEvent>((_) => scrollEvents++);
    addTearDown(subscription.cancel);

    await container.read(photosTimelineOverviewDrilldownProvider)(
      TimeBucket(date: DateTime(2025), assetCount: 4),
      GroupAssetsBy.year,
    );

    expect(container.read(timelineTemporalScopeProvider), const TimelineTemporalScope.year(2025));
    expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.month.index);
    expect(container.read(photosFilterProvider).context, 'paris');
    await Future<void>.delayed(Duration.zero);
    expect(scrollEvents, 1);
  });

  test('month drilldown sets month scope and groups by day', () async {
    var scrollEvents = 0;
    final subscription = EventStream.shared.listen<ScrollToTopEvent>((_) => scrollEvents++);
    addTearDown(subscription.cancel);

    await container.read(photosTimelineOverviewDrilldownProvider)(
      TimeBucket(date: DateTime(2025, 3), assetCount: 4),
      GroupAssetsBy.month,
    );

    expect(container.read(timelineTemporalScopeProvider), TimelineTemporalScope.month(year: 2025, month: 3));
    expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.day.index);
    await Future<void>.delayed(Duration.zero);
    expect(scrollEvents, 1);
  });

  for (final groupBy in [GroupAssetsBy.day, GroupAssetsBy.auto, GroupAssetsBy.none]) {
    test('$groupBy grouping is ignored and leaves scope and settings unchanged', () async {
      await Store.put(StoreKey.groupAssetsBy, GroupAssetsBy.year.index);

      await container.read(photosTimelineOverviewDrilldownProvider)(
        TimeBucket(date: DateTime(2025, 3), assetCount: 4),
        groupBy,
      );

      expect(container.read(timelineTemporalScopeProvider), const TimelineTemporalScope.none());
      expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.year.index);
    });
  }
}
