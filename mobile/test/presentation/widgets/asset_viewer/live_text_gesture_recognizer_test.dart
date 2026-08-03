import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_gesture_recognizer.dart';

const _target = Key('live-text-target');

void main() {
  late List<String> log;

  setUp(() => log = <String>[]);

  /// Puts the recognizer under a competing gesture the way the asset viewer
  /// does: `PageView`'s horizontal drag sits above the Live Text platform view.
  Future<void> pumpWithDrag(WidgetTester tester, {required bool onText, bool selectionActive = false}) {
    return tester.pumpWidget(
      MaterialApp(
        home: GestureDetector(
          onHorizontalDragStart: (_) => log.add('page-swipe'),
          onTap: () => log.add('tap'),
          child: RawGestureDetector(
            gestures: {
              LiveTextGestureRecognizer: GestureRecognizerFactoryWithHandlers<LiveTextGestureRecognizer>(
                () => LiveTextGestureRecognizer(hitsText: (_) => onText, isSelectionActive: () => selectionActive),
                (_) {},
              ),
            },
            child: const SizedBox.expand(key: _target, child: ColoredBox(color: Color(0x00000000))),
          ),
        ),
      ),
    );
  }

  group('LiveTextGestureRecognizer', () {
    testWidgets('claims a drag that starts on text, so selection beats the page swipe', (tester) async {
      await pumpWithDrag(tester, onText: true);

      await tester.timedDrag(find.byKey(_target), const Offset(120, 0), const Duration(milliseconds: 200));

      expect(log, isNot(contains('page-swipe')), reason: 'this is the bug that paged instead of extending selection');
    });

    testWidgets('leaves a drag that misses text to the page swipe', (tester) async {
      await pumpWithDrag(tester, onText: false);

      await tester.timedDrag(find.byKey(_target), const Offset(120, 0), const Duration(milliseconds: 200));

      expect(log, contains('page-swipe'));
    });

    testWidgets('claims every drag while a selection is live, even off the text', (tester) async {
      // Selection handles and the callout sit outside the recognised quads.
      await pumpWithDrag(tester, onText: false, selectionActive: true);

      await tester.timedDrag(find.byKey(_target), const Offset(120, 0), const Duration(milliseconds: 200));

      expect(log, isNot(contains('page-swipe')));
    });

    testWidgets('leaves a tap that misses text to Flutter, so controls still toggle', (tester) async {
      await pumpWithDrag(tester, onText: false);

      await tester.tap(find.byKey(_target));
      await tester.pump();

      expect(log, contains('tap'));
    });

    testWidgets('leaves a quick tap ON text to Flutter too, so zoomed-in taps toggle controls', (tester) async {
      // Zoomed into a document almost every point is text, so claiming taps
      // here made tap-to-toggle-controls appear broken.
      await pumpWithDrag(tester, onText: true);

      await tester.tap(find.byKey(_target));
      await tester.pump();

      expect(log, contains('tap'));
    });

    testWidgets('keeps a press on text away from Flutter, so it can start a selection', (tester) async {
      await pumpWithDrag(tester, onText: true);

      final press = await tester.startGesture(tester.getCenter(find.byKey(_target)));
      await tester.pump(kLongPressTimeout + const Duration(milliseconds: 200));
      await press.up();
      await tester.pump();

      expect(log, isNot(contains('tap')), reason: 'a long press must select text, not toggle the controls');
    });

    // Pins "does not claim on touch-down" rather than the explicit second-finger
    // concession: by the time a drag passes the slop the scale recognizer has
    // already taken both pointers. Verified discriminating — swapping in an
    // EagerGestureRecognizer fails this test.
    testWidgets('does not claim on touch-down, so pinch-zoom still works over text', (tester) async {
      var pinched = false;

      await tester.pumpWidget(
        MaterialApp(
          home: GestureDetector(
            onScaleStart: (_) => pinched = true,
            child: RawGestureDetector(
              gestures: {
                LiveTextGestureRecognizer: GestureRecognizerFactoryWithHandlers<LiveTextGestureRecognizer>(
                  // Both fingers land on text — the hard case.
                  () => LiveTextGestureRecognizer(hitsText: (_) => true, isSelectionActive: () => false),
                  (_) {},
                ),
              },
              child: const SizedBox.expand(key: _target, child: ColoredBox(color: Color(0x00000000))),
            ),
          ),
        ),
      );

      final center = tester.getCenter(find.byKey(_target));
      final first = await tester.startGesture(center - const Offset(20, 0));
      final second = await tester.startGesture(center + const Offset(20, 0));
      await first.moveBy(const Offset(-40, 0));
      await second.moveBy(const Offset(40, 0));
      await tester.pump();
      await first.up();
      await second.up();
      await tester.pump();

      expect(pinched, isTrue, reason: 'an eager recognizer would have swallowed the pinch');
    });
  });
}
