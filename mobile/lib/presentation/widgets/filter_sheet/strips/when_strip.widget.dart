import 'dart:async';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/strips/when_presets.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';

Future<void> _openPicker(BuildContext context, WidgetRef ref) async {
  final now = DateTime.now();
  final range = await showDateRangePicker(context: context, firstDate: DateTime(1970), lastDate: now);
  if (range == null) return;
  unawaited(HapticFeedback.selectionClick());
  ref.read(photosFilterProvider.notifier).setDateRange(start: range.start, end: range.end);
}

class WhenStrip extends ConsumerWidget {
  const WhenStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final filter = ref.watch(photosFilterProvider);
    final presets = whenPresets(DateTime.now(), keyPrefix: 'when-pill');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 12),
          child: Text(
            'filter_sheet_when'.tr().toUpperCase(),
            style: theme.textTheme.labelSmall?.copyWith(letterSpacing: 2, color: theme.colorScheme.outline),
          ),
        ),
        SizedBox(
          height: 44,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: presets.length + 1,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (ctx, i) {
              if (i == presets.length) {
                return _CustomPill();
              }
              final preset = presets[i];
              return WhenPresetPill(preset: preset, selected: whenPresetMatches(filter.date, preset));
            },
          ),
        ),
      ],
    );
  }
}

class _CustomPill extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Material(
      key: const Key('when-pill-custom'),
      color: theme.colorScheme.surfaceContainer,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: theme.colorScheme.outlineVariant),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          unawaited(_openPicker(context, ref));
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Text('filter_sheet_when_custom'.tr(), style: theme.textTheme.labelLarge),
        ),
      ),
    );
  }
}
