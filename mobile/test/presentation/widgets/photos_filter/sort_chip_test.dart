import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/presentation/widgets/photos_filter/filter_subheader.widget.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';
import '../../../widget_tester_extensions.dart';

void main() {
  testWidgets('sort chip reflects and updates sort', (tester) async {
    // The sort chip label uses the i18n key as text in tests (no EasyLocalization
    // ancestor), which can be longer than "Newest first" etc. Give a wide viewport
    // so the subheader Row doesn't overflow during layout.
    tester.view.physicalSize = const Size(1600, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpConsumerWidget(CustomScrollView(slivers: const [PhotosFilterSubheader()]));
    final c = ProviderScope.containerOf(tester.element(find.byType(CustomScrollView)));
    c.read(photosFilterProvider.notifier).setText('beach');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('photos-filter-sort-chip')), findsOneWidget);

    c.read(photosFilterProvider.notifier).setSort(SearchSortOrder.newest);
    await tester.pumpAndSettle();
    expect(find.text('search_sort_newest'.tr()), findsWidgets);
  });
}
