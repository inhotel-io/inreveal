enum GroupAssetsBy { day, month, auto, none, year }

enum HeaderType { none, month, day, monthAndDay, year }

/// Clamps a value to the two granularities the photo grid renders: month + day headers
/// ([GroupAssetsBy.day]) or month-only headers ([GroupAssetsBy.month]).
///
/// This is the meaning of the persisted `Setting.groupAssetsBy` ("Photo Grid" → "Group by"),
/// which is a header-granularity choice and NOT the Years/Months/All overview selector.
/// Legacy `auto`/`none` values, and `year` left behind by the removed Year option, all fall
/// back to day.
GroupAssetsBy normalizeGridGrouping(GroupAssetsBy groupBy) =>
    groupBy == GroupAssetsBy.month ? GroupAssetsBy.month : GroupAssetsBy.day;

enum SortAssetsBy { taken, uploaded }

class Bucket {
  final int assetCount;

  const Bucket({required this.assetCount});

  @override
  bool operator ==(covariant Bucket other) {
    return assetCount == other.assetCount;
  }

  @override
  int get hashCode => assetCount.hashCode;
}

class TimeBucket extends Bucket {
  final DateTime date;

  const TimeBucket({required this.date, required super.assetCount});

  @override
  bool operator ==(covariant TimeBucket other) {
    return super == other && date == other.date;
  }

  @override
  int get hashCode => super.hashCode ^ date.hashCode;
}
