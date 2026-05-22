//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentAssetMetadataResult {
  /// Returns a new [AgentAssetMetadataResult] instance.
  AgentAssetMetadataResult({
    this.exifInfo,
    this.fileCreatedAt,
    this.fileModifiedAt,
    required this.id,
    this.isFavorite,
    this.localDateTime,
    this.originalFileName,
    this.tags = const [],
    this.type,
    this.visibility,
  });

  AgentAssetMetadataResultExifInfo? exifInfo;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  DateTime? fileCreatedAt;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  DateTime? fileModifiedAt;

  String id;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  bool? isFavorite;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  DateTime? localDateTime;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? originalFileName;

  List<AgentAssetMetadataTag> tags;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AssetTypeEnum? type;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AssetVisibility? visibility;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentAssetMetadataResult &&
    other.exifInfo == exifInfo &&
    other.fileCreatedAt == fileCreatedAt &&
    other.fileModifiedAt == fileModifiedAt &&
    other.id == id &&
    other.isFavorite == isFavorite &&
    other.localDateTime == localDateTime &&
    other.originalFileName == originalFileName &&
    _deepEquality.equals(other.tags, tags) &&
    other.type == type &&
    other.visibility == visibility;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (exifInfo == null ? 0 : exifInfo!.hashCode) +
    (fileCreatedAt == null ? 0 : fileCreatedAt!.hashCode) +
    (fileModifiedAt == null ? 0 : fileModifiedAt!.hashCode) +
    (id.hashCode) +
    (isFavorite == null ? 0 : isFavorite!.hashCode) +
    (localDateTime == null ? 0 : localDateTime!.hashCode) +
    (originalFileName == null ? 0 : originalFileName!.hashCode) +
    (tags.hashCode) +
    (type == null ? 0 : type!.hashCode) +
    (visibility == null ? 0 : visibility!.hashCode);

  @override
  String toString() => 'AgentAssetMetadataResult[exifInfo=$exifInfo, fileCreatedAt=$fileCreatedAt, fileModifiedAt=$fileModifiedAt, id=$id, isFavorite=$isFavorite, localDateTime=$localDateTime, originalFileName=$originalFileName, tags=$tags, type=$type, visibility=$visibility]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.exifInfo != null) {
      json[r'exifInfo'] = this.exifInfo;
    } else {
    //  json[r'exifInfo'] = null;
    }
    if (this.fileCreatedAt != null) {
      json[r'fileCreatedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.fileCreatedAt!.millisecondsSinceEpoch
        : this.fileCreatedAt!.toUtc().toIso8601String();
    } else {
    //  json[r'fileCreatedAt'] = null;
    }
    if (this.fileModifiedAt != null) {
      json[r'fileModifiedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.fileModifiedAt!.millisecondsSinceEpoch
        : this.fileModifiedAt!.toUtc().toIso8601String();
    } else {
    //  json[r'fileModifiedAt'] = null;
    }
      json[r'id'] = this.id;
    if (this.isFavorite != null) {
      json[r'isFavorite'] = this.isFavorite;
    } else {
    //  json[r'isFavorite'] = null;
    }
    if (this.localDateTime != null) {
      json[r'localDateTime'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.localDateTime!.millisecondsSinceEpoch
        : this.localDateTime!.toUtc().toIso8601String();
    } else {
    //  json[r'localDateTime'] = null;
    }
    if (this.originalFileName != null) {
      json[r'originalFileName'] = this.originalFileName;
    } else {
    //  json[r'originalFileName'] = null;
    }
      json[r'tags'] = this.tags;
    if (this.type != null) {
      json[r'type'] = this.type;
    } else {
    //  json[r'type'] = null;
    }
    if (this.visibility != null) {
      json[r'visibility'] = this.visibility;
    } else {
    //  json[r'visibility'] = null;
    }
    return json;
  }

  /// Returns a new [AgentAssetMetadataResult] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentAssetMetadataResult? fromJson(dynamic value) {
    upgradeDto(value, "AgentAssetMetadataResult");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentAssetMetadataResult(
        exifInfo: AgentAssetMetadataResultExifInfo.fromJson(json[r'exifInfo']),
        fileCreatedAt: mapDateTime(json, r'fileCreatedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        fileModifiedAt: mapDateTime(json, r'fileModifiedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        id: mapValueOfType<String>(json, r'id')!,
        isFavorite: mapValueOfType<bool>(json, r'isFavorite'),
        localDateTime: mapDateTime(json, r'localDateTime', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        originalFileName: mapValueOfType<String>(json, r'originalFileName'),
        tags: AgentAssetMetadataTag.listFromJson(json[r'tags']),
        type: AssetTypeEnum.fromJson(json[r'type']),
        visibility: AssetVisibility.fromJson(json[r'visibility']),
      );
    }
    return null;
  }

  static List<AgentAssetMetadataResult> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentAssetMetadataResult>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentAssetMetadataResult.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentAssetMetadataResult> mapFromJson(dynamic json) {
    final map = <String, AgentAssetMetadataResult>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentAssetMetadataResult.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentAssetMetadataResult-objects as value to a dart map
  static Map<String, List<AgentAssetMetadataResult>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentAssetMetadataResult>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentAssetMetadataResult.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'id',
  };
}

