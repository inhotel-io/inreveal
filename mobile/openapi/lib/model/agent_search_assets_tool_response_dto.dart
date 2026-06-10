//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentSearchAssetsToolResponseDto {
  /// Returns a new [AgentSearchAssetsToolResponseDto] instance.
  AgentSearchAssetsToolResponseDto({
    required this.status,
    required this.toolCall,
    required this.reason,
    this.approximateTotal = const Optional.absent(),
    required this.detail,
    required this.hasMore,
    required this.nextPage,
    required this.resultSize,
    required this.returnedCount,
    this.sample = const Optional.absent(),
    required this.selectionHandle,
    required this.summary,
    this.totalCount = const Optional.absent(),
  });

  AgentSearchAssetsToolResponseDtoStatusEnum status;

  AgentToolCallResponseDto toolCall;

  String reason;

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  Optional<int?> approximateTotal;

  AgentSearchAssetsDetail detail;

  bool hasMore;

  String? nextPage;

  AgentToolResultSize resultSize;

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  int returnedCount;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  Optional<AgentSearchAssetsSample?> sample;

  AgentSearchAssetsSelectionHandle selectionHandle;

  String summary;

  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  Optional<int?> totalCount;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentSearchAssetsToolResponseDto &&
    other.status == status &&
    other.toolCall == toolCall &&
    other.reason == reason &&
    other.approximateTotal == approximateTotal &&
    other.detail == detail &&
    other.hasMore == hasMore &&
    other.nextPage == nextPage &&
    other.resultSize == resultSize &&
    other.returnedCount == returnedCount &&
    other.sample == sample &&
    other.selectionHandle == selectionHandle &&
    other.summary == summary &&
    other.totalCount == totalCount;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (status.hashCode) +
    (toolCall.hashCode) +
    (reason.hashCode) +
    (approximateTotal == null ? 0 : approximateTotal!.hashCode) +
    (detail.hashCode) +
    (hasMore.hashCode) +
    (nextPage == null ? 0 : nextPage!.hashCode) +
    (resultSize.hashCode) +
    (returnedCount.hashCode) +
    (sample == null ? 0 : sample!.hashCode) +
    (selectionHandle.hashCode) +
    (summary.hashCode) +
    (totalCount == null ? 0 : totalCount!.hashCode);

  @override
  String toString() => 'AgentSearchAssetsToolResponseDto[status=$status, toolCall=$toolCall, reason=$reason, approximateTotal=$approximateTotal, detail=$detail, hasMore=$hasMore, nextPage=$nextPage, resultSize=$resultSize, returnedCount=$returnedCount, sample=$sample, selectionHandle=$selectionHandle, summary=$summary, totalCount=$totalCount]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'status'] = this.status;
      json[r'toolCall'] = this.toolCall;
      json[r'reason'] = this.reason;
    if (this.approximateTotal.isPresent) {
      final value = this.approximateTotal.value;
      json[r'approximateTotal'] = value;
    }
      json[r'detail'] = this.detail;
      json[r'hasMore'] = this.hasMore;
    if (this.nextPage != null) {
      json[r'nextPage'] = this.nextPage;
    } else {
    //  json[r'nextPage'] = null;
    }
      json[r'resultSize'] = this.resultSize;
      json[r'returnedCount'] = this.returnedCount;
    if (this.sample.isPresent) {
      final value = this.sample.value;
      json[r'sample'] = value;
    }
      json[r'selectionHandle'] = this.selectionHandle;
      json[r'summary'] = this.summary;
    if (this.totalCount.isPresent) {
      final value = this.totalCount.value;
      json[r'totalCount'] = value;
    }
    return json;
  }

  /// Returns a new [AgentSearchAssetsToolResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentSearchAssetsToolResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "AgentSearchAssetsToolResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentSearchAssetsToolResponseDto(
        status: AgentSearchAssetsToolResponseDtoStatusEnum.fromJson(json[r'status'])!,
        toolCall: AgentToolCallResponseDto.fromJson(json[r'toolCall'])!,
        reason: mapValueOfType<String>(json, r'reason')!,
        approximateTotal: json.containsKey(r'approximateTotal') ? Optional.present(json[r'approximateTotal'] == null ? null : int.parse('${json[r'approximateTotal']}')) : const Optional.absent(),
        detail: AgentSearchAssetsDetail.fromJson(json[r'detail'])!,
        hasMore: mapValueOfType<bool>(json, r'hasMore')!,
        nextPage: mapValueOfType<String>(json, r'nextPage'),
        resultSize: AgentToolResultSize.fromJson(json[r'resultSize'])!,
        returnedCount: mapValueOfType<int>(json, r'returnedCount')!,
        sample: json.containsKey(r'sample') ? Optional.present(AgentSearchAssetsSample.fromJson(json[r'sample'])) : const Optional.absent(),
        selectionHandle: AgentSearchAssetsSelectionHandle.fromJson(json[r'selectionHandle'])!,
        summary: mapValueOfType<String>(json, r'summary')!,
        totalCount: json.containsKey(r'totalCount') ? Optional.present(json[r'totalCount'] == null ? null : int.parse('${json[r'totalCount']}')) : const Optional.absent(),
      );
    }
    return null;
  }

  static List<AgentSearchAssetsToolResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentSearchAssetsToolResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentSearchAssetsToolResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentSearchAssetsToolResponseDto> mapFromJson(dynamic json) {
    final map = <String, AgentSearchAssetsToolResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentSearchAssetsToolResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentSearchAssetsToolResponseDto-objects as value to a dart map
  static Map<String, List<AgentSearchAssetsToolResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentSearchAssetsToolResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentSearchAssetsToolResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'status',
    'toolCall',
    'reason',
    'detail',
    'hasMore',
    'nextPage',
    'resultSize',
    'returnedCount',
    'selectionHandle',
    'summary',
  };
}


