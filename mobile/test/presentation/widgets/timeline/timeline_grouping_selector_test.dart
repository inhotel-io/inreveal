import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_grouping_selector.widget.dart';
import 'package:immich_mobile/providers/infrastructure/setting.provider.dart';
import 'package:immich_mobile/widgets/settings/asset_list_settings/asset_list_group_settings.dart';

import '../../../test_utils.dart';
import '../../../widget_tester_extensions.dart';

void main() {
  late Drift db;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    TestUtils.init();
    db = Drift(drift.DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    await StoreService.init(storeRepository: DriftStoreRepository(db), listenUpdates: false);
  });

  setUp(() async {
    await Store.clear();
  });

  tearDownAll(() async {
    await Store.clear();
    await db.close();
  });

  Semantics segment(WidgetTester tester, GroupAssetsBy groupBy) {
    return tester.widget<Semantics>(find.byKey(Key('timeline-grouping-${groupBy.name}')));
  }

  bool selected(WidgetTester tester, GroupAssetsBy groupBy) {
    return segment(tester, groupBy).properties.selected ?? false;
  }

  group('TimelineGroupingSelector', () {
    testWidgets('renders years, months, and days segments in an app-bar action slot', (tester) async {
      await tester.pumpConsumerWidget(
        const CustomScrollView(
          slivers: [
            SliverAppBar(actions: [TimelineGroupingSelector()]),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('timeline-grouping-selector')), findsOneWidget);
      expect(find.byKey(const Key('timeline-grouping-year')), findsOneWidget);
      expect(find.byKey(const Key('timeline-grouping-month')), findsOneWidget);
      expect(find.byKey(const Key('timeline-grouping-day')), findsOneWidget);
      expect(selected(tester, GroupAssetsBy.day), isTrue);
    });

    testWidgets('initializes selected segment from Setting.groupAssetsBy', (tester) async {
      await Store.put(StoreKey.groupAssetsBy, GroupAssetsBy.month.index);

      await tester.pumpConsumerWidget(const TimelineGroupingSelector());
      await tester.pumpAndSettle();

      expect(selected(tester, GroupAssetsBy.month), isTrue);
      expect(selected(tester, GroupAssetsBy.day), isFalse);
      expect(selected(tester, GroupAssetsBy.year), isFalse);
    });

    testWidgets('normalizes unsupported auto and none values to Days visually', (tester) async {
      await Store.put(StoreKey.groupAssetsBy, GroupAssetsBy.auto.index);
      await tester.pumpConsumerWidget(const TimelineGroupingSelector());
      await tester.pumpAndSettle();
      expect(selected(tester, GroupAssetsBy.day), isTrue);

      await Store.put(StoreKey.groupAssetsBy, GroupAssetsBy.none.index);
      final container = ProviderScope.containerOf(tester.element(find.byType(TimelineGroupingSelector)));
      container.invalidate(settingsProvider);
      await tester.pumpAndSettle();
      expect(selected(tester, GroupAssetsBy.day), isTrue);
    });

    testWidgets('tapping each segment writes the matching GroupAssetsBy setting', (tester) async {
      await tester.pumpConsumerWidget(const TimelineGroupingSelector());
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('timeline-grouping-year')));
      await tester.pumpAndSettle();
      expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.year.index);
      expect(selected(tester, GroupAssetsBy.year), isTrue);

      await tester.tap(find.byKey(const Key('timeline-grouping-month')));
      await tester.pumpAndSettle();
      expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.month.index);
      expect(selected(tester, GroupAssetsBy.month), isTrue);

      await tester.tap(find.byKey(const Key('timeline-grouping-day')));
      await tester.pumpAndSettle();
      expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.day.index);
      expect(selected(tester, GroupAssetsBy.day), isTrue);
    });

    testWidgets('settings picker changes update the selector', (tester) async {
      await tester.pumpConsumerWidget(
        const SingleChildScrollView(child: Column(children: [TimelineGroupingSelector(), GroupSettings()])),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.descendant(of: find.byType(GroupSettings), matching: find.text('year')));
      await tester.pumpAndSettle();

      expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.year.index);
      expect(selected(tester, GroupAssetsBy.year), isTrue);
    });

    testWidgets('disabled selector does not write settings', (tester) async {
      await Store.put(StoreKey.groupAssetsBy, GroupAssetsBy.day.index);
      await tester.pumpConsumerWidget(const TimelineGroupingSelector(enabled: false));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('timeline-grouping-year')), warnIfMissed: false);
      await tester.pumpAndSettle();

      expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.day.index);
      expect(selected(tester, GroupAssetsBy.day), isTrue);
    });

    testWidgets('narrow width does not throw layout overflow', (tester) async {
      await tester.binding.setSurfaceSize(const Size(180, 120));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpConsumerWidget(
        const Align(
          alignment: Alignment.topRight,
          child: SizedBox(width: 150, child: TimelineGroupingSelector()),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(tester.getSize(find.byKey(const Key('timeline-grouping-selector'))).width, lessThanOrEqualTo(150));
    });
  });
}
