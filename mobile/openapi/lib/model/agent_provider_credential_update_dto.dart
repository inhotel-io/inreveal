//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentProviderCredentialUpdateDto {
  /// Returns a new [AgentProviderCredentialUpdateDto] instance.
  AgentProviderCredentialUpdateDto({
    this.baseUrl,
    this.defaultModel,
    this.label,
    this.models = const [],
    this.providerType,
    this.secret,
  });

  String? baseUrl;

  String? defaultModel;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? label;

  List<String> models;

  AgentProviderCredentialUpdateDtoProviderTypeEnum? providerType;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? secret;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentProviderCredentialUpdateDto &&
    other.baseUrl == baseUrl &&
    other.defaultModel == defaultModel &&
    other.label == label &&
    _deepEquality.equals(other.models, models) &&
    other.providerType == providerType &&
    other.secret == secret;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (baseUrl == null ? 0 : baseUrl!.hashCode) +
    (defaultModel == null ? 0 : defaultModel!.hashCode) +
    (label == null ? 0 : label!.hashCode) +
    (models.hashCode) +
    (providerType == null ? 0 : providerType!.hashCode) +
    (secret == null ? 0 : secret!.hashCode);

  @override
  String toString() => 'AgentProviderCredentialUpdateDto[baseUrl=$baseUrl, defaultModel=$defaultModel, label=$label, models=$models, providerType=$providerType, secret=$secret]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.baseUrl != null) {
      json[r'baseUrl'] = this.baseUrl;
    } else {
    //  json[r'baseUrl'] = null;
    }
    if (this.defaultModel != null) {
      json[r'defaultModel'] = this.defaultModel;
    } else {
    //  json[r'defaultModel'] = null;
    }
    if (this.label != null) {
      json[r'label'] = this.label;
    } else {
    //  json[r'label'] = null;
    }
      json[r'models'] = this.models;
    if (this.providerType != null) {
      json[r'providerType'] = this.providerType;
    } else {
    //  json[r'providerType'] = null;
    }
    if (this.secret != null) {
      json[r'secret'] = this.secret;
    } else {
    //  json[r'secret'] = null;
    }
    return json;
  }

  /// Returns a new [AgentProviderCredentialUpdateDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentProviderCredentialUpdateDto? fromJson(dynamic value) {
    upgradeDto(value, "AgentProviderCredentialUpdateDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentProviderCredentialUpdateDto(
        baseUrl: mapValueOfType<String>(json, r'baseUrl'),
        defaultModel: mapValueOfType<String>(json, r'defaultModel'),
        label: mapValueOfType<String>(json, r'label'),
        models: json[r'models'] is Iterable
            ? (json[r'models'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        providerType: AgentProviderCredentialUpdateDtoProviderTypeEnum.fromJson(json[r'providerType']),
        secret: mapValueOfType<String>(json, r'secret'),
      );
    }
    return null;
  }

  static List<AgentProviderCredentialUpdateDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProviderCredentialUpdateDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProviderCredentialUpdateDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentProviderCredentialUpdateDto> mapFromJson(dynamic json) {
    final map = <String, AgentProviderCredentialUpdateDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentProviderCredentialUpdateDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentProviderCredentialUpdateDto-objects as value to a dart map
  static Map<String, List<AgentProviderCredentialUpdateDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentProviderCredentialUpdateDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentProviderCredentialUpdateDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}


class AgentProviderCredentialUpdateDtoProviderTypeEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentProviderCredentialUpdateDtoProviderTypeEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const openai = AgentProviderCredentialUpdateDtoProviderTypeEnum._(r'openai');
  static const anthropic = AgentProviderCredentialUpdateDtoProviderTypeEnum._(r'anthropic');
  static const openaiCompatible = AgentProviderCredentialUpdateDtoProviderTypeEnum._(r'openai-compatible');

  /// List of all possible values in this [enum][AgentProviderCredentialUpdateDtoProviderTypeEnum].
  static const values = <AgentProviderCredentialUpdateDtoProviderTypeEnum>[
    openai,
    anthropic,
    openaiCompatible,
  ];

  static AgentProviderCredentialUpdateDtoProviderTypeEnum? fromJson(dynamic value) => AgentProviderCredentialUpdateDtoProviderTypeEnumTypeTransformer().decode(value);

  static List<AgentProviderCredentialUpdateDtoProviderTypeEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentProviderCredentialUpdateDtoProviderTypeEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentProviderCredentialUpdateDtoProviderTypeEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentProviderCredentialUpdateDtoProviderTypeEnum] to String,
/// and [decode] dynamic data back to [AgentProviderCredentialUpdateDtoProviderTypeEnum].
class AgentProviderCredentialUpdateDtoProviderTypeEnumTypeTransformer {
  factory AgentProviderCredentialUpdateDtoProviderTypeEnumTypeTransformer() => _instance ??= const AgentProviderCredentialUpdateDtoProviderTypeEnumTypeTransformer._();

  const AgentProviderCredentialUpdateDtoProviderTypeEnumTypeTransformer._();

  String encode(AgentProviderCredentialUpdateDtoProviderTypeEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentProviderCredentialUpdateDtoProviderTypeEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentProviderCredentialUpdateDtoProviderTypeEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'openai': return AgentProviderCredentialUpdateDtoProviderTypeEnum.openai;
        case r'anthropic': return AgentProviderCredentialUpdateDtoProviderTypeEnum.anthropic;
        case r'openai-compatible': return AgentProviderCredentialUpdateDtoProviderTypeEnum.openaiCompatible;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentProviderCredentialUpdateDtoProviderTypeEnumTypeTransformer] instance.
  static AgentProviderCredentialUpdateDtoProviderTypeEnumTypeTransformer? _instance;
}


