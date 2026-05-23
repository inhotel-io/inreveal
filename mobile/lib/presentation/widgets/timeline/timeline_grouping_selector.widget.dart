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
  static const double _height = 48;

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
          key: const Key('timeline-grouping-selector'),
          container: true,
          label: _translated('timeline_grouping_selector', 'Timeline grouping'),
          child: Opacity(
            opacity: enabled ? 1 : 0.45,
            child: SizedBox(
              width: width,
              height: _height,
              child: Material(
                color: colors.surfaceContainerHighest.withValues(
                  alpha: theme.brightness == Brightness.dark ? 0.74 : 0.9,
                ),
                shape: StadiumBorder(side: BorderSide(color: colors.outlineVariant.withValues(alpha: 0.7))),
                clipBehavior: Clip.antiAlias,
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
    final duration = MediaQuery.disableAnimationsOf(context) ? Duration.zero : Durations.short3;
    final label = _label(context, groupBy);
    final canTap = enabled && !selected;

    return Semantics(
      key: Key('timeline-grouping-${groupBy.name}'),
      button: true,
      selected: selected,
      enabled: enabled,
      label: label,
      onTap: canTap ? () => unawaited(onTap()) : null,
      child: ExcludeSemantics(
        child: InkWell(
          onTap: canTap ? () => unawaited(onTap()) : null,
          borderRadius: BorderRadius.circular(999),
          child: AnimatedContainer(
            duration: duration,
            curve: Curves.easeOutCubic,
            height: double.infinity,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected ? colors.primary : Colors.transparent,
              borderRadius: BorderRadius.circular(999),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: Text(
              label,
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
      ),
    );
  }
}

String _label(BuildContext context, GroupAssetsBy groupBy) {
  return switch (groupBy) {
    GroupAssetsBy.year => _translated('timeline_grouping_years', 'Years'),
    GroupAssetsBy.month => _translated('timeline_grouping_months', 'Months'),
    GroupAssetsBy.day => _translated('timeline_grouping_days', 'Days'),
    GroupAssetsBy.auto || GroupAssetsBy.none => _translated('timeline_grouping_days', 'Days'),
  };
}

String _translated(String key, String fallback) {
  final value = key.tr();
  return value == key ? fallback : value;
}
