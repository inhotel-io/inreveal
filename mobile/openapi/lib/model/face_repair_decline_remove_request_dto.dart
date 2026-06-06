//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FaceRepairDeclineRemoveRequestDto {
  /// Returns a new [FaceRepairDeclineRemoveRequestDto] instance.
  FaceRepairDeclineRemoveRequestDto({
    this.faces = const [],
    this.ids = const [],
  });

  List<FaceRepairDeclineRemoveRequestDtoFacesInner> faces;

  List<String> ids;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FaceRepairDeclineRemoveRequestDto &&
    _deepEquality.equals(other.faces, faces) &&
    _deepEquality.equals(other.ids, ids);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (faces.hashCode) +
    (ids.hashCode);

  @override
  String toString() => 'FaceRepairDeclineRemoveRequestDto[faces=$faces, ids=$ids]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'faces'] = this.faces;
      json[r'ids'] = this.ids;
    return json;
  }

  /// Returns a new [FaceRepairDeclineRemoveRequestDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FaceRepairDeclineRemoveRequestDto? fromJson(dynamic value) {
    upgradeDto(value, "FaceRepairDeclineRemoveRequestDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FaceRepairDeclineRemoveRequestDto(
        faces: FaceRepairDeclineRemoveRequestDtoFacesInner.listFromJson(json[r'faces']),
        ids: json[r'ids'] is Iterable
            ? (json[r'ids'] as Iterable).cast<String>().toList(growable: false)
            : const [],
      );
    }
    return null;
  }

  static List<FaceRepairDeclineRemoveRequestDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FaceRepairDeclineRemoveRequestDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FaceRepairDeclineRemoveRequestDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FaceRepairDeclineRemoveRequestDto> mapFromJson(dynamic json) {
    final map = <String, FaceRepairDeclineRemoveRequestDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FaceRepairDeclineRemoveRequestDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FaceRepairDeclineRemoveRequestDto-objects as value to a dart map
  static Map<String, List<FaceRepairDeclineRemoveRequestDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FaceRepairDeclineRemoveRequestDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FaceRepairDeclineRemoveRequestDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

