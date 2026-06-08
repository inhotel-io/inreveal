//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload {
  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload] instance.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload({
    this.brightness,
    this.contrast,
    this.saturation,
    this.autoEnhance,
  });

  AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum? brightness;

  AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum? contrast;

  AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum? saturation;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  bool? autoEnhance;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload &&
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
  String toString() => 'AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload[brightness=$brightness, contrast=$contrast, saturation=$saturation, autoEnhance=$autoEnhance]';

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

  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload? fromJson(dynamic value) {
    upgradeDto(value, "AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload(
        brightness: AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum.fromJson(json[r'brightness']),
        contrast: AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum.fromJson(json[r'contrast']),
        saturation: AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum.fromJson(json[r'saturation']),
        autoEnhance: mapValueOfType<bool>(json, r'autoEnhance'),
      );
    }
    return null;
  }

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload> mapFromJson(dynamic json) {
    final map = <String, AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload-objects as value to a dart map
  static Map<String, List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17Payload.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}


class AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const strongDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum._(r'strong_decrease');
  static const moderateDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum._(r'moderate_decrease');
  static const slightDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum._(r'slight_decrease');
  static const slightIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum._(r'slight_increase');
  static const moderateIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum._(r'moderate_increase');
  static const strongIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum._(r'strong_increase');

  /// List of all possible values in this [enum][AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum].
  static const values = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum>[
    strongDecrease,
    moderateDecrease,
    slightDecrease,
    slightIncrease,
    moderateIncrease,
    strongIncrease,
  ];

  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum? fromJson(dynamic value) => AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnumTypeTransformer().decode(value);

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum] to String,
/// and [decode] dynamic data back to [AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum].
class AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnumTypeTransformer {
  factory AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnumTypeTransformer() => _instance ??= const AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnumTypeTransformer._();

  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnumTypeTransformer._();

  String encode(AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'strong_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum.strongDecrease;
        case r'moderate_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum.moderateDecrease;
        case r'slight_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum.slightDecrease;
        case r'slight_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum.slightIncrease;
        case r'moderate_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum.moderateIncrease;
        case r'strong_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnum.strongIncrease;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnumTypeTransformer] instance.
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadBrightnessEnumTypeTransformer? _instance;
}



class AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const strongDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum._(r'strong_decrease');
  static const moderateDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum._(r'moderate_decrease');
  static const slightDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum._(r'slight_decrease');
  static const slightIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum._(r'slight_increase');
  static const moderateIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum._(r'moderate_increase');
  static const strongIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum._(r'strong_increase');

  /// List of all possible values in this [enum][AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum].
  static const values = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum>[
    strongDecrease,
    moderateDecrease,
    slightDecrease,
    slightIncrease,
    moderateIncrease,
    strongIncrease,
  ];

  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum? fromJson(dynamic value) => AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnumTypeTransformer().decode(value);

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum] to String,
/// and [decode] dynamic data back to [AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum].
class AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnumTypeTransformer {
  factory AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnumTypeTransformer() => _instance ??= const AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnumTypeTransformer._();

  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnumTypeTransformer._();

  String encode(AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'strong_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum.strongDecrease;
        case r'moderate_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum.moderateDecrease;
        case r'slight_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum.slightDecrease;
        case r'slight_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum.slightIncrease;
        case r'moderate_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum.moderateIncrease;
        case r'strong_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnum.strongIncrease;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnumTypeTransformer] instance.
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadContrastEnumTypeTransformer? _instance;
}



class AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const strongDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum._(r'strong_decrease');
  static const moderateDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum._(r'moderate_decrease');
  static const slightDecrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum._(r'slight_decrease');
  static const slightIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum._(r'slight_increase');
  static const moderateIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum._(r'moderate_increase');
  static const strongIncrease = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum._(r'strong_increase');

  /// List of all possible values in this [enum][AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum].
  static const values = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum>[
    strongDecrease,
    moderateDecrease,
    slightDecrease,
    slightIncrease,
    moderateIncrease,
    strongIncrease,
  ];

  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum? fromJson(dynamic value) => AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnumTypeTransformer().decode(value);

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum] to String,
/// and [decode] dynamic data back to [AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum].
class AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnumTypeTransformer {
  factory AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnumTypeTransformer() => _instance ??= const AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnumTypeTransformer._();

  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnumTypeTransformer._();

  String encode(AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'strong_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum.strongDecrease;
        case r'moderate_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum.moderateDecrease;
        case r'slight_decrease': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum.slightDecrease;
        case r'slight_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum.slightIncrease;
        case r'moderate_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum.moderateIncrease;
        case r'strong_increase': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnum.strongIncrease;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnumTypeTransformer] instance.
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf17PayloadSaturationEnumTypeTransformer? _instance;
}


