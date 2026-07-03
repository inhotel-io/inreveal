//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FaceRepairApplyRequestDto {
  /// Returns a new [FaceRepairApplyRequestDto] instance.
  FaceRepairApplyRequestDto({
    this.approvedPersonIds = const [],
    this.excludeFaceIds = const [],
    this.manualMove,
  });

  List<String> approvedPersonIds;

  List<String> excludeFaceIds;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  FaceRepairApplyRequestDtoManualMove? manualMove;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FaceRepairApplyRequestDto &&
    _deepEquality.equals(other.approvedPersonIds, approvedPersonIds) &&
    _deepEquality.equals(other.excludeFaceIds, excludeFaceIds) &&
    other.manualMove == manualMove;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (approvedPersonIds.hashCode) +
    (excludeFaceIds.hashCode) +
    (manualMove == null ? 0 : manualMove!.hashCode);

  @override
  String toString() => 'FaceRepairApplyRequestDto[approvedPersonIds=$approvedPersonIds, excludeFaceIds=$excludeFaceIds, manualMove=$manualMove]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'approvedPersonIds'] = this.approvedPersonIds;
      json[r'excludeFaceIds'] = this.excludeFaceIds;
    if (this.manualMove != null) {
      json[r'manualMove'] = this.manualMove;
    } else {
    //  json[r'manualMove'] = null;
    }
    return json;
  }

  /// Returns a new [FaceRepairApplyRequestDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FaceRepairApplyRequestDto? fromJson(dynamic value) {
    upgradeDto(value, "FaceRepairApplyRequestDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FaceRepairApplyRequestDto(
        approvedPersonIds: json[r'approvedPersonIds'] is Iterable
            ? (json[r'approvedPersonIds'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        excludeFaceIds: json[r'excludeFaceIds'] is Iterable
            ? (json[r'excludeFaceIds'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        manualMove: FaceRepairApplyRequestDtoManualMove.fromJson(json[r'manualMove']),
      );
    }
    return null;
  }

  static List<FaceRepairApplyRequestDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FaceRepairApplyRequestDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FaceRepairApplyRequestDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FaceRepairApplyRequestDto> mapFromJson(dynamic json) {
    final map = <String, FaceRepairApplyRequestDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FaceRepairApplyRequestDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FaceRepairApplyRequestDto-objects as value to a dart map
  static Map<String, List<FaceRepairApplyRequestDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FaceRepairApplyRequestDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FaceRepairApplyRequestDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

