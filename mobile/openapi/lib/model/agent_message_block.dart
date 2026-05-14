//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentMessageBlock {
  /// Returns a new [AgentMessageBlock] instance.
  AgentMessageBlock({
    required this.text,
    required this.type,
    this.summary,
    required this.toolCallId,
    required this.assetId,
    this.label,
    required this.planId,
  });

  String text;

  AgentMessagePlanBlockType type;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? summary;

  String toolCallId;

  String assetId;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? label;

  String planId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentMessageBlock &&
    other.text == text &&
    other.type == type &&
    other.summary == summary &&
    other.toolCallId == toolCallId &&
    other.assetId == assetId &&
    other.label == label &&
    other.planId == planId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (text.hashCode) +
    (type.hashCode) +
    (summary == null ? 0 : summary!.hashCode) +
    (toolCallId.hashCode) +
    (assetId.hashCode) +
    (label == null ? 0 : label!.hashCode) +
    (planId.hashCode);

  @override
  String toString() => 'AgentMessageBlock[text=$text, type=$type, summary=$summary, toolCallId=$toolCallId, assetId=$assetId, label=$label, planId=$planId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'text'] = this.text;
      json[r'type'] = this.type;
    if (this.summary != null) {
      json[r'summary'] = this.summary;
    } else {
    //  json[r'summary'] = null;
    }
      json[r'toolCallId'] = this.toolCallId;
      json[r'assetId'] = this.assetId;
    if (this.label != null) {
      json[r'label'] = this.label;
    } else {
    //  json[r'label'] = null;
    }
      json[r'planId'] = this.planId;
    return json;
  }

  /// Returns a new [AgentMessageBlock] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentMessageBlock? fromJson(dynamic value) {
    upgradeDto(value, "AgentMessageBlock");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentMessageBlock(
        text: mapValueOfType<String>(json, r'text')!,
        type: AgentMessagePlanBlockType.fromJson(json[r'type'])!,
        summary: mapValueOfType<String>(json, r'summary'),
        toolCallId: mapValueOfType<String>(json, r'toolCallId')!,
        assetId: mapValueOfType<String>(json, r'assetId')!,
        label: mapValueOfType<String>(json, r'label'),
        planId: mapValueOfType<String>(json, r'planId')!,
      );
    }
    return null;
  }

  static List<AgentMessageBlock> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentMessageBlock>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentMessageBlock.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentMessageBlock> mapFromJson(dynamic json) {
    final map = <String, AgentMessageBlock>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentMessageBlock.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentMessageBlock-objects as value to a dart map
  static Map<String, List<AgentMessageBlock>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentMessageBlock>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentMessageBlock.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'text',
    'type',
    'toolCallId',
    'assetId',
    'planId',
  };
}

