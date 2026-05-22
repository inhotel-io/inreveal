//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentReadAssetMetadataToolRequestDto {
  /// Returns a new [AgentReadAssetMetadataToolRequestDto] instance.
  AgentReadAssetMetadataToolRequestDto({
    this.assetIds = const [],
    this.detail,
    this.fields = const [],
    this.toolCallId,
  });

  List<String> assetIds;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AgentAssetMetadataDetail? detail;

  List<AgentAssetMetadataField> fields;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? toolCallId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentReadAssetMetadataToolRequestDto &&
    _deepEquality.equals(other.assetIds, assetIds) &&
    other.detail == detail &&
    _deepEquality.equals(other.fields, fields) &&
    other.toolCallId == toolCallId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (assetIds.hashCode) +
    (detail == null ? 0 : detail!.hashCode) +
    (fields.hashCode) +
    (toolCallId == null ? 0 : toolCallId!.hashCode);

  @override
  String toString() => 'AgentReadAssetMetadataToolRequestDto[assetIds=$assetIds, detail=$detail, fields=$fields, toolCallId=$toolCallId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'assetIds'] = this.assetIds;
    if (this.detail != null) {
      json[r'detail'] = this.detail;
    } else {
    //  json[r'detail'] = null;
    }
      json[r'fields'] = this.fields;
    if (this.toolCallId != null) {
      json[r'toolCallId'] = this.toolCallId;
    } else {
    //  json[r'toolCallId'] = null;
    }
    return json;
  }

  /// Returns a new [AgentReadAssetMetadataToolRequestDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentReadAssetMetadataToolRequestDto? fromJson(dynamic value) {
    upgradeDto(value, "AgentReadAssetMetadataToolRequestDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentReadAssetMetadataToolRequestDto(
        assetIds: json[r'assetIds'] is Iterable
            ? (json[r'assetIds'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        detail: AgentAssetMetadataDetail.fromJson(json[r'detail']),
        fields: AgentAssetMetadataField.listFromJson(json[r'fields']),
        toolCallId: mapValueOfType<String>(json, r'toolCallId'),
      );
    }
    return null;
  }

  static List<AgentReadAssetMetadataToolRequestDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentReadAssetMetadataToolRequestDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentReadAssetMetadataToolRequestDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentReadAssetMetadataToolRequestDto> mapFromJson(dynamic json) {
    final map = <String, AgentReadAssetMetadataToolRequestDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentReadAssetMetadataToolRequestDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentReadAssetMetadataToolRequestDto-objects as value to a dart map
  static Map<String, List<AgentReadAssetMetadataToolRequestDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentReadAssetMetadataToolRequestDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentReadAssetMetadataToolRequestDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

