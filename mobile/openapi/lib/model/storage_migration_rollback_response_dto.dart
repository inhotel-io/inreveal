//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class StorageMigrationRollbackResponseDto {
  /// Returns a new [StorageMigrationRollbackResponseDto] instance.
  StorageMigrationRollbackResponseDto({
    required this.failed,
    required this.rolledBack,
    required this.total,
  });

  /// Number of entries that could not be rolled back
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int failed;

  /// Number of entries that were rolled back
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int rolledBack;

  /// Total number of entries in the batch
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int total;

  @override
  bool operator ==(Object other) => identical(this, other) || other is StorageMigrationRollbackResponseDto &&
    other.failed == failed &&
    other.rolledBack == rolledBack &&
    other.total == total;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (failed.hashCode) +
    (rolledBack.hashCode) +
    (total.hashCode);

  @override
  String toString() => 'StorageMigrationRollbackResponseDto[failed=$failed, rolledBack=$rolledBack, total=$total]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'failed'] = this.failed;
      json[r'rolledBack'] = this.rolledBack;
      json[r'total'] = this.total;
    return json;
  }

  /// Returns a new [StorageMigrationRollbackResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static StorageMigrationRollbackResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "StorageMigrationRollbackResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return StorageMigrationRollbackResponseDto(
        failed: mapValueOfType<int>(json, r'failed')!,
        rolledBack: mapValueOfType<int>(json, r'rolledBack')!,
        total: mapValueOfType<int>(json, r'total')!,
      );
    }
    return null;
  }

  static List<StorageMigrationRollbackResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <StorageMigrationRollbackResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = StorageMigrationRollbackResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, StorageMigrationRollbackResponseDto> mapFromJson(dynamic json) {
    final map = <String, StorageMigrationRollbackResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = StorageMigrationRollbackResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of StorageMigrationRollbackResponseDto-objects as value to a dart map
  static Map<String, List<StorageMigrationRollbackResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<StorageMigrationRollbackResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = StorageMigrationRollbackResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'failed',
    'rolledBack',
    'total',
  };
}

