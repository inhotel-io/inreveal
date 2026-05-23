import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/presentation/widgets/images/thumbnail.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/overview/overview_card.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../test_utils.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Drift db;

  setUpAll(() async {
    TestUtils.init();
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
    await initializeDateFormatting('en');
    db = Drift(drift.DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    await StoreService.init(storeRepository: DriftStoreRepository(db), listenUpdates: false);
  });

  setUp(() async {
    await Store.clear();
    await Store.put(StoreKey.serverEndpoint, 'http://test-server');
  });

  tearDownAll(() async {
    await Store.clear();
    await db.close();
  });

  Widget wrap(Widget child) {
    return EasyLocalization(
      supportedLocales: const [Locale('en')],
      path: '../i18n',
      fallbackLocale: const Locale('en'),
      child: MaterialApp(
        home: Scaffold(body: Center(child: child)),
      ),
    );
  }

  testWidgets('year card renders compact label, count, and representative thumbnail', (tester) async {
    final asset = TestUtils.createRemoteAsset(id: 'asset-1', width: 200, height: 100);

    await tester.pumpWidget(
      wrap(
        TimelineOverviewCard(
          bucket: TimeBucket(date: DateTime(2025), assetCount: 1),
          groupBy: GroupAssetsBy.year,
          representativeAsset: asset,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('2025'), findsOneWidget);
    expect(find.text('1 photo'), findsOneWidget);
    expect(find.byType(Thumbnail), findsOneWidget);

    final sizedBox = tester.widget<SizedBox>(find.byKey(const ValueKey('timeline-overview-card-size')));
    expect(sizedBox.height, kTimelineOverviewCardHeight);
  });

  testWidgets('month card includes month and year with plural photo count', (tester) async {
    await tester.pumpWidget(
      wrap(
        TimelineOverviewCard(
          bucket: TimeBucket(date: DateTime(2025, 3), assetCount: 4),
          groupBy: GroupAssetsBy.month,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Mar 2025'), findsOneWidget);
    expect(find.text('4 photos'), findsOneWidget);
  });

  testWidgets('fallback surface keeps label and count visible without a thumbnail', (tester) async {
    await tester.pumpWidget(
      wrap(
        TimelineOverviewCard(
          bucket: TimeBucket(date: DateTime(2024), assetCount: 2),
          groupBy: GroupAssetsBy.year,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('timeline-overview-card-fallback')), findsOneWidget);
    expect(find.text('2024'), findsOneWidget);
    expect(find.text('2 photos'), findsOneWidget);
  });
}
