//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentFindTripCandidatesToolRequestDto {
  /// Returns a new [AgentFindTripCandidatesToolRequestDto] instance.
  AgentFindTripCandidatesToolRequestDto({
    this.lookbackDays,
    this.maxCandidates,
    this.placeHint,
    this.targetDate,
    this.toolCallId,
  });

  /// Minimum value: 1
  /// Maximum value: 365
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? lookbackDays;

  /// Minimum value: 1
  /// Maximum value: 10
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? maxCandidates;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? placeHint;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? targetDate;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? toolCallId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentFindTripCandidatesToolRequestDto &&
    other.lookbackDays == lookbackDays &&
    other.maxCandidates == maxCandidates &&
    other.placeHint == placeHint &&
    other.targetDate == targetDate &&
    other.toolCallId == toolCallId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (lookbackDays == null ? 0 : lookbackDays!.hashCode) +
    (maxCandidates == null ? 0 : maxCandidates!.hashCode) +
    (placeHint == null ? 0 : placeHint!.hashCode) +
    (targetDate == null ? 0 : targetDate!.hashCode) +
    (toolCallId == null ? 0 : toolCallId!.hashCode);

  @override
  String toString() => 'AgentFindTripCandidatesToolRequestDto[lookbackDays=$lookbackDays, maxCandidates=$maxCandidates, placeHint=$placeHint, targetDate=$targetDate, toolCallId=$toolCallId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.lookbackDays != null) {
      json[r'lookbackDays'] = this.lookbackDays;
    } else {
    //  json[r'lookbackDays'] = null;
    }
    if (this.maxCandidates != null) {
      json[r'maxCandidates'] = this.maxCandidates;
    } else {
    //  json[r'maxCandidates'] = null;
    }
    if (this.placeHint != null) {
      json[r'placeHint'] = this.placeHint;
    } else {
    //  json[r'placeHint'] = null;
    }
    if (this.targetDate != null) {
      json[r'targetDate'] = this.targetDate;
    } else {
    //  json[r'targetDate'] = null;
    }
    if (this.toolCallId != null) {
      json[r'toolCallId'] = this.toolCallId;
    } else {
    //  json[r'toolCallId'] = null;
    }
    return json;
  }

  /// Returns a new [AgentFindTripCandidatesToolRequestDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentFindTripCandidatesToolRequestDto? fromJson(dynamic value) {
    upgradeDto(value, "AgentFindTripCandidatesToolRequestDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentFindTripCandidatesToolRequestDto(
        lookbackDays: mapValueOfType<int>(json, r'lookbackDays'),
        maxCandidates: mapValueOfType<int>(json, r'maxCandidates'),
        placeHint: mapValueOfType<String>(json, r'placeHint'),
        targetDate: mapValueOfType<String>(json, r'targetDate'),
        toolCallId: mapValueOfType<String>(json, r'toolCallId'),
      );
    }
    return null;
  }

  static List<AgentFindTripCandidatesToolRequestDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentFindTripCandidatesToolRequestDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentFindTripCandidatesToolRequestDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentFindTripCandidatesToolRequestDto> mapFromJson(dynamic json) {
    final map = <String, AgentFindTripCandidatesToolRequestDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentFindTripCandidatesToolRequestDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentFindTripCandidatesToolRequestDto-objects as value to a dart map
  static Map<String, List<AgentFindTripCandidatesToolRequestDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentFindTripCandidatesToolRequestDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentFindTripCandidatesToolRequestDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

