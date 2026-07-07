import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/places_picker_country_accordion.widget.dart';
import 'package:immich_mobile/presentation/pages/photos_filter/widgets/places_picker_search_header.widget.dart';
import 'package:immich_mobile/providers/photos_filter/places_picker.provider.dart';

@RoutePage()
class PlacesPickerPage extends ConsumerStatefulWidget {
  const PlacesPickerPage({super.key});

  @override
  ConsumerState<PlacesPickerPage> createState() => _PlacesPickerPageState();
}

class _PlacesPickerPageState extends ConsumerState<PlacesPickerPage> {
  late final TextEditingController _controller;
  String? _expandedCountry;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: ref.read(placesPickerQueryProvider));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Keep controller text in sync if provider changes externally (e.g. the
    // Clear-search button in the no-results panel below).
    ref.listen<String>(placesPickerQueryProvider, (prev, next) {
      if (_controller.text != next) {
        _controller.text = next;
        _controller.selection = TextSelection.collapsed(offset: next.length);
      }
    });

    final countriesAsync = ref.watch(placesPickerCountriesProvider);
    final query = ref.watch(placesPickerQueryProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'back'.tr(),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text('filter_sheet_picker_places_title'.tr()),
        actions: [
          TextButton(
            key: const Key('places-picker-done'),
            onPressed: () => Navigator.of(context).maybePop(),
            child: Text('filter_sheet_picker_done'.tr()),
          ),
        ],
      ),
      body: CustomScrollView(
        slivers: [
          PlacesPickerSearchHeader(
            controller: _controller,
            value: _controller.text,
            onChanged: (v) => ref.read(placesPickerQueryProvider.notifier).state = v,
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 8)),
          ..._bodySlivers(countriesAsync, query),
        ],
      ),
    );
  }

  List<Widget> _bodySlivers(AsyncValue<List<String>> async, String query) {
    return async.when(
      loading: () => const [SliverFillRemaining(child: Center(child: CircularProgressIndicator(value: 0)))],
      error: (e, st) => [SliverFillRemaining(child: Center(child: Text('filter_sheet_load_error_retry'.tr())))],
      data: (countries) {
        if (countries.isEmpty && query.trim().isNotEmpty) {
          return [
            SliverFillRemaining(
              hasScrollBody: false,
              child: _PlacesNoResultsPanel(
                query: query.trim(),
                onClear: () => ref.read(placesPickerQueryProvider.notifier).state = '',
              ),
            ),
          ];
        }
        if (countries.isEmpty) {
          return const [SliverToBoxAdapter(child: SizedBox.shrink())];
        }
        return [
          SliverToBoxAdapter(
            child: PlacesPickerCountryAccordion(
              expandedCountry: _expandedCountry,
              onExpandCountry: (c) => setState(() => _expandedCountry = c),
            ),
          ),
        ];
      },
    );
  }
}

class _PlacesNoResultsPanel extends StatelessWidget {
  final String query;
  final VoidCallback onClear;
  const _PlacesNoResultsPanel({required this.query, required this.onClear});

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
            key: const Key('places-picker-clear-search'),
            onPressed: onClear,
            child: Text('filter_sheet_picker_clear_search'.tr()),
          ),
        ],
      ),
    );
  }
}
