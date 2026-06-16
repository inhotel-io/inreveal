import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/space_album.model.dart';
import 'package:immich_mobile/presentation/widgets/spaces/space_albums_shelf.widget.dart';
import 'package:immich_mobile/providers/infrastructure/space_album.provider.dart';

/// Finds widgets whose [ValueKey<String>] starts with [prefix].
Finder findByKeyPrefix(String prefix) => find.byWidgetPredicate(
  (widget) => widget.key is ValueKey<String> && (widget.key as ValueKey<String>).value.startsWith(prefix),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

SpaceAlbum _album({
  required String id,
  String? name,
  String? thumbnailAssetId,
  bool showInTimeline = true,
}) =>
    SpaceAlbum(
      id: id,
      name: name ?? 'Album $id',
      thumbnailAssetId: thumbnailAssetId,
      showInTimeline: showInTimeline,
    );

/// Wraps [widget] in a [ProviderScope] that overrides [spaceAlbumsProvider]
/// with a fixed list, and a minimal [MaterialApp] for theme/directionality.
Widget _wrap(
  Widget widget, {
  required String spaceId,
  required List<SpaceAlbum> albums,
}) {
  return ProviderScope(
    overrides: [
      spaceAlbumsProvider(spaceId).overrideWith((_) => Stream.value(albums)),
    ],
    child: MaterialApp(home: Scaffold(body: widget)),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  const spaceId = 'space-1';

  testWidgets('count>0 + canEdit: shows cover tiles and Link tile', (tester) async {
    final albums = [
      _album(id: 'a1', name: 'Hawaii'),
      _album(id: 'a2', name: 'Sunset'),
    ];

    await tester.pumpWidget(
      _wrap(
        SpaceAlbumsShelf(
          spaceId: spaceId,
          canEdit: true,
          onLinkTap: () {},
          onAlbumTap: (_) {},
        ),
        spaceId: spaceId,
        albums: albums,
      ),
    );
    await tester.pump(); // let StreamProvider emit

    expect(find.byKey(const Key('space-albums-shelf')), findsOneWidget);
    expect(find.byKey(const Key('space-album-tile-a1')), findsOneWidget);
    expect(find.byKey(const Key('space-album-tile-a2')), findsOneWidget);
    expect(find.byKey(const Key('space-album-link-tile')), findsOneWidget);
  });

  testWidgets('off-timeline album shows visibility_off icon', (tester) async {
    final albums = [
      _album(id: 'a1', name: 'Hawaii', showInTimeline: true),
      _album(id: 'a2', name: 'Reef', showInTimeline: false),
    ];

    await tester.pumpWidget(
      _wrap(
        SpaceAlbumsShelf(
          spaceId: spaceId,
          canEdit: true,
          onLinkTap: () {},
          onAlbumTap: (_) {},
        ),
        spaceId: spaceId,
        albums: albums,
      ),
    );
    await tester.pump();

    // Reef tile is off-timeline → has visibility_off overlay
    expect(find.byIcon(Icons.visibility_off), findsOneWidget);
  });

  testWidgets('count==0 + canEdit=true: shows only the Link tile', (tester) async {
    await tester.pumpWidget(
      _wrap(
        SpaceAlbumsShelf(
          spaceId: spaceId,
          canEdit: true,
          onLinkTap: () {},
          onAlbumTap: (_) {},
        ),
        spaceId: spaceId,
        albums: [],
      ),
    );
    await tester.pump();

    expect(find.byKey(const Key('space-album-link-tile')), findsOneWidget);
    // No cover tiles
    expect(findByKeyPrefix('space-album-tile-'), findsNothing);
  });

  testWidgets('count==0 + canEdit=false: renders nothing', (tester) async {
    await tester.pumpWidget(
      _wrap(
        SpaceAlbumsShelf(
          spaceId: spaceId,
          canEdit: false,
          onLinkTap: () {},
          onAlbumTap: (_) {},
        ),
        spaceId: spaceId,
        albums: [],
      ),
    );
    await tester.pump();

    expect(find.byKey(const Key('space-albums-shelf')), findsNothing);
    expect(find.byKey(const Key('space-album-link-tile')), findsNothing);
    expect(findByKeyPrefix('space-album-tile-'), findsNothing);
  });

  testWidgets('album with null thumbnailAssetId uses photo_album_outlined fallback icon', (tester) async {
    final albums = [
      _album(id: 'a1', name: 'Unsynced', thumbnailAssetId: null),
    ];

    await tester.pumpWidget(
      _wrap(
        SpaceAlbumsShelf(
          spaceId: spaceId,
          canEdit: false,
          onLinkTap: () {},
          onAlbumTap: (_) {},
        ),
        spaceId: spaceId,
        albums: albums,
      ),
    );
    await tester.pump();

    // Cover has no thumbnail → fallback icon is shown
    expect(find.byIcon(Icons.photo_album_outlined), findsOneWidget);
  });
}

