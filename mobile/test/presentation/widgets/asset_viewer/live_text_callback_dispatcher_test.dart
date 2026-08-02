// mobile/test/presentation/widgets/asset_viewer/live_text_callback_dispatcher_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_callback_dispatcher.dart';

void main() {
  late LiveTextCallbackDispatcher dispatcher;

  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    dispatcher = LiveTextCallbackDispatcher.instance;
  });

  tearDown(() {
    dispatcher.unregister(1);
    dispatcher.unregister(2);
  });

  group('LiveTextCallbackDispatcher', () {
    test('routes a callback to the listener registered for that view id', () {
      bool? received;
      dispatcher.register(1, (hasText) => received = hasText);

      dispatcher.onAnalysisComplete(1, true);

      expect(received, isTrue);
    });

    test('delivers to only the matching listener when several are registered', () {
      final delivered = <int>[];
      dispatcher.register(1, (_) => delivered.add(1));
      dispatcher.register(2, (_) => delivered.add(2));

      dispatcher.onAnalysisComplete(2, false);

      expect(delivered, [2]);
    });

    test('ignores callbacks for an unknown view id without throwing', () {
      expect(() => dispatcher.onAnalysisComplete(999, true), returnsNormally);
    });

    test('stops delivering after unregister', () {
      var calls = 0;
      dispatcher.register(1, (_) => calls++);
      dispatcher.unregister(1);

      dispatcher.onAnalysisComplete(1, true);

      expect(calls, 0);
    });

    test('unregistering one view id leaves the other listener intact', () {
      var second = 0;
      dispatcher.register(1, (_) {});
      dispatcher.register(2, (_) => second++);

      dispatcher.unregister(1);
      dispatcher.onAnalysisComplete(2, true);

      expect(second, 1);
    });

    test('re-registering the same view id replaces the previous listener', () {
      var first = 0;
      var second = 0;
      dispatcher.register(1, (_) => first++);
      dispatcher.register(1, (_) => second++);

      dispatcher.onAnalysisComplete(1, true);

      expect(first, 0);
      expect(second, 1);
    });

    test('unregistering an unknown view id is a no-op', () {
      expect(() => dispatcher.unregister(1234), returnsNormally);
    });

    test('tracks how many listeners are attached', () {
      expect(dispatcher.listenerCount, 0);

      dispatcher.register(1, (_) {});
      dispatcher.register(2, (_) {});
      expect(dispatcher.listenerCount, 2);

      dispatcher.unregister(1);
      expect(dispatcher.listenerCount, 1);
    });
  });
}
