import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part 'person.model.freezed.dart';

// TODO: Remove PersonDto once Isar is removed
class PersonDto {
  const PersonDto({
    required this.id,
    this.birthDate,
    required this.isHidden,
    required this.name,
    required this.thumbnailPath,
    this.updatedAt,
    this.numberOfAssets,
  });

  final String id;
  final DateTime? birthDate;
  final bool isHidden;
  final String name;
  final String thumbnailPath;
  final DateTime? updatedAt;

  /// Photo count for the picker row (`_PersonRow` "N photos" subtitle). Sourced from
  /// [DriftPerson.numberOfAssets] with no extra network call; null hides the subtitle
  /// (e.g. the offline local-Drift fallback path never populates it).
  final int? numberOfAssets;

  @override
  String toString() {
    return 'Person(id: $id, birthDate: $birthDate, isHidden: $isHidden, name: $name, thumbnailPath: $thumbnailPath, updatedAt: $updatedAt, numberOfAssets: $numberOfAssets)';
  }

  PersonDto copyWith({
    String? id,
    DateTime? birthDate,
    bool? isHidden,
    String? name,
    String? thumbnailPath,
    DateTime? updatedAt,
    int? numberOfAssets,
  }) {
    return PersonDto(
      id: id ?? this.id,
      birthDate: birthDate ?? this.birthDate,
      isHidden: isHidden ?? this.isHidden,
      name: name ?? this.name,
      thumbnailPath: thumbnailPath ?? this.thumbnailPath,
      updatedAt: updatedAt ?? this.updatedAt,
      numberOfAssets: numberOfAssets ?? this.numberOfAssets,
    );
  }

  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      'id': id,
      'birthDate': birthDate?.millisecondsSinceEpoch,
      'isHidden': isHidden,
      'name': name,
      'thumbnailPath': thumbnailPath,
      'updatedAt': updatedAt?.millisecondsSinceEpoch,
      'numberOfAssets': numberOfAssets,
    };
  }

  factory PersonDto.fromMap(Map<String, dynamic> map) {
    return PersonDto(
      id: map['id'] as String,
      birthDate: map['birthDate'] != null ? DateTime.fromMillisecondsSinceEpoch(map['birthDate'] as int) : null,
      isHidden: map['isHidden'] as bool,
      name: map['name'] as String,
      thumbnailPath: map['thumbnailPath'] as String,
      updatedAt: map['updatedAt'] != null ? DateTime.fromMillisecondsSinceEpoch(map['updatedAt'] as int) : null,
      numberOfAssets: map['numberOfAssets'] as int?,
    );
  }

  String toJson() => json.encode(toMap());

  factory PersonDto.fromJson(String source) => PersonDto.fromMap(json.decode(source) as Map<String, dynamic>);

  @override
  bool operator ==(covariant PersonDto other) {
    if (identical(this, other)) {
      return true;
    }

    return other.id == id &&
        other.birthDate == birthDate &&
        other.isHidden == isHidden &&
        other.name == name &&
        other.thumbnailPath == thumbnailPath &&
        other.updatedAt == updatedAt &&
        other.numberOfAssets == numberOfAssets;
  }

  @override
  int get hashCode {
    return id.hashCode ^
        birthDate.hashCode ^
        isHidden.hashCode ^
        name.hashCode ^
        thumbnailPath.hashCode ^
        updatedAt.hashCode ^
        numberOfAssets.hashCode;
  }
}

// Model for a person stored in the server
@freezed
abstract class DriftPerson with _$DriftPerson {
  const factory DriftPerson({
    required String id,
    required DateTime createdAt,
    required DateTime updatedAt,
    required String ownerId,
    required String name,
    String? faceAssetId,
    required bool isFavorite,
    required bool isHidden,
    required String? color,
    DateTime? birthDate,

    /// Non-null when this person is a Space-scoped identity resolved from the server (the
    /// People-page shared-space list). Personal/owned people are always null. Edits to a
    /// Space person must route through the editor-gated shared-space endpoint, never the
    /// owner-only person endpoint.
    String? spaceId,

    /// Photo count sourced from the shared-spaces server list (`PersonResponseDto.numberOfAssets`).
    /// Null when unavailable — the owner-scoped local Drift query and the offline fallback path
    /// never populate it, so the picker row hides the count gracefully rather than erroring.
    int? numberOfAssets,
  }) = _DriftPerson;
}

enum PeopleSortBy { photoCount, name }
