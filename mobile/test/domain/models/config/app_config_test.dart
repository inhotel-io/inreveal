import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/config/app_config.dart';
import 'package:immich_mobile/domain/models/settings_key.dart';
import 'package:immich_mobile/pages/library/spaces/collection_sort.dart';

void main() {
  group('AppConfig spaces & space-albums sort prefs', () {
    test('space-album + spaces sort prefs round-trip and default correctly', () {
      const c = AppConfig();
      expect(c.spaceAlbums.sortMode, SpaceAlbumSortMode.recentlyLinked); // default
      expect(c.spaces.sortMode, SpaceSortMode.recentActivity); // default

      final w = c
          .write(SettingsKey.spaceAlbumsSortMode, SpaceAlbumSortMode.name)
          .write(SettingsKey.spaceAlbumsIsReverse, true)
          .write(SettingsKey.spacesSortMode, SpaceSortMode.members);
      expect(w.read(SettingsKey.spaceAlbumsSortMode), SpaceAlbumSortMode.name);
      expect(w.read(SettingsKey.spaceAlbumsIsReverse), true);
      expect(w.read(SettingsKey.spacesSortMode), SpaceSortMode.members);
    });

    test('spaces isReverse defaults to false and round-trips', () {
      const c = AppConfig();
      expect(c.spaces.isReverse, false);

      final w = c.write(SettingsKey.spacesIsReverse, true);
      expect(w.read(SettingsKey.spacesIsReverse), true);
    });

    // S22
    test('space-album sort still defaults to recentlyLinked', () {
      const c = AppConfig();
      expect(c.spaceAlbums.sortMode, SpaceAlbumSortMode.recentlyLinked);
      expect(c.spaceAlbums.isReverse, false);
    });

    // S23 / S24 — every mode round-trips, including the pre-#966 identifiers
    // (name, photoCount, recentlyUpdated) that must never be renamed.
    test('every space-album sort mode round-trips', () {
      const c = AppConfig();
      for (final mode in SpaceAlbumSortMode.values) {
        final w = c.write(SettingsKey.spaceAlbumsSortMode, mode);
        expect(w.read(SettingsKey.spaceAlbumsSortMode), mode, reason: '${mode.name} did not round-trip');
      }
    });

    test('the persisted identifiers of the pre-existing modes are unchanged', () {
      expect(SpaceAlbumSortMode.name.name, 'name');
      expect(SpaceAlbumSortMode.photoCount.name, 'photoCount');
      expect(SpaceAlbumSortMode.recentlyUpdated.name, 'recentlyUpdated');
      expect(SpaceAlbumSortMode.recentlyLinked.name, 'recentlyLinked');
    });
  });

  group('games config', () {
    test('the reminder defaults to off at 18:00 with no daily recorded', () {
      expect(defaultConfig.read(SettingsKey.gameDailyReminderEnabled), isFalse);
      expect(defaultConfig.read(SettingsKey.gameDailyReminderMinuteOfDay), 18 * 60);
      expect(defaultConfig.read(SettingsKey.gameDailyLastPlayed), isNull);
    });

    test('each games key round-trips through write then read', () {
      expect(
        defaultConfig.write(SettingsKey.gameDailyReminderEnabled, true).read(SettingsKey.gameDailyReminderEnabled),
        isTrue,
      );
      expect(
        defaultConfig
            .write(SettingsKey.gameDailyReminderMinuteOfDay, 9 * 60)
            .read(SettingsKey.gameDailyReminderMinuteOfDay),
        9 * 60,
      );
      expect(
        defaultConfig.write(SettingsKey.gameDailyLastPlayed, '2026-08-18').read(SettingsKey.gameDailyLastPlayed),
        '2026-08-18',
      );
    });

    test('writing one games key leaves the others alone', () {
      final config = defaultConfig.write(SettingsKey.gameDailyReminderEnabled, true);

      expect(config.read(SettingsKey.gameDailyReminderMinuteOfDay), 18 * 60);
      expect(config.read(SettingsKey.gameDailyLastPlayed), isNull);
    });
  });
}
