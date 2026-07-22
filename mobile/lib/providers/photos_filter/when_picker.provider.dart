import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/providers/photos_filter/photos_filter.provider.dart';
import 'package:immich_mobile/providers/photos_filter/temporal_utils.dart';
import 'package:immich_mobile/providers/photos_filter/time_buckets.provider.dart';

/// Parsed "When picker" search query.
///
/// The search field accepts year tokens like `2024` and decade tokens like
/// `2020s` or `20s`. Unparseable / empty strings fall back to [whenQueryNone].
/// The record shape gives structural equality for free.
typedef WhenQuery = ({int? year, int? decadeStart});

/// Neither a year nor a decade was recognised in the query.
const WhenQuery whenQueryNone = (year: null, decadeStart: null);

WhenQuery whenQueryYear(int year) => (year: year, decadeStart: null);
WhenQuery whenQueryDecade(int decadeStart) => (year: null, decadeStart: decadeStart);

/// Accepted tokens (case-insensitive, whitespace trimmed):
///   - 4-digit year:        `2024`          → `(year: 2024, decadeStart: null)`
///   - 2-digit decade:      `20s` / `20S`   → `(year: null, decadeStart: 2020)`
///   - 4-digit decade:      `2020s`         → `(year: null, decadeStart: 2020)`
///   - empty / garbage:                     → [whenQueryNone]
///
/// 2-digit decade heuristic: `Xs` where X in 00..99 means "20Xs" (the 2000-2099
/// range). Gallery photos are almost entirely 2000-onward; the ambiguity is
/// resolved in the common direction.
///
/// 3-digit prefixes before `s` (e.g. `202s`) and non-decade-start 4-digit
/// years with `s` (e.g. `2025s`) are rejected as [whenQueryNone].
WhenQuery parseWhenQuery(String raw) {
  final s = raw.trim().toLowerCase();
  if (s.isEmpty) return whenQueryNone;

  // 4-digit year
  if (RegExp(r'^\d{4}$').hasMatch(s)) {
    return whenQueryYear(int.parse(s));
  }

  // 4-digit decade: 2020s (only accept decade-start years, last digit 0)
  final mDec4 = RegExp(r'^(\d{4})s$').firstMatch(s);
  if (mDec4 != null) {
    final year = int.parse(mDec4.group(1)!);
    if (year % 10 == 0) return whenQueryDecade(year);
    return whenQueryNone;
  }

  // 2-digit decade: 20s → 2020s. Range 00..99.
  final mDec2 = RegExp(r'^(\d{2})s$').firstMatch(s);
  if (mDec2 != null) {
    final suffix = int.parse(mDec2.group(1)!);
    return whenQueryDecade(2000 + suffix);
  }

  return whenQueryNone;
}

/// Live query string. `StateProvider` so the TextField can write and the
/// parser/filter providers can react.
final whenPickerQueryProvider = StateProvider<String>((ref) => '');

/// Pure derivation of [WhenQuery] from [whenPickerQueryProvider].
final whenPickerParsedProvider = Provider<WhenQuery>((ref) {
  return parseWhenQuery(ref.watch(whenPickerQueryProvider));
});

/// The list of years with photos matching the current parsed query + the
/// sheet's broader filter context.
///
/// Filter semantics:
/// - year n → years containing exactly n (0 or 1 entry).
/// - decadeStart d → years in [d, d+10).
/// - [whenQueryNone] with empty query → all years from time buckets.
/// - [whenQueryNone] with non-empty query (garbage input) → empty list.
final whenPickerFilteredYearsProvider = FutureProvider.autoDispose<List<YearCount>>((ref) async {
  final filter = ref.watch(photosFilterProvider);
  final buckets = await ref.watch(timeBucketsProvider(filter).future);
  final parsed = ref.watch(whenPickerParsedProvider);
  final query = ref.watch(whenPickerQueryProvider).trim();
  final allYears = aggregateYears(buckets);

  return switch (parsed) {
    (year: final int year, decadeStart: _) => allYears.where((y) => y.year == year).toList(),
    (year: _, decadeStart: final int start) => allYears.where((y) => y.year >= start && y.year < start + 10).toList(),
    _ when query.isEmpty => allYears,
    _ => <YearCount>[],
  };
});
