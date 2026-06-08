//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload {
  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload] instance.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload({
    required this.favorite,
  });

  bool favorite;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload &&
    other.favorite == favorite;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (favorite.hashCode);

  @override
  String toString() => 'AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload[favorite=$favorite]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'favorite'] = this.favorite;
    return json;
  }

  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload? fromJson(dynamic value) {
    upgradeDto(value, "AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload(
        favorite: mapValueOfType<bool>(json, r'favorite')!,
      );
    }
    return null;
  }

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload> mapFromJson(dynamic json) {
    final map = <String, AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload-objects as value to a dart map
  static Map<String, List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentProposeAlbumOperationsDtoOperationsInnerOneOf19Payload.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'favorite',
  };
}

