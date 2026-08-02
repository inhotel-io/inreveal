import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  String read(String path) => File(path).readAsStringSync();

  group('Live Text native shell', () {
    test('every VisionKit entry point is guarded for iOS 16', () {
      expect(read('ios/Runner/LiveText/LiveTextPlatformView.swift'), contains('@available(iOS 16.0, *)'));
      expect(read('ios/Runner/LiveText/LiveTextPlatformViewFactory.swift'), contains('@available(iOS 16.0, *)'));
      expect(read('ios/Runner/LiveText/LiveTextPassthroughView.swift'), contains('@available(iOS 16.0, *)'));
    });

    test('registration is gated at runtime so iOS 15 never touches VisionKit', () {
      final appDelegate = read('ios/Runner/AppDelegate.swift');

      expect(appDelegate, contains('if #available(iOS 16.0, *)'));
      expect(appDelegate, contains('LiveTextPlatformViewFactory.viewType'));
      expect(appDelegate, contains('LiveTextHostApiSetup.setUp'));
      expect(
        read('ios/Runner/LiveText/LiveTextPlatformViewFactory.swift'),
        contains('static let viewType = "immich/live_text_overlay"'),
        reason: 'the Dart side hardcodes this exact view type',
      );
    });

    test('support probe honours ImageAnalyzer.isSupported, not just the OS version', () {
      expect(read('ios/Runner/LiveText/LiveTextApiImpl.swift'), contains('ImageAnalyzer.isSupported'));
    });

    test('the host view passes non-text touches back to Flutter', () {
      final passthrough = read('ios/Runner/LiveText/LiveTextPassthroughView.swift');

      expect(passthrough, contains('override func hitTest'));
      expect(passthrough, contains('return nil'), reason: 'returning nil is what lets Flutter keep pinch/pan');
      expect(passthrough, contains('analysisHasText'));
      expect(
        passthrough,
        contains('hasActiveTextSelection'),
        reason: 'selection handles sit outside text bounds and must stay grabbable',
      );
    });

    test('the delegate implements every required VisionKit callback', () {
      final platformView = read('ios/Runner/LiveText/LiveTextPlatformView.swift');

      expect(platformView, contains('func contentView(for'));
      expect(platformView, contains('func contentsRect(for'));
      expect(platformView, contains('func presentingViewController(for'));
      expect(platformView, contains('shouldBeginAt'));
    });

    test('contentsRect changes invalidate the interaction', () {
      expect(read('ios/Runner/LiveText/LiveTextPlatformView.swift'), contains('setContentsRectNeedsUpdate()'));
    });

    test('images are fetched through the shared authenticated session and cache', () {
      final platformView = read('ios/Runner/LiveText/LiveTextPlatformView.swift');

      expect(platformView, contains('URLSessionManager.shared.session'));
      expect(platformView, contains('returnCacheDataElseLoad'));
    });

    test('analysis results are reported back to Flutter for the no-text fallback', () {
      expect(read('ios/Runner/LiveText/LiveTextPlatformView.swift'), contains('onAnalysisComplete'));
    });
  });
}
