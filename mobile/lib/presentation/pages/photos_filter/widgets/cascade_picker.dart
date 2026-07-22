import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/picker_no_results_panel.widget.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/picker_search_header.widget.dart';
import 'package:immich_mobile/providers/photos_filter/filter_debounce.provider.dart';
import 'package:immich_mobile/providers/photos_filter/filter_suggestions.provider.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';

/// Everything that distinguishes the Camera picker (make → model) from the
/// Places picker (country → city). Both are two-level, single-expand cascades
/// over `List<String>` suggestions, so they share [CascadeAccordion] and
/// [CascadePickerScaffold] and differ only by this config.
class CascadePickerConfig {
  /// Widget-key namespace the pages' tests pin, e.g. `camera-picker`.
  final String keyPrefix;

  /// Widget-key segment for the outer/inner level, e.g. `make` / `model`.
  final String parentKeyPart;
  final String childKeyPart;

  final String titleKey;
  final String hintKey;

  final AutoDisposeStateProvider<String> queryProvider;
  final AutoDisposeProvider<AsyncValue<List<String>>> parentsProvider;
  final AutoDisposeFutureProviderFamily<List<String>, String?> childrenProvider;

  final String? Function(SearchFilter filter) selectedParent;
  final String? Function(SearchFilter filter) selectedChild;
  final void Function(PhotosFilterNotifier notifier, String parent) selectParent;
  final void Function(PhotosFilterNotifier notifier, String parent, String child) selectChild;

  /// Builds the dimension's own accordion wrapper type, so `find.byType` in
  /// widget tests keeps resolving `CameraPickerMakeAccordion` /
  /// `PlacesPickerCountryAccordion`.
  final Widget Function(String? expanded, ValueChanged<String?> onExpand) accordionBuilder;

  const CascadePickerConfig({
    required this.keyPrefix,
    required this.parentKeyPart,
    required this.childKeyPart,
    required this.titleKey,
    required this.hintKey,
    required this.queryProvider,
    required this.parentsProvider,
    required this.childrenProvider,
    required this.selectedParent,
    required this.selectedChild,
    required this.selectParent,
    required this.selectChild,
    required this.accordionBuilder,
  });
}

/// Full-screen parent → child accordion for a [CascadePickerConfig] picker.
///
/// Reads `config.parentsProvider` (parents matching the current search query)
/// and renders each as an [InkWell] row; tapping a row both selects the parent
/// (replacing any prior selection) and expands it, collapsing any
/// previously-expanded parent. Children are fetched lazily — only once a
/// parent is expanded — via `config.childrenProvider`, never proactively.
///
/// The host passes [expanded] + [onExpand] so the page can lift single-expand
/// state (mirrors [WhenPickerYearAccordion]'s expandedYear).
class CascadeAccordion extends ConsumerWidget {
  final CascadePickerConfig config;
  final String? expanded;
  final ValueChanged<String?> onExpand;

  const CascadeAccordion({super.key, required this.config, required this.expanded, required this.onExpand});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(config.parentsProvider);
    final selectedParent = ref.watch(photosFilterProvider.select(config.selectedParent));
    final selectedChild = ref.watch(photosFilterProvider.select(config.selectedChild));
    final query = ref.watch(config.queryProvider).trim().toLowerCase();
    final expandedParent = expanded;

