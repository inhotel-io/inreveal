import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/platform/live_text_api.g.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_callback_dispatcher.dart';
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

  const LiveTextOverlay({
    super.key,
    required this.previewUrl,
    required this.imageSize,
    required this.viewportSize,
    required this.onAnalysisComplete,
    this.controller,
    this.platformViewBuilder,
  });

  @override
  ConsumerState<LiveTextOverlay> createState() => LiveTextOverlayState();
}

class LiveTextOverlayState extends ConsumerState<LiveTextOverlay> {
  late final LiveTextHostApi _api;

  int? _viewId;
  Rect? _lastRect;
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
    LiveTextCallbackDispatcher.instance.register(viewId, onAnalysisComplete);
    unawaited(_api.loadImage(viewId, widget.previewUrl));
    _pushContentsRect();
  }

  void _pushContentsRect() {
    final viewId = _viewId;
    if (viewId == null) {
      return;
    }

    // The decoded image can be a downscaled preview, so prefer the size
    // PhotoView actually laid out.
    final resolvedImageSize = widget.controller?.scaleBoundaries?.childSize ?? widget.imageSize;

    final rect = liveTextContentsRect(
      imageSize: resolvedImageSize,
      viewportSize: widget.viewportSize,
      scale: _controllerValue?.scale,
      position: _controllerValue?.position ?? Offset.zero,
    );

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
    return builder(_onPlatformViewCreated);
  }

  Widget _defaultPlatformView(void Function(int viewId) onCreated) {
    return UiKitView(
      viewType: LiveTextOverlay.viewType,
      creationParams: const <String, dynamic>{},
      creationParamsCodec: const StandardMessageCodec(),
      onPlatformViewCreated: onCreated,
    );
  }
}
