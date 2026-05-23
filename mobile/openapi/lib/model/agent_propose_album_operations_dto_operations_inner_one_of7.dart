//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentProposeAlbumOperationsDtoOperationsInnerOneOf7 {
  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInnerOneOf7] instance.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf7({
    required this.type,
    required this.summary,
    required this.targetKind,
    this.targetId,
    this.temporaryTargetId,
    this.assetSource,
    this.assetIds = const [],
    this.assetSelectionHandleId,
    this.riskLevel,
    this.enabled = true,
    this.payload,
  });

  AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum type;

  String summary;

  AgentOperationTargetKind targetKind;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? targetId;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? temporaryTargetId;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AgentOperationPlanningAssetSourceInput? assetSource;

  List<String> assetIds;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? assetSelectionHandleId;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AgentOperationRiskLevel? riskLevel;

  bool enabled;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  Object? payload;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentProposeAlbumOperationsDtoOperationsInnerOneOf7 &&
    other.type == type &&
    other.summary == summary &&
    other.targetKind == targetKind &&
    other.targetId == targetId &&
    other.temporaryTargetId == temporaryTargetId &&
    other.assetSource == assetSource &&
    _deepEquality.equals(other.assetIds, assetIds) &&
    other.assetSelectionHandleId == assetSelectionHandleId &&
    other.riskLevel == riskLevel &&
    other.enabled == enabled &&
    other.payload == payload;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (type.hashCode) +
    (summary.hashCode) +
    (targetKind.hashCode) +
    (targetId == null ? 0 : targetId!.hashCode) +
    (temporaryTargetId == null ? 0 : temporaryTargetId!.hashCode) +
    (assetSource == null ? 0 : assetSource!.hashCode) +
    (assetIds.hashCode) +
    (assetSelectionHandleId == null ? 0 : assetSelectionHandleId!.hashCode) +
    (riskLevel == null ? 0 : riskLevel!.hashCode) +
    (enabled.hashCode) +
    (payload == null ? 0 : payload!.hashCode);

  @override
  String toString() => 'AgentProposeAlbumOperationsDtoOperationsInnerOneOf7[type=$type, summary=$summary, targetKind=$targetKind, targetId=$targetId, temporaryTargetId=$temporaryTargetId, assetSource=$assetSource, assetIds=$assetIds, assetSelectionHandleId=$assetSelectionHandleId, riskLevel=$riskLevel, enabled=$enabled, payload=$payload]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'type'] = this.type;
      json[r'summary'] = this.summary;
      json[r'targetKind'] = this.targetKind;
    if (this.targetId != null) {
      json[r'targetId'] = this.targetId;
    } else {
    //  json[r'targetId'] = null;
    }
    if (this.temporaryTargetId != null) {
      json[r'temporaryTargetId'] = this.temporaryTargetId;
    } else {
    //  json[r'temporaryTargetId'] = null;
    }
    if (this.assetSource != null) {
      json[r'assetSource'] = this.assetSource;
    } else {
    //  json[r'assetSource'] = null;
    }
      json[r'assetIds'] = this.assetIds;
    if (this.assetSelectionHandleId != null) {
      json[r'assetSelectionHandleId'] = this.assetSelectionHandleId;
    } else {
    //  json[r'assetSelectionHandleId'] = null;
    }
    if (this.riskLevel != null) {
      json[r'riskLevel'] = this.riskLevel;
    } else {
    //  json[r'riskLevel'] = null;
    }
      json[r'enabled'] = this.enabled;
    if (this.payload != null) {
      json[r'payload'] = this.payload;
    } else {
    //  json[r'payload'] = null;
    }
    return json;
  }

  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInnerOneOf7] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf7? fromJson(dynamic value) {
    upgradeDto(value, "AgentProposeAlbumOperationsDtoOperationsInnerOneOf7");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentProposeAlbumOperationsDtoOperationsInnerOneOf7(
        type: AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum.fromJson(json[r'type'])!,
        summary: mapValueOfType<String>(json, r'summary')!,
        targetKind: AgentOperationTargetKind.fromJson(json[r'targetKind'])!,
        targetId: mapValueOfType<String>(json, r'targetId'),
        temporaryTargetId: mapValueOfType<String>(json, r'temporaryTargetId'),
        assetSource: AgentOperationPlanningAssetSourceInput.fromJson(json[r'assetSource']),
        assetIds: json[r'assetIds'] is Iterable
            ? (json[r'assetIds'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        assetSelectionHandleId: mapValueOfType<String>(json, r'assetSelectionHandleId'),
        riskLevel: AgentOperationRiskLevel.fromJson(json[r'riskLevel']),
        enabled: mapValueOfType<bool>(json, r'enabled') ?? true,
        payload: mapValueOfType<Object>(json, r'payload'),
      );
    }
    return null;
  }

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf7> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf7>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf7.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentProposeAlbumOperationsDtoOperationsInnerOneOf7> mapFromJson(dynamic json) {
    final map = <String, AgentProposeAlbumOperationsDtoOperationsInnerOneOf7>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf7.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentProposeAlbumOperationsDtoOperationsInnerOneOf7-objects as value to a dart map
  static Map<String, List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf7>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf7>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentProposeAlbumOperationsDtoOperationsInnerOneOf7.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'type',
    'summary',
    'targetKind',
  };
}


class AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const spacePeriodRemoveAssets = AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum._(r'space.removeAssets');

  /// List of all possible values in this [enum][AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum].
  static const values = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum>[
    spacePeriodRemoveAssets,
  ];

  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum? fromJson(dynamic value) => AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnumTypeTransformer().decode(value);

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum] to String,
/// and [decode] dynamic data back to [AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum].
class AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnumTypeTransformer {
  factory AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnumTypeTransformer() => _instance ??= const AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnumTypeTransformer._();

  const AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnumTypeTransformer._();

  String encode(AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'space.removeAssets': return AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnum.spacePeriodRemoveAssets;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnumTypeTransformer] instance.
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf7TypeEnumTypeTransformer? _instance;
}


