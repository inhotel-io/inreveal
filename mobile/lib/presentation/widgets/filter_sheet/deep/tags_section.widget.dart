import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/deep/deep_section_scaffold.widget.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/deep/search_more_row.widget.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/filter_section_id.dart';
import 'package:immich_mobile/providers/photos_filter/filter_debounce.provider.dart';
import 'package:immich_mobile/providers/photos_filter/filter_suggestions.provider.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';
import 'package:openapi/api.dart';

/// Preview cap: the deep section shows at most this many chips by default,
/// plus any selected suggestion beyond the cap (pinned so it stays visible).
const int _kPreviewCap = 10;

/// TagsSectionDeep — Deep-snap section for the Tags filter dimension.
///
/// Layout: pill-wrap of tag chips (8pt spacing), capped to [_kPreviewCap]
/// (selected suggestions beyond the cap are pinned). Data comes from
/// `photosFilterSuggestionsProvider(filter).tags` (top-N bounded server-side
/// per design §8). A body "Search N tags →" row below the wrap delegates to
/// [onOpenPicker] — tapping it opens the full picker. Wraps in
/// [DeepSectionScaffold] for loading/error/empty.
class TagsSectionDeep extends ConsumerWidget {
  final VoidCallback? onOpenPicker;
  const TagsSectionDeep({super.key, this.onOpenPicker});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(photosFilterDebouncedProvider);
    final async = ref.watch(photosFilterSuggestionsProvider(filter));
    final tagsAsync = async.whenData((s) => s.tags);
    final selectedIds = ref.watch(photosFilterProvider.select((f) => f.tagIds?.toSet() ?? const <String>{}));

    final count = tagsAsync.valueOrNull?.length ?? 0;

    return DeepSectionScaffold<FilterSuggestionsTagDto>(
      sectionId: FilterSectionId.tags,
      titleKey: 'filter_sheet_deep_tags_section',
      items: tagsAsync,
      onRetry: () => ref.invalidate(photosFilterSuggestionsProvider(filter)),
      childBuilder: (tags) {
        final firstTen = tags.take(_kPreviewCap).toList();
        final overflowSelected = tags.skip(_kPreviewCap).where((t) => selectedIds.contains(t.id)).toList();
        final display = [...firstTen, ...overflowSelected];

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Wrap(spacing: 8, runSpacing: 8, children: [for (final tag in display) _TagChip(tag: tag)]),
            if (count > 0)
              SearchMoreRow(
                count: count,
                i18nRootKey: 'filter_sheet_deep_search_n_tags',
                keyName: 'tags-section-search-more',
                onOpenPicker: onOpenPicker,
              ),
          ],
        );
      },
    );
  }
}

class _TagChip extends ConsumerWidget {
  final FilterSuggestionsTagDto tag;
  const _TagChip({required this.tag});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final selected = ref.watch(photosFilterProvider.select((f) => f.tagIds?.contains(tag.id) == true));
    return FilterChip(
      key: Key('tag-chip-${tag.id}'),
      label: Text(tag.value),
      selected: selected,
      showCheckmark: false,
      backgroundColor: theme.colorScheme.surfaceContainerHigh,
      selectedColor: theme.colorScheme.secondaryContainer,
      side: BorderSide(
        color: selected ? theme.colorScheme.primary : theme.colorScheme.outlineVariant,
        width: selected ? 1.5 : 1,
      ),
      labelStyle: theme.textTheme.labelLarge?.copyWith(
        color: selected ? theme.colorScheme.onSecondaryContainer : theme.colorScheme.onSurface,
        fontWeight: FontWeight.w500,
      ),
      onSelected: (_) {
        HapticFeedback.selectionClick();
        ref.read(photosFilterProvider.notifier).toggleTag(tag.id);
      },
    );
  }
}
