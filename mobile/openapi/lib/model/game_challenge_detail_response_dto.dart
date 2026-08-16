//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class GameChallengeDetailResponseDto {
  /// Returns a new [GameChallengeDetailResponseDto] instance.
  GameChallengeDetailResponseDto({
    required this.closedAt,
    required this.createdAt,
    required this.dailyOn,
    required this.id,
    required this.name,
    required this.roundCount,
    this.rounds = const [],
    required this.scaleDays,
    required this.scaleKm,
    required this.spaceId,
  });

  /// When this challenge was closed, if at all
  DateTime? closedAt;

  /// Creation date
  DateTime createdAt;

  /// The UTC date this is the space's daily challenge for, or null for a player-created one
  String? dailyOn;

  /// Challenge ID
  String id;

  /// Challenge name
  String name;

  /// Number of rounds actually generated (may be less than requested)
  num roundCount;

  /// Rounds, with answers withheld until guessed
  List<GameRoundDetailResponseDto> rounds;

  /// Frozen day scale used to score date rounds
  num scaleDays;

  /// Frozen distance scale used to score location rounds
  num scaleKm;

  /// Shared space ID
  String spaceId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is GameChallengeDetailResponseDto &&
    other.closedAt == closedAt &&
    other.createdAt == createdAt &&
    other.dailyOn == dailyOn &&
    other.id == id &&
    other.name == name &&
    other.roundCount == roundCount &&
    _deepEquality.equals(other.rounds, rounds) &&
    other.scaleDays == scaleDays &&
    other.scaleKm == scaleKm &&
    other.spaceId == spaceId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (closedAt == null ? 0 : closedAt!.hashCode) +
    (createdAt.hashCode) +
    (dailyOn == null ? 0 : dailyOn!.hashCode) +
    (id.hashCode) +
    (name.hashCode) +
    (roundCount.hashCode) +
    (rounds.hashCode) +
    (scaleDays.hashCode) +
    (scaleKm.hashCode) +
    (spaceId.hashCode);

  @override
  String toString() => 'GameChallengeDetailResponseDto[closedAt=$closedAt, createdAt=$createdAt, dailyOn=$dailyOn, id=$id, name=$name, roundCount=$roundCount, rounds=$rounds, scaleDays=$scaleDays, scaleKm=$scaleKm, spaceId=$spaceId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.closedAt != null) {
      json[r'closedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$/')
        ? this.closedAt!.millisecondsSinceEpoch
        : this.closedAt!.toUtc().toIso8601String();
    } else {
      json[r'closedAt'] = null;
    }
      json[r'createdAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$/')
        ? this.createdAt.millisecondsSinceEpoch
        : this.createdAt.toUtc().toIso8601String();
    if (this.dailyOn != null) {
      json[r'dailyOn'] = this.dailyOn;
    } else {
      json[r'dailyOn'] = null;
    }
      json[r'id'] = this.id;
      json[r'name'] = this.name;
      json[r'roundCount'] = this.roundCount;
      json[r'rounds'] = this.rounds;
      json[r'scaleDays'] = this.scaleDays;
      json[r'scaleKm'] = this.scaleKm;
      json[r'spaceId'] = this.spaceId;
    return json;
  }

  /// Returns a new [GameChallengeDetailResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static GameChallengeDetailResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "GameChallengeDetailResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return GameChallengeDetailResponseDto(
        closedAt: mapDateTime(json, r'closedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$/'),
        createdAt: mapDateTime(json, r'createdAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$/')!,
        dailyOn: mapValueOfType<String>(json, r'dailyOn'),
        id: mapValueOfType<String>(json, r'id')!,
        name: mapValueOfType<String>(json, r'name')!,
        roundCount: num.parse('${json[r'roundCount']}'),
        rounds: GameRoundDetailResponseDto.listFromJson(json[r'rounds']),
        scaleDays: num.parse('${json[r'scaleDays']}'),
        scaleKm: num.parse('${json[r'scaleKm']}'),
        spaceId: mapValueOfType<String>(json, r'spaceId')!,
      );
    }
    return null;
  }

  static List<GameChallengeDetailResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <GameChallengeDetailResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = GameChallengeDetailResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, GameChallengeDetailResponseDto> mapFromJson(dynamic json) {
    final map = <String, GameChallengeDetailResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = GameChallengeDetailResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of GameChallengeDetailResponseDto-objects as value to a dart map
  static Map<String, List<GameChallengeDetailResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<GameChallengeDetailResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = GameChallengeDetailResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'closedAt',
    'createdAt',
    'dailyOn',
    'id',
    'name',
    'roundCount',
    'rounds',
    'scaleDays',
    'scaleKm',
    'spaceId',
  };
}

