import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/presentation/pages/dev/main_timeline.page.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/filter_icon_button.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_grouping_selector.widget.dart';

void main() {
  group('PhotosTimelineAppBar', () {
    test('uses grouping selector without filter action', () {
      expect(PhotosTimelineAppBar.actions, hasLength(1));
      expect(PhotosTimelineAppBar.actions.single, isA<TimelineGroupingSelector>());
      expect(PhotosTimelineAppBar.actions.whereType<FilterIconButton>(), isEmpty);
      expect(MainTimelinePage.timelineOverviewControlsEnabled, isTrue);
    });
  });
}
