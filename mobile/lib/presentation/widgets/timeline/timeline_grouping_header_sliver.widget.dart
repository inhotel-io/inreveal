import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/active_filter_chip.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_grouping_selector.widget.dart';
import 'package:immich_mobile/providers/photos_filter/active_chips.dart';
import 'package:immich_mobile/providers/timeline/multiselect.provider.dart';
import 'package:immich_mobile/providers/timeline/temporal_scope.provider.dart';

const double kTimelineGroupingHeaderSliverHeight = 56.0;

class TimelineGroupingHeaderSliver extends ConsumerWidget {
  const TimelineGroupingHeaderSliver({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final multiSelectState = ref.watch(multiSelectProvider);
    if (multiSelectState.isEnabled || multiSelectState.forceEnable) {
      return const SliverToBoxAdapter(child: SizedBox.shrink());
    }

    final temporalScope = ref.watch(timelineTemporalScopeProvider);
    final temporalChip = activeTemporalScopeChip(
      temporalScope,
      locale: Localizations.localeOf(context).toLanguageTag(),
    );
    final colors = Theme.of(context).colorScheme;

    return SliverToBoxAdapter(
      key: const Key('timeline-grouping-header-sliver'),
      child: Container(
        height: kTimelineGroupingHeaderSliverHeight,
        color: colors.surface,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Row(
          children: [
            const TimelineGroupingSelector(),
            if (temporalChip != null) ...[
              const SizedBox(width: 10),
              Flexible(
                child: ActiveFilterChip(
                  spec: temporalChip,
                  onRemove: () => ref.read(timelineTemporalScopeProvider.notifier).clear(),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
