import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/person.model.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/providers/photos_filter/chip_id.dart';
import 'package:immich_mobile/utils/option.dart';

final photosFilterProvider = NotifierProvider<PhotosFilterNotifier, SearchFilter>(PhotosFilterNotifier.new);

class PhotosFilterNotifier extends Notifier<SearchFilter> {
  @override
  SearchFilter build() => SearchFilter.empty();

  @override
  bool updateShouldNotify(SearchFilter previous, SearchFilter next) => previous != next;

  void reset() => state = SearchFilter.empty();

  // SearchFilter.copyWith null-coalesces, so use cascade to set nullable fields.
  void setText(String text) {
    final next = state.copyWith()..context = text.isEmpty ? null : text;
    // Relevance is only valid for smart (text) search; coerce to Newest for metadata.
    state = (next.context == null && next.sort == SearchSortOrder.relevance)
        ? next.copyWith(sort: SearchSortOrder.newest)
        : next;
  }

  void setSort(SearchSortOrder sort) => state = state.copyWith(sort: sort);

  void setSimilarTo(String assetId) =>
      state = SearchFilter.empty().copyWith(assetId: assetId, mediaType: AssetType.image);

  void togglePerson(PersonDto person) {
    final next = Set<PersonDto>.from(state.people);
    if (!next.add(person)) next.remove(person);
    state = state.copyWith(people: next);
  }

  void toggleTag(String tagId) {
    final current = List<String>.from(state.tagIds ?? const []);
    if (current.contains(tagId)) {
      current.remove(tagId);
    } else {
      current.add(tagId);
    }
    state = state.copyWith(display: state.display.copyWith(isUntagged: false))
      ..tagIds = current.isEmpty ? null : current;
  }

  void setLocation(SearchLocationFilter? location) =>
      state = state.copyWith(location: location ?? SearchLocationFilter());

  void setCamera(SearchCameraFilter? camera) => state = state.copyWith(camera: camera ?? SearchCameraFilter());

  void setDateRange({DateTime? start, DateTime? end}) => state = state.copyWith(
    date: SearchDateFilter(takenAfter: start, takenBefore: end),
  );

  void setRating(int? rating) =>
      state = state.copyWith(rating: SearchRatingFilter(rating: Option.fromNullable(rating)));

  void setMediaType(AssetType? type) => state = state.copyWith(mediaType: type ?? AssetType.other);

  void setFavouritesOnly(bool v) => state = state.copyWith(display: state.display.copyWith(isFavorite: v));

  void setArchivedIncluded(bool v) => state = state.copyWith(display: state.display.copyWith(isArchive: v));

  void setNotInAlbum(bool v) => state = state.copyWith(display: state.display.copyWith(isNotInAlbum: v));

  void setUntagged(bool v) {
    final previousTagIds = state.tagIds;
    state = state.copyWith(display: state.display.copyWith(isUntagged: v))..tagIds = v ? null : previousTagIds;
  }

  void clearPeople() => state = state.copyWith(people: const {});

  void clearTags() => state = state.copyWith()..tagIds = null;

  void removeChip(ChipId id) {
    switch (id) {
      case PersonChipId(:final personId):
        state = state.copyWith(people: state.people.where((p) => p.id != personId).toSet());
      case TagChipId(:final tagId):
        final next = List<String>.from(state.tagIds ?? const [])..remove(tagId);
        state = state.copyWith()..tagIds = next.isEmpty ? null : next;
      case SimpleChipId.location:
        setLocation(null);
      case SimpleChipId.camera:
        setCamera(null);
      case SimpleChipId.date:
        setDateRange(start: null, end: null);
      case SimpleChipId.rating:
        setRating(null);
      case SimpleChipId.mediaType:
        setMediaType(null);
      case SimpleChipId.favourite:
        setFavouritesOnly(false);
      case SimpleChipId.archive:
        setArchivedIncluded(false);
      case SimpleChipId.notInAlbum:
        setNotInAlbum(false);
      case SimpleChipId.untagged:
        setUntagged(false);
      case SimpleChipId.text:
        setText('');
    }
  }
}
