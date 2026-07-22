import 'package:flutter/material.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/deep/cascade_section.widget.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/filter_section_id.dart';
import 'package:immich_mobile/providers/photos_filter/city_suggestions.provider.dart';

/// PlacesCascadeSection — Deep-snap section for the Places filter dimension
/// (country → city). Behaviour lives in [CascadeSection]; this is the
/// Places-flavoured binding of it.
class PlacesCascadeSection extends StatelessWidget {
  final VoidCallback? onOpenPicker;
  const PlacesCascadeSection({super.key, this.onOpenPicker});

  @override
  Widget build(BuildContext context) {
    return CascadeSection(
      sectionId: FilterSectionId.places,
      titleKey: 'filter_sheet_deep_places_section',
      keyPrefix: 'places',
      parentKeyPart: 'country',
      childKeyPart: 'city',
      searchMoreI18nKey: 'filter_sheet_deep_search_n_places',
      searchMoreKeyName: 'places-section-search-more',
      itemsSelector: (s) => s.countries,
      childrenProvider: citySuggestionsProvider,
      selectedParent: (f) => f.location.country,
      selectedChild: (f) => f.location.city,
      setParent: (notifier, country) =>
          notifier.setLocation(country == null ? null : SearchLocationFilter(country: country)),
      setChild: (notifier, country, city) => notifier.setLocation(SearchLocationFilter(country: country, city: city)),
      onOpenPicker: onOpenPicker,
    );
  }
}
