//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentPermissionPlanWriteScope {
  /// Returns a new [AgentPermissionPlanWriteScope] instance.
  AgentPermissionPlanWriteScope({
    required this.addAssets,
    required this.createAlbum,
    required this.setCover,
    required this.updateDetails,
  });

  bool addAssets;

  bool createAlbum;

  bool setCover;

  bool updateDetails;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentPermissionPlanWriteScope &&
    other.addAssets == addAssets &&
    other.createAlbum == createAlbum &&
    other.setCover == setCover &&
    other.updateDetails == updateDetails;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (addAssets.hashCode) +
    (createAlbum.hashCode) +
    (setCover.hashCode) +
    (updateDetails.hashCode);

  @override
  String toString() => 'AgentPermissionPlanWriteScope[addAssets=$addAssets, createAlbum=$createAlbum, setCover=$setCover, updateDetails=$updateDetails]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'addAssets'] = this.addAssets;
      json[r'createAlbum'] = this.createAlbum;
      json[r'setCover'] = this.setCover;
      json[r'updateDetails'] = this.updateDetails;
    return json;
  }

  /// Returns a new [AgentPermissionPlanWriteScope] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentPermissionPlanWriteScope? fromJson(dynamic value) {
    upgradeDto(value, "AgentPermissionPlanWriteScope");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentPermissionPlanWriteScope(
        addAssets: mapValueOfType<bool>(json, r'addAssets')!,
        createAlbum: mapValueOfType<bool>(json, r'createAlbum')!,
        setCover: mapValueOfType<bool>(json, r'setCover')!,
        updateDetails: mapValueOfType<bool>(json, r'updateDetails')!,
      );
    }
    return null;
  }

  static List<AgentPermissionPlanWriteScope> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentPermissionPlanWriteScope>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentPermissionPlanWriteScope.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentPermissionPlanWriteScope> mapFromJson(dynamic json) {
    final map = <String, AgentPermissionPlanWriteScope>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentPermissionPlanWriteScope.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentPermissionPlanWriteScope-objects as value to a dart map
  static Map<String, List<AgentPermissionPlanWriteScope>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentPermissionPlanWriteScope>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentPermissionPlanWriteScope.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'addAssets',
    'createAlbum',
    'setCover',
    'updateDetails',
  };
}

