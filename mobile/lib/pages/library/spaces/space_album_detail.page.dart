import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/space_album.model.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/presentation/widgets/spaces/space_album_bottom_sheet.widget.dart';
import 'package:immich_mobile/presentation/widgets/spaces/space_album_dialogs.dart';
import 'package:immich_mobile/presentation/widgets/spaces/space_album_kebab.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_route_scope.dart';
import 'package:immich_mobile/providers/background_sync.provider.dart';
import 'package:immich_mobile/presentation/widgets/spaces/space_album_empty_state.widget.dart';
import 'package:immich_mobile/providers/infrastructure/space_album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/space_album_actions.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:immich_mobile/repositories/shared_space_api.repository.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/widgets/common/immich_toast.dart';

/// Space Album detail page — pushes a `TimelineRouteScope + Timeline` scoped
/// to a single shared-space album.
///
/// Route params:
///   [spaceId]  — the parent shared space.
///   [albumId]  — the specific album to display.
///   [canEdit]  — true for Owner/Editor role; drives kebab and bottom-sheet
///                gating (space role, NOT album ownership — see D3).
///
/// B6: mutations (Add photos, Show/Hide in timeline, Unlink) are wired to the
/// real REST calls via [SpaceAlbumActions] + sync-nudge.
@RoutePage()
class SpaceAlbumDetailPage extends ConsumerStatefulWidget {
  final String spaceId;
  final String albumId;
  final bool canEdit;

  const SpaceAlbumDetailPage({super.key, required this.spaceId, required this.albumId, required this.canEdit});

  @override
  ConsumerState<SpaceAlbumDetailPage> createState() => _SpaceAlbumDetailPageState();
}

class _SpaceAlbumDetailPageState extends ConsumerState<SpaceAlbumDetailPage> {
  String? _spaceName;

  @override
  void initState() {
    super.initState();
    _loadSpaceName();
  }

  Future<void> _loadSpaceName() async {
    try {
      final space = await ref.read(sharedSpaceApiRepositoryProvider).get(widget.spaceId);
      if (mounted) {
        setState(() => _spaceName = space.name);
      }
    } catch (_) {
      // Best-effort — the subtitle simply won't render until the name loads.
    }
  }

  /// Add photos to this album by pushing the asset-selection timeline, then
  /// calling the server-only add path (D3 — server enforces space-editor
  /// permission), then nudging sync.
  ///
  /// Routes through [SpaceAlbumActions.addAssets] (REST add only, no local
  /// `remote_album_asset` junction write) so an absorbed linked album — one
  /// with no local `remote_album` row — does not hit the junction FK and
  /// surface a false "Failed to add photos" toast (mobile F1).
  Future<void> _addPhotos() async {
    final newAssets = await context.pushRoute<Set<BaseAsset>>(DriftAssetSelectionTimelineRoute());
    if (newAssets == null || newAssets.isEmpty) return;

    // Filter to remote assets only (local assets can't be added to a space
    // album via the REST endpoint — the server requires remote asset ids).
    final remoteAssetIds = newAssets.whereType<RemoteAsset>().map((a) => a.id).toList();
    if (remoteAssetIds.isEmpty) return;

    try {
      final count = await ref.read(spaceAlbumActionsProvider).addAssets(widget.albumId, remoteAssetIds);
      if (context.mounted && count > 0) {
        ImmichToast.show(
          context: context,
          msg: 'space_album_add_photos_success'.t(context: context, args: {'count': count.toString()}),
          toastType: ToastType.success,
        );
      }
    } catch (_) {
      if (context.mounted) {
        ImmichToast.show(
          context: context,
          msg: 'space_album_add_photos_failed'.t(context: context),
          toastType: ToastType.error,
        );
      }
    }
  }

  Future<void> _toggleTimeline() async {
    final albumsAsync = ref.read(spaceAlbumsProvider(widget.spaceId));
    final album = albumsAsync.valueOrNull?.where((a) => a.id == widget.albumId).firstOrNull;
    if (album == null) return;

    try {
      await ref
          .read(spaceAlbumActionsProvider)
          .toggleTimeline(widget.spaceId, widget.albumId, current: album.showInTimeline);
      if (context.mounted) {
        ImmichToast.show(
          context: context,
          msg: album.showInTimeline
              ? 'space_album_timeline_hidden'.t(context: context)
              : 'space_album_timeline_shown'.t(context: context),
          toastType: ToastType.success,
        );
      }
    } catch (_) {
      if (context.mounted) {
        ImmichToast.show(
          context: context,
          msg: 'space_album_timeline_update_failed'.t(context: context),
          toastType: ToastType.error,
        );
      }
    }
  }

