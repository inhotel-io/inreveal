import 'dart:async';

import 'dart:convert';

import 'package:auto_route/auto_route.dart';
import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/constants/locales.dart';
import 'package:immich_mobile/domain/models/album/album.model.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/settings_key.dart';
import 'package:immich_mobile/domain/models/space_album.model.dart';
import 'package:immich_mobile/domain/models/space_album_folder.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/asset.service.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/domain/utils/background_sync.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/generated/codegen_loader.g.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/settings.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/pages/library/spaces/collection_sort.dart';
import 'package:immich_mobile/pages/library/spaces/space_albums.page.dart';
import 'package:immich_mobile/presentation/widgets/images/thumbnail.widget.dart';
import 'package:immich_mobile/presentation/widgets/spaces/space_album_folder_card.widget.dart';
import 'package:immich_mobile/providers/background_sync.provider.dart';
import 'package:immich_mobile/providers/infrastructure/album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/asset.provider.dart';
import 'package:immich_mobile/providers/infrastructure/remote_album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/space_album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/space_album_actions.dart';
import 'package:immich_mobile/repositories/drift_album_api_repository.dart';
import 'package:immich_mobile/repositories/shared_space_api.repository.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:openapi/api.dart' show ApiException, BulkIdErrorReason, BulkIdResponseDto, Optional;

import '../../test_utils.dart';
import '../../widget_tester_extensions.dart';

// ---------------------------------------------------------------------------
// Mocks (Task 10 — "Move to folder…" wiring)
// ---------------------------------------------------------------------------

class MockSharedSpaceApiRepository extends Mock implements SharedSpaceApiRepository {}

class MockBackgroundSyncManager extends Mock implements BackgroundSyncManager {}

/// `spaceAlbumActionsProvider` eagerly builds ALL three of its dependencies (repo, album-api-repo,
/// sync manager) regardless of which `SpaceAlbumActions` method is actually called — see
/// `space_album_actions.dart`'s `Provider<SpaceAlbumActions>`. `moveAlbumToFolder` never touches
/// the album-api-repo, but without overriding it here the real `driftAlbumApiRepositoryProvider`
/// still gets built during `ref.read(spaceAlbumActionsProvider)`, which resolves the real
/// `apiServiceProvider` -> `ApiService()` -> `NetworkRepository.client` -> `_client!`, a null
/// check on a static field only ever set by the native-platform-only `NetworkRepository.init()` —
/// crashing with "Null check operator used on a null value" every time. The page's own try/catch
/// swallows that (showing an error toast, correct production behaviour), which silently turns into
/// "the mocked repo was never called" here instead of a loud crash. Overriding it with a mock sidesteps
/// the real ApiService/NetworkRepository chain entirely.
class MockDriftAlbumApiRepository extends Mock implements DriftAlbumApiRepository {}

/// Folder-CRUD tests (New folder / Rename / Move / Delete) override `spaceAlbumActionsProvider`
/// directly with a mock of the whole `SpaceAlbumActions` facade, rather than mocking its three
/// sub-dependencies individually the way the album-move tests above do. This sidesteps the
/// `driftAlbumApiRepositoryProvider` -> `apiServiceProvider` -> `NetworkRepository` trap entirely
/// (nothing downstream of `spaceAlbumActionsProvider` is ever constructed) and lets each test
/// assert the exact arguments a given action was called with.
class MockSpaceAlbumActions extends Mock implements SpaceAlbumActions {}

/// I-2 fixture — a folder card's recursive count/preview needs the whole space's asset service
/// resolved, not just this level's.
class MockAssetService extends Mock implements AssetService {}

/// "New album" (createAlbum) tests stub `remoteAlbumProvider`'s `createAlbum` call directly,
/// mirroring how the folder-CRUD tests above stub `spaceAlbumActionsProvider` with a mock of the
/// whole facade rather than its sub-dependencies: overriding `remoteAlbumServiceProvider` alone
/// would still require a logged-in `currentUserProvider` (the real notifier's `createAlbum`
/// throws "User not logged in" otherwise), which is irrelevant to what these tests assert.
class _StubRemoteAlbumNotifier extends RemoteAlbumNotifier {
  _StubRemoteAlbumNotifier(this._createAlbum);

  final Future<RemoteAlbum?> Function(String title) _createAlbum;

  @override
  RemoteAlbumState build() => const RemoteAlbumState(albums: []);

  @override
  Future<RemoteAlbum?> createAlbum({required String title, String? description, List<String> assetIds = const []}) =>
      _createAlbum(title);
}

/// Task 11 fixture — `SpaceAlbumActions.renameAlbum`/`bulkDeleteAlbums` (on a success, or a
/// bulk request with at least one success) call `_onOwnedAlbumsChanged`, which is wired to
/// `remoteAlbumProvider.notifier.refresh()`. Left unoverridden, the REAL `RemoteAlbumNotifier`
/// resolves `remoteAlbumRepository` -> `driftProvider`, which this file never overrides (it
/// throws `UnimplementedError` by design — see `db.provider.dart`) — so any test that reaches a
/// successful rename/delete must override `remoteAlbumProvider` with this no-op stand-in. None of
/// the Task 11 tests assert on the refresh call itself, so a plain override (not a `Mock`, unlike
/// `space_album_actions_test.dart`'s own `MockRemoteAlbumNotifier`) is enough here.
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

SpaceAlbum _album({
  required String id,
  String? name,
  int assetCount = 0,
  bool showInTimeline = true,
  String? folderId,
  String? thumbnailAssetId,
  DateTime? linkedAt,
  DateTime? updatedAt,
  // Task 11 — `false` matches `SpaceAlbum.isOwnedByMe`'s own fail-closed default, so every
  // pre-existing call site (none of which pass this) is unaffected.
  bool isOwnedByMe = false,
}) => SpaceAlbum(
  id: id,
  name: name ?? 'Album $id',
  assetCount: assetCount,
  showInTimeline: showInTimeline,
  folderId: folderId,
  thumbnailAssetId: thumbnailAssetId,
  linkedAt: linkedAt ?? DateTime.utc(2026, 1, 1),
  updatedAt: updatedAt ?? DateTime.utc(2026, 1, 1),
  isOwnedByMe: isOwnedByMe,
);

/// I-2 fixture — a resolvable remote asset for a folder-card cover tile.
RemoteAsset _remoteAsset({required String id}) => RemoteAsset(
  id: id,
  checksum: 'checksum-$id',
  ownerId: 'owner-1',
  name: '$id.jpg',
  type: AssetType.image,
  createdAt: DateTime(2024, 1, 1),
  updatedAt: DateTime(2024, 1, 1),
  isEdited: false,
);

/// "New album" (createAlbum) fixture — the album `_StubRemoteAlbumNotifier.createAlbum` resolves
/// with, standing in for what `remoteAlbumProvider.notifier.createAlbum` would return on success.
RemoteAlbum _newAlbumFixture(String id) => RemoteAlbum(
  id: id,
  name: 'New Album',
  ownerId: 'owner-1',
  description: '',
  createdAt: DateTime(2026, 1, 1),
  updatedAt: DateTime(2026, 1, 1),
  isActivityEnabled: false,
  order: AlbumAssetOrder.desc,
  assetCount: 0,
  ownerName: 'Test User',
  isShared: false,
);

/// Task 10 (U-*) test fixture — positional (id, name), matching the plan's brief verbatim.
/// [showInTimeline] (Task 15) defaults to `true`, matching `_album`'s own default, so every
/// pre-existing call site is unaffected.
SpaceAlbum album(String id, String name, {String? folderId, bool showInTimeline = true}) =>
    _album(id: id, name: name, folderId: folderId, showInTimeline: showInTimeline);

/// Task 10 (U-*) test fixture — positional (id, name), matching the plan's brief verbatim.
SpaceAlbumFolder folder(String id, String name, {String? parentId}) =>
    SpaceAlbumFolder(id: id, spaceId: spaceId, parentId: parentId, name: name);

/// Overrides [spaceAlbumsProvider] with a fixed list, for use with
/// [WidgetTester.pumpConsumerWidget]'s `overrides` param.
///
/// Task 10 added a folders stream the page now watches unconditionally — every override list
/// must supply one (an empty list here) or the page throws resolving `driftProvider`.
List<Override> _overrides({required String spaceId, required List<SpaceAlbum> albums}) => [
  spaceAlbumsProvider(spaceId).overrideWith((_) => Stream.value(albums)),
  spaceAlbumFoldersProvider(spaceId).overrideWith((_) => Stream.value(const <SpaceAlbumFolder>[])),
];

/// Pumps [SpaceAlbumsPage] with fixed folder/album lists — no database, no router. Used by every
/// U-* test that only asserts on-screen content (U-01, U-04, U-05, U-09, U-10, U-13).
///
/// Uses a taller-than-default viewport (matching the move-to-folder tests further down this file)
/// because folders render as their OWN sliver section above the albums section (§4.2): a single
/// folder card already consumes most of the default 800x600 test surface, so a folder + album card
/// together need more room to both land in the tree without scrolling — the same category of
/// default-viewport limitation the pre-existing "row 2 may be below the fold" comment on the search
/// test (below) already flags for this file.
Future<void> pumpPage(
  WidgetTester tester, {
  required List<SpaceAlbumFolder> folders,
  required List<SpaceAlbum> albums,
  String? folderId,
  bool canEdit = true,
  List<Override> overrides = const [],
}) async {
  tester.view.devicePixelRatio = 3.0;
  tester.view.physicalSize = const Size(2400, 3600);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpConsumerWidget(
    SpaceAlbumsPage(spaceId: spaceId, canEdit: canEdit, folderId: folderId),
    overrides: [
      spaceAlbumsProvider(spaceId).overrideWith((_) => Stream.value(albums)),
      spaceAlbumFoldersProvider(spaceId).overrideWith((_) => Stream.value(folders)),
      ...overrides,
    ],
  );
}

