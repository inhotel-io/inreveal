//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentTripCandidateUseTopRecommendation {
  /// Returns a new [AgentTripCandidateUseTopRecommendation] instance.
  AgentTripCandidateUseTopRecommendation({
    required this.action,
    required this.candidateDedupeKey,
    required this.reason,
  });

  AgentTripCandidateUseTopRecommendationActionEnum action;

  String candidateDedupeKey;

  String reason;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentTripCandidateUseTopRecommendation &&
    other.action == action &&
    other.candidateDedupeKey == candidateDedupeKey &&
    other.reason == reason;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (action.hashCode) +
    (candidateDedupeKey.hashCode) +
    (reason.hashCode);

  @override
  String toString() => 'AgentTripCandidateUseTopRecommendation[action=$action, candidateDedupeKey=$candidateDedupeKey, reason=$reason]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'action'] = this.action;
      json[r'candidateDedupeKey'] = this.candidateDedupeKey;
      json[r'reason'] = this.reason;
    return json;
  }

  /// Returns a new [AgentTripCandidateUseTopRecommendation] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentTripCandidateUseTopRecommendation? fromJson(dynamic value) {
    upgradeDto(value, "AgentTripCandidateUseTopRecommendation");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentTripCandidateUseTopRecommendation(
        action: AgentTripCandidateUseTopRecommendationActionEnum.fromJson(json[r'action'])!,
        candidateDedupeKey: mapValueOfType<String>(json, r'candidateDedupeKey')!,
        reason: mapValueOfType<String>(json, r'reason')!,
      );
    }
    return null;
  }

  static List<AgentTripCandidateUseTopRecommendation> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentTripCandidateUseTopRecommendation>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentTripCandidateUseTopRecommendation.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentTripCandidateUseTopRecommendation> mapFromJson(dynamic json) {
    final map = <String, AgentTripCandidateUseTopRecommendation>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentTripCandidateUseTopRecommendation.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentTripCandidateUseTopRecommendation-objects as value to a dart map
  static Map<String, List<AgentTripCandidateUseTopRecommendation>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentTripCandidateUseTopRecommendation>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentTripCandidateUseTopRecommendation.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'action',
    'candidateDedupeKey',
    'reason',
  };
}


class AgentTripCandidateUseTopRecommendationActionEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentTripCandidateUseTopRecommendationActionEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const useTopCandidate = AgentTripCandidateUseTopRecommendationActionEnum._(r'use_top_candidate');

  /// List of all possible values in this [enum][AgentTripCandidateUseTopRecommendationActionEnum].
  static const values = <AgentTripCandidateUseTopRecommendationActionEnum>[
    useTopCandidate,
  ];

  static AgentTripCandidateUseTopRecommendationActionEnum? fromJson(dynamic value) => AgentTripCandidateUseTopRecommendationActionEnumTypeTransformer().decode(value);

  static List<AgentTripCandidateUseTopRecommendationActionEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentTripCandidateUseTopRecommendationActionEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentTripCandidateUseTopRecommendationActionEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentTripCandidateUseTopRecommendationActionEnum] to String,
/// and [decode] dynamic data back to [AgentTripCandidateUseTopRecommendationActionEnum].
class AgentTripCandidateUseTopRecommendationActionEnumTypeTransformer {
  factory AgentTripCandidateUseTopRecommendationActionEnumTypeTransformer() => _instance ??= const AgentTripCandidateUseTopRecommendationActionEnumTypeTransformer._();

  const AgentTripCandidateUseTopRecommendationActionEnumTypeTransformer._();

  String encode(AgentTripCandidateUseTopRecommendationActionEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentTripCandidateUseTopRecommendationActionEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentTripCandidateUseTopRecommendationActionEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'use_top_candidate': return AgentTripCandidateUseTopRecommendationActionEnum.useTopCandidate;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentTripCandidateUseTopRecommendationActionEnumTypeTransformer] instance.
  static AgentTripCandidateUseTopRecommendationActionEnumTypeTransformer? _instance;
}


