//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class SystemConfigImagePresetDto {
  /// Returns a new [SystemConfigImagePresetDto] instance.
  SystemConfigImagePresetDto({
    required this.aspectRatio,
    this.format = const Optional.absent(),
    this.position = const Optional.absent(),
    this.quality = const Optional.present(80),
    this.widths = const [],
  });

  /// Aspect ratio as W:H, e.g. \"16:9\" or \"1:1\". The output height is derived from it.
  String aspectRatio;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  Optional<ImageFormat?> format;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  Optional<ImagePresetPosition?> position;

  /// Quality
  ///
  /// Minimum value: 1
  /// Maximum value: 100
  Optional<int?> quality;

  /// Output widths (px) a client may request for this preset
  List<int> widths;

  @override
  bool operator ==(Object other) => identical(this, other) || other is SystemConfigImagePresetDto &&
    other.aspectRatio == aspectRatio &&
    other.format == format &&
    other.position == position &&
    other.quality == quality &&
    _deepEquality.equals(other.widths, widths);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (aspectRatio.hashCode) +
    (format == null ? 0 : format!.hashCode) +
    (position == null ? 0 : position!.hashCode) +
    (quality.hashCode) +
    (widths.hashCode);

  @override
  String toString() => 'SystemConfigImagePresetDto[aspectRatio=$aspectRatio, format=$format, position=$position, quality=$quality, widths=$widths]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'aspectRatio'] = this.aspectRatio;
    if (this.format.isPresent) {
      final value = this.format.value;
      json[r'format'] = value;
    }
    if (this.position.isPresent) {
      final value = this.position.value;
      json[r'position'] = value;
    }
    if (this.quality.isPresent) {
      final value = this.quality.value;
      json[r'quality'] = value;
    }
      json[r'widths'] = this.widths;
    return json;
  }

  /// Returns a new [SystemConfigImagePresetDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static SystemConfigImagePresetDto? fromJson(dynamic value) {
    upgradeDto(value, "SystemConfigImagePresetDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return SystemConfigImagePresetDto(
        aspectRatio: mapValueOfType<String>(json, r'aspectRatio')!,
        format: json.containsKey(r'format') ? Optional.present(ImageFormat.fromJson(json[r'format'])) : const Optional.absent(),
        position: json.containsKey(r'position') ? Optional.present(ImagePresetPosition.fromJson(json[r'position'])) : const Optional.absent(),
        quality: json.containsKey(r'quality') ? Optional.present(json[r'quality'] == null ? null : int.parse('${json[r'quality']}')) : const Optional.absent(),
        widths: json[r'widths'] is Iterable
            ? (json[r'widths'] as Iterable).cast<int>().toList(growable: false)
            : const [],
      );
    }
    return null;
  }

  static List<SystemConfigImagePresetDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <SystemConfigImagePresetDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SystemConfigImagePresetDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, SystemConfigImagePresetDto> mapFromJson(dynamic json) {
    final map = <String, SystemConfigImagePresetDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = SystemConfigImagePresetDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of SystemConfigImagePresetDto-objects as value to a dart map
  static Map<String, List<SystemConfigImagePresetDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<SystemConfigImagePresetDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = SystemConfigImagePresetDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'aspectRatio',
    'widths',
  };
}

