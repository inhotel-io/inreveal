import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/utils/live_text_contents_rect.dart';

void main() {
  const viewport = Size(400, 800);

  void expectRect(Rect actual, Rect expected) {
    expect(actual.left, closeTo(expected.left, 1e-9));
    expect(actual.top, closeTo(expected.top, 1e-9));
    expect(actual.width, closeTo(expected.width, 1e-9));
    expect(actual.height, closeTo(expected.height, 1e-9));
  }

  group('liveTextContentsRect', () {
    test('an image scaled to exactly fill the viewport maps to the full unit rect', () {
      final rect = liveTextContentsRect(imageSize: const Size(400, 800), viewportSize: viewport, scale: 1.0);

      expectRect(rect, const Rect.fromLTWH(0, 0, 1, 1));
    });

    test('an image at half scale is centred and occupies the middle quarter', () {
      final rect = liveTextContentsRect(imageSize: const Size(400, 800), viewportSize: viewport, scale: 0.5);

      expectRect(rect, const Rect.fromLTWH(0.25, 0.25, 0.5, 0.5));
    });

    test('a landscape image in a portrait viewport is letterboxed (full width, inset vertically)', () {
      // 400x200 image at scale 1.0 in a 400x800 viewport => height 200/800 = 0.25
      final rect = liveTextContentsRect(imageSize: const Size(400, 200), viewportSize: viewport, scale: 1.0);

      expectRect(rect, const Rect.fromLTWH(0, 0.375, 1, 0.25));
    });

    test('a portrait image in a landscape viewport is pillarboxed (full height, inset horizontally)', () {
      final rect = liveTextContentsRect(
        imageSize: const Size(200, 400),
        viewportSize: const Size(800, 400),
        scale: 1.0,
      );

      expectRect(rect, const Rect.fromLTWH(0.375, 0, 0.25, 1));
    });

    test('a zoomed image returns an unclamped rect that extends beyond the viewport', () {
      final rect = liveTextContentsRect(imageSize: const Size(400, 800), viewportSize: viewport, scale: 2.0);

      expectRect(rect, const Rect.fromLTWH(-0.5, -0.5, 2, 2));
      expect(rect.left, lessThan(0), reason: 'clamping would misplace every text box while zoomed');
    });

    test('panning offsets the rect by the pan distance normalised to the viewport', () {
      final rect = liveTextContentsRect(
        imageSize: const Size(400, 800),
        viewportSize: viewport,
        scale: 1.0,
        position: const Offset(100, -80),
      );

      // dx 100/400 = 0.25, dy -80/800 = -0.1
      expectRect(rect, const Rect.fromLTWH(0.25, -0.1, 1, 1));
    });

    test('a null scale falls back to the contained scale', () {
      // contained scale for 800x800 in 400x800 is min(0.5, 1.0) = 0.5
      final rect = liveTextContentsRect(imageSize: const Size(800, 800), viewportSize: viewport);

      expectRect(rect, const Rect.fromLTWH(0, 0.25, 1, 0.5));
    });

    group('liveTextHitsText', () {
      // Image exactly fills the 400x800 viewport, so image units map 1:1.
      const fullBleed = Rect.fromLTWH(0, 0, 1, 1);
      // A line of text across the middle of the image.
      const line = Rect.fromLTRB(0.25, 0.5, 0.75, 0.55);

      bool hits(Offset position, {Rect contents = fullBleed, double margin = 8}) => liveTextHitsText(
        position: position,
        textRects: const [line],
        contentsRect: contents,
        viewportSize: viewport,
        margin: margin,
      );

      test('a point inside a text box is a hit', () {
        expect(hits(const Offset(200, 420)), isTrue);
      });

      test('a point well away from any text is a miss', () {
        expect(hits(const Offset(50, 100)), isFalse);
      });

      test('no text boxes means every pointer stays with Flutter', () {
        expect(
          liveTextHitsText(
            position: const Offset(200, 420),
            textRects: const [],
            contentsRect: fullBleed,
            viewportSize: viewport,
          ),
          isFalse,
        );
      });

      test('the margin makes near-misses count, so selection handles stay grabbable', () {
        // 4px above the top edge of the line (y = 0.5 * 800 = 400).
        expect(hits(const Offset(200, 396), margin: 0), isFalse);
        expect(hits(const Offset(200, 396)), isTrue);
      });

      test('a zoomed-in image moves the hit region with the text', () {
        const zoomed = Rect.fromLTWH(-0.5, -0.5, 2, 2);

        // At 1x the line covers x 100..300, y 400..440, so this point misses.
        expect(hits(const Offset(350, 460), margin: 0), isFalse);
        // Zoomed 2x it covers x 0..400, y 400..480, so the same point hits.
        expect(hits(const Offset(350, 460), contents: zoomed, margin: 0), isTrue);
      });

      test('a degenerate contents rect never claims a pointer', () {
        expect(hits(const Offset(200, 420), contents: Rect.zero), isFalse);
      });

      test('a non-finite position never claims a pointer', () {
        expect(hits(const Offset(double.nan, 420)), isFalse);
      });
    });

    group('degenerate input returns Rect.zero', () {
      test('zero viewport width', () {
        expect(liveTextContentsRect(imageSize: const Size(10, 10), viewportSize: const Size(0, 800)), Rect.zero);
      });

      test('zero viewport height', () {
        expect(liveTextContentsRect(imageSize: const Size(10, 10), viewportSize: const Size(400, 0)), Rect.zero);
      });

      test('zero image width', () {
        expect(liveTextContentsRect(imageSize: const Size(0, 10), viewportSize: viewport), Rect.zero);
      });

      test('zero image height', () {
        expect(liveTextContentsRect(imageSize: const Size(10, 0), viewportSize: viewport), Rect.zero);
      });

      test('zero scale', () {
        expect(liveTextContentsRect(imageSize: const Size(10, 10), viewportSize: viewport, scale: 0), Rect.zero);
      });

      test('negative scale', () {
        expect(liveTextContentsRect(imageSize: const Size(10, 10), viewportSize: viewport, scale: -1), Rect.zero);
      });

      test('non-finite scale', () {
        expect(
          liveTextContentsRect(imageSize: const Size(10, 10), viewportSize: viewport, scale: double.nan),
          Rect.zero,
        );
        expect(
          liveTextContentsRect(imageSize: const Size(10, 10), viewportSize: viewport, scale: double.infinity),
          Rect.zero,
        );
      });

      test('non-finite pan position', () {
        expect(
          liveTextContentsRect(
            imageSize: const Size(10, 10),
            viewportSize: viewport,
            scale: 1,
            position: const Offset(double.nan, 0),
          ),
          Rect.zero,
        );
      });
    });
  });
}
