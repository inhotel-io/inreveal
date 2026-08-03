import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_overlay.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/ocr_overlay.widget.dart';
import 'package:immich_mobile/providers/asset_viewer/asset_viewer.provider.dart';
import 'package:immich_mobile/providers/infrastructure/live_text.provider.dart';
import 'package:immich_mobile/providers/infrastructure/ocr.provider.dart';
import 'package:immich_mobile/utils/image_url_builder.dart';
import 'package:immich_mobile/widgets/photo_view/photo_view.dart';
import 'package:openapi/api.dart';

/// Picks the OCR text-selection surface for the current platform.
///
/// On iOS 16+ with supporting hardware this is Apple's Live Text, which allows
/// dragging a selection across multiple lines. Everywhere else — and whenever
/// Live Text finds no text in an image the server did OCR — it falls back to
/// the upstream per-line overlay.
///
/// This exists so `asset_page.widget.dart` (upstream code) needs only a
/// one-identifier change.
class OcrOverlaySwitcher extends ConsumerStatefulWidget {
  final BaseAsset asset;
  final Size imageSize;
  final Size viewportSize;
  final PhotoViewControllerBase? controller;

  const OcrOverlaySwitcher({
    super.key,
    required this.asset,
    required this.imageSize,
    required this.viewportSize,
    this.controller,
  });

  @override
  ConsumerState<OcrOverlaySwitcher> createState() => _OcrOverlaySwitcherState();
}

class _OcrOverlaySwitcherState extends ConsumerState<OcrOverlaySwitcher> {
  bool _liveTextFoundNoText = false;

  @override
  void didUpdateWidget(OcrOverlaySwitcher oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.asset != widget.asset) {
      _liveTextFoundNoText = false;
    }
  }

  /// Server OCR quads collapsed to axis-aligned bounds in normalised image
  /// coordinates. Rotation is irrelevant here — these only answer "did the
  /// finger land on text?".
  List<Rect> _textRects(String assetId) {
    final ocr = ref.watch(ocrAssetProvider(assetId)).valueOrNull;
    if (ocr == null) {
      return const [];
    }

    return [
      for (final box in ocr)
        Rect.fromLTRB(
          [box.x1, box.x2, box.x3, box.x4].reduce(math.min),
          [box.y1, box.y2, box.y3, box.y4].reduce(math.min),
          [box.x1, box.x2, box.x3, box.x4].reduce(math.max),
          [box.y1, box.y2, box.y3, box.y4].reduce(math.max),
        ),
    ];
  }

  Widget _serverOverlay() => OcrOverlay(
    asset: widget.asset,
    imageSize: widget.imageSize,
    viewportSize: widget.viewportSize,
    controller: widget.controller,
  );

  @override
  Widget build(BuildContext context) {
    final asset = widget.asset;
    if (asset is! RemoteAsset || _liveTextFoundNoText) {
      return _serverOverlay();
    }

    // Anything other than a resolved `true` keeps the upstream overlay.
    final supported = ref.watch(liveTextSupportedProvider).valueOrNull ?? false;
    if (!supported) {
      return _serverOverlay();
    }

    return LiveTextOverlay(
      previewUrl: getThumbnailUrlForRemoteId(asset.id, type: AssetMediaSize.preview, thumbhash: asset.thumbHash ?? ''),
      imageSize: widget.imageSize,
      viewportSize: widget.viewportSize,
      controller: widget.controller,
      // The server's boxes stand in for VisionKit's, which it does not publish.
      // They only decide which pointers reach the native view, so approximate
      // agreement is enough; an empty list simply leaves every gesture with
      // Flutter, which is the pre-Live-Text behaviour.
      textRects: _textRects(asset.id),
      // A hit-testable platform view swallows every tap in its bounds before
      // any widget below sees it, so `asset_page._onTapUp` never runs while the
      // overlay is mounted. Drive the same toggle from here instead.
      //
      // Known gap: the `tapToNavigate` setting's left/right-quarter navigation
      // is not reproduced, because that needs the asset page's own
      // `onTapNavigate`. It is off by default (`viewer_config.dart`).
      onTap: ref.read(assetViewerProvider.notifier).toggleControls,
      onAnalysisComplete: (hasText) {
        if (!hasText && mounted) {
          setState(() => _liveTextFoundNoText = true);
        }
      },
    );
  }
}
