import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/setting.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/models/timeline_temporal_scope.model.dart';
import 'package:immich_mobile/domain/models/timeline_zoom_anchor.model.dart';
import 'package:immich_mobile/domain/models/user.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';
import 'package:immich_mobile/domain/services/user.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_route_scope.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:immich_mobile/providers/infrastructure/user.provider.dart' as infra;
import 'package:immich_mobile/providers/photos_filter/timeline_query.provider.dart';
import 'package:immich_mobile/providers/timeline/temporal_scope.provider.dart';
import 'package:immich_mobile/providers/timeline/zoom_anchor.provider.dart';
import 'package:immich_mobile/providers/user.provider.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mocktail/mocktail.dart';
// easy_localization initializes shared_preferences internally; tests need the mock initializer.
// ignore: depend_on_referenced_packages
import 'package:shared_preferences/shared_preferences.dart';

import '../../../test_utils.dart';

class _MockTimelineFactory extends Mock implements TimelineFactory {}

class _MockUserService extends Mock implements UserService {}

class _StubCurrentUserNotifier extends CurrentUserProvider {
  _StubCurrentUserNotifier(super.service, UserDto user) {
    state = user;
  }
}

UserDto _user(String id) => UserDto(id: id, email: '$id@example.com', name: id, profileChangedAt: DateTime(2024));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Drift db;

  setUpAll(() async {
    TestUtils.init();
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
    await initializeDateFormatting('en');
    registerFallbackValue(const TimelineTemporalScope.none());
    db = Drift(drift.DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    await StoreService.init(storeRepository: DriftStoreRepository(db), listenUpdates: false);
  });

  setUp(() async {
    await Store.clear();
    await Store.put(StoreKey.serverEndpoint, 'http://test-server');
    await Store.put(StoreKey.tilesPerRow, 3);
  });

  tearDownAll(() async {
    await Store.clear();
    await db.close();
  });

  testWidgets('Photos year card tap switches to months and scrolls to the tapped year', (tester) async {
    await Store.put(StoreKey.groupAssetsBy, GroupAssetsBy.year.index);
    final factory = _factoryForServices(
      yearService: _service([
        TimeBucket(date: DateTime(2026), assetCount: 8),
        TimeBucket(date: DateTime(2025), assetCount: 8),
        TimeBucket(date: DateTime(2024), assetCount: 8),
      ]),
      monthService: _service([
        TimeBucket(date: DateTime(2026, 2), assetCount: 8),
        TimeBucket(date: DateTime(2026, 1), assetCount: 8),
        TimeBucket(date: DateTime(2025, 12), assetCount: 8),
        TimeBucket(date: DateTime(2025, 3), assetCount: 8),
        TimeBucket(date: DateTime(2024, 12), assetCount: 8),
      ]),
      dayService: _service([TimeBucket(date: DateTime(2025, 3, 1), assetCount: 8)]),
    );
    addTearDown(factory.disposeServices);

    await _pumpPhotosTimeline(tester, factory);
    final ref = ProviderScope.containerOf(tester.element(find.byType(Timeline)));

    await tester.tap(find.bySemanticsLabel('2025, 8 photos, show months'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();

    expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.month.index);
    expect(ref.read(timelineTemporalScopeProvider), const TimelineTemporalScope.none());
    expect(ref.read(timelineZoomAnchorProvider), const TimelineZoomAnchor.none());
    expect(_scrollPixels(tester), greaterThan(0));
  });

  testWidgets('Photos month card tap switches to detailed mode and scrolls to the tapped month', (tester) async {
    await Store.put(StoreKey.groupAssetsBy, GroupAssetsBy.month.index);
    final factory = _factoryForServices(
      yearService: _service([TimeBucket(date: DateTime(2025), assetCount: 9)]),
      monthService: _service([
        TimeBucket(date: DateTime(2025, 5), assetCount: 9),
        TimeBucket(date: DateTime(2025, 4), assetCount: 9),
        TimeBucket(date: DateTime(2025, 3), assetCount: 9),
        TimeBucket(date: DateTime(2025, 2), assetCount: 9),
      ]),
      dayService: _service([
        TimeBucket(date: DateTime(2025, 5, 1), assetCount: 9),
        TimeBucket(date: DateTime(2025, 4, 1), assetCount: 9),
        TimeBucket(date: DateTime(2025, 3, 20), assetCount: 9),
        TimeBucket(date: DateTime(2025, 3, 1), assetCount: 9),
      ]),
    );
    addTearDown(factory.disposeServices);

    await _pumpPhotosTimeline(tester, factory);
    final ref = ProviderScope.containerOf(tester.element(find.byType(Timeline)));

    await tester.tap(find.bySemanticsLabel('March 2025, 9 photos, show days'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();

    expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.day.index);
    expect(ref.read(timelineTemporalScopeProvider), const TimelineTemporalScope.none());
    expect(ref.read(timelineZoomAnchorProvider), const TimelineZoomAnchor.none());
    expect(_scrollPixels(tester), greaterThan(0));
  });
}

({TimelineFactory factory, Future<void> Function() disposeServices}) _factoryForServices({
  required TimelineService yearService,
  required TimelineService monthService,
  required TimelineService dayService,
}) {
  final factory = _MockTimelineFactory();
  when(() => factory.main(any(), any(), temporalScope: any(named: 'temporalScope'))).thenAnswer((_) {
    final groupBy = GroupAssetsBy.values[Store.get(StoreKey.groupAssetsBy, Setting.groupAssetsBy.defaultValue)];
    return switch (groupBy) {
      GroupAssetsBy.year => yearService,
      GroupAssetsBy.month => monthService,
      GroupAssetsBy.day || GroupAssetsBy.auto || GroupAssetsBy.none => dayService,
    };
  });

  return (
    factory: factory,
    disposeServices: () async {
      await yearService.dispose();
      await monthService.dispose();
      await dayService.dispose();
    },
  );
}

TimelineService _service(List<Bucket> buckets) {
  final assets = <BaseAsset>[
    for (var i = 0; i < buckets.fold<int>(0, (total, bucket) => total + bucket.assetCount); i++)
      TestUtils.createRemoteAsset(id: 'asset-$i'),
  ];

  return TimelineService((
    bucketSource: () => Stream.value(buckets),
    assetSource: (offset, count) async {
      final end = (offset + count).clamp(0, assets.length).toInt();
      if (offset >= end) {
        return const <BaseAsset>[];
      }
      return assets.sublist(offset, end);
    },
    origin: TimelineOrigin.main,
  ));
}

Future<void> _pumpPhotosTimeline(
  WidgetTester tester,
  ({TimelineFactory factory, Future<void> Function() disposeServices}) factoryHarness,
) async {
  final user = _user('user-1');
  final userService = _MockUserService();
  when(() => userService.tryGetMyUser()).thenReturn(user);
  when(() => userService.watchMyUser()).thenAnswer((_) => const Stream<UserDto?>.empty());

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        timelineFactoryProvider.overrideWithValue(factoryHarness.factory),
        infra.userServiceProvider.overrideWithValue(userService),
        currentUserProvider.overrideWith((ref) => _StubCurrentUserNotifier(userService, user)),
        timelineUsersProvider.overrideWith((_) => Stream<List<String>>.value([user.id])),
      ],
      child: EasyLocalization(
        supportedLocales: const [Locale('en')],
        path: '../i18n',
        fallbackLocale: const Locale('en'),
        child: const MaterialApp(
          home: TimelineRouteScope(
            timelineServiceBuilder: buildPhotosTimelineRouteService,
            child: Timeline(appBar: null, bottomSheet: null, withScrubber: false),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

double _scrollPixels(WidgetTester tester) {
  return tester.state<ScrollableState>(find.byType(Scrollable).first).position.pixels;
}
