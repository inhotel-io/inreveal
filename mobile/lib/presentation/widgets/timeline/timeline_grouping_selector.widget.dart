import 'dart:async';
import 'dart:math' as math;

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/setting.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/providers/infrastructure/setting.provider.dart';

const timelineGroupingSelectorGroups = <GroupAssetsBy>[GroupAssetsBy.year, GroupAssetsBy.month, GroupAssetsBy.day];

GroupAssetsBy normalizeTimelineGrouping(GroupAssetsBy groupBy) {
  return switch (groupBy) {
    GroupAssetsBy.year || GroupAssetsBy.month || GroupAssetsBy.day => groupBy,
    GroupAssetsBy.auto || GroupAssetsBy.none => GroupAssetsBy.day,
  };
}

GroupAssetsBy timelineGroupingFromSettingIndex(int index) {
  if (index < 0 || index >= GroupAssetsBy.values.length) {
    return GroupAssetsBy.day;
  }

  return normalizeTimelineGrouping(GroupAssetsBy.values[index]);
}

class TimelineGroupingSelector extends ConsumerWidget {
  const TimelineGroupingSelector({super.key, this.enabled = true});

  static const double _maxWidth = 218;
  static const double _height = 40;

  final bool enabled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(
      settingsProvider.select((settings) => timelineGroupingFromSettingIndex(settings.get(Setting.groupAssetsBy))),
    );
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth.isFinite ? math.min(constraints.maxWidth, _maxWidth) : _maxWidth;

        return Semantics(
          container: true,
          label: 'timeline_grouping_selector'.tr(),
          child: Opacity(
            opacity: enabled ? 1 : 0.45,
            child: SizedBox(
              key: const Key('timeline-grouping-selector'),
              width: width,
              height: _height,
              child: Material(
                color: colors.surfaceContainerHighest.withValues(
                  alpha: theme.brightness == Brightness.dark ? 0.74 : 0.9,
                ),
                shape: StadiumBorder(side: BorderSide(color: colors.outlineVariant.withValues(alpha: 0.7))),
                clipBehavior: Clip.antiAlias,
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Row(
                    children: [
                      for (final groupBy in timelineGroupingSelectorGroups)
                        Expanded(
                          child: _TimelineGroupingSegment(
                            groupBy: groupBy,
                            selected: selected == groupBy,
                            enabled: enabled,
                            onTap: () async {
                              unawaited(HapticFeedback.selectionClick());
                              await ref.read(settingsProvider.notifier).set(Setting.groupAssetsBy, groupBy.index);
                            },
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _TimelineGroupingSegment extends StatelessWidget {
  const _TimelineGroupingSegment({
    required this.groupBy,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final GroupAssetsBy groupBy;
  final bool selected;
  final bool enabled;
  final Future<void> Function() onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final foreground = selected ? colors.onPrimary : colors.onSurface.withValues(alpha: 0.86);

    return Semantics(
      key: Key('timeline-grouping-${groupBy.name}'),
      button: true,
      selected: selected,
      enabled: enabled,
      label: _label(context, groupBy),
      child: InkWell(
        onTap: enabled && !selected ? () => unawaited(onTap()) : null,
        borderRadius: BorderRadius.circular(999),
        child: AnimatedContainer(
          duration: Durations.short3,
          curve: Curves.easeOutCubic,
          height: double.infinity,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? colors.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: Text(
            _label(context, groupBy),
            maxLines: 1,
            overflow: TextOverflow.fade,
            softWrap: false,
            style: theme.textTheme.labelLarge?.copyWith(
              color: foreground,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

String _label(BuildContext context, GroupAssetsBy groupBy) {
  return switch (groupBy) {
    GroupAssetsBy.year => 'timeline_grouping_years'.tr(),
    GroupAssetsBy.month => 'timeline_grouping_months'.tr(),
    GroupAssetsBy.day => 'timeline_grouping_days'.tr(),
    GroupAssetsBy.auto || GroupAssetsBy.none => 'timeline_grouping_days'.tr(),
  };
}
