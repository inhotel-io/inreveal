//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentProposeAlbumOperationsDtoOperationsInner {
  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInner] instance.
  AgentProposeAlbumOperationsDtoOperationsInner({
    required this.type,
    required this.summary,
    required this.targetKind,
    this.temporaryTargetId,
    this.riskLevel,
    this.enabled = true,
    this.payload = const {},
    this.targetId,
    this.assetIds = const [],
  });

  AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum type;

  String summary;

  AgentOperationTargetKind targetKind;

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
  AgentOperationRiskLevel? riskLevel;

  bool enabled;

  Map<String, Object> payload;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? targetId;

  List<String> assetIds;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentProposeAlbumOperationsDtoOperationsInner &&
    other.type == type &&
    other.summary == summary &&
    other.targetKind == targetKind &&
    other.temporaryTargetId == temporaryTargetId &&
    other.riskLevel == riskLevel &&
    other.enabled == enabled &&
    _deepEquality.equals(other.payload, payload) &&
    other.targetId == targetId &&
    _deepEquality.equals(other.assetIds, assetIds);

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (type.hashCode) +
    (summary.hashCode) +
    (targetKind.hashCode) +
    (temporaryTargetId == null ? 0 : temporaryTargetId!.hashCode) +
    (riskLevel == null ? 0 : riskLevel!.hashCode) +
    (enabled.hashCode) +
    (payload.hashCode) +
    (targetId == null ? 0 : targetId!.hashCode) +
    (assetIds.hashCode);

  @override
  String toString() => 'AgentProposeAlbumOperationsDtoOperationsInner[type=$type, summary=$summary, targetKind=$targetKind, temporaryTargetId=$temporaryTargetId, riskLevel=$riskLevel, enabled=$enabled, payload=$payload, targetId=$targetId, assetIds=$assetIds]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'type'] = this.type;
      json[r'summary'] = this.summary;
      json[r'targetKind'] = this.targetKind;
    if (this.temporaryTargetId != null) {
      json[r'temporaryTargetId'] = this.temporaryTargetId;
    } else {
    //  json[r'temporaryTargetId'] = null;
    }
    if (this.riskLevel != null) {
      json[r'riskLevel'] = this.riskLevel;
    } else {
    //  json[r'riskLevel'] = null;
    }
      json[r'enabled'] = this.enabled;
      json[r'payload'] = this.payload;
    if (this.targetId != null) {
      json[r'targetId'] = this.targetId;
    } else {
    //  json[r'targetId'] = null;
    }
      json[r'assetIds'] = this.assetIds;
    return json;
  }

  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInner] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentProposeAlbumOperationsDtoOperationsInner? fromJson(dynamic value) {
    upgradeDto(value, "AgentProposeAlbumOperationsDtoOperationsInner");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentProposeAlbumOperationsDtoOperationsInner(
        type: AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum.fromJson(json[r'type'])!,
        summary: mapValueOfType<String>(json, r'summary')!,
        targetKind: AgentOperationTargetKind.fromJson(json[r'targetKind'])!,
        temporaryTargetId: mapValueOfType<String>(json, r'temporaryTargetId'),
        riskLevel: AgentOperationRiskLevel.fromJson(json[r'riskLevel']),
        enabled: mapValueOfType<bool>(json, r'enabled') ?? true,
        payload: mapCastOfType<String, Object>(json, r'payload')!,
        targetId: mapValueOfType<String>(json, r'targetId'),
        assetIds: json[r'assetIds'] is Iterable
            ? (json[r'assetIds'] as Iterable).cast<String>().toList(growable: false)
            : const [],
      );
    }
    return null;
  }

  static List<AgentProposeAlbumOperationsDtoOperationsInner> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInner>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInner.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentProposeAlbumOperationsDtoOperationsInner> mapFromJson(dynamic json) {
    final map = <String, AgentProposeAlbumOperationsDtoOperationsInner>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentProposeAlbumOperationsDtoOperationsInner.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentProposeAlbumOperationsDtoOperationsInner-objects as value to a dart map
  static Map<String, List<AgentProposeAlbumOperationsDtoOperationsInner>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentProposeAlbumOperationsDtoOperationsInner>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentProposeAlbumOperationsDtoOperationsInner.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'type',
    'summary',
    'targetKind',
    'payload',
    'assetIds',
  };
}


class AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const create = AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum._(r'album.create');
  static const addAssets = AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum._(r'album.addAssets');
  static const updateDetails = AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum._(r'album.updateDetails');
  static const setCover = AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum._(r'album.setCover');

  /// List of all possible values in this [enum][AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum].
  static const values = <AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum>[
    create,
    addAssets,
    updateDetails,
    setCover,
  ];

  static AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum? fromJson(dynamic value) => AgentProposeAlbumOperationsDtoOperationsInnerTypeEnumTypeTransformer().decode(value);

  static List<AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum] to String,
/// and [decode] dynamic data back to [AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum].
class AgentProposeAlbumOperationsDtoOperationsInnerTypeEnumTypeTransformer {
  factory AgentProposeAlbumOperationsDtoOperationsInnerTypeEnumTypeTransformer() => _instance ??= const AgentProposeAlbumOperationsDtoOperationsInnerTypeEnumTypeTransformer._();

  const AgentProposeAlbumOperationsDtoOperationsInnerTypeEnumTypeTransformer._();

  String encode(AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'album.create': return AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum.create;
        case r'album.addAssets': return AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum.addAssets;
        case r'album.updateDetails': return AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum.updateDetails;
        case r'album.setCover': return AgentProposeAlbumOperationsDtoOperationsInnerTypeEnum.setCover;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentProposeAlbumOperationsDtoOperationsInnerTypeEnumTypeTransformer] instance.
  static AgentProposeAlbumOperationsDtoOperationsInnerTypeEnumTypeTransformer? _instance;
}


