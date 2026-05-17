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
    required this.addAssetsToSpaces,
    required this.archiveAssets,
    required this.createAlbum,
    required this.createSpace,
    required this.editAssets,
    required this.favoriteAssets,
    required this.removeAssets,
    required this.removeAssetsFromSpaces,
    required this.setCover,
    required this.tagAssets,
    required this.updateDetails,
    required this.updateSpaceDetails,
  });

  bool addAssets;

  bool addAssetsToSpaces;

  bool archiveAssets;

  bool createAlbum;

  bool createSpace;

  bool editAssets;

  bool favoriteAssets;

  bool removeAssets;

  bool removeAssetsFromSpaces;

  bool setCover;

  bool tagAssets;

  bool updateDetails;

  bool updateSpaceDetails;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentPermissionPlanWriteScope &&
    other.addAssets == addAssets &&
    other.addAssetsToSpaces == addAssetsToSpaces &&
    other.archiveAssets == archiveAssets &&
    other.createAlbum == createAlbum &&
    other.createSpace == createSpace &&
    other.editAssets == editAssets &&
    other.favoriteAssets == favoriteAssets &&
    other.removeAssets == removeAssets &&
    other.removeAssetsFromSpaces == removeAssetsFromSpaces &&
    other.setCover == setCover &&
    other.tagAssets == tagAssets &&
    other.updateDetails == updateDetails &&
    other.updateSpaceDetails == updateSpaceDetails;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (addAssets.hashCode) +
    (addAssetsToSpaces.hashCode) +
    (archiveAssets.hashCode) +
    (createAlbum.hashCode) +
    (createSpace.hashCode) +
    (editAssets.hashCode) +
    (favoriteAssets.hashCode) +
    (removeAssets.hashCode) +
    (removeAssetsFromSpaces.hashCode) +
    (setCover.hashCode) +
    (tagAssets.hashCode) +
    (updateDetails.hashCode) +
    (updateSpaceDetails.hashCode);

  @override
  String toString() => 'AgentPermissionPlanWriteScope[addAssets=$addAssets, addAssetsToSpaces=$addAssetsToSpaces, archiveAssets=$archiveAssets, createAlbum=$createAlbum, createSpace=$createSpace, editAssets=$editAssets, favoriteAssets=$favoriteAssets, removeAssets=$removeAssets, removeAssetsFromSpaces=$removeAssetsFromSpaces, setCover=$setCover, tagAssets=$tagAssets, updateDetails=$updateDetails, updateSpaceDetails=$updateSpaceDetails]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'addAssets'] = this.addAssets;
      json[r'addAssetsToSpaces'] = this.addAssetsToSpaces;
      json[r'archiveAssets'] = this.archiveAssets;
      json[r'createAlbum'] = this.createAlbum;
      json[r'createSpace'] = this.createSpace;
      json[r'editAssets'] = this.editAssets;
      json[r'favoriteAssets'] = this.favoriteAssets;
      json[r'removeAssets'] = this.removeAssets;
      json[r'removeAssetsFromSpaces'] = this.removeAssetsFromSpaces;
      json[r'setCover'] = this.setCover;
      json[r'tagAssets'] = this.tagAssets;
      json[r'updateDetails'] = this.updateDetails;
      json[r'updateSpaceDetails'] = this.updateSpaceDetails;
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
        addAssetsToSpaces: mapValueOfType<bool>(json, r'addAssetsToSpaces')!,
        archiveAssets: mapValueOfType<bool>(json, r'archiveAssets')!,
        createAlbum: mapValueOfType<bool>(json, r'createAlbum')!,
        createSpace: mapValueOfType<bool>(json, r'createSpace')!,
        editAssets: mapValueOfType<bool>(json, r'editAssets')!,
        favoriteAssets: mapValueOfType<bool>(json, r'favoriteAssets')!,
        removeAssets: mapValueOfType<bool>(json, r'removeAssets')!,
        removeAssetsFromSpaces: mapValueOfType<bool>(json, r'removeAssetsFromSpaces')!,
        setCover: mapValueOfType<bool>(json, r'setCover')!,
        tagAssets: mapValueOfType<bool>(json, r'tagAssets')!,
        updateDetails: mapValueOfType<bool>(json, r'updateDetails')!,
        updateSpaceDetails: mapValueOfType<bool>(json, r'updateSpaceDetails')!,
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
    'addAssetsToSpaces',
    'archiveAssets',
    'createAlbum',
    'createSpace',
    'editAssets',
    'favoriteAssets',
    'removeAssets',
    'removeAssetsFromSpaces',
    'setCover',
    'tagAssets',
    'updateDetails',
    'updateSpaceDetails',
  };
}

