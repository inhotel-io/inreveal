//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentReadAssetOriginalsToolRequestDto {
  /// Returns a new [AgentReadAssetOriginalsToolRequestDto] instance.
  AgentReadAssetOriginalsToolRequestDto({
    this.assetIds = const [],
    this.toolCallId,
  });

  List<String> assetIds;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? toolCallId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentReadAssetOriginalsToolRequestDto &&
    _deepEquality.equals(other.assetIds, assetIds) &&
    other.toolCallId == toolCallId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (assetIds.hashCode) +
    (toolCallId == null ? 0 : toolCallId!.hashCode);

  @override
  String toString() => 'AgentReadAssetOriginalsToolRequestDto[assetIds=$assetIds, toolCallId=$toolCallId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'assetIds'] = this.assetIds;
    if (this.toolCallId != null) {
      json[r'toolCallId'] = this.toolCallId;
    } else {
    //  json[r'toolCallId'] = null;
    }
    return json;
  }

  /// Returns a new [AgentReadAssetOriginalsToolRequestDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentReadAssetOriginalsToolRequestDto? fromJson(dynamic value) {
    upgradeDto(value, "AgentReadAssetOriginalsToolRequestDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentReadAssetOriginalsToolRequestDto(
        assetIds: json[r'assetIds'] is Iterable
            ? (json[r'assetIds'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        toolCallId: mapValueOfType<String>(json, r'toolCallId'),
      );
    }
    return null;
  }

  static List<AgentReadAssetOriginalsToolRequestDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentReadAssetOriginalsToolRequestDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentReadAssetOriginalsToolRequestDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentReadAssetOriginalsToolRequestDto> mapFromJson(dynamic json) {
    final map = <String, AgentReadAssetOriginalsToolRequestDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentReadAssetOriginalsToolRequestDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentReadAssetOriginalsToolRequestDto-objects as value to a dart map
  static Map<String, List<AgentReadAssetOriginalsToolRequestDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentReadAssetOriginalsToolRequestDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentReadAssetOriginalsToolRequestDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

