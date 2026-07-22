//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StorageMigrationStartResponseDto {
  /// Returns a new [StorageMigrationStartResponseDto] instance.
  StorageMigrationStartResponseDto({
    required this.batchId,
  });

  /// Batch ID of the started migration, used to roll it back
  String batchId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StorageMigrationStartResponseDto &&
    other.batchId == batchId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (batchId.hashCode);

  @override
  String toString() => 'StorageMigrationStartResponseDto[batchId=$batchId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'batchId'] = this.batchId;
    return json;
  }

  /// Returns a new [StorageMigrationStartResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StorageMigrationStartResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "StorageMigrationStartResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return StorageMigrationStartResponseDto(
        batchId: mapValueOfType<String>(json, r'batchId')!,
      );
    }
    return null;
  }

  static List<StorageMigrationStartResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StorageMigrationStartResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StorageMigrationStartResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StorageMigrationStartResponseDto> mapFromJson(dynamic json) {
    final map = <String, StorageMigrationStartResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StorageMigrationStartResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StorageMigrationStartResponseDto-objects as value to a dart map
  static Map<String, List<StorageMigrationStartResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StorageMigrationStartResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StorageMigrationStartResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'batchId',
  };
}

