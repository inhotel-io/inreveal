import 'package:flutter/material.dart';

/// Space-role-gated kebab menu for the Space Album detail page.
///
/// When [canEdit] is false, renders [SizedBox.shrink] (no menu).
/// When [canEdit] is true, renders a [PopupMenuButton] with exactly 3 items:
///   - Add photos   (Key: space-album-kebab-add)
///   - Show in timeline / Hide from timeline  (Key: space-album-kebab-toggle)
///   - Unlink from space  (Key: space-album-kebab-unlink)
///
/// The [onAddPhotos], [onToggleTimeline], [onUnlink] callbacks are B6 stubs —
/// they are no-ops in B4.
class SpaceAlbumKebab extends StatelessWidget {
  const SpaceAlbumKebab({
    super.key,
    required this.canEdit,
    required this.showInTimeline,
    required this.onAddPhotos,
    required this.onToggleTimeline,
    required this.onUnlink,
  });

  final bool canEdit;
  final bool showInTimeline;
  final VoidCallback onAddPhotos;
  final VoidCallback onToggleTimeline;
  final VoidCallback onUnlink;

  @override
  Widget build(BuildContext context) {
    if (!canEdit) return const SizedBox.shrink();

    return PopupMenuButton<_KebabAction>(
      onSelected: (action) {
        switch (action) {
          case _KebabAction.add:
            onAddPhotos();
          case _KebabAction.toggle:
            onToggleTimeline();
          case _KebabAction.unlink:
            onUnlink();
        }
      },
      itemBuilder: (context) => [
        const PopupMenuItem<_KebabAction>(
          key: Key('space-album-kebab-add'),
          value: _KebabAction.add,
          child: Text('Add photos'),
        ),
        PopupMenuItem<_KebabAction>(
          key: const Key('space-album-kebab-toggle'),
          value: _KebabAction.toggle,
          child: Text(showInTimeline ? 'Hide from timeline' : 'Show in timeline'),
        ),
        const PopupMenuItem<_KebabAction>(
          key: Key('space-album-kebab-unlink'),
          value: _KebabAction.unlink,
          child: Text('Unlink from space'),
        ),
      ],
    );
  }
}

enum _KebabAction { add, toggle, unlink }
