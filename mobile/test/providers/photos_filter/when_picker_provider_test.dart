import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/providers/photos_filter/temporal_utils.dart';
import 'package:immich_mobile/providers/photos_filter/time_buckets.provider.dart';
import 'package:immich_mobile/providers/photos_filter/when_picker.provider.dart';

void main() {
  group('parseWhenQuery', () {
    test('4-digit year', () {
      expect(parseWhenQuery('2024'), whenQueryYear(2024));
      expect(parseWhenQuery('1999'), whenQueryYear(1999));
    });

    test('2-digit decade suffix', () {
      expect(parseWhenQuery('20s'), whenQueryDecade(2020));
      expect(parseWhenQuery('00s'), whenQueryDecade(2000));
    });

    test('4-digit decade', () {
      expect(parseWhenQuery('2020s'), whenQueryDecade(2020));
      expect(parseWhenQuery('1990s'), whenQueryDecade(1990));
    });

    test('decade with whitespace', () {
      expect(parseWhenQuery(' 2020s '), whenQueryDecade(2020));
      expect(parseWhenQuery('  20s'), whenQueryDecade(2020));
    });

    test('case-insensitive decade suffix', () {
      expect(parseWhenQuery('20S'), whenQueryDecade(2020));
      expect(parseWhenQuery('2020S'), whenQueryDecade(2020));
    });

    test('rejects 3-digit', () {
      expect(parseWhenQuery('202'), whenQueryNone);
      expect(parseWhenQuery('202s'), whenQueryNone);
    });

    test('rejects 5-digit', () {
      expect(parseWhenQuery('20248'), whenQueryNone);
      expect(parseWhenQuery('20248s'), whenQueryNone);
    });

    test('rejects non-decade-start 4-digit with s', () {
      expect(parseWhenQuery('2025s'), whenQueryNone);
      expect(parseWhenQuery('2021s'), whenQueryNone);
    });

    test('empty and garbage return none', () {
      expect(parseWhenQuery(''), whenQueryNone);
      expect(parseWhenQuery('   '), whenQueryNone);
      expect(parseWhenQuery('apples'), whenQueryNone);
      expect(parseWhenQuery('2024apples'), whenQueryNone);
    });

    test('WhenQuery equality', () {
      expect(whenQueryYear(2024), whenQueryYear(2024));
      expect(whenQueryYear(2024), isNot(whenQueryYear(2023)));
      expect(whenQueryDecade(2020), whenQueryDecade(2020));
      expect(whenQueryNone, whenQueryNone);
      expect(whenQueryYear(2024), isNot(whenQueryDecade(2020)));
    });
  });

  group('WhenQuery record accessors', () {
    test('yearValue returns int for year query, null otherwise', () {
      expect(whenQueryYear(2024).year, 2024);
      expect(whenQueryYear(1999).year, 1999);
      expect(whenQueryDecade(2020).year, isNull);
      expect(whenQueryNone.year, isNull);
    });

    test('decadeStartValue returns int for decade query, null otherwise', () {
      expect(whenQueryDecade(2020).decadeStart, 2020);
      expect(whenQueryDecade(1990).decadeStart, 1990);
      expect(whenQueryYear(2024).decadeStart, isNull);
      expect(whenQueryNone.decadeStart, isNull);
    });
  });

  group('whenPickerParsedProvider', () {
    test('reacts to whenPickerQueryProvider', () {
      final c = ProviderContainer();
      addTearDown(c.dispose);
      expect(c.read(whenPickerParsedProvider), whenQueryNone);

      c.read(whenPickerQueryProvider.notifier).state = '2024';
      expect(c.read(whenPickerParsedProvider), whenQueryYear(2024));

      c.read(whenPickerQueryProvider.notifier).state = '20s';
      expect(c.read(whenPickerParsedProvider), whenQueryDecade(2020));
    });
  });

  group('whenPickerFilteredYearsProvider', () {
    ProviderContainer buildContainer(List<BucketLite> buckets) {
      return ProviderContainer(overrides: [timeBucketsProvider.overrideWith((ref, filter) => Future.value(buckets))]);
    }

    test('empty query → all years', () async {
      final c = buildContainer(const [(timeBucket: '2024-06-01', count: 12), (timeBucket: '2020-03-01', count: 3)]);
      addTearDown(c.dispose);
      final result = await c.read(whenPickerFilteredYearsProvider.future);
      expect(result.map((y) => y.year), [2024, 2020]);
    });

    test('year query filters to matching year', () async {
      final c = buildContainer(const [(timeBucket: '2024-06-01', count: 12), (timeBucket: '2020-03-01', count: 3)]);
      addTearDown(c.dispose);
      c.read(whenPickerQueryProvider.notifier).state = '2024';
      final result = await c.read(whenPickerFilteredYearsProvider.future);
      expect(result.map((y) => y.year), [2024]);
    });

    test('year query with no match → empty', () async {
      final c = buildContainer(const [(timeBucket: '2024-06-01', count: 12)]);
      addTearDown(c.dispose);
      c.read(whenPickerQueryProvider.notifier).state = '1800';
      final result = await c.read(whenPickerFilteredYearsProvider.future);
      expect(result, isEmpty);
    });

    test('decade query filters to years in [start, start+10)', () async {
      final c = buildContainer(const [
        (timeBucket: '2024-01-01', count: 1),
        (timeBucket: '2020-01-01', count: 1),
        (timeBucket: '2018-01-01', count: 1),
        (timeBucket: '2029-01-01', count: 1),
        (timeBucket: '2030-01-01', count: 1),
      ]);
      addTearDown(c.dispose);
      c.read(whenPickerQueryProvider.notifier).state = '2020s';
      final result = await c.read(whenPickerFilteredYearsProvider.future);
      final years = result.map((y) => y.year).toList()..sort();
      expect(years, [2020, 2024, 2029]);
    });

    test('garbage query (parses as none, non-empty) → empty', () async {
      final c = buildContainer(const [(timeBucket: '2024-06-01', count: 12)]);
      addTearDown(c.dispose);
      c.read(whenPickerQueryProvider.notifier).state = 'apples';
      final result = await c.read(whenPickerFilteredYearsProvider.future);
      expect(result, isEmpty);
    });
  });
}
