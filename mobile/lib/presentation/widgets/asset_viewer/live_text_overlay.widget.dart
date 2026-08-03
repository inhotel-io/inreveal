import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/platform/live_text_api.g.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_callback_dispatcher.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_gesture_recognizer.dart';
import 'package:immich_mobile/providers/infrastructure/live_text.provider.dart';
import 'package:immich_mobile/utils/live_text_contents_rect.dart';
import 'package:immich_mobile/widgets/photo_view/photo_view.dart';

typedef LiveTextPlatformViewBuilder = Widget Function(void Function(int viewId) onCreated);

/// Hosts Apple's VisionKit Live Text interaction on top of the Flutter photo.
///
/// The native view renders nothing — Flutter still draws the image. Its only
/// job is to own an `ImageAnalysisInteraction` and receive the image's
/// on-screen rectangle so VisionKit places its highlights correctly while the
/// user pans and zooms.
class LiveTextOverlay extends ConsumerStatefulWidget {
  static const viewType = 'immich/live_text_overlay';

  final String previewUrl;
  final Size imageSize;
  final Size viewportSize;
  final ValueChanged<bool> onAnalysisComplete;
  final PhotoViewControllerBase? controller;
  final LiveTextPlatformViewBuilder? platformViewBuilder;

  /// Called for a plain tap over the overlay. The platform view swallows taps
  /// before any Flutter widget below can see them, so the asset page's own
  /// tap-to-toggle-controls has to be driven from here.
  final VoidCallback? onTap;

  /// Recognised text boxes in normalised image coordinates (0..1), used to
  /// decide which pointers to hand to VisionKit. Sourced from the server's OCR
  /// rows because VisionKit does not publish per-line geometry.
  final List<Rect> textRects;

  const LiveTextOverlay({
    super.key,
    required this.previewUrl,
    required this.imageSize,
    required this.viewportSize,
    required this.onAnalysisComplete,
    this.controller,
    this.platformViewBuilder,
    this.onTap,
    this.textRects = const [],
  });

  @override
  ConsumerState<LiveTextOverlay> createState() => LiveTextOverlayState();
}

class LiveTextOverlayState extends ConsumerState<LiveTextOverlay> {
  late final LiveTextHostApi _api;

  int? _viewId;
  Rect? _lastRect;
  bool _selectionActive = false;
  PhotoViewControllerValue? _controllerValue;
  StreamSubscription<PhotoViewControllerValue>? _controllerSub;

  @override
  void initState() {
    super.initState();
    _api = ref.read(liveTextHostApiProvider);
    _attachController(widget.controller);
  }

  @override
  void didUpdateWidget(LiveTextOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.controller != widget.controller) {
      _detachController();
      _attachController(widget.controller);
    }

    final viewId = _viewId;
    if (viewId != null && oldWidget.previewUrl != widget.previewUrl) {
      _lastRect = null;
      unawaited(_api.loadImage(viewId, widget.previewUrl));
    }

