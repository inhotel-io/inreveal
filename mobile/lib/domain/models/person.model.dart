import 'package:flutter/foundation.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part 'person.model.freezed.dart';

// TODO: Remove PersonDto once Isar is removed
@freezed
abstract class PersonDto with _$PersonDto {
  const factory PersonDto({
    required String id,
    DateTime? birthDate,
    required bool isHidden,
    required String name,
    required String thumbnailPath,
    DateTime? updatedAt,
  }) = _PersonDto;
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
  }) = _DriftPerson;
}

enum PeopleSortBy { photoCount, name }
