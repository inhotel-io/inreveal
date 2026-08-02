import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/platform/live_text_api.g.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_overlay.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_callback_dispatcher.dart';
import 'package:immich_mobile/providers/infrastructure/live_text.provider.dart';
import 'package:immich_mobile/widgets/photo_view/photo_view.dart';
// ScaleBoundaries is not re-exported by photo_view.dart; deep same-package
// imports of the vendored photo_view are normal (see photo_view/src/**).
import 'package:immich_mobile/widgets/photo_view/src/utils/photo_view_utils.dart';
import 'package:mocktail/mocktail.dart';

import '../../../widget_tester_extensions.dart';

class MockLiveTextHostApi extends Mock implements LiveTextHostApi {}

const _previewUrl = 'http://localhost:0/assets/asset-1/thumbnail?size=preview';

/// PhotoView reports `childSize` as the *decoded* size, which for a remote
/// asset is the downscaled preview rather than the stored dimensions.
ScaleBoundaries _boundaries({required Size childSize, Size outerSize = const Size(400, 800)}) =>
    ScaleBoundaries(PhotoViewComputedScale.contained, PhotoViewComputedScale.covered, 1.0, outerSize, childSize);

void main() {
  late MockLiveTextHostApi api;

  setUp(() {
    api = MockLiveTextHostApi();
    when(() => api.loadImage(any(), any())).thenAnswer((_) async {});
    when(() => api.dispose(any())).thenAnswer((_) async {});
    when(() => api.setContentsRect(any(), any(), any(), any(), any())).thenAnswer((_) async {});
  });

  Widget subject({
    Size viewportSize = const Size(400, 800),
    Size imageSize = const Size(400, 800),
    String previewUrl = _previewUrl,
    ValueChanged<bool>? onAnalysisComplete,
    PhotoViewControllerBase? controller,
    required void Function(void Function(int)) captureOnCreated,
  }) => LiveTextOverlay(
    previewUrl: previewUrl,
    imageSize: imageSize,
    viewportSize: viewportSize,
    controller: controller,
    onAnalysisComplete: onAnalysisComplete ?? (_) {},
    platformViewBuilder: (onCreated) {
      captureOnCreated(onCreated);
      return const SizedBox.shrink();
    },
  );

  Future<void Function(int)> pump(
    WidgetTester tester, {
    Size viewportSize = const Size(400, 800),
    Size imageSize = const Size(400, 800),
    ValueChanged<bool>? onAnalysisComplete,
    PhotoViewControllerBase? controller,
    bool createView = true,
  }) async {
    late void Function(int) created;

    await tester.pumpConsumerWidgetRaw(
      subject(
        viewportSize: viewportSize,
        imageSize: imageSize,
        onAnalysisComplete: onAnalysisComplete,
        controller: controller,
        captureOnCreated: (cb) => created = cb,
      ),
      overrides: [liveTextHostApiProvider.overrideWithValue(api)],
    );
    await tester.pump();

    if (createView) {
      created(7);
      await tester.pump();
    }
    return created;
  }

  group('LiveTextOverlay', () {
    testWidgets('asks native to analyse the preview once the platform view exists', (tester) async {
      await pump(tester);

      verify(() => api.loadImage(7, _previewUrl)).called(1);
    });

    testWidgets('pushes the initial contents rect for an unzoomed image', (tester) async {
      await pump(tester);

      verify(() => api.setContentsRect(7, 0.0, 0.0, 1.0, 1.0)).called(1);
    });

    testWidgets('does not talk to native before the platform view is created', (tester) async {
      await pump(tester, createView: false);

      verifyNever(() => api.loadImage(any(), any()));
      verifyNever(() => api.setContentsRect(any(), any(), any(), any(), any()));
    });

    testWidgets('pushes a new contents rect when the controller reports a zoom', (tester) async {
      final controller = PhotoViewController();
      addTearDown(controller.dispose);

      await pump(tester, controller: controller);
      clearInteractions(api);

      controller.scale = 2.0;
      await tester.pump();

      verify(() => api.setContentsRect(7, -0.5, -0.5, 2.0, 2.0)).called(1);
    });

    testWidgets('pushes a new contents rect when the controller reports a pan', (tester) async {
      final controller = PhotoViewController(initialScale: 1.0);
      addTearDown(controller.dispose);

      await pump(tester, controller: controller);
      clearInteractions(api);

      controller.position = const Offset(100, -80);
      await tester.pump();

      verify(() => api.setContentsRect(7, 0.25, -0.1, 1.0, 1.0)).called(1);
    });

    testWidgets('skips redundant pushes when the controller re-emits an identical transform', (tester) async {
      final controller = PhotoViewController(initialScale: 1.0);
      addTearDown(controller.dispose);

      await pump(tester, controller: controller);
      controller.scale = 2.0;
      await tester.pump();
      clearInteractions(api);

      // Re-pump with identical props: didUpdateWidget calls _pushContentsRect
      // directly, bypassing the controller's own equality short-circuit, so this
      // genuinely exercises the widget's _lastRect guard.
      await tester.pumpConsumerWidgetRaw(
        subject(controller: controller, captureOnCreated: (_) {}),
        overrides: [liveTextHostApiProvider.overrideWithValue(api)],
      );
      await tester.pump();

      verifyNever(() => api.setContentsRect(any(), any(), any(), any(), any()));
    });

    testWidgets('prefers the decoded childSize over the stored asset dimensions', (tester) async {
      final controller = PhotoViewController(initialScale: 1.0);
      addTearDown(controller.dispose);
      // Server served a 200x400 preview for a 4000x8000 asset.
      controller.scaleBoundaries = _boundaries(childSize: const Size(200, 400));

      await pump(tester, controller: controller, imageSize: const Size(4000, 8000));

      // 200x400 at scale 1.0 in a 400x800 viewport => centred quarter.
      verify(() => api.setContentsRect(7, 0.25, 0.25, 0.5, 0.5)).called(1);
    });

    testWidgets('seeds the transform from a controller that has already laid out', (tester) async {
      final controller = PhotoViewController(initialScale: 2.0);
      addTearDown(controller.dispose);
      controller.scaleBoundaries = _boundaries(childSize: const Size(400, 800));

      await pump(tester, controller: controller);

      verify(() => api.setContentsRect(7, -0.5, -0.5, 2.0, 2.0)).called(1);
    });

    testWidgets('ignores a controller transform until scaleBoundaries is set', (tester) async {
      // Before layout PhotoView reports a placeholder scale of 1.0 that is wrong
      // for any image that does not exactly fill the viewport.
      final controller = PhotoViewController(initialScale: 2.0);
      addTearDown(controller.dispose);

      await pump(tester, controller: controller, imageSize: const Size(800, 800));

      // Falls back to the contained scale (0.5), not the untrustworthy 2.0.
      verify(() => api.setContentsRect(7, 0.0, 0.25, 1.0, 0.5)).called(1);
    });

    testWidgets('resubscribes when the controller instance is swapped', (tester) async {
      final first = PhotoViewController(initialScale: 1.0);
      final second = PhotoViewController(initialScale: 1.0);
      addTearDown(first.dispose);
      addTearDown(second.dispose);

      await pump(tester, controller: first);

      await tester.pumpConsumerWidgetRaw(
        subject(controller: second, captureOnCreated: (_) {}),
        overrides: [liveTextHostApiProvider.overrideWithValue(api)],
      );
      await tester.pump();
      clearInteractions(api);

      // The old controller must no longer drive the overlay.
      first.scale = 3.0;
      await tester.pump();
      verifyNever(() => api.setContentsRect(any(), any(), any(), any(), any()));

      second.scale = 2.0;
      await tester.pump();
      verify(() => api.setContentsRect(7, -0.5, -0.5, 2.0, 2.0)).called(1);
    });

    testWidgets('disposes the native view when removed from the tree', (tester) async {
      await pump(tester);

      await tester.pumpConsumerWidgetRaw(
        const SizedBox.shrink(),
        overrides: [liveTextHostApiProvider.overrideWithValue(api)],
      );
      await tester.pump();

      verify(() => api.dispose(7)).called(1);
    });

    testWidgets('unregisters from the callback dispatcher on dispose', (tester) async {
      final before = LiveTextCallbackDispatcher.instance.listenerCount;
      await pump(tester);
      expect(LiveTextCallbackDispatcher.instance.listenerCount, before + 1);

      await tester.pumpConsumerWidgetRaw(
        const SizedBox.shrink(),
        overrides: [liveTextHostApiProvider.overrideWithValue(api)],
      );
      await tester.pump();

      expect(
        LiveTextCallbackDispatcher.instance.listenerCount,
        before,
        reason: 'leaking listeners would misroute callbacks after paging',
      );
    });

    testWidgets('reports the analysis result through onAnalysisComplete', (tester) async {
      bool? reported;
      await pump(tester, onAnalysisComplete: (hasText) => reported = hasText);

      tester.state<LiveTextOverlayState>(find.byType(LiveTextOverlay)).onAnalysisComplete(false);
      await tester.pump();

      expect(reported, isFalse);
    });

    testWidgets('a degenerate viewport pushes a zero rect rather than NaN', (tester) async {
      await pump(tester, viewportSize: Size.zero);

      verify(() => api.setContentsRect(7, 0.0, 0.0, 0.0, 0.0)).called(1);
    });

    testWidgets('reloads the analysis when the preview url changes', (tester) async {
      await pump(tester);
      clearInteractions(api);

      await tester.pumpConsumerWidgetRaw(
        subject(previewUrl: 'http://localhost:0/assets/asset-2/thumbnail?size=preview', captureOnCreated: (_) {}),
        overrides: [liveTextHostApiProvider.overrideWithValue(api)],
      );
      await tester.pump();

      verify(() => api.loadImage(7, 'http://localhost:0/assets/asset-2/thumbnail?size=preview')).called(1);
    });

    testWidgets('does not reload when an unrelated prop changes', (tester) async {
      await pump(tester);
      clearInteractions(api);

      await tester.pumpConsumerWidgetRaw(
        subject(viewportSize: const Size(400, 900), captureOnCreated: (_) {}),
        overrides: [liveTextHostApiProvider.overrideWithValue(api)],
      );
      await tester.pump();

      verifyNever(() => api.loadImage(any(), any()));
    });
  });
}