class AgentSearchAssetsToolResponseDtoStatusEnum {
  /// Instantiate a new enum with the provided [value].
  const AgentSearchAssetsToolResponseDtoStatusEnum._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const success = AgentSearchAssetsToolResponseDtoStatusEnum._(r'success');

  /// List of all possible values in this [enum][AgentSearchAssetsToolResponseDtoStatusEnum].
  static const values = <AgentSearchAssetsToolResponseDtoStatusEnum>[
    success,
  ];

  static AgentSearchAssetsToolResponseDtoStatusEnum? fromJson(dynamic value) => AgentSearchAssetsToolResponseDtoStatusEnumTypeTransformer().decode(value);

  static List<AgentSearchAssetsToolResponseDtoStatusEnum> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentSearchAssetsToolResponseDtoStatusEnum>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentSearchAssetsToolResponseDtoStatusEnum.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [AgentSearchAssetsToolResponseDtoStatusEnum] to String,
/// and [decode] dynamic data back to [AgentSearchAssetsToolResponseDtoStatusEnum].
class AgentSearchAssetsToolResponseDtoStatusEnumTypeTransformer {
  factory AgentSearchAssetsToolResponseDtoStatusEnumTypeTransformer() => _instance ??= const AgentSearchAssetsToolResponseDtoStatusEnumTypeTransformer._();

  const AgentSearchAssetsToolResponseDtoStatusEnumTypeTransformer._();

  String encode(AgentSearchAssetsToolResponseDtoStatusEnum data) => data.value;

  /// Decodes a [dynamic value][data] to a AgentSearchAssetsToolResponseDtoStatusEnum.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  AgentSearchAssetsToolResponseDtoStatusEnum? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'success': return AgentSearchAssetsToolResponseDtoStatusEnum.success;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [AgentSearchAssetsToolResponseDtoStatusEnumTypeTransformer] instance.
  static AgentSearchAssetsToolResponseDtoStatusEnumTypeTransformer? _instance;
}


