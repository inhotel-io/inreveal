import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/constants/locales.dart';
import 'package:immich_mobile/domain/models/settings_key.dart';
import 'package:immich_mobile/domain/models/space_album.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/models/timeline_temporal_scope.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';
import 'package:immich_mobile/domain/utils/background_sync.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/generated/codegen_loader.g.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/settings.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/pages/library/spaces/space_album_detail.page.dart';
import 'package:immich_mobile/presentation/widgets/spaces/space_album_kebab.widget.dart';
import 'package:immich_mobile/providers/background_sync.provider.dart';
import 'package:immich_mobile/providers/infrastructure/album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/remote_album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/space_album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:immich_mobile/repositories/drift_album_api_repository.dart';
import 'package:immich_mobile/repositories/shared_space_api.repository.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:openapi/api.dart' show BulkIdResponseDto;

import '../../test_utils.dart';
import '../../widget_tester_extensions.dart';

// ---------------------------------------------------------------------------
// Mocks — Task 12 (rename/delete wiring on the detail page).
//
// Mirrors `space_albums_page_test.dart`'s own mocks exactly: mocking
// `SharedSpaceApiRepository`/`BackgroundSyncManager`/`DriftAlbumApiRepository` and letting the
// REAL `SpaceAlbumActions` run on top, rather than mocking `spaceAlbumActionsProvider` itself and
// asserting on `SpaceAlbumActions` behaviour (which the plan's global constraints forbid for page
// tests).
// ---------------------------------------------------------------------------

class MockSharedSpaceApiRepository extends Mock implements SharedSpaceApiRepository {}

class MockBackgroundSyncManager extends Mock implements BackgroundSyncManager {}

/// `spaceAlbumActionsProvider` eagerly builds all three of its dependencies regardless of which
/// method is actually called (`space_album_actions.dart`'s `Provider<SpaceAlbumActions>`) — left
/// unoverridden, the real `driftAlbumApiRepositoryProvider` resolves the real `ApiService` ->
/// `NetworkRepository.client`, a null check on a field only `NetworkRepository.init()` (native
/// platform only) ever sets. Same trap `space_albums_page_test.dart` documents for its own tests.
class MockDriftAlbumApiRepository extends Mock implements DriftAlbumApiRepository {}

class MockTimelineFactory extends Mock implements TimelineFactory {}

/// `SpaceAlbumActions.renameAlbum`/`bulkDeleteAlbums` call `_onOwnedAlbumsChanged` on success,
/// wired to `remoteAlbumProvider.notifier.refresh()`. Left unoverridden the real
/// `RemoteAlbumNotifier` resolves `remoteAlbumRepository` -> `driftProvider`, which this file
/// never overrides (throws `UnimplementedError` by design). None of the tests below assert on the
/// refresh call itself, so a plain no-op override is enough — same fixture as
/// `space_albums_page_test.dart`'s `_NoopRemoteAlbumNotifier`.
class _NoopRemoteAlbumNotifier extends RemoteAlbumNotifier {
  @override
  RemoteAlbumState build() => const RemoteAlbumState(albums: []);

