/// Domain model for a shared-space album link, produced by
/// [SpaceAlbumRepository.watchLinkedAlbums].
///
/// Combines the album metadata (from [SharedSpaceAlbumEntity] / the
/// SharedSpaceAlbumV1 wire stream) with the per-space link fields
/// (from [SharedSpaceAlbumLinkEntity] / the SharedSpaceAlbumLinkV1 wire
/// stream) for a single reactive join result.
class SpaceAlbum {
  final String id;
  final String name;
  final String? thumbnailAssetId;
  final bool showInTimeline;
  final String? folderId;
  final int assetCount;
  final DateTime linkedAt;
  final DateTime updatedAt;

  /// Whether the CURRENT user owns this album.
  ///
  /// Not on the wire: SyncAlbumV2 (which SharedSpaceAlbumV1 maps to) carries no ownerId, and it is
  /// an upstream-shared DTO, so adding a fork field there would break silently on rebase. Derived
  /// instead from the local remote_album_user table, which already holds an owner row for every
  /// album this user owns.
  ///
  /// Fail-closed: false when the current user id is unknown, or when the owner row has not synced
  /// yet. The affordance is hidden rather than wrongly offered, and self-heals on the next sync.
  final bool isOwnedByMe;

  const SpaceAlbum({
    required this.id,
    required this.name,
    this.thumbnailAssetId,
    required this.showInTimeline,
    this.folderId,
    this.assetCount = 0,
    required this.linkedAt,
    required this.updatedAt,
    this.isOwnedByMe = false,
  });
}