/// Pushes [SpaceAlbumsPage] onto a real AutoRoute stack (harness home is a plain placeholder, NOT
/// a [SpaceAlbumsPage], so a pop leaves zero [SpaceAlbumsPage] instances behind — see U-11) with
/// the folders provider backed by the caller's own controllable [folderStream]. Returns the
/// router so the caller can drive further navigation (U-02, U-03) or just let U-11's `maybePop`
/// play out.
Future<RootStackRouter> pumpPageWithFolderStream(
  WidgetTester tester,
  Stream<List<SpaceAlbumFolder>> folderStream, {
  required String folderId,
  List<SpaceAlbum> albums = const [],
  bool canEdit = true,
}) async {
  final router = RootStackRouter.build(
    routes: [
      AutoRoute(initial: true, page: PageInfo('SpaceAlbumsHarness', builder: (_) => const SizedBox.shrink())),
      AutoRoute(page: SpaceAlbumsRoute.page),
    ],
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
          spaceAlbumFoldersProvider(spaceId).overrideWith((_) => folderStream),
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
  // NOT awaited: `push`'s Future resolves only once the pushed route is later POPPED (Navigator
  // semantics — see `_addNewPage` in auto_route, which returns the pop completer), so awaiting it
  // here would deadlock forever: nothing pops this route until the CALLER (after this helper
  // returns) drives the folder stream and lets U-11's `context.maybePop()` fire. Matches the
  // sibling pattern (`timeline_scroll_to_top_test.dart`'s `unawaited(router.pushPath(...))`).
  unawaited(router.push(SpaceAlbumsRoute(spaceId: spaceId, canEdit: canEdit, folderId: folderId)));
  await tester.pumpAndSettle();
  return router;
}

/// U-11 stacked-pages regression harness — pushes [SpaceAlbumsPage] onto a real AutoRoute stack
/// ONCE PER ENTRY in [folderIds] (root -> folderIds[0] -> folderIds[1] -> ...), mirroring the
/// real drill-down flow where the route is pushed onto ITSELF for each nested folder level (see
/// the class doc on [SpaceAlbumsPage]). Every pushed page watches the SAME
/// [spaceAlbumFoldersProvider] instance (same spaceId), so a single [folderStream] emission is
/// delivered to ALL of their `ref.listen` subscriptions at once — the scenario
/// [pumpPageWithFolderStream]'s single-page stack cannot exercise: whether a reacting page pops
/// the correct (its OWN) route rather than always the topmost one, and (with 3+ entries) whether
/// a self-pop cascades through exactly the right number of routes.
///
/// [folderIds] entries need not be distinct: two adjacent entries with the SAME id reproduce a
/// double-tap on a folder card. `AppRouter` now blocks that at the push site in PRODUCTION
/// (`SpaceAlbumsDuplicateGuard`, router.dart:179 — see space_albums_duplicate_guard.dart), but
/// this harness deliberately builds its OWN router (below) with NO guard at all on
/// `SpaceAlbumsRoute`, so the identical-args self-pop case stays directly reachable and tested
/// here regardless of that production guard — this divergence from `AppRouter`'s route table is
/// intentional, not an oversight.
Future<RootStackRouter> pumpStackedFolderPagesWithFolderStream(
  WidgetTester tester,
  Stream<List<SpaceAlbumFolder>> folderStream, {
  required List<String> folderIds,
  List<SpaceAlbum> albums = const [],
  bool canEdit = true,
}) async {
  final router = RootStackRouter.build(
    routes: [
      AutoRoute(initial: true, page: PageInfo('SpaceAlbumsHarness', builder: (_) => const SizedBox.shrink())),
      AutoRoute(page: SpaceAlbumsRoute.page),
    ],
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
          spaceAlbumFoldersProvider(spaceId).overrideWith((_) => folderStream),
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
  for (final folderId in folderIds) {
    // NOT awaited — same reasoning as `pumpPageWithFolderStream` above: `push`'s Future only
    // resolves once the pushed route is popped, and driving that pop (or self-pop) via the
    // folder stream is exactly what the caller does after this helper returns.
    unawaited(router.push(SpaceAlbumsRoute(spaceId: spaceId, canEdit: canEdit, folderId: folderId)));
    await tester.pumpAndSettle();
  }
  return router;
}

/// `ImmichToast` schedules a 3s fluttertoast Timer outside the frame scheduler, so a plain
/// `pumpAndSettle()` leaves it pending and teardown fails with "A Timer is still pending". Pump
/// past its lifetime instead of dropping the toast from the widget (mirrors
/// `space_edit_sheet_test.dart`'s identical helper).
Future<void> settleToast(WidgetTester tester) async {
  await tester.pumpAndSettle();
  await tester.pump(const Duration(seconds: 4));
  await tester.pumpAndSettle();
}

/// The visually-first card among [ids] (top-left-most in reading order),
/// determined from actual on-screen position — robust to grid
/// row/column layout regardless of how many items are present.
String _firstCardByPosition(WidgetTester tester, List<String> ids) {
  final positions = {for (final id in ids) id: tester.getTopLeft(find.byKey(Key('space-album-card-$id')))};
  final sorted = positions.entries.toList()
    ..sort((a, b) {
      final dy = a.value.dy.compareTo(b.value.dy);
      return dy != 0 ? dy : a.value.dx.compareTo(b.value.dx);
    });
  return sorted.first.key;
}

/// The ⋮ menu button for a SPECIFIC folder card. `SpaceAlbumFolderCard`'s own menu key
/// (`space-album-folder-card-menu`, from Task 9) is NOT parameterized by folder id — it's the same
/// literal key on every card — so `find.byKey` alone is ambiguous whenever more than one folder
/// renders at once. Scoping through the card's own per-id key (`space-album-folder-card-<id>`)
/// disambiguates.
Finder _folderMenuFinder(String folderId) => find.descendant(
  of: find.byKey(Key('space-album-folder-card-$folderId')),
  matching: find.byKey(const Key('space-album-folder-card-menu')),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  late Drift db;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    TestUtils.init();
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

  testWidgets('editor + 2 albums: shows 2 cards with ⋮ menu and ＋ Link action', (tester) async {
    final albums = [
      _album(id: 'a1', name: 'Hawaii', assetCount: 142),
      _album(id: 'a2', name: 'Sunsets', assetCount: 38),
    ];

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: _overrides(spaceId: spaceId, albums: albums),
    );

    // 2 cards
    expect(find.byKey(const Key('space-album-card-a1')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-a2')), findsOneWidget);
    // ⋮ overflow menu on each card (editor)
    expect(find.byKey(const Key('space-album-card-menu-a1')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-menu-a2')), findsOneWidget);
    // ＋ Link action in app-bar (editor)
    expect(find.byKey(const Key('space-albums-link-action')), findsOneWidget);
  });

  testWidgets('viewer + 2 albums: shows 2 cards but NO ⋮ menu and NO ＋ Link action', (tester) async {
    final albums = [_album(id: 'a1', name: 'Hawaii'), _album(id: 'a2', name: 'Sunsets')];

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: false),
      overrides: _overrides(spaceId: spaceId, albums: albums),
    );

    // 2 cards visible
    expect(find.byKey(const Key('space-album-card-a1')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-a2')), findsOneWidget);
    // No ⋮ menus for viewer
    expect(find.byKey(const Key('space-album-card-menu-a1')), findsNothing);
    expect(find.byKey(const Key('space-album-card-menu-a2')), findsNothing);
    // No ＋ Link action
    expect(find.byKey(const Key('space-albums-link-action')), findsNothing);
  });

  testWidgets('empty + editor: shows empty state', (tester) async {
    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: _overrides(spaceId: spaceId, albums: const []),
    );

    expect(find.byKey(const Key('space-albums-empty')), findsOneWidget);
    // No album cards
    expect(
      find.byWidgetPredicate(
        (w) => w.key is ValueKey<String> && (w.key as ValueKey<String>).value.startsWith('space-album-card-'),
      ),
      findsNothing,
    );
  });

  testWidgets('off-timeline album card shows visibility_off icon', (tester) async {
    final albums = [
      _album(id: 'a1', name: 'Hawaii', showInTimeline: true),
      _album(id: 'a2', name: 'Reef dives', showInTimeline: false, assetCount: 12),
    ];

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: _overrides(spaceId: spaceId, albums: albums),
    );

    expect(find.byIcon(Icons.visibility_off), findsOneWidget);
    // The off-timeline card should show the "Hidden" label
    expect(find.text('· Hidden'), findsOneWidget);
  });

  // ---------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------

  testWidgets('typing a query filters the grid to matching albums', (tester) async {
    final albums = [
      _album(id: 'hidden1', name: 'Reef dives', showInTimeline: false, assetCount: 12),
      _album(id: 'it1', name: 'Italy Summer'),
      _album(id: 'it2', name: 'Italy Winter'),
    ];

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: _overrides(spaceId: spaceId, albums: albums),
    );

    // All 3 counted initially (row 2 may be below the fold in the test
    // viewport; the result count is the reliable signal), search field
    // present, no clear button yet.
    expect(find.text('3 albums'), findsOneWidget);
    expect(find.byKey(const Key('space-albums-search-field')), findsOneWidget);
    expect(find.byKey(const Key('space-albums-search-clear')), findsNothing);

    await tester.enterText(find.byKey(const Key('space-albums-search-field')), 'ita');
    await tester.pumpAndSettle();

    // Only the two Italy albums remain
    expect(find.byKey(const Key('space-album-card-hidden1')), findsNothing);
    expect(find.byKey(const Key('space-album-card-it1')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-it2')), findsOneWidget);
    // Clear (✕) button now shows
    expect(find.byKey(const Key('space-albums-search-clear')), findsOneWidget);
    // Result count reflects filtered-of-total plus the query while searching
    expect(find.text('2 of 3 · matches "ita"'), findsOneWidget);
  });

  testWidgets('tapping the clear (✕) button resets the query and restores the full list', (tester) async {
    final albums = [_album(id: 'it1', name: 'Italy Summer'), _album(id: 'hawaii1', name: 'Hawaii')];

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: _overrides(spaceId: spaceId, albums: albums),
    );

    await tester.enterText(find.byKey(const Key('space-albums-search-field')), 'ita');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('space-album-card-hawaii1')), findsNothing);

    await tester.tap(find.byKey(const Key('space-albums-search-clear')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('space-album-card-hawaii1')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-it1')), findsOneWidget);
    expect(find.byKey(const Key('space-albums-search-clear')), findsNothing);
  });

  // ---------------------------------------------------------------------
  // No-match vs genuinely-empty
  // ---------------------------------------------------------------------

  testWidgets('a query matching nothing shows the no-match state, not the empty state', (tester) async {
    final albums = [_album(id: 'it1', name: 'Italy Summer'), _album(id: 'hawaii1', name: 'Hawaii')];

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: _overrides(spaceId: spaceId, albums: albums),
    );

    await tester.enterText(find.byKey(const Key('space-albums-search-field')), 'zzz');
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('space-albums-no-match')), findsOneWidget);
    expect(find.byKey(const Key('space-albums-empty')), findsNothing);
    expect(find.byKey(const Key('space-album-card-it1')), findsNothing);
    expect(find.byKey(const Key('space-album-card-hawaii1')), findsNothing);
    expect(
      find.descendant(of: find.byKey(const Key('space-albums-no-match')), matching: find.textContaining('zzz')),
      findsOneWidget,
    );
  });

  testWidgets('a genuinely empty space still shows the empty state, not the no-match state', (tester) async {
    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: _overrides(spaceId: spaceId, albums: const []),
    );

    expect(find.byKey(const Key('space-albums-empty')), findsOneWidget);
    expect(find.byKey(const Key('space-albums-no-match')), findsNothing);
    // No search/sort chrome when the space has zero linked albums
    expect(find.byKey(const Key('space-albums-search-field')), findsNothing);
  });

  // Regression: the folder-tree refactor dropped the top-level "space genuinely has zero albums"
  // guard, so this exact transition (non-empty with an active query -> the last album vanishes)
  // fell through to the no-match state instead. The two tests above only cover MOUNTING with an
  // empty list / a non-matching query already typed -- neither exercises becoming empty WHILE a
  // query is still active, which is the transition that actually regressed.
  testWidgets('the last album disappearing mid-search shows the empty state, not the no-match state', (tester) async {
    final controller = StreamController<List<SpaceAlbum>>();
    addTearDown(controller.close);
    controller.add([_album(id: 'it1', name: 'Italy Summer')]);

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: [
        spaceAlbumsProvider(spaceId).overrideWith((_) => controller.stream),
        spaceAlbumFoldersProvider(spaceId).overrideWith((_) => Stream.value(const <SpaceAlbumFolder>[])),
      ],
    );

    await tester.enterText(find.byKey(const Key('space-albums-search-field')), 'ita');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('space-album-card-it1')), findsOneWidget);

    // The last linked album is unlinked elsewhere (another device/user) while this query is
    // still active -- the query itself never changes.
    controller.add(const []);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('space-albums-empty')), findsOneWidget);
    expect(find.byKey(const Key('space-albums-no-match')), findsNothing);
  });

  // ---------------------------------------------------------------------
  // Sort
  // ---------------------------------------------------------------------

  testWidgets('picking a different sort mode reorders the grid and persists the choice', (tester) async {
    final albums = [
      _album(id: 'r1', name: 'Reorder A', assetCount: 50, linkedAt: DateTime.utc(2026, 1, 1)),
      _album(id: 'r2', name: 'Reorder B', assetCount: 5, linkedAt: DateTime.utc(2026, 1, 10)),
    ];

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: _overrides(spaceId: spaceId, albums: albums),
    );

    // Default mode is "Recently linked" (desc) -> the more-recently-linked
    // r2 sorts first.
    expect(_firstCardByPosition(tester, ['r1', 'r2']), 'r2');

    await tester.tap(find.byKey(const Key('collection-sort-button-pill')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Photo count'));
    await tester.pumpAndSettle();

    // Now sorted by asset count desc -> r1 (50) sorts before r2 (5).
    expect(_firstCardByPosition(tester, ['r1', 'r2']), 'r1');
    expect(SettingsRepository.instance.appConfig.spaceAlbums.sortMode, SpaceAlbumSortMode.photoCount);
    expect(SettingsRepository.instance.appConfig.spaceAlbums.isReverse, false);
  });

  testWidgets('re-tapping the current sort mode reverses the order and persists it', (tester) async {
    final albums = [
      _album(id: 'r1', name: 'Reorder A', assetCount: 50, linkedAt: DateTime.utc(2026, 1, 1)),
      _album(id: 'r2', name: 'Reorder B', assetCount: 5, linkedAt: DateTime.utc(2026, 1, 10)),
    ];

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: _overrides(spaceId: spaceId, albums: albums),
    );

    expect(_firstCardByPosition(tester, ['r1', 'r2']), 'r2');

    // Re-tap the already-selected mode ("Recently linked") -> reverses.
    await tester.tap(find.byKey(const Key('collection-sort-button-pill')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Recently linked'));
    await tester.pumpAndSettle();

    expect(_firstCardByPosition(tester, ['r1', 'r2']), 'r1');
    expect(SettingsRepository.instance.appConfig.spaceAlbums.sortMode, SpaceAlbumSortMode.recentlyLinked);
    expect(SettingsRepository.instance.appConfig.spaceAlbums.isReverse, true);
  });

  testWidgets('a persisted sort mode is honored on mount, not just after picking it', (tester) async {
    final albums = [
      _album(id: 'r1', name: 'Reorder A', assetCount: 50, linkedAt: DateTime.utc(2026, 1, 1)),
      _album(id: 'r2', name: 'Reorder B', assetCount: 5, linkedAt: DateTime.utc(2026, 1, 10)),
    ];

    // Pre-seed a persisted, non-default sort mode BEFORE the page ever mounts
    // — proves the page reads the stored config on mount rather than merely
    // writing to it when the user picks a mode from the menu.
    await SettingsRepository.instance.write(SettingsKey.spaceAlbumsSortMode, SpaceAlbumSortMode.photoCount);
    await SettingsRepository.instance.write(SettingsKey.spaceAlbumsIsReverse, false);

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: _overrides(spaceId: spaceId, albums: albums),
    );

    // photoCount desc -> r1 (50) sorts before r2 (5). The default mode
    // (recentlyLinked) would instead put r2 first, so this proves the
    // persisted mode was actually read, not just the default applied.
    expect(_firstCardByPosition(tester, ['r1', 'r2']), 'r1');
    expect(find.text('Sort: Photo count'), findsOneWidget);
  });

  // I-1 — regression: flattenForSearch returns raw (name-ascending, per watchLinkedAlbums)
  // server order; the search branch used to pass that order straight to the grid, silently
  // discarding the user's chosen sort for the duration of the query. The three sort tests above
  // all run with an EMPTY query, and U-09 below only asserts presence/absence with a query
  // active, never order — so this is the one test that actually pins ORDER while searching.
  testWidgets('I-1: a search query still respects the active sort order', (tester) async {
    final albums = [
      _album(id: 'a1', name: 'Beach A', assetCount: 5),
      _album(id: 'a2', name: 'Beach B', assetCount: 50),
    ];

    await SettingsRepository.instance.write(SettingsKey.spaceAlbumsSortMode, SpaceAlbumSortMode.photoCount);
    await SettingsRepository.instance.write(SettingsKey.spaceAlbumsIsReverse, false);

    await pumpPage(tester, folders: const [], albums: albums);

    // No query: photoCount desc -> Beach B (50) sorts before Beach A (5).
    expect(_firstCardByPosition(tester, ['a1', 'a2']), 'a2');

    await tester.enterText(find.byKey(const Key('space-albums-search-field')), 'beach');
    await tester.pumpAndSettle();

    // Both still match "beach" — the active sort must still put Beach B first, not the
    // name-ascending order flattenForSearch returns on its own.
    expect(find.byKey(const Key('space-album-card-a1')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-a2')), findsOneWidget);
    expect(_firstCardByPosition(tester, ['a1', 'a2']), 'a2');
  });

  // ---------------------------------------------------------------------
  // Regression: search + sort chrome doesn't affect role gating
  // ---------------------------------------------------------------------

  testWidgets('search field and sort pill render for both editor and viewer', (tester) async {
    final albums = [_album(id: 'a1', name: 'Hawaii'), _album(id: 'a2', name: 'Sunsets')];

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: false),
      overrides: _overrides(spaceId: spaceId, albums: albums),
    );

    expect(find.byKey(const Key('space-albums-search-field')), findsOneWidget);
    expect(find.byKey(const Key('collection-sort-button-pill')), findsOneWidget);
    // Still no editor-only affordances for a viewer
    expect(find.byKey(const Key('space-albums-link-action')), findsNothing);
    expect(find.byKey(const Key('space-album-card-menu-a1')), findsNothing);
  });

  // ---------------------------------------------------------------------
  // Reactivity
  // ---------------------------------------------------------------------

  testWidgets('a new spaceAlbumsProvider emission re-applies the active filter + sort', (tester) async {
    final controller = StreamController<List<SpaceAlbum>>();
    addTearDown(controller.close);

    controller.add([_album(id: 'it1', name: 'Italy Summer'), _album(id: 'hawaii1', name: 'Hawaii')]);

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: [
        spaceAlbumsProvider(spaceId).overrideWith((_) => controller.stream),
        spaceAlbumFoldersProvider(spaceId).overrideWith((_) => Stream.value(const <SpaceAlbumFolder>[])),
      ],
    );

    await tester.enterText(find.byKey(const Key('space-albums-search-field')), 'ita');
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('space-album-card-it1')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-hawaii1')), findsNothing);

    // A fresh stream emission adds a new matching album and a new
    // non-matching one; the active "ita" filter must still apply.
    controller.add([
      _album(id: 'it1', name: 'Italy Summer'),
      _album(id: 'hawaii1', name: 'Hawaii'),
      _album(id: 'it3', name: 'Italy Roadtrip'),
      _album(id: 'nz1', name: 'New Zealand'),
    ]);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('space-album-card-it1')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-it3')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-hawaii1')), findsNothing);
    expect(find.byKey(const Key('space-album-card-nz1')), findsNothing);
  });

  testWidgets('regression: album card is HitTestBehavior.opaque so cover taps register', (tester) async {
    // The card cover is an image whose render object does NOT participate in
    // hit-testing, so with the GestureDetector's default `deferToChild`
    // behavior a tap on the cover — where users tap an album — was a dead no-op
    // (only the small name Text was hittable), so opening an album "did
    // nothing". The fix sets `HitTestBehavior.opaque`; this fails on the
    // default (null) behavior.
    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: false),
      overrides: _overrides(
        spaceId: spaceId,
        albums: [_album(id: 'a1', name: 'Hawaii')],
      ),
    );

    final gesture = tester.widget<GestureDetector>(
      find.descendant(of: find.byKey(const Key('space-album-card-a1')), matching: find.byType(GestureDetector)),
    );
    expect(gesture.onTap, isNotNull);
    expect(gesture.behavior, HitTestBehavior.opaque);
  });

  // ---------------------------------------------------------------------
  // Task 10 — folders (U-01..U-05, U-09..U-11, U-13)
  // ---------------------------------------------------------------------

  testWidgets('U-01: renders folders before albums', (tester) async {
    await pumpPage(tester, folders: [folder('trips', 'Trips')], albums: [album('a1', 'Rome')]);

    final folderY = tester.getTopLeft(find.byType(SpaceAlbumFolderCard)).dy;
    final albumY = tester.getTopLeft(find.byKey(const Key('space-album-card-a1'))).dy;
    expect(folderY, lessThan(albumY));
  });

  testWidgets('U-04: a space with no folders renders the flat list unchanged', (tester) async {
    await pumpPage(tester, folders: const [], albums: [album('a1', 'Rome')]);

    expect(find.byType(SpaceAlbumFolderCard), findsNothing);
    expect(find.text('Rome'), findsOneWidget);
  });

  testWidgets('U-05: an empty folder shows the folder-specific empty state', (tester) async {
    await pumpPage(tester, folders: [folder('trips', 'Trips')], albums: const [], folderId: 'trips');

    expect(find.byKey(const Key('space-album-folder-empty')), findsOneWidget);
    expect(find.byKey(const Key('space-albums-empty')), findsNothing);
  });

  // U-06 — the folder-card ⋮ half of this scenario is already covered at the widget level in
  // `space_album_folder_card_test.dart`. The "no New folder action" half can only be tested HERE:
  // it's an app-bar affordance the card test file has no way to see.
  testWidgets('U-06: a viewer sees no folder ⋮ menu and no New folder action', (tester) async {
    await pumpPage(tester, folders: [folder('trips', 'Trips')], albums: const [], canEdit: false);

    expect(find.byKey(const Key('space-album-folder-card-menu')), findsNothing);
    expect(find.byKey(const Key('space-albums-new-folder-action')), findsNothing);
  });

  // I-2 — regression: `_LevelGrid`'s `allFolders`/`allAlbums` must be the WHOLE space's folders
  // and albums, not just the current level's (`folders`/`sortedAlbums`), because
  // recursiveAlbumCount/folderPreviewAlbums need the full subtree. A folder holding only a
  // SUBFOLDER (no direct albums of its own) is the fixture that actually distinguishes the two:
  // at the root level, `contents.albums` is empty (the one album lives inside 'day1'), so passing
  // level-only data would show "0 albums" and the empty-folder glyph instead of the real count
  // and cover — while every OTHER existing test in this file uses a flat folder (album directly
  // inside it), which happens to read the same whether `allAlbums` is level-only or whole-space.
  testWidgets('U-12/I-2: a folder holding only a subfolder shows the whole-subtree count and cover, not level-only', (
    tester,
  ) async {
    final mockService = MockAssetService();
    when(() => mockService.getRemoteAsset('thumb-1')).thenAnswer((_) async => _remoteAsset(id: 'thumb-1'));
    await Store.put(StoreKey.serverEndpoint, 'http://localhost:3000');
    addTearDown(() => Store.clear());

    await pumpPage(
      tester,
      folders: [
        folder('trips', 'Trips'),
        folder('day1', 'Day 1', parentId: 'trips'),
      ],
      albums: [_album(id: 'a1', name: 'Rome', folderId: 'day1', thumbnailAssetId: 'thumb-1')],
      overrides: [assetServiceProvider.overrideWithValue(mockService)],
    );
    // The FutureBuilder resolves the mocked (already-completed) Future asynchronously; a
    // follow-up pump lets it rebuild with the real Thumbnail.
    await tester.pump();

    final cardFinder = find.byKey(const Key('space-album-folder-card-trips'));
    expect(cardFinder, findsOneWidget);
    // Count: the album lives one level deeper (inside 'day1'), so a level-only read of this
    // level's contents would be empty and render "0 albums".
    expect(find.descendant(of: cardFinder, matching: find.textContaining('1')), findsOneWidget);
    // Cover: a real Thumbnail renders, not the empty-folder fallback glyph.
    expect(find.descendant(of: cardFinder, matching: find.byType(Thumbnail)), findsOneWidget);
    expect(find.descendant(of: cardFinder, matching: find.byIcon(Icons.folder_outlined)), findsNothing);
  });

  testWidgets('U-09: a query hides folders and shows space-wide hits with paths', (tester) async {
    await pumpPage(
      tester,
      folders: [folder('trips', 'Trips')],
      albums: [
        album('a1', 'Venice', folderId: 'trips'),
        album('a2', 'Rome'),
      ],
    );

    await tester.enterText(find.byKey(const Key('space-albums-search-field')), 'ven');
    await tester.pumpAndSettle();

    expect(find.byType(SpaceAlbumFolderCard), findsNothing);
    expect(find.text('Venice'), findsOneWidget);
    expect(find.textContaining('Trips'), findsWidgets);
  });

  // U-13 — the page ALREADY renders a no-match state (Key('space-albums-no-match')) when a
  // query filters everything out. Switching search to tree-wide flattening must PRESERVE it;
  // replacing it with a blank grid would silently regress existing behaviour.
  testWidgets('U-13: a tree-wide search matching nothing shows the no-match state', (tester) async {
    await pumpPage(tester, folders: [folder('trips', 'Trips')], albums: [album('a1', 'Rome')]);

    await tester.enterText(find.byKey(const Key('space-albums-search-field')), 'zzzz');
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('space-albums-no-match')), findsOneWidget);
    expect(find.byType(SpaceAlbumFolderCard), findsNothing);
  });

  testWidgets('U-10: clearing the query returns to the current level', (tester) async {
    await pumpPage(tester, folders: [folder('trips', 'Trips')], albums: [album('a1', 'Rome')]);

    await tester.enterText(find.byKey(const Key('space-albums-search-field')), 'zzz');
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('space-albums-search-field')), '');
    await tester.pumpAndSettle();

    expect(find.byType(SpaceAlbumFolderCard), findsOneWidget);
    expect(find.text('Rome'), findsOneWidget);
  });

  // U-11 — the local-first difference from web: the screen can be invalidated underneath the
  // user by an incoming sync at any moment, not only on navigation. If the folder we are inside
  // disappears from the stream, we must pop rather than sit on a folder that no longer exists.
  testWidgets('U-11: pops when the folder you are inside disappears from the stream', (tester) async {
    final controller = StreamController<List<SpaceAlbumFolder>>();
    addTearDown(controller.close);
    await pumpPageWithFolderStream(tester, controller.stream, folderId: 'trips');
    controller.add([folder('trips', 'Trips')]);
    await tester.pumpAndSettle();

    controller.add(const []);
    await tester.pumpAndSettle();

    expect(find.byType(SpaceAlbumsPage), findsNothing);
  });

  // U-11 stacked (deferred self-pop) — the wrong-victim-pop regression: folder drill-down
  // pushes SpaceAlbumsRoute onto ITSELF, so a stack of root -> A(folder-a) -> B(folder-b) is a
  // real, common shape. Every stacked page below the top keeps a LIVE `ref.listen` (Navigator's
  // default `maintainState`), so when folder-a vanishes, page A's listener condition matches.
  //
  // Investigation (see .superpowers/sdd/space-album-folders-review-fixes/task-2-report.md)
  // showed a buried page cannot safely splice its OWN route out of the stack in place:
  // `AutoRoutePage.canUpdate` keys on the route NAME (not a per-push unique id), and since
  // SpaceAlbumsRoute is deliberately self-recursive, Flutter's declarative page-diff can't
  // tell A and B apart — surgical removal of a buried instance crashes ("setState during
  // build") and silently swaps mounted state between routes. The binding controller decision
  // (task-2-brief.md addendum) is DEFERRED SELF-POP instead: a buried page records a pending
  // flag and leaves the stack untouched until it next becomes the visible top on its own (the
  // routes above it popping), at which point it pops itself immediately — before the user can
  // ever interact with the dead page.
  testWidgets('U-11 stacked: a buried page whose folder vanishes stays put until topmost, then self-pops', (
    tester,
  ) async {
    final controller = StreamController<List<SpaceAlbumFolder>>();
    addTearDown(controller.close);
    final router = await pumpStackedFolderPagesWithFolderStream(
      tester,
      controller.stream,
      folderIds: ['folder-a', 'folder-b'],
    );

    // First real emission: guarded by the "no prior data" check — must not react to the
    // transition out of "no data yet" (sync simply may not have delivered the folders yet).
    controller.add([folder('folder-a', 'Folder A'), folder('folder-b', 'Folder B', parentId: 'folder-a')]);
    await tester.pumpAndSettle();
    expect(router.stackData.length, 3); // harness + A + B

    // folder-a (the BURIED page's folder) vanishes — e.g. another editor deleted it. A must
    // NOT touch the stack yet: B — topmost, still valid — stays exactly where it is.
    controller.add([folder('folder-b', 'Folder B')]);
    await tester.pumpAndSettle();

    // `router.stackData` (not `find.byType`) is the authoritative signal here: even at
    // baseline, with nothing wrong, a covered/offstage page's widget subtree isn't
    // independently discoverable via `find.byType` in this harness, while its RouteData
    // persists in `stackData` regardless — so `stackData` is what actually proves "A's route
    // is still in the stack, nothing was popped."
    expect(router.stackData.length, 3); // nothing popped yet — A is still buried in the stack
    final topArgs = router.stackData.last.args as SpaceAlbumsRouteArgs;
    expect(topArgs.folderId, 'folder-b');
    expect(
      router.stackData.any(
        (d) => d.args is SpaceAlbumsRouteArgs && (d.args as SpaceAlbumsRouteArgs).folderId == 'folder-a',
      ),
      isTrue,
      reason: "A's route must still be in the stack, buried but untouched",
    );
    expect(find.byType(SpaceAlbumsPage), findsOneWidget); // B, the only currently-rendered page

    // The user navigates back out of B — unrelated to A's dead folder. The moment A becomes
    // the visible top, it must self-pop through to root immediately: A must never settle as
    // the visible page.
    await router.maybePop();
    await tester.pumpAndSettle();

    expect(router.stackData.length, 1); // harness root only
    expect(find.byType(SpaceAlbumsPage), findsNothing);
  });

  testWidgets('U-11 stacked: the topmost page whose folder vanishes pops normally, revealing the page below', (
    tester,
  ) async {
    final controller = StreamController<List<SpaceAlbumFolder>>();
    addTearDown(controller.close);
    final router = await pumpStackedFolderPagesWithFolderStream(
      tester,
      controller.stream,
      folderIds: ['folder-a', 'folder-b'],
    );

    controller.add([folder('folder-a', 'Folder A'), folder('folder-b', 'Folder B', parentId: 'folder-a')]);
    await tester.pumpAndSettle();
    expect(router.stackData.length, 3);

    // folder-b (the TOPMOST page's folder) vanishes; folder-a survives.
    controller.add([folder('folder-a', 'Folder A')]);
    await tester.pumpAndSettle();

    expect(router.stackData.length, 2); // harness + A
    final topArgs = router.stackData.last.args as SpaceAlbumsRouteArgs;
    expect(topArgs.folderId, 'folder-a');
    expect(find.byType(SpaceAlbumsPage), findsOneWidget);
  });

  // Task-2 review, Finding 1 — `navigationHistory`'s notifyListeners is URL-STRING based
  // (`onNewUrlState` only fires when the computed `UrlState` differs, and `UrlState.==` compares
  // route segments). Two stacked `SpaceAlbumsRoute`s sharing the SAME folderId produce IDENTICAL
  // segments before and after the covering instance pops, so that channel alone would silently
  // never notify. The fix adds a URL-string-independent poll as a safety net; this test is what
  // actually exercises it (the two tests above never hit this gap, since their stacked pages
  // always have DIFFERENT folderIds and so DO change the UrlState on every pop).
  //
  // UPDATE (Task 6) — identical-args stacking is now blocked in PRODUCTION by
  // `SpaceAlbumsDuplicateGuard` (router.dart:179 — see space_albums_duplicate_guard.dart): a
  // second tap arrives after the first tap's push has already landed (`StackRouter._push` awaits
  // `_canNavigate` before calling `_addNewPage`, auto_route 11.1.0's routing_controller.dart:1363,
  // so both land within the same event-loop turn), so `router.current.args.folderId ==
  // pendingArgs.folderId` and the guard blocks the second push before this page ever stacks twice
  // with the same folderId. This harness (`pumpStackedFolderPagesWithFolderStream`, above)
  // deliberately builds its OWN router with NO guard at all on `SpaceAlbumsRoute`, so the
  // identical-args self-pop case stays directly reachable here regardless of that production
  // guard — this test is what keeps `pollNextFrame` honest.
  testWidgets('U-11 stacked: identical-folderId siblings (double-tap) still self-pop despite an unchanged UrlState', (
    tester,
  ) async {
    final controller = StreamController<List<SpaceAlbumFolder>>();
    addTearDown(controller.close);
    final router = await pumpStackedFolderPagesWithFolderStream(
      tester,
      controller.stream,
      folderIds: ['folder-x', 'folder-x'], // double-tap: A and A' both browse the SAME folder
    );

    controller.add([folder('folder-x', 'Folder X')]);
    await tester.pumpAndSettle();
    expect(router.stackData.length, 3); // harness + A + A'

    // folder-x vanishes entirely: A' (topmost) pops immediately; A (buried) flags itself
    // pending — and, on the UrlState channel alone, would never hear that A' actually popped.
    controller.add(const []);
    await tester.pumpAndSettle();

    // A must still self-pop through to root — never settle as the visible dead page just
    // because its own UrlState happens to read identically to A's before A' popped.
    expect(router.stackData.length, 1); // harness root only
    expect(find.byType(SpaceAlbumsPage), findsNothing);
  });

  // Task-2 review, Finding 2 — `StackRouter.maybePop` is async and the pending-pop
  // listener/poll aren't torn down until the NEXT rebuild processes `pendingSelfPop` flipping to
  // false, so a second notification/frame landing before that rebuild lands must be a no-op, not
  // a second `maybePop()` that would take the route BELOW this page with it too. A root->A->B
  // stack can't expose a double-pop even if one happened: its settled bottom is the root harness,
  // where a stray extra pop is a no-op either way. This pins the OBSERVABLE outcome the guard
  // exists to protect — self-pop lands on exactly one route (X survives) — on a stack where a
  // double-pop would have a visible victim; needs a route BELOW the self-popping page for that.
  testWidgets('U-11 stacked: a self-pop never doubles up and takes the route below it too', (tester) async {
    final controller = StreamController<List<SpaceAlbumFolder>>();
    addTearDown(controller.close);
    final router = await pumpStackedFolderPagesWithFolderStream(
      tester,
      controller.stream,
      folderIds: ['folder-x', 'folder-a', 'folder-b'], // root -> X -> A -> B
    );

    controller.add([
      folder('folder-x', 'Folder X'),
      folder('folder-a', 'Folder A', parentId: 'folder-x'),
      folder('folder-b', 'Folder B', parentId: 'folder-a'),
    ]);
    await tester.pumpAndSettle();
    expect(router.stackData.length, 4); // harness + X + A + B

    // folder-a (A's own folder, buried under B) vanishes; X and B are unaffected.
    controller.add([folder('folder-x', 'Folder X'), folder('folder-b', 'Folder B')]);
    await tester.pumpAndSettle();
    expect(router.stackData.length, 4); // nothing popped yet — A is still buried, now pending

    // The user backs out of B. A must self-pop EXACTLY once, landing on X — not also take X
    // with it via a redundant second `maybePop()` racing in the same notification window.
    await router.maybePop();
    await tester.pumpAndSettle();

    expect(router.stackData.length, 2); // harness + X — A self-popped exactly once
    final topArgs = router.stackData.last.args as SpaceAlbumsRouteArgs;
    expect(topArgs.folderId, 'folder-x');
    expect(find.byType(SpaceAlbumsPage), findsOneWidget);
  });

  // Task-2 review, Finding 3 — a transient false-vanish emission (the folder is momentarily
  // missing from one sync batch, then present again in a later one) must not leave a stale
  // pending self-pop armed: this page must stay put once it surfaces, not pop itself later for a
  // folder that's valid again by the time anyone's looking.
  testWidgets('U-11 stacked: a folder reappearing after a transient vanish clears the pending self-pop', (
    tester,
  ) async {
    final controller = StreamController<List<SpaceAlbumFolder>>();
    addTearDown(controller.close);
    final router = await pumpStackedFolderPagesWithFolderStream(
      tester,
      controller.stream,
      folderIds: ['folder-a', 'folder-b'],
    );

    controller.add([folder('folder-a', 'Folder A'), folder('folder-b', 'Folder B', parentId: 'folder-a')]);
    await tester.pumpAndSettle();
    expect(router.stackData.length, 3);

    // folder-a transiently vanishes while A is buried...
    controller.add([folder('folder-b', 'Folder B')]);
    await tester.pumpAndSettle();
    expect(router.stackData.length, 3); // still buried, now pending

    // ...then reappears in a later sync batch, before A ever surfaces.
    controller.add([folder('folder-a', 'Folder A'), folder('folder-b', 'Folder B', parentId: 'folder-a')]);
    await tester.pumpAndSettle();
    expect(router.stackData.length, 3); // unchanged

    // The user backs out of B. A must now stay put — its folder is valid again, so the earlier
    // pending flag must have been cleared rather than firing a stale self-pop.
    await router.maybePop();
    await tester.pumpAndSettle();

    expect(router.stackData.length, 2); // harness + A — A stays visible
    final topArgs = router.stackData.last.args as SpaceAlbumsRouteArgs;
    expect(topArgs.folderId, 'folder-a');
    expect(find.byType(SpaceAlbumsPage), findsOneWidget);
  });

  // T-08 (tree module) already guarantees this at the unit level; this re-verifies at the PAGE
  // level that no redundant "folder exists" filter was layered on top of `folderContents` here —
  // exactly the trap called out for this task (see teeth check #2 in the task report).
  testWidgets('an album whose folder has not synced yet still appears at the root', (tester) async {
    await pumpPage(
      tester,
      folders: const [], // 'ghost-folder' has not synced — no row for it at all
      albums: [album('a1', 'Orphaned', folderId: 'ghost-folder')],
    );

    expect(find.byKey(const Key('space-album-card-a1')), findsOneWidget);
    expect(find.text('Orphaned'), findsOneWidget);
  });

  // ---------------------------------------------------------------------
  // Task 10 — navigation (U-02, U-03), observed via the route stack per the
  // repo's existing auto_route navigation-assertion pattern (see
  // test/presentation/widgets/filter_sheet/strips/strips_test.dart and
  // test/presentation/widgets/timeline/timeline_scroll_to_top_test.dart).
  // ---------------------------------------------------------------------

  /// Pushes [SpaceAlbumsPage] (root level) onto a real AutoRoute stack, harness home a plain
  /// placeholder (not a [SpaceAlbumsPage]) so the stack composition is unambiguous.
  Future<RootStackRouter> pumpRoutedPage(
    WidgetTester tester, {
    required List<SpaceAlbumFolder> folders,
    required List<SpaceAlbum> albums,
    bool canEdit = true,
  }) async {
    final router = RootStackRouter.build(
      routes: [
        AutoRoute(initial: true, page: PageInfo('SpaceAlbumsHarness', builder: (_) => const SizedBox.shrink())),
        AutoRoute(page: SpaceAlbumsRoute.page),
      ],
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
            spaceAlbumFoldersProvider(spaceId).overrideWith((_) => Stream.value(folders)),
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
    // NOT awaited — see the identical comment on `pumpPageWithFolderStream` above: `push`'s Future
    // only resolves once this route is popped, and neither U-02 nor U-03 ever pops THIS (root)
    // route (U-03 pops the child folder route pushed by tapping the card), so awaiting it here
    // would deadlock.
    unawaited(router.push(SpaceAlbumsRoute(spaceId: spaceId, canEdit: canEdit)));
    await tester.pumpAndSettle();
    return router;
  }

  testWidgets('U-02: tapping a folder card pushes the route one level deeper', (tester) async {
    final router = await pumpRoutedPage(tester, folders: [folder('trips', 'Trips')], albums: [album('a1', 'Rome')]);
    expect(router.stackData.length, 2); // harness home + the root SpaceAlbumsPage

    await tester.tap(find.byType(SpaceAlbumFolderCard));
    await tester.pumpAndSettle();

    expect(router.stackData.length, 3);
    final topArgs = router.stackData.last.args as SpaceAlbumsRouteArgs;
    expect(topArgs.folderId, 'trips');
  });

  testWidgets('U-03: system back from a folder returns to the parent level', (tester) async {
    final router = await pumpRoutedPage(tester, folders: [folder('trips', 'Trips')], albums: [album('a1', 'Rome')]);

    await tester.tap(find.byType(SpaceAlbumFolderCard));
    await tester.pumpAndSettle();
    expect((router.stackData.last.args as SpaceAlbumsRouteArgs).folderId, 'trips');

    await router.maybePop();
    await tester.pumpAndSettle();

    expect(router.stackData.length, 2);
    expect((router.stackData.last.args as SpaceAlbumsRouteArgs).folderId, isNull);
  });

  // ---------------------------------------------------------------------
  // Task 10 — "Move to folder…" wiring on the album card. The picker's
  // `picked` flag is the only thing that distinguishes a dismissal from
  // "picked the root" (both resolve folderId: null) — see teeth check #1
  // in the task report.
  // ---------------------------------------------------------------------

  testWidgets('dismissing the move-to-folder picker does not move the album', (tester) async {
    tester.view.devicePixelRatio = 3.0;
    tester.view.physicalSize = const Size(2400, 3600);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final repo = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: [
        spaceAlbumsProvider(spaceId).overrideWith((_) => Stream.value([album('a1', 'Rome')])),
        spaceAlbumFoldersProvider(spaceId).overrideWith((_) => Stream.value([folder('trips', 'Trips')])),
        sharedSpaceApiRepositoryProvider.overrideWithValue(repo),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await tester.tap(find.byKey(const Key('space-album-card-menu-a1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Move to folder…'));
    await tester.pumpAndSettle();

    // Tap the modal barrier (outside the sheet) to dismiss without picking.
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    verifyNever(() => repo.setAlbumFolder(any(), any(), any()));
  });

  testWidgets('picking a folder from the move sheet moves the album', (tester) async {
    tester.view.devicePixelRatio = 3.0;
    tester.view.physicalSize = const Size(2400, 3600);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final repo = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => repo.setAlbumFolder(any(), any(), any())).thenAnswer((_) async {});
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);

    await tester.pumpConsumerWidget(
      const SpaceAlbumsPage(spaceId: spaceId, canEdit: true),
      overrides: [
        spaceAlbumsProvider(spaceId).overrideWith((_) => Stream.value([album('a1', 'Rome')])),
        spaceAlbumFoldersProvider(spaceId).overrideWith((_) => Stream.value([folder('trips', 'Trips')])),
        sharedSpaceApiRepositoryProvider.overrideWithValue(repo),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await tester.tap(find.byKey(const Key('space-album-card-menu-a1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Move to folder…'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('folder-option-trips')));
    await tester.pumpAndSettle();

    verify(() => repo.setAlbumFolder(spaceId, 'a1', 'trips')).called(1);
    verify(() => syncMgr.syncRemote()).called(1);
  });

  // ---------------------------------------------------------------------
  // Task 10 round 2 — folder CRUD: app-bar "New folder" and the folder
  // card's ⋮ Rename / Move to folder… / Delete. Task 9's card already
  // declares onRename/onMove/onDelete; this is where the page actually
  // wires them (they were previously left null — a fully-enabled, fully
  // dead ⋮ menu). Every `spaceAlbumActionsProvider` override here is a
  // mock of the whole facade (see `MockSpaceAlbumActions` above), so each
  // test pins the EXACT arguments the action was called with.
  // ---------------------------------------------------------------------

  testWidgets('New folder at the root creates it with parentId null', (tester) async {
    final actions = MockSpaceAlbumActions();
    when(() => actions.createFolder(any(), any(), parentId: any(named: 'parentId'))).thenAnswer((_) async {});

    await pumpPage(
      tester,
      folders: const [],
      albums: const [],
      overrides: [spaceAlbumActionsProvider.overrideWithValue(actions)],
    );

    await tester.tap(find.byKey(const Key('space-albums-new-folder-action')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('space-album-folder-name-field')), 'Trips');
    await tester.tap(find.byKey(const Key('space-album-folder-name-confirm')));
    await tester.pumpAndSettle();

    verify(() => actions.createFolder(spaceId, 'Trips', parentId: null)).called(1);
  });

  testWidgets('New folder while browsing inside a folder creates it as a child, not at the root', (tester) async {
    final actions = MockSpaceAlbumActions();
    when(() => actions.createFolder(any(), any(), parentId: any(named: 'parentId'))).thenAnswer((_) async {});

    await pumpPage(
      tester,
      folders: [folder('trips', 'Trips')],
      albums: const [],
      folderId: 'trips',
      overrides: [spaceAlbumActionsProvider.overrideWithValue(actions)],
    );

    await tester.tap(find.byKey(const Key('space-albums-new-folder-action')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('space-album-folder-name-field')), 'Rome');
    await tester.tap(find.byKey(const Key('space-album-folder-name-confirm')));
    await tester.pumpAndSettle();

    verify(() => actions.createFolder(spaceId, 'Rome', parentId: 'trips')).called(1);
  });

  testWidgets('renaming a folder pre-fills the current name and calls renameFolder', (tester) async {
    final actions = MockSpaceAlbumActions();
    when(() => actions.renameFolder(any(), any(), any())).thenAnswer((_) async {});

    await pumpPage(
      tester,
      folders: [folder('trips', 'Trips')],
      albums: [album('a1', 'Rome')],
      overrides: [spaceAlbumActionsProvider.overrideWithValue(actions)],
    );

    await tester.tap(_folderMenuFinder('trips'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-folder-card-rename')));
    await tester.pumpAndSettle();

    final field = tester.widget<TextFormField>(find.byKey(const Key('space-album-folder-name-field')));
    expect(field.controller!.text, 'Trips');

    await tester.enterText(find.byKey(const Key('space-album-folder-name-field')), 'Vacations');
    await tester.tap(find.byKey(const Key('space-album-folder-name-confirm')));
    await tester.pumpAndSettle();

    verify(() => actions.renameFolder(spaceId, 'trips', 'Vacations')).called(1);
  });

  testWidgets('moving a folder excludes its own subtree from the picker and calls moveFolder', (tester) async {
    final actions = MockSpaceAlbumActions();
    when(() => actions.moveFolder(any(), any(), any())).thenAnswer((_) async {});

    await pumpPage(
      tester,
      folders: [
        folder('trips', 'Trips'),
        folder('nested', 'Nested', parentId: 'trips'),
        folder('other', 'Other'),
      ],
      albums: const [],
      overrides: [spaceAlbumActionsProvider.overrideWithValue(actions)],
    );

    await tester.tap(_folderMenuFinder('trips'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-folder-card-move')));
    await tester.pumpAndSettle();

    // The picker renders every folder (disabled rows aren't hidden, just unselectable) — the
    // moved folder itself and its descendant must be disabled; an unrelated sibling must not.
    expect(tester.widget<ListTile>(find.byKey(const Key('folder-option-trips'))).enabled, isFalse);
    expect(tester.widget<ListTile>(find.byKey(const Key('folder-option-nested'))).enabled, isFalse);
    expect(tester.widget<ListTile>(find.byKey(const Key('folder-option-other'))).enabled, isTrue);

    await tester.tap(find.byKey(const Key('folder-option-other')));
    await tester.pumpAndSettle();

    verify(() => actions.moveFolder(spaceId, 'trips', 'other')).called(1);
  });

  testWidgets('dismissing the folder move picker does not move the folder', (tester) async {
    final actions = MockSpaceAlbumActions();

    await pumpPage(
      tester,
      folders: [folder('trips', 'Trips'), folder('other', 'Other')],
      albums: const [],
      overrides: [spaceAlbumActionsProvider.overrideWithValue(actions)],
    );

    await tester.tap(_folderMenuFinder('trips'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-folder-card-move')));
    await tester.pumpAndSettle();

    // Tap the modal barrier (outside the sheet) to dismiss without picking.
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    verifyNever(() => actions.moveFolder(any(), any(), any()));
  });

  testWidgets('confirming folder deletion calls deleteFolder', (tester) async {
    final actions = MockSpaceAlbumActions();
    when(() => actions.deleteFolder(any(), any())).thenAnswer((_) async {});

    await pumpPage(
      tester,
      folders: [folder('trips', 'Trips')],
      albums: const [],
      overrides: [spaceAlbumActionsProvider.overrideWithValue(actions)],
    );

    await tester.tap(_folderMenuFinder('trips'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-folder-card-delete')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('space-album-folder-delete-confirm')));
    await tester.pumpAndSettle();

    verify(() => actions.deleteFolder(spaceId, 'trips')).called(1);
  });

  testWidgets('cancelling the folder deletion confirmation does not call deleteFolder', (tester) async {
    final actions = MockSpaceAlbumActions();

    await pumpPage(
      tester,
      folders: [folder('trips', 'Trips')],
      albums: const [],
      overrides: [spaceAlbumActionsProvider.overrideWithValue(actions)],
    );

    await tester.tap(_folderMenuFinder('trips'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-folder-card-delete')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('space-album-folder-delete-cancel')));
    await tester.pumpAndSettle();

    verifyNever(() => actions.deleteFolder(any(), any()));
  });

  // ---------------------------------------------------------------------
  // M-5 — folder-mutation failures map to the specific space_album_folder_name_taken /
  // depth_exceeded / limit_reached keys when the server's error identifies one of those known
  // failure classes, instead of always showing the action's generic error toast.
  // ---------------------------------------------------------------------

  String apiErrorBody(String message) => jsonEncode({'statusCode': 400, 'message': message, 'error': 'Bad Request'});

  testWidgets('M-5: a duplicate-name failure on New folder shows the specific error, not the generic one', (
    tester,
  ) async {
    final actions = MockSpaceAlbumActions();
    when(
      () => actions.createFolder(any(), any(), parentId: any(named: 'parentId')),
    ).thenThrow(ApiException(400, apiErrorBody('A folder with that name already exists here')));

    await pumpPage(
      tester,
      folders: const [],
      albums: const [],
      overrides: [spaceAlbumActionsProvider.overrideWithValue(actions)],
    );

    await tester.tap(find.byKey(const Key('space-albums-new-folder-action')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('space-album-folder-name-field')), 'Trips');
    await tester.tap(find.byKey(const Key('space-album-folder-name-confirm')));
    await tester.pumpAndSettle();

    expect(find.text('A folder with that name already exists here'), findsOneWidget);
    expect(find.text('Unable to create folder'), findsNothing);

    await settleToast(tester);
  });

  testWidgets('M-5: a depth-exceeded failure on Move folder shows the specific error, not the generic one', (
    tester,
  ) async {
    final actions = MockSpaceAlbumActions();
    when(
      () => actions.moveFolder(any(), any(), any()),
    ).thenThrow(ApiException(400, apiErrorBody('Folder nesting is limited to 10 levels (this would be 11)')));

    await pumpPage(
      tester,
      folders: [folder('trips', 'Trips'), folder('other', 'Other')],
      albums: const [],
      overrides: [spaceAlbumActionsProvider.overrideWithValue(actions)],
    );

    await tester.tap(_folderMenuFinder('trips'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-folder-card-move')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('folder-option-other')));
    await tester.pumpAndSettle();

    expect(find.text('Folders can only be nested 10 levels deep'), findsOneWidget);

    await settleToast(tester);
  });

  testWidgets('M-5: an unrecognized failure still falls back to the generic per-action error', (tester) async {
    final actions = MockSpaceAlbumActions();
    when(
      () => actions.renameFolder(any(), any(), any()),
    ).thenThrow(ApiException(500, apiErrorBody('Internal server error')));

    await pumpPage(
      tester,
      folders: [folder('trips', 'Trips')],
      albums: const [],
      overrides: [spaceAlbumActionsProvider.overrideWithValue(actions)],
    );

    await tester.tap(_folderMenuFinder('trips'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-folder-card-rename')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-folder-name-confirm')));
    await tester.pumpAndSettle();

    expect(find.text('Unable to rename folder'), findsOneWidget);

    await settleToast(tester);
  });

  // ---------------------------------------------------------------------
  // "New album" (createAlbum) — creates the album, then links it into the
  // CURRENT folder (mirrors web's handleCreateAlbum). Creation and the
  // subsequent link are two DIFFERENT failure domains: a link failure after
  // a successful creation must never claim creation itself failed — the
  // album already exists (unlinked, invisible in the space), and a
  // "creation failed" toast would tempt a retry that creates a duplicate.
  // ---------------------------------------------------------------------

  testWidgets('New album: creation failing shows the create-error toast', (tester) async {
    final actions = MockSpaceAlbumActions();

    await pumpPage(
      tester,
      folders: const [],
      albums: const [],
      overrides: [
        spaceAlbumActionsProvider.overrideWithValue(actions),
        remoteAlbumProvider.overrideWith(() => _StubRemoteAlbumNotifier((_) async => throw Exception('boom'))),
      ],
    );

    await tester.tap(find.byKey(const Key('space-albums-new-album-action')));
    await tester.pumpAndSettle();

    // M-8: "New album" reused the FOLDER prompt wholesale, so the dialog asked for a "Folder
    // name". It now carries the album label and its own `space-album-name-*` keys, matching the
    // rename dialog.
    expect(find.text('Album name'), findsOneWidget);
    expect(find.text('Folder name'), findsNothing);

    await tester.enterText(find.byKey(const Key('space-album-name-field')), 'Trips');
    await tester.tap(find.byKey(const Key('space-album-name-confirm')));
    await tester.pumpAndSettle();

    expect(find.text('Unable to create album'), findsOneWidget);
    verifyNever(() => actions.link(any(), any(), folderId: any(named: 'folderId')));

    await settleToast(tester);
  });

  testWidgets(
    'New album: creation succeeds but the space-link fails shows a link-specific toast, not the create-error one',
    (tester) async {
      final actions = MockSpaceAlbumActions();
      when(() => actions.link(any(), any(), folderId: any(named: 'folderId'))).thenThrow(Exception('link failed'));

      var createCallCount = 0;
      await pumpPage(
        tester,
        folders: const [],
        albums: const [],
        overrides: [
          spaceAlbumActionsProvider.overrideWithValue(actions),
          remoteAlbumProvider.overrideWith(
            () => _StubRemoteAlbumNotifier((_) async {
              createCallCount++;
              return _newAlbumFixture('new-album-1');
            }),
          ),
        ],
      );

      await tester.tap(find.byKey(const Key('space-albums-new-album-action')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('space-album-name-field')), 'Trips');
      await tester.tap(find.byKey(const Key('space-album-name-confirm')));
      await tester.pumpAndSettle();

      expect(find.text('Album created, but could not be linked to this space'), findsOneWidget);
      expect(find.text('Unable to create album'), findsNothing);
      verify(() => actions.link(spaceId, ['new-album-1'], folderId: null)).called(1);
      // A link failure must never trigger a create retry, which would silently leave a
      // duplicate album behind — exactly one create call for one dialog confirmation.
      expect(createCallCount, 1);

      await settleToast(tester);
    },
  );

  // ---------------------------------------------------------------------
  // Task 14 — multi-select gestures, selection bar, and the selection
  // PopScope (S-14, S-15, S-3 on mobile, S-10 on mobile, S-16, S-16a/E-21).
  // ---------------------------------------------------------------------

  /// Pushes [SpaceAlbumsPage] onto a real AutoRoute stack (harness home a plain placeholder,
  /// matching [pumpRoutedPage] above) with a THIRD route registered under
  /// [SpaceAlbumDetailRoute]'s own name — a stub page that records the tapped album id into
  /// [openedAlbumIds] instead of building the real (heavyweight, DB-backed)
  /// `SpaceAlbumDetailPage`. A real router is required (not the router-less [pumpPage]) because
  /// proving "tap with no selection opens the album" (S-3) means proving `context.pushRoute`
  /// actually fires — which throws with no `AutoRouter` ancestor at all.
  ///
  /// Uses the same taller-than-default viewport as [pumpPage] above (folder + album cards
  /// together need more room than the default 800x600 test surface — see that helper's own
  /// comment) so I-4's folder-plus-album fixture actually builds both cards, rather than one of
  /// them silently going unbuilt outside the sliver's cache extent and any assertion about it
  /// passing vacuously.
  Future<RootStackRouter> pumpSpaceAlbumsPage(
    WidgetTester tester, {
    required List<SpaceAlbum> albums,
    List<SpaceAlbumFolder> folders = const [],
    String? folderId,
    bool canManage = true,
    required List<String> openedAlbumIds,
  }) async {
    tester.view.devicePixelRatio = 3.0;
    tester.view.physicalSize = const Size(2400, 3600);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final router = RootStackRouter.build(
      routes: [
        AutoRoute(initial: true, page: PageInfo('SpaceAlbumsHarness', builder: (_) => const SizedBox.shrink())),
        AutoRoute(page: SpaceAlbumsRoute.page),
        AutoRoute(
          page: PageInfo(
            SpaceAlbumDetailRoute.name,
            builder: (data) {
              final args = data.argsAs<SpaceAlbumDetailRouteArgs>();
              openedAlbumIds.add(args.albumId);
              return const SizedBox.shrink();
            },
          ),
        ),
      ],
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
            spaceAlbumFoldersProvider(spaceId).overrideWith((_) => Stream.value(folders)),
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
    // NOT awaited — see the identical comment on `pumpRoutedPage` above: `push`'s Future only
    // resolves once this route is popped.
    unawaited(router.push(SpaceAlbumsRoute(spaceId: spaceId, canEdit: canManage, folderId: folderId)));
    await tester.pumpAndSettle();
    return router;
  }

  // I-1 (fix round 1) — the reviewer's probes proved a selection made in one space survives
  // into another: `router.replaceAll` (401 -> LoginRoute, Android VIEW-intent handling, the
  // splash-screen login redirect) tears the OLD route down without a `didPop`, and because
  // `SpaceAlbumsRoute` is self-recursive, `AutoRoutePage.canUpdate` matching on route NAME alone
  // means a same-shaped `replaceAll` can update THIS widget's existing Element in place with a
  // new `spaceId` rather than disposing/recreating it — so this widget's own hook state
  // (including the new clearing effect) persists across what looks like landing on an entirely
  // different page. Reproduced directly here via plain Flutter element-reuse semantics (no
  // router needed): pumping the SAME `SpaceAlbumsPage` type, unkeyed, at the same tree position
  // TWICE with a different `spaceId` updates the existing Element rather than recreating it —
  // exactly the premise the production `replaceAll` case relies on.
  testWidgets('I-1: switching to a different space clears an active selection', (tester) async {
    const spaceB = 'space-2';
    final overrides = [
      spaceAlbumsProvider(spaceId).overrideWith((_) => Stream.value([_album(id: 'a1', name: 'Album A')])),
      spaceAlbumFoldersProvider(spaceId).overrideWith((_) => Stream.value(const <SpaceAlbumFolder>[])),
      spaceAlbumsProvider(spaceB).overrideWith((_) => Stream.value([_album(id: 'b1', name: 'Album B')])),
      spaceAlbumFoldersProvider(spaceB).overrideWith((_) => Stream.value(const <SpaceAlbumFolder>[])),
    ];

    await tester.pumpConsumerWidget(const SpaceAlbumsPage(spaceId: spaceId, canEdit: true), overrides: overrides);

    await tester.longPress(find.byKey(const Key('space-album-card-a1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('space-album-selection-bar')), findsOneWidget); // positive control

    await tester.pumpConsumerWidget(const SpaceAlbumsPage(spaceId: spaceB, canEdit: true), overrides: overrides);

    expect(find.byKey(const Key('space-album-selection-bar')), findsNothing);
    expect(find.byKey(const Key('space-album-card-b1')), findsOneWidget); // proves space B actually rendered
  });

  // I-2 (fix round 1) — the reviewer's probe: long-press "Hawaii", type "Sunsets" -> the bar kept
  // reading "1 selected" with the selected card gone from the tree, because the AppBar is
  // replaced while selecting but the body's `_SearchAndSortBar` is not, so the search field
  // stays live and reachable the whole time.
  testWidgets('I-2: changing the search query clears an active selection', (tester) async {
    final openedAlbumIds = <String>[];
    await pumpSpaceAlbumsPage(
      tester,
      albums: [album('a', 'Album A'), album('b', 'Album B')],
      openedAlbumIds: openedAlbumIds,
    );

    await tester.longPress(find.byKey(const Key('space-album-card-a')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('space-album-selection-bar')), findsOneWidget); // positive control

    await tester.enterText(find.byKey(const Key('space-albums-search-field')), 'b');
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('space-album-selection-bar')), findsNothing);
  });

  testWidgets('S-14: long-press enters selection mode with that album selected', (tester) async {
    final openedAlbumIds = <String>[];
    await pumpSpaceAlbumsPage(
      tester,
      albums: [album('a', 'Album A'), album('b', 'Album B')],
      openedAlbumIds: openedAlbumIds,
    );

    await tester.longPress(find.byKey(const Key('space-album-card-a')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('space-album-selection-bar')), findsOneWidget);
    expect(find.text('1 selected'), findsOneWidget);
    expect(openedAlbumIds, isEmpty); // long-press must not also open the album
  });

  testWidgets('S-15: tap toggles a second album once selection mode is active', (tester) async {
    final openedAlbumIds = <String>[];
    await pumpSpaceAlbumsPage(
      tester,
      albums: [album('a', 'Album A'), album('b', 'Album B')],
      openedAlbumIds: openedAlbumIds,
    );

    await tester.longPress(find.byKey(const Key('space-album-card-a')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-card-b')));
    await tester.pumpAndSettle();

    expect(find.text('2 selected'), findsOneWidget);
    expect(openedAlbumIds, isEmpty); // tap must not navigate while selecting
  });

  testWidgets('S-3 on mobile: tap with no selection opens the album', (tester) async {
    final openedAlbumIds = <String>[];
    await pumpSpaceAlbumsPage(tester, albums: [album('a', 'Album A')], openedAlbumIds: openedAlbumIds);

    await tester.tap(find.byKey(const Key('space-album-card-a')));
    await tester.pumpAndSettle();

    expect(openedAlbumIds, ['a']);
    expect(find.byKey(const Key('space-album-selection-bar')), findsNothing);
  });

  // I-3 (fix round 1) — the original assertion only proved the BAR was absent, but
  // `showSelectionBar = canEdit && !selection.isEmpty` hides the bar independently of the
  // gesture gate: removing `canEdit` from `onAlbumLongPress` entirely still passes this test,
  // since a viewer page would still compute `showSelectionBar: false` even with a live selection
  // sitting in the (global) provider. Also asserting the card's own selected badge is absent
  // binds this test to the GESTURE gate itself — `isSelected` doesn't consult `canEdit` at all,
  // so if `onAlbumLongPress` ever wrote into the provider despite `canManage: false`, the badge
  // would render here regardless of the bar's own visibility.
  testWidgets('S-10 on mobile: long-press does nothing when canManage is false', (tester) async {
    final openedAlbumIds = <String>[];
    await pumpSpaceAlbumsPage(
      tester,
      albums: [album('a', 'Album A')],
      canManage: false,
      openedAlbumIds: openedAlbumIds,
    );

    await tester.longPress(find.byKey(const Key('space-album-card-a')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('space-album-selection-bar')), findsNothing);
    expect(find.byKey(const Key('space-album-card-selected-a')), findsNothing);
  });

  // I-4 (fix round 1) — folder selection had zero coverage: no test long-pressed a folder card.
  // This single test closes four survivors the reviewer's mutation pass found: folder
  // long-press registering kind `album` instead of `folder` (fails the folder-badge assertion
  // AND flips the bar to album actions), a badge rendering on every card regardless of kind
  // (fails the album-badge-absent assertion), the bar rendering album actions for a folder-kind
  // selection (fails the Unlink/toggle-timeline-absent assertions), AND dropping the
  // never-mixed-kind guard from `isSelected` (`selection.kind == kind && ids.contains(id)`
  // collapsing to a bare `ids.contains(id)`).
  //
  // The folder and album fixtures DELIBERATELY share the id 'x': with distinct ids, the
  // kind-guard-drop mutation is invisible — a folder-only selection's `ids` would never contain
  // a different album's id regardless of whether the kind is checked, so nothing would diverge.
  // A shared id is what forces the two kinds' badges to actually disagree once the guard is gone.
  testWidgets('I-4: long-press a folder card selects the folder with folder-only bar actions', (tester) async {
    final openedAlbumIds = <String>[];
    await pumpSpaceAlbumsPage(
      tester,
      folders: [folder('x', 'Trips')],
      albums: [album('x', 'Album X')],
      openedAlbumIds: openedAlbumIds,
    );

    await tester.longPress(find.byKey(const Key('space-album-folder-card-x')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('space-album-selection-bar')), findsOneWidget);
    expect(find.text('1 selected'), findsOneWidget);
    // The folder itself shows selected...
    expect(find.byKey(const Key('space-album-folder-card-selected-x')), findsOneWidget);
    // ...but the (present, rendered) album card sharing the same raw id does NOT.
    expect(find.byKey(const Key('space-album-card-x')), findsOneWidget); // positive control
    expect(find.byKey(const Key('space-album-card-selected-x')), findsNothing);
    // Folder-kind actions only: Move + Delete, never Unlink/toggle-timeline.
    expect(find.byKey(const Key('space-album-selection-move')), findsOneWidget);
    expect(find.byKey(const Key('space-album-selection-delete')), findsOneWidget);
    expect(find.byKey(const Key('space-album-selection-unlink')), findsNothing);
    expect(find.byKey(const Key('space-album-selection-toggle-timeline')), findsNothing);
    expect(openedAlbumIds, isEmpty);
  });

  testWidgets('S-16: back exits selection before popping', (tester) async {
    final openedAlbumIds = <String>[];
    final router = await pumpSpaceAlbumsPage(tester, albums: [album('a', 'Album A')], openedAlbumIds: openedAlbumIds);

    await tester.longPress(find.byKey(const Key('space-album-card-a')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('space-album-selection-bar')), findsOneWidget);

    // First back: exits selection, page stays displayed.
    await router.maybePop();
    await tester.pumpAndSettle();
    expect(find.byType(SpaceAlbumsPage), findsOneWidget);
    expect(find.byKey(const Key('space-album-selection-bar')), findsNothing);

    // Second back: no selection left to intercept — the page pops normally.
    await router.maybePop();
    await tester.pumpAndSettle();
    expect(find.byType(SpaceAlbumsPage), findsNothing);
  });

  // S-16a / E-21 — the interaction guard: the selection PopScope must not veto the pre-existing
  // folder-vanished self-pop (U-11 stacked, above). Reuses that harness
  // (`pumpStackedFolderPagesWithFolderStream`) exactly, plus a selection entered on the page
  // that will end up buried WHILE it is still topmost — a buried page's widgets are not
  // independently interactable in this harness (see the comment on the sibling U-11 stacked
  // tests above) — then buries it under a second push before driving the vanish.
  testWidgets('S-16a/E-21: the selection PopScope does not veto the folder-vanished self-pop', (tester) async {
    final controller = StreamController<List<SpaceAlbumFolder>>();
    addTearDown(controller.close);
    final router = await pumpStackedFolderPagesWithFolderStream(
      tester,
      controller.stream,
      folderIds: ['folder-a'],
      albums: [album('a1', 'Rome', folderId: 'folder-a')],
    );

    controller.add([folder('folder-a', 'Folder A')]);
    await tester.pumpAndSettle();
    expect(router.stackData.length, 2); // harness + A

    // Select an album on A while it is still topmost and interactable.
    await tester.longPress(find.byKey(const Key('space-album-card-a1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('space-album-selection-bar')), findsOneWidget);

    // Bury A under B — the selection stays live (A is covered, not disposed).
    unawaited(router.push(SpaceAlbumsRoute(spaceId: spaceId, canEdit: true, folderId: 'folder-b')));
    await tester.pumpAndSettle();
    expect(router.stackData.length, 3); // harness + A + B

    // folder-a (A's own folder) vanishes while A is buried, selection still active on A.
    controller.add([folder('folder-b', 'Folder B')]);
    await tester.pumpAndSettle();
    expect(router.stackData.length, 3); // nothing popped yet — A is buried, now pending

    // The user backs out of B. A becomes topmost and must self-pop despite the earlier
    // selection — proving the selection was cleared before `maybePop` ran, not vetoed by it.
    await router.maybePop();
    await tester.pumpAndSettle();

    expect(router.stackData.length, 1); // harness root only — A left the stack
    expect(find.byType(SpaceAlbumsPage), findsNothing);
  });

  // ---------------------------------------------------------------------
  // Task 15 — mobile bulk actions (S-17..S-20, S-24..S-26), wired against
  // the Task 14 selection bar's previously-disabled action icons.
  //
  // Every test here overrides `sharedSpaceApiRepositoryProvider` +
  // `backgroundSyncProvider` + `driftAlbumApiRepositoryProvider` and pumps
  // through the REAL `spaceAlbumActionsProvider` (never mocked), matching
  // the Task 10 "move to folder" tests above (`repo.setAlbumFolder(...)`):
  // this lets each test assert the exact bulk-endpoint call the real
  // `SpaceAlbumActions.bulkX` methods make, one layer below the mock.
  // ---------------------------------------------------------------------

  /// Builds a multi-select via long-press + tap — the same gesture sequence S-14/S-15 already
  /// prove: long-press the first id to enter selection mode, then tap each remaining id to add
  /// it. Assumes every id in [ids] is a currently-rendered ALBUM card.
  Future<void> selectAlbums(WidgetTester tester, List<String> ids) async {
    await tester.longPress(find.byKey(Key('space-album-card-${ids.first}')));
    await tester.pumpAndSettle();
    for (final id in ids.skip(1)) {
      await tester.tap(find.byKey(Key('space-album-card-$id')));
      await tester.pumpAndSettle();
    }
  }

  /// Folder-kind counterpart of [selectAlbums] — same gesture on a folder card (see I-4 above).
  Future<void> selectFolders(WidgetTester tester, List<String> ids) async {
    await tester.longPress(find.byKey(Key('space-album-folder-card-${ids.first}')));
    await tester.pumpAndSettle();
    for (final id in ids.skip(1)) {
      await tester.tap(find.byKey(Key('space-album-folder-card-$id')));
      await tester.pumpAndSettle();
    }
  }

  /// An all-success bulk response for exactly [ids].
  List<BulkIdResponseDto> allSucceed(Iterable<String> ids) => [
    for (final id in ids) BulkIdResponseDto(id: id, success: true),
  ];

  /// An all-failed bulk response for exactly [ids] — the specific reason never matters to the
  /// page (item 2 of the task-15 brief: never branch on `not_found` alone), so every test that
  /// needs a failure uses the same `noPermission` stand-in.
  List<BulkIdResponseDto> allFail(Iterable<String> ids) => [
    for (final id in ids)
      BulkIdResponseDto(id: id, success: false, error: const Optional.present(BulkIdErrorReason.noPermission)),
  ];

  testWidgets(
    'S-17: confirming bulk unlink calls the bulk endpoint once for the whole batch and clears the selection',
    (tester) async {
      final api = MockSharedSpaceApiRepository();
      final syncMgr = MockBackgroundSyncManager();
      when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
      when(() => api.bulkUnlinkAlbums(any(), any())).thenAnswer((_) async => allSucceed({'a', 'b'}));

      await pumpPage(
        tester,
        folders: const [],
        albums: [album('a', 'Album A'), album('b', 'Album B')],
        overrides: [
          sharedSpaceApiRepositoryProvider.overrideWithValue(api),
          backgroundSyncProvider.overrideWithValue(syncMgr),
          driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
        ],
      );

      await selectAlbums(tester, ['a', 'b']);
      expect(find.text('2 selected'), findsOneWidget); // positive control

      await tester.tap(find.byKey(const Key('space-album-selection-unlink')));
      await tester.pumpAndSettle();
      // One confirm dialog for the whole batch, naming the count.
      expect(find.text('Unlink 2 albums?'), findsOneWidget);
      verifyNever(() => api.bulkUnlinkAlbums(any(), any())); // not fired before confirming

      await tester.tap(find.byKey(const Key('space-album-bulk-unlink-confirm')));
      await tester.pumpAndSettle();

      verify(() => api.bulkUnlinkAlbums(spaceId, {'a', 'b'})).called(1);
      verify(() => syncMgr.syncRemote()).called(1);
      expect(find.byKey(const Key('space-album-selection-bar')), findsNothing); // total success clears (S-26)
    },
  );

  // Fix round 1 (I-2/R9) — every OTHER bulk test in this file selects 100% of its own fixture, so
  // none of them can distinguish "the payload is the selection" from "the payload is every
  // rendered/known album id". Three albums render here; only two are SELECTED (positive control:
  // "2 selected", not "3 selected", proving 'c' really is excluded from the selection) — a
  // mutation that sources the bulk payload from the rendered list instead of `selection.ids`
  // would ship 'c' too and fail the `verify` below even though every visible assertion up to that
  // point still passes.
  testWidgets('bulk unlink sends only the selected ids, not every rendered album', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(() => api.bulkUnlinkAlbums(any(), any())).thenAnswer((_) async => allSucceed({'a', 'b'}));

    await pumpPage(
      tester,
      folders: const [],
      albums: [album('a', 'Album A'), album('b', 'Album B'), album('c', 'Album C')],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectAlbums(tester, ['a', 'b']);
    expect(find.text('2 selected'), findsOneWidget); // positive control — 'c' is rendered, not selected

    await tester.tap(find.byKey(const Key('space-album-selection-unlink')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-bulk-unlink-confirm')));
    await tester.pumpAndSettle();

    verify(() => api.bulkUnlinkAlbums(spaceId, {'a', 'b'})).called(1);
  });

  testWidgets('cancelling the bulk-unlink confirm dialog fires no request and keeps the selection', (tester) async {
    final api = MockSharedSpaceApiRepository();
    await pumpPage(
      tester,
      folders: const [],
      albums: [album('a', 'Album A'), album('b', 'Album B')],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(MockBackgroundSyncManager()),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectAlbums(tester, ['a', 'b']);
    await tester.tap(find.byKey(const Key('space-album-selection-unlink')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-bulk-unlink-cancel')));
    await tester.pumpAndSettle();

    verifyNever(() => api.bulkUnlinkAlbums(any(), any()));
    expect(find.text('2 selected'), findsOneWidget);
  });

  testWidgets('S-24: a partial failure keeps exactly the failed albums selected and shows the toast', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(() => api.bulkUnlinkAlbums(any(), any())).thenAnswer(
      (_) async => [
        BulkIdResponseDto(id: 'a', success: true),
        BulkIdResponseDto(id: 'b', success: false, error: const Optional.present(BulkIdErrorReason.noPermission)),
      ],
    );

    await pumpPage(
      tester,
      folders: const [],
      albums: [album('a', 'Album A'), album('b', 'Album B')],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectAlbums(tester, ['a', 'b']);
    expect(find.text('2 selected'), findsOneWidget); // positive control

    await tester.tap(find.byKey(const Key('space-album-selection-unlink')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-bulk-unlink-confirm')));
    await tester.pumpAndSettle();

    expect(find.text('1 selected'), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-selected-b')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-selected-a')), findsNothing);
    expect(find.text('1 item could not be updated'), findsOneWidget);

    await settleToast(tester);
  });

  // Fix round 1 (I-3) — `_bulkFailures` is correct (it reads only `success`), but nothing pinned
  // that on the CLIENT side: the server-side albums/folders `not_found` vs `validation` asymmetry
  // is deliberately pinned by e2e (`shared-space-album-folder.e2e-spec.ts`), with an explicit
  // comment that the UI must not branch on it — this is that guard's mobile-side pin. Mixes BOTH
  // failure reasons in one response; a mutation that folds either reason into "succeeded" changes
  // which card stays selected and this fails.
  testWidgets('a mix of not_found and validation failures both stay selected', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(() => api.bulkUnlinkAlbums(any(), any())).thenAnswer(
      (_) async => [
        BulkIdResponseDto(id: 'a', success: true),
        BulkIdResponseDto(id: 'b', success: false, error: const Optional.present(BulkIdErrorReason.notFound)),
        BulkIdResponseDto(id: 'c', success: false, error: const Optional.present(BulkIdErrorReason.validation)),
      ],
    );

    await pumpPage(
      tester,
      folders: const [],
      albums: [album('a', 'Album A'), album('b', 'Album B'), album('c', 'Album C')],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectAlbums(tester, ['a', 'b', 'c']);
    await tester.tap(find.byKey(const Key('space-album-selection-unlink')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-bulk-unlink-confirm')));
    await tester.pumpAndSettle();

    expect(find.text('2 selected'), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-selected-b')), findsOneWidget); // not_found
    expect(find.byKey(const Key('space-album-card-selected-c')), findsOneWidget); // validation
    expect(find.byKey(const Key('space-album-card-selected-a')), findsNothing);

    await settleToast(tester);
  });

  testWidgets('a total failure keeps every selected album selected', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(() => api.bulkUnlinkAlbums(any(), any())).thenAnswer((_) async => allFail({'a', 'b'}));

    await pumpPage(
      tester,
      folders: const [],
      albums: [album('a', 'Album A'), album('b', 'Album B')],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectAlbums(tester, ['a', 'b']);
    await tester.tap(find.byKey(const Key('space-album-selection-unlink')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-bulk-unlink-confirm')));
    await tester.pumpAndSettle();

    expect(find.text('2 selected'), findsOneWidget);
    // A total failure still shows the failure toast (both ids failed) — settle it so its
    // fluttertoast Timer doesn't leak into teardown (see `settleToast`'s own doc above).
    expect(find.text('2 items could not be updated'), findsOneWidget);
    await settleToast(tester);
  });

  testWidgets('a thrown bulk request keeps every selected album selected', (tester) async {
    final api = MockSharedSpaceApiRepository();
    when(() => api.bulkUnlinkAlbums(any(), any())).thenThrow(Exception('network error'));

    await pumpPage(
      tester,
      folders: const [],
      albums: [album('a', 'Album A'), album('b', 'Album B')],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(MockBackgroundSyncManager()),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectAlbums(tester, ['a', 'b']);
    await tester.tap(find.byKey(const Key('space-album-selection-unlink')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-bulk-unlink-confirm')));
    await tester.pumpAndSettle();

    expect(find.text('2 selected'), findsOneWidget);
    // A thrown request is folded into "every id failed" too (see `SpaceAlbumActions.bulkUnlink`'s
    // own catch) — same toast, same need to settle it before teardown.
    expect(find.text('2 items could not be updated'), findsOneWidget);
    await settleToast(tester);
  });

  testWidgets('S-18/S-19: the timeline action resolves toward include for a mixed selection', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(
      () => api.bulkSetAlbumTimeline(any(), any(), showInTimeline: any(named: 'showInTimeline')),
    ).thenAnswer((_) async => allSucceed({'a', 'b'}));

    await pumpPage(
      tester,
      folders: const [],
      albums: [album('a', 'Album A', showInTimeline: true), album('b', 'Album B', showInTimeline: false)],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectAlbums(tester, ['a', 'b']);
    expect(find.byTooltip('Add to timeline'), findsOneWidget);

    await tester.tap(find.byKey(const Key('space-album-selection-toggle-timeline')));
    await tester.pumpAndSettle();

    verify(() => api.bulkSetAlbumTimeline(spaceId, {'a', 'b'}, showInTimeline: true)).called(1);
  });

  testWidgets('the timeline action offers removal and sends false when every album is already included', (
    tester,
  ) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(
      () => api.bulkSetAlbumTimeline(any(), any(), showInTimeline: any(named: 'showInTimeline')),
    ).thenAnswer((_) async => allSucceed({'a', 'b'}));

    await pumpPage(
      tester,
      folders: const [],
      albums: [album('a', 'Album A', showInTimeline: true), album('b', 'Album B', showInTimeline: true)],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectAlbums(tester, ['a', 'b']);
    expect(find.byTooltip('Remove from timeline'), findsOneWidget);

    await tester.tap(find.byKey(const Key('space-album-selection-toggle-timeline')));
    await tester.pumpAndSettle();

    verify(() => api.bulkSetAlbumTimeline(spaceId, {'a', 'b'}, showInTimeline: false)).called(1);
  });

  // Fix round 1 (I-1) — the reviewer's mutation R11 regressed `bulkToggleTimeline`'s own
  // `reconcile(failedIds)` (space_albums.page.dart:580) to `clear()` and the whole suite stayed
  // green, because only `bulkUnlink` had a partial-failure test. This pins the SAME contract for
  // the timeline action.
  testWidgets('a partial failure on the bulk timeline toggle keeps exactly the failed albums selected', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(() => api.bulkSetAlbumTimeline(any(), any(), showInTimeline: any(named: 'showInTimeline'))).thenAnswer(
      (_) async => [
        BulkIdResponseDto(id: 'a', success: true),
        BulkIdResponseDto(id: 'b', success: false, error: const Optional.present(BulkIdErrorReason.noPermission)),
      ],
    );

    await pumpPage(
      tester,
      folders: const [],
      albums: [album('a', 'Album A', showInTimeline: false), album('b', 'Album B', showInTimeline: false)],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectAlbums(tester, ['a', 'b']);
    await tester.tap(find.byKey(const Key('space-album-selection-toggle-timeline')));
    await tester.pumpAndSettle();

    expect(find.text('1 selected'), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-selected-b')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-selected-a')), findsNothing);

    await settleToast(tester);
  });

  testWidgets('S-20: bulk move places every selected album in the folder', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(
      () => api.bulkSetAlbumFolder(any(), any(), folderId: any(named: 'folderId')),
    ).thenAnswer((_) async => allSucceed({'a', 'b'}));

    await pumpPage(
      tester,
      folders: [folder('f', 'Trips')],
      albums: [album('a', 'Album A'), album('b', 'Album B')],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectAlbums(tester, ['a', 'b']);
    await tester.tap(find.byKey(const Key('space-album-selection-move')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('folder-option-f')));
    await tester.pumpAndSettle();

    verify(() => api.bulkSetAlbumFolder(spaceId, {'a', 'b'}, folderId: 'f')).called(1);
    verifyNever(() => api.bulkMoveAlbumFolders(any(), any(), parentId: any(named: 'parentId')));
  });

  // Fix round 1 (I-1) — R10 regressed `bulkMove`'s own `reconcile(failedIds)`
  // (space_albums.page.dart:571) to `clear()` and the whole suite stayed green. Same partial-
  // failure contract as bulk unlink/timeline-toggle, pinned here for bulk move.
  testWidgets('a partial failure on bulk move keeps exactly the failed albums selected', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(() => api.bulkSetAlbumFolder(any(), any(), folderId: any(named: 'folderId'))).thenAnswer(
      (_) async => [
        BulkIdResponseDto(id: 'a', success: true),
        BulkIdResponseDto(id: 'b', success: false, error: const Optional.present(BulkIdErrorReason.noPermission)),
      ],
    );

    await pumpPage(
      tester,
      folders: [folder('f', 'Trips')],
      albums: [album('a', 'Album A'), album('b', 'Album B')],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectAlbums(tester, ['a', 'b']);
    await tester.tap(find.byKey(const Key('space-album-selection-move')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('folder-option-f')));
    await tester.pumpAndSettle();

    expect(find.text('1 selected'), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-selected-b')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-selected-a')), findsNothing);

    await settleToast(tester);
  });

  testWidgets('bulk move for a folder-kind selection calls the folder endpoint, not the album one', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(
      () => api.bulkMoveAlbumFolders(any(), any(), parentId: any(named: 'parentId')),
    ).thenAnswer((_) async => allSucceed({'x'}));

    await pumpPage(
      tester,
      folders: [folder('x', 'Trips'), folder('y', 'Archive')],
      albums: const [],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectFolders(tester, ['x']);
    await tester.tap(find.byKey(const Key('space-album-selection-move')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('folder-option-y')));
    await tester.pumpAndSettle();

    verify(() => api.bulkMoveAlbumFolders(spaceId, {'x'}, parentId: 'y')).called(1);
    verifyNever(() => api.bulkSetAlbumFolder(any(), any(), folderId: any(named: 'folderId')));
  });

  // Fix round 1 (I-4/R5) — the reviewer's own probe: the SINGLE-folder exclusion this page has
  // wired since Task 15's first pass had NO test at all proving the excluded folder is actually
  // disabled in the picker (the sibling test above only ever taps the OTHER folder, 'y'). Pins it
  // directly against the picker's own disabled state, mirroring `space_album_folder_card_test.dart`'s
  // `tileEnabled` convention (`onTap == null` means disabled).
  testWidgets('bulk move for a single selected folder disables it as a destination in the picker', (tester) async {
    await pumpPage(
      tester,
      folders: [folder('x', 'Trips'), folder('y', 'Archive')],
      albums: const [],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(MockSharedSpaceApiRepository()),
        backgroundSyncProvider.overrideWithValue(MockBackgroundSyncManager()),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectFolders(tester, ['x']);
    await tester.tap(find.byKey(const Key('space-album-selection-move')));
    await tester.pumpAndSettle();

    expect(tester.widget<ListTile>(find.byKey(const Key('folder-option-x'))).onTap, isNull);
    expect(tester.widget<ListTile>(find.byKey(const Key('folder-option-y'))).onTap, isNotNull);
  });

  // Fix round 1 (I-4) — the actual gap the reviewer flagged: selecting Trips + Archive and
  // picking Trips as the destination for the WHOLE batch used to be offered by the picker,
  // guaranteeing Trips's own move fails server-side with no indication why. Proves EVERY selected
  // folder — not just "the folder" for a batch of one — is excluded.
  testWidgets('bulk move for a multi-folder selection disables every selected folder as a destination', (tester) async {
    await pumpPage(
      tester,
      folders: [folder('x', 'Trips'), folder('y', 'Archive'), folder('z', 'Other')],
      albums: const [],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(MockSharedSpaceApiRepository()),
        backgroundSyncProvider.overrideWithValue(MockBackgroundSyncManager()),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectFolders(tester, ['x', 'y']);
    await tester.tap(find.byKey(const Key('space-album-selection-move')));
    await tester.pumpAndSettle();

    expect(tester.widget<ListTile>(find.byKey(const Key('folder-option-x'))).onTap, isNull);
    expect(tester.widget<ListTile>(find.byKey(const Key('folder-option-y'))).onTap, isNull);
    expect(tester.widget<ListTile>(find.byKey(const Key('folder-option-z'))).onTap, isNotNull);
  });

  testWidgets('bulk folder delete calls the folder-delete endpoint for the whole batch', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(() => api.bulkDeleteAlbumFolders(any(), any())).thenAnswer((_) async => allSucceed({'x', 'y'}));

    await pumpPage(
      tester,
      folders: [folder('x', 'Trips'), folder('y', 'Archive')],
      albums: const [],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectFolders(tester, ['x', 'y']);
    await tester.tap(find.byKey(const Key('space-album-selection-delete')));
    await tester.pumpAndSettle();
    expect(find.text('Delete 2 folders?'), findsOneWidget);
    verifyNever(() => api.bulkDeleteAlbumFolders(any(), any())); // not fired before confirming

    await tester.tap(find.byKey(const Key('space-album-bulk-delete-confirm')));
    await tester.pumpAndSettle();

    verify(() => api.bulkDeleteAlbumFolders(spaceId, {'x', 'y'})).called(1);
    verifyNever(() => api.bulkUnlinkAlbums(any(), any()));
    expect(find.byKey(const Key('space-album-selection-bar')), findsNothing);
  });

  // Fix round 1 (I-1) — R12 regressed `bulkDeleteFolders`'s own `reconcile(failedIds)`
  // (space_albums.page.dart:597) to `clear()` and the whole suite stayed green. Same
  // partial-failure contract, pinned here for bulk folder delete: an editor bulk-deleting 5
  // folders where 2 fail a permission check must not silently lose track of which 2.
  testWidgets('a partial failure on bulk folder delete keeps exactly the failed folders selected', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(() => api.bulkDeleteAlbumFolders(any(), any())).thenAnswer(
      (_) async => [
        BulkIdResponseDto(id: 'x', success: true),
        BulkIdResponseDto(id: 'y', success: false, error: const Optional.present(BulkIdErrorReason.noPermission)),
      ],
    );

    await pumpPage(
      tester,
      folders: [folder('x', 'Trips'), folder('y', 'Archive')],
      albums: const [],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
      ],
    );

    await selectFolders(tester, ['x', 'y']);
    await tester.tap(find.byKey(const Key('space-album-selection-delete')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-bulk-delete-confirm')));
    await tester.pumpAndSettle();

    expect(find.text('1 selected'), findsOneWidget);
    expect(find.byKey(const Key('space-album-folder-card-selected-y')), findsOneWidget);
    expect(find.byKey(const Key('space-album-folder-card-selected-x')), findsNothing);

    await settleToast(tester);
  });

  // Item 1 of the task-15 brief: `reconcile()` had no call site on mobile before this task. This
  // proves it is now wired against the live album/folder stream — an id another member deletes
  // (unlinked elsewhere, so it drops out of the NEXT sync emission) must silently drop out of an
  // already-active selection, independent of any bulk action this page itself performs.
  testWidgets('reconcile: a selected album that vanishes from the incoming list drops out of the selection', (
    tester,
  ) async {
    final controller = StreamController<List<SpaceAlbum>>();
    addTearDown(controller.close);

    // Not `pumpConsumerWidget`: its own auto-`pumpAndSettle()` never converges while `albumsAsync`
    // is still `loading` (no emission has happened yet) — `albumsAsync.when`'s `loading` branch
    // renders an indeterminately-animating `CircularProgressIndicator`. Built manually instead
    // (mirrors `pumpPageWithFolderStream` above), pumping a single frame before the controller
    // has any data so the loading spinner never has to settle.
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
            spaceAlbumsProvider(spaceId).overrideWith((_) => controller.stream),
            spaceAlbumFoldersProvider(spaceId).overrideWith((_) => Stream.value(const <SpaceAlbumFolder>[])),
          ],
          child: Builder(
            builder: (context) => MaterialApp(
              debugShowCheckedModeBanner: false,
              localizationsDelegates: context.localizationDelegates,
              supportedLocales: context.supportedLocales,
              locale: context.locale,
              home: const Material(child: SpaceAlbumsPage(spaceId: spaceId, canEdit: true)),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    controller.add([album('a', 'Album A'), album('b', 'Album B')]);
    await tester.pumpAndSettle();

    await tester.longPress(find.byKey(const Key('space-album-card-a')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-card-b')));
    await tester.pumpAndSettle();
    expect(find.text('2 selected'), findsOneWidget); // positive control

    // Another member unlinks 'b' elsewhere — the next sync emission drops it from the list.
    controller.add([album('a', 'Album A')]);
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.text('1 selected'), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-selected-a')), findsOneWidget);
  });

  // The three editor actions (New folder / New album / Link) are labelled `TextButton.icon`s, and
  // every other test in this file pumps at the helper's 800dp TABLET width — where they fit with
  // room to spare. On a phone they did not: with M3's default `TextButton.icon` padding
  // (`EdgeInsetsDirectional.only(start: 12, end: 16)` = 28dp each) the row overran the toolbar,
  // `NavigationToolbar` gave the title zero width, and the whole row was pushed left until it sat
  // underneath the back button.
  //
  // This asserts the CHROME each action wraps around its label — icon + icon/label gap + padding —
  // rather than any absolute toolbar width. That is deliberate: the widget-test font renders every
  // glyph as a fixed-width box, so label widths here are ~1.8x their on-device value and no
  // absolute "fits at 411dp" assertion would mean anything. Chrome is font-independent, and it is
  // the only part of the width this page controls.
  testWidgets('editor app-bar actions wrap their labels in compact chrome', (tester) async {
    final router = RootStackRouter.build(
      routes: [
        AutoRoute(initial: true, page: PageInfo('SpaceAlbumsHarness', builder: (_) => const SizedBox.shrink())),
        AutoRoute(page: SpaceAlbumsRoute.page),
      ],
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
          overrides: _overrides(spaceId: spaceId, albums: const []),
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
    // Pushed (not `initial`) so the AppBar gets its implicit back button — the widget the actions
    // were crowding. See `pumpPageWithFolderStream` for why this push is deliberately not awaited.
    unawaited(router.push(SpaceAlbumsRoute(spaceId: spaceId, canEdit: true)));
    await tester.pumpAndSettle();

    // Measured: 42dp with the compact style (icon + gap + 8dp padding either side), 54dp with M3's
    // default `TextButton.icon` padding. 48dp sits between them with ~6dp of slack on both sides —
    // enough to absorb M3 metric drift, not enough to let the default padding back in.
    const maxChromePerAction = 48.0;

    for (final (key, label) in [
      ('space-albums-new-folder-action', 'New folder'),
      ('space-albums-new-album-action', 'New album'),
      ('space-albums-link-action', 'Link'),
    ]) {
      final action = find.byKey(Key(key));
      expect(action, findsOneWidget, reason: '$key must be present for this measurement to mean anything');
      final chrome =
          tester.getSize(action).width - tester.getSize(find.descendant(of: action, matching: find.text(label))).width;
      expect(chrome, lessThanOrEqualTo(maxChromePerAction), reason: '$key wraps its label in ${chrome}dp of chrome');
    }
  });

  // ---------------------------------------------------------------------
  // Task 11 — rename/delete space-linked albums, capability-gated per the task brief's table:
  // rename is `canEdit || isOwnedByMe`, delete (single or bulk) is `isOwnedByMe` alone, editor or
  // not. Mocks `SharedSpaceApiRepository` (never `spaceAlbumActionsProvider`) whenever a test
  // actually needs the real action to fire, matching the Task 15 bulk-action tests above.
  // ---------------------------------------------------------------------

  group('capability-gated album card menu', () {
    // Scenarios 58–61. 58 and 60 are the positive cases 59 and 61's negatives depend on.
    testWidgets('editor + owner: offers Rename and Delete', (tester) async {
      await pumpPage(
        tester,
        folders: const [],
        albums: [_album(id: 'a1', name: 'Rome', isOwnedByMe: true)],
        canEdit: true,
      );

      await tester.tap(find.byKey(const Key('space-album-card-menu-a1')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('space-album-card-rename-a1')), findsOneWidget);
      expect(find.byKey(const Key('space-album-card-delete-a1')), findsOneWidget);
      // Positive controls for test 60's "only" negatives below — same finders, same shape.
      expect(find.text('Hide from timeline'), findsOneWidget);
      expect(find.text('Unlink from space'), findsOneWidget);
      expect(find.text('Move to folder…'), findsOneWidget);
    });

    testWidgets('editor + not owner: offers Rename only', (tester) async {
      await pumpPage(
        tester,
        folders: const [],
        albums: [_album(id: 'a1', name: 'Rome', isOwnedByMe: false)],
        canEdit: true,
      );

      await tester.tap(find.byKey(const Key('space-album-card-menu-a1')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('space-album-card-rename-a1')), findsOneWidget);
      // Negative — same finder as test 58's positive above.
      expect(find.byKey(const Key('space-album-card-delete-a1')), findsNothing);
    });

    testWidgets('viewer + owner: offers Rename and Delete only', (tester) async {
      await pumpPage(
        tester,
        folders: const [],
        albums: [_album(id: 'a1', name: 'Rome', isOwnedByMe: true)],
        canEdit: false,
      );

      await tester.tap(find.byKey(const Key('space-album-card-menu-a1')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('space-album-card-rename-a1')), findsOneWidget);
      expect(find.byKey(const Key('space-album-card-delete-a1')), findsOneWidget);
      // "only" — the three canEdit-gated items must not render for a viewer, even the owner. Same
      // finders as test 58's positive controls above.
      expect(find.text('Hide from timeline'), findsNothing);
      expect(find.text('Unlink from space'), findsNothing);
      expect(find.text('Move to folder…'), findsNothing);
    });

    testWidgets('viewer + not owner: renders no card menu', (tester) async {
      await pumpPage(
        tester,
        folders: const [],
        albums: [_album(id: 'a1', name: 'Rome', isOwnedByMe: false)],
        canEdit: false,
      );

      // Positive counterpart is the very first test in this file ("editor + 2 albums…") plus
      // tests 58/60 above, all of which find this same key.
      expect(find.byKey(const Key('space-album-card-menu-a1')), findsNothing);
    });
  });

  // Scenario 62
  //
  // Uses the router-backed `pumpSpaceAlbumsPage` harness (not the plain `pumpPage`): with no
  // `onLongPress` wired for the not-owned card, `tester.longPress` still resolves as an ordinary
  // tap (no competing LongPressGestureRecognizer is registered to win the gesture arena), which
  // fires `onAlbumTap` -> `context.pushRoute(...)`. `pumpPage`'s harness has no `AutoRouter`
  // ancestor, so that navigation crashes there; `pumpSpaceAlbumsPage` registers a real (recording,
  // not crashing) detail route, matching how the pre-existing S-10 "long-press does nothing when
  // canManage is false" test above already handles the identical quirk for a plain viewer.
  testWidgets('a viewer can long-press an album they own, but not one they do not', (tester) async {
    final openedAlbumIds = <String>[];
    final router = await pumpSpaceAlbumsPage(
      tester,
      albums: [
        _album(id: 'owned', name: 'Mine', isOwnedByMe: true),
        _album(id: 'not-owned', name: 'Theirs', isOwnedByMe: false),
      ],
      canManage: false,
      openedAlbumIds: openedAlbumIds,
    );

    // Negative first: long-pressing an album the viewer does not own does not enter selection —
    // it falls through to a plain-tap navigation instead (see the harness note above).
    await tester.longPress(find.byKey(const Key('space-album-card-not-owned')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('space-album-selection-bar')), findsNothing);
    expect(openedAlbumIds, ['not-owned']); // proves the gesture actually landed somewhere

    // That navigation covers this page (making its cards offstage — unreachable to `find` by
    // default), so return to it before the positive check below.
    await router.maybePop();
    await tester.pumpAndSettle();

    // Positive, same finder as the selection-bar negative above — proves it wasn't vacuous (e.g.
    // a typo'd key that could never match anything).
    await tester.longPress(find.byKey(const Key('space-album-card-owned')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('space-album-selection-bar')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-selected-owned')), findsOneWidget);
    expect(openedAlbumIds, ['not-owned']); // still just the one nav — this long-press selected instead
  });

  // I-1 (final whole-branch review) — Task 11 widened long-press (`canSelectAlbum`, per album) and
  // `showSelectionBar`, but left `onAlbumTap`'s toggle branch on the page-wide `canEdit`. A viewer
  // who owns two albums could therefore ENTER a selection but never extend it: the second tap
  // pushed the detail route and abandoned the live selection behind a navigation, making bulk
  // delete unreachable for the exact persona the capability model was widened for. Web routes on
  // `selection.selectionActive` first and only then on the per-album predicate
  // (space-albums-list.svelte's `handleAlbumClick`); these two tests pin the same shape on mobile.
  testWidgets('a viewer tap-extends a selection across the albums they own', (tester) async {
    final openedAlbumIds = <String>[];
    await pumpSpaceAlbumsPage(
      tester,
      albums: [
        _album(id: 'owned-1', name: 'Rome', isOwnedByMe: true),
        _album(id: 'owned-2', name: 'Venice', isOwnedByMe: true),
      ],
      canManage: false,
      openedAlbumIds: openedAlbumIds,
    );

    await tester.longPress(find.byKey(const Key('space-album-card-owned-1')));
    await tester.pumpAndSettle();
    expect(find.text('1 selected'), findsOneWidget); // positive control — the selection did start

    await tester.tap(find.byKey(const Key('space-album-card-owned-2')));
    await tester.pumpAndSettle();

    expect(find.text('2 selected'), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-selected-owned-1')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-selected-owned-2')), findsOneWidget);
    // The whole point: the tap EXTENDED the selection instead of navigating away from it. With
    // bulk delete gated on "owns every selected album", this is the only route to a >1 bulk
    // delete for a viewer.
    expect(find.byKey(const Key('space-album-selection-delete-albums')), findsOneWidget);
    expect(openedAlbumIds, isEmpty);
  });

  testWidgets('a card the viewer cannot select is inert mid-selection, not a navigation', (tester) async {
    final openedAlbumIds = <String>[];
    await pumpSpaceAlbumsPage(
      tester,
      albums: [
        _album(id: 'owned', name: 'Mine', isOwnedByMe: true),
        _album(id: 'not-owned', name: 'Theirs', isOwnedByMe: false),
      ],
      canManage: false,
      openedAlbumIds: openedAlbumIds,
    );

    await tester.longPress(find.byKey(const Key('space-album-card-owned')));
    await tester.pumpAndSettle();
    expect(find.text('1 selected'), findsOneWidget); // positive control

    await tester.tap(find.byKey(const Key('space-album-card-not-owned')));
    await tester.pumpAndSettle();

    // Neither selected (it offers no select affordance at all) nor navigated to — the same
    // "unselectable card is inert" contract web's `handleAlbumClick` already implements.
    expect(find.byKey(const Key('space-album-card-selected-not-owned')), findsNothing);
    expect(openedAlbumIds, isEmpty);
    expect(find.text('1 selected'), findsOneWidget); // the live selection survived untouched
  });

  // Scenario 63
  testWidgets('bulk Delete disappears once an unowned album joins the selection', (tester) async {
    // Editor context: `onAlbumTap`'s toggle branch is gated on `canSelectAlbum`, which is
    // satisfied for an editor regardless of ownership (I-1), so an editor can TAP-add an album
    // they do NOT own to an existing selection — the only way to grow a selection past its first,
    // long-press-entered member with an unowned album. Bulk delete itself stays ownership-gated
    // independent of `canEdit` (S-10's table: "owns every selected album", not an editor
    // privilege).
    await pumpPage(
      tester,
      folders: const [],
      albums: [
        _album(id: 'owned', name: 'Mine', isOwnedByMe: true),
        _album(id: 'not-owned', name: 'Theirs', isOwnedByMe: false),
      ],
      canEdit: true,
    );

    await tester.longPress(find.byKey(const Key('space-album-card-owned')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('space-album-selection-delete-albums')), findsOneWidget); // positive control

    await tester.tap(find.byKey(const Key('space-album-card-not-owned')));
    await tester.pumpAndSettle();

    // Negative, same finder as the positive control above.
    expect(find.byKey(const Key('space-album-selection-delete-albums')), findsNothing);
  });

  // Scenario 64
  testWidgets('a partial bulk delete leaves exactly the failures selected', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(() => api.bulkDeleteAlbums(any(), any())).thenAnswer(
      (_) async => [
        BulkIdResponseDto(id: 'a', success: true),
        BulkIdResponseDto(id: 'b', success: false, error: const Optional.present(BulkIdErrorReason.noPermission)),
      ],
    );

    await pumpPage(
      tester,
      folders: const [],
      albums: [
        _album(id: 'a', name: 'Album A', isOwnedByMe: true),
        _album(id: 'b', name: 'Album B', isOwnedByMe: true),
      ],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
        // A partial failure (one success) still calls `_onOwnedAlbumsChanged` — see the fixture's
        // own doc above for why this must be overridden.
        remoteAlbumProvider.overrideWith(() => _NoopRemoteAlbumNotifier()),
      ],
    );

    await selectAlbums(tester, ['a', 'b']);
    expect(find.text('2 selected'), findsOneWidget); // positive control

    await tester.tap(find.byKey(const Key('space-album-selection-delete-albums')));
    await tester.pumpAndSettle();
    // One confirm dialog for the whole batch, naming the count — the bulk (not single-album) copy.
    expect(find.text('Delete 2 albums'), findsOneWidget);
    verifyNever(() => api.bulkDeleteAlbums(any(), any())); // not fired before confirming

    await tester.tap(find.byKey(const Key('space-album-delete-confirm')));
    await tester.pumpAndSettle();

    verify(() => api.bulkDeleteAlbums(spaceId, {'a', 'b'})).called(1);
    expect(find.text('1 selected'), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-selected-b')), findsOneWidget);
    expect(find.byKey(const Key('space-album-card-selected-a')), findsNothing);
    expect(find.text('1 item could not be updated'), findsOneWidget);

    await settleToast(tester);
  });

  // Fix round 1 — the review caught that `onDeleteAlbums`'s call site never supplied
  // `singleAlbumName`, so a single-album selection rendered the confirmation as `Delete ""?`
  // (empty name) instead of naming the album. This is the mainline flow for the persona this task
  // targets: a viewer long-presses the one album they own and taps the bar's delete icon. (A
  // viewer who owns SEVERAL albums can grow the selection past one by tapping — see "a viewer
  // tap-extends a selection across the albums they own" above — and then gets the counted bulk
  // copy instead, which is what makes the single-vs-bulk branch here worth pinning.)
  testWidgets('selecting exactly one owned album shows its name in the delete confirmation', (tester) async {
    await pumpPage(
      tester,
      folders: const [],
      albums: [_album(id: 'a1', name: 'Rome', isOwnedByMe: true)],
      canEdit: false,
    );

    await tester.longPress(find.byKey(const Key('space-album-card-a1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-selection-delete-albums')));
    await tester.pumpAndSettle();

    // The real, single-album copy — proves `singleAlbumName` was resolved and threaded through.
    expect(
      find.text(
        'Delete "Rome"? This permanently deletes the album for everyone in this space, not just '
        'from this space. The photos in it are not deleted.',
      ),
      findsOneWidget,
    );
    // Negative — the exact regression the review caught, using the same substring-matching finder
    // family (`find.textContaining`) so it isn't just the inverse of the positive assertion above.
    expect(find.textContaining('Delete ""?'), findsNothing);
  });

  // Scenario 65
  testWidgets('cancelling the rename dialog fires no action call', (tester) async {
    final api = MockSharedSpaceApiRepository();
    final syncMgr = MockBackgroundSyncManager();
    when(() => syncMgr.syncRemote()).thenAnswer((_) async => true);
    when(() => api.renameAlbum(any(), any(), any())).thenAnswer((_) async {});

    await pumpPage(
      tester,
      folders: const [],
      albums: [_album(id: 'a1', name: 'Rome', isOwnedByMe: true)],
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(api),
        backgroundSyncProvider.overrideWithValue(syncMgr),
        driftAlbumApiRepositoryProvider.overrideWithValue(MockDriftAlbumApiRepository()),
        remoteAlbumProvider.overrideWith(() => _NoopRemoteAlbumNotifier()),
      ],
    );

    await tester.tap(find.byKey(const Key('space-album-card-menu-a1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-card-rename-a1')));
    await tester.pumpAndSettle();

    final field = tester.widget<TextFormField>(find.byKey(const Key('space-album-name-field')));
    expect(field.controller!.text, 'Rome'); // positive control — the dialog IS showing, pre-filled

    await tester.tap(find.byKey(const Key('space-album-name-cancel')));
    await tester.pumpAndSettle();

    verifyNever(() => api.renameAlbum(any(), any(), any()));

    // Positive counterpart to the `verifyNever` above, using the SAME mocked call — proving it
    // isn't vacuously true because the confirm path is dead too. Re-open the same dialog and
    // confirm this time.
    await tester.tap(find.byKey(const Key('space-album-card-menu-a1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('space-album-card-rename-a1')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('space-album-name-field')), 'Roma');
    await tester.tap(find.byKey(const Key('space-album-name-confirm')));
    await tester.pumpAndSettle();

    verify(() => api.renameAlbum(spaceId, 'a1', 'Roma')).called(1);
  });
}
