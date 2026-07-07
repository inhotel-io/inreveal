import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/deep/deep_section_scaffold.widget.dart';
import 'package:immich_mobile/presentation/widgets/filter_sheet/filter_section_id.dart';
import 'package:immich_mobile/providers/photos_filter/collapsed_sections.provider.dart';

class _FakePrefs implements FilterSectionPrefs {
  Set<FilterSectionId> stored;
  _FakePrefs(this.stored);
  @override
  Set<FilterSectionId> loadCollapsed() => stored;
  @override
  Future<void> saveCollapsed(Set<FilterSectionId> ids) async => stored = ids;
}

Widget _host(AsyncValue<List<String>> items, {Set<FilterSectionId> collapsed = const {}}) => ProviderScope(
      overrides: [filterSectionPrefsProvider.overrideWithValue(_FakePrefs({...collapsed}))],
      child: MaterialApp(
        localizationsDelegates: const [DefaultMaterialLocalizations.delegate, DefaultWidgetsLocalizations.delegate],
        home: Scaffold(
          body: ListView(children: [
            DeepSectionScaffold<String>(
              sectionId: FilterSectionId.tags,
              titleKey: FilterSectionId.tags.titleKey,
              emptyCaptionKey: 'filter_sheet_deep_empty_tags',
              items: items,
              childBuilder: (data) => Column(children: [for (final d in data) Text(d, key: Key('item-$d'))]),
            ),
          ]),
        ),
      ),
    );

void main() {
  testWidgets('non-empty section renders items and is collapsible', (t) async {
    await t.pumpWidget(_host(const AsyncData(['a', 'b'])));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('item-a')), findsOneWidget);
    await t.tap(find.byKey(const Key('collapsible-header-tags')));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('item-a')), findsNothing);
  });

  testWidgets('empty section auto-collapses (items hidden, "(0)" shown)', (t) async {
    await t.pumpWidget(_host(const AsyncData(<String>[])));
    await t.pumpAndSettle();
    expect(find.textContaining('(0)'), findsOneWidget);
    // no items, and tapping does not expand (disabled)
    await t.tap(find.byKey(const Key('collapsible-header-tags')));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('deep-section-empty')), findsNothing);
  });
}
