//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FaceRepairScanTriggerRequestDtoParams {
  /// Returns a new [FaceRepairScanTriggerRequestDtoParams] instance.
  FaceRepairScanTriggerRequestDtoParams({
    this.largeClusterThreshold,
    this.maxAttributionDistance,
    this.maxDistance,
    this.maxFlaggedFraction,
    this.minFaces,
    this.voteMargin,
    this.voteWindow,
  });

  /// Minimum value: 1
  /// Maximum value: 9007199254740991
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? largeClusterThreshold;

  /// Maximum value: 2
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  num? maxAttributionDistance;

  /// Maximum value: 2
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  num? maxDistance;

  /// Minimum value: 0
  /// Maximum value: 1
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  num? maxFlaggedFraction;

  /// Minimum value: 1
  /// Maximum value: 9007199254740991
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? minFaces;

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? voteMargin;

  /// Minimum value: 1
  /// Maximum value: 9007199254740991
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? voteWindow;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FaceRepairScanTriggerRequestDtoParams &&
    other.largeClusterThreshold == largeClusterThreshold &&
    other.maxAttributionDistance == maxAttributionDistance &&
    other.maxDistance == maxDistance &&
    other.maxFlaggedFraction == maxFlaggedFraction &&
    other.minFaces == minFaces &&
    other.voteMargin == voteMargin &&
    other.voteWindow == voteWindow;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (largeClusterThreshold == null ? 0 : largeClusterThreshold!.hashCode) +
    (maxAttributionDistance == null ? 0 : maxAttributionDistance!.hashCode) +
    (maxDistance == null ? 0 : maxDistance!.hashCode) +
    (maxFlaggedFraction == null ? 0 : maxFlaggedFraction!.hashCode) +
    (minFaces == null ? 0 : minFaces!.hashCode) +
    (voteMargin == null ? 0 : voteMargin!.hashCode) +
    (voteWindow == null ? 0 : voteWindow!.hashCode);

  @override
  String toString() => 'FaceRepairScanTriggerRequestDtoParams[largeClusterThreshold=$largeClusterThreshold, maxAttributionDistance=$maxAttributionDistance, maxDistance=$maxDistance, maxFlaggedFraction=$maxFlaggedFraction, minFaces=$minFaces, voteMargin=$voteMargin, voteWindow=$voteWindow]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.largeClusterThreshold != null) {
      json[r'largeClusterThreshold'] = this.largeClusterThreshold;
    } else {
    //  json[r'largeClusterThreshold'] = null;
    }
    if (this.maxAttributionDistance != null) {
      json[r'maxAttributionDistance'] = this.maxAttributionDistance;
    } else {
    //  json[r'maxAttributionDistance'] = null;
    }
    if (this.maxDistance != null) {
      json[r'maxDistance'] = this.maxDistance;
    } else {
    //  json[r'maxDistance'] = null;
    }
    if (this.maxFlaggedFraction != null) {
      json[r'maxFlaggedFraction'] = this.maxFlaggedFraction;
    } else {
    //  json[r'maxFlaggedFraction'] = null;
    }
    if (this.minFaces != null) {
      json[r'minFaces'] = this.minFaces;
    } else {
    //  json[r'minFaces'] = null;
    }
    if (this.voteMargin != null) {
      json[r'voteMargin'] = this.voteMargin;
    } else {
    //  json[r'voteMargin'] = null;
    }
    if (this.voteWindow != null) {
      json[r'voteWindow'] = this.voteWindow;
    } else {
    //  json[r'voteWindow'] = null;
    }
    return json;
  }

  /// Returns a new [FaceRepairScanTriggerRequestDtoParams] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FaceRepairScanTriggerRequestDtoParams? fromJson(dynamic value) {
    upgradeDto(value, "FaceRepairScanTriggerRequestDtoParams");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FaceRepairScanTriggerRequestDtoParams(
        largeClusterThreshold: mapValueOfType<int>(json, r'largeClusterThreshold'),
        maxAttributionDistance: json[r'maxAttributionDistance'] == null
            ? null
            : num.parse('${json[r'maxAttributionDistance']}'),
        maxDistance: json[r'maxDistance'] == null
            ? null
            : num.parse('${json[r'maxDistance']}'),
        maxFlaggedFraction: json[r'maxFlaggedFraction'] == null
            ? null
            : num.parse('${json[r'maxFlaggedFraction']}'),
        minFaces: mapValueOfType<int>(json, r'minFaces'),
        voteMargin: mapValueOfType<int>(json, r'voteMargin'),
        voteWindow: mapValueOfType<int>(json, r'voteWindow'),
      );
    }
    return null;
  }

  static List<FaceRepairScanTriggerRequestDtoParams> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FaceRepairScanTriggerRequestDtoParams>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FaceRepairScanTriggerRequestDtoParams.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FaceRepairScanTriggerRequestDtoParams> mapFromJson(dynamic json) {
    final map = <String, FaceRepairScanTriggerRequestDtoParams>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FaceRepairScanTriggerRequestDtoParams.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FaceRepairScanTriggerRequestDtoParams-objects as value to a dart map
  static Map<String, List<FaceRepairScanTriggerRequestDtoParams>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FaceRepairScanTriggerRequestDtoParams>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FaceRepairScanTriggerRequestDtoParams.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

