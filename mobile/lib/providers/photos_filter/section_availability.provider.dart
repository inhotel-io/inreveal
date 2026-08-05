import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/filter_section_id.dart';
import 'package:immich_mobile/providers/photos_filter/filter_suggestions.provider.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';
import 'package:openapi/api.dart';

/// Which deep-sheet sections can actually filter something right now (#910).
///
/// Mirrors web's `filter-availability.ts`, minus its structural/transient split: mobile has no
/// `(0)` grey treatment, so the three verdicts (`available` / `empty` / `unavailable`) collapse to
/// two renderings here — a section is either offered or it isn't.
///
/// This is DERIVED. It is never written to [hiddenSectionsProvider], which is the user's own
/// persisted choice — conflating them would record a section as deliberately hidden the moment its
/// facet went empty, and it would never come back.

/// Whether this section itself currently holds a filter value. Mirrors web's
/// `hasActiveFilter` (`filter-panel.svelte:621-659`) section for section.
bool hasActiveFilterFor(FilterSectionId id, SearchFilter filter) {
  switch (id) {
    case FilterSectionId.people:
      return filter.people.isNotEmpty;
    case FilterSectionId.places:
      return filter.location.country != null || filter.location.state != null || filter.location.city != null;
    case FilterSectionId.tags:
      return (filter.tagIds ?? const []).isNotEmpty;
    case FilterSectionId.camera:
      return filter.camera.make != null || filter.camera.model != null;
    case FilterSectionId.rating:
      return filter.rating.rating.isSome;
    case FilterSectionId.media:
      return filter.mediaType != AssetType.other;
    case FilterSectionId.when:
      return filter.date.takenAfter != null || filter.date.takenBefore != null;
    case FilterSectionId.toggles:
      return filter.display.isFavorite ||
          filter.display.isArchive ||
          filter.display.isNotInAlbum ||
          filter.display.isUntagged;
  }
}

bool _facetEmpty(FilterSectionId id, FilterSuggestionsResponseDto facets) {
  switch (id) {
    case FilterSectionId.people:
      return facets.people.isEmpty && !facets.hasUnnamedPeople;
    case FilterSectionId.places:
      return facets.countries.isEmpty;
    case FilterSectionId.tags:
      return facets.tags.isEmpty;
    case FilterSectionId.camera:
      return facets.cameraMakes.isEmpty;
    case FilterSectionId.rating:
      return facets.ratings.isEmpty;
    case FilterSectionId.media:
      // The control offers All / Photos / Videos, so it needs both of those to discriminate.
      // NOT `length >= 2`: the server returns raw distinct asset.type and AssetType is
      // IMAGE | VIDEO | AUDIO | OTHER, so a photo library with one OTHER asset would pass a
      // length test while the Videos button stays dead. Same rule as web's filter-availability.ts.
      return !(facets.mediaTypes.contains('IMAGE') && facets.mediaTypes.contains('VIDEO'));
    case FilterSectionId.when:
    case FilterSectionId.toggles:
      // `when` mirrors web's Timeline. `toggles` always renders — two of its four switches have no
      // facet at all, so the section as a whole is never useless; per-switch gating is Task 3's.
      return false;
  }
}

Set<FilterSectionId> availableSections(
  FilterSuggestionsResponseDto facets,
  FilterSuggestionsResponseDto? baseline,
  SearchFilter filter,
) {
  bool offered(FilterSectionId id) {
    // Never strand a filter the user cannot then reach to clear.
    if (hasActiveFilterFor(id, filter)) return true;
    if (!_facetEmpty(id, facets)) return true;
    // A section is never hidden on missing information.
    if (baseline == null) return true;
    // Empty under the current filters but not for the whole scope: transient, so keep it.
    return !_facetEmpty(id, baseline);
  }

  return {
    for (final id in FilterSectionId.values)
      if (offered(id)) id,
  };
}

final sectionAvailabilityProvider = Provider.autoDispose<Set<FilterSectionId>>((ref) {
  final filter = ref.watch(photosFilterProvider);
  final facets = ref.watch(photosFilterSuggestionsProvider(filter));

  // Same family, different key — and the SAME key when nothing is filtered, so the common case
  // costs no extra request. SearchFilter has value equality, which is what makes that true.
  final baselineKey = filter.isEmpty ? filter : SearchFilter.empty();
  final baseline = ref.watch(photosFilterSuggestionsProvider(baselineKey));

  // While a request is in flight or has failed, offer everything. A section is never hidden on
  // missing information — including when Task 1b's throw fires.
  return facets.maybeWhen(
    data: (data) => availableSections(data, baseline.valueOrNull, filter),
    orElse: () => FilterSectionId.values.toSet(),
  );
});
