import 'package:easy_localization/easy_localization.dart' hide TextDirection;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/places_picker.page.dart';
import 'package:immich_mobile/providers/photos_filter/filter_suggestions.provider.dart';
import 'package:immich_mobile/providers/photos_filter/places_picker.provider.dart';
import 'package:openapi/api.dart';

import '../../../widget_tester_extensions.dart';

FilterSuggestionsResponseDto _sugg(List<String> countries) =>
    FilterSuggestionsResponseDto(hasUnnamedPeople: false, countries: countries);

List<Override> _overrideCountries(List<String> countries) => [
  photosFilterSuggestionsProvider.overrideWith((ref, filter) async => _sugg(countries)),
];

void main() {
  group('PlacesPickerPage', () {
    testWidgets('renders AppBar with back icon, title key, and Done button', (tester) async {
      await tester.pumpConsumerWidget(const PlacesPickerPage(), overrides: _overrideCountries([]));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.arrow_back_rounded), findsOneWidget);
      expect(find.text('filter_sheet_picker_places_title'.tr()), findsOneWidget);
      expect(find.byKey(const Key('places-picker-done')), findsOneWidget);
    });

    testWidgets('Done button meets 48pt tap target', (tester) async {
      await tester.pumpConsumerWidget(const PlacesPickerPage(), overrides: _overrideCountries([]));
      await tester.pumpAndSettle();
      expectTapTargetMin(tester, find.byKey(const Key('places-picker-done')));
    });

    testWidgets('Done button pops the navigator stack', (tester) async {
      await tester.pumpConsumerWidget(
        Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                key: const Key('open-places-picker'),
                onPressed: () =>
                    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PlacesPickerPage())),
                child: const Text('open'),
              ),
            ),
          ),
        ),
        overrides: _overrideCountries([]),
      );
      await tester.tap(find.byKey(const Key('open-places-picker')));
      await tester.pumpAndSettle();
      expect(find.byType(PlacesPickerPage), findsOneWidget);

      await tester.tap(find.byKey(const Key('places-picker-done')));
      await tester.pumpAndSettle();
      expect(find.byType(PlacesPickerPage), findsNothing);
    });

    testWidgets('renders correctly in dark theme', (tester) async {
      await tester.pumpConsumerWidgetDark(const PlacesPickerPage(), overrides: _overrideCountries([]));
      await tester.pumpAndSettle();
      expect(find.byType(PlacesPickerPage), findsOneWidget);
    });
  });

  group('PlacesPickerPage search', () {
    testWidgets('typing updates placesPickerQueryProvider', (tester) async {
      await tester.pumpConsumerWidget(
        const PlacesPickerPage(),
        overrides: _overrideCountries(['France', 'Spain']),
      );
      await tester.pumpAndSettle();

      final container = ProviderScope.containerOf(tester.element(find.byType(PlacesPickerPage)));
      await tester.enterText(find.byKey(const Key('places-picker-search-field')), 'fr');
      await tester.pump();

      expect(container.read(placesPickerQueryProvider), 'fr');
    });

    testWidgets('non-matching query renders No results panel + Clear search, tapping clears', (tester) async {
      await tester.pumpConsumerWidget(const PlacesPickerPage(), overrides: _overrideCountries(['France']));
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('places-picker-search-field')), 'zzzzz');
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('places-picker-clear-search')), findsOneWidget);

      final container = ProviderScope.containerOf(tester.element(find.byType(PlacesPickerPage)));
      await tester.tap(find.byKey(const Key('places-picker-clear-search')));
      await tester.pumpAndSettle();

      expect(container.read(placesPickerQueryProvider), '');
      expect(find.byKey(const Key('places-picker-clear-search')), findsNothing);
    });
  });

  group('PlacesPickerPage integration', () {
    testWidgets('renders a row per country from suggestions (no proactive city fetch)', (tester) async {
      await tester.pumpConsumerWidget(
        const PlacesPickerPage(),
        overrides: _overrideCountries(['France', 'Spain', 'Finland']),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('places-picker-country-France')), findsOneWidget);
      expect(find.byKey(const Key('places-picker-country-Spain')), findsOneWidget);
      expect(find.byKey(const Key('places-picker-country-Finland')), findsOneWidget);
    });

    testWidgets('typing "fr" filters the country list to France only', (tester) async {
      await tester.pumpConsumerWidget(
        const PlacesPickerPage(),
        overrides: _overrideCountries(['France', 'Spain', 'Finland']),
      );
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('places-picker-search-field')), 'fr');
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('places-picker-country-France')), findsOneWidget);
      expect(find.byKey(const Key('places-picker-country-Spain')), findsNothing);
      expect(find.byKey(const Key('places-picker-country-Finland')), findsNothing);
    });
  });
}
