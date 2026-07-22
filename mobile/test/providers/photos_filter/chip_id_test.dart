import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/providers/photos_filter/chip_id.dart';

void main() {
  group('ChipId equality', () {
    test('PersonChipId value equality', () {
      expect(const PersonChipId('alice'), const PersonChipId('alice'));
      expect(const PersonChipId('alice').hashCode, const PersonChipId('alice').hashCode);
      expect(const PersonChipId('alice'), isNot(const PersonChipId('bob')));
    });
    test('TagChipId value equality', () {
      expect(const TagChipId('t1'), const TagChipId('t1'));
      expect(const TagChipId('t1'), isNot(const TagChipId('t2')));
    });
    test('Value-less chip ids are equal across reads and distinct from each other', () {
      expect(SimpleChipId.location, SimpleChipId.location);
      expect(SimpleChipId.camera.hashCode, SimpleChipId.camera.hashCode);
      expect(SimpleChipId.values.toSet(), hasLength(SimpleChipId.values.length));
      for (final id in SimpleChipId.values) {
        expect(id, isA<ChipId>());
      }
    });

    test('Different value-less chip ids are NOT equal', () {
      expect(SimpleChipId.location, isNot(SimpleChipId.date));
    });
  });
}
