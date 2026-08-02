import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_overlay.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/ocr_overlay.widget.dart';
import 'package:immich_mobile/providers/infrastructure/live_text.provider.dart';
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
      onAnalysisComplete: (hasText) {
        if (!hasText && mounted) {
          setState(() => _liveTextFoundNoText = true);
        }
      },
    );
  }
}
