import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';

/// One quick date-range preset (Today / This week / This month / This year).
class WhenPreset {
  final String key;
  final String label;
  final DateTime start;
  final DateTime end;
  const WhenPreset({required this.key, required this.label, required this.start, required this.end});
}

/// The four quick-range presets relative to [now]. [keyPrefix] namespaces the
/// pill widget keys the tests pin — `when-pill` on the Browse strip,
/// `when-picker-pill` in the When picker.
List<WhenPreset> whenPresets(DateTime now, {required String keyPrefix}) => [
  WhenPreset(
    key: '$keyPrefix-today',
    label: 'filter_sheet_when_today',
    start: DateTime(now.year, now.month, now.day),
    end: DateTime(now.year, now.month, now.day, 23, 59, 59),
  ),
  WhenPreset(
    key: '$keyPrefix-week',
    label: 'filter_sheet_when_week',
    start: DateTime(now.year, now.month, now.day - now.weekday + 1),
    end: now,
  ),
  WhenPreset(
    key: '$keyPrefix-month',
    label: 'filter_sheet_when_month',
    start: DateTime(now.year, now.month, 1),
    end: now,
  ),
  WhenPreset(key: '$keyPrefix-year', label: 'filter_sheet_when_year', start: DateTime(now.year, 1, 1), end: now),
];

/// True when the active date filter is (day-granular) the given preset.
bool whenPresetMatches(SearchDateFilter date, WhenPreset preset) {
  final a = date.takenAfter;
  final b = date.takenBefore;
  if (a == null || b == null) return false;
  bool sameDay(DateTime x, DateTime y) => x.year == y.year && x.month == y.month && x.day == y.day;
  return sameDay(a, preset.start) && sameDay(b, preset.end);
}

/// Tappable pill for a [WhenPreset]; applies the preset's range on tap.
class WhenPresetPill extends ConsumerWidget {
  final WhenPreset preset;
  final bool selected;
  const WhenPresetPill({super.key, required this.preset, required this.selected});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Material(
      key: Key(preset.key),
      color: selected ? theme.colorScheme.primary.withValues(alpha: 0.14) : theme.colorScheme.surfaceContainer,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: selected ? theme.colorScheme.primary : theme.colorScheme.outlineVariant),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          HapticFeedback.selectionClick();
          ref.read(photosFilterProvider.notifier).setDateRange(start: preset.start, end: preset.end);
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Text(
            preset.label.tr(),
            style: theme.textTheme.labelLarge?.copyWith(
              color: selected ? theme.colorScheme.primary : theme.colorScheme.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}
