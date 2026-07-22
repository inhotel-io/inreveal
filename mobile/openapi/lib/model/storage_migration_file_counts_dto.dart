//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StorageMigrationFileCountsDto {
  /// Returns a new [StorageMigrationFileCountsDto] instance.
  StorageMigrationFileCountsDto({
    required this.encodedVideos,
    required this.fullsize,
    required this.originals,
    required this.personThumbnails,
    required this.previews,
    required this.profileImages,
    required this.sidecars,
    required this.thumbnails,
    required this.total,
  });

  /// Number of encoded video files
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int encodedVideos;

  /// Number of full-size files
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int fullsize;

  /// Number of original files
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int originals;

  /// Number of person thumbnail files
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int personThumbnails;

  /// Number of preview files
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int previews;

  /// Number of profile image files
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int profileImages;

  /// Number of sidecar files
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int sidecars;

  /// Number of thumbnail files
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int thumbnails;

  /// Total number of files
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int total;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StorageMigrationFileCountsDto &&
    other.encodedVideos == encodedVideos &&
    other.fullsize == fullsize &&
    other.originals == originals &&
    other.personThumbnails == personThumbnails &&
    other.previews == previews &&
    other.profileImages == profileImages &&
    other.sidecars == sidecars &&
    other.thumbnails == thumbnails &&
    other.total == total;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (encodedVideos.hashCode) +
    (fullsize.hashCode) +
    (originals.hashCode) +
    (personThumbnails.hashCode) +
    (previews.hashCode) +
    (profileImages.hashCode) +
    (sidecars.hashCode) +
    (thumbnails.hashCode) +
    (total.hashCode);

  @override
  String toString() => 'StorageMigrationFileCountsDto[encodedVideos=$encodedVideos, fullsize=$fullsize, originals=$originals, personThumbnails=$personThumbnails, previews=$previews, profileImages=$profileImages, sidecars=$sidecars, thumbnails=$thumbnails, total=$total]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'encodedVideos'] = this.encodedVideos;
      json[r'fullsize'] = this.fullsize;
      json[r'originals'] = this.originals;
      json[r'personThumbnails'] = this.personThumbnails;
      json[r'previews'] = this.previews;
      json[r'profileImages'] = this.profileImages;
      json[r'sidecars'] = this.sidecars;
      json[r'thumbnails'] = this.thumbnails;
      json[r'total'] = this.total;
    return json;
  }

  /// Returns a new [StorageMigrationFileCountsDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StorageMigrationFileCountsDto? fromJson(dynamic value) {
    upgradeDto(value, "StorageMigrationFileCountsDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return StorageMigrationFileCountsDto(
        encodedVideos: mapValueOfType<int>(json, r'encodedVideos')!,
        fullsize: mapValueOfType<int>(json, r'fullsize')!,
        originals: mapValueOfType<int>(json, r'originals')!,
        personThumbnails: mapValueOfType<int>(json, r'personThumbnails')!,
        previews: mapValueOfType<int>(json, r'previews')!,
        profileImages: mapValueOfType<int>(json, r'profileImages')!,
        sidecars: mapValueOfType<int>(json, r'sidecars')!,
        thumbnails: mapValueOfType<int>(json, r'thumbnails')!,
        total: mapValueOfType<int>(json, r'total')!,
      );
    }
    return null;
  }

  static List<StorageMigrationFileCountsDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StorageMigrationFileCountsDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StorageMigrationFileCountsDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StorageMigrationFileCountsDto> mapFromJson(dynamic json) {
    final map = <String, StorageMigrationFileCountsDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StorageMigrationFileCountsDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StorageMigrationFileCountsDto-objects as value to a dart map
  static Map<String, List<StorageMigrationFileCountsDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StorageMigrationFileCountsDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StorageMigrationFileCountsDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'encodedVideos',
    'fullsize',
    'originals',
    'personThumbnails',
    'previews',
    'profileImages',
    'sidecars',
    'thumbnails',
    'total',
  };
}

