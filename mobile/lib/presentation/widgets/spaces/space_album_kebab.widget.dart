import 'package:flutter/material.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';

/// Space-role-gated kebab menu for the Space Album detail page.
///
/// Renders [SizedBox.shrink] only when the caller can do NOTHING with this album: [canEdit] is
/// false AND [canRename] is false AND [canDelete] is false. Otherwise renders a [PopupMenuButton]
/// with:
///   - Add photos                          (Key: space-album-kebab-add)      — gated on [canEdit]
///   - Show in timeline / Hide in timeline (Key: space-album-kebab-toggle)   — gated on [canEdit]
///   - Unlink from space                   (Key: space-album-kebab-unlink)  — gated on [canEdit]
///   - Rename album                        (Key: space-album-kebab-rename)  — gated on [canRename]
///   - Delete album                        (Key: space-album-kebab-delete)  — gated on [canDelete]
///
/// [canRename] and [canDelete] are resolved by the caller, NOT derived from [canEdit] here (Task
/// 12): renaming is `canEdit` OR album ownership, deleting is album ownership alone — so a viewer
/// who owns this album (`canEdit:false`) still gets a real menu with Rename/Delete and no
/// Add/Toggle/Unlink, while an editor who does not own it gets Add/Toggle/Unlink/Rename but no
/// Delete.
///
/// The [onAddPhotos], [onToggleTimeline], [onUnlink] callbacks are wired to the real REST calls
/// (B6); [onRename]/[onDelete] are Task 12's rename/delete wiring.
class SpaceAlbumKebab extends StatelessWidget {
  const SpaceAlbumKebab({
    super.key,
    required this.canEdit,
    required this.showInTimeline,
    required this.onAddPhotos,
    required this.onToggleTimeline,
    required this.onUnlink,
    this.toggleEnabled = true,
    this.canRename = false,
    this.canDelete = false,
    this.onRename,
    this.onDelete,
  });

  final bool canEdit;
  final bool showInTimeline;
  final VoidCallback onAddPhotos;
  final VoidCallback onToggleTimeline;
  final VoidCallback onUnlink;

  /// Whether the "Show/Hide in timeline" menu item is interactive.
  ///
  /// Set to [false] while the album stream is unresolved so an editor who
  /// taps the item before metadata loads neither no-ops silently nor triggers
  /// a premature mutation.
  final bool toggleEnabled;

  /// Task 12 — whether "Rename album" is offered. `canEdit || album.isOwnedByMe`, resolved by the
  /// caller (mirrors `_AlbumCard.canRename` on the albums list page, Task 11).
  final bool canRename;

  /// Task 12 — whether "Delete album" is offered. `album.isOwnedByMe`, full stop — unlike every
  /// other item here this is NOT satisfied by [canEdit] alone.
  final bool canDelete;

  final VoidCallback? onRename;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    if (!canEdit && !canRename && !canDelete) return const SizedBox.shrink();

    return PopupMenuButton<_KebabAction>(
      onSelected: (action) {
        switch (action) {
          case _KebabAction.add:
            onAddPhotos();
          case _KebabAction.toggle:
            onToggleTimeline();
          case _KebabAction.unlink:
            onUnlink();
          case _KebabAction.rename:
            onRename?.call();
          case _KebabAction.delete:
            onDelete?.call();
        }
      },
      itemBuilder: (context) => [
        if (canEdit) ...[
          PopupMenuItem<_KebabAction>(
            key: const Key('space-album-kebab-add'),
            value: _KebabAction.add,
            child: Text('add_photos'.t(context: context)),
          ),
          PopupMenuItem<_KebabAction>(
            key: const Key('space-album-kebab-toggle'),
            value: _KebabAction.toggle,
            enabled: toggleEnabled,
            child: Text(
              showInTimeline
                  ? 'spaces_hide_from_timeline'.t(context: context)
                  : 'spaces_linked_albums_show_in_timeline'.t(context: context),
            ),
          ),
          PopupMenuItem<_KebabAction>(
            key: const Key('space-album-kebab-unlink'),
            value: _KebabAction.unlink,
            child: Text('space_album_unlink_from_space'.t(context: context)),
          ),
        ],
        if (canRename)
          PopupMenuItem<_KebabAction>(
            key: const Key('space-album-kebab-rename'),
            value: _KebabAction.rename,
            child: Text('space_album_rename'.t(context: context)),
          ),
        if (canDelete)
          PopupMenuItem<_KebabAction>(
            key: const Key('space-album-kebab-delete'),
            value: _KebabAction.delete,
            child: Text('space_album_delete'.t(context: context)),
          ),
      ],
    );
  }
}

enum _KebabAction { add, toggle, unlink, rename, delete }
