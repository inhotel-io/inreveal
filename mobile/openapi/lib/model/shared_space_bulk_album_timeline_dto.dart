//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class SharedSpaceBulkAlbumTimelineDto {
  /// Returns a new [SharedSpaceBulkAlbumTimelineDto] instance.
  SharedSpaceBulkAlbumTimelineDto({
    this.ids = const [],
    required this.showInTimeline,
  });

  /// IDs to process
  List<String> ids;

  /// Whether the albums appear in the space timeline
  bool showInTimeline;

  @override
  bool operator ==(Object other) => identical(this, other) || other is SharedSpaceBulkAlbumTimelineDto &&
    _deepEquality.equals(other.ids, ids) &&
    other.showInTimeline == showInTimeline;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (ids.hashCode) +
    (showInTimeline.hashCode);

  @override
  String toString() => 'SharedSpaceBulkAlbumTimelineDto[ids=$ids, showInTimeline=$showInTimeline]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'ids'] = this.ids;
      json[r'showInTimeline'] = this.showInTimeline;
    return json;
  }

  /// Returns a new [SharedSpaceBulkAlbumTimelineDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static SharedSpaceBulkAlbumTimelineDto? fromJson(dynamic value) {
    upgradeDto(value, "SharedSpaceBulkAlbumTimelineDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return SharedSpaceBulkAlbumTimelineDto(
        ids: json[r'ids'] is Iterable
            ? (json[r'ids'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        showInTimeline: mapValueOfType<bool>(json, r'showInTimeline')!,
      );
    }
    return null;
  }

  static List<SharedSpaceBulkAlbumTimelineDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <SharedSpaceBulkAlbumTimelineDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = SharedSpaceBulkAlbumTimelineDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, SharedSpaceBulkAlbumTimelineDto> mapFromJson(dynamic json) {
    final map = <String, SharedSpaceBulkAlbumTimelineDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = SharedSpaceBulkAlbumTimelineDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of SharedSpaceBulkAlbumTimelineDto-objects as value to a dart map
  static Map<String, List<SharedSpaceBulkAlbumTimelineDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<SharedSpaceBulkAlbumTimelineDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = SharedSpaceBulkAlbumTimelineDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'ids',
    'showInTimeline',
  };
}

