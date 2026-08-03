import 'package:flutter/foundation.dart';
import 'package:immich_mobile/platform/live_text_api.g.dart';

/// Single owner of the `LiveTextFlutterApi` binding.
///
/// Pigeon's `setUp` installs one global handler, but the asset viewer is a
/// `PageView` and can hold several Live Text overlays at once. Each overlay
/// registers here by its platform-view id instead of rebinding the channel.
class LiveTextCallbackDispatcher implements LiveTextFlutterApi {
  LiveTextCallbackDispatcher._();

  static final LiveTextCallbackDispatcher instance = LiveTextCallbackDispatcher._();

  final Map<int, ValueChanged<bool>> _listeners = {};
  final Map<int, ValueChanged<bool>> _selectionListeners = {};
  bool _bound = false;

  void register(int viewId, ValueChanged<bool> onAnalysisComplete, {ValueChanged<bool>? onSelectionActiveChanged}) {
    if (!_bound) {
      LiveTextFlutterApi.setUp(this);
      _bound = true;
    }
    _listeners[viewId] = onAnalysisComplete;
    if (onSelectionActiveChanged != null) {
      _selectionListeners[viewId] = onSelectionActiveChanged;
    }
  }

  void unregister(int viewId) {
    _listeners.remove(viewId);
    _selectionListeners.remove(viewId);
  }

  @visibleForTesting
  int get listenerCount => _listeners.length;

  @override
  void onAnalysisComplete(int viewId, bool hasText) {
    _listeners[viewId]?.call(hasText);
  }

  @override
  void onSelectionActiveChanged(int viewId, bool active) {
    _selectionListeners[viewId]?.call(active);
  }
}
