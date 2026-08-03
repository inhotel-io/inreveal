import 'dart:math' as math;
import 'dart:ui';

/// Maps the PhotoView transform onto the rectangle occupied by the image,
/// expressed in unit coordinates of the viewport.
///
/// This is what VisionKit's `ImageAnalysisInteraction.contentsRect` expects for
/// hosts that are not a `UIImageView`. The result is deliberately **not**
/// clamped to `0..1`: while the user is zoomed in the image genuinely extends
/// past the viewport, and clamping would shift every recognised text box.
///
/// Mirrors the placement math in `ocr_overlay.widget.dart` so the native and
/// Flutter overlays agree on where the image is.
Rect liveTextContentsRect({
  required Size imageSize,
  required Size viewportSize,
  double? scale,
  Offset position = Offset.zero,
}) {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return Rect.zero;
  }
  if (imageSize.width <= 0 || imageSize.height <= 0) {
    return Rect.zero;
  }
  if (!position.dx.isFinite || !position.dy.isFinite) {
    return Rect.zero;
  }

  final effectiveScale =
      scale ?? math.min(viewportSize.width / imageSize.width, viewportSize.height / imageSize.height);

  if (!effectiveScale.isFinite || effectiveScale <= 0) {
    return Rect.zero;
  }

  final width = imageSize.width * effectiveScale;
  final height = imageSize.height * effectiveScale;

  // Image centre in viewport space, accounting for pan.
  final centerX = viewportSize.width / 2 + position.dx;
  final centerY = viewportSize.height / 2 + position.dy;

  return Rect.fromLTWH(
    (centerX - width / 2) / viewportSize.width,
    (centerY - height / 2) / viewportSize.height,
    width / viewportSize.width,
    height / viewportSize.height,
  );
}

/// Whether [position] (in viewport coordinates) lands on recognised text.
///
/// Flutter's gesture arena resolves *before* UIKit hit-testing, so the native
/// `hitTest` can never decide who gets a pointer — Dart has to. [textRects] are
/// the server's OCR boxes in normalised image coordinates (0..1); VisionKit
/// does not publish per-line geometry, and the two agree closely enough to
/// answer "is the finger on text?".
///
/// [contentsRect] is the image's placement from [liveTextContentsRect], so this
/// automatically tracks pan and zoom.
bool liveTextHitsText({
  required Offset position,
  required List<Rect> textRects,
  required Rect contentsRect,
  required Size viewportSize,
  double margin = 8,
}) {
  if (contentsRect.width <= 0 || contentsRect.height <= 0) {
    return false;
  }
  if (!position.dx.isFinite || !position.dy.isFinite) {
    return false;
  }

  for (final text in textRects) {
    final rect = Rect.fromLTRB(
      (contentsRect.left + text.left * contentsRect.width) * viewportSize.width,
      (contentsRect.top + text.top * contentsRect.height) * viewportSize.height,
      (contentsRect.left + text.right * contentsRect.width) * viewportSize.width,
      (contentsRect.top + text.bottom * contentsRect.height) * viewportSize.height,
    );
    if (rect.inflate(margin).contains(position)) {
      return true;
    }
  }

  return false;
}
