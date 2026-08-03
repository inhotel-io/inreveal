import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';

/// Decides which pointers the Live Text platform view is allowed to consume.
///
/// Flutter's gesture arena resolves before UIKit hit-testing ever runs, so the
/// native `hitTest` cannot arbitrate this: whatever Flutter awards elsewhere
/// simply never reaches VisionKit. Attaching nothing here means the asset
/// viewer's `PageView` wins every drag, so dragging a selection handle pages to
/// the next photo. Attaching an [EagerGestureRecognizer] instead claims
/// everything, killing pinch, pan and swipe for as long as OCR is on.
///
/// This recognizer threads between the two:
///
/// * **Not on text** — tracked but never accepted, so pan/swipe/pinch behave
///   exactly as they do with the overlay switched off.
/// * **A second finger** — concedes, so a pinch still zooms even when the first
///   finger landed on a word.
/// * **Dragging on text** — claims after [slop] pixels, beating the ~18px the
///   `PageView` needs, which is what makes multi-line selection possible.
/// * **A plain tap anywhere** — concedes and reports it through [onTap]. A
///   hit-testable platform view swallows taps outright, so forwarding is the
///   only way the controls can still toggle.
/// * **Press on text** — claims once the press passes [kLongPressTimeout],
///   which is what starts a selection. It has to claim *during* the press:
///   Flutter's tap recognizer accepts on touch-up and the arena resolves on the
///   first accept, so waiting would let the release also toggle the controls.
/// * **While a selection is live** — claims immediately, because the drag
///   handles and the callout sit outside the text quads.
class LiveTextGestureRecognizer extends OneSequenceGestureRecognizer {
  LiveTextGestureRecognizer({
    required this.hitsText,
    required this.isSelectionActive,
    this.onTap,
    this.slop = 4.0,
  });

  /// Invoked for a plain tap anywhere over the overlay.
  ///
  /// A hit-testable platform view swallows every tap in its bounds, and no
  /// amount of politeness from this recognizer changes that: Flutter's
  /// `TapGestureRecognizer` does not accept on touch-up, it waits to win the
  /// arena, and the platform view's team captain is deeper so it wins the sweep
  /// first. Nothing below can ever see the tap, so the overlay has to forward
  /// it. Verified in `live_text_tap_passthrough_test.dart`, which still fails
  /// with this recognizer removed entirely.
  final VoidCallback? onTap;

  /// Whether a global position lands on recognised text.
  final bool Function(Offset globalPosition) hitsText;

  /// Whether VisionKit currently holds a text selection.
  final bool Function() isSelectionActive;

  /// Movement needed before claiming a drag. Must stay below the `PageView`'s
  /// drag threshold or the page swipe wins first.
  final double slop;

  int? _pointer;
  Offset _origin = Offset.zero;
  bool _decided = false;
  bool _moved = false;
  bool _claimable = false;
  Timer? _pressTimer;

  @override
  void addAllowedPointer(PointerDownEvent event) {
    if (_pointer != null) {
      // A second finger means a pinch. Concede the whole sequence so PhotoView
      // can zoom even though the first finger is on text.
      if (!_decided) {
        _decided = true;
        resolve(GestureDisposition.rejected);
      }
      return;
    }

    final selectionActive = isSelectionActive();

    _pointer = event.pointer;
    _origin = event.position;
    _decided = false;
    _moved = false;
    // Only text (or a live selection) may be *claimed*. Pointers elsewhere are
    // still tracked, purely so a tap can be detected and forwarded — they are
    // never accepted, which is what leaves pan/swipe/pinch untouched.
    _claimable = selectionActive || hitsText(event.position);
    startTrackingPointer(event.pointer);

    if (selectionActive) {
      _decided = true;
      resolve(GestureDisposition.accepted);
      return;
    }

    if (!_claimable) {
      return;
    }

    // Claim mid-press rather than at touch-up. Flutter's TapGestureRecognizer
    // accepts on touch-up and the arena resolves on the first accept, so simply
    // staying unresolved would let a long press also fire a tap and toggle the
    // controls out from under the selection.
    _pressTimer?.cancel();
    _pressTimer = Timer(kLongPressTimeout, () {
      if (_decided) {
        return;
      }
      _decided = true;
      resolve(GestureDisposition.accepted);
    });
  }

  @override
  void handleEvent(PointerEvent event) {
    if (event.pointer != _pointer) {
      return;
    }

    if (event is PointerMoveEvent && (event.position - _origin).distance > slop) {
      _moved = true;
      if (!_decided && _claimable) {
        _pressTimer?.cancel();
        _decided = true;
        resolve(GestureDisposition.accepted);
      }
    }

    if (event is PointerUpEvent || event is PointerCancelEvent) {
      _pressTimer?.cancel();

      if (event is PointerUpEvent && !_decided && !_moved) {
        // A plain tap. It can never reach the widgets below, so forward it.
        onTap?.call();
      }

      if (!_decided) {
        _decided = true;
        resolve(GestureDisposition.rejected);
      }
      stopTrackingPointer(event.pointer);
    }
  }

  @override
  void didStopTrackingLastPointer(int pointer) {
    _pressTimer?.cancel();
    _pressTimer = null;
    _pointer = null;
    _decided = false;
    _moved = false;
    _claimable = false;
  }

  @override
  void dispose() {
    _pressTimer?.cancel();
    super.dispose();
  }

  @override
  String get debugDescription => 'live text';
}
