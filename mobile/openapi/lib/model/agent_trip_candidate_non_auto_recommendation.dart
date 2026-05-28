//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentTripCandidateNonAutoRecommendation {
  /// Returns a new [AgentTripCandidateNonAutoRecommendation] instance.
  AgentTripCandidateNonAutoRecommendation({
    required this.action,
    required this.reason,
  });

  AgentTripCandidateNonAutoRecommendationActionEnum action;

  String reason;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentTripCandidateNonAutoRecommendation &&
    other.action == action &&
    other.reason == reason;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (action.hashCode) +
    (reason.hashCode);

  @override
  String toString() => 'AgentTripCandidateNonAutoRecommendation[action=$action, reason=$reason]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'action'] = this.action;
      json[r'reason'] = this.reason;
    return json;
  }

  /// Returns a new [AgentTripCandidateNonAutoRecommendation] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentTripCandidateNonAutoRecommendation? fromJson(dynamic value) {
    upgradeDto(value, "AgentTripCandidateNonAutoRecommendation");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentTripCandidateNonAutoRecommendation(
        action: AgentTripCandidateNonAutoRecommendationActionEnum.fromJson(json[r'action'])!,
        reason: mapValueOfType<String>(json, r'reason')!,
      );
    }
    return null;
  }

  static List<AgentTripCandidateNonAutoRecommendation> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentTripCandidateNonAutoRecommendation>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentTripCandidateNonAutoRecommendation.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentTripCandidateNonAutoRecommendation> mapFromJson(dynamic json) {
    final map = <String, AgentTripCandidateNonAutoRecommendation>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentTripCandidateNonAutoRecommendation.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentTripCandidateNonAutoRecommendation-objects as value to a dart map
  static Map<String, List<AgentTripCandidateNonAutoRecommendation>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentTripCandidateNonAutoRecommendation>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentTripCandidateNonAutoRecommendation.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'action',
    'reason',
  };
}


class AgentTripCandidateNonAutoRecommendationActionEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentTripCandidateNonAutoRecommendationActionEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const askUser = AgentTripCandidateNonAutoRecommendationActionEnum._(r'ask_user');
  static const none = AgentTripCandidateNonAutoRecommendationActionEnum._(r'none');

  /// List of all possible values in this [enum][AgentTripCandidateNonAutoRecommendationActionEnum].
  static const values = <AgentTripCandidateNonAutoRecommendationActionEnum>[
    askUser,
    none,
  ];

  static AgentTripCandidateNonAutoRecommendationActionEnum? fromJson(dynamic value) => AgentTripCandidateNonAutoRecommendationActionEnumTypeTransformer().decode(value);

  static List<AgentTripCandidateNonAutoRecommendationActionEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentTripCandidateNonAutoRecommendationActionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentTripCandidateNonAutoRecommendationActionEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentTripCandidateNonAutoRecommendationActionEnum] to String,
/// and [decode] dynamic data back to [AgentTripCandidateNonAutoRecommendationActionEnum].
class AgentTripCandidateNonAutoRecommendationActionEnumTypeTransformer {
  factory AgentTripCandidateNonAutoRecommendationActionEnumTypeTransformer() => _instance ??= const AgentTripCandidateNonAutoRecommendationActionEnumTypeTransformer._();

  const AgentTripCandidateNonAutoRecommendationActionEnumTypeTransformer._();

  String encode(AgentTripCandidateNonAutoRecommendationActionEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentTripCandidateNonAutoRecommendationActionEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentTripCandidateNonAutoRecommendationActionEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'ask_user': return AgentTripCandidateNonAutoRecommendationActionEnum.askUser;
        case r'none': return AgentTripCandidateNonAutoRecommendationActionEnum.none;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentTripCandidateNonAutoRecommendationActionEnumTypeTransformer] instance.
  static AgentTripCandidateNonAutoRecommendationActionEnumTypeTransformer? _instance;
}


