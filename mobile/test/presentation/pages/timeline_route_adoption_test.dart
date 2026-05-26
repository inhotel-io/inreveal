import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/models/timeline_temporal_scope.model.dart';
import 'package:immich_mobile/domain/models/timeline_zoom_anchor.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/pages/library/spaces/space_detail.page.dart';
import 'package:immich_mobile/presentation/pages/dev/main_timeline.page.dart';
import 'package:immich_mobile/presentation/pages/drift_archive.page.dart';
import 'package:immich_mobile/presentation/pages/drift_favorite.page.dart';
import 'package:immich_mobile/presentation/pages/drift_locked_folder.page.dart';
import 'package:immich_mobile/presentation/pages/drift_partner_detail.page.dart';
import 'package:immich_mobile/presentation/pages/drift_person.page.dart';
import 'package:immich_mobile/presentation/pages/drift_place_detail.page.dart';
import 'package:immich_mobile/presentation/pages/drift_recently_taken.page.dart';
import 'package:immich_mobile/presentation/pages/drift_remote_album.page.dart';
import 'package:immich_mobile/presentation/pages/drift_trash.page.dart';
import 'package:immich_mobile/presentation/pages/drift_video.page.dart';
import 'package:immich_mobile/presentation/pages/local_timeline.page.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_grouping_header_sliver.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_grouping_selector.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_route_scope.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:immich_mobile/providers/timeline/overview_drilldown.provider.dart';
import 'package:immich_mobile/providers/timeline/zoom_anchor.provider.dart';
import 'package:immich_mobile/widgets/spaces/sync_status_banner.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Drift db;

  setUpAll(() async {
    db = Drift(drift.DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    await StoreService.init(storeRepository: DriftStoreRepository(db), listenUpdates: false);
  });

  setUp(() async {
    await Store.clear();
  });

  tearDownAll(() async {
    await Store.clear();
    await db.close();
  });

  testWidgets('non-Photos route scope renders selector and keeps temporal scope unchanged after zoom activation', (
    tester,
  ) async {
    final seenScopes = <TimelineTemporalScope>[];

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: TimelineRouteScope(
            timelineServiceBuilder: (ref, scope) {
              seenScopes.add(scope);
              return TimelineService((
                bucketSource: () => const Stream<List<Bucket>>.empty(),
                assetSource: (offset, count) async => const <BaseAsset>[],
                origin: TimelineOrigin.person,
              ));
            },
            child: const CustomScrollView(slivers: [TimelineGroupingHeaderSliver()]),
          ),
        ),
      ),
    );

    expect(find.byType(TimelineGroupingHeaderSliver), findsOneWidget);
    expect(find.byType(TimelineGroupingSelector), findsOneWidget);
    final ref = ProviderScope.containerOf(tester.element(find.byType(TimelineGroupingHeaderSliver)));
    ref.read(timelineServiceProvider);
    expect(seenScopes.last, const TimelineTemporalScope.none());

    await tester.runAsync(
      () async => ref
          .read(timelineOverviewDrilldownProvider)
          ?.call(TimeBucket(date: DateTime(2025), assetCount: 3), GroupAssetsBy.year),
    );
    ref.invalidate(timelineServiceProvider);
    ref.read(timelineServiceProvider);
    await tester.pump();

    expect(seenScopes.last, const TimelineTemporalScope.none());
    expect(ref.read(timelineZoomAnchorProvider), const TimelineZoomAnchor.year(2025));
  });

  group('adopted timeline route contracts', () {
    test('Main Photos keeps app bar selector and route-local controls contract', () {
      expect(MainTimelinePage.timelineOverviewControlsEnabled, isTrue);
      expect(PhotosTimelineAppBar.actions.single, isA<TimelineGroupingSelector>());
    });

    test('routes expose expected top sliver heights', () {
      expect(DriftPersonPage.timelineOverviewControlsEnabled, isTrue);
      expect(DriftPersonPage.timelineOverviewTopSliverHeight, kTimelineGroupingHeaderSliverHeight);

      expect(RemoteAlbumPage.timelineOverviewControlsEnabled, isTrue);
      expect(RemoteAlbumPage.timelineOverviewTopSliverHeight, kTimelineGroupingHeaderSliverHeight);

      expect(LocalTimelinePage.timelineOverviewControlsEnabled, isTrue);
      expect(LocalTimelinePage.timelineOverviewTopSliverHeight, kTimelineGroupingHeaderSliverHeight);

      expect(DriftFavoritePage.timelineOverviewControlsEnabled, isTrue);
      expect(DriftFavoritePage.timelineOverviewTopSliverHeight, kTimelineGroupingHeaderSliverHeight);

      expect(DriftArchivePage.timelineOverviewControlsEnabled, isTrue);
      expect(DriftArchivePage.timelineOverviewTopSliverHeight, kTimelineGroupingHeaderSliverHeight);

      expect(DriftLockedFolderPage.timelineOverviewControlsEnabled, isTrue);
      expect(DriftLockedFolderPage.timelineOverviewTopSliverHeight, kTimelineGroupingHeaderSliverHeight);

      expect(DriftVideoPage.timelineOverviewControlsEnabled, isTrue);
      expect(DriftVideoPage.timelineOverviewTopSliverHeight, kTimelineGroupingHeaderSliverHeight);

      expect(DriftRecentlyTakenPage.timelineOverviewControlsEnabled, isTrue);
      expect(DriftRecentlyTakenPage.timelineOverviewTopSliverHeight, kTimelineGroupingHeaderSliverHeight);

      expect(DriftPlaceDetailPage.timelineOverviewControlsEnabled, isTrue);
      expect(DriftPlaceDetailPage.timelineOverviewTopSliverHeight, kTimelineGroupingHeaderSliverHeight);

      expect(DriftTrashPage.timelineOverviewControlsEnabled, isTrue);
      expect(DriftTrashPage.timelineOverviewTopSliverHeight, kTimelineGroupingHeaderSliverHeight + 24);

      expect(DriftPartnerDetailPage.timelineOverviewControlsEnabled, isTrue);
      expect(DriftPartnerDetailPage.timelineOverviewTopSliverHeight, kTimelineGroupingHeaderSliverHeight + 110);

      expect(SpaceDetailPage.timelineOverviewControlsEnabled, isTrue);
      expect(
        SpaceDetailPage.timelineOverviewTopSliverHeight(isRemoteSyncing: false),
        kTimelineGroupingHeaderSliverHeight,
      );
      expect(
        SpaceDetailPage.timelineOverviewTopSliverHeight(isRemoteSyncing: true),
        kTimelineGroupingHeaderSliverHeight + kSyncStatusBannerSliverHeight,
      );
    });
  });
}
