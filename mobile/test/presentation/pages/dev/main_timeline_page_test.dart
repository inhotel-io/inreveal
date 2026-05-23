import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/presentation/pages/dev/main_timeline.page.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/filter_icon_button.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_grouping_selector.widget.dart';

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

  group('PhotosTimelineAppBar', () {
    test('uses grouping selector without filter action', () {
      expect(PhotosTimelineAppBar.actions, hasLength(1));
      expect(PhotosTimelineAppBar.actions.single, isA<TimelineGroupingSelector>());
      expect((PhotosTimelineAppBar.actions.single as TimelineGroupingSelector).compact, isTrue);
      expect(PhotosTimelineAppBar.actions.whereType<FilterIconButton>(), isEmpty);
      expect(MainTimelinePage.timelineOverviewControlsEnabled, isTrue);
    });

    testWidgets('app bar keeps a compact grouping selector action', (tester) async {
      await tester.binding.setSurfaceSize(const Size(1024, 600));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      expect(PhotosTimelineAppBar.actions, hasLength(1));
      expect(PhotosTimelineAppBar.actions.single, isA<TimelineGroupingSelector>());

      await tester.pumpConsumerWidget(
        const CustomScrollView(slivers: [SliverAppBar(actions: PhotosTimelineAppBar.actions)]),
      );
      await tester.pumpAndSettle();

      expect(find.byType(TimelineGroupingSelector), findsOneWidget);
      expect(find.byKey(const Key('timeline-grouping-compact-selector')), findsOneWidget);
      expect(tester.getSize(find.byKey(const Key('timeline-grouping-compact-selector'))).width, lessThanOrEqualTo(92));
      expect(find.byIcon(Icons.search), findsNothing);
      expect(find.byIcon(Icons.filter_alt_outlined), findsNothing);
      expect(find.byType(FilterIconButton), findsNothing);
    });
  });
}
