//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AdjustParameters {
  /// Returns a new [AdjustParameters] instance.
  AdjustParameters({
    this.autoEnhance,
    this.brightness,
    this.contrast,
    this.saturation,
  });

  /// Auto-enhance (contrast stretch)
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  bool? autoEnhance;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  TonalLevel? brightness;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  TonalLevel? contrast;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  TonalLevel? saturation;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AdjustParameters &&
    other.autoEnhance == autoEnhance &&
    other.brightness == brightness &&
    other.contrast == contrast &&
    other.saturation == saturation;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (autoEnhance == null ? 0 : autoEnhance!.hashCode) +
    (brightness == null ? 0 : brightness!.hashCode) +
    (contrast == null ? 0 : contrast!.hashCode) +
    (saturation == null ? 0 : saturation!.hashCode);

  @override
  String toString() => 'AdjustParameters[autoEnhance=$autoEnhance, brightness=$brightness, contrast=$contrast, saturation=$saturation]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.autoEnhance != null) {
      json[r'autoEnhance'] = this.autoEnhance;
    } else {
    //  json[r'autoEnhance'] = null;
    }
    if (this.brightness != null) {
      json[r'brightness'] = this.brightness;
    } else {
    //  json[r'brightness'] = null;
    }
    if (this.contrast != null) {
      json[r'contrast'] = this.contrast;
    } else {
    //  json[r'contrast'] = null;
    }
    if (this.saturation != null) {
      json[r'saturation'] = this.saturation;
    } else {
    //  json[r'saturation'] = null;
    }
    return json;
  }

  /// Returns a new [AdjustParameters] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AdjustParameters? fromJson(dynamic value) {
    upgradeDto(value, "AdjustParameters");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AdjustParameters(
        autoEnhance: mapValueOfType<bool>(json, r'autoEnhance'),
        brightness: TonalLevel.fromJson(json[r'brightness']),
        contrast: TonalLevel.fromJson(json[r'contrast']),
        saturation: TonalLevel.fromJson(json[r'saturation']),
      );
    }
    return null;
  }

  static List<AdjustParameters> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AdjustParameters>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AdjustParameters.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AdjustParameters> mapFromJson(dynamic json) {
    final map = <String, AdjustParameters>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AdjustParameters.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AdjustParameters-objects as value to a dart map
  static Map<String, List<AdjustParameters>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AdjustParameters>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AdjustParameters.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

