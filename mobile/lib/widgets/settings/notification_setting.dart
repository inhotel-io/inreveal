import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/settings_key.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/providers/game/daily_reminder.provider.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';
import 'package:immich_mobile/providers/permission.provider.dart';
import 'package:immich_mobile/widgets/settings/settings_button_list_tile.dart';
import 'package:immich_mobile/widgets/settings/settings_sub_page_scaffold.dart';
import 'package:immich_mobile/widgets/settings/settings_switch_list_tile.dart';
import 'package:permission_handler/permission_handler.dart';

String _formatMinuteOfDay(int minuteOfDay) =>
    '${(minuteOfDay ~/ 60).toString().padLeft(2, '0')}:${(minuteOfDay % 60).toString().padLeft(2, '0')}';

class NotificationSetting extends HookConsumerWidget {
  const NotificationSetting({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final permissionService = ref.watch(notificationPermissionProvider);
    final hasPermission = permissionService == PermissionStatus.granted;

    final reminderEnabled = useValueNotifier(ref.read(appConfigProvider).read(SettingsKey.gameDailyReminderEnabled));
    final reminderMinute = useValueNotifier(ref.read(appConfigProvider).read(SettingsKey.gameDailyReminderMinuteOfDay));

    openAppNotificationSettings(BuildContext ctx) {
      ctx.pop();
      openAppSettings();
    }

    // When permissions are permanently denied, you need to go to settings to
    // allow them
    showPermissionsDialog() {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          content: const Text('notification_permission_dialog_content').tr(),
          actions: [
            TextButton(child: const Text('cancel').tr(), onPressed: () => ctx.pop()),
            TextButton(onPressed: () => openAppNotificationSettings(ctx), child: const Text('settings').tr()),
          ],
        ),
      );
    }

    final notificationSettings = [
      if (!hasPermission)
        SettingsButtonListTile(
          icon: Icons.notifications_outlined,
          title: 'notification_permission_list_tile_title'.tr(),
          subtileText: 'notification_permission_list_tile_content'.tr(),
          buttonText: 'notification_permission_list_tile_enable_button'.tr(),
          onButtonTap: () =>
              ref.watch(notificationPermissionProvider.notifier).requestNotificationPermission().then((permission) {
                if (permission == PermissionStatus.permanentlyDenied) {
                  showPermissionsDialog();
                }
              }),
        )
      else
        SettingsButtonListTile(
          icon: Icons.notifications_active_outlined,
          title: 'notification_enabled_list_tile_title'.tr(),
          subtileText: 'notification_enabled_list_tile_content'.tr(),
          buttonText: 'notification_enabled_list_tile_open_button'.tr(),
          onButtonTap: () => openAppSettings(),
        ),
      // Local state only, and deliberately no network read: this page must open offline. What is
      // gated on space membership is the SCHEDULING, not this row — see
      // DailyReminderController.refresh.
      SettingsSwitchListTile(
        key: const Key('daily-reminder-toggle'),
        valueNotifier: reminderEnabled,
        title: 'game_daily_reminder_title'.tr(),
        subtitle: 'game_daily_reminder_subtitle'.tr(),
        onChanged: (value) async {
          await ref.read(settingsProvider).write(SettingsKey.gameDailyReminderEnabled, value);
          await ref.read(dailyReminderProvider).refresh();
        },
      ),
      ListTile(
        key: const Key('daily-reminder-time'),
        title: Text('game_daily_reminder_time'.tr()),
        trailing: Text(_formatMinuteOfDay(reminderMinute.value)),
        onTap: () async {
          final picked = await showTimePicker(
            context: context,
            initialTime: TimeOfDay(hour: reminderMinute.value ~/ 60, minute: reminderMinute.value % 60),
          );
          if (picked == null) return;
          reminderMinute.value = picked.hour * 60 + picked.minute;
          await ref.read(settingsProvider).write(SettingsKey.gameDailyReminderMinuteOfDay, reminderMinute.value);
          await ref.read(dailyReminderProvider).refresh();
        },
      ),
    ];

    return SettingsSubPageScaffold(settings: notificationSettings);
  }
}