  Future<void> _unlink() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('space_album_unlink_title'.t(context: ctx)),
        content: Text('space_album_unlink_confirmation'.t(context: ctx)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text('cancel'.t(context: ctx)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: Theme.of(ctx).colorScheme.error),
            child: Text('space_album_unlink_action'.t(context: ctx)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ref.read(spaceAlbumActionsProvider).unlink(widget.spaceId, widget.albumId);
      if (context.mounted) {
        ImmichToast.show(
          context: context,
          msg: 'space_album_unlinked_success'.t(context: context),
          toastType: ToastType.success,
        );
        await context.maybePop();
      }
    } catch (_) {
      if (context.mounted) {
        ImmichToast.show(
          context: context,
          msg: 'spaces_linked_albums_error_unlink'.t(context: context),
          toastType: ToastType.error,
        );
      }
    }
  }

  Future<void> _triggerSync() async {
    try {
      await ref.read(backgroundSyncProvider).syncRemote();
    } catch (_) {
      // Non-fatal — sync will catch up on next cycle.
    }
  }

  /// Task 12 — rename this space-linked album from the detail page. `canRename` (space Editor OR
  /// album owner) gates whether the kebab even offers this; the mutation itself has no separate
  /// server-side rename permission narrower than that. Reuses the same dialog shape/keys as
  /// Task 11's album rename on the albums list page via the shared [promptSpaceAlbumName]
  /// (`space_album_dialogs.dart`).
  Future<void> _renameAlbum() async {
    final albumsAsync = ref.read(spaceAlbumsProvider(widget.spaceId));
    final album = albumsAsync.valueOrNull?.where((a) => a.id == widget.albumId).firstOrNull;
    if (album == null) return;

    final name = await promptSpaceAlbumName(
      context,
      title: 'space_album_rename'.t(context: context),
      confirmLabel: 'save'.t(context: context),
      label: 'space_album_name_label'.t(context: context),
      keyPrefix: 'space-album-name',
      initialName: album.name,
    );
    if (name == null || !context.mounted) return;
    try {
      await ref.read(spaceAlbumActionsProvider).renameAlbum(widget.spaceId, widget.albumId, name);
    } catch (_) {
      if (context.mounted) {
        ImmichToast.show(
          context: context,
          msg: 'space_album_error_rename'.t(context: context),
          toastType: ToastType.error,
        );
      }
    }
  }

