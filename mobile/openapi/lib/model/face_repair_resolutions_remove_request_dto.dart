//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FaceRepairResolutionsRemoveRequestDto {
  /// Returns a new [FaceRepairResolutionsRemoveRequestDto] instance.
  FaceRepairResolutionsRemoveRequestDto({
    this.declineIds = const Optional.present(const []),
    this.faces = const Optional.present(const []),
    this.lockIds = const Optional.present(const []),
  });

  Optional<List<String>?> declineIds;

  Optional<List<FaceRepairDeclineRemoveRequestDtoFacesInner>?> faces;

  Optional<List<String>?> lockIds;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FaceRepairResolutionsRemoveRequestDto &&
    _deepEquality.equals(other.declineIds, declineIds) &&
    _deepEquality.equals(other.faces, faces) &&
    _deepEquality.equals(other.lockIds, lockIds);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (declineIds.hashCode) +
    (faces.hashCode) +
    (lockIds.hashCode);

  @override
  String toString() => 'FaceRepairResolutionsRemoveRequestDto[declineIds=$declineIds, faces=$faces, lockIds=$lockIds]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.declineIds.isPresent) {
      final value = this.declineIds.value;
      json[r'declineIds'] = value;
    }
    if (this.faces.isPresent) {
      final value = this.faces.value;
      json[r'faces'] = value;
    }
    if (this.lockIds.isPresent) {
      final value = this.lockIds.value;
      json[r'lockIds'] = value;
    }
    return json;
  }

  /// Returns a new [FaceRepairResolutionsRemoveRequestDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FaceRepairResolutionsRemoveRequestDto? fromJson(dynamic value) {
    upgradeDto(value, "FaceRepairResolutionsRemoveRequestDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FaceRepairResolutionsRemoveRequestDto(
        declineIds: json.containsKey(r'declineIds') ? Optional.present(json[r'declineIds'] is Iterable
            ? (json[r'declineIds'] as Iterable).cast<String>().toList(growable: false)
            : const []) : const Optional.absent(),
        faces: json.containsKey(r'faces') ? Optional.present(FaceRepairDeclineRemoveRequestDtoFacesInner.listFromJson(json[r'faces'])) : const Optional.absent(),
        lockIds: json.containsKey(r'lockIds') ? Optional.present(json[r'lockIds'] is Iterable
            ? (json[r'lockIds'] as Iterable).cast<String>().toList(growable: false)
            : const []) : const Optional.absent(),
      );
    }
    return null;
  }

  static List<FaceRepairResolutionsRemoveRequestDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FaceRepairResolutionsRemoveRequestDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FaceRepairResolutionsRemoveRequestDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FaceRepairResolutionsRemoveRequestDto> mapFromJson(dynamic json) {
    final map = <String, FaceRepairResolutionsRemoveRequestDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FaceRepairResolutionsRemoveRequestDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FaceRepairResolutionsRemoveRequestDto-objects as value to a dart map
  static Map<String, List<FaceRepairResolutionsRemoveRequestDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FaceRepairResolutionsRemoveRequestDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FaceRepairResolutionsRemoveRequestDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

