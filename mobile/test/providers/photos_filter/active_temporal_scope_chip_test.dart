import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/timeline_temporal_scope.model.dart';
import 'package:immich_mobile/providers/photos_filter/active_chips.dart';
import 'package:immich_mobile/providers/photos_filter/chip_id.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('en');
  });

  group('activeTemporalScopeChip', () {
    test('returns no chip for none scope', () {
      expect(activeTemporalScopeChip(const TimelineTemporalScope.none(), locale: 'en'), isNull);
    });

    test('year scope yields temporal chip spec', () {
      final spec = activeTemporalScopeChip(const TimelineTemporalScope.year(2025), locale: 'en');

      expect(spec?.id, const TemporalScopeChipId());
      expect(spec?.label, '2025');
      expect(spec?.visual, ChipVisual.when);
    });

    test('month scope yields temporal chip spec', () {
      final spec = activeTemporalScopeChip(TimelineTemporalScope.month(year: 2025, month: 3), locale: 'en');

      expect(spec?.id, const TemporalScopeChipId());
      expect(spec?.label, 'Mar 2025');
      expect(spec?.visual, ChipVisual.when);
    });
  });
}