  /// Task 12 — delete this space-linked album from the detail page. `canDelete` (album ownership
  /// alone, NOT `canEdit`) gates whether the kebab even offers this. Routes through
  /// [SpaceAlbumActions.bulkDeleteAlbums] with a one-element set — it never throws, so success is
  /// simply an empty failed-set. On success pops back to the albums list; on failure shows
  /// `space_album_error_delete` and stays put, mirroring the ambiguity the task brief resolved.
  Future<void> _deleteAlbum() async {
    final albumsAsync = ref.read(spaceAlbumsProvider(widget.spaceId));
    final album = albumsAsync.valueOrNull?.where((a) => a.id == widget.albumId).firstOrNull;
    if (album == null) return;

    final confirmed = await confirmSpaceAlbumAction(
      context,
      title: 'space_album_delete'.t(context: context),
      content: 'space_album_delete_confirm'.t(context: context, args: {'name': album.name}),
      confirmLabel: 'delete'.t(context: context),
      cancelKey: const Key('space-album-delete-cancel'),
      confirmKey: const Key('space-album-delete-confirm'),
      destructive: true,
    );
    if (!confirmed || !context.mounted) return;

    final failedIds = await ref.read(spaceAlbumActionsProvider).bulkDeleteAlbums(widget.spaceId, {widget.albumId});
    if (failedIds.isEmpty) {
      if (context.mounted) {
        await context.maybePop();
      }
      return;
    }
    if (context.mounted) {
      ImmichToast.show(
        context: context,
        msg: 'space_album_error_delete'.t(context: context),
        toastType: ToastType.error,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final albumsAsync = ref.watch(spaceAlbumsProvider(widget.spaceId));
    final album = albumsAsync.valueOrNull?.where((a) => a.id == widget.albumId).firstOrNull;

    // Task 12 — capability model, distinct from the plain `canEdit` (space role) gate every other
    // affordance above uses: renaming is `canEdit` OR album ownership; deleting is album ownership
    // alone. Fails closed when `album` is null (stream unresolved) via `isOwnedByMe`'s own
    // fail-closed default. Mirrors `_AlbumCard.canRename`/`canDelete` on the albums list page
    // (Task 11).
    final isOwnedByMe = album?.isOwnedByMe ?? false;
    final canRename = widget.canEdit || isOwnedByMe;
    final canDelete = isOwnedByMe;

    return TimelineRouteScope(
      timelineServiceBuilder: (ref, scope, groupBy) => ref
          .watch(timelineFactoryProvider)
          .spaceAlbum(spaceId: widget.spaceId, albumId: widget.albumId, groupBy: groupBy, temporalScope: scope),
      child: Timeline(
        withGroupingPill: true,
        // Without this an empty album opens on a blank screen, which reads as a failed load.
        // Viewers get the same illustration without the call to action they cannot act on.
        emptyWidget: SpaceAlbumEmptyState(onAddPhotos: widget.canEdit ? _addPhotos : null),
        appBar: SpaceAlbumAppBar(
          canEdit: widget.canEdit,
          album: album,
          spaceName: _spaceName,
          onAddPhotos: widget.canEdit ? _addPhotos : () {},
          onToggleTimeline: widget.canEdit ? _toggleTimeline : () {},
          onUnlink: widget.canEdit ? _unlink : () {},
          canRename: canRename,
          canDelete: canDelete,
          onRename: canRename ? _renameAlbum : null,
          onDelete: canDelete ? _deleteAlbum : null,
        ),
        bottomSheet: SpaceAlbumBottomSheet(
          canEdit: widget.canEdit,
          albumId: widget.albumId,
          onRemoved: () async {
            // Nudge sync after the remove-from-album action so assets
            // disappear from Drift without waiting for the next cycle.
            await _triggerSync();
          },
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
    this.spaceName,
    this.onAddPhotos,
    this.onToggleTimeline,
    this.onUnlink,
    this.canRename = false,
    this.canDelete = false,
    this.onRename,
    this.onDelete,
  });

  final bool canEdit;
  final SpaceAlbum? album;

  /// The name of the parent shared space, used for the app bar subtitle.
  /// Null until the space metadata has loaded (subtitle is hidden until then).
  final String? spaceName;

  /// Called when the editor taps "Add photos" in the kebab.
  final VoidCallback? onAddPhotos;

  /// Called when the editor taps "Show/Hide in timeline" in the kebab.
  final VoidCallback? onToggleTimeline;

  /// Called when the editor taps "Unlink from space" in the kebab.
  final VoidCallback? onUnlink;

  /// Task 12 — whether "Rename album" is offered: `canEdit || album.isOwnedByMe`. Defaults to
  /// `false` rather than being required, so pre-existing call sites (this page's own B6 tests)
  /// that never mention rename/delete keep their old canEdit-only behaviour unchanged.
  final bool canRename;

  /// Task 12 — whether "Delete album" is offered: `album.isOwnedByMe` alone, NOT `canEdit`.
  final bool canDelete;

  /// Called when the caller taps "Rename album" in the kebab.
  final VoidCallback? onRename;

  /// Called when the caller taps "Delete album" in the kebab.
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final showSubtitle = album != null && spaceName != null;
    return SliverAppBar(
      floating: true,
      pinned: false,
      title: album != null
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(album!.name),
                if (showSubtitle)
                  Text(
                    [
                      'space_album_photo_count'.t(context: context, args: {'count': album!.assetCount.toString()}),
                      'space_album_in_space'.t(context: context, args: {'space': spaceName!}),
                    ].join(' · '),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            )
          : null,
      actions: [
        SpaceAlbumKebab(
          canEdit: canEdit,
          showInTimeline: album?.showInTimeline ?? true,
          toggleEnabled: album != null,
          onAddPhotos: onAddPhotos ?? () {},
          onToggleTimeline: onToggleTimeline ?? () {},
          onUnlink: onUnlink ?? () {},
          canRename: canRename,
          canDelete: canDelete,
          onRename: onRename,
          onDelete: onDelete,
        ),
      ],
    );
  }
}
