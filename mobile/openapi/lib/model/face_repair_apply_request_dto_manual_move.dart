//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FaceRepairApplyRequestDtoManualMove {
  /// Returns a new [FaceRepairApplyRequestDtoManualMove] instance.
  FaceRepairApplyRequestDtoManualMove({
    required this.destinationPersonId,
    this.entireCluster = const Optional.absent(),
    this.faceIds = const Optional.present(const []),
    required this.personId,
  });

  String destinationPersonId;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  Optional<bool?> entireCluster;

  Optional<List<String>?> faceIds;

  String personId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FaceRepairApplyRequestDtoManualMove &&
    other.destinationPersonId == destinationPersonId &&
    other.entireCluster == entireCluster &&
    _deepEquality.equals(other.faceIds, faceIds) &&
    other.personId == personId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (destinationPersonId.hashCode) +
    (entireCluster == null ? 0 : entireCluster!.hashCode) +
    (faceIds.hashCode) +
    (personId.hashCode);

  @override
  String toString() => 'FaceRepairApplyRequestDtoManualMove[destinationPersonId=$destinationPersonId, entireCluster=$entireCluster, faceIds=$faceIds, personId=$personId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'destinationPersonId'] = this.destinationPersonId;
    if (this.entireCluster.isPresent) {
      final value = this.entireCluster.value;
      json[r'entireCluster'] = value;
    }
    if (this.faceIds.isPresent) {
      final value = this.faceIds.value;
      json[r'faceIds'] = value;
    }
      json[r'personId'] = this.personId;
    return json;
  }

  /// Returns a new [FaceRepairApplyRequestDtoManualMove] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FaceRepairApplyRequestDtoManualMove? fromJson(dynamic value) {
    upgradeDto(value, "FaceRepairApplyRequestDtoManualMove");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FaceRepairApplyRequestDtoManualMove(
        destinationPersonId: mapValueOfType<String>(json, r'destinationPersonId')!,
        entireCluster: json.containsKey(r'entireCluster') ? Optional.present(mapValueOfType<bool>(json, r'entireCluster')) : const Optional.absent(),
        faceIds: json.containsKey(r'faceIds') ? Optional.present(json[r'faceIds'] is Iterable
            ? (json[r'faceIds'] as Iterable).cast<String>().toList(growable: false)
            : const []) : const Optional.absent(),
        personId: mapValueOfType<String>(json, r'personId')!,
      );
    }
    return null;
  }

  static List<FaceRepairApplyRequestDtoManualMove> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FaceRepairApplyRequestDtoManualMove>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FaceRepairApplyRequestDtoManualMove.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FaceRepairApplyRequestDtoManualMove> mapFromJson(dynamic json) {
    final map = <String, FaceRepairApplyRequestDtoManualMove>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FaceRepairApplyRequestDtoManualMove.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FaceRepairApplyRequestDtoManualMove-objects as value to a dart map
  static Map<String, List<FaceRepairApplyRequestDtoManualMove>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FaceRepairApplyRequestDtoManualMove>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FaceRepairApplyRequestDtoManualMove.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'destinationPersonId',
    'personId',
  };
}

