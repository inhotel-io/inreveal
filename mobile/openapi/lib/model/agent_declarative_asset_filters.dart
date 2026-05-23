//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentDeclarativeAssetFilters {
  /// Returns a new [AgentDeclarativeAssetFilters] instance.
  AgentDeclarativeAssetFilters({
    this.albums,
    this.camera,
    this.city,
    this.country,
    this.isFavorite,
    this.isNotInAlbum,
    this.people,
    this.rating,
    this.space,
    this.state,
    this.tags,
    this.takenAfter,
    this.takenBefore,
    this.type,
    this.visibility,
    this.withSharedSpaces,
  });

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AgentDeclarativeNamedFilter? albums;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AgentDeclarativeCameraFilter? camera;

  String? city;

  String? country;

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
  bool? isNotInAlbum;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AgentDeclarativeNamedFilter? people;

  /// Minimum value: 1
  /// Maximum value: 5
  int? rating;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AgentDeclarativeSpaceFilter? space;

  String? state;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  AgentDeclarativeNamedFilter? tags;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  DateTime? takenAfter;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  DateTime? takenBefore;

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

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  bool? withSharedSpaces;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentDeclarativeAssetFilters &&
    other.albums == albums &&
    other.camera == camera &&
    other.city == city &&
    other.country == country &&
    other.isFavorite == isFavorite &&
    other.isNotInAlbum == isNotInAlbum &&
    other.people == people &&
    other.rating == rating &&
    other.space == space &&
    other.state == state &&
    other.tags == tags &&
    other.takenAfter == takenAfter &&
    other.takenBefore == takenBefore &&
    other.type == type &&
    other.visibility == visibility &&
    other.withSharedSpaces == withSharedSpaces;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (albums == null ? 0 : albums!.hashCode) +
    (camera == null ? 0 : camera!.hashCode) +
    (city == null ? 0 : city!.hashCode) +
    (country == null ? 0 : country!.hashCode) +
    (isFavorite == null ? 0 : isFavorite!.hashCode) +
    (isNotInAlbum == null ? 0 : isNotInAlbum!.hashCode) +
    (people == null ? 0 : people!.hashCode) +
    (rating == null ? 0 : rating!.hashCode) +
    (space == null ? 0 : space!.hashCode) +
    (state == null ? 0 : state!.hashCode) +
    (tags == null ? 0 : tags!.hashCode) +
    (takenAfter == null ? 0 : takenAfter!.hashCode) +
    (takenBefore == null ? 0 : takenBefore!.hashCode) +
    (type == null ? 0 : type!.hashCode) +
    (visibility == null ? 0 : visibility!.hashCode) +
    (withSharedSpaces == null ? 0 : withSharedSpaces!.hashCode);

  @override
  String toString() => 'AgentDeclarativeAssetFilters[albums=$albums, camera=$camera, city=$city, country=$country, isFavorite=$isFavorite, isNotInAlbum=$isNotInAlbum, people=$people, rating=$rating, space=$space, state=$state, tags=$tags, takenAfter=$takenAfter, takenBefore=$takenBefore, type=$type, visibility=$visibility, withSharedSpaces=$withSharedSpaces]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.albums != null) {
      json[r'albums'] = this.albums;
    } else {
    //  json[r'albums'] = null;
    }
    if (this.camera != null) {
      json[r'camera'] = this.camera;
    } else {
    //  json[r'camera'] = null;
    }
    if (this.city != null) {
      json[r'city'] = this.city;
    } else {
    //  json[r'city'] = null;
    }
    if (this.country != null) {
      json[r'country'] = this.country;
    } else {
    //  json[r'country'] = null;
    }
    if (this.isFavorite != null) {
      json[r'isFavorite'] = this.isFavorite;
    } else {
    //  json[r'isFavorite'] = null;
    }
    if (this.isNotInAlbum != null) {
      json[r'isNotInAlbum'] = this.isNotInAlbum;
    } else {
    //  json[r'isNotInAlbum'] = null;
    }
    if (this.people != null) {
      json[r'people'] = this.people;
    } else {
    //  json[r'people'] = null;
    }
    if (this.rating != null) {
      json[r'rating'] = this.rating;
    } else {
    //  json[r'rating'] = null;
    }
    if (this.space != null) {
      json[r'space'] = this.space;
    } else {
    //  json[r'space'] = null;
    }
    if (this.state != null) {
      json[r'state'] = this.state;
    } else {
    //  json[r'state'] = null;
    }
    if (this.tags != null) {
      json[r'tags'] = this.tags;
    } else {
    //  json[r'tags'] = null;
    }
    if (this.takenAfter != null) {
      json[r'takenAfter'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.takenAfter!.millisecondsSinceEpoch
        : this.takenAfter!.toUtc().toIso8601String();
    } else {
    //  json[r'takenAfter'] = null;
    }
    if (this.takenBefore != null) {
      json[r'takenBefore'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.takenBefore!.millisecondsSinceEpoch
        : this.takenBefore!.toUtc().toIso8601String();
    } else {
    //  json[r'takenBefore'] = null;
    }
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
    if (this.withSharedSpaces != null) {
      json[r'withSharedSpaces'] = this.withSharedSpaces;
    } else {
    //  json[r'withSharedSpaces'] = null;
    }
    return json;
  }

  /// Returns a new [AgentDeclarativeAssetFilters] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentDeclarativeAssetFilters? fromJson(dynamic value) {
    upgradeDto(value, "AgentDeclarativeAssetFilters");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentDeclarativeAssetFilters(
        albums: AgentDeclarativeNamedFilter.fromJson(json[r'albums']),
        camera: AgentDeclarativeCameraFilter.fromJson(json[r'camera']),
        city: mapValueOfType<String>(json, r'city'),
        country: mapValueOfType<String>(json, r'country'),
        isFavorite: mapValueOfType<bool>(json, r'isFavorite'),
        isNotInAlbum: mapValueOfType<bool>(json, r'isNotInAlbum'),
        people: AgentDeclarativeNamedFilter.fromJson(json[r'people']),
        rating: mapValueOfType<int>(json, r'rating'),
        space: AgentDeclarativeSpaceFilter.fromJson(json[r'space']),
        state: mapValueOfType<String>(json, r'state'),
        tags: AgentDeclarativeNamedFilter.fromJson(json[r'tags']),
        takenAfter: mapDateTime(json, r'takenAfter', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        takenBefore: mapDateTime(json, r'takenBefore', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        type: AssetTypeEnum.fromJson(json[r'type']),
        visibility: AssetVisibility.fromJson(json[r'visibility']),
        withSharedSpaces: mapValueOfType<bool>(json, r'withSharedSpaces'),
      );
    }
    return null;
  }

  static List<AgentDeclarativeAssetFilters> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentDeclarativeAssetFilters>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentDeclarativeAssetFilters.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentDeclarativeAssetFilters> mapFromJson(dynamic json) {
    final map = <String, AgentDeclarativeAssetFilters>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentDeclarativeAssetFilters.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentDeclarativeAssetFilters-objects as value to a dart map
  static Map<String, List<AgentDeclarativeAssetFilters>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentDeclarativeAssetFilters>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentDeclarativeAssetFilters.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