  @override
  Future<void> refresh() async {}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const spaceId = 'space-1';

/// Wraps a SliverAppBar widget in a proper sliver context for testing.
Widget _wrapSliver(Widget sliverWidget) => Scaffold(
  body: CustomScrollView(
    slivers: [
      sliverWidget,
      const SliverToBoxAdapter(child: SizedBox(height: 800)),
    ],
  ),
);

SpaceAlbum _album({
  required String id,
  String? name,
  bool showInTimeline = true,
  int assetCount = 0,
  bool isOwnedByMe = false,
}) => SpaceAlbum(
  id: id,
  name: name ?? 'Album $id',
  showInTimeline: showInTimeline,
  assetCount: assetCount,
  linkedAt: DateTime.utc(2026, 1, 1),
  updatedAt: DateTime.utc(2026, 1, 1),
  isOwnedByMe: isOwnedByMe,
);

/// Pushes [SpaceAlbumDetailPage] onto a real AutoRoute stack — needed because its `_deleteAlbum`
/// (Task 12) calls `context.maybePop()`, an auto_route `StackRouter` extension that requires a
/// real router ancestor; a bare `MaterialApp(home: ...)` cannot exercise it. Mirrors
/// `space_albums_page_test.dart`'s `pumpPageWithFolderStream` harness shape.
///
/// `timelineFactoryProvider` is mocked (not the real DB-backed one) so the page's `Timeline` shows
/// an empty grid without needing real bucket/asset data — same technique as
/// `drift_remote_album_page_test.dart`'s `pumpAlbumPage`.
Future<RootStackRouter> pumpDetailPageOnRouter(
  WidgetTester tester, {
  required List<SpaceAlbum> albums,
  required String albumId,
  bool canEdit = false,
  List<Override> overrides = const [],
}) async {
  final router = RootStackRouter.build(
    routes: [
      AutoRoute(initial: true, page: PageInfo('SpaceAlbumDetailHarness', builder: (_) => const SizedBox.shrink())),
      AutoRoute(page: SpaceAlbumDetailRoute.page),
    ],
  );

  final timelineFactory = MockTimelineFactory();
  when(
    () => timelineFactory.spaceAlbum(
      spaceId: any(named: 'spaceId'),
      albumId: any(named: 'albumId'),
      groupBy: any(named: 'groupBy'),
      temporalScope: any(named: 'temporalScope'),
    ),
  ).thenReturn(
    TimelineService((
      bucketSource: () => Stream.value(const []),
      assetSource: (offset, count) async => const [],
      origin: TimelineOrigin.remoteSpace,
    )),
  );

  await tester.pumpWidget(
    EasyLocalization(
      supportedLocales: locales.values.toList(),
      path: translationsPath,
      startLocale: locales.values.first,
      fallbackLocale: locales.values.first,
      saveLocale: false,
      useFallbackTranslations: true,
      assetLoader: const CodegenLoader(),
      child: ProviderScope(
        overrides: [
          spaceAlbumsProvider(spaceId).overrideWith((_) => Stream.value(albums)),
          timelineFactoryProvider.overrideWithValue(timelineFactory),
          ...overrides,
        ],
        child: Builder(
          builder: (context) => MaterialApp.router(
            debugShowCheckedModeBanner: false,
            routerConfig: router.config(),
            localizationsDelegates: context.localizationDelegates,
            supportedLocales: context.supportedLocales,
            locale: context.locale,
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  // NOT awaited — same reasoning as `pumpPageWithFolderStream`: `push`'s Future only resolves once
  // the pushed route is popped, which is exactly what the delete-success assertion below drives.
  unawaited(router.push(SpaceAlbumDetailRoute(spaceId: spaceId, albumId: albumId, canEdit: canEdit)));
  await tester.pumpAndSettle();
  return router;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  late Drift db;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    TestUtils.init();
    registerFallbackValue(const TimelineTemporalScope.none());
    registerFallbackValue(GroupAssetsBy.day);
    db = Drift(drift.DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    await StoreService.init(storeRepository: DriftStoreRepository(db), listenUpdates: false);
    await SettingsRepository.ensureInitialized(db);
  });

  setUp(() async {
    await Store.clear();
    await SettingsRepository.instance.clear(SettingsKey.values);
  });

  tearDownAll(() async {
    await Store.clear();
    await db.close();
  });

  testWidgets('editor role (canEdit:true) — SpaceAlbumKebab is present and has menu button', (tester) async {
    await tester.pumpConsumerWidget(
      _wrapSliver(
        SpaceAlbumAppBar(
          canEdit: true,
          album: _album(id: 'a1', name: 'Hawaii'),
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(SpaceAlbumKebab), findsOneWidget);
    // canEdit:true → SpaceAlbumKebab renders a PopupMenuButton (not SizedBox.shrink)
    // Use byWidgetPredicate since the type param is private (_KebabAction).
    expect(find.byWidgetPredicate((w) => w is PopupMenuButton), findsOneWidget);
  });

  // Rewritten (Task 12) — the new canEdit/canRename/canDelete capability model falsifies this
  // test's old premise: `canEdit:false` alone no longer implies the kebab shrinks — it shrinks
  // only when the caller ALSO cannot rename and cannot delete. `canRename`/`canDelete` are passed
  // explicitly here so this stays the guard on the genuine no-affordance case (a plain viewer with
  // no ownership of the album), not a stale assertion about `canEdit` alone. See the "viewer who
  // owns the album" tests below for the positive counterpart that proves this could fail.
  testWidgets(
    'viewer role (canEdit:false, canRename:false, canDelete:false) — SpaceAlbumKebab renders SizedBox.shrink',
    (tester) async {
      await tester.pumpConsumerWidget(
        _wrapSliver(
          SpaceAlbumAppBar(
            canEdit: false,
            canRename: false,
            canDelete: false,
            album: _album(id: 'a1', name: 'Hawaii'),
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(SpaceAlbumKebab), findsOneWidget);
      // canEdit:false, canRename:false, canDelete:false → the kebab renders SizedBox.shrink
      expect(find.byWidgetPredicate((w) => w is PopupMenuButton), findsNothing);
    },
  );

  testWidgets('subtitle "{count} photos · in {space}" renders when album and spaceName are provided', (tester) async {
    await tester.pumpConsumerWidget(
      _wrapSliver(
        SpaceAlbumAppBar(
          canEdit: false,
          album: _album(id: 'a2', name: 'Summer', assetCount: 7),
          spaceName: 'Trip 2024',
        ),
      ),
    );
    await tester.pump();

    expect(find.text('7 photos · in Trip 2024'), findsOneWidget);
  });

  testWidgets('subtitle is absent when spaceName is null (metadata not yet loaded)', (tester) async {
    await tester.pumpConsumerWidget(
      _wrapSliver(
        SpaceAlbumAppBar(
          canEdit: false,
          album: _album(id: 'a3', name: 'Summer', assetCount: 7),
          // spaceName omitted / null
        ),
      ),
    );
    await tester.pump();

    // No subtitle should be rendered before the space name is loaded.
    expect(find.textContaining('photos · in'), findsNothing);
  });

  // ---------------------------------------------------------------------------
  // Slice 14 — toggle disabled when album stream is unresolved
  // ---------------------------------------------------------------------------

  testWidgets('toggle menu item is DISABLED when album is null (stream unresolved)', (tester) async {
    bool toggled = false;
    await tester.pumpConsumerWidget(
      _wrapSliver(
        SpaceAlbumAppBar(
          canEdit: true,
          album: null, // stream not yet resolved
          onToggleTimeline: () => toggled = true,
        ),
      ),
    );
    await tester.pump();

    // Open the popup menu
    await tester.tap(find.byWidgetPredicate((w) => w is PopupMenuButton));
    await tester.pumpAndSettle();

    // The toggle item must exist and be disabled
    final toggleItem = tester.widget<PopupMenuItem<dynamic>>(find.byKey(const Key('space-album-kebab-toggle')));
    expect(toggleItem.enabled, isFalse, reason: 'toggle item should be disabled when album is null');

    // Tapping a disabled item must NOT fire the callback
    await tester.tap(find.byKey(const Key('space-album-kebab-toggle')));
    await tester.pumpAndSettle();
    expect(toggled, isFalse, reason: 'onToggleTimeline must not be called when item is disabled');
  });

  testWidgets('toggle menu item is ENABLED when album is non-null and invokes callback', (tester) async {
    bool toggled = false;
    await tester.pumpConsumerWidget(
      _wrapSliver(
        SpaceAlbumAppBar(
          canEdit: true,
          album: _album(id: 'a4', name: 'Loaded Album'),
          onToggleTimeline: () => toggled = true,
        ),
      ),
    );
    await tester.pump();

    // Open the popup menu
    await tester.tap(find.byWidgetPredicate((w) => w is PopupMenuButton));
    await tester.pumpAndSettle();

    // The toggle item must exist and be enabled
    final toggleItem = tester.widget<PopupMenuItem<dynamic>>(find.byKey(const Key('space-album-kebab-toggle')));
    expect(toggleItem.enabled, isTrue, reason: 'toggle item should be enabled when album is non-null');

    // Tapping an enabled item MUST fire the callback
    await tester.tap(find.byKey(const Key('space-album-kebab-toggle')));
    await tester.pumpAndSettle();
    expect(toggled, isTrue, reason: 'onToggleTimeline must be called when item is enabled and tapped');
  });

  // ---------------------------------------------------------------------------
  // Task 12 — capability-gated rename/delete kebab wiring
  // ---------------------------------------------------------------------------

  // Scenario 66
  testWidgets('editor who does not own the album: Rename offered, Delete not', (tester) async {
    await tester.pumpConsumerWidget(
      _wrapSliver(
        SpaceAlbumAppBar(
          canEdit: true,
          canRename: true, // canEdit || isOwnedByMe(false) == true
          canDelete: false, // isOwnedByMe == false
          album: _album(id: 'a1', name: 'Hawaii', isOwnedByMe: false),
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.byWidgetPredicate((w) => w is PopupMenuButton));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('space-album-kebab-rename')), findsOneWidget);
    expect(find.byKey(const Key('space-album-kebab-delete')), findsNothing);
  });

  // Scenario 68
  testWidgets('viewer who owns the album: the kebab renders a menu rather than shrinking', (tester) async {
    await tester.pumpConsumerWidget(
      _wrapSliver(
        SpaceAlbumAppBar(
          canEdit: false,
          canRename: true, // canEdit(false) || isOwnedByMe(true) == true
          canDelete: true, // isOwnedByMe == true
          album: _album(id: 'a1', name: 'Hawaii', isOwnedByMe: true),
        ),
      ),
    );
    await tester.pump();

    // Positive counterpart to the rewritten shrink test above, using the SAME finder — proves the
    // shrink assertion is not vacuously true.
    expect(find.byWidgetPredicate((w) => w is PopupMenuButton), findsOneWidget);

    await tester.tap(find.byWidgetPredicate((w) => w is PopupMenuButton));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('space-album-kebab-rename')), findsOneWidget);
    expect(find.byKey(const Key('space-album-kebab-delete')), findsOneWidget);
    // No canEdit-only items for a viewer.
    expect(find.byKey(const Key('space-album-kebab-add')), findsNothing);
    expect(find.byKey(const Key('space-album-kebab-toggle')), findsNothing);
    expect(find.byKey(const Key('space-album-kebab-unlink')), findsNothing);
  });

  // Scenario 67
  testWidgets('viewer who owns the album: Delete offered, and the page pops on success', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(
      () => api.bulkDeleteAlbums(any(), any()),
    ).thenAnswer((_) async => [BulkIdResponseDto(id: 'a1', success: true)]);

    final router = await pumpDetailPageOnRouter(
      tester,
      albums: [_album(id: 'a1', name: 'Rome', isOwnedByMe: true)],
      albumId: 'a1',
      canEdit: false, // viewer — Delete comes from ownership alone, not canEdit
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
        remoteAlbumProvider.overrideWith(() => _NoopRemoteAlbumNotifier()),
      ],
    );

    expect(find.byType(SpaceAlbumDetailPage), findsOneWidget); // positive control — page is up

    await tester.tap(find.byWidgetPredicate((w) => w is PopupMenuButton));
    await tester.pumpAndSettle();

    // Delete is offered to this viewer because they own the album.
    expect(find.byKey(const Key('space-album-kebab-delete')), findsOneWidget);
    expect(find.byKey(const Key('space-album-kebab-rename')), findsOneWidget);

    await tester.tap(find.byKey(const Key('space-album-kebab-delete')));
    await tester.pumpAndSettle();

    // The confirmation names the actual album, not an empty string (the Task 11 defect this task
    // must not repeat).
    expect(
      find.text(
        'Delete "Rome"? This permanently deletes the album for everyone in this space, not just '
        'from this space. The photos in it are not deleted.',
      ),
      findsOneWidget,
    );
    verifyNever(() => api.bulkDeleteAlbums(any(), any())); // not fired before confirming

    await tester.tap(find.byKey(const Key('space-album-delete-confirm')));
    await tester.pumpAndSettle();

    verify(() => api.bulkDeleteAlbums(spaceId, {'a1'})).called(1);
    // Success (empty failed-set) pops the page back to the albums list.
    expect(find.byType(SpaceAlbumDetailPage), findsNothing);
    expect(router.stackData.last.name, 'SpaceAlbumDetailHarness');
  });

  testWidgets('viewer who owns the album: a failed delete shows the error toast and does not pop', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(
      () => api.bulkDeleteAlbums(any(), any()),
    ).thenAnswer((_) async => [BulkIdResponseDto(id: 'a1', success: false)]);

    await pumpDetailPageOnRouter(
      tester,
      albums: [_album(id: 'a1', name: 'Rome', isOwnedByMe: true)],
      albumId: 'a1',
      canEdit: false,
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
        remoteAlbumProvider.overrideWith(() => _NoopRemoteAlbumNotifier()),
      ],
    );

    await tester.tap(find.byWidgetPredicate((w) => w is PopupMenuButton));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-kebab-delete')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-delete-confirm')));
    await tester.pumpAndSettle();

    verify(() => api.bulkDeleteAlbums(spaceId, {'a1'})).called(1);
    // A failure stays put — the page is still up, and the error toast is shown instead of a pop.
    expect(find.byType(SpaceAlbumDetailPage), findsOneWidget);
    expect(find.text('Unable to delete album'), findsOneWidget);

    // Let the toast's fluttertoast Timer finish so teardown doesn't fail on a pending Timer.
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
  });
}
