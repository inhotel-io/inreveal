//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload {
  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload] instance.
  AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload({
    required this.angle,
  });

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int angle;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload &&
    other.angle == angle;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (angle.hashCode);

  @override
  String toString() => 'AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload[angle=$angle]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'angle'] = this.angle;
    return json;
  }

  /// Returns a new [AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload? fromJson(dynamic value) {
    upgradeDto(value, "AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload(
        angle: mapValueOfType<int>(json, r'angle')!,
      );
    }
    return null;
  }

  static List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload> mapFromJson(dynamic json) {
    final map = <String, AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload-objects as value to a dart map
  static Map<String, List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentProposeAlbumOperationsDtoOperationsInnerOneOf15Payload.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'angle',
  };
}

