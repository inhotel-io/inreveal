import 'package:flutter/material.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';

/// The one implementation of the space-album name prompt and confirm dialog,
/// shared by the albums list page and the album detail page.
///
/// These lived twice — once private to each page — because Dart's underscore
/// privacy is per library file. The cost of that duplication was concrete: the
/// `Delete ""?` defect was fixed on one surface and stayed live on the other.

/// Prompts for a name and returns it trimmed, or `null` if the user cancelled
/// or left it blank. A blank name is "nothing to do" rather than an error, so
/// callers never fire a doomed API call.
///
/// [label] and [keyPrefix] are caller-supplied, not hardcoded, so this one
/// dialog serves both the album prompts (`space-album-name`) and the folder
/// prompts (`space-album-folder-name`) without their widget keys colliding.
///
/// The three ALBUM call sites — the albums list page's "New album" and
/// "Rename album", plus the album detail page's rename — pass
/// `space_album_name_label`/`space-album-name`; the two FOLDER ones (both on
/// the albums list page, "New folder" and "Rename folder") keep
/// `space_album_folder_name_label`/`space-album-folder-name`.
Future<String?> promptSpaceAlbumName(
  BuildContext context, {
  required String title,
  required String confirmLabel,
  required String label,
  required String keyPrefix,
  String initialName = '',
}) async {
  final name = await showDialog<String>(
    context: context,
    builder: (_) => SpaceAlbumNameDialog(
      title: title,
      confirmLabel: confirmLabel,
      label: label,
      keyPrefix: keyPrefix,
      initialName: initialName,
    ),
  );
  if (name == null || name.isEmpty) return null;
  return name;
}

/// The dialog body for [promptSpaceAlbumName].
///
/// A **StatefulWidget**, not a function building a [TextEditingController]
/// inline: the controller must be disposed when this widget unmounts, not when
/// `showDialog` resolves. The pop is animated, so the [TextFormField] is still
/// in the tree and still rebuilding for a moment after the awaited future
/// completes. Disposing there crashes with "A TextEditingController was used
/// after being disposed."
class SpaceAlbumNameDialog extends StatefulWidget {
  const SpaceAlbumNameDialog({
    super.key,
    required this.title,
    required this.confirmLabel,
    required this.label,
    required this.keyPrefix,
    this.initialName = '',
  });

  final String title;
  final String confirmLabel;

  /// The text field's label — e.g. "Folder name" or "Album name".
  final String label;

  /// Base for this dialog's widget keys: `$keyPrefix-field` / `-cancel` / `-confirm`.
  final String keyPrefix;
  final String initialName;

  @override
  State<SpaceAlbumNameDialog> createState() => _SpaceAlbumNameDialogState();
}

class _SpaceAlbumNameDialogState extends State<SpaceAlbumNameDialog> {
  late final TextEditingController _controller = TextEditingController(text: widget.initialName);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: TextFormField(
          key: Key('${widget.keyPrefix}-field'),
          controller: _controller,
          autofocus: true,
          decoration: InputDecoration(labelText: widget.label),
          onFieldSubmitted: (value) => Navigator.of(context).pop(value.trim()),
        ),
      ),
      actions: [
        TextButton(
          key: Key('${widget.keyPrefix}-cancel'),
          onPressed: () => Navigator.of(context).pop(null),
          child: Text('cancel'.t(context: context)),
        ),
        TextButton(
          key: Key('${widget.keyPrefix}-confirm'),
          onPressed: () => Navigator.of(context).pop(_controller.text.trim()),
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}

/// Confirms a destructive or bulk album action. Returns `true` only on an
/// explicit confirm. Parameterised because callers differ in copy, widget keys
/// and whether the confirm button is error-tinted.
Future<bool> confirmSpaceAlbumAction(
  BuildContext context, {
  required String title,
  required String content,
  required String confirmLabel,
  required Key cancelKey,
  required Key confirmKey,
  bool destructive = false,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(content),
      actions: [
        TextButton(
          key: cancelKey,
          onPressed: () => Navigator.of(ctx).pop(false),
          child: Text('cancel'.t(context: ctx)),
        ),
        TextButton(
          key: confirmKey,
          onPressed: () => Navigator.of(ctx).pop(true),
          style: destructive ? TextButton.styleFrom(foregroundColor: Theme.of(ctx).colorScheme.error) : null,
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return confirmed == true;
}
