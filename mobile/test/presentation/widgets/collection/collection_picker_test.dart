import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/constants/enums.dart';
import 'package:immich_mobile/domain/models/album/album.model.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/config/app_config.dart';
import 'package:immich_mobile/domain/models/user.model.dart';
import 'package:immich_mobile/domain/services/user.service.dart';
import 'package:immich_mobile/models/albums/album_search.model.dart';
import 'package:immich_mobile/presentation/widgets/collection/collection_picker.widget.dart';
import 'package:immich_mobile/presentation/widgets/collection/space_collection_section.widget.dart';
import 'package:immich_mobile/presentation/widgets/album/album_selector.widget.dart';
import 'package:immich_mobile/providers/infrastructure/action.provider.dart';
import 'package:immich_mobile/providers/infrastructure/album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/remote_album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';
import 'package:immich_mobile/providers/shared_space.provider.dart';
import 'package:immich_mobile/providers/timeline/multiselect.provider.dart';
import 'package:immich_mobile/providers/user.provider.dart';
import 'package:immich_mobile/widgets/common/search_field.dart';
import 'package:mocktail/mocktail.dart';
import 'package:openapi/api.dart';

import '../../../fixtures/user.stub.dart';
import '../../../widget_tester_extensions.dart';

class _MockUserService extends Mock implements UserService {}

// Mirrors `space_collection_section_test.dart`: `currentUserProvider` is a
// `StateNotifierProvider` whose `overrideWith` builder must return a `StateNotifier`.
class _StubCurrentUserNotifier extends CurrentUserProvider {
  _StubCurrentUserNotifier(super.service, UserDto? user) {
    state = user;
  }
}

// `AlbumSelector`'s `initState` fires a post-frame callback that calls
// `refresh()` on the real notifier -- which needs a live `RemoteAlbumService` this
// harness has no reason to stand up. Overriding just `build()` (as
// `space_link_album_page_test.dart` does) leaves `refresh()` pointed at an
// uninitialized service field, so this stub also no-ops `refresh()`.
class _StubRemoteAlbumNotifier extends RemoteAlbumNotifier {
  @override
  RemoteAlbumState build() => const RemoteAlbumState(albums: []);

  @override
  Future<void> refresh() async {}

  // Typing in the search field routes through here; the real one needs the same live
  // service `refresh()` does. The album list is empty in this harness, so echo it back.
  @override
  List<RemoteAlbum> searchAlbums(
    List<RemoteAlbum> albums,
    String query,
    String? userId, [
    QuickFilterMode filterMode = QuickFilterMode.all,
  ]) => albums;
}

/// Captures which [ActionSource] the picker dispatched against, and lets a test make the
/// dispatch fail, without standing up the real action plumbing.
class _RecordingActionNotifier extends ActionNotifier {
  _RecordingActionNotifier({this.succeeds = true});

  final bool succeeds;
  final List<ActionSource> albumSources = [];
  final List<ActionSource> spaceSources = [];

  @override
  void build() {}

  @override
  Future<ActionResult> addToAlbum(ActionSource source, RemoteAlbum album) async {
    albumSources.add(source);
    return ActionResult(count: succeeds ? 1 : 0, success: succeeds);
  }

  @override
  Future<ActionResult> addToSpace(ActionSource source, SharedSpaceResponseDto space) async {
    spaceSources.add(source);
    return ActionResult(count: succeeds ? 1 : 0, success: succeeds);
  }
}

