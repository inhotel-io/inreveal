import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/presentation/widgets/images/thumbnail.widget.dart';

const double kTimelineOverviewCardHeight = 144.0;
const double kTimelineOverviewCardVerticalPadding = 6.0;
const double kTimelineOverviewCardHorizontalPadding = 12.0;
const double kTimelineOverviewSegmentExtent = kTimelineOverviewCardHeight + (kTimelineOverviewCardVerticalPadding * 2);

class TimelineOverviewCard extends StatelessWidget {
  const TimelineOverviewCard({
    super.key,
    required this.bucket,
    required this.groupBy,
    this.representativeAsset,
    this.onTap,
  });

  final TimeBucket bucket;
  final GroupAssetsBy groupBy;
  final BaseAsset? representativeAsset;
  final VoidCallback? onTap;

  String _label(BuildContext context) {
    final locale = context.locale.toLanguageTag();
    return switch (groupBy) {
      GroupAssetsBy.year => DateFormat.y(locale).format(bucket.date),
      GroupAssetsBy.month => DateFormat.yMMM(locale).format(bucket.date),
      GroupAssetsBy.day || GroupAssetsBy.auto || GroupAssetsBy.none => DateFormat.yMMMEd(locale).format(bucket.date),
    };
  }

  String _countLabel() {
    final count = bucket.assetCount;
    final translated = 'timeline_overview_photo_count'.tr(namedArgs: {'count': count.toString()});
    if (translated != 'timeline_overview_photo_count' && !translated.contains('plural')) {
      return translated;
    }

    return count == 1 ? '1 photo' : '$count photos';
  }

  @override
  Widget build(BuildContext context) {
    final label = _label(context);
    final countLabel = _countLabel();
    final representativeAsset = this.representativeAsset;

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: kTimelineOverviewCardHorizontalPadding,
        vertical: kTimelineOverviewCardVerticalPadding,
      ),
      child: SizedBox(
        key: const ValueKey('timeline-overview-card-size'),
        height: kTimelineOverviewCardHeight,
        width: double.infinity,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(8),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (representativeAsset != null)
                    Thumbnail.fromAsset(asset: representativeAsset, fit: BoxFit.cover, size: const Size(640, 320))
                  else
                    DecoratedBox(
                      key: const ValueKey('timeline-overview-card-fallback'),
                      decoration: BoxDecoration(color: context.colorScheme.surfaceContainerHighest),
                    ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Color(0xCC000000)],
                        stops: [0.35, 1.0],
                      ),
                    ),
                  ),
                  Positioned(
                    left: 16,
                    right: 16,
                    bottom: 14,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.textTheme.headlineSmall?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        DecoratedBox(
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.88),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                            child: Text(
                              countLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: context.textTheme.labelMedium?.copyWith(
                                color: Colors.black,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
