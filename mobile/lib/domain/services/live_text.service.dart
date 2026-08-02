import 'package:immich_mobile/extensions/platform_extensions.dart';
import 'package:immich_mobile/platform/live_text_api.g.dart';
import 'package:logging/logging.dart';

/// Decides whether the native VisionKit Live Text overlay can be used.
///
/// Live Text needs iOS 16+ *and* supported hardware (`ImageAnalyzer.isSupported`,
/// which is false on the Simulator). Every failure mode resolves to `false` so
/// the caller falls back to the server-OCR overlay.
class LiveTextService {
  static final _log = Logger('LiveTextService');

  final LiveTextHostApi _api;
  Future<bool>? _probe;

  LiveTextService(this._api);

  Future<bool> isSupported() {
    if (!CurrentPlatform.isIOS) {
      return Future.value(false);
    }
    return _probe ??= _probeSupport();
  }

  Future<bool> _probeSupport() async {
    try {
      return await _api.isSupported();
    } catch (error, stack) {
      _log.warning('Live Text support probe failed; falling back to server OCR', error, stack);
      return false;
    }
  }
}