void main() {
  SharedSpaceMemberResponseDto member(String userId, SharedSpaceRole role) => SharedSpaceMemberResponseDto(
    userId: userId,
    name: userId,
    email: '$userId@e.com',
    role: role,
    joinedAt: '2026-01-01T00:00:00Z',
    sharePersonMetadata: true,
    showInTimeline: true,
  );

  SharedSpaceResponseDto space(String id, String name) => SharedSpaceResponseDto(
    id: id,
    name: name,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdById: 'someone-else',
    members: Optional.present([member('user-1', SharedSpaceRole.owner)]),
    albumCount: const Optional.present(0),
  );

  testWidgets('composes the header, the album selector and the spaces section, in that order', (tester) async {
    final userService = _MockUserService();
    final user = UserStub.user1;
    when(() => userService.tryGetMyUser()).thenReturn(user);
    when(() => userService.watchMyUser()).thenAnswer((_) => const Stream.empty());

    await tester.pumpConsumerWidgetRaw(
      const CustomScrollView(slivers: [CollectionPicker()]),
      overrides: [
        currentUserProvider.overrideWith((ref) => _StubCurrentUserNotifier(userService, user)),
        remoteAlbumProvider.overrideWith(() => _StubRemoteAlbumNotifier()),
        appConfigProvider.overrideWithValue(const AppConfig()),
        sharedSpacesProvider.overrideWith((ref) async => const []),
        multiSelectProvider.overrideWith(
          () => MultiSelectNotifier(const MultiSelectState(selectedAssets: {}, lockedSelectionAssets: {})),
        ),
      ],
    );
    await tester.pump();

    expect(find.byKey(const Key('collection-picker-header')), findsOneWidget);
    expect(find.byType(AlbumSelector), findsOneWidget);
    expect(find.byType(SpaceCollectionSection), findsOneWidget);

    // `AlbumSelector` itself renders a `MultiSliver` (a `RenderSliver`, not a
    // `RenderBox`), so `getTopLeft` cannot target the widget directly; its first
    // content sliver (the search field) stands in for "where AlbumSelector starts".
    final headerY = tester.getTopLeft(find.byKey(const Key('collection-picker-header'))).dy;
    final albumsY = tester.getTopLeft(find.byType(SearchField)).dy;
    expect(headerY, lessThan(albumsY));
  });

  testWidgets('typing in the search field narrows the spaces section too', (tester) async {
    final userService = _MockUserService();
    final user = UserStub.user1;
    when(() => userService.tryGetMyUser()).thenReturn(user);
    when(() => userService.watchMyUser()).thenAnswer((_) => const Stream.empty());

    await tester.pumpConsumerWidgetRaw(
      const CustomScrollView(slivers: [CollectionPicker()]),
      overrides: [
        currentUserProvider.overrideWith((ref) => _StubCurrentUserNotifier(userService, user)),
        remoteAlbumProvider.overrideWith(() => _StubRemoteAlbumNotifier()),
        appConfigProvider.overrideWithValue(const AppConfig()),
        sharedSpacesProvider.overrideWith(
          (ref) async => [space('s1', 'Family Vacation'), space('s2', 'Photography Club')],
        ),
        multiSelectProvider.overrideWith(
          () => MultiSelectNotifier(const MultiSelectState(selectedAssets: {}, lockedSelectionAssets: {})),
        ),
      ],
    );
    await tester.pump();

    expect(find.byKey(const Key('space-row-s1')), findsOneWidget);
    expect(find.byKey(const Key('space-row-s2')), findsOneWidget);

    await tester.enterText(find.byType(SearchField), 'family');
    await tester.pump();

    expect(find.byKey(const Key('space-row-s1')), findsOneWidget);
    expect(
      find.byKey(const Key('space-row-s2')),
      findsNothing,
      reason: 'the search field must filter spaces, not just albums',
    );

    await tester.enterText(find.byType(SearchField), '');
    await tester.pump();

    expect(find.byKey(const Key('space-row-s2')), findsOneWidget);
  });

  // #965: the same picker is now mounted from surfaces that have no timeline multiselect —
  // the asset viewer above all — so the source it dispatches against and the assets it
  // reasons about both have to be things the caller can state.
  group('mounted outside the timeline', () {
    RemoteAsset asset(String id, {String ownerId = 'user-1'}) => RemoteAsset(
      id: id,
      name: id,
      ownerId: ownerId,
      checksum: id,
      type: AssetType.image,
      createdAt: DateTime(2026, 1, 1),
      updatedAt: DateTime(2026, 1, 1),
      isEdited: false,
    );

    Future<void> pumpPicker(
      WidgetTester tester, {
      required Widget picker,
      List<SharedSpaceResponseDto> spaces = const [],
      List<Override> extraOverrides = const [],
    }) async {
      final userService = _MockUserService();
      final user = UserStub.user1; // id: 'user-1'
      when(() => userService.tryGetMyUser()).thenReturn(user);
      when(() => userService.watchMyUser()).thenAnswer((_) => const Stream.empty());

      await tester.pumpConsumerWidgetRaw(
        CustomScrollView(slivers: [picker]),
        overrides: [
          currentUserProvider.overrideWith((ref) => _StubCurrentUserNotifier(userService, user)),
          remoteAlbumProvider.overrideWith(() => _StubRemoteAlbumNotifier()),
          appConfigProvider.overrideWithValue(const AppConfig()),
          sharedSpacesProvider.overrideWith((ref) async => spaces),
          multiSelectProvider.overrideWith(
            () => MultiSelectNotifier(const MultiSelectState(selectedAssets: {}, lockedSelectionAssets: {})),
          ),
          ...extraOverrides,
        ],
      );
      await tester.pump();
    }

    /// `ImmichToast` schedules a 3s fluttertoast Timer outside the frame scheduler, so a
    /// plain `pumpAndSettle()` leaves it pending and teardown fails with "A Timer is still
    /// pending". Pump past its lifetime instead.
    Future<void> tapSpaceRow(WidgetTester tester, String id) async {
      await tester.tap(find.byKey(Key('space-row-$id')));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
    }

    testWidgets('judges space targets by the assets it was given, not the empty multiselect', (tester) async {
      await pumpPicker(
        tester,
        picker: CollectionPicker(assets: [asset('a', ownerId: 'someone-else')]),
        spaces: [space('s1', 'Family')],
      );

      expect(find.byKey(const Key('space-row-s1')), findsNothing);
      expect(find.byKey(const Key('space-collection-notice')), findsOneWidget);
    });

    testWidgets('dispatches the space pool against the source it was given', (tester) async {
      final notifier = _RecordingActionNotifier();
      await pumpPicker(
        tester,
        picker: CollectionPicker(source: ActionSource.viewer, assets: [asset('a')]),
        spaces: [space('s1', 'Family')],
        extraOverrides: [actionProvider.overrideWith(() => notifier)],
      );

      await tapSpaceRow(tester, 's1');

      expect(notifier.spaceSources, [ActionSource.viewer]);
    });

    testWidgets('still defaults to the timeline source', (tester) async {
      final notifier = _RecordingActionNotifier();
      await pumpPicker(
        tester,
        picker: const CollectionPicker(),
        spaces: [space('s1', 'Family')],
        extraOverrides: [actionProvider.overrideWith(() => notifier)],
      );

      await tapSpaceRow(tester, 's1');

      expect(notifier.spaceSources, [ActionSource.timeline]);
    });

    testWidgets('reports completion only when the add succeeded', (tester) async {
      var completions = 0;
      final notifier = _RecordingActionNotifier(succeeds: true);
      await pumpPicker(
        tester,
        picker: CollectionPicker(onCompleted: () => completions++),
        spaces: [space('s1', 'Family')],
        extraOverrides: [actionProvider.overrideWith(() => notifier)],
      );

      await tapSpaceRow(tester, 's1');

      expect(completions, 1);
    });

    testWidgets('does not report completion when the add failed', (tester) async {
      var completions = 0;
      final notifier = _RecordingActionNotifier(succeeds: false);
      await pumpPicker(
        tester,
        picker: CollectionPicker(onCompleted: () => completions++),
        spaces: [space('s1', 'Family')],
        extraOverrides: [actionProvider.overrideWith(() => notifier)],
      );

      await tapSpaceRow(tester, 's1');

      expect(completions, 0, reason: 'the sheet must stay open so the user can retry');
    });
  });
}
