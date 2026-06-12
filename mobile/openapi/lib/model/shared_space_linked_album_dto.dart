//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class SharedSpaceLinkedAlbumDto {
  /// Returns a new [SharedSpaceLinkedAlbumDto] instance.
  SharedSpaceLinkedAlbumDto({
    required this.addedById,
    required this.albumId,
    required this.albumName,
    required this.albumThumbnailAssetId,
    required this.assetCount,
    required this.createdAt,
    required this.showInTimeline,
  });

  String? addedById;

  String albumId;

  String albumName;

  String? albumThumbnailAssetId;

  num assetCount;

  /// Link creation timestamp
  DateTime createdAt;

  bool showInTimeline;

  @override
  bool operator ==(Object other) => identical(this, other) || other is SharedSpaceLinkedAlbumDto &&
    other.addedById == addedById &&
    other.albumId == albumId &&
    other.albumName == albumName &&
    other.albumThumbnailAssetId == albumThumbnailAssetId &&
    other.assetCount == assetCount &&
    other.createdAt == createdAt &&
    other.showInTimeline == showInTimeline;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (addedById == null ? 0 : addedById!.hashCode) +
    (albumId.hashCode) +
    (albumName.hashCode) +
    (albumThumbnailAssetId == null ? 0 : albumThumbnailAssetId!.hashCode) +
    (assetCount.hashCode) +
    (createdAt.hashCode) +
    (showInTimeline.hashCode);

  @override
  String toString() => 'SharedSpaceLinkedAlbumDto[addedById=$addedById, albumId=$albumId, albumName=$albumName, albumThumbnailAssetId=$albumThumbnailAssetId, assetCount=$assetCount, createdAt=$createdAt, showInTimeline=$showInTimeline]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.addedById != null) {
      json[r'addedById'] = this.addedById;
    } else {
    //  json[r'addedById'] = null;
    }
      json[r'albumId'] = this.albumId;
      json[r'albumName'] = this.albumName;
    if (this.albumThumbnailAssetId != null) {
      json[r'albumThumbnailAssetId'] = this.albumThumbnailAssetId;
    } else {
    //  json[r'albumThumbnailAssetId'] = null;
    }
      json[r'assetCount'] = this.assetCount;
      json[r'createdAt'] = this.createdAt.toUtc().toIso8601String();
      json[r'showInTimeline'] = this.showInTimeline;
    return json;
  }

  /// Returns a new [SharedSpaceLinkedAlbumDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static SharedSpaceLinkedAlbumDto? fromJson(dynamic value) {
    upgradeDto(value, "SharedSpaceLinkedAlbumDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return SharedSpaceLinkedAlbumDto(
        addedById: mapValueOfType<String>(json, r'addedById'),
        albumId: mapValueOfType<String>(json, r'albumId')!,
        albumName: mapValueOfType<String>(json, r'albumName')!,
        albumThumbnailAssetId: mapValueOfType<String>(json, r'albumThumbnailAssetId'),
        assetCount: num.parse('${json[r'assetCount']}'),
        createdAt: mapDateTime(json, r'createdAt', r'')!,
        showInTimeline: mapValueOfType<bool>(json, r'showInTimeline')!,
      );
    }
    return null;
  }

  static List<SharedSpaceLinkedAlbumDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <SharedSpaceLinkedAlbumDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SharedSpaceLinkedAlbumDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, SharedSpaceLinkedAlbumDto> mapFromJson(dynamic json) {
    final map = <String, SharedSpaceLinkedAlbumDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = SharedSpaceLinkedAlbumDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of SharedSpaceLinkedAlbumDto-objects as value to a dart map
  static Map<String, List<SharedSpaceLinkedAlbumDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<SharedSpaceLinkedAlbumDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = SharedSpaceLinkedAlbumDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'addedById',
    'albumId',
    'albumName',
    'albumThumbnailAssetId',
    'assetCount',
    'createdAt',
    'showInTimeline',
  };
}

