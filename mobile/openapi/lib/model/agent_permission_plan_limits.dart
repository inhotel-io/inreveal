//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentPermissionPlanLimits {
  /// Returns a new [AgentPermissionPlanLimits] instance.
  AgentPermissionPlanLimits({
    required this.expiresInMinutes,
    required this.maxAssetsPerSession,
    required this.maxAssetsPerToolCall,
    required this.maxOriginalsPerToolCall,
    required this.maxPreviewsPerToolCall,
  });

  /// Minimum value: 1
  /// Maximum value: 10080
  int? expiresInMinutes;

  /// Minimum value: 1
  /// Maximum value: 100000
  int maxAssetsPerSession;

  /// Minimum value: 1
  /// Maximum value: 10000
  int maxAssetsPerToolCall;

  /// Minimum value: 0
  /// Maximum value: 1000
  int maxOriginalsPerToolCall;

  /// Minimum value: 0
  /// Maximum value: 10000
  int maxPreviewsPerToolCall;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentPermissionPlanLimits &&
    other.expiresInMinutes == expiresInMinutes &&
    other.maxAssetsPerSession == maxAssetsPerSession &&
    other.maxAssetsPerToolCall == maxAssetsPerToolCall &&
    other.maxOriginalsPerToolCall == maxOriginalsPerToolCall &&
    other.maxPreviewsPerToolCall == maxPreviewsPerToolCall;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (expiresInMinutes == null ? 0 : expiresInMinutes!.hashCode) +
    (maxAssetsPerSession.hashCode) +
    (maxAssetsPerToolCall.hashCode) +
    (maxOriginalsPerToolCall.hashCode) +
    (maxPreviewsPerToolCall.hashCode);

  @override
  String toString() => 'AgentPermissionPlanLimits[expiresInMinutes=$expiresInMinutes, maxAssetsPerSession=$maxAssetsPerSession, maxAssetsPerToolCall=$maxAssetsPerToolCall, maxOriginalsPerToolCall=$maxOriginalsPerToolCall, maxPreviewsPerToolCall=$maxPreviewsPerToolCall]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.expiresInMinutes != null) {
      json[r'expiresInMinutes'] = this.expiresInMinutes;
    } else {
    //  json[r'expiresInMinutes'] = null;
    }
      json[r'maxAssetsPerSession'] = this.maxAssetsPerSession;
      json[r'maxAssetsPerToolCall'] = this.maxAssetsPerToolCall;
      json[r'maxOriginalsPerToolCall'] = this.maxOriginalsPerToolCall;
      json[r'maxPreviewsPerToolCall'] = this.maxPreviewsPerToolCall;
    return json;
  }

  /// Returns a new [AgentPermissionPlanLimits] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentPermissionPlanLimits? fromJson(dynamic value) {
    upgradeDto(value, "AgentPermissionPlanLimits");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentPermissionPlanLimits(
        expiresInMinutes: mapValueOfType<int>(json, r'expiresInMinutes'),
        maxAssetsPerSession: mapValueOfType<int>(json, r'maxAssetsPerSession')!,
        maxAssetsPerToolCall: mapValueOfType<int>(json, r'maxAssetsPerToolCall')!,
        maxOriginalsPerToolCall: mapValueOfType<int>(json, r'maxOriginalsPerToolCall')!,
        maxPreviewsPerToolCall: mapValueOfType<int>(json, r'maxPreviewsPerToolCall')!,
      );
    }
    return null;
  }

  static List<AgentPermissionPlanLimits> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentPermissionPlanLimits>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentPermissionPlanLimits.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentPermissionPlanLimits> mapFromJson(dynamic json) {
    final map = <String, AgentPermissionPlanLimits>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentPermissionPlanLimits.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentPermissionPlanLimits-objects as value to a dart map
  static Map<String, List<AgentPermissionPlanLimits>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentPermissionPlanLimits>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentPermissionPlanLimits.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'expiresInMinutes',
    'maxAssetsPerSession',
    'maxAssetsPerToolCall',
    'maxOriginalsPerToolCall',
    'maxPreviewsPerToolCall',
  };
}

