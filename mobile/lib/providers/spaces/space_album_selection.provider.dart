import 'package:collection/collection.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

/// Mirrors the web `SpaceAlbumMultiSelectManager`'s never-mixed selection
/// semantics minus ranges: mobile has no Shift key, so there is no anchor,
/// `selectRange`, `previewRange`, or `candidates`.
///
/// Kept as pure state (no page/grouping/search knowledge) so Task 14's UI
/// wiring and Task 15's bulk actions can both depend on this provider
/// without either dragging page concerns into it.
final spaceAlbumSelectionProvider = NotifierProvider<SpaceAlbumSelectionNotifier, SpaceAlbumSelection>(
  SpaceAlbumSelectionNotifier.new,
);

/// What kind of item the current selection holds. Selections are never
/// mixed: selecting an item of the other kind replaces the selection
/// wholesale rather than merging (see [SpaceAlbumSelectionNotifier.toggle]).
enum SpaceAlbumSelectionKind { none, album, folder }

class SpaceAlbumSelection {
  final SpaceAlbumSelectionKind kind;
  final Set<String> ids;

  const SpaceAlbumSelection({required this.kind, required this.ids});

  const SpaceAlbumSelection.empty() : kind = SpaceAlbumSelectionKind.none, ids = const {};

  bool get isEmpty => ids.isEmpty;

  int get count => ids.length;

  @override
  String toString() => 'SpaceAlbumSelection(kind: $kind, ids: $ids)';

  @override
  bool operator ==(covariant SpaceAlbumSelection other) {
    if (identical(this, other)) {
      return true;
    }
    final setEquals = const DeepCollectionEquality().equals;

    return other.kind == kind && setEquals(other.ids, ids);
  }

  @override
  int get hashCode => kind.hashCode ^ const DeepCollectionEquality().hash(ids);
}

class SpaceAlbumSelectionNotifier extends Notifier<SpaceAlbumSelection> {
  @override
  SpaceAlbumSelection build() => const SpaceAlbumSelection.empty();

  /// Toggles [id] of kind [kind] in or out of the selection.
  ///
  /// Never-mixed: if the current selection holds a different kind, that
  /// selection is replaced wholesale (not merged) before applying the
  /// toggle. Removing the last selected id resets [SpaceAlbumSelection.kind]
  /// back to [SpaceAlbumSelectionKind.none].
  void toggle(SpaceAlbumSelectionKind kind, String id) {
    final sameKind = state.kind == kind;
    final ids = Set<String>.of(sameKind ? state.ids : <String>{});

    if (!ids.add(id)) {
      ids.remove(id);
    }

    state = SpaceAlbumSelection(kind: ids.isEmpty ? SpaceAlbumSelectionKind.none : kind, ids: ids);
  }

  /// Drops ids that are no longer present in [presentIds] (e.g. an item was
  /// moved, deleted, or filtered out of view). Resets `kind` to `none` if
  /// this empties the selection.
  void reconcile(Iterable<String> presentIds) {
    final present = presentIds.toSet();
    final ids = state.ids.where(present.contains).toSet();

    state = SpaceAlbumSelection(kind: ids.isEmpty ? SpaceAlbumSelectionKind.none : state.kind, ids: ids);
  }

  void clear() {
    state = const SpaceAlbumSelection.empty();
  }
}
