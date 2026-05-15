//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentAssetMetadata {
  /// Returns a new [AgentAssetMetadata] instance.
  AgentAssetMetadata({
    required this.exifInfo,
    required this.fileCreatedAt,
    required this.fileModifiedAt,
    required this.id,
    required this.isFavorite,
    required this.localDateTime,
    required this.originalFileName,
    required this.ownerId,
    this.tags = const [],
    required this.type,
    required this.visibility,
  });

  AgentAssetMetadataExif? exifInfo;

  DateTime fileCreatedAt;

  DateTime fileModifiedAt;

  String id;

  bool isFavorite;

  DateTime localDateTime;

  String originalFileName;

  String ownerId;

  List<AgentAssetMetadataTag> tags;

  AssetTypeEnum type;

  AssetVisibility visibility;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentAssetMetadata &&
    other.exifInfo == exifInfo &&
    other.fileCreatedAt == fileCreatedAt &&
    other.fileModifiedAt == fileModifiedAt &&
    other.id == id &&
    other.isFavorite == isFavorite &&
    other.localDateTime == localDateTime &&
    other.originalFileName == originalFileName &&
    other.ownerId == ownerId &&
    _deepEquality.equals(other.tags, tags) &&
    other.type == type &&
    other.visibility == visibility;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (exifInfo == null ? 0 : exifInfo!.hashCode) +
    (fileCreatedAt.hashCode) +
    (fileModifiedAt.hashCode) +
    (id.hashCode) +
    (isFavorite.hashCode) +
    (localDateTime.hashCode) +
    (originalFileName.hashCode) +
    (ownerId.hashCode) +
    (tags.hashCode) +
    (type.hashCode) +
    (visibility.hashCode);

  @override
  String toString() => 'AgentAssetMetadata[exifInfo=$exifInfo, fileCreatedAt=$fileCreatedAt, fileModifiedAt=$fileModifiedAt, id=$id, isFavorite=$isFavorite, localDateTime=$localDateTime, originalFileName=$originalFileName, ownerId=$ownerId, tags=$tags, type=$type, visibility=$visibility]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.exifInfo != null) {
      json[r'exifInfo'] = this.exifInfo;
    } else {
    //  json[r'exifInfo'] = null;
    }
      json[r'fileCreatedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.fileCreatedAt.millisecondsSinceEpoch
        : this.fileCreatedAt.toUtc().toIso8601String();
      json[r'fileModifiedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.fileModifiedAt.millisecondsSinceEpoch
        : this.fileModifiedAt.toUtc().toIso8601String();
      json[r'id'] = this.id;
      json[r'isFavorite'] = this.isFavorite;
      json[r'localDateTime'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.localDateTime.millisecondsSinceEpoch
        : this.localDateTime.toUtc().toIso8601String();
      json[r'originalFileName'] = this.originalFileName;
      json[r'ownerId'] = this.ownerId;
      json[r'tags'] = this.tags;
      json[r'type'] = this.type;
      json[r'visibility'] = this.visibility;
    return json;
  }

  /// Returns a new [AgentAssetMetadata] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentAssetMetadata? fromJson(dynamic value) {
    upgradeDto(value, "AgentAssetMetadata");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentAssetMetadata(
        exifInfo: AgentAssetMetadataExif.fromJson(json[r'exifInfo']),
        fileCreatedAt: mapDateTime(json, r'fileCreatedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')!,
        fileModifiedAt: mapDateTime(json, r'fileModifiedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')!,
        id: mapValueOfType<String>(json, r'id')!,
        isFavorite: mapValueOfType<bool>(json, r'isFavorite')!,
        localDateTime: mapDateTime(json, r'localDateTime', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')!,
        originalFileName: mapValueOfType<String>(json, r'originalFileName')!,
        ownerId: mapValueOfType<String>(json, r'ownerId')!,
        tags: AgentAssetMetadataTag.listFromJson(json[r'tags']),
        type: AssetTypeEnum.fromJson(json[r'type'])!,
        visibility: AssetVisibility.fromJson(json[r'visibility'])!,
      );
    }
    return null;
  }

  static List<AgentAssetMetadata> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentAssetMetadata>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentAssetMetadata.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentAssetMetadata> mapFromJson(dynamic json) {
    final map = <String, AgentAssetMetadata>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentAssetMetadata.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentAssetMetadata-objects as value to a dart map
  static Map<String, List<AgentAssetMetadata>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentAssetMetadata>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentAssetMetadata.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'exifInfo',
    'fileCreatedAt',
    'fileModifiedAt',
    'id',
    'isFavorite',
    'localDateTime',
    'originalFileName',
    'ownerId',
    'tags',
    'type',
    'visibility',
  };
}

