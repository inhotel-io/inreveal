library;

/// Task 3 — B5 wiring test.
///
/// Verifies that tapping the "＋ Link" action in [SpaceAlbumsPage] invokes the
/// [onLink] callback (which in production is wired by [SpaceDetailPage] to push
/// [SpaceLinkAlbumRoute]). We test the callback contract here; the actual route
/// push is verified end-to-end via the running app.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/space_album.model.dart';
import 'package:immich_mobile/pages/library/spaces/space_albums.page.dart';
import 'package:immich_mobile/providers/infrastructure/space_album.provider.dart';

import '../../widget_tester_extensions.dart';

List<Override> _overrides({required String spaceId, required List<SpaceAlbum> albums}) => [
  spaceAlbumsProvider(spaceId).overrideWith((_) => Stream.value(albums)),
];

void main() {
  const spaceId = 'space-1';

  testWidgets('tapping ＋ Link in SpaceAlbumsPage invokes the onLink callback',
      (tester) async {
    var callCount = 0;

    await tester.pumpConsumerWidget(
      SpaceAlbumsPage(
        spaceId: spaceId,
        canEdit: true,
        onLink: () => callCount++,
      ),
      overrides: _overrides(
        spaceId: spaceId,
        albums: [const SpaceAlbum(id: 'a1', name: 'Hawaii', showInTimeline: true)],
      ),
    );

    // Tap the ＋ Link app-bar action.
    await tester.tap(find.byKey(const Key('space-albums-link-action')));
    await tester.pump();

    expect(callCount, 1);
  });

  testWidgets(
      'tapping ＋ Link in empty-state SpaceAlbumsPage invokes the onLink callback',
      (tester) async {
    var callCount = 0;

    await tester.pumpConsumerWidget(
      SpaceAlbumsPage(
        spaceId: spaceId,
        canEdit: true,
        onLink: () => callCount++,
      ),
      overrides: _overrides(spaceId: spaceId, albums: const []), // empty — shows empty state
    );

    // The empty state shows a "Link an album" FilledButton — tap it.
    await tester.tap(find.text('Link an album'));
    await tester.pump();

    expect(callCount, 1);
  });
}
