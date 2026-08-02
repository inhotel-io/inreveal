import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/services/live_text.service.dart';
import 'package:immich_mobile/platform/live_text_api.g.dart';
import 'package:mocktail/mocktail.dart';

class MockLiveTextHostApi extends Mock implements LiveTextHostApi {}

void main() {
  late MockLiveTextHostApi api;
  late LiveTextService service;

  setUp(() {
    api = MockLiveTextHostApi();
    service = LiveTextService(api);
  });

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
  });

  void onIOS() => debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
  void onAndroid() => debugDefaultTargetPlatformOverride = TargetPlatform.android;

  group('isSupported', () {
    test('returns false on Android without touching the platform channel', () async {
      onAndroid();

      expect(await service.isSupported(), isFalse);
      verifyNever(() => api.isSupported());
    });

    test('returns true on iOS when the host reports support', () async {
      onIOS();
      when(() => api.isSupported()).thenAnswer((_) async => true);

      expect(await service.isSupported(), isTrue);
    });

    test('returns false on iOS when the host reports no support', () async {
      onIOS();
      when(() => api.isSupported()).thenAnswer((_) async => false);

      expect(await service.isSupported(), isFalse);
    });

    test('memoises a positive result so the channel is hit once', () async {
      onIOS();
      when(() => api.isSupported()).thenAnswer((_) async => true);

      await service.isSupported();
      await service.isSupported();
      await service.isSupported();

      verify(() => api.isSupported()).called(1);
    });

    test('memoises a negative result too', () async {
      onIOS();
      when(() => api.isSupported()).thenAnswer((_) async => false);

      await service.isSupported();
      await service.isSupported();

      verify(() => api.isSupported()).called(1);
    });

    test('fails safe to false when the platform channel throws', () async {
      onIOS();
      when(() => api.isSupported()).thenThrow(Exception('MissingPluginException'));

      expect(await service.isSupported(), isFalse);
    });

    test('does not retry after a throw', () async {
      onIOS();
      when(() => api.isSupported()).thenThrow(Exception('boom'));

      await service.isSupported();
      await service.isSupported();

      verify(() => api.isSupported()).called(1);
    });

    test('concurrent callers share a single in-flight probe', () async {
      onIOS();
      when(() => api.isSupported()).thenAnswer((_) async {
        await Future<void>.delayed(const Duration(milliseconds: 10));
        return true;
      });

      final results = await Future.wait([service.isSupported(), service.isSupported(), service.isSupported()]);

      expect(results, everyElement(isTrue));
      verify(() => api.isSupported()).called(1);
    });
  });
}
