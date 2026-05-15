//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentSearchAssetsToolSuccessResponse {
  /// Returns a new [AgentSearchAssetsToolSuccessResponse] instance.
  AgentSearchAssetsToolSuccessResponse({
    this.assets = const [],
    required this.nextPage,
    required this.status,
    required this.toolCall,
  });

  List<AgentAssetMetadata> assets;

  String? nextPage;

  AgentSearchAssetsToolSuccessResponseStatusEnum status;

  AgentToolCallResponseDto toolCall;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentSearchAssetsToolSuccessResponse &&
    _deepEquality.equals(other.assets, assets) &&
    other.nextPage == nextPage &&
    other.status == status &&
    other.toolCall == toolCall;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (assets.hashCode) +
    (nextPage == null ? 0 : nextPage!.hashCode) +
    (status.hashCode) +
    (toolCall.hashCode);

  @override
  String toString() => 'AgentSearchAssetsToolSuccessResponse[assets=$assets, nextPage=$nextPage, status=$status, toolCall=$toolCall]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'assets'] = this.assets;
    if (this.nextPage != null) {
      json[r'nextPage'] = this.nextPage;
    } else {
    //  json[r'nextPage'] = null;
    }
      json[r'status'] = this.status;
      json[r'toolCall'] = this.toolCall;
    return json;
  }

  /// Returns a new [AgentSearchAssetsToolSuccessResponse] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentSearchAssetsToolSuccessResponse? fromJson(dynamic value) {
    upgradeDto(value, "AgentSearchAssetsToolSuccessResponse");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentSearchAssetsToolSuccessResponse(
        assets: AgentAssetMetadata.listFromJson(json[r'assets']),
        nextPage: mapValueOfType<String>(json, r'nextPage'),
        status: AgentSearchAssetsToolSuccessResponseStatusEnum.fromJson(json[r'status'])!,
        toolCall: AgentToolCallResponseDto.fromJson(json[r'toolCall'])!,
      );
    }
    return null;
  }

  static List<AgentSearchAssetsToolSuccessResponse> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentSearchAssetsToolSuccessResponse>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentSearchAssetsToolSuccessResponse.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentSearchAssetsToolSuccessResponse> mapFromJson(dynamic json) {
    final map = <String, AgentSearchAssetsToolSuccessResponse>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentSearchAssetsToolSuccessResponse.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentSearchAssetsToolSuccessResponse-objects as value to a dart map
  static Map<String, List<AgentSearchAssetsToolSuccessResponse>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentSearchAssetsToolSuccessResponse>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentSearchAssetsToolSuccessResponse.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'assets',
    'nextPage',
    'status',
    'toolCall',
  };
}


class AgentSearchAssetsToolSuccessResponseStatusEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentSearchAssetsToolSuccessResponseStatusEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const success = AgentSearchAssetsToolSuccessResponseStatusEnum._(r'success');

  /// List of all possible values in this [enum][AgentSearchAssetsToolSuccessResponseStatusEnum].
  static const values = <AgentSearchAssetsToolSuccessResponseStatusEnum>[
    success,
  ];

  static AgentSearchAssetsToolSuccessResponseStatusEnum? fromJson(dynamic value) => AgentSearchAssetsToolSuccessResponseStatusEnumTypeTransformer().decode(value);

  static List<AgentSearchAssetsToolSuccessResponseStatusEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentSearchAssetsToolSuccessResponseStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentSearchAssetsToolSuccessResponseStatusEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentSearchAssetsToolSuccessResponseStatusEnum] to String,
/// and [decode] dynamic data back to [AgentSearchAssetsToolSuccessResponseStatusEnum].
class AgentSearchAssetsToolSuccessResponseStatusEnumTypeTransformer {
  factory AgentSearchAssetsToolSuccessResponseStatusEnumTypeTransformer() => _instance ??= const AgentSearchAssetsToolSuccessResponseStatusEnumTypeTransformer._();

  const AgentSearchAssetsToolSuccessResponseStatusEnumTypeTransformer._();

  String encode(AgentSearchAssetsToolSuccessResponseStatusEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentSearchAssetsToolSuccessResponseStatusEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentSearchAssetsToolSuccessResponseStatusEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'success': return AgentSearchAssetsToolSuccessResponseStatusEnum.success;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentSearchAssetsToolSuccessResponseStatusEnumTypeTransformer] instance.
  static AgentSearchAssetsToolSuccessResponseStatusEnumTypeTransformer? _instance;
}


