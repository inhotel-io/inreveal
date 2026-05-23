import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
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

    testWidgets('selected segment exposes button semantics without duplicate child text', (tester) async {
      await Store.put(StoreKey.groupAssetsBy, GroupAssetsBy.month.index);
      final semantics = tester.ensureSemantics();
      try {
        await tester.pumpConsumerWidget(const TimelineGroupingSelector());
        await tester.pumpAndSettle();

        expect(tester.getSemantics(find.byKey(const Key('timeline-grouping-selector'))).label, 'Timeline grouping');
        expect(find.bySemanticsLabel('Years'), findsOneWidget);
        expect(find.bySemanticsLabel('Months'), findsOneWidget);
        expect(find.bySemanticsLabel('Days'), findsOneWidget);

        final years = tester.getSemantics(find.byKey(const Key('timeline-grouping-year')));
        final months = tester.getSemantics(find.byKey(const Key('timeline-grouping-month')));
        final days = tester.getSemantics(find.byKey(const Key('timeline-grouping-day')));

        expect(years.hasFlag(SemanticsFlag.isButton), isTrue);
        expect(years.hasFlag(SemanticsFlag.isSelected), isFalse);
        expect(years.hasFlag(SemanticsFlag.isEnabled), isTrue);
        expect(months.hasFlag(SemanticsFlag.isButton), isTrue);
        expect(months.hasFlag(SemanticsFlag.isSelected), isTrue);
        expect(months.hasFlag(SemanticsFlag.isEnabled), isTrue);
        expect(days.hasFlag(SemanticsFlag.isButton), isTrue);
        expect(days.hasFlag(SemanticsFlag.isSelected), isFalse);
        expect(days.hasFlag(SemanticsFlag.isEnabled), isTrue);
      } finally {
        semantics.dispose();
      }
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

    testWidgets('disabled selector removes actionable semantics and does not write settings', (tester) async {
      await Store.put(StoreKey.groupAssetsBy, GroupAssetsBy.day.index);
      final semantics = tester.ensureSemantics();
      try {
        await tester.pumpConsumerWidget(const TimelineGroupingSelector(enabled: false));
        await tester.pumpAndSettle();

        for (final groupBy in timelineGroupingSelectorGroups) {
          final label = switch (groupBy) {
            GroupAssetsBy.year => 'Years',
            GroupAssetsBy.month => 'Months',
            GroupAssetsBy.day => 'Days',
            GroupAssetsBy.auto || GroupAssetsBy.none => 'Days',
          };
          final node = tester.getSemantics(find.byKey(Key('timeline-grouping-${groupBy.name}')));
          expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isFalse, reason: label);
          expect(node.hasFlag(SemanticsFlag.hasEnabledState), isTrue, reason: label);
          expect(node.hasFlag(SemanticsFlag.isEnabled), isFalse, reason: label);
        }

        await tester.tap(find.byKey(const Key('timeline-grouping-year')), warnIfMissed: false);
        await tester.pumpAndSettle();

        expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.day.index);
      } finally {
        semantics.dispose();
      }
    });

    testWidgets('segments meet compact mobile tap target inside the app bar slot', (tester) async {
      await tester.pumpConsumerWidget(
        const CustomScrollView(
          slivers: [
            SliverAppBar(actions: [TimelineGroupingSelector()]),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.getSize(find.byKey(const Key('timeline-grouping-selector'))).height, greaterThanOrEqualTo(48));
      for (final groupBy in timelineGroupingSelectorGroups) {
        expect(tester.getSize(find.byKey(Key('timeline-grouping-${groupBy.name}'))).height, greaterThanOrEqualTo(48));
      }
    });

    testWidgets('large text and narrow width keep all labels inside the selector', (tester) async {
      await tester.binding.setSurfaceSize(const Size(180, 120));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpConsumerWidget(
        MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: const Align(
            alignment: Alignment.topRight,
            child: SizedBox(width: 150, child: TimelineGroupingSelector()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(tester.getSize(find.byKey(const Key('timeline-grouping-selector'))).width, lessThanOrEqualTo(150));
      expect(find.byKey(const Key('timeline-grouping-year')), findsOneWidget);
      expect(find.byKey(const Key('timeline-grouping-month')), findsOneWidget);
      expect(find.byKey(const Key('timeline-grouping-day')), findsOneWidget);
    });

    testWidgets('reduced motion removes nonessential selector animation', (tester) async {
      await tester.pumpConsumerWidget(
        MediaQuery(
          data: const MediaQueryData(disableAnimations: true, accessibleNavigation: true),
          child: const TimelineGroupingSelector(),
        ),
      );
      await tester.pumpAndSettle();

      final reducedDurations = tester
          .widgetList<AnimatedContainer>(find.byType(AnimatedContainer))
          .map((w) => w.duration);
      expect(reducedDurations, isNotEmpty);
      expect(reducedDurations, everyElement(Duration.zero));

      await tester.pumpConsumerWidget(const TimelineGroupingSelector());
      await tester.pumpAndSettle();

      final normalDurations = tester
          .widgetList<AnimatedContainer>(find.byType(AnimatedContainer))
          .map((w) => w.duration);
      expect(normalDurations, isNotEmpty);
      expect(normalDurations, everyElement(isNot(Duration.zero)));
    });

    testWidgets('rtl layout preserves tap behavior and directional visual order', (tester) async {
      await Store.put(StoreKey.groupAssetsBy, GroupAssetsBy.month.index);

      await tester.pumpConsumerWidget(
        const Directionality(textDirection: TextDirection.rtl, child: TimelineGroupingSelector()),
      );
      await tester.pumpAndSettle();

      final years = tester.getCenter(find.byKey(const Key('timeline-grouping-year')));
      final months = tester.getCenter(find.byKey(const Key('timeline-grouping-month')));
      final days = tester.getCenter(find.byKey(const Key('timeline-grouping-day')));

      expect(years.dx, greaterThan(months.dx));
      expect(months.dx, greaterThan(days.dx));

      await tester.tap(find.byKey(const Key('timeline-grouping-day')));
      await tester.pumpAndSettle();

      expect(Store.get(StoreKey.groupAssetsBy), GroupAssetsBy.day.index);
    });
  });
}
