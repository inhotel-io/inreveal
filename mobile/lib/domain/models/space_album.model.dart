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
  final int assetCount;
  final DateTime linkedAt;
  final DateTime updatedAt;
  final DateTime createdAt;

  /// Oldest / newest photo in the album, truncated to a UTC calendar day to
  /// match the server's `MIN/MAX((localDateTime AT TIME ZONE 'UTC')::date)`.
  /// Null when the album has no visible assets, or when none of them carries a
  /// `localDateTime`.
  final DateTime? startDate;
  final DateTime? endDate;

  const SpaceAlbum({
    required this.id,
    required this.name,
    this.thumbnailAssetId,
    required this.showInTimeline,
    this.assetCount = 0,
    required this.linkedAt,
    required this.updatedAt,
    required this.createdAt,
    this.startDate,
    this.endDate,
  });
}
