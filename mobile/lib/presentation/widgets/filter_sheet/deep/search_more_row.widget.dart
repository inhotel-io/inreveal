import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// "Search N things →" affordance rendered at the bottom of every Deep
/// filter-sheet section body. Tapping delegates to [onOpenPicker], which opens
/// the dimension's full picker page.
///
/// [keyName] is the widget key the section's tests pin (e.g.
/// `people-section-search-more`); [i18nRootKey] is the plural root whose
/// `.one` / `.other` leaves hold the label (e.g.
/// `filter_sheet_deep_search_n_people`).
class SearchMoreRow extends StatelessWidget {
  final int count;
  final String i18nRootKey;
  final String keyName;
  final VoidCallback? onOpenPicker;

  const SearchMoreRow({
    super.key,
    required this.count,
    required this.i18nRootKey,
    required this.keyName,
    this.onOpenPicker,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: InkWell(
        key: Key(keyName),
        borderRadius: BorderRadius.circular(12),
        onTap: () {
          HapticFeedback.selectionClick();
          onOpenPicker?.call();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              Icon(Icons.search_rounded, size: 18, color: theme.colorScheme.primary),
              const SizedBox(width: 10),
              // The translated label already ends in "→" (see filter_sheet_deep_search_n_*).
              Expanded(
                child: Text(
                  _label(i18nRootKey, count),
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.primary),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Plural helper — nested-leaf lookup avoids `.plural()`, which reads a
/// late-initialized locale field and throws in widget tests without an
/// `EasyLocalization` ancestor. Matches the pattern in
/// `match_count_label.widget.dart`.
String _label(String rootKey, int count) {
  final variant = count == 1 ? 'one' : 'other';
  return '$rootKey.$variant'.tr(namedArgs: {'count': '$count'});
}
