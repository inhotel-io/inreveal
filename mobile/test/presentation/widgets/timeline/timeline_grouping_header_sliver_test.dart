import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:easy_localization/easy_localization.dart' hide TextDirection;
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/timeline_temporal_scope.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/active_filter_chip.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_grouping_header_sliver.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_grouping_selector.widget.dart';
import 'package:immich_mobile/providers/timeline/multiselect.provider.dart';
import 'package:immich_mobile/providers/timeline/temporal_scope.provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../test_utils.dart';
import '../../../widget_tester_extensions.dart';

void main() {
  late Drift db;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    TestUtils.init();
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
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

  Widget scroll() {
    return const CustomScrollView(
      slivers: [
        TimelineGroupingHeaderSliver(),
        SliverToBoxAdapter(child: SizedBox(height: 600)),
      ],
    );
  }

  group('TimelineGroupingHeaderSliver', () {
    testWidgets('renders TimelineGroupingSelector in a top-of-content sliver', (tester) async {
      await tester.pumpConsumerWidget(scroll());
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('timeline-grouping-header-sliver')), findsOneWidget);
      expect(find.byType(TimelineGroupingSelector), findsOneWidget);
      expect(kTimelineGroupingHeaderSliverHeight, 56);
    });

    testWidgets('renders clearable temporal scope chip and clearing it resets only scope', (tester) async {
      final semantics = tester.ensureSemantics();

      await tester.pumpConsumerWidget(scroll());
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(tester.element(find.byType(CustomScrollView)));
      container.read(timelineTemporalScopeProvider.notifier).setMonth(year: 2025, month: 3);
      await tester.pumpAndSettle();

      expect(find.text('Mar 2025'), findsOneWidget);
      expect(find.byType(ActiveFilterChip), findsOneWidget);
      final chipSemantics = tester.getSemantics(find.byType(ActiveFilterChip));
      expect(chipSemantics.label, 'Mar 2025, clear timeline date filter');
      expect(chipSemantics.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);

      await tester.tap(find.byIcon(Icons.close_rounded));
      await tester.pumpAndSettle();

      expect(container.read(timelineTemporalScopeProvider), const TimelineTemporalScope.none());
      expect(find.byType(TimelineGroupingSelector), findsOneWidget);
      semantics.dispose();
    });

    testWidgets('hides selector while multi-select is forced enabled', (tester) async {
      await tester.pumpConsumerWidget(
        scroll(),
        overrides: [
          multiSelectProvider.overrideWith(
            () => MultiSelectNotifier(
              const MultiSelectState(selectedAssets: {}, lockedSelectionAssets: {}, forceEnable: true),
            ),
          ),
        ],
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('timeline-grouping-header-sliver')), findsNothing);
      expect(find.byType(TimelineGroupingSelector), findsNothing);
    });

    testWidgets('hides selector while multi-select has selected assets', (tester) async {
      final selectedAsset = TestUtils.createRemoteAsset(id: 'selected-asset');

      await tester.pumpConsumerWidget(
        scroll(),
        overrides: [
          multiSelectProvider.overrideWith(
            () => MultiSelectNotifier(
              MultiSelectState(selectedAssets: {selectedAsset}, lockedSelectionAssets: const {}, forceEnable: false),
            ),
          ),
        ],
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('timeline-grouping-header-sliver')), findsNothing);
      expect(find.byType(TimelineGroupingSelector), findsNothing);
    });
  });
}
