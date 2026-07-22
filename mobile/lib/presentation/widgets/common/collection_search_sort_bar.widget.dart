import 'package:flutter/material.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/widgets/common/collection_sort_button.dart';
import 'package:immich_mobile/widgets/common/search_field.dart';

/// Search field + result count + [CollectionSortButton] pill, shared by the
/// Spaces grid and the Space-Albums grid.
///
/// Everything that differs between the two is a parameter: the widget keys, the
/// i18n keys and the sort-mode type. `countKey` is rendered with `{count}`;
/// `searchCountKey` with `{count}`, `{total}` and `{query}`.
class CollectionSearchSortBar<T> extends StatelessWidget {
  const CollectionSearchSortBar({
    super.key,
    required this.searchFieldKey,
    required this.clearButtonKey,
    required this.resultCountKey,
    required this.hintKey,
    required this.countKey,
    required this.searchCountKey,
    required this.controller,
    required this.hasQuery,
    required this.onClear,
    required this.resultCount,
    required this.totalCount,
    required this.query,
    required this.options,
    required this.sortMode,
    required this.isReverse,
    required this.onSortChanged,
  });

  final Key searchFieldKey;
  final Key clearButtonKey;
  final Key resultCountKey;
  final String hintKey;
  final String countKey;
  final String searchCountKey;

  final TextEditingController controller;
  final bool hasQuery;
  final VoidCallback onClear;
  final int resultCount;
  final int totalCount;
  final String query;
  final List<CollectionSortOption<T>> options;
  final T sortMode;
  final bool isReverse;
  final void Function(T mode, bool isReverse) onSortChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SearchField(
            key: searchFieldKey,
            hintText: hintKey.t(context: context),
            controller: controller,
            prefixIcon: const Icon(Icons.search_rounded),
            suffixIcon: hasQuery
                ? IconButton(key: clearButtonKey, icon: const Icon(Icons.clear_rounded), onPressed: onClear)
                : null,
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                query.isEmpty
                    ? countKey.t(context: context, args: {'count': resultCount.toString()})
                    : searchCountKey.t(
                        context: context,
                        args: {'count': resultCount.toString(), 'total': totalCount.toString(), 'query': query},
                      ),
                key: resultCountKey,
                style: context.textTheme.bodySmall?.copyWith(color: context.colorScheme.onSurfaceVariant),
              ),
              CollectionSortButton<T>(
                options: options,
                current: sortMode,
                isReverse: isReverse,
                onChanged: onSortChanged,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// "Nothing matched your search" state, shown when the source list is
/// non-empty but the active query filters everything out. `messageKey` is
/// rendered with `{query}`.
class CollectionNoMatch extends StatelessWidget {
  const CollectionNoMatch({super.key, required this.messageKey, required this.query});

  final String messageKey;
  final String query;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.search_off_rounded, size: 64, color: context.colorScheme.onSurfaceVariant.withValues(alpha: 0.5)),
          const SizedBox(height: 16),
          Text(
            messageKey.t(context: context, args: {'query': query}),
            textAlign: TextAlign.center,
            style: context.textTheme.titleMedium?.copyWith(color: context.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
