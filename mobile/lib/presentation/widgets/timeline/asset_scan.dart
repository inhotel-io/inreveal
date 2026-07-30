import 'dart:math' as math;

/// How many assets are pulled from the timeline service per scan read.
const int kAssetScanChunkSize = 250;

/// Hard ceiling on how many assets a single scroll request will scan before
/// giving up and falling back to the segment top.
///
/// `TimelineService.loadAssets` replaces the service's shared buffer, and
/// `_FixedSegmentRow.build` checks `hasRange()` synchronously and falls back to
/// placeholders on a miss. An unbounded scan therefore walks the buffer away from
/// the rows on screen and the timeline visibly flashes placeholders — during
/// exactly the huge-day case this fix is for. The cap bounds that to ~8 reads.
const int kAssetScanCap = 2000;

/// Contiguous `(index, count)` windows covering a segment's assets.
///
/// Yields nothing when [assetCount] is zero or negative. A [chunkSize] below 1 is
/// clamped to 1 rather than trusted — otherwise the sequence would be empty (a
/// silent "not found") or infinite.
Iterable<({int index, int count})> assetScanChunks({
  required int firstAssetIndex,
  required int assetCount,
  int chunkSize = kAssetScanChunkSize,
}) sync* {
  if (assetCount <= 0) {
    return;
  }
  final size = math.max(1, chunkSize);
  for (var scanned = 0; scanned < assetCount; scanned += size) {
    yield (index: firstAssetIndex + scanned, count: math.min(size, assetCount - scanned));
  }
}
