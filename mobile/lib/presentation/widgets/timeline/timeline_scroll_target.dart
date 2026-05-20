import 'package:collection/collection.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/presentation/widgets/timeline/segment.model.dart';

Segment? findTimelineScrollTargetSegment(List<Segment> segments, DateTime date) {
  bool matchesDate(Segment segment, bool Function(DateTime segmentDate) predicate) {
    if (segment.bucket is! TimeBucket) {
      return false;
    }

    return predicate((segment.bucket as TimeBucket).date);
  }

  return segments.firstWhereOrNull(
        (segment) => matchesDate(
          segment,
          (segmentDate) =>
              segmentDate.year == date.year && segmentDate.month == date.month && segmentDate.day == date.day,
        ),
      ) ??
      segments.firstWhereOrNull(
        (segment) =>
            matchesDate(segment, (segmentDate) => segmentDate.year == date.year && segmentDate.month == date.month),
      ) ??
      segments.firstWhereOrNull((segment) => matchesDate(segment, (segmentDate) => segmentDate.year == date.year));
}
