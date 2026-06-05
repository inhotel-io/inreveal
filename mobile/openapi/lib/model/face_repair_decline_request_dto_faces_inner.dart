//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FaceRepairDeclineRequestDtoFacesInner {
  /// Returns a new [FaceRepairDeclineRequestDtoFacesInner] instance.
  FaceRepairDeclineRequestDtoFacesInner({
    required this.assetFaceId,
    required this.suspectedOwnerId,
  });

  String assetFaceId;

  String suspectedOwnerId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FaceRepairDeclineRequestDtoFacesInner &&
    other.assetFaceId == assetFaceId &&
    other.suspectedOwnerId == suspectedOwnerId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (assetFaceId.hashCode) +
    (suspectedOwnerId.hashCode);

  @override
  String toString() => 'FaceRepairDeclineRequestDtoFacesInner[assetFaceId=$assetFaceId, suspectedOwnerId=$suspectedOwnerId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'assetFaceId'] = this.assetFaceId;
      json[r'suspectedOwnerId'] = this.suspectedOwnerId;
    return json;
  }

  /// Returns a new [FaceRepairDeclineRequestDtoFacesInner] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FaceRepairDeclineRequestDtoFacesInner? fromJson(dynamic value) {
    upgradeDto(value, "FaceRepairDeclineRequestDtoFacesInner");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FaceRepairDeclineRequestDtoFacesInner(
        assetFaceId: mapValueOfType<String>(json, r'assetFaceId')!,
        suspectedOwnerId: mapValueOfType<String>(json, r'suspectedOwnerId')!,
      );
    }
    return null;
  }

  static List<FaceRepairDeclineRequestDtoFacesInner> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FaceRepairDeclineRequestDtoFacesInner>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FaceRepairDeclineRequestDtoFacesInner.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FaceRepairDeclineRequestDtoFacesInner> mapFromJson(dynamic json) {
    final map = <String, FaceRepairDeclineRequestDtoFacesInner>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FaceRepairDeclineRequestDtoFacesInner.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FaceRepairDeclineRequestDtoFacesInner-objects as value to a dart map
  static Map<String, List<FaceRepairDeclineRequestDtoFacesInner>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FaceRepairDeclineRequestDtoFacesInner>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FaceRepairDeclineRequestDtoFacesInner.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'assetFaceId',
    'suspectedOwnerId',
  };
}

