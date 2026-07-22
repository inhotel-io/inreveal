import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/presentation/pages/common/gallery_tab_shell.page.dart';
import 'package:immich_mobile/routing/router.dart';

void main() {
  test('GalleryTabShellPage is a const-constructible widget', () {
    const page = GalleryTabShellPage();
    expect(page, isA<Widget>());
    expect(page.runtimeType.toString(), 'GalleryTabShellPage');
  });

  test('GalleryTabShellRoute is generated and points at the page', () {
    const route = GalleryTabShellRoute();
    expect(route.routeName, 'GalleryTabShellRoute');
  });
}
