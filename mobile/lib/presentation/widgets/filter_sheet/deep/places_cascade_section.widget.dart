import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/deep/deep_section_scaffold.widget.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/filter_section_id.dart';
import 'package:immich_mobile/providers/photos_filter/city_suggestions.provider.dart';
import 'package:immich_mobile/providers/photos_filter/filter_debounce.provider.dart';
import 'package:immich_mobile/providers/photos_filter/filter_suggestions.provider.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';

/// Preview cap: the deep section's country Wrap shows at most this many
/// chips by default, plus the selected country if it falls beyond the cap
/// (pinned so it stays visible).
const int _kPreviewCap = 10;

/// PlacesCascadeSection — Deep-snap section for the Places filter dimension.
///
/// When no country is selected, renders a Wrap of country FilterChips sourced
/// from photosFilterSuggestionsProvider (capped to [_kPreviewCap]) plus a
/// "Search N places →" header affordance delegating to [onOpenPicker]. Tapping
/// a country sets filter.location.country and swaps in a _CityCascade which
/// shows:
///   - the selected country as an InputChip (× clears it)
///   - a Wrap of city FilterChips from citySuggestionsProvider(country)
class PlacesCascadeSection extends ConsumerWidget {
  final VoidCallback? onOpenPicker;
  const PlacesCascadeSection({super.key, this.onOpenPicker});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(photosFilterDebouncedProvider);
    final async = ref.watch(photosFilterSuggestionsProvider(filter));
    final countriesAsync = async.whenData((s) => s.countries);
    final selectedCountry = ref.watch(photosFilterProvider.select((f) => f.location.country));
    final count = countriesAsync.valueOrNull?.length ?? 0;

    return DeepSectionScaffold<String>(
      sectionId: FilterSectionId.places,
      titleKey: 'filter_sheet_deep_places_section',
      emptyCaptionKey: 'filter_sheet_deep_empty_places',
      items: countriesAsync,
      onRetry: () => ref.invalidate(photosFilterSuggestionsProvider(filter)),
      trailingHeader: count > 0
          ? TextButton(
              key: const Key('places-section-search-more'),
              onPressed: () {
                HapticFeedback.selectionClick();
                onOpenPicker?.call();
              },
              child: Text(_searchMorePlacesLabel(count)),
            )
          : null,
      childBuilder: (countries) {
        if (selectedCountry == null) {
          return _CountryWrap(countries: countries, selectedCountry: selectedCountry);
        }
        return _CityCascade(country: selectedCountry);
      },
    );
  }
}

/// Plural helper — nested-leaf lookup avoids `.plural()`, which reads a
/// late-initialized locale field and throws in widget tests without an
/// `EasyLocalization` ancestor. Matches the pattern in `people_section.widget.dart`.
String _searchMorePlacesLabel(int count) {
  final variant = count == 1 ? 'one' : 'other';
  return 'filter_sheet_deep_search_n_places.$variant'.tr(namedArgs: {'count': '$count'});
}

class _CountryWrap extends ConsumerWidget {
  final List<String> countries;
  final String? selectedCountry;
  const _CountryWrap({required this.countries, required this.selectedCountry});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final firstCap = countries.take(_kPreviewCap).toList();
    final display = [
      ...firstCap,
      if (selectedCountry != null && !firstCap.contains(selectedCountry) && countries.contains(selectedCountry))
        selectedCountry!,
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final country in display)
          FilterChip(
            key: Key('places-country-$country'),
            label: Text(country),
            selected: country == selectedCountry,
            onSelected: (_) {
              HapticFeedback.selectionClick();
              ref.read(photosFilterProvider.notifier).setLocation(SearchLocationFilter(country: country));
            },
          ),
      ],
    );
  }
}

class _CityCascade extends ConsumerWidget {
  final String country;
  const _CityCascade({required this.country});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final citiesAsync = ref.watch(citySuggestionsProvider(country));
    final selectedCity = ref.watch(photosFilterProvider.select((f) => f.location.city));
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        InputChip(
          key: const Key('places-country-selected'),
          label: Text(country),
          selected: true,
          selectedColor: theme.colorScheme.primaryContainer,
          onDeleted: () {
            HapticFeedback.selectionClick();
            ref.read(photosFilterProvider.notifier).setLocation(null);
          },
          deleteIcon: const Icon(Icons.close_rounded, key: Key('places-country-selected-clear')),
        ),
        const SizedBox(height: 8),
        citiesAsync.when(
          data: (cities) {
            if (cities.isEmpty) return const SizedBox.shrink();
            return Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final city in cities)
                  FilterChip(
                    key: Key('places-city-$city'),
                    label: Text(city),
                    selected: selectedCity == city,
                    onSelected: (_) {
                      HapticFeedback.selectionClick();
                      ref
                          .read(photosFilterProvider.notifier)
                          .setLocation(
                            SearchLocationFilter(country: country, city: selectedCity == city ? null : city),
                          );
                    },
                  ),
              ],
            );
          },
          loading: () => const LinearProgressIndicator(),
          error: (_, __) => TextButton.icon(
            onPressed: () => ref.invalidate(citySuggestionsProvider(country)),
            icon: const Icon(Icons.refresh_rounded),
            label: Text('filter_sheet_load_error_retry'.tr()),
          ),
        ),
      ],
    );
  }
}
