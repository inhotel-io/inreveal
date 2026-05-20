import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/presentation/widgets/timeline/fixed/segment.model.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_scroll_target.dart';

void main() {
  test('findTimelineScrollTargetSegment prefers exact day match', () {
    final segments = [
      _segment(DateTime(2026, 4, 4), 0, 100),
      _segment(DateTime(2026, 4, 3), 100, 200),
      _segment(DateTime(2026, 3, 1), 200, 300),
    ];

    expect(findTimelineScrollTargetSegment(segments, DateTime(2026, 4, 3)), segments[1]);
  });

  test('findTimelineScrollTargetSegment falls back to same month when exact day is absent', () {
    final segments = [_segment(DateTime(2026, 4, 4), 0, 100), _segment(DateTime(2026, 3, 1), 100, 200)];

    expect(findTimelineScrollTargetSegment(segments, DateTime(2026, 4, 3)), segments[0]);
  });

  test('findTimelineScrollTargetSegment falls back to same year when month is absent', () {
    final segments = [_segment(DateTime(2026, 2, 1), 0, 100), _segment(DateTime(2025, 12, 1), 100, 200)];

    expect(findTimelineScrollTargetSegment(segments, DateTime(2026, 4, 3)), segments[0]);
  });

  test('findTimelineScrollTargetSegment returns null when no time bucket matches', () {
    final segments = [_segment(DateTime(2025, 12, 1), 0, 100), _segment(DateTime(2024, 12, 1), 100, 200)];

    expect(findTimelineScrollTargetSegment(segments, DateTime(2026, 4, 3)), isNull);
  });

  test('findTimelineScrollTargetSegment ignores non-time bucket segments', () {
    final segments = [_nonTimeSegment(0, 100), _segment(DateTime(2026, 4, 3), 100, 200)];

    expect(findTimelineScrollTargetSegment(segments, DateTime(2026, 4, 3)), segments[1]);
    expect(findTimelineScrollTargetSegment([_nonTimeSegment(0, 100)], DateTime(2026, 4, 3)), isNull);
  });
}

FixedSegment _segment(DateTime date, double startOffset, double endOffset) {
  return FixedSegment(
    firstIndex: 0,
    lastIndex: 1,
    startOffset: startOffset,
    endOffset: endOffset,
    firstAssetIndex: 0,
    bucket: TimeBucket(date: date, assetCount: 1),
    tileHeight: 100,
    columnCount: 4,
    headerExtent: 40,
    spacing: 2,
    header: HeaderType.month,
  );
}

FixedSegment _nonTimeSegment(double startOffset, double endOffset) {
  return FixedSegment(
    firstIndex: 0,
    lastIndex: 1,
    startOffset: startOffset,
    endOffset: endOffset,
    firstAssetIndex: 0,
    bucket: const Bucket(assetCount: 1),
    tileHeight: 100,
    columnCount: 4,
    headerExtent: 0,
    spacing: 2,
    header: HeaderType.none,
  );
}
