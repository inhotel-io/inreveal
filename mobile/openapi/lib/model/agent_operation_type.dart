//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class AgentOperationType {
  /// Instantiate a new enum with the provided [value].
  const AgentOperationType._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const create = AgentOperationType._(r'album.create');
  static const addAssets = AgentOperationType._(r'album.addAssets');
  static const updateDetails = AgentOperationType._(r'album.updateDetails');
  static const setCover = AgentOperationType._(r'album.setCover');

  /// List of all possible values in this [enum][AgentOperationType].
  static const values = <AgentOperationType>[
    create,
    addAssets,
    updateDetails,
    setCover,
  ];

  static AgentOperationType? fromJson(dynamic value) => AgentOperationTypeTypeTransformer().decode(value);

  static List<AgentOperationType> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentOperationType>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentOperationType.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentOperationType] to String,
/// and [decode] dynamic data back to [AgentOperationType].
class AgentOperationTypeTypeTransformer {
  factory AgentOperationTypeTypeTransformer() => _instance ??= const AgentOperationTypeTypeTransformer._();

  const AgentOperationTypeTypeTransformer._();

  String encode(AgentOperationType data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentOperationType.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentOperationType? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'album.create': return AgentOperationType.create;
        case r'album.addAssets': return AgentOperationType.addAssets;
        case r'album.updateDetails': return AgentOperationType.updateDetails;
        case r'album.setCover': return AgentOperationType.setCover;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentOperationTypeTypeTransformer] instance.
  static AgentOperationTypeTypeTransformer? _instance;
}

