import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/active_filter_chip.widget.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/match_count_label.widget.dart';
import 'package:immich_mobile/providers/photos_filter/active_chips.dart';
import 'package:immich_mobile/providers/photos_filter/filter_debounce.provider.dart';
import 'package:immich_mobile/providers/photos_filter/filter_suggestions.provider.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';

/// Top-of-timeline active-filters summary. Returns a sliver that collapses to
/// zero height when no filters are active, otherwise renders a single-line
/// strip: leading Clear-all chip → horizontally scrollable chips →
/// trailing match count. Taps on each chip's × remove that chip; Clear all
/// wipes the entire filter. The filter sheet snap state is untouched — the
/// user can interact with this bar with the sheet open or closed.
class PhotosFilterSubheader extends ConsumerWidget {
  const PhotosFilterSubheader({super.key});

  static const _stripHeight = 44.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isEmpty = ref.watch(photosFilterProvider.select((f) => f.isEmpty));
    if (isEmpty) return const SliverToBoxAdapter(child: SizedBox.shrink());

    final filter = ref.watch(photosFilterProvider);
    final debounced = ref.watch(photosFilterDebouncedProvider);
    final suggestions = ref.watch(photosFilterSuggestionsProvider(debounced)).valueOrNull;
    final chips = activeChipsFromFilter(filter, suggestions: suggestions);
    final theme = Theme.of(context);

    return SliverToBoxAdapter(
      child: Container(
        key: const Key('photos-filter-subheader'),
        height: _stripHeight,
        color: theme.colorScheme.surface,
        child: Row(
          children: [
            const SizedBox(width: 16),
            _ClearAllChip(
              onTap: () {
                HapticFeedback.selectionClick();
                ref.read(photosFilterProvider.notifier).reset();
              },
            ),
            const SizedBox(width: 8),
            const _SortChip(),
            const SizedBox(width: 10),
            Expanded(
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: chips.length,
                padding: const EdgeInsets.symmetric(vertical: 6),
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (_, i) => Center(child: ActiveFilterChip(spec: chips[i])),
              ),
            ),
            const SizedBox(width: 12),
            const Flexible(child: MatchCountLabel()),
            const SizedBox(width: 16),
          ],
        ),
      ),
    );
  }
}

class _SortChip extends ConsumerWidget {
  const _SortChip();
  static String _label(SearchSortOrder s) => switch (s) {
    SearchSortOrder.relevance => 'search_sort_relevance'.tr(),
    SearchSortOrder.newest => 'search_sort_newest'.tr(),
    SearchSortOrder.oldest => 'search_sort_oldest'.tr(),
  };
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final filter = ref.watch(photosFilterProvider);
    final smart = filter.context != null && filter.context!.isNotEmpty;
    final effective = (!smart && filter.sort == SearchSortOrder.relevance) ? SearchSortOrder.newest : filter.sort;
    return Material(
      key: const Key('photos-filter-sort-chip'),
      color: theme.colorScheme.primary.withValues(alpha: theme.brightness == Brightness.dark ? 0.16 : 0.22),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      child: InkWell(
        customBorder: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        onTap: () => _open(context, ref, smart, effective),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.swap_vert_rounded, size: 16, color: theme.colorScheme.primary),
              const SizedBox(width: 4),
              Text(_label(effective), style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary)),
            ],
          ),
        ),
      ),
    );
  }

  void _open(BuildContext context, WidgetRef ref, bool smart, SearchSortOrder current) {
    final options = [if (smart) SearchSortOrder.relevance, SearchSortOrder.newest, SearchSortOrder.oldest];
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text('search_sort_title'.tr(), style: Theme.of(ctx).textTheme.titleMedium),
            ),
            RadioGroup<SearchSortOrder>(
              groupValue: current,
              onChanged: (v) {
                if (v != null) ref.read(photosFilterProvider.notifier).setSort(v);
                Navigator.of(ctx).pop();
              },
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final o in options)
                    RadioListTile<SearchSortOrder>(key: Key('sort-option-${o.name}'), value: o, title: Text(_label(o))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ClearAllChip extends StatelessWidget {
  final VoidCallback onTap;
  const _ClearAllChip({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      label: 'clear_all'.tr(),
      child: Material(
        key: const Key('photos-filter-subheader-clear-all'),
        color: theme.colorScheme.primary.withValues(alpha: theme.brightness == Brightness.dark ? 0.16 : 0.22),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        child: InkWell(
          onTap: onTap,
          customBorder: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.close_rounded, size: 16, color: theme.colorScheme.primary),
                const SizedBox(width: 4),
                Text('clear_all'.tr(), style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
