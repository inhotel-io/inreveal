//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StorageMigrationEstimateResponseDto {
  /// Returns a new [StorageMigrationEstimateResponseDto] instance.
  StorageMigrationEstimateResponseDto({
    required this.direction,
    required this.estimatedSizeBytes,
    required this.fileCounts,
  });

  StorageMigrationDirection direction;

  /// Approximate size of the original files that would be migrated, in bytes
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int estimatedSizeBytes;

  StorageMigrationFileCountsDto fileCounts;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StorageMigrationEstimateResponseDto &&
    other.direction == direction &&
    other.estimatedSizeBytes == estimatedSizeBytes &&
    other.fileCounts == fileCounts;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (direction.hashCode) +
    (estimatedSizeBytes.hashCode) +
    (fileCounts.hashCode);

  @override
  String toString() => 'StorageMigrationEstimateResponseDto[direction=$direction, estimatedSizeBytes=$estimatedSizeBytes, fileCounts=$fileCounts]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'direction'] = this.direction;
      json[r'estimatedSizeBytes'] = this.estimatedSizeBytes;
      json[r'fileCounts'] = this.fileCounts;
    return json;
  }

  /// Returns a new [StorageMigrationEstimateResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StorageMigrationEstimateResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "StorageMigrationEstimateResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return StorageMigrationEstimateResponseDto(
        direction: StorageMigrationDirection.fromJson(json[r'direction'])!,
        estimatedSizeBytes: mapValueOfType<int>(json, r'estimatedSizeBytes')!,
        fileCounts: StorageMigrationFileCountsDto.fromJson(json[r'fileCounts'])!,
      );
    }
    return null;
  }

  static List<StorageMigrationEstimateResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StorageMigrationEstimateResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StorageMigrationEstimateResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StorageMigrationEstimateResponseDto> mapFromJson(dynamic json) {
    final map = <String, StorageMigrationEstimateResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StorageMigrationEstimateResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StorageMigrationEstimateResponseDto-objects as value to a dart map
  static Map<String, List<StorageMigrationEstimateResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StorageMigrationEstimateResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StorageMigrationEstimateResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'direction',
    'estimatedSizeBytes',
    'fileCounts',
  };
}

