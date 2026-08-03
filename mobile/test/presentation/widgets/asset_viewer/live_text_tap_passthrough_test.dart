import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/platform/live_text_api.g.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_overlay.widget.dart';
import 'package:immich_mobile/providers/infrastructure/live_text.provider.dart';
import 'package:mocktail/mocktail.dart';

import '../../../widget_tester_extensions.dart';

class MockLiveTextHostApi extends Mock implements LiveTextHostApi {}

/// Reproduces the asset page's real layering: the Live Text platform view is a
/// `Positioned.fill` sibling stacked ABOVE the widget that toggles the controls
/// on tap. On device, tapping while zoomed in (where nearly every point is over
/// text) stopped toggling the controls.
void main() {
  late MockLiveTextHostApi api;
  late List<String> log;

  setUp(() {
    api = MockLiveTextHostApi();
    when(() => api.loadImage(any(), any())).thenAnswer((_) async {});
    when(() => api.dispose(any())).thenAnswer((_) async {});
    when(() => api.setContentsRect(any(), any(), any(), any(), any())).thenAnswer((_) async {});
    log = <String>[];
  });

  Future<void> pumpViewer(WidgetTester tester, {required bool ocrOn}) async {
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform_views,
      (call) async => call.method == 'create' ? 0 : null,
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform_views, null),
    );

    await tester.pumpConsumerWidgetRaw(
      Stack(
        alignment: Alignment.topLeft,
        children: [
          // Stands in for PhotoView: tapping it toggles the controls.
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => log.add('toggle-controls'),
            onTapDown: (_) => log.add('down'),
            onTapCancel: () => log.add('cancel'),
            child: const SizedBox(width: 400, height: 600),
          ),
          if (ocrOn)
            Positioned.fill(
              child: LiveTextOverlay(
                previewUrl: 'http://localhost:0/preview',
                imageSize: const Size(400, 600),
                viewportSize: const Size(400, 600),
                onAnalysisComplete: (_) {},
                // Zoomed into a document: the whole viewport is text.
                textRects: const [Rect.fromLTRB(0, 0, 1, 1)],
                onTap: () => log.add('toggle-controls'),
              ),
            ),
        ],
      ),
      overrides: [liveTextHostApiProvider.overrideWithValue(api)],
    );
    await tester.pump();
  }

  testWidgets('control: a tap toggles the controls with the overlay absent', (tester) async {
    await pumpViewer(tester, ocrOn: false);

    await tester.tapAt(const Offset(200, 300));
    await tester.pump();

    expect(log, contains('toggle-controls'));
  });

  testWidgets('a tap over text still toggles the controls with the overlay present', (tester) async {
    await pumpViewer(tester, ocrOn: true);

    await tester.tapAt(const Offset(200, 300));
    await tester.pump();

    expect(log, contains('toggle-controls'), reason: 'the platform view must not swallow a plain tap');
  });
}
