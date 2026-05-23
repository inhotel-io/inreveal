import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/setting.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/models/user.model.dart';
import 'package:immich_mobile/domain/services/setting.service.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';
import 'package:immich_mobile/domain/services/user.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/presentation/pages/drift_asset_selection_timeline.page.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline.widget.dart';
import 'package:immich_mobile/providers/cast.provider.dart';
import 'package:immich_mobile/providers/infrastructure/readonly_mode.provider.dart';
import 'package:immich_mobile/providers/infrastructure/setting.provider.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:immich_mobile/providers/user.provider.dart';
import 'package:immich_mobile/models/cast/cast_manager_state.dart';
import 'package:immich_mobile/services/server_info.service.dart';
import 'package:mocktail/mocktail.dart';

import '../../test_utils.dart';

class _MockTimelineFactory extends Mock implements TimelineFactory {}

class _MockSettingsService extends Mock implements SettingsService {}

class _MockUserService extends Mock implements UserService {}

class _MockServerInfoService extends Mock implements ServerInfoService {}

class _StubCastNotifier extends StateNotifier<CastManagerState> implements CastNotifier {
  _StubCastNotifier()
    : super(
        const CastManagerState(
          isCasting: false,
          receiverName: '',
          castState: CastState.idle,
          currentTime: Duration.zero,
          duration: Duration.zero,
        ),
      );

  @override
  List<(String, CastDestinationType, dynamic)> discovered = const [];

  @override
  Future<void> connect(CastDestinationType type, device) async {}

  @override
  Future<void> disconnect() async {}

  @override
  Future<List<(String, CastDestinationType, dynamic)>> getDevices() async => discovered;

  @override
  void loadMedia(RemoteAsset asset, bool reload) {}

  @override
  void pause() {}

  @override
  void play() {}

  @override
  void seekTo(Duration position) {}

  @override
  void stop() {}

  @override
  void toggle() {}
}

class _StubSettingsNotifier extends SettingsNotifier {
  _StubSettingsNotifier(this._settings);

  final SettingsService _settings;

  @override
  SettingsService build() => _settings;
}

class _StubReadOnlyModeNotifier extends ReadOnlyModeNotifier {
  @override
  bool build() => true;
}

class _StubCurrentUserNotifier extends CurrentUserProvider {
  _StubCurrentUserNotifier(super.service, UserDto user) {
    state = user;
  }
}

UserDto _user(String id) => UserDto(id: id, email: '$id@example.com', name: id, profileChangedAt: DateTime(2024));

void main() {
  late Drift db;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    TestUtils.init();
    db = Drift(drift.DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    await StoreService.init(storeRepository: DriftStoreRepository(db), listenUpdates: false);
  });

  setUp(() async {
    await Store.clear();
    await Store.put(StoreKey.serverEndpoint, 'http://localhost');
  });

  tearDownAll(() async {
    await Store.clear();
    await db.close();
  });

  testWidgets('forces day grouping for remote asset selection factory and timeline', (tester) async {
    final user = _user('user-1');
    final userService = _MockUserService();
    final factory = _MockTimelineFactory();
    final timelineService = TimelineService((
      bucketSource: () => const Stream<List<Bucket>>.empty(),
      assetSource: (offset, count) async => const <BaseAsset>[],
      origin: TimelineOrigin.remoteAssets,
    ));
    final settings = _MockSettingsService();
    final serverInfoService = _MockServerInfoService();

    when(() => userService.tryGetMyUser()).thenReturn(user);
    when(() => userService.watchMyUser()).thenAnswer((_) => const Stream<UserDto?>.empty());
    when(() => factory.remoteAssets(user.id, groupBy: GroupAssetsBy.day)).thenReturn(timelineService);
    when(() => settings.get(Setting.tilesPerRow)).thenReturn(3);
    when(() => settings.get(Setting.enableBackup)).thenReturn(false);
    when(() => settings.watch(Setting.enableBackup)).thenAnswer((_) => Stream.value(false));
    addTearDown(timelineService.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWith((ref) => _StubCurrentUserNotifier(userService, user)),
          readonlyModeProvider.overrideWith(() => _StubReadOnlyModeNotifier()),
          settingsProvider.overrideWith(() => _StubSettingsNotifier(settings)),
          timelineFactoryProvider.overrideWithValue(factory),
          castProvider.overrideWith((ref) => _StubCastNotifier()),
          serverInfoServiceProvider.overrideWithValue(serverInfoService),
        ],
        child: const MaterialApp(home: DriftAssetSelectionTimelinePage()),
      ),
    );

    verify(() => factory.remoteAssets(user.id, groupBy: GroupAssetsBy.day)).called(1);
    expect(DriftAssetSelectionTimelinePage.forcedGroupBy, GroupAssetsBy.day);
    expect(tester.widget<Timeline>(find.byType(Timeline)).groupBy, GroupAssetsBy.day);
  });
}
