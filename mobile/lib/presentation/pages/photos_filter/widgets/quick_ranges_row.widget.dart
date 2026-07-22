import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/strips/when_presets.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';

/// Horizontal row of quick date-range preset pills shown inside
/// [WhenPickerPage]. Same presets as the Browse WhenStrip (see
/// `strips/when_presets.dart`) but without the Custom pill — the picker
/// surface provides a year accordion instead.
class QuickRangesRow extends ConsumerWidget {
  const QuickRangesRow({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(photosFilterProvider);
    final presets = whenPresets(DateTime.now(), keyPrefix: 'when-picker-pill');

    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: presets.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final preset = presets[i];
          return WhenPresetPill(preset: preset, selected: whenPresetMatches(filter.date, preset));
        },
      ),
    );
  }
}
