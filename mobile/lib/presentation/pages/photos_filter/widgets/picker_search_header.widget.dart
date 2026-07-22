import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

/// Sticky search header shared by every photos-filter picker page (when / tags
/// / places / camera / person). Pinned via SliverPersistentHeader so it stays
/// visible while the body beneath scrolls.
///
/// [keyPrefix] namespaces the widget keys the pages' tests pin
/// (`<prefix>-search-field`, `<prefix>-search-clear-x`, `<prefix>-count-label`)
/// — e.g. `person-picker`.
///
/// Passing [count] + [countLabelKey] adds a match-count label row under the
/// field, which grows the pinned extent from 60 to 88.
class PickerSearchHeader extends StatelessWidget {
  final String keyPrefix;
  final String hintKey;
  final ValueChanged<String> onChanged;
  final String value;
  final TextEditingController controller;
  final int? count;
  final String? countLabelKey;

  const PickerSearchHeader({
    super.key,
    required this.keyPrefix,
    required this.hintKey,
    required this.onChanged,
    required this.value,
    required this.controller,
    this.count,
    this.countLabelKey,
  }) : assert((count == null) == (countLabelKey == null), 'count and countLabelKey go together');

  @override
  Widget build(BuildContext context) {
    return SliverPersistentHeader(
      pinned: true,
      delegate: _PickerSearchHeaderDelegate(
        keyPrefix: keyPrefix,
        hintKey: hintKey,
        onChanged: onChanged,
        value: value,
        controller: controller,
        count: count,
        countLabelKey: countLabelKey,
      ),
    );
  }
}

class _PickerSearchHeaderDelegate extends SliverPersistentHeaderDelegate {
  _PickerSearchHeaderDelegate({
    required this.keyPrefix,
    required this.hintKey,
    required this.onChanged,
    required this.value,
    required this.controller,
    required this.count,
    required this.countLabelKey,
  });

  final String keyPrefix;
  final String hintKey;
  final ValueChanged<String> onChanged;
  final String value;
  final TextEditingController controller;
  final int? count;
  final String? countLabelKey;

  // Header height = padding(8) + TextField(44) + padding(8) = 60,
  // plus gap(6) + count(22) when a count label is rendered.
  double get _extent => count == null ? 60 : 88;
  @override
  double get minExtent => _extent;
  @override
  double get maxExtent => _extent;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final theme = Theme.of(context);
    final hasText = value.isNotEmpty;

    final field = SizedBox(
      height: 44,
      child: TextField(
        key: Key('$keyPrefix-search-field'),
        controller: controller,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          isDense: true,
          hintText: hintKey.tr(),
          prefixIcon: const Icon(Icons.search_rounded, size: 20),
          suffixIcon: hasText
              ? IconButton(
                  key: Key('$keyPrefix-search-clear-x'),
                  icon: const Icon(Icons.close_rounded, size: 18),
                  tooltip: 'filter_sheet_picker_clear_search'.tr(),
                  onPressed: () {
                    controller.clear();
                    onChanged('');
                  },
                )
              : null,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
          filled: true,
          fillColor: theme.colorScheme.surfaceContainer,
        ),
      ),
    );

    final total = count;
    return Container(
      color: theme.colorScheme.surface,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: total == null
          ? field
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                field,
                const SizedBox(height: 6),
                SizedBox(
                  key: Key('$keyPrefix-count-label'),
                  height: 22,
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      _countLabel(countLabelKey!, total),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  @override
  bool shouldRebuild(covariant _PickerSearchHeaderDelegate oldDelegate) =>
      oldDelegate.count != count ||
      oldDelegate.value != value ||
      oldDelegate.onChanged != onChanged ||
      oldDelegate.controller != controller ||
      oldDelegate.keyPrefix != keyPrefix ||
      oldDelegate.hintKey != hintKey ||
      oldDelegate.countLabelKey != countLabelKey;
}

/// Plural helper — nested-leaf lookup avoids `.plural()`, which reads a
/// late-initialized locale field and throws in widget tests without an
/// `EasyLocalization` ancestor. Matches the pattern in
/// `people_section.widget.dart` and `match_count_label.widget.dart`.
String _countLabel(String rootKey, int count) {
  final variant = count == 1 ? 'one' : 'other';
  return '$rootKey.$variant'.tr(namedArgs: {'count': '$count'});
}
