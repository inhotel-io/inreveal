import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

/// "No results for `query`" + a Clear-search button, shared by every
/// photos-filter picker page. [keyPrefix] namespaces the clear button's widget
/// key (`<prefix>-clear-search`) — e.g. `person-picker`.
class PickerNoResultsPanel extends StatelessWidget {
  final String query;
  final VoidCallback onClear;
  final String keyPrefix;

  const PickerNoResultsPanel({super.key, required this.query, required this.onClear, required this.keyPrefix});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'filter_sheet_picker_no_results'.tr(namedArgs: {'query': query}),
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          TextButton(
            key: Key('$keyPrefix-clear-search'),
            onPressed: onClear,
            child: Text('filter_sheet_picker_clear_search'.tr()),
          ),
        ],
      ),
    );
  }
}
