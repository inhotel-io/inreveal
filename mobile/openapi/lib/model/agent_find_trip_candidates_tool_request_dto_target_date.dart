//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentFindTripCandidatesToolRequestDtoTargetDate {
  /// Returns a new [AgentFindTripCandidatesToolRequestDtoTargetDate] instance.
  AgentFindTripCandidatesToolRequestDtoTargetDate({
  });

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentFindTripCandidatesToolRequestDtoTargetDate &&

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis

  @override
  String toString() => 'AgentFindTripCandidatesToolRequestDtoTargetDate[]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    return json;
  }

  /// Returns a new [AgentFindTripCandidatesToolRequestDtoTargetDate] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentFindTripCandidatesToolRequestDtoTargetDate? fromJson(dynamic value) {
    upgradeDto(value, "AgentFindTripCandidatesToolRequestDtoTargetDate");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentFindTripCandidatesToolRequestDtoTargetDate(
      );
    }
    return null;
  }

  static List<AgentFindTripCandidatesToolRequestDtoTargetDate> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentFindTripCandidatesToolRequestDtoTargetDate>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentFindTripCandidatesToolRequestDtoTargetDate.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentFindTripCandidatesToolRequestDtoTargetDate> mapFromJson(dynamic json) {
    final map = <String, AgentFindTripCandidatesToolRequestDtoTargetDate>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentFindTripCandidatesToolRequestDtoTargetDate.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentFindTripCandidatesToolRequestDtoTargetDate-objects as value to a dart map
  static Map<String, List<AgentFindTripCandidatesToolRequestDtoTargetDate>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentFindTripCandidatesToolRequestDtoTargetDate>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentFindTripCandidatesToolRequestDtoTargetDate.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