    return async.when(
      loading: () => const SizedBox.shrink(),
      error: (e, st) => const SizedBox.shrink(),
      data: (parents) {
        var display = parents;
        // Search filters parents by name, PLUS any expanded parent whose
        // already-loaded children match — without triggering a fetch for it
        // (the single-expand accordion means at most one parent's children are
        // cached at a time). No proactive fetch for un-expanded parents.
        if (expandedParent != null && query.isNotEmpty && !display.contains(expandedParent)) {
          final cached = ref.watch(config.childrenProvider(expandedParent)).valueOrNull;
          final hasMatch = cached?.any((c) => c.toLowerCase().contains(query)) ?? false;
          if (hasMatch) {
            display = [...display, expandedParent];
          }
        }
        if (display.isEmpty) return const SizedBox.shrink();
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final parent in display)
              _ParentRow(
                config: config,
                parent: parent,
                selected: selectedParent == parent,
                selectedChild: selectedParent == parent ? selectedChild : null,
                expanded: expandedParent == parent,
                onToggle: () {
                  HapticFeedback.selectionClick();
                  config.selectParent(ref.read(photosFilterProvider.notifier), parent);
                  onExpand(expandedParent == parent ? null : parent);
                },
              ),
          ],
        );
      },
    );
  }
}

class _ParentRow extends StatelessWidget {
  final CascadePickerConfig config;
  final String parent;
  final bool selected;
  final String? selectedChild;
  final bool expanded;
  final VoidCallback onToggle;

  const _ParentRow({
    required this.config,
    required this.parent,
    required this.selected,
    required this.selectedChild,
    required this.expanded,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final highlighted = expanded || selected;
    final rowKey = '${config.keyPrefix}-${config.parentKeyPart}-$parent';
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          key: Key(rowKey),
          onTap: onToggle,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    parent,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: highlighted ? FontWeight.w600 : FontWeight.w500,
                      color: highlighted ? theme.colorScheme.primary : theme.colorScheme.onSurface,
                    ),
                  ),
                ),
                if (selected)
                  Icon(
                    Icons.check_circle_rounded,
                    key: Key('$rowKey-check'),
                    size: 18,
                    color: theme.colorScheme.primary,
                  ),
                const SizedBox(width: 8),
                Icon(
                  expanded ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded,
                  color: theme.colorScheme.outline,
                ),
              ],
            ),
          ),
        ),
        if (expanded) _ChildList(config: config, parent: parent, selectedChild: selectedChild),
      ],
    );
  }
}

class _ChildList extends ConsumerWidget {
  final CascadePickerConfig config;
  final String parent;
  final String? selectedChild;
  const _ChildList({required this.config, required this.parent, required this.selectedChild});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final childrenAsync = ref.watch(config.childrenProvider(parent));
    // "Already-loaded children" search: once a parent is expanded (and its
    // children fetched), the current picker query further narrows the child
    // list too — no extra fetch is triggered by typing.
    final query = ref.watch(config.queryProvider).trim().toLowerCase();

    return Padding(
      padding: const EdgeInsets.only(left: 16, right: 20, bottom: 8),
      child: childrenAsync.when(
        data: (children) {
          final filtered = query.isEmpty ? children : children.where((c) => c.toLowerCase().contains(query)).toList();
          if (filtered.isEmpty) return const SizedBox.shrink();
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final child in filtered)
                _ChildRow(config: config, parent: parent, child: child, selected: selectedChild == child),
            ],
          );
        },
        loading: () =>
            const Padding(padding: EdgeInsets.symmetric(vertical: 12, horizontal: 4), child: LinearProgressIndicator()),
        error: (_, _) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: TextButton.icon(
            onPressed: () => ref.invalidate(config.childrenProvider(parent)),
            icon: const Icon(Icons.refresh_rounded),
            label: Text('filter_sheet_load_error_retry'.tr()),
          ),
        ),
      ),
    );
  }
}

class _ChildRow extends ConsumerWidget {
  final CascadePickerConfig config;
  final String parent;
  final String child;
  final bool selected;
  const _ChildRow({required this.config, required this.parent, required this.child, required this.selected});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return InkWell(
      key: Key('${config.keyPrefix}-${config.childKeyPart}-$child'),
      onTap: () {
        HapticFeedback.selectionClick();
        config.selectChild(ref.read(photosFilterProvider.notifier), parent, child);
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(
          children: [
            Expanded(
              child: Text(
                child,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: selected ? theme.colorScheme.primary : theme.colorScheme.onSurface,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ),
            Icon(
              selected ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
              size: 20,
              color: selected ? theme.colorScheme.primary : theme.colorScheme.outline,
            ),
          ],
        ),
      ),
    );
  }
}

