//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentSearchAssetsFilters {
  /// Returns a new [AgentSearchAssetsFilters] instance.
  AgentSearchAssetsFilters({
    this.albumIds = const [],
    this.albumMatchAny,
    this.city,
    this.country,
    this.createdAfter,
    this.createdBefore,
    this.isFavorite,
    this.isNotInAlbum,
    this.isTrashed,
    this.lensModel,
    this.make,
    this.maxBrightness,
    this.maxQuality,
    this.maxSharpness,
    this.model,
    this.personIds = const [],
    this.personMatchAny,
    this.rating,
    this.spaceId,
    this.spacePersonIds = const [],
    this.state,
    this.tagIds = const [],
    this.tagMatchAny,
    this.takenAfter,
    this.takenBefore,
    this.type,
    this.updatedAfter,
    this.updatedBefore,
    this.visibility,
    this.withSharedSpaces,
  });

  List<String> albumIds;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  bool? albumMatchAny;

  String? city;

  String? country;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  DateTime? createdAfter;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  DateTime? createdBefore;

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
  bool? isTrashed;

  String? lensModel;

  String? make;

  /// Minimum value: 0
  /// Maximum value: 100
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? maxBrightness;

  /// Minimum value: 0
  /// Maximum value: 100
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? maxQuality;

  /// Minimum value: 0
  /// Maximum value: 100
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  int? maxSharpness;

  String? model;

  List<String> personIds;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  bool? personMatchAny;

  /// Minimum value: 1
  /// Maximum value: 5
  int? rating;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? spaceId;

  List<String> spacePersonIds;

  String? state;

  List<String> tagIds;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  bool? tagMatchAny;

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
  DateTime? updatedAfter;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  DateTime? updatedBefore;

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
  bool operator ==(Object other) => identical(this, other) || other is AgentSearchAssetsFilters &&
    _deepEquality.equals(other.albumIds, albumIds) &&
    other.albumMatchAny == albumMatchAny &&
    other.city == city &&
    other.country == country &&
    other.createdAfter == createdAfter &&
    other.createdBefore == createdBefore &&
    other.isFavorite == isFavorite &&
    other.isNotInAlbum == isNotInAlbum &&
    other.isTrashed == isTrashed &&
    other.lensModel == lensModel &&
    other.make == make &&
    other.maxBrightness == maxBrightness &&
    other.maxQuality == maxQuality &&
    other.maxSharpness == maxSharpness &&
    other.model == model &&
    _deepEquality.equals(other.personIds, personIds) &&
    other.personMatchAny == personMatchAny &&
    other.rating == rating &&
    other.spaceId == spaceId &&
    _deepEquality.equals(other.spacePersonIds, spacePersonIds) &&
    other.state == state &&
    _deepEquality.equals(other.tagIds, tagIds) &&
    other.tagMatchAny == tagMatchAny &&
    other.takenAfter == takenAfter &&
    other.takenBefore == takenBefore &&
    other.type == type &&
    other.updatedAfter == updatedAfter &&
    other.updatedBefore == updatedBefore &&
    other.visibility == visibility &&
    other.withSharedSpaces == withSharedSpaces;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (albumIds.hashCode) +
    (albumMatchAny == null ? 0 : albumMatchAny!.hashCode) +
    (city == null ? 0 : city!.hashCode) +
    (country == null ? 0 : country!.hashCode) +
    (createdAfter == null ? 0 : createdAfter!.hashCode) +
    (createdBefore == null ? 0 : createdBefore!.hashCode) +
    (isFavorite == null ? 0 : isFavorite!.hashCode) +
    (isNotInAlbum == null ? 0 : isNotInAlbum!.hashCode) +
    (isTrashed == null ? 0 : isTrashed!.hashCode) +
    (lensModel == null ? 0 : lensModel!.hashCode) +
    (make == null ? 0 : make!.hashCode) +
    (maxBrightness == null ? 0 : maxBrightness!.hashCode) +
    (maxQuality == null ? 0 : maxQuality!.hashCode) +
    (maxSharpness == null ? 0 : maxSharpness!.hashCode) +
    (model == null ? 0 : model!.hashCode) +
    (personIds.hashCode) +
    (personMatchAny == null ? 0 : personMatchAny!.hashCode) +
    (rating == null ? 0 : rating!.hashCode) +
    (spaceId == null ? 0 : spaceId!.hashCode) +
    (spacePersonIds.hashCode) +
    (state == null ? 0 : state!.hashCode) +
    (tagIds.hashCode) +
    (tagMatchAny == null ? 0 : tagMatchAny!.hashCode) +
    (takenAfter == null ? 0 : takenAfter!.hashCode) +
    (takenBefore == null ? 0 : takenBefore!.hashCode) +
    (type == null ? 0 : type!.hashCode) +
    (updatedAfter == null ? 0 : updatedAfter!.hashCode) +
    (updatedBefore == null ? 0 : updatedBefore!.hashCode) +
    (visibility == null ? 0 : visibility!.hashCode) +
    (withSharedSpaces == null ? 0 : withSharedSpaces!.hashCode);

  @override
  String toString() => 'AgentSearchAssetsFilters[albumIds=$albumIds, albumMatchAny=$albumMatchAny, city=$city, country=$country, createdAfter=$createdAfter, createdBefore=$createdBefore, isFavorite=$isFavorite, isNotInAlbum=$isNotInAlbum, isTrashed=$isTrashed, lensModel=$lensModel, make=$make, maxBrightness=$maxBrightness, maxQuality=$maxQuality, maxSharpness=$maxSharpness, model=$model, personIds=$personIds, personMatchAny=$personMatchAny, rating=$rating, spaceId=$spaceId, spacePersonIds=$spacePersonIds, state=$state, tagIds=$tagIds, tagMatchAny=$tagMatchAny, takenAfter=$takenAfter, takenBefore=$takenBefore, type=$type, updatedAfter=$updatedAfter, updatedBefore=$updatedBefore, visibility=$visibility, withSharedSpaces=$withSharedSpaces]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'albumIds'] = this.albumIds;
    if (this.albumMatchAny != null) {
      json[r'albumMatchAny'] = this.albumMatchAny;
    } else {
    //  json[r'albumMatchAny'] = null;
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
    if (this.createdAfter != null) {
      json[r'createdAfter'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.createdAfter!.millisecondsSinceEpoch
        : this.createdAfter!.toUtc().toIso8601String();
    } else {
    //  json[r'createdAfter'] = null;
    }
    if (this.createdBefore != null) {
      json[r'createdBefore'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.createdBefore!.millisecondsSinceEpoch
        : this.createdBefore!.toUtc().toIso8601String();
    } else {
    //  json[r'createdBefore'] = null;
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
    if (this.isTrashed != null) {
      json[r'isTrashed'] = this.isTrashed;
    } else {
    //  json[r'isTrashed'] = null;
    }
    if (this.lensModel != null) {
      json[r'lensModel'] = this.lensModel;
    } else {
    //  json[r'lensModel'] = null;
    }
    if (this.make != null) {
      json[r'make'] = this.make;
    } else {
    //  json[r'make'] = null;
    }
    if (this.maxBrightness != null) {
      json[r'maxBrightness'] = this.maxBrightness;
    } else {
    //  json[r'maxBrightness'] = null;
    }
    if (this.maxQuality != null) {
      json[r'maxQuality'] = this.maxQuality;
    } else {
    //  json[r'maxQuality'] = null;
    }
    if (this.maxSharpness != null) {
      json[r'maxSharpness'] = this.maxSharpness;
    } else {
    //  json[r'maxSharpness'] = null;
    }
    if (this.model != null) {
      json[r'model'] = this.model;
    } else {
    //  json[r'model'] = null;
    }
      json[r'personIds'] = this.personIds;
    if (this.personMatchAny != null) {
      json[r'personMatchAny'] = this.personMatchAny;
    } else {
    //  json[r'personMatchAny'] = null;
    }
    if (this.rating != null) {
      json[r'rating'] = this.rating;
    } else {
    //  json[r'rating'] = null;
    }
    if (this.spaceId != null) {
      json[r'spaceId'] = this.spaceId;
    } else {
    //  json[r'spaceId'] = null;
    }
      json[r'spacePersonIds'] = this.spacePersonIds;
    if (this.state != null) {
      json[r'state'] = this.state;
    } else {
    //  json[r'state'] = null;
    }
      json[r'tagIds'] = this.tagIds;
    if (this.tagMatchAny != null) {
      json[r'tagMatchAny'] = this.tagMatchAny;
    } else {
    //  json[r'tagMatchAny'] = null;
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
    if (this.updatedAfter != null) {
      json[r'updatedAfter'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.updatedAfter!.millisecondsSinceEpoch
        : this.updatedAfter!.toUtc().toIso8601String();
    } else {
    //  json[r'updatedAfter'] = null;
    }
    if (this.updatedBefore != null) {
      json[r'updatedBefore'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.updatedBefore!.millisecondsSinceEpoch
        : this.updatedBefore!.toUtc().toIso8601String();
    } else {
    //  json[r'updatedBefore'] = null;
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

  /// Returns a new [AgentSearchAssetsFilters] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentSearchAssetsFilters? fromJson(dynamic value) {
    upgradeDto(value, "AgentSearchAssetsFilters");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentSearchAssetsFilters(
        albumIds: json[r'albumIds'] is Iterable
            ? (json[r'albumIds'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        albumMatchAny: mapValueOfType<bool>(json, r'albumMatchAny'),
        city: mapValueOfType<String>(json, r'city'),
        country: mapValueOfType<String>(json, r'country'),
        createdAfter: mapDateTime(json, r'createdAfter', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        createdBefore: mapDateTime(json, r'createdBefore', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        isFavorite: mapValueOfType<bool>(json, r'isFavorite'),
        isNotInAlbum: mapValueOfType<bool>(json, r'isNotInAlbum'),
        isTrashed: mapValueOfType<bool>(json, r'isTrashed'),
        lensModel: mapValueOfType<String>(json, r'lensModel'),
        make: mapValueOfType<String>(json, r'make'),
        maxBrightness: mapValueOfType<int>(json, r'maxBrightness'),
        maxQuality: mapValueOfType<int>(json, r'maxQuality'),
        maxSharpness: mapValueOfType<int>(json, r'maxSharpness'),
        model: mapValueOfType<String>(json, r'model'),
        personIds: json[r'personIds'] is Iterable
            ? (json[r'personIds'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        personMatchAny: mapValueOfType<bool>(json, r'personMatchAny'),
        rating: mapValueOfType<int>(json, r'rating'),
        spaceId: mapValueOfType<String>(json, r'spaceId'),
        spacePersonIds: json[r'spacePersonIds'] is Iterable
            ? (json[r'spacePersonIds'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        state: mapValueOfType<String>(json, r'state'),
        tagIds: json[r'tagIds'] is Iterable
            ? (json[r'tagIds'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        tagMatchAny: mapValueOfType<bool>(json, r'tagMatchAny'),
        takenAfter: mapDateTime(json, r'takenAfter', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        takenBefore: mapDateTime(json, r'takenBefore', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        type: AssetTypeEnum.fromJson(json[r'type']),
        updatedAfter: mapDateTime(json, r'updatedAfter', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        updatedBefore: mapDateTime(json, r'updatedBefore', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        visibility: AssetVisibility.fromJson(json[r'visibility']),
        withSharedSpaces: mapValueOfType<bool>(json, r'withSharedSpaces'),
      );
    }
    return null;
  }

  static List<AgentSearchAssetsFilters> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentSearchAssetsFilters>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentSearchAssetsFilters.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentSearchAssetsFilters> mapFromJson(dynamic json) {
    final map = <String, AgentSearchAssetsFilters>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentSearchAssetsFilters.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentSearchAssetsFilters-objects as value to a dart map
  static Map<String, List<AgentSearchAssetsFilters>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentSearchAssetsFilters>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentSearchAssetsFilters.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

