import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/strips/strip_scaffold.widget.dart';
import 'package:immich_mobile/providers/photos_filter/filter_debounce.provider.dart';
import 'package:immich_mobile/providers/photos_filter/filter_suggestions.provider.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';
import 'package:openapi/api.dart';

/// Strip cap: at most this many value tiles render before a trailing "+N"
/// tile takes over, opening the full-screen picker instead of an unbounded
/// ListView.
const int _kStripCap = 10;

/// Horizontal Browse strip of single-select string values (camera makes,
/// countries, …) backed by the filter-suggestions provider.
///
/// [tileKeyName] / [moreKeyName] are the widget keys the strips' tests pin
/// (e.g. `camera-tile` / `camera-strip-more`).
class ValueStrip extends ConsumerWidget {
  final String titleKey;
  final String tileKeyName;
  final String moreKeyName;
  final PageRouteInfo<dynamic> pickerRoute;
  final List<String> Function(FilterSuggestionsResponseDto suggestions) itemsSelector;
  final bool Function(SearchFilter filter, String value) isSelected;
  final void Function(PhotosFilterNotifier notifier, String value, bool isSelected) onToggle;

  const ValueStrip({
    super.key,
    required this.titleKey,
    required this.tileKeyName,
    required this.moreKeyName,
    required this.pickerRoute,
    required this.itemsSelector,
    required this.isSelected,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(photosFilterDebouncedProvider);
    final async = ref.watch(photosFilterSuggestionsProvider(filter));
    final items = async.whenData(itemsSelector);

    return StripScaffold(
      titleKey: titleKey,
      items: items,
      height: 84,
      onRetry: () => ref.invalidate(photosFilterSuggestionsProvider(filter)),
      childBuilder: (data) {
        final values = data.cast<String>();
        final shown = values.take(_kStripCap).toList();
        final overflow = values.length - shown.length;
        return ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          itemCount: shown.length + (overflow > 0 ? 1 : 0),
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (ctx, i) => i < shown.length
              ? _ValueTile(value: shown[i], keyName: tileKeyName, isSelected: isSelected, onToggle: onToggle)
              : _MoreTile(count: overflow, keyName: moreKeyName, pickerRoute: pickerRoute),
        );
      },
    );
  }
}

class _MoreTile extends StatelessWidget {
  final int count;
  final String keyName;
  final PageRouteInfo<dynamic> pickerRoute;
  const _MoreTile({required this.count, required this.keyName, required this.pickerRoute});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      key: Key(keyName),
      width: 104,
      height: 72,
      child: Material(
        color: theme.colorScheme.surfaceContainerHigh,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () {
            HapticFeedback.selectionClick();
            context.pushRoute(pickerRoute);
          },
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '+$count',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'all'.tr(),
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ValueTile extends ConsumerWidget {
  final String value;
  final String keyName;
  final bool Function(SearchFilter filter, String value) isSelected;
  final void Function(PhotosFilterNotifier notifier, String value, bool isSelected) onToggle;
  const _ValueTile({required this.value, required this.keyName, required this.isSelected, required this.onToggle});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final selected = ref.watch(photosFilterProvider.select((f) => isSelected(f, value)));
    return SizedBox(
      width: 104,
      height: 72,
      child: Material(
        key: Key(keyName),
        color: theme.colorScheme.surfaceContainerHigh,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: selected ? BorderSide(color: theme.colorScheme.primary, width: 2) : BorderSide.none,
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () {
            HapticFeedback.selectionClick();
            onToggle(ref.read(photosFilterProvider.notifier), value, selected);
          },
          child: Stack(
            children: [
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Colors.black.withValues(alpha: 0.32)],
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 10,
                right: 10,
                bottom: 8,
                child: Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: selected ? theme.colorScheme.primary : theme.colorScheme.onSurface,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
