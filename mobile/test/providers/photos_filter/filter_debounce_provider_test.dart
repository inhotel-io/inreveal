import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/models/search/search_filter.model.dart';
import 'package:immich_mobile/providers/photos_filter/filter_debounce.provider.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';

void main() {
  test('timeline filter debounce emits at ~800ms, not at 600ms', () async {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final emitted = <String?>[];
    c.listen<SearchFilter>(
      photosTimelineFilterProvider,
      (_, next) => emitted.add(next.context),
      fireImmediately: false,
    );

    c.read(photosFilterProvider.notifier).setText('nature');
    await Future<void>.delayed(const Duration(milliseconds: 600));
    expect(emitted, isEmpty, reason: 'must not have settled before 800ms');

    await Future<void>.delayed(const Duration(milliseconds: 350)); // ~950ms total
    expect(emitted.last, 'nature');
  });

  test('suggestions debounce still emits at ~250ms', () async {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final emitted = <String?>[];
    c.listen<SearchFilter>(
      photosFilterDebouncedProvider,
      (_, next) => emitted.add(next.context),
      fireImmediately: false,
    );
    c.read(photosFilterProvider.notifier).setText('beach');
    await Future<void>.delayed(const Duration(milliseconds: 350));
    expect(emitted.last, 'beach');
  });
}
