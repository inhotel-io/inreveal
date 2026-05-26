sealed class TimelineZoomAnchor {
  const TimelineZoomAnchor();

  const factory TimelineZoomAnchor.none() = TimelineZoomAnchorNone;

  const factory TimelineZoomAnchor.year(int year) = TimelineZoomYearAnchor;

  factory TimelineZoomAnchor.month({required int year, required int month}) {
    RangeError.checkValueInInterval(month, 1, 12, 'month');
    return TimelineZoomMonthAnchor._(year: year, month: month);
  }

  bool get isEmpty => this is TimelineZoomAnchorNone;
}

final class TimelineZoomAnchorNone extends TimelineZoomAnchor {
  const TimelineZoomAnchorNone();

  @override
  bool operator ==(Object other) => other is TimelineZoomAnchorNone;

  @override
  int get hashCode => Object.hashAll([TimelineZoomAnchorNone]);

  @override
  String toString() => 'TimelineZoomAnchor.none()';
}

final class TimelineZoomYearAnchor extends TimelineZoomAnchor {
  const TimelineZoomYearAnchor(this.year);

  final int year;

  @override
  bool operator ==(Object other) => other is TimelineZoomYearAnchor && other.year == year;

  @override
  int get hashCode => Object.hash(TimelineZoomYearAnchor, year);

  @override
  String toString() => 'TimelineZoomAnchor.year($year)';
}

final class TimelineZoomMonthAnchor extends TimelineZoomAnchor {
  const TimelineZoomMonthAnchor._({required this.year, required this.month});

  final int year;
  final int month;

  @override
  bool operator ==(Object other) => other is TimelineZoomMonthAnchor && other.year == year && other.month == month;

  @override
  int get hashCode => Object.hash(TimelineZoomMonthAnchor, year, month);

  @override
  String toString() => 'TimelineZoomAnchor.month(year: $year, month: $month)';
}