    _pushContentsRect();
  }

  @override
  void dispose() {
    _detachController();
    final viewId = _viewId;
    if (viewId != null) {
      LiveTextCallbackDispatcher.instance.unregister(viewId);
      unawaited(_api.dispose(viewId));
    }
    super.dispose();
  }

  void _attachController(PhotoViewControllerBase? controller) {
    if (controller == null) {
      return;
    }
    // Before the image has rendered a frame PhotoView reports a placeholder
    // scale of 1.0; only trust the value once scaleBoundaries is set.
    if (controller.scaleBoundaries != null) {
      _controllerValue = controller.value;
    }
    _controllerSub = controller.outputStateStream.listen((value) {
      if (!mounted) {
        return;
      }
      _controllerValue = value;
      _pushContentsRect();
    });
  }

  void _detachController() {
    _controllerSub?.cancel();
    _controllerSub = null;
  }

  void _onPlatformViewCreated(int viewId) {
    _viewId = viewId;
    LiveTextCallbackDispatcher.instance.register(
      viewId,
      onAnalysisComplete,
      onSelectionActiveChanged: _onSelectionActiveChanged,
    );
    unawaited(_api.loadImage(viewId, widget.previewUrl));
    _pushContentsRect();
  }

  void _onSelectionActiveChanged(bool active) {
    _selectionActive = active;
  }

  /// The image's placement in unit coordinates of the viewport.
  Rect _contentsRect() {
    // The decoded image can be a downscaled preview, so prefer the size
    // PhotoView actually laid out.
    final resolvedImageSize = widget.controller?.scaleBoundaries?.childSize ?? widget.imageSize;

    return liveTextContentsRect(
      imageSize: resolvedImageSize,
      viewportSize: widget.viewportSize,
      scale: _controllerValue?.scale,
      position: _controllerValue?.position ?? Offset.zero,
    );
  }

  /// Whether a global pointer position lands on recognised text. The overlay's
  /// render box starts at the viewport's top-left, so local coordinates here
  /// are viewport coordinates.
  bool _hitsText(Offset globalPosition) {
    if (widget.textRects.isEmpty) {
      return false;
    }

    final box = context.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) {
      return false;
    }

    return liveTextHitsText(
      position: box.globalToLocal(globalPosition),
      textRects: widget.textRects,
      contentsRect: _contentsRect(),
      viewportSize: widget.viewportSize,
    );
  }

  void _pushContentsRect() {
    final viewId = _viewId;
    if (viewId == null) {
      return;
    }

    final rect = _contentsRect();

    if (rect == _lastRect) {
      return;
    }
    _lastRect = rect;

    unawaited(_api.setContentsRect(viewId, rect.left, rect.top, rect.width, rect.height));
  }

  /// Invoked by [LiveTextCallbackDispatcher] when native finishes analysing.
  void onAnalysisComplete(bool hasText) {
    if (!mounted) {
      return;
    }
    widget.onAnalysisComplete(hasText);
  }

  @override
  Widget build(BuildContext context) {
    final builder = widget.platformViewBuilder ?? _defaultPlatformView;

    // VisionKit reads `contentsRect` in unit coordinates of the *native view's
    // own bounds*, so the view has to be exactly the viewport the rect was
    // normalised against. The asset page drops this overlay into a
    // `Positioned.fill` whose Stack is sized by the details panel, which is
    // taller than the viewport — filling it would denormalise every highlight
    // against the wrong height and push the text boxes low and stretched.
    //
    // `Align` absorbs the tight fill constraints and hands the child loose
    // ones, anchored top-left, which is where the PhotoView sibling starts too.
    return Align(
      alignment: Alignment.topLeft,
      child: SizedBox(
        width: widget.viewportSize.width,
        height: widget.viewportSize.height,
        child: builder(_onPlatformViewCreated),
      ),
    );
  }

  Widget _defaultPlatformView(void Function(int viewId) onCreated) {
    return UiKitView(
      viewType: LiveTextOverlay.viewType,
      creationParams: const <String, dynamic>{},
      creationParamsCodec: const StandardMessageCodec(),
      onPlatformViewCreated: onCreated,
      // The asset page stacks this overlay *above* PhotoView as a sibling, so
      // the default `opaque` absorbs the hit and PhotoView never even enters
      // the hit-test path — its recognizers never join the arena and declining
      // a gesture below just kills it. `translucent` keeps the platform view
      // hittable while letting the siblings underneath be hit too, matching the
      // `HitTestBehavior.translucent` the Flutter OCR overlay uses.
      hitTestBehavior: PlatformViewHitTestBehavior.translucent,
      // Without an entry here the native view only sees pointer sequences that
      // *no* Flutter recognizer claimed, and the asset viewer's PageView claims
      // every horizontal drag — so dragging a selection handle paged to the
      // next asset. See LiveTextGestureRecognizer for why this cannot simply be
      // an EagerGestureRecognizer.
      gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
        Factory<OneSequenceGestureRecognizer>(
          () => LiveTextGestureRecognizer(
            hitsText: _hitsText,
            isSelectionActive: () => _selectionActive,
            onTap: () => widget.onTap?.call(),
          ),
        ),
      },
    );
  }
}
