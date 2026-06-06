//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload {
  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload] instance.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload({
    this.brightness,
    this.contrast,
    this.saturation,
    this.autoEnhance,
  });

  AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum? brightness;

  AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum? contrast;

  AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum? saturation;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  bool? autoEnhance;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload &&
    other.brightness == brightness &&
    other.contrast == contrast &&
    other.saturation == saturation &&
    other.autoEnhance == autoEnhance;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (brightness == null ? 0 : brightness!.hashCode) +
    (contrast == null ? 0 : contrast!.hashCode) +
    (saturation == null ? 0 : saturation!.hashCode) +
    (autoEnhance == null ? 0 : autoEnhance!.hashCode);

  @override
  String toString() => 'AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload[brightness=$brightness, contrast=$contrast, saturation=$saturation, autoEnhance=$autoEnhance]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
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
    if (this.autoEnhance != null) {
      json[r'autoEnhance'] = this.autoEnhance;
    } else {
    //  json[r'autoEnhance'] = null;
    }
    return json;
  }

  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload? fromJson(dynamic value) {
    upgradeDto(value, "AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload(
        brightness: AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum.fromJson(json[r'brightness']),
        contrast: AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum.fromJson(json[r'contrast']),
        saturation: AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum.fromJson(json[r'saturation']),
        autoEnhance: mapValueOfType<bool>(json, r'autoEnhance'),
      );
    }
    return null;
  }

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload> mapFromJson(dynamic json) {
    final map = <String, AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload-objects as value to a dart map
  static Map<String, List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14Payload.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}


class AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const strongDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum._(r'strong_decrease');
  static const moderateDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum._(r'moderate_decrease');
  static const slightDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum._(r'slight_decrease');
  static const slightIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum._(r'slight_increase');
  static const moderateIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum._(r'moderate_increase');
  static const strongIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum._(r'strong_increase');

  /// List of all possible values in this [enum][AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum].
  static const values = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum>[
    strongDecrease,
    moderateDecrease,
    slightDecrease,
    slightIncrease,
    moderateIncrease,
    strongIncrease,
  ];

  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum? fromJson(dynamic value) => AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnumTypeTransformer().decode(value);

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum] to String,
/// and [decode] dynamic data back to [AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum].
class AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnumTypeTransformer {
  factory AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnumTypeTransformer() => _instance ??= const AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnumTypeTransformer._();

  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnumTypeTransformer._();

  String encode(AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'strong_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum.strongDecrease;
        case r'moderate_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum.moderateDecrease;
        case r'slight_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum.slightDecrease;
        case r'slight_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum.slightIncrease;
        case r'moderate_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum.moderateIncrease;
        case r'strong_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnum.strongIncrease;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnumTypeTransformer] instance.
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadBrightnessEnumTypeTransformer? _instance;
}



class AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const strongDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum._(r'strong_decrease');
  static const moderateDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum._(r'moderate_decrease');
  static const slightDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum._(r'slight_decrease');
  static const slightIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum._(r'slight_increase');
  static const moderateIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum._(r'moderate_increase');
  static const strongIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum._(r'strong_increase');

  /// List of all possible values in this [enum][AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum].
  static const values = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum>[
    strongDecrease,
    moderateDecrease,
    slightDecrease,
    slightIncrease,
    moderateIncrease,
    strongIncrease,
  ];

  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum? fromJson(dynamic value) => AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnumTypeTransformer().decode(value);

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum] to String,
/// and [decode] dynamic data back to [AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum].
class AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnumTypeTransformer {
  factory AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnumTypeTransformer() => _instance ??= const AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnumTypeTransformer._();

  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnumTypeTransformer._();

  String encode(AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'strong_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum.strongDecrease;
        case r'moderate_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum.moderateDecrease;
        case r'slight_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum.slightDecrease;
        case r'slight_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum.slightIncrease;
        case r'moderate_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum.moderateIncrease;
        case r'strong_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnum.strongIncrease;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnumTypeTransformer] instance.
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadContrastEnumTypeTransformer? _instance;
}



class AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const strongDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum._(r'strong_decrease');
  static const moderateDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum._(r'moderate_decrease');
  static const slightDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum._(r'slight_decrease');
  static const slightIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum._(r'slight_increase');
  static const moderateIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum._(r'moderate_increase');
  static const strongIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum._(r'strong_increase');

  /// List of all possible values in this [enum][AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum].
  static const values = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum>[
    strongDecrease,
    moderateDecrease,
    slightDecrease,
    slightIncrease,
    moderateIncrease,
    strongIncrease,
  ];

  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum? fromJson(dynamic value) => AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnumTypeTransformer().decode(value);

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum] to String,
/// and [decode] dynamic data back to [AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum].
class AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnumTypeTransformer {
  factory AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnumTypeTransformer() => _instance ??= const AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnumTypeTransformer._();

  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnumTypeTransformer._();

  String encode(AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'strong_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum.strongDecrease;
        case r'moderate_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum.moderateDecrease;
        case r'slight_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum.slightDecrease;
        case r'slight_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum.slightIncrease;
        case r'moderate_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum.moderateIncrease;
        case r'strong_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnum.strongIncrease;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnumTypeTransformer] instance.
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf14PayloadSaturationEnumTypeTransformer? _instance;
}


