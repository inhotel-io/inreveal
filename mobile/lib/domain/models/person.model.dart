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

    /// Photo count for the picker row (`_PersonRow` "N photos" subtitle). Sourced from
    /// [DriftPerson.numberOfAssets] with no extra network call; null hides the subtitle
    /// (e.g. the offline local-Drift fallback path never populates it).
    int? numberOfAssets,
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

    /// Photo count sourced from the shared-spaces server list (`PersonResponseDto.numberOfAssets`).
    /// Null when unavailable — the owner-scoped local Drift query and the offline fallback path
    /// never populate it, so the picker row hides the count gracefully rather than erroring.
    int? numberOfAssets,
  }) = _DriftPerson;
}

enum PeopleSortBy { photoCount, name }
