//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentSearchAssetsToolRequestDto {
  /// Returns a new [AgentSearchAssetsToolRequestDto] instance.
  AgentSearchAssetsToolRequestDto({
    this.createSelectionHandle,
    this.detail,
    this.fields = const [],
    this.filters,
    this.limit,
    this.mode,
    this.order,
    this.page,
    this.query,
    this.sampleSize,
    this.toolCallId,
  });

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  bool? createSelectionHandle;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AgentSearchAssetsDetail? detail;

  List<AgentSearchAssetsField> fields;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AgentSearchAssetsFilters? filters;

  /// Minimum value: 1
  /// Maximum value: 10000
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? limit;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AgentSearchAssetsMode? mode;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AgentSearchAssetsOrder? order;

  /// Minimum value: 1
  /// Maximum value: 9007199254740991
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? page;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? query;

  /// Minimum value: 0
  /// Maximum value: 25
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? sampleSize;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? toolCallId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentSearchAssetsToolRequestDto &&
    other.createSelectionHandle == createSelectionHandle &&
    other.detail == detail &&
    _deepEquality.equals(other.fields, fields) &&
    other.filters == filters &&
    other.limit == limit &&
    other.mode == mode &&
    other.order == order &&
    other.page == page &&
    other.query == query &&
    other.sampleSize == sampleSize &&
    other.toolCallId == toolCallId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (createSelectionHandle == null ? 0 : createSelectionHandle!.hashCode) +
    (detail == null ? 0 : detail!.hashCode) +
    (fields.hashCode) +
    (filters == null ? 0 : filters!.hashCode) +
    (limit == null ? 0 : limit!.hashCode) +
    (mode == null ? 0 : mode!.hashCode) +
    (order == null ? 0 : order!.hashCode) +
    (page == null ? 0 : page!.hashCode) +
    (query == null ? 0 : query!.hashCode) +
    (sampleSize == null ? 0 : sampleSize!.hashCode) +
    (toolCallId == null ? 0 : toolCallId!.hashCode);

  @override
  String toString() => 'AgentSearchAssetsToolRequestDto[createSelectionHandle=$createSelectionHandle, detail=$detail, fields=$fields, filters=$filters, limit=$limit, mode=$mode, order=$order, page=$page, query=$query, sampleSize=$sampleSize, toolCallId=$toolCallId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.createSelectionHandle != null) {
      json[r'createSelectionHandle'] = this.createSelectionHandle;
    } else {
    //  json[r'createSelectionHandle'] = null;
    }
    if (this.detail != null) {
      json[r'detail'] = this.detail;
    } else {
    //  json[r'detail'] = null;
    }
      json[r'fields'] = this.fields;
    if (this.filters != null) {
      json[r'filters'] = this.filters;
    } else {
    //  json[r'filters'] = null;
    }
    if (this.limit != null) {
      json[r'limit'] = this.limit;
    } else {
    //  json[r'limit'] = null;
    }
    if (this.mode != null) {
      json[r'mode'] = this.mode;
    } else {
    //  json[r'mode'] = null;
    }
    if (this.order != null) {
      json[r'order'] = this.order;
    } else {
    //  json[r'order'] = null;
    }
    if (this.page != null) {
      json[r'page'] = this.page;
    } else {
    //  json[r'page'] = null;
    }
    if (this.query != null) {
      json[r'query'] = this.query;
    } else {
    //  json[r'query'] = null;
    }
    if (this.sampleSize != null) {
      json[r'sampleSize'] = this.sampleSize;
    } else {
    //  json[r'sampleSize'] = null;
    }
    if (this.toolCallId != null) {
      json[r'toolCallId'] = this.toolCallId;
    } else {
    //  json[r'toolCallId'] = null;
    }
    return json;
  }

  /// Returns a new [AgentSearchAssetsToolRequestDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentSearchAssetsToolRequestDto? fromJson(dynamic value) {
    upgradeDto(value, "AgentSearchAssetsToolRequestDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentSearchAssetsToolRequestDto(
        createSelectionHandle: mapValueOfType<bool>(json, r'createSelectionHandle'),
        detail: AgentSearchAssetsDetail.fromJson(json[r'detail']),
        fields: AgentSearchAssetsField.listFromJson(json[r'fields']),
        filters: AgentSearchAssetsFilters.fromJson(json[r'filters']),
        limit: mapValueOfType<int>(json, r'limit'),
        mode: AgentSearchAssetsMode.fromJson(json[r'mode']),
        order: AgentSearchAssetsOrder.fromJson(json[r'order']),
        page: mapValueOfType<int>(json, r'page'),
        query: mapValueOfType<String>(json, r'query'),
        sampleSize: mapValueOfType<int>(json, r'sampleSize'),
        toolCallId: mapValueOfType<String>(json, r'toolCallId'),
      );
    }
    return null;
  }

  static List<AgentSearchAssetsToolRequestDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentSearchAssetsToolRequestDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentSearchAssetsToolRequestDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentSearchAssetsToolRequestDto> mapFromJson(dynamic json) {
    final map = <String, AgentSearchAssetsToolRequestDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentSearchAssetsToolRequestDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentSearchAssetsToolRequestDto-objects as value to a dart map
  static Map<String, List<AgentSearchAssetsToolRequestDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentSearchAssetsToolRequestDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentSearchAssetsToolRequestDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

