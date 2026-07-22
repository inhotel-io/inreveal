import 'package:flutter/material.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/cascade_picker.dart';
import 'package:immich_mobile/providers/photos_filter/city_suggestions.provider.dart';
import 'package:immich_mobile/providers/photos_filter/places_picker.provider.dart';

/// country → city cascade config for [PlacesPickerPage] — see
/// [CascadePickerConfig] for what each field drives.
final placesCascadeConfig = CascadePickerConfig(
  keyPrefix: 'places-picker',
  parentKeyPart: 'country',
  childKeyPart: 'city',
  titleKey: 'filter_sheet_picker_places_title',
  hintKey: 'filter_sheet_picker_search_places_hint',
  queryProvider: placesPickerQueryProvider,
  parentsProvider: placesPickerCountriesProvider,
  childrenProvider: citySuggestionsProvider,
  selectedParent: (f) => f.location.country,
  selectedChild: (f) => f.location.city,
  selectParent: (notifier, country) => notifier.setLocation(SearchLocationFilter(country: country)),
  selectChild: (notifier, country, city) => notifier.setLocation(SearchLocationFilter(country: country, city: city)),
  accordionBuilder: (expanded, onExpand) =>
      PlacesPickerCountryAccordion(expandedCountry: expanded, onExpandCountry: onExpand),
);

/// Full-screen country → city accordion for [PlacesPickerPage]. Behaviour
/// lives in [CascadeAccordion]; this is the Places-flavoured binding of it.
class PlacesPickerCountryAccordion extends StatelessWidget {
  final String? expandedCountry;
  final ValueChanged<String?> onExpandCountry;

  const PlacesPickerCountryAccordion({super.key, required this.expandedCountry, required this.onExpandCountry});

  @override
  Widget build(BuildContext context) =>
      CascadeAccordion(config: placesCascadeConfig, expanded: expandedCountry, onExpand: onExpandCountry);
}
