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
    required this.payload,
    this.targetId,
    this.assetSource,
    this.assetIds = const [],
    this.assetSelectionHandleId,
  });

  AgentPersonMergeOperationType type;

  String summary;

  AgentOperationPersonTargetKind targetKind;

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

  AgentProposeAlbumOperationsDtoOperationsInnerOneOf31Payload payload;

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
  AgentOperationPlanningAssetSourceInput? assetSource;

  List<String> assetIds;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? assetSelectionHandleId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentProposeAlbumOperationsDtoOperationsInner &&
    other.type == type &&
    other.summary == summary &&
    other.targetKind == targetKind &&
    other.temporaryTargetId == temporaryTargetId &&
    other.riskLevel == riskLevel &&
    other.enabled == enabled &&
    other.payload == payload &&
    other.targetId == targetId &&
    other.assetSource == assetSource &&
    _deepEquality.equals(other.assetIds, assetIds) &&
    other.assetSelectionHandleId == assetSelectionHandleId;

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
    (assetSource == null ? 0 : assetSource!.hashCode) +
    (assetIds.hashCode) +
    (assetSelectionHandleId == null ? 0 : assetSelectionHandleId!.hashCode);

  @override
  String toString() => 'AgentProposeAlbumOperationsDtoOperationsInner[type=$type, summary=$summary, targetKind=$targetKind, temporaryTargetId=$temporaryTargetId, riskLevel=$riskLevel, enabled=$enabled, payload=$payload, targetId=$targetId, assetSource=$assetSource, assetIds=$assetIds, assetSelectionHandleId=$assetSelectionHandleId]';

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
        type: AgentPersonMergeOperationType.fromJson(json[r'type'])!,
        summary: mapValueOfType<String>(json, r'summary')!,
        targetKind: AgentOperationPersonTargetKind.fromJson(json[r'targetKind'])!,
        temporaryTargetId: mapValueOfType<String>(json, r'temporaryTargetId'),
        riskLevel: AgentOperationRiskLevel.fromJson(json[r'riskLevel']),
        enabled: mapValueOfType<bool>(json, r'enabled') ?? true,
        payload: AgentProposeAlbumOperationsDtoOperationsInnerOneOf31Payload.fromJson(json[r'payload'])!,
        targetId: mapValueOfType<String>(json, r'targetId'),
        assetSource: AgentOperationPlanningAssetSourceInput.fromJson(json[r'assetSource']),
        assetIds: json[r'assetIds'] is Iterable
            ? (json[r'assetIds'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        assetSelectionHandleId: mapValueOfType<String>(json, r'assetSelectionHandleId'),
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
  };
}

