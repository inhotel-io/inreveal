//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FaceRepairApplyResponseDto {
  /// Returns a new [FaceRepairApplyResponseDto] instance.
  FaceRepairApplyResponseDto({
    required this.requeued,
    required this.unassigned,
  });

  num requeued;

  num unassigned;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FaceRepairApplyResponseDto &&
    other.requeued == requeued &&
    other.unassigned == unassigned;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (requeued.hashCode) +
    (unassigned.hashCode);

  @override
  String toString() => 'FaceRepairApplyResponseDto[requeued=$requeued, unassigned=$unassigned]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'requeued'] = this.requeued;
      json[r'unassigned'] = this.unassigned;
    return json;
  }

  /// Returns a new [FaceRepairApplyResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FaceRepairApplyResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "FaceRepairApplyResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FaceRepairApplyResponseDto(
        requeued: num.parse('${json[r'requeued']}'),
        unassigned: num.parse('${json[r'unassigned']}'),
      );
    }
    return null;
  }

  static List<FaceRepairApplyResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FaceRepairApplyResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FaceRepairApplyResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FaceRepairApplyResponseDto> mapFromJson(dynamic json) {
    final map = <String, FaceRepairApplyResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FaceRepairApplyResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FaceRepairApplyResponseDto-objects as value to a dart map
  static Map<String, List<FaceRepairApplyResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FaceRepairApplyResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FaceRepairApplyResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'requeued',
    'unassigned',
  };
}

