import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(
  PigeonOptions(
    dartOut: 'lib/platform/live_text_api.g.dart',
    swiftOut: 'ios/Runner/LiveText/LiveText.g.swift',
    swiftOptions: SwiftOptions(includeErrorClass: false),
    dartOptions: DartOptions(),
    dartPackageName: 'immich_mobile',
  ),
)
/// iOS-only. VisionKit Live Text is not available on Android, so this API
/// intentionally has no Kotlin counterpart; callers must gate on
/// `CurrentPlatform.isIOS` before invoking it.
@HostApi()
abstract class LiveTextHostApi {
  /// True only when the OS is iOS 16+ *and* `ImageAnalyzer.isSupported`.
  bool isSupported();

  /// Where the image sits inside the platform view, in unit coordinates.
  void setContentsRect(int viewId, double left, double top, double width, double height);

  /// Fetch (from the shared authenticated URLCache) and analyse the image.
  void loadImage(int viewId, String url);

  /// Drop the analysis and clear any active selection.
  void dispose(int viewId);
}

@FlutterApi()
abstract class LiveTextFlutterApi {
  /// Reports whether the analysis found any text, so Flutter can fall back to
  /// the server-OCR overlay when Live Text finds nothing.
  void onAnalysisComplete(int viewId, bool hasText);

  /// Reports whether a text selection is currently live.
  ///
  /// Flutter only hands the native view the pointers that land on text, so that
  /// pinch/pan/page-swipe keep working everywhere else. Selection handles and
  /// the callout sit *outside* the text quads, so while a selection exists
  /// Flutter has to concede every pointer instead.
  void onSelectionActiveChanged(int viewId, bool active);
}