/// Full-screen picker page body shared by the Camera and Places pickers:
/// search header + lazily-expanding two-level accordion.
class CascadePickerScaffold extends HookConsumerWidget {
  final CascadePickerConfig config;
  const CascadePickerScaffold({super.key, required this.config});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = useTextEditingController(text: ref.read(config.queryProvider));
    final expandedParent = useState<String?>(null);

    // Keep controller text in sync if provider changes externally (e.g. the
    // Clear-search button in the no-results panel below).
    ref.listen<String>(config.queryProvider, (prev, next) {
      if (controller.text != next) {
        controller.text = next;
        controller.selection = TextSelection.collapsed(offset: next.length);
      }
    });

    final parentsAsync = ref.watch(config.parentsProvider);
    final query = ref.watch(config.queryProvider);

    /// True when the currently-expanded parent has an already-loaded child
    /// matching the query — without triggering a fetch (only cached children
    /// of the expanded parent count; no proactive fetch here).
    ///
    /// Lets the page keep the accordion visible even when the query matches no
    /// parent name, so the accordion's own already-loaded-child filtering (see
    /// [CascadeAccordion]) stays reachable instead of being short-circuited by
    /// a page-level "no results" decision that only looked at parent names.
    bool expandedHasChildMatch(String trimmedQuery) {
      final expanded = expandedParent.value;
      if (expanded == null || trimmedQuery.isEmpty) return false;
      final needle = trimmedQuery.toLowerCase();
      final cached = ref.watch(config.childrenProvider(expanded)).valueOrNull;
      return cached?.any((c) => c.toLowerCase().contains(needle)) ?? false;
    }

    List<Widget> bodySlivers() => parentsAsync.when(
      loading: () => const [SliverFillRemaining(child: Center(child: CircularProgressIndicator()))],
      error: (e, st) => [
        SliverFillRemaining(
          child: Center(
            child: TextButton.icon(
              key: Key('${config.keyPrefix}-retry'),
              onPressed: () => ref.invalidate(photosFilterSuggestionsProvider(ref.read(photosFilterDebouncedProvider))),
              icon: const Icon(Icons.refresh_rounded),
              label: Text('filter_sheet_load_error_retry'.tr()),
            ),
          ),
        ),
      ],
      data: (parents) {
        final trimmedQuery = query.trim();
        final hasVisibleContent = parents.isNotEmpty || expandedHasChildMatch(trimmedQuery);
        if (!hasVisibleContent && trimmedQuery.isNotEmpty) {
          return [
            SliverFillRemaining(
              hasScrollBody: false,
              child: PickerNoResultsPanel(
                keyPrefix: config.keyPrefix,
                query: trimmedQuery,
                onClear: () => ref.read(config.queryProvider.notifier).state = '',
              ),
            ),
          ];
        }
        if (!hasVisibleContent) {
          return const [SliverToBoxAdapter(child: SizedBox.shrink())];
        }
        return [
          SliverToBoxAdapter(child: config.accordionBuilder(expandedParent.value, (p) => expandedParent.value = p)),
        ];
      },
    );

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'back'.tr(),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(config.titleKey.tr()),
        actions: [
          TextButton(
            key: Key('${config.keyPrefix}-done'),
            onPressed: () => Navigator.of(context).maybePop(),
            child: Text('filter_sheet_picker_done'.tr()),
          ),
        ],
      ),
      body: CustomScrollView(
        slivers: [
          PickerSearchHeader(
            keyPrefix: config.keyPrefix,
            hintKey: config.hintKey,
            controller: controller,
            value: controller.text,
            onChanged: (v) => ref.read(config.queryProvider.notifier).state = v,
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 8)),
          ...bodySlivers(),
        ],
      ),
    );
  }
}
