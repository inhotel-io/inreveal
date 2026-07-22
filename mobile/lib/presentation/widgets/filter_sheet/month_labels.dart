import 'package:easy_localization/easy_localization.dart';

/// Short month labels (Jan…Dec), i18n-key-backed rather than `intl`'s
/// `DateFormat.MMM()` — the curated translations differ from CLDR in several
/// locales (fr `Janv` vs `janv.`, it `Gen` vs `gen`), so the keys are the
/// source of truth.
const kMonthKeys = <String>[
  'filter_sheet_deep_when_month_jan',
  'filter_sheet_deep_when_month_feb',
  'filter_sheet_deep_when_month_mar',
  'filter_sheet_deep_when_month_apr',
  'filter_sheet_deep_when_month_may',
  'filter_sheet_deep_when_month_jun',
  'filter_sheet_deep_when_month_jul',
  'filter_sheet_deep_when_month_aug',
  'filter_sheet_deep_when_month_sep',
  'filter_sheet_deep_when_month_oct',
  'filter_sheet_deep_when_month_nov',
  'filter_sheet_deep_when_month_dec',
];

/// Translated short label for a 1-based [month].
String monthLabel(int month) => kMonthKeys[month - 1].tr();
