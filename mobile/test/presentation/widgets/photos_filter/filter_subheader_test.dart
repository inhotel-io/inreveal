import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/timeline_temporal_scope.model.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/active_filter_chip.widget.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/match_count_label.widget.dart';
import 'package:immich_mobile/presentation/widgets/photos_filter/filter_subheader.widget.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';
import 'package:immich_mobile/providers/timeline/temporal_scope.provider.dart';

import '../../../widget_tester_extensions.dart';

Widget _scroll(Widget sliver) => CustomScrollView(slivers: [sliver]);

void main() {
  group('PhotosFilterSubheader', () {
    testWidgets('renders nothing when filter is empty', (tester) async {
      await tester.pumpConsumerWidget(_scroll(const PhotosFilterSubheader()));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('photos-filter-subheader')), findsNothing);
    });

    testWidgets('renders clear-all + at least one chip when a filter is active', (tester) async {
      await tester.pumpConsumerWidget(_scroll(const PhotosFilterSubheader()));
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(tester.element(find.byType(CustomScrollView)));
      container.read(photosFilterProvider.notifier).setText('paris');
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('photos-filter-subheader')), findsOneWidget);
      expect(find.byKey(const Key('photos-filter-subheader-clear-all')), findsOneWidget);
      expect(find.byType(ActiveFilterChip), findsOneWidget);
    });

    testWidgets('tapping Clear all resets the filter', (tester) async {
      await tester.pumpConsumerWidget(_scroll(const PhotosFilterSubheader()));
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(tester.element(find.byType(CustomScrollView)));
      container.read(photosFilterProvider.notifier).setText('paris');
      await tester.pumpAndSettle();
      expect(container.read(photosFilterProvider).isEmpty, isFalse);

      await tester.tap(find.byKey(const Key('photos-filter-subheader-clear-all')));
      await tester.pumpAndSettle();

      expect(container.read(photosFilterProvider).isEmpty, isTrue);
      expect(find.byKey(const Key('photos-filter-subheader')), findsNothing);
    });

    testWidgets('strip pins Clear all only — sort moved to the app bar, count to the sheet footer', (tester) async {
      await tester.pumpConsumerWidget(_scroll(const PhotosFilterSubheader()));
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(tester.element(find.byType(CustomScrollView)));
      container.read(photosFilterProvider.notifier).setText('paris');
      await tester.pumpAndSettle();

      // The crowding fix: the strip no longer hosts the sort control or the
      // match count, freeing the full width for the scrollable filter chips.
      expect(find.byKey(const Key('photos-filter-sort-chip')), findsNothing);
      expect(find.byType(MatchCountLabel), findsNothing);
    });

    testWidgets('clear-all label uses existing clear_all i18n key', (tester) async {
      await tester.pumpConsumerWidget(_scroll(const PhotosFilterSubheader()));
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(tester.element(find.byType(CustomScrollView)));
      container.read(photosFilterProvider.notifier).setText('paris');
      await tester.pumpAndSettle();

      expect(find.text('clear_all'.tr()), findsOneWidget);
    });

    testWidgets('renders when only temporal scope is active', (tester) async {
      await tester.pumpConsumerWidget(_scroll(const PhotosFilterSubheader()));
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(tester.element(find.byType(CustomScrollView)));
      container.read(timelineTemporalScopeProvider.notifier).setYear(2025);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('photos-filter-subheader')), findsOneWidget);
      expect(find.text('2025'), findsOneWidget);
      expect(find.byType(ActiveFilterChip), findsOneWidget);
    });

    testWidgets('clearing temporal chip keeps normal Photos filters intact', (tester) async {
      await tester.pumpConsumerWidget(_scroll(const PhotosFilterSubheader()));
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(tester.element(find.byType(CustomScrollView)));
      container.read(photosFilterProvider.notifier).setText('paris');
      container.read(timelineTemporalScopeProvider.notifier).setMonth(year: 2025, month: 3);
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text('Mar 2025'), 100, scrollable: find.byType(Scrollable).last);
      await tester.drag(find.byType(Scrollable).last, const Offset(-120, 0));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.close_rounded).last);
      await tester.pumpAndSettle();

      expect(container.read(timelineTemporalScopeProvider), const TimelineTemporalScope.none());
      expect(container.read(photosFilterProvider).context, 'paris');
      expect(find.text('"paris"'), findsOneWidget);
    });

    testWidgets('Clear all resets normal filters and temporal scope', (tester) async {
      await tester.pumpConsumerWidget(_scroll(const PhotosFilterSubheader()));
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(tester.element(find.byType(CustomScrollView)));
      container.read(photosFilterProvider.notifier).setText('paris');
      container.read(timelineTemporalScopeProvider.notifier).setYear(2025);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('photos-filter-subheader-clear-all')));
      await tester.pumpAndSettle();

      expect(container.read(photosFilterProvider).isEmpty, isTrue);
      expect(container.read(timelineTemporalScopeProvider), const TimelineTemporalScope.none());
      expect(find.byKey(const Key('photos-filter-subheader')), findsNothing);
    });
  });
}
