//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentSessionActivityEventCounts {
  /// Returns a new [AgentSessionActivityEventCounts] instance.
  AgentSessionActivityEventCounts({
    this.applied,
    this.failed,
    this.skipped,
    this.total,
  });

  /// Minimum value: 0
  /// Maximum value: 10000
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? applied;

  /// Minimum value: 0
  /// Maximum value: 10000
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? failed;

  /// Minimum value: 0
  /// Maximum value: 10000
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? skipped;

  /// Minimum value: 0
  /// Maximum value: 10000
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? total;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentSessionActivityEventCounts &&
    other.applied == applied &&
    other.failed == failed &&
    other.skipped == skipped &&
    other.total == total;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (applied == null ? 0 : applied!.hashCode) +
    (failed == null ? 0 : failed!.hashCode) +
    (skipped == null ? 0 : skipped!.hashCode) +
    (total == null ? 0 : total!.hashCode);

  @override
  String toString() => 'AgentSessionActivityEventCounts[applied=$applied, failed=$failed, skipped=$skipped, total=$total]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.applied != null) {
      json[r'applied'] = this.applied;
    } else {
    //  json[r'applied'] = null;
    }
    if (this.failed != null) {
      json[r'failed'] = this.failed;
    } else {
    //  json[r'failed'] = null;
    }
    if (this.skipped != null) {
      json[r'skipped'] = this.skipped;
    } else {
    //  json[r'skipped'] = null;
    }
    if (this.total != null) {
      json[r'total'] = this.total;
    } else {
    //  json[r'total'] = null;
    }
    return json;
  }

  /// Returns a new [AgentSessionActivityEventCounts] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentSessionActivityEventCounts? fromJson(dynamic value) {
    upgradeDto(value, "AgentSessionActivityEventCounts");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentSessionActivityEventCounts(
        applied: mapValueOfType<int>(json, r'applied'),
        failed: mapValueOfType<int>(json, r'failed'),
        skipped: mapValueOfType<int>(json, r'skipped'),
        total: mapValueOfType<int>(json, r'total'),
      );
    }
    return null;
  }

  static List<AgentSessionActivityEventCounts> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentSessionActivityEventCounts>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentSessionActivityEventCounts.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentSessionActivityEventCounts> mapFromJson(dynamic json) {
    final map = <String, AgentSessionActivityEventCounts>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentSessionActivityEventCounts.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentSessionActivityEventCounts-objects as value to a dart map
  static Map<String, List<AgentSessionActivityEventCounts>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentSessionActivityEventCounts>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentSessionActivityEventCounts.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

