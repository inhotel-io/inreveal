//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class AgentAssetMetadataExif {
  /// Returns a new [AgentAssetMetadataExif] instance.
  AgentAssetMetadataExif({
    required this.city,
    required this.country,
    required this.dateTimeOriginal,
    required this.latitude,
    required this.lensModel,
    required this.longitude,
    required this.make,
    required this.model,
    required this.rating,
    required this.state,
  });

  String? city;

  String? country;

  DateTime? dateTimeOriginal;

  num? latitude;

  String? lensModel;

  num? longitude;

  String? make;

  String? model;

  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int? rating;

  String? state;

  @override
  bool operator ==(Object other) => identical(this, other) || other is AgentAssetMetadataExif &&
    other.city == city &&
    other.country == country &&
    other.dateTimeOriginal == dateTimeOriginal &&
    other.latitude == latitude &&
    other.lensModel == lensModel &&
    other.longitude == longitude &&
    other.make == make &&
    other.model == model &&
    other.rating == rating &&
    other.state == state;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (city == null ? 0 : city!.hashCode) +
    (country == null ? 0 : country!.hashCode) +
    (dateTimeOriginal == null ? 0 : dateTimeOriginal!.hashCode) +
    (latitude == null ? 0 : latitude!.hashCode) +
    (lensModel == null ? 0 : lensModel!.hashCode) +
    (longitude == null ? 0 : longitude!.hashCode) +
    (make == null ? 0 : make!.hashCode) +
    (model == null ? 0 : model!.hashCode) +
    (rating == null ? 0 : rating!.hashCode) +
    (state == null ? 0 : state!.hashCode);

  @override
  String toString() => 'AgentAssetMetadataExif[city=$city, country=$country, dateTimeOriginal=$dateTimeOriginal, latitude=$latitude, lensModel=$lensModel, longitude=$longitude, make=$make, model=$model, rating=$rating, state=$state]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
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
    if (this.dateTimeOriginal != null) {
      json[r'dateTimeOriginal'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/')
        ? this.dateTimeOriginal!.millisecondsSinceEpoch
        : this.dateTimeOriginal!.toUtc().toIso8601String();
    } else {
    //  json[r'dateTimeOriginal'] = null;
    }
    if (this.latitude != null) {
      json[r'latitude'] = this.latitude;
    } else {
    //  json[r'latitude'] = null;
    }
    if (this.lensModel != null) {
      json[r'lensModel'] = this.lensModel;
    } else {
    //  json[r'lensModel'] = null;
    }
    if (this.longitude != null) {
      json[r'longitude'] = this.longitude;
    } else {
    //  json[r'longitude'] = null;
    }
    if (this.make != null) {
      json[r'make'] = this.make;
    } else {
    //  json[r'make'] = null;
    }
    if (this.model != null) {
      json[r'model'] = this.model;
    } else {
    //  json[r'model'] = null;
    }
    if (this.rating != null) {
      json[r'rating'] = this.rating;
    } else {
    //  json[r'rating'] = null;
    }
    if (this.state != null) {
      json[r'state'] = this.state;
    } else {
    //  json[r'state'] = null;
    }
    return json;
  }

  /// Returns a new [AgentAssetMetadataExif] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static AgentAssetMetadataExif? fromJson(dynamic value) {
    upgradeDto(value, "AgentAssetMetadataExif");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return AgentAssetMetadataExif(
        city: mapValueOfType<String>(json, r'city'),
        country: mapValueOfType<String>(json, r'country'),
        dateTimeOriginal: mapDateTime(json, r'dateTimeOriginal', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$/'),
        latitude: json[r'latitude'] == null
            ? null
            : num.parse('${json[r'latitude']}'),
        lensModel: mapValueOfType<String>(json, r'lensModel'),
        longitude: json[r'longitude'] == null
            ? null
            : num.parse('${json[r'longitude']}'),
        make: mapValueOfType<String>(json, r'make'),
        model: mapValueOfType<String>(json, r'model'),
        rating: mapValueOfType<int>(json, r'rating'),
        state: mapValueOfType<String>(json, r'state'),
      );
    }
    return null;
  }

  static List<AgentAssetMetadataExif> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <AgentAssetMetadataExif>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = AgentAssetMetadataExif.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, AgentAssetMetadataExif> mapFromJson(dynamic json) {
    final map = <String, AgentAssetMetadataExif>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = AgentAssetMetadataExif.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of AgentAssetMetadataExif-objects as value to a dart map
  static Map<String, List<AgentAssetMetadataExif>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<AgentAssetMetadataExif>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = AgentAssetMetadataExif.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'city',
    'country',
    'dateTimeOriginal',
    'latitude',
    'lensModel',
    'longitude',
    'make',
    'model',
    'rating',
    'state',
  };
}

