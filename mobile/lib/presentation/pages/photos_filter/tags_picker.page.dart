import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/picker_no_results_panel.widget.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/picker_search_header.widget.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/selected_tags_strip.widget.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/tags_picker_list.widget.dart';
import 'package:immich_mobile/providers/infrastructure/tag.provider.dart';
import 'package:immich_mobile/providers/photos_filter/tags_picker.provider.dart';

@RoutePage()
class TagsPickerPage extends HookConsumerWidget {
  const TagsPickerPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = useTextEditingController(text: ref.read(tagsPickerQueryProvider));

    // Keep controller text in sync if provider changes externally (e.g. the
    // Clear-search button in the no-results panel below).
    ref.listen<String>(tagsPickerQueryProvider, (prev, next) {
      if (controller.text != next) {
        controller.text = next;
        controller.selection = TextSelection.collapsed(offset: next.length);
      }
    });

    final filteredAsync = ref.watch(tagsPickerFilteredProvider);
    final query = ref.watch(tagsPickerQueryProvider);

    List<Widget> bodySlivers() => filteredAsync.when(
      loading: () => const [SliverFillRemaining(child: Center(child: CircularProgressIndicator()))],
      error: (e, st) => [
        SliverFillRemaining(
          child: Center(
            child: TextButton.icon(
              key: const Key('tags-picker-retry'),
              onPressed: () => ref.invalidate(tagProvider),
              icon: const Icon(Icons.refresh_rounded),
              label: Text('filter_sheet_load_error_retry'.tr()),
            ),
          ),
        ),
      ],
      data: (filtered) {
        if (filtered.isEmpty && query.trim().isNotEmpty) {
          return [
            SliverFillRemaining(
              hasScrollBody: false,
              child: PickerNoResultsPanel(
                keyPrefix: 'tags-picker',
                query: query.trim(),
                onClear: () => ref.read(tagsPickerQueryProvider.notifier).state = '',
              ),
            ),
          ];
        }
        if (filtered.isEmpty) {
          return const [SliverToBoxAdapter(child: SizedBox.shrink())];
        }
        return [SliverFillRemaining(hasScrollBody: true, child: TagsPickerList(tags: filtered))];
      },
    );

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'back'.tr(),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text('filter_sheet_picker_tags_title'.tr()),
        actions: [
          TextButton(
            key: const Key('tags-picker-done'),
            onPressed: () => Navigator.of(context).maybePop(),
            child: Text('filter_sheet_picker_done'.tr()),
          ),
        ],
      ),
      body: CustomScrollView(
        slivers: [
          PickerSearchHeader(
            keyPrefix: 'tags-picker',
            hintKey: 'filter_sheet_picker_search_tags_hint',
            controller: controller,
            value: controller.text,
            onChanged: (v) => ref.read(tagsPickerQueryProvider.notifier).state = v,
          ),
          const SliverToBoxAdapter(child: SelectedTagsStrip()),
          ...bodySlivers(),
        ],
      ),
    );
  }
}
