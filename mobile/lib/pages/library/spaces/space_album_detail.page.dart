import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/space_album.model.dart';
import 'package:immich_mobile/presentation/widgets/spaces/space_album_bottom_sheet.widget.dart';
import 'package:immich_mobile/presentation/widgets/spaces/space_album_kebab.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_route_scope.dart';
import 'package:immich_mobile/providers/infrastructure/space_album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';

/// Space Album detail page — pushes a `TimelineRouteScope + Timeline` scoped
/// to a single shared-space album.
///
/// Route params:
///   [spaceId]  — the parent shared space.
///   [albumId]  — the specific album to display.
///   [canEdit]  — true for Owner/Editor role; drives kebab and bottom-sheet
///                gating (space role, NOT album ownership — see D3).
///
/// Mutations (Add photos, Show/Hide in timeline, Unlink) are no-op stubs —
/// B6 supplies the real REST calls.
@RoutePage()
class SpaceAlbumDetailPage extends ConsumerWidget {
  final String spaceId;
  final String albumId;
  final bool canEdit;

  const SpaceAlbumDetailPage({
    super.key,
    required this.spaceId,
    required this.albumId,
    required this.canEdit,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final albumsAsync = ref.watch(spaceAlbumsProvider(spaceId));
    final album = albumsAsync.valueOrNull?.where((a) => a.id == albumId).firstOrNull;

    return TimelineRouteScope(
      timelineServiceBuilder: (ref, scope, groupBy) => ref.watch(timelineFactoryProvider).spaceAlbum(
        spaceId: spaceId,
        albumId: albumId,
        groupBy: groupBy,
        temporalScope: scope,
      ),
      child: Timeline(
        withGroupingPill: true,
        appBar: SpaceAlbumAppBar(
          canEdit: canEdit,
          album: album,
        ),
        bottomSheet: SpaceAlbumBottomSheet(
          canEdit: canEdit,
          albumId: albumId,
        ),
      ),
    );
  }
}

/// Extracted SliverAppBar + [SpaceAlbumKebab] sub-widget.
///
/// Exposed as a named (non-private) class so widget tests can pump it in
/// isolation without needing the full [Timeline] + [TimelineRouteScope]
/// plumbing.
class SpaceAlbumAppBar extends StatelessWidget {
  const SpaceAlbumAppBar({
    super.key,
    required this.canEdit,
    this.album,
  });

  final bool canEdit;
  final SpaceAlbum? album;

  @override
  Widget build(BuildContext context) {
    return SliverAppBar(
      floating: true,
      pinned: false,
      title: album != null ? Text(album!.name) : null,
      actions: [
        SpaceAlbumKebab(
          canEdit: canEdit,
          showInTimeline: album?.showInTimeline ?? true,
          onAddPhotos: () {}, // B6 stub
          onToggleTimeline: () {}, // B6 stub
          onUnlink: () {}, // B6 stub
        ),
      ],
    );
  }
}
