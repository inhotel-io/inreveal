import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/providers/spaces/space_album_selection.provider.dart';

/// Stands in for an unrelated part of the provider graph, used only to
/// prove (E-17) that the selection provider's state is not reset by
/// activity elsewhere in the graph — only by explicit calls on its own
/// notifier.
final _someUnrelatedProvider = Provider<int>((ref) => 0);

void main() {
  late ProviderContainer container;
  late SpaceAlbumSelectionNotifier notifier;

  setUp(() {
    container = ProviderContainer();
    addTearDown(container.dispose);
    notifier = container.read(spaceAlbumSelectionProvider.notifier);
  });

  group('initial state', () {
    test('starts empty with kind none', () {
      final state = container.read(spaceAlbumSelectionProvider);
      expect(state.kind, SpaceAlbumSelectionKind.none);
      expect(state.ids, isEmpty);
      expect(state.isEmpty, isTrue);
      expect(state.count, 0);
    });
  });

  group('toggle', () {
    test('toggling an album selects it', () {
      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');

      final state = container.read(spaceAlbumSelectionProvider);
      expect(state.kind, SpaceAlbumSelectionKind.album);
      expect(state.ids, {'a'});
      expect(state.isEmpty, isFalse);
      expect(state.count, 1);
    });

    test('toggling a second album adds to the selection', () {
      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
      notifier.toggle(SpaceAlbumSelectionKind.album, 'b');

      final state = container.read(spaceAlbumSelectionProvider);
      expect(state.ids, {'a', 'b'});
      expect(state.count, 2);
    });

    test('selecting a folder replaces an album selection', () {
      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
      notifier.toggle(SpaceAlbumSelectionKind.album, 'b');
      // Positive control: the pre-switch selection is genuinely non-trivial,
      // so the assertions below prove replacement, not a vacuous no-op.
      expect(container.read(spaceAlbumSelectionProvider).ids.length, 2);
      expect(container.read(spaceAlbumSelectionProvider).kind, SpaceAlbumSelectionKind.album);

      notifier.toggle(SpaceAlbumSelectionKind.folder, 'f');

      final state = container.read(spaceAlbumSelectionProvider);
      expect(state.kind, SpaceAlbumSelectionKind.folder);
      expect(state.ids, {'f'});
    });

    test('selecting an album replaces a folder selection', () {
      notifier.toggle(SpaceAlbumSelectionKind.folder, 'f1');
      notifier.toggle(SpaceAlbumSelectionKind.folder, 'f2');
      expect(container.read(spaceAlbumSelectionProvider).ids.length, 2); // positive control
      expect(container.read(spaceAlbumSelectionProvider).kind, SpaceAlbumSelectionKind.folder);

      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');

      final state = container.read(spaceAlbumSelectionProvider);
      expect(state.kind, SpaceAlbumSelectionKind.album);
      expect(state.ids, {'a'});
    });

    test('toggling the last item empties the selection and resets kind', () {
      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
      expect(container.read(spaceAlbumSelectionProvider).isEmpty, isFalse); // positive control

      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');

      final state = container.read(spaceAlbumSelectionProvider);
      expect(state.isEmpty, isTrue);
      expect(state.count, 0);
      expect(state.kind, SpaceAlbumSelectionKind.none);
    });

    test('toggling one of several selected items off leaves the rest and the kind intact', () {
      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
      notifier.toggle(SpaceAlbumSelectionKind.album, 'b');
      expect(container.read(spaceAlbumSelectionProvider).ids, {'a', 'b'}); // positive control

      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');

      final state = container.read(spaceAlbumSelectionProvider);
      expect(state.ids, {'b'});
      expect(state.kind, SpaceAlbumSelectionKind.album);
    });
  });

  group('reconcile', () {
    // E-5
    test('drops ids that no longer exist', () {
      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
      notifier.toggle(SpaceAlbumSelectionKind.album, 'b');
      expect(container.read(spaceAlbumSelectionProvider).ids, {'a', 'b'}); // positive control

      notifier.reconcile({'b'});

      final state = container.read(spaceAlbumSelectionProvider);
      expect(state.ids, {'b'});
      expect(state.kind, SpaceAlbumSelectionKind.album);
    });

    test('resets kind to none when it empties the selection', () {
      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
      final before = container.read(spaceAlbumSelectionProvider);
      expect(before.isEmpty, isFalse); // positive control
      expect(before.kind, SpaceAlbumSelectionKind.album); // positive control

      notifier.reconcile({'z'});

      final state = container.read(spaceAlbumSelectionProvider);
      expect(state.isEmpty, isTrue);
      expect(state.count, 0);
      expect(state.kind, SpaceAlbumSelectionKind.none);
    });

    test('keeps the selection untouched when every id is still present', () {
      notifier.toggle(SpaceAlbumSelectionKind.folder, 'f1');
      notifier.toggle(SpaceAlbumSelectionKind.folder, 'f2');

      notifier.reconcile({'f1', 'f2', 'f3'});

      final state = container.read(spaceAlbumSelectionProvider);
      expect(state.ids, {'f1', 'f2'});
      expect(state.kind, SpaceAlbumSelectionKind.folder);
    });

    // I-1: reconciling against an empty page (every album/folder deleted or
    // filtered away) must not leave a stale selection behind — Task 15
    // would otherwise send those ids in a bulk-action payload against items
    // that no longer exist.
    test('reconcile with an empty list empties the selection', () {
      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
      notifier.toggle(SpaceAlbumSelectionKind.album, 'b');
      final before = container.read(spaceAlbumSelectionProvider);
      expect(before.isEmpty, isFalse); // positive control
      expect(before.kind, SpaceAlbumSelectionKind.album); // positive control

      notifier.reconcile(<String>[]);

      final state = container.read(spaceAlbumSelectionProvider);
      expect(state.isEmpty, isTrue);
      expect(state.count, 0);
      expect(state.kind, SpaceAlbumSelectionKind.none);
      expect(state.ids, isEmpty);
    });
  });

  group('clear', () {
    test('empties the selection and resets kind', () {
      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
      notifier.toggle(SpaceAlbumSelectionKind.album, 'b');
      final before = container.read(spaceAlbumSelectionProvider);
      expect(before.isEmpty, isFalse); // positive control
      expect(before.kind, SpaceAlbumSelectionKind.album); // positive control

      notifier.clear();

      final state = container.read(spaceAlbumSelectionProvider);
      expect(state.isEmpty, isTrue);
      expect(state.count, 0);
      expect(state.kind, SpaceAlbumSelectionKind.none);
      expect(state.ids, isEmpty);
    });
  });

  group('notifications', () {
    // I-2: `container.read(...)` alone can't tell an in-place Set mutation
    // (no listener fires, so a widget rebuild never happens) apart from a
    // real `state = ...` reassignment (fires a notification) — both leave
    // the same content behind for a subsequent `read`. Riverpod's Notifier
    // only notifies on assignment, so growing/shrinking a selection within
    // one kind must go through `state = ...`, not a mutation of the
    // existing Set, or Task 14's selection bar and card highlighting would
    // freeze on real widget rebuilds while this suite stayed green.
    test('adding another id within the same kind notifies listeners', () {
      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');

      var notifications = 0;
      container.listen<SpaceAlbumSelection>(
        spaceAlbumSelectionProvider,
        (_, __) => notifications++,
        fireImmediately: false,
      );

      notifier.toggle(SpaceAlbumSelectionKind.album, 'b');

      expect(notifications, 1);
      expect(container.read(spaceAlbumSelectionProvider).ids, {'a', 'b'}); // proves the call actually did something
    });

    test('removing one of several ids within the same kind notifies listeners', () {
      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');
      notifier.toggle(SpaceAlbumSelectionKind.album, 'b');

      var notifications = 0;
      container.listen<SpaceAlbumSelection>(
        spaceAlbumSelectionProvider,
        (_, __) => notifications++,
        fireImmediately: false,
      );

      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');

      expect(notifications, 1);
      expect(container.read(spaceAlbumSelectionProvider).ids, {'b'}); // proves the call actually did something
    });
  });

  group('rebuild persistence', () {
    // E-17: selection is page state, so it survives a rebuild.
    test('selection survives an unrelated provider refresh', () {
      notifier.toggle(SpaceAlbumSelectionKind.album, 'a');

      container.refresh(_someUnrelatedProvider);

      final state = container.read(spaceAlbumSelectionProvider);
      expect(state.ids, {'a'});
      expect(state.kind, SpaceAlbumSelectionKind.album);
    });
  });
}
