import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/constants/enums.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/space_album.model.dart';
import 'package:immich_mobile/providers/infrastructure/action.provider.dart';
import 'package:immich_mobile/providers/infrastructure/space_album_actions.dart';
import 'package:immich_mobile/providers/timeline/multiselect.provider.dart';
import 'package:immich_mobile/repositories/shared_space_api.repository.dart';
import 'package:mocktail/mocktail.dart';
import 'package:openapi/api.dart';

class MockSharedSpaceApiRepository extends Mock implements SharedSpaceApiRepository {}

class MockSpaceAlbumActions extends Mock implements SpaceAlbumActions {}

void main() {
  late MockSharedSpaceApiRepository spaceRepo;
  late MockSpaceAlbumActions albumActions;
  late ProviderContainer container;

  SharedSpaceResponseDto theSpace() => SharedSpaceResponseDto(
    id: 'space-1',
    name: 'Family',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdById: 'user-1',
  );

  SpaceAlbum theAlbum() => SpaceAlbum(
    id: 'album-1',
    name: 'Ski trip',
    showInTimeline: true,
    linkedAt: DateTime(2026, 1, 1),
    updatedAt: DateTime(2026, 1, 1),
  );

  RemoteAsset remote(String id) => RemoteAsset(
    id: id,
    name: id,
    ownerId: 'user-1',
    checksum: id,
    type: AssetType.image,
    createdAt: DateTime(2026, 1, 1),
    updatedAt: DateTime(2026, 1, 1),
    isEdited: false,
  );

  /// Seeds the timeline multiselect so `_getAssets(timeline)` sees them. The notifier
  /// only exposes `selectAsset` (one at a time) -- there is no bulk setter.
  void select(Iterable<BaseAsset> assets) {
    final notifier = container.read(multiSelectProvider.notifier);
    for (final asset in assets) {
      notifier.selectAsset(asset);
    }
  }

  setUpAll(() {
    registerFallbackValue(<String>[]);
  });

  setUp(() {
    spaceRepo = MockSharedSpaceApiRepository();
    albumActions = MockSpaceAlbumActions();
    when(() => spaceRepo.addAssets(any(), any())).thenAnswer((_) async {});
    when(() => albumActions.addAssets(any(), any())).thenAnswer((_) async => 2);
    container = ProviderContainer(
      overrides: [
        sharedSpaceApiRepositoryProvider.overrideWithValue(spaceRepo),
        spaceAlbumActionsProvider.overrideWithValue(albumActions),
      ],
    );
    addTearDown(container.dispose);
  });

  test('a space pool add sends every id in ONE call', () async {
    select([remote('a'), remote('b')]);

    final result = await container.read(actionProvider.notifier).addToSpace(ActionSource.timeline, theSpace());

    final captured = verify(() => spaceRepo.addAssets('space-1', captureAny())).captured.single as List<String>;
    expect(captured..sort(), ['a', 'b']);
    expect(result.success, isTrue);
  });

  test('a space pool add reports the REQUEST length, because the endpoint returns no body', () async {
    select([remote('a'), remote('b'), remote('c')]);

    final result = await container.read(actionProvider.notifier).addToSpace(ActionSource.timeline, theSpace());

    expect(result.count, 3);
  });

  test('a space album add reports the SERVER count, so duplicates are not over-claimed', () async {
    when(() => albumActions.addAssets(any(), any())).thenAnswer((_) async => 0);
    select([remote('a'), remote('b')]);

    final result = await container
        .read(actionProvider.notifier)
        .addToSpaceAlbum(ActionSource.timeline, 'space-1', theAlbum());

    expect(result.count, 0, reason: 'all already present -- do not claim "added 2"');
    expect(result.success, isTrue);
  });

  test('a space album add never touches the space pool endpoint', () async {
    select([remote('a')]);

    await container.read(actionProvider.notifier).addToSpaceAlbum(ActionSource.timeline, 'space-1', theAlbum());

    verify(() => albumActions.addAssets('album-1', any())).called(1);
    verifyNever(() => spaceRepo.addAssets(any(), any()));
  });

  test('an empty selection makes no call and succeeds with zero', () async {
    select([]);

    final result = await container.read(actionProvider.notifier).addToSpace(ActionSource.timeline, theSpace());

    expect(result.count, 0);
    expect(result.success, isTrue);
    verifyNever(() => spaceRepo.addAssets(any(), any()));
  });

  test('a failed add returns a failure AND leaves the selection intact for retry', () async {
    when(() => spaceRepo.addAssets(any(), any())).thenThrow(Exception('403'));
    select([remote('a')]);

    final result = await container.read(actionProvider.notifier).addToSpace(ActionSource.timeline, theSpace());

    expect(result.success, isFalse);
    expect(container.read(multiSelectProvider).selectedAssets, isNotEmpty);
  });

  test('a successful add clears the selection', () async {
    select([remote('a')]);

    await container.read(actionProvider.notifier).addToSpace(ActionSource.timeline, theSpace());

    expect(container.read(multiSelectProvider).selectedAssets, isEmpty);
  });

  test('a second add while one is in flight is ignored', () async {
    final gate = Completer<void>();
    when(() => spaceRepo.addAssets(any(), any())).thenAnswer((_) => gate.future);
    select([remote('a')]);

    final notifier = container.read(actionProvider.notifier);
    final first = notifier.addToSpace(ActionSource.timeline, theSpace());
    final second = await notifier.addToSpace(ActionSource.timeline, theSpace());

    expect(second.success, isFalse);
    gate.complete();
    await first;

    verify(() => spaceRepo.addAssets(any(), any())).called(1);
  });
}
