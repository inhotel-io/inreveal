import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/deep/deep_section_scaffold.widget.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/deep/search_more_row.widget.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/filter_section_id.dart';
import 'package:immich_mobile/providers/photos_filter/filter_debounce.provider.dart';
import 'package:immich_mobile/providers/photos_filter/filter_suggestions.provider.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';
import 'package:openapi/api.dart';

/// Preview cap: the deep section's parent Wrap shows at most this many chips.
/// The Wrap only renders while no parent is selected — selecting one swaps in
/// [_ChildCascade], whose InputChip shows the selection instead.
const int _kPreviewCap = 10;

/// Deep-snap section for a two-level filter dimension (Camera make → model,
/// Places country → city).
///
/// When no parent is selected, renders a Wrap of parent FilterChips sourced
/// from photosFilterSuggestionsProvider (capped to [_kPreviewCap]). Tapping a
/// parent sets it on the filter and swaps in a [_ChildCascade] which shows:
///   - the selected parent as an InputChip (× clears it)
///   - a Wrap of child FilterChips from [childrenProvider]
/// A body "Search N … →" row below the wrap/cascade delegates to
/// [onOpenPicker] — tapping it opens the full picker.
///
/// [keyPrefix]/[parentKeyPart]/[childKeyPart] compose the widget keys the
/// sections' tests pin (`camera-make-<make>`, `places-city-<city>`, …).
class CascadeSection extends ConsumerWidget {
  final FilterSectionId sectionId;
  final String titleKey;
  final String keyPrefix;
  final String parentKeyPart;
  final String childKeyPart;
  final String searchMoreI18nKey;
  final String searchMoreKeyName;
  final List<String> Function(FilterSuggestionsResponseDto suggestions) itemsSelector;
  final AutoDisposeFutureProviderFamily<List<String>, String?> childrenProvider;
  final String? Function(SearchFilter filter) selectedParent;
  final String? Function(SearchFilter filter) selectedChild;
  final void Function(PhotosFilterNotifier notifier, String? parent) setParent;
  final void Function(PhotosFilterNotifier notifier, String parent, String? child) setChild;
  final VoidCallback? onOpenPicker;

  const CascadeSection({
    super.key,
    required this.sectionId,
    required this.titleKey,
    required this.keyPrefix,
    required this.parentKeyPart,
    required this.childKeyPart,
    required this.searchMoreI18nKey,
    required this.searchMoreKeyName,
    required this.itemsSelector,
    required this.childrenProvider,
    required this.selectedParent,
    required this.selectedChild,
    required this.setParent,
    required this.setChild,
    this.onOpenPicker,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(photosFilterDebouncedProvider);
    final async = ref.watch(photosFilterSuggestionsProvider(filter));
    final parentsAsync = async.whenData(itemsSelector);
    final parent = ref.watch(photosFilterProvider.select(selectedParent));
    final count = parentsAsync.valueOrNull?.length ?? 0;

    return DeepSectionScaffold<String>(
      sectionId: sectionId,
      titleKey: titleKey,
      items: parentsAsync,
      onRetry: () => ref.invalidate(photosFilterSuggestionsProvider(filter)),
      childBuilder: (parents) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (parent == null)
              _ParentWrap(section: this, parents: parents)
            else
              _ChildCascade(section: this, parent: parent),
            if (count > 0)
              SearchMoreRow(
                count: count,
                i18nRootKey: searchMoreI18nKey,
                keyName: searchMoreKeyName,
                onOpenPicker: onOpenPicker,
              ),
          ],
        );
      },
    );
  }
}

class _ParentWrap extends ConsumerWidget {
  final CascadeSection section;
  final List<String> parents;
  const _ParentWrap({required this.section, required this.parents});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final display = parents.take(_kPreviewCap).toList();
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final parent in display)
          FilterChip(
            key: Key('${section.keyPrefix}-${section.parentKeyPart}-$parent'),
            label: Text(parent),
            selected: false,
            onSelected: (_) {
              HapticFeedback.selectionClick();
              section.setParent(ref.read(photosFilterProvider.notifier), parent);
            },
          ),
      ],
    );
  }
}

class _ChildCascade extends ConsumerWidget {
  final CascadeSection section;
  final String parent;
  const _ChildCascade({required this.section, required this.parent});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final childrenAsync = ref.watch(section.childrenProvider(parent));
    final selectedChild = ref.watch(photosFilterProvider.select(section.selectedChild));
    final theme = Theme.of(context);
    final selectedKey = '${section.keyPrefix}-${section.parentKeyPart}-selected';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        InputChip(
          key: Key(selectedKey),
          label: Text(parent),
          selected: true,
          selectedColor: theme.colorScheme.primaryContainer,
          onDeleted: () {
            HapticFeedback.selectionClick();
            section.setParent(ref.read(photosFilterProvider.notifier), null);
          },
          deleteIcon: Icon(Icons.close_rounded, key: Key('$selectedKey-clear')),
        ),
        const SizedBox(height: 8),
        childrenAsync.when(
          data: (children) {
            if (children.isEmpty) return const SizedBox.shrink();
            return Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final child in children)
                  FilterChip(
                    key: Key('${section.keyPrefix}-${section.childKeyPart}-$child'),
                    label: Text(child),
                    selected: selectedChild == child,
                    onSelected: (_) {
                      HapticFeedback.selectionClick();
                      section.setChild(
                        ref.read(photosFilterProvider.notifier),
                        parent,
                        selectedChild == child ? null : child,
                      );
                    },
                  ),
              ],
            );
          },
          loading: () => const LinearProgressIndicator(),
          error: (_, _) => TextButton.icon(
            onPressed: () => ref.invalidate(section.childrenProvider(parent)),
            icon: const Icon(Icons.refresh_rounded),
            label: Text('filter_sheet_load_error_retry'.tr()),
          ),
        ),
      ],
    );
  }
}
