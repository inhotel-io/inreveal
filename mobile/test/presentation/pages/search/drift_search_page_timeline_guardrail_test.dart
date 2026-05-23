import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/search_result.model.dart';
import 'package:immich_mobile/domain/models/setting.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/services/search.service.dart';
import 'package:immich_mobile/domain/services/setting.service.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/presentation/pages/search/paginated_search.provider.dart';
import 'package:immich_mobile/presentation/pages/search/drift_search.page.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_grouping_header_sliver.widget.dart';
import 'package:immich_mobile/providers/infrastructure/readonly_mode.provider.dart';
import 'package:immich_mobile/providers/infrastructure/search.provider.dart';
import 'package:immich_mobile/providers/infrastructure/setting.provider.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:mocktail/mocktail.dart';

import '../../../test_utils.dart';

class _MockSearchService extends Mock implements SearchService {}

class _MockTimelineFactory extends Mock implements TimelineFactory {}

class _MockSettingsService extends Mock implements SettingsService {}

class _FakeSearchFilter extends Fake implements SearchFilter {}

class _StubSettingsNotifier extends SettingsNotifier {
  _StubSettingsNotifier(this._settings);

  final SettingsService _settings;

  @override
  SettingsService build() => _settings;
}

class _StubReadOnlyModeNotifier extends ReadOnlyModeNotifier {
  @override
  bool build() => false;
}

void main() {
  setUpAll(() {
    registerFallbackValue(_FakeSearchFilter());
    registerFallbackValue(<BaseAsset>[]);
    registerFallbackValue(const Stream<int>.empty());
  });

  testWidgets('search results stay ungrouped without grouping header', (tester) async {
    final settings = _MockSettingsService();
    final searchService = _MockSearchService();
    final timelineFactory = _MockTimelineFactory();
    final timelineService = TimelineService((
      bucketSource: () => const Stream<List<Bucket>>.empty(),
      assetSource: (offset, count) async => const <BaseAsset>[],
      origin: TimelineOrigin.search,
    ));
    final filter = SearchFilter.empty();

    when(() => settings.get(Setting.tilesPerRow)).thenReturn(3);
    when(
      () => searchService.search(filter, 1),
    ).thenAnswer((_) async => SearchResult(assets: [TestUtils.createRemoteAsset(id: 'asset-1')], nextPage: null));
    when(() => timelineFactory.fromAssetStream(any(), any(), TimelineOrigin.search)).thenReturn(timelineService);
    addTearDown(timelineService.dispose);

    final container = ProviderContainer(
      overrides: [
        readonlyModeProvider.overrideWith(() => _StubReadOnlyModeNotifier()),
        searchServiceProvider.overrideWithValue(searchService),
        settingsProvider.overrideWith(() => _StubSettingsNotifier(settings)),
        timelineFactoryProvider.overrideWithValue(timelineFactory),
      ],
    );
    addTearDown(container.dispose);

    await container.read(paginatedSearchProvider.notifier).search(filter);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(
          home: CustomScrollView(slivers: [DriftSearchResultGrid(onScrollEnd: _noop)]),
        ),
      ),
    );

    verify(() => timelineFactory.fromAssetStream(any(), any(), TimelineOrigin.search)).called(1);
    expect(DriftSearchPage.searchResultsGroupBy, GroupAssetsBy.none);
    expect(tester.widget<Timeline>(find.byType(Timeline)).groupBy, GroupAssetsBy.none);
    expect(find.byType(TimelineGroupingHeaderSliver), findsNothing);
  });
}

void _noop() {}
