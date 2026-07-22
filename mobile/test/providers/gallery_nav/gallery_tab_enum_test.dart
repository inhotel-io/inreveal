import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/providers/gallery_nav/gallery_tab_enum.dart';

void main() {
  group('GalleryTabEnum', () {
    test('enum values in canonical order', () {
      expect(GalleryTabEnum.values, [GalleryTabEnum.photos, GalleryTabEnum.albums, GalleryTabEnum.library]);
    });

    test('indices are the bottom-nav tab order', () {
      expect(GalleryTabEnum.photos.index, 0);
      expect(GalleryTabEnum.albums.index, 1);
      expect(GalleryTabEnum.library.index, 2);
    });
  });
}
