//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload {
  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload] instance.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload({
    required this.angle,
  });

  AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum angle;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload &&
    other.angle == angle;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (angle.hashCode);

  @override
  String toString() => 'AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload[angle=$angle]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'angle'] = this.angle;
    return json;
  }

  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload? fromJson(dynamic value) {
    upgradeDto(value, "AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload(
        angle: AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum.parse('${json[r'angle']}'),
      );
    }
    return null;
  }

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload> mapFromJson(dynamic json) {
    final map = <String, AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload-objects as value to a dart map
  static Map<String, List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentProposeAlbumOperationsDtoOperationsInnerOneOf9Payload.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'angle',
  };
}


class AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum._(this.value);

  /// The underlying value of this enum member.
  final num value;

  @override
  String toString() => value.toString();

  num toJson() => value;

  static const n90 = AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum._('90');
  static const n180 = AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum._('180');
  static const n270 = AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum._('270');

  /// List of all possible values in this [enum][AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum].
  static const values = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum>[
    n90,
    n180,
    n270,
  ];

  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum? fromJson(dynamic value) => AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnumTypeTransformer().decode(value);

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum] to num,
/// and [decode] dynamic data back to [AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum].
class AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnumTypeTransformer {
  factory AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnumTypeTransformer() => _instance ??= const AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnumTypeTransformer._();

  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnumTypeTransformer._();

  num encode(AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case '90': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum.n90;
        case '180': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum.n180;
        case '270': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnum.n270;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnumTypeTransformer] instance.
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf9PayloadAngleEnumTypeTransformer? _instance;
}


