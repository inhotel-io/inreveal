# iOS Live Text OCR Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tap-one-box-at-a-time OCR overlay on iOS with Apple's native Live Text (VisionKit `ImageAnalysisInteraction`), so users can drag-select across multiple lines, copy, look up, translate, and tap data detectors — while leaving Android and server-side OCR search untouched.

**Architecture:** A transparent `UiKitView` is layered over the existing Flutter `PhotoView`. Flutter keeps rendering the photo; the native view renders nothing and exists only to host an `ImageAnalysisInteraction`. Flutter pushes the image's on-screen rectangle (in unit coordinates) to native on every pan/zoom frame via `contentsRect`, which is Apple's documented mechanism for custom (non-`UIImageView`) hosts. The native view returns `nil` from `hitTest` wherever there is no text, so pinch/pan/tap still reach Flutter untouched.

**Tech Stack:** Flutter 3.44.8 / Dart, Swift 5 + VisionKit, Pigeon 26.3.4 for the platform bridge, mocktail + flutter_test for tests, Riverpod for wiring.

## Global Constraints

- **Deployment target:** The `Runner` target is `IPHONEOS_DEPLOYMENT_TARGET = 15.0`. VisionKit's `ImageAnalyzer`/`ImageAnalysisInteraction` are iOS 16.0+. **Do not raise the deployment target.** All VisionKit code must be behind `@available(iOS 16.0, *)` and every registration site behind `if #available(iOS 16.0, *)`.
- **Runtime capability gate:** Even on iOS 16+, `ImageAnalyzer.isSupported` can be `false` (older hardware, Simulator). Every path must fall back to the existing `OcrOverlay` when unsupported.
- **The Simulator cannot run Live Text.** `ImageAnalyzer.isSupported` returns `false` there. All VisionKit behaviour must be verified on a physical device. CI can never assert it.
- **No iOS test target exists** in `mobile/ios/Runner.xcodeproj` (only the app + 2 app-extensions). Do not add one. Push all testable logic into Dart; keep Swift a thin shell guarded by source-level assertions (the existing idiom in `mobile/test/platform/background_worker_native_files_test.dart`).
- **Minimise the upstream diff.** `mobile/lib/presentation/widgets/asset_viewer/asset_page.widget.dart` is upstream Immich code that upstream actively edits, and upstream closed this bug as `not_planned` ([immich#30346](https://github.com/immich-app/immich/issues/30346)), so this divergence is permanent. The change to that file must be **exactly one import plus one widget name**. All new behaviour lives in fork-only files.
- **Platform detection must use `CurrentPlatform.isIOS`** (`mobile/lib/extensions/platform_extensions.dart`, backed by `defaultTargetPlatform`), never `Platform.isIOS` from `dart:io` — only the former is overridable in tests via `debugDefaultTargetPlatformOverride`.
- **Mocking library is mocktail** (79 test files use it, 0 use mockito). Pigeon host APIs are injected via a Riverpod provider so they can be overridden — follow `mobile/lib/services/view_intent.service.dart`.
- **Widget tests use `pumpConsumerWidgetRaw`** from `mobile/test/widget_tester_extensions.dart` (no EasyLocalization wrapper, no automatic `pumpAndSettle`).
- **Asset fixtures use `RemoteAssetFactory.create(...)`** from `mobile/test/unit/factories/remote_asset_factory.dart`. Do not hand-construct `RemoteAsset` — it has required `isEdited` and `checksum` parameters that are easy to get wrong.
- **Server OCR is unchanged.** Live Text is a viewer-only concern. Text search continues to use the server's RapidOCR rows synced into the local Drift `asset_ocr` table. Never write Live Text output to the database.
- **Do not hand-write generated Pigeon output.** Run `mise run pigeon` from `mobile/`.
- **Docs prettier is a CI gate.** Run `npx prettier --write` on any markdown under `docs/` before committing.
- **TDD is strict, with two declared exceptions.** Every task writes a failing test, runs it to see it fail, implements the minimum, re-runs, and commits. The exceptions are **Task 1** (a throwaway spike whose only output is a go/no-go verdict) and **Task 3** (pure Pigeon codegen — there is no hand-written logic to test; its output is exercised by Tasks 4–8). Do not skip the "run it and watch it fail" step anywhere else: several of these tests would pass vacuously against a stub, and watching them fail first is what proves they bind to real behaviour.

## Build status

Tasks 2, 3, 4, 6, 7, and 8 are implemented, reviewed, and merged — the Dart side of this plan.

Tasks 1, 5, and 9 are **not done**: Task 1 is the GO/NO-GO device spike, Task 5 is the native Swift shell, and Task 9 is device verification. Tasks 1 and 9 require a physical iPhone.

Consequence today: `LiveTextHostApi` has no registered iOS implementation, so the support probe fails and every user falls back to the existing server-OCR overlay on both platforms. No behaviour change ships until Task 5 lands.

---

## File Structure

**New (fork-only):**

| File                                                                              | Responsibility                                                                                                        |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `mobile/pigeon/live_text_api.dart`                                                | Pigeon definition: support probe, per-view contentsRect/load/dispose, analysis callback                               |
| `mobile/lib/platform/live_text_api.g.dart`                                        | Generated Dart bridge                                                                                                 |
| `mobile/lib/utils/live_text_contents_rect.dart`                                   | **Pure function**: PhotoView transform → unit-coordinate image rect. The whole coordinate contract, fully unit-tested |
| `mobile/lib/domain/services/live_text.service.dart`                               | Support gating + memoisation + fail-safe                                                                              |
| `mobile/lib/providers/infrastructure/live_text.provider.dart`                     | Riverpod wiring                                                                                                       |
| `mobile/lib/presentation/widgets/asset_viewer/live_text_callback_dispatcher.dart` | Fans the single `LiveTextFlutterApi` binding out to per-view listeners                                                |
| `mobile/lib/presentation/widgets/asset_viewer/live_text_overlay.widget.dart`      | `UiKitView` host; subscribes to the PhotoView controller, pushes contentsRect                                         |
| `mobile/lib/presentation/widgets/asset_viewer/ocr_overlay_switcher.widget.dart`   | Chooses Live Text vs. the existing `OcrOverlay`; owns the no-text fallback                                            |
| `mobile/ios/Runner/LiveText/LiveText.g.swift`                                     | Generated Swift bridge                                                                                                |
| `mobile/ios/Runner/LiveText/LiveTextPassthroughView.swift`                        | `UIView` subclass whose `hitTest` passes non-text touches through to Flutter                                          |
| `mobile/ios/Runner/LiveText/LiveTextPlatformView.swift`                           | `FlutterPlatformView` + `ImageAnalysisInteractionDelegate`                                                            |
| `mobile/ios/Runner/LiveText/LiveTextPlatformViewFactory.swift`                    | `FlutterPlatformViewFactory`                                                                                          |
| `mobile/ios/Runner/LiveText/LiveTextApiImpl.swift`                                | Host API impl + viewId registry                                                                                       |

**Modified (upstream files — keep diffs minimal):**

- `mobile/lib/presentation/widgets/asset_viewer/asset_page.widget.dart:17,461` — swap `OcrOverlay` → `OcrOverlaySwitcher`.
- `mobile/ios/Runner/AppDelegate.swift:29-36` — register the factory and host API.

**Tests:**

- `mobile/test/utils/live_text_contents_rect_test.dart`
- `mobile/test/services/live_text.service_test.dart`
- `mobile/test/presentation/widgets/asset_viewer/live_text_callback_dispatcher_test.dart`
- `mobile/test/presentation/widgets/asset_viewer/live_text_overlay_test.dart`
- `mobile/test/presentation/widgets/asset_viewer/ocr_overlay_switcher_test.dart`
- `mobile/test/platform/live_text_native_files_test.dart`

---

### Task 1: Spike — prove touch pass-through through Flutter's platform-view layer

**This task is throwaway and is a go/no-go gate. Do not proceed to Task 2 if it fails.**

The unresolved risk: Flutter wraps every iOS platform view in a `FlutterTouchInterceptingView`. It is not documented whether a platform view returning `nil` from `hitTest` lets the touch fall back to Flutter's gesture arena. If it does not, the transparent-overlay architecture (A1) is dead and the fallback is A2 (native `UIScrollView` owning zoom/pan while OCR mode is on), which is a different and larger plan.

**Files:**

- Create (throwaway): `mobile/ios/Runner/LiveText/SpikePassthroughView.swift`
- Create (throwaway): `mobile/lib/presentation/widgets/asset_viewer/spike_overlay.widget.dart`
- Modify (throwaway): `mobile/ios/Runner/AppDelegate.swift`, `asset_page.widget.dart`

**Interfaces:**

- Consumes: nothing.
- Produces: a yes/no answer recorded in this plan. No production code.

- [ ] **Step 1: Create the passthrough view**

```swift
// mobile/ios/Runner/LiveText/SpikePassthroughView.swift
import Flutter
import UIKit

/// Left half of the view swallows touches; right half passes through.
final class SpikePassthroughView: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let passThrough = point.x > bounds.midX
    NSLog("[spike] hitTest x=\(point.x) mid=\(bounds.midX) passThrough=\(passThrough)")
    if passThrough { return nil }
    return super.hitTest(point, with: event)
  }
}

final class SpikePlatformView: NSObject, FlutterPlatformView {
  private let container: SpikePassthroughView

  init(frame: CGRect) {
    container = SpikePassthroughView(frame: frame)
    container.backgroundColor = UIColor.systemRed.withAlphaComponent(0.15)
    super.init()
  }

  func view() -> UIView { container }
}

final class SpikePlatformViewFactory: NSObject, FlutterPlatformViewFactory {
  func create(withFrame frame: CGRect, viewIdentifier viewId: Int64, arguments args: Any?) -> FlutterPlatformView {
    SpikePlatformView(frame: frame)
  }

  func createArgsCodec() -> FlutterMessageCodec & NSObjectProtocol {
    FlutterStandardMessageCodec.sharedInstance()
  }
}
```

- [ ] **Step 2: Register the factory**

In `mobile/ios/Runner/AppDelegate.swift`, inside `registerPlugins(with:messenger:)`, append:

```swift
registry.registrar(forPlugin: "SpikePlatformView")!
  .register(SpikePlatformViewFactory(), withId: "immich/spike_overlay")
```

Swift files are not compiled until they are members of the `Runner` target. Add it (the `xcodeproj` gem is already in `mobile/ios/Gemfile.lock` via cocoapods):

```bash
cd mobile/ios && bundle exec ruby -e '
require "xcodeproj"

project = Xcodeproj::Project.open("Runner.xcodeproj")
target = project.targets.find { |t| t.name == "Runner" }
raise "Runner target not found" unless target

runner_group = project.main_group["Runner"]
group = runner_group["LiveText"] || runner_group.new_group("LiveText", "Runner/LiveText")

existing = target.source_build_phase.files_references.map { |r| File.basename(r.path.to_s) }

Dir.glob("Runner/LiveText/*.swift").sort.each do |path|
  name = File.basename(path)
  next if existing.include?(name)
  ref = group.new_reference(name)
  target.add_file_references([ref])
  puts "added #{name}"
end

project.save
'
```

- [ ] **Step 3: Add the Flutter-side overlay**

```dart
// mobile/lib/presentation/widgets/asset_viewer/spike_overlay.widget.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class SpikeOverlay extends StatelessWidget {
  const SpikeOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    return const UiKitView(
      viewType: 'immich/spike_overlay',
      creationParams: <String, dynamic>{},
      creationParamsCodec: StandardMessageCodec(),
    );
  }
}
```

In `asset_page.widget.dart`, temporarily replace the `OcrOverlay(...)` argument at line 461 with `const SpikeOverlay()`.

- [ ] **Step 4: Run on a physical device and record results**

```bash
cd mobile && flutter run --release -d <your-device-id>
```

Open any photo, toggle OCR on, then verify each of these by hand:

| Probe                                                | Expected if A1 is viable                                    |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| Pinch-zoom starting on the **right** half            | Image zooms (Flutter received it)                           |
| Single-finger pan on the **right** half while zoomed | Image pans                                                  |
| Swipe left/right on the **right** half at 1x         | Pages to the next asset                                     |
| Swipe down on the **right** half                     | Dismisses the viewer                                        |
| Tap on the **left** half                             | Nothing happens; `[spike] hitTest` logs `passThrough=false` |
| Tap on the **right** half                            | Controls toggle (Flutter received it)                       |

- [ ] **Step 5: Record the verdict and revert**

Write the verdict (including device model and iOS version) into this file under Task 1, then discard all spike code:

```bash
cd /Users/pierre/dev/gallery/.claude/worktrees/research-ios-live-text-ocr
git checkout -- mobile/ios/Runner/AppDelegate.swift mobile/lib/presentation/widgets/asset_viewer/asset_page.widget.dart mobile/ios/Runner.xcodeproj/project.pbxproj
rm mobile/ios/Runner/LiveText/SpikePassthroughView.swift mobile/lib/presentation/widgets/asset_viewer/spike_overlay.widget.dart
```

**GO** = every "right half" probe reaches Flutter. Continue to Task 2.
**NO-GO** = any right-half gesture is swallowed. Stop; this plan is invalid and architecture A2 must be planned instead.

---

### Task 2: contentsRect coordinate math

The single most important piece of logic, and the only one that can be exhaustively tested. It converts the PhotoView transform into the unit-coordinate rectangle VisionKit needs. It intentionally mirrors the existing math in `ocr_overlay.widget.dart:144-175` so both overlays agree on where the image is.

**Files:**

- Create: `mobile/lib/utils/live_text_contents_rect.dart`
- Test: `mobile/test/utils/live_text_contents_rect_test.dart`

**Interfaces:**

- Consumes: nothing.
- Produces: `Rect liveTextContentsRect({required Size imageSize, required Size viewportSize, double? scale, Offset position = Offset.zero})` — returns the image's rect in unit coordinates of the viewport, **unclamped** (a zoomed image legitimately extends outside `0..1`). Returns `Rect.zero` for any degenerate input.

- [ ] **Step 1: Write the failing tests**

```dart
// mobile/test/utils/live_text_contents_rect_test.dart
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/utils/live_text_contents_rect.dart';

void main() {
  const viewport = Size(400, 800);

  void expectRect(Rect actual, Rect expected) {
    expect(actual.left, closeTo(expected.left, 1e-9));
    expect(actual.top, closeTo(expected.top, 1e-9));
    expect(actual.width, closeTo(expected.width, 1e-9));
    expect(actual.height, closeTo(expected.height, 1e-9));
  }

  group('liveTextContentsRect', () {
    test('an image scaled to exactly fill the viewport maps to the full unit rect', () {
      final rect = liveTextContentsRect(imageSize: const Size(400, 800), viewportSize: viewport, scale: 1.0);

      expectRect(rect, const Rect.fromLTWH(0, 0, 1, 1));
    });

    test('an image at half scale is centred and occupies the middle quarter', () {
      final rect = liveTextContentsRect(imageSize: const Size(400, 800), viewportSize: viewport, scale: 0.5);

      expectRect(rect, const Rect.fromLTWH(0.25, 0.25, 0.5, 0.5));
    });

    test('a landscape image in a portrait viewport is letterboxed (full width, inset vertically)', () {
      // 400x200 image at scale 1.0 in a 400x800 viewport => height 200/800 = 0.25
      final rect = liveTextContentsRect(imageSize: const Size(400, 200), viewportSize: viewport, scale: 1.0);

      expectRect(rect, const Rect.fromLTWH(0, 0.375, 1, 0.25));
    });

    test('a portrait image in a landscape viewport is pillarboxed (full height, inset horizontally)', () {
      final rect = liveTextContentsRect(
        imageSize: const Size(200, 400),
        viewportSize: const Size(800, 400),
        scale: 1.0,
      );

      expectRect(rect, const Rect.fromLTWH(0.375, 0, 0.25, 1));
    });

    test('a zoomed image returns an unclamped rect that extends beyond the viewport', () {
      final rect = liveTextContentsRect(imageSize: const Size(400, 800), viewportSize: viewport, scale: 2.0);

      expectRect(rect, const Rect.fromLTWH(-0.5, -0.5, 2, 2));
      expect(rect.left, lessThan(0), reason: 'clamping would misplace every text box while zoomed');
    });

    test('panning offsets the rect by the pan distance normalised to the viewport', () {
      final rect = liveTextContentsRect(
        imageSize: const Size(400, 800),
        viewportSize: viewport,
        scale: 1.0,
        position: const Offset(100, -80),
      );

      // dx 100/400 = 0.25, dy -80/800 = -0.1
      expectRect(rect, const Rect.fromLTWH(0.25, -0.1, 1, 1));
    });

    test('a null scale falls back to the contained scale', () {
      // contained scale for 800x800 in 400x800 is min(0.5, 1.0) = 0.5
      final rect = liveTextContentsRect(imageSize: const Size(800, 800), viewportSize: viewport);

      expectRect(rect, const Rect.fromLTWH(0, 0.25, 1, 0.5));
    });

    group('degenerate input returns Rect.zero', () {
      test('zero viewport width', () {
        expect(liveTextContentsRect(imageSize: const Size(10, 10), viewportSize: const Size(0, 800)), Rect.zero);
      });

      test('zero viewport height', () {
        expect(liveTextContentsRect(imageSize: const Size(10, 10), viewportSize: const Size(400, 0)), Rect.zero);
      });

      test('zero image width', () {
        expect(liveTextContentsRect(imageSize: const Size(0, 10), viewportSize: viewport), Rect.zero);
      });

      test('zero image height', () {
        expect(liveTextContentsRect(imageSize: const Size(10, 0), viewportSize: viewport), Rect.zero);
      });

      test('zero scale', () {
        expect(liveTextContentsRect(imageSize: const Size(10, 10), viewportSize: viewport, scale: 0), Rect.zero);
      });

      test('negative scale', () {
        expect(liveTextContentsRect(imageSize: const Size(10, 10), viewportSize: viewport, scale: -1), Rect.zero);
      });

      test('non-finite scale', () {
        expect(
          liveTextContentsRect(imageSize: const Size(10, 10), viewportSize: viewport, scale: double.nan),
          Rect.zero,
        );
        expect(
          liveTextContentsRect(imageSize: const Size(10, 10), viewportSize: viewport, scale: double.infinity),
          Rect.zero,
        );
      });

      test('non-finite pan position', () {
        expect(
          liveTextContentsRect(
            imageSize: const Size(10, 10),
            viewportSize: viewport,
            scale: 1,
            position: const Offset(double.nan, 0),
          ),
          Rect.zero,
        );
      });
    });
  });
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd mobile && flutter test test/utils/live_text_contents_rect_test.dart
```

Expected: FAIL — `Error when reading 'lib/utils/live_text_contents_rect.dart': No such file or directory`.

- [ ] **Step 3: Write the implementation**

```dart
// mobile/lib/utils/live_text_contents_rect.dart
import 'dart:math' as math;
import 'dart:ui';

/// Maps the PhotoView transform onto the rectangle occupied by the image,
/// expressed in unit coordinates of the viewport.
///
/// This is what VisionKit's `ImageAnalysisInteraction.contentsRect` expects for
/// hosts that are not a `UIImageView`. The result is deliberately **not**
/// clamped to `0..1`: while the user is zoomed in the image genuinely extends
/// past the viewport, and clamping would shift every recognised text box.
///
/// Mirrors the placement math in `ocr_overlay.widget.dart` so the native and
/// Flutter overlays agree on where the image is.
Rect liveTextContentsRect({
  required Size imageSize,
  required Size viewportSize,
  double? scale,
  Offset position = Offset.zero,
}) {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return Rect.zero;
  }
  if (imageSize.width <= 0 || imageSize.height <= 0) {
    return Rect.zero;
  }
  if (!position.dx.isFinite || !position.dy.isFinite) {
    return Rect.zero;
  }

  final effectiveScale =
      scale ?? math.min(viewportSize.width / imageSize.width, viewportSize.height / imageSize.height);

  if (!effectiveScale.isFinite || effectiveScale <= 0) {
    return Rect.zero;
  }

  final width = imageSize.width * effectiveScale;
  final height = imageSize.height * effectiveScale;

  // Image centre in viewport space, accounting for pan.
  final centerX = viewportSize.width / 2 + position.dx;
  final centerY = viewportSize.height / 2 + position.dy;

  return Rect.fromLTWH(
    (centerX - width / 2) / viewportSize.width,
    (centerY - height / 2) / viewportSize.height,
    width / viewportSize.width,
    height / viewportSize.height,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd mobile && flutter test test/utils/live_text_contents_rect_test.dart
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/utils/live_text_contents_rect.dart mobile/test/utils/live_text_contents_rect_test.dart
git commit -m "feat(mobile): add Live Text contentsRect coordinate mapping"
```

---

### Task 3: Pigeon bridge definition

**Files:**

- Create: `mobile/pigeon/live_text_api.dart`
- Generated: `mobile/lib/platform/live_text_api.g.dart`, `mobile/ios/Runner/LiveText/LiveText.g.swift`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `LiveTextHostApi` with `Future<bool> isSupported()`, `Future<void> setContentsRect(int viewId, double left, double top, double width, double height)`, `Future<void> loadImage(int viewId, String url)`, `Future<void> dispose(int viewId)`.
  - `LiveTextFlutterApi` (abstract, with `static void setUp(LiveTextFlutterApi? api)`) declaring `void onAnalysisComplete(int viewId, bool hasText)`.

**Deliberate deviation from codebase convention:** every existing file in `mobile/pigeon/` declares `kotlinOut`, because every existing API is cross-platform. This one is iOS-only, so `kotlinOut` is **omitted** rather than generating an Android interface nobody implements. `LiveTextService` short-circuits on `!CurrentPlatform.isIOS` before any channel call, and Task 4 has a test proving it.

- [ ] **Step 1: Write the Pigeon definition**

```dart
// mobile/pigeon/live_text_api.dart
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
}
```

- [ ] **Step 2: Generate the bridge**

```bash
cd mobile && mise run pigeon
```

Expected: creates `lib/platform/live_text_api.g.dart` and `ios/Runner/LiveText/LiveText.g.swift`. It will not create a Kotlin file.

- [ ] **Step 3: Verify the generated Dart analyses cleanly**

```bash
cd mobile && dart analyze --fatal-infos lib/platform/live_text_api.g.dart
```

Expected: `No issues found!`

- [ ] **Step 4: Commit**

```bash
git add mobile/pigeon/live_text_api.dart mobile/lib/platform/live_text_api.g.dart mobile/ios/Runner/LiveText/LiveText.g.swift
git commit -m "feat(mobile): add Live Text pigeon bridge"
```

---

### Task 4: Support gating service

**Files:**

- Create: `mobile/lib/domain/services/live_text.service.dart`
- Create: `mobile/lib/providers/infrastructure/live_text.provider.dart`
- Test: `mobile/test/services/live_text.service_test.dart`

**Interfaces:**

- Consumes: `LiveTextHostApi` (Task 3).
- Produces:
  - `LiveTextService(LiveTextHostApi api)` with `Future<bool> isSupported()`.
  - `liveTextHostApiProvider` (`Provider<LiveTextHostApi>`), `liveTextServiceProvider` (`Provider<LiveTextService>`), `liveTextSupportedProvider` (`FutureProvider<bool>`).

- [ ] **Step 1: Write the failing tests**

```dart
// mobile/test/services/live_text.service_test.dart
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd mobile && flutter test test/services/live_text.service_test.dart
```

Expected: FAIL — `Error when reading 'lib/domain/services/live_text.service.dart': No such file or directory`.

- [ ] **Step 3: Write the implementation**

```dart
// mobile/lib/domain/services/live_text.service.dart
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
```

```dart
// mobile/lib/providers/infrastructure/live_text.provider.dart
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/services/live_text.service.dart';
import 'package:immich_mobile/platform/live_text_api.g.dart';

final liveTextHostApiProvider = Provider<LiveTextHostApi>((ref) => LiveTextHostApi());

final liveTextServiceProvider = Provider<LiveTextService>(
  (ref) => LiveTextService(ref.watch(liveTextHostApiProvider)),
);

final liveTextSupportedProvider = FutureProvider<bool>((ref) => ref.watch(liveTextServiceProvider).isSupported());
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd mobile && flutter test test/services/live_text.service_test.dart
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/domain/services/live_text.service.dart mobile/lib/providers/infrastructure/live_text.provider.dart mobile/test/services/live_text.service_test.dart
git commit -m "feat(mobile): add Live Text support gating service"
```

---

### Task 5: Native platform view

Swift is a thin shell: it holds a rect, answers delegate questions, and runs the analyzer. All decisions live in Dart. CI cannot execute this code, so it is guarded by source-level assertions in the same style as `mobile/test/platform/background_worker_native_files_test.dart`.

**Files:**

- Create: `mobile/ios/Runner/LiveText/LiveTextPassthroughView.swift`
- Create: `mobile/ios/Runner/LiveText/LiveTextPlatformView.swift`
- Create: `mobile/ios/Runner/LiveText/LiveTextPlatformViewFactory.swift`
- Create: `mobile/ios/Runner/LiveText/LiveTextApiImpl.swift`
- Modify: `mobile/ios/Runner/AppDelegate.swift:29-36`
- Test: `mobile/test/platform/live_text_native_files_test.dart`

**Interfaces:**

- Consumes: `LiveTextHostApi`/`LiveTextFlutterApi` (Task 3), `URLSessionManager.shared.session`.
- Produces: a platform view registered under the view type `immich/live_text_overlay`, and `LiveTextApiImpl` registered as the host API.

- [ ] **Step 1: Write the failing native-source guard tests**

```dart
// mobile/test/platform/live_text_native_files_test.dart
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd mobile && flutter test test/platform/live_text_native_files_test.dart
```

Expected: FAIL — `PathNotFoundException` on `ios/Runner/LiveText/LiveTextPlatformView.swift`.

- [ ] **Step 3: Write the passthrough view**

```swift
// mobile/ios/Runner/LiveText/LiveTextPassthroughView.swift
import UIKit
import VisionKit

/// Transparent host for the Live Text interaction.
///
/// The photo itself is drawn by Flutter underneath this view. We only want to
/// steal touches that Live Text can actually act on; everything else must fall
/// through so PhotoView keeps its pinch, pan, page-swipe and dismiss gestures.
/// Returning `nil` from `hitTest` is what makes that fall-through happen.
@available(iOS 16.0, *)
final class LiveTextPassthroughView: UIView {
  weak var analysisInteraction: ImageAnalysisInteraction?

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard let analysisInteraction else { return nil }

    // While a selection is live, its drag handles and callout menu sit outside
    // the text quads. Claim every touch so they stay usable, and so a tap on
    // empty space can dismiss the selection.
    if analysisInteraction.hasActiveTextSelection {
      return super.hitTest(point, with: event)
    }

    guard analysisInteraction.analysisHasText(at: point) else { return nil }

    return super.hitTest(point, with: event)
  }
}
```

- [ ] **Step 4: Write the platform view**

```swift
// mobile/ios/Runner/LiveText/LiveTextPlatformView.swift
import Flutter
import UIKit
import VisionKit

@available(iOS 16.0, *)
final class LiveTextPlatformView: NSObject, FlutterPlatformView, ImageAnalysisInteractionDelegate {
  private let container: LiveTextPassthroughView
  private let interaction = ImageAnalysisInteraction()
  private let analyzer = ImageAnalyzer()
  private let viewId: Int64
  private let flutterApi: LiveTextFlutterApi

  /// Unit-coordinate rect of the image inside `container`, pushed from Dart.
  private var imageContentsRect: CGRect = .zero
  private var analysisTask: Task<Void, Never>?

  init(frame: CGRect, viewId: Int64, messenger: FlutterBinaryMessenger) {
    self.viewId = viewId
    self.flutterApi = LiveTextFlutterApi(binaryMessenger: messenger)
    container = LiveTextPassthroughView(frame: frame)
    super.init()

    container.backgroundColor = .clear
    container.isOpaque = false
    container.analysisInteraction = interaction

    interaction.delegate = self
    interaction.preferredInteractionTypes = [.textSelection, .dataDetectors]
    // Flutter already draws an OCR toggle button; suppress Apple's.
    interaction.isSupplementaryInterfaceHidden = true
    container.addInteraction(interaction)
  }

  func view() -> UIView { container }

  func setContentsRect(_ rect: CGRect) {
    guard rect != imageContentsRect else { return }
    imageContentsRect = rect
    interaction.setContentsRectNeedsUpdate()
  }

  func loadImage(url: String) {
    guard let requestUrl = URL(string: url) else {
      reportNoText()
      return
    }

    analysisTask?.cancel()
    analysisTask = Task { [weak self] in
      guard let self else { return }

      var request = URLRequest(url: requestUrl)
      // The shared session already carries auth headers, cookies and client
      // certificates, and its 1 GB URLCache almost always already holds the
      // preview the viewer is displaying.
      request.cachePolicy = .returnCacheDataElseLoad

      do {
        let (data, _) = try await URLSessionManager.shared.session.data(for: request)
        guard !Task.isCancelled, let image = UIImage(data: data) else {
          self.reportNoText()
          return
        }

        // Text only. `.machineReadableCode` would be analysed but never
        // reachable: LiveTextPassthroughView admits touches via
        // `analysisHasText(at:)`, which is false over a QR code, so the
        // interaction would never see the tap. See "Out of Scope".
        let configuration = ImageAnalyzer.Configuration([.text])
        let analysis = try await self.analyzer.analyze(image, configuration: configuration)
        guard !Task.isCancelled else { return }

        await MainActor.run {
          self.interaction.analysis = analysis
          self.flutterApi.onAnalysisComplete(viewId: self.viewId, hasText: analysis.hasResults(for: .text)) { _ in }
        }
      } catch {
        self.reportNoText()
      }
    }
  }

  func reset() {
    analysisTask?.cancel()
    analysisTask = nil
    interaction.resetTextSelection()
    interaction.analysis = nil
  }

  private func reportNoText() {
    Task { @MainActor in
      self.flutterApi.onAnalysisComplete(viewId: self.viewId, hasText: false) { _ in }
    }
  }

  // MARK: - ImageAnalysisInteractionDelegate

  func contentView(for interaction: ImageAnalysisInteraction) -> UIView? {
    container
  }

  func contentsRect(for interaction: ImageAnalysisInteraction) -> CGRect {
    imageContentsRect
  }

  func presentingViewController(for interaction: ImageAnalysisInteraction) -> UIViewController? {
    container.window?.rootViewController
  }

  func interaction(
    _ interaction: ImageAnalysisInteraction,
    shouldBeginAt point: CGPoint,
    for interactionTypes: ImageAnalysisInteraction.InteractionTypes
  ) -> Bool {
    interaction.hasActiveTextSelection || interaction.analysisHasText(at: point)
  }
}
```

- [ ] **Step 5: Write the factory and host API impl**

```swift
// mobile/ios/Runner/LiveText/LiveTextPlatformViewFactory.swift
import Flutter
import UIKit

@available(iOS 16.0, *)
final class LiveTextPlatformViewFactory: NSObject, FlutterPlatformViewFactory {
  static let viewType = "immich/live_text_overlay"

  private let messenger: FlutterBinaryMessenger
  private let registry: LiveTextViewRegistry

  init(messenger: FlutterBinaryMessenger, registry: LiveTextViewRegistry) {
    self.messenger = messenger
    self.registry = registry
    super.init()
  }

  func create(withFrame frame: CGRect, viewIdentifier viewId: Int64, arguments args: Any?) -> FlutterPlatformView {
    let view = LiveTextPlatformView(frame: frame, viewId: viewId, messenger: messenger)
    registry.add(viewId: viewId, view: view)
    return view
  }

  func createArgsCodec() -> FlutterMessageCodec & NSObjectProtocol {
    FlutterStandardMessageCodec.sharedInstance()
  }
}
```

```swift
// mobile/ios/Runner/LiveText/LiveTextApiImpl.swift
import Foundation
import VisionKit

/// Holds the live platform views so host-API calls can be routed by view id.
final class LiveTextViewRegistry {
  private var views: [Int64: AnyObject] = [:]
  private let lock = NSLock()

  func add(viewId: Int64, view: AnyObject) {
    lock.lock()
    defer { lock.unlock() }
    views[viewId] = view
  }

  func remove(viewId: Int64) {
    lock.lock()
    defer { lock.unlock() }
    views.removeValue(forKey: viewId)
  }

  @available(iOS 16.0, *)
  func view(_ viewId: Int64) -> LiveTextPlatformView? {
    lock.lock()
    defer { lock.unlock() }
    return views[viewId] as? LiveTextPlatformView
  }
}

final class LiveTextApiImpl: NSObject, LiveTextHostApi {
  private let registry: LiveTextViewRegistry

  init(registry: LiveTextViewRegistry) {
    self.registry = registry
    super.init()
  }

  func isSupported() throws -> Bool {
    guard #available(iOS 16.0, *) else { return false }
    return ImageAnalyzer.isSupported
  }

  func setContentsRect(viewId: Int64, left: Double, top: Double, width: Double, height: Double) throws {
    guard #available(iOS 16.0, *) else { return }
    registry.view(viewId)?.setContentsRect(CGRect(x: left, y: top, width: width, height: height))
  }

  func loadImage(viewId: Int64, url: String) throws {
    guard #available(iOS 16.0, *) else { return }
    registry.view(viewId)?.loadImage(url: url)
  }

  func dispose(viewId: Int64) throws {
    if #available(iOS 16.0, *) {
      registry.view(viewId)?.reset()
    }
    registry.remove(viewId: viewId)
  }
}
```

- [ ] **Step 6: Register in AppDelegate**

In `mobile/ios/Runner/AppDelegate.swift`, add a stored registry and extend `registerPlugins`:

```swift
  private static let liveTextRegistry = LiveTextViewRegistry()

  public static func registerPlugins(with registry: FlutterPluginRegistry, messenger: FlutterBinaryMessenger) {
    NativeSyncApiImpl.register(with: registry.registrar(forPlugin: NativeSyncApiImpl.name)!)
    PermissionApiSetup.setUp(binaryMessenger: messenger, api: PermissionApiImpl())
    LocalImageApiSetup.setUp(binaryMessenger: messenger, api: LocalImageApiImpl())
    RemoteImageApiSetup.setUp(binaryMessenger: messenger, api: RemoteImageApiImpl())
    BackgroundWorkerFgHostApiSetup.setUp(binaryMessenger: messenger, api: BackgroundWorkerApiImpl())
    ConnectivityApiSetup.setUp(binaryMessenger: messenger, api: ConnectivityApiImpl())
    NetworkApiSetup.setUp(binaryMessenger: messenger, api: NetworkApiImpl())
    LiveTextHostApiSetup.setUp(binaryMessenger: messenger, api: LiveTextApiImpl(registry: liveTextRegistry))

    if #available(iOS 16.0, *) {
      registry.registrar(forPlugin: "LiveTextPlatformView")!
        .register(
          LiveTextPlatformViewFactory(messenger: messenger, registry: liveTextRegistry),
          withId: LiveTextPlatformViewFactory.viewType
        )
    }
  }
```

- [ ] **Step 7: Add the new files to the Xcode target**

Swift files under `ios/Runner/` are not compiled until they are members of the `Runner` target's source build phase. The `xcodeproj` gem (1.27.0) is already in `mobile/ios/Gemfile.lock` via cocoapods, so this is scriptable — do not do it by hand in Xcode.

```bash
cd mobile/ios && bundle exec ruby -e '
require "xcodeproj"

project = Xcodeproj::Project.open("Runner.xcodeproj")
target = project.targets.find { |t| t.name == "Runner" }
raise "Runner target not found" unless target

runner_group = project.main_group["Runner"]
group = runner_group["LiveText"] || runner_group.new_group("LiveText", "Runner/LiveText")

existing = target.source_build_phase.files_references.map { |r| File.basename(r.path.to_s) }

Dir.glob("Runner/LiveText/*.swift").sort.each do |path|
  name = File.basename(path)
  next if existing.include?(name)
  ref = group.new_reference(name)
  target.add_file_references([ref])
  puts "added #{name}"
end

project.save
'
```

Expected: one `added ...` line per Swift file. Then confirm membership and that the target compiles:

```bash
cd mobile/ios && for f in LiveTextPassthroughView LiveTextPlatformView LiveTextPlatformViewFactory LiveTextApiImpl LiveText.g; do
  grep -q "$f.swift" Runner.xcodeproj/project.pbxproj && echo "OK $f" || echo "MISSING $f"
done
cd .. && flutter build ios --simulator --debug
```

Expected: five `OK` lines, then a successful build. (Live Text will not _function_ in the Simulator — this only proves it compiles.)

- [ ] **Step 8: Run the guard tests to verify they pass**

```bash
cd mobile && flutter test test/platform/live_text_native_files_test.dart
```

Expected: PASS, 8 tests.

- [ ] **Step 9: Commit**

```bash
git add mobile/ios/Runner/LiveText mobile/ios/Runner/AppDelegate.swift mobile/ios/Runner.xcodeproj/project.pbxproj mobile/test/platform/live_text_native_files_test.dart
git commit -m "feat(mobile): add native Live Text platform view for iOS"
```

---

### Task 6: Callback dispatcher

`LiveTextFlutterApi.setUp()` installs **one** global handler. The asset viewer is a `PageView`, so adjacent pages can each build an overlay while `showingOcr` is true — if every overlay called `setUp(this)`, the last one would silently steal callbacks from the others, and the first to be disposed would call `setUp(null)` and kill delivery for all of them. A single dispatcher owns the binding and fans out by `viewId`.

**Files:**

- Create: `mobile/lib/presentation/widgets/asset_viewer/live_text_callback_dispatcher.dart`
- Test: `mobile/test/presentation/widgets/asset_viewer/live_text_callback_dispatcher_test.dart`

**Interfaces:**

- Consumes: `LiveTextFlutterApi` (Task 3).
- Produces: `LiveTextCallbackDispatcher.instance` with `void register(int viewId, ValueChanged<bool> onAnalysisComplete)`, `void unregister(int viewId)`, and `@visibleForTesting int get listenerCount`.

- [ ] **Step 1: Write the failing tests**

```dart
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd mobile && flutter test test/presentation/widgets/asset_viewer/live_text_callback_dispatcher_test.dart
```

Expected: FAIL — `Error when reading 'lib/presentation/widgets/asset_viewer/live_text_callback_dispatcher.dart': No such file or directory`.

- [ ] **Step 3: Write the implementation**

```dart
// mobile/lib/presentation/widgets/asset_viewer/live_text_callback_dispatcher.dart
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
  bool _bound = false;

  void register(int viewId, ValueChanged<bool> onAnalysisComplete) {
    if (!_bound) {
      LiveTextFlutterApi.setUp(this);
      _bound = true;
    }
    _listeners[viewId] = onAnalysisComplete;
  }

  void unregister(int viewId) {
    _listeners.remove(viewId);
  }

  @visibleForTesting
  int get listenerCount => _listeners.length;

  @override
  void onAnalysisComplete(int viewId, bool hasText) {
    _listeners[viewId]?.call(hasText);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd mobile && flutter test test/presentation/widgets/asset_viewer/live_text_callback_dispatcher_test.dart
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/presentation/widgets/asset_viewer/live_text_callback_dispatcher.dart mobile/test/presentation/widgets/asset_viewer/live_text_callback_dispatcher_test.dart
git commit -m "feat(mobile): route Live Text callbacks by platform view id"
```

---

### Task 7: LiveTextOverlay widget

**Files:**

- Create: `mobile/lib/presentation/widgets/asset_viewer/live_text_overlay.widget.dart`
- Test: `mobile/test/presentation/widgets/asset_viewer/live_text_overlay_test.dart`

**Interfaces:**

- Consumes: `liveTextContentsRect` (Task 2), `liveTextHostApiProvider` (Task 4), `LiveTextCallbackDispatcher` (Task 6).
- Produces:
  - `typedef LiveTextPlatformViewBuilder = Widget Function(void Function(int viewId) onCreated);`
  - `LiveTextOverlay({required String previewUrl, required Size imageSize, required Size viewportSize, required ValueChanged<bool> onAnalysisComplete, PhotoViewControllerBase? controller, LiveTextPlatformViewBuilder? platformViewBuilder})`
  - `LiveTextOverlayState` (public so widget tests can reach it via `tester.state`).

Two deliberate seams: `previewUrl` is passed in rather than built inside (keeps `Store` out of the widget, so tests need no database), and `platformViewBuilder` defaults to a real `UiKitView` but can be stubbed (a `UiKitView` cannot be instantiated in a widget test).

- [ ] **Step 1: Write the failing tests**

```dart
// mobile/test/presentation/widgets/asset_viewer/live_text_overlay_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/platform/live_text_api.g.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_overlay.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_callback_dispatcher.dart';
import 'package:immich_mobile/providers/infrastructure/live_text.provider.dart';
import 'package:immich_mobile/widgets/photo_view/photo_view.dart';
// ScaleBoundaries is not re-exported by photo_view.dart; deep same-package
// imports of the vendored photo_view are normal (see photo_view/src/**).
import 'package:immich_mobile/widgets/photo_view/src/utils/photo_view_utils.dart';
import 'package:mocktail/mocktail.dart';

import '../../../widget_tester_extensions.dart';

class MockLiveTextHostApi extends Mock implements LiveTextHostApi {}

const _previewUrl = 'http://localhost:0/assets/asset-1/thumbnail?size=preview';

/// PhotoView reports `childSize` as the *decoded* size, which for a remote
/// asset is the downscaled preview rather than the stored dimensions.
ScaleBoundaries _boundaries({required Size childSize, Size outerSize = const Size(400, 800)}) =>
    ScaleBoundaries(PhotoViewComputedScale.contained, PhotoViewComputedScale.covered, 1.0, outerSize, childSize);

void main() {
  late MockLiveTextHostApi api;

  setUp(() {
    api = MockLiveTextHostApi();
    when(() => api.loadImage(any(), any())).thenAnswer((_) async {});
    when(() => api.dispose(any())).thenAnswer((_) async {});
    when(() => api.setContentsRect(any(), any(), any(), any(), any())).thenAnswer((_) async {});
  });

  Widget subject({
    Size viewportSize = const Size(400, 800),
    Size imageSize = const Size(400, 800),
    String previewUrl = _previewUrl,
    ValueChanged<bool>? onAnalysisComplete,
    PhotoViewControllerBase? controller,
    required void Function(void Function(int)) captureOnCreated,
  }) => LiveTextOverlay(
    previewUrl: previewUrl,
    imageSize: imageSize,
    viewportSize: viewportSize,
    controller: controller,
    onAnalysisComplete: onAnalysisComplete ?? (_) {},
    platformViewBuilder: (onCreated) {
      captureOnCreated(onCreated);
      return const SizedBox.shrink();
    },
  );

  Future<void Function(int)> pump(
    WidgetTester tester, {
    Size viewportSize = const Size(400, 800),
    Size imageSize = const Size(400, 800),
    ValueChanged<bool>? onAnalysisComplete,
    PhotoViewControllerBase? controller,
    bool createView = true,
  }) async {
    late void Function(int) created;

    await tester.pumpConsumerWidgetRaw(
      subject(
        viewportSize: viewportSize,
        imageSize: imageSize,
        onAnalysisComplete: onAnalysisComplete,
        controller: controller,
        captureOnCreated: (cb) => created = cb,
      ),
      overrides: [liveTextHostApiProvider.overrideWithValue(api)],
    );
    await tester.pump();

    if (createView) {
      created(7);
      await tester.pump();
    }
    return created;
  }

  group('LiveTextOverlay', () {
    testWidgets('asks native to analyse the preview once the platform view exists', (tester) async {
      await pump(tester);

      verify(() => api.loadImage(7, _previewUrl)).called(1);
    });

    testWidgets('pushes the initial contents rect for an unzoomed image', (tester) async {
      await pump(tester);

      verify(() => api.setContentsRect(7, 0.0, 0.0, 1.0, 1.0)).called(1);
    });

    testWidgets('does not talk to native before the platform view is created', (tester) async {
      await pump(tester, createView: false);

      verifyNever(() => api.loadImage(any(), any()));
      verifyNever(() => api.setContentsRect(any(), any(), any(), any(), any()));
    });

    testWidgets('pushes a new contents rect when the controller reports a zoom', (tester) async {
      final controller = PhotoViewController();
      addTearDown(controller.dispose);

      await pump(tester, controller: controller);
      clearInteractions(api);

      controller.scale = 2.0;
      await tester.pump();

      verify(() => api.setContentsRect(7, -0.5, -0.5, 2.0, 2.0)).called(1);
    });

    testWidgets('pushes a new contents rect when the controller reports a pan', (tester) async {
      final controller = PhotoViewController(initialScale: 1.0);
      addTearDown(controller.dispose);

      await pump(tester, controller: controller);
      clearInteractions(api);

      controller.position = const Offset(100, -80);
      await tester.pump();

      verify(() => api.setContentsRect(7, 0.25, -0.1, 1.0, 1.0)).called(1);
    });

    testWidgets('skips redundant pushes when the controller re-emits an identical transform', (tester) async {
      final controller = PhotoViewController(initialScale: 1.0);
      addTearDown(controller.dispose);

      await pump(tester, controller: controller);
      controller.scale = 2.0;
      await tester.pump();
      clearInteractions(api);

      // Re-pump with identical props: didUpdateWidget calls _pushContentsRect
      // directly, bypassing the controller's own equality short-circuit, so this
      // genuinely exercises the widget's _lastRect guard.
      await tester.pumpConsumerWidgetRaw(
        subject(controller: controller, captureOnCreated: (_) {}),
        overrides: [liveTextHostApiProvider.overrideWithValue(api)],
      );
      await tester.pump();

      verifyNever(() => api.setContentsRect(any(), any(), any(), any(), any()));
    });

    testWidgets('prefers the decoded childSize over the stored asset dimensions', (tester) async {
      final controller = PhotoViewController(initialScale: 1.0);
      addTearDown(controller.dispose);
      // Server served a 200x400 preview for a 4000x8000 asset.
      controller.scaleBoundaries = _boundaries(childSize: const Size(200, 400));

      await pump(tester, controller: controller, imageSize: const Size(4000, 8000));

      // 200x400 at scale 1.0 in a 400x800 viewport => centred quarter.
      verify(() => api.setContentsRect(7, 0.25, 0.25, 0.5, 0.5)).called(1);
    });

    testWidgets('seeds the transform from a controller that has already laid out', (tester) async {
      final controller = PhotoViewController(initialScale: 2.0);
      addTearDown(controller.dispose);
      controller.scaleBoundaries = _boundaries(childSize: const Size(400, 800));

      await pump(tester, controller: controller);

      verify(() => api.setContentsRect(7, -0.5, -0.5, 2.0, 2.0)).called(1);
    });

    testWidgets('ignores a controller transform until scaleBoundaries is set', (tester) async {
      // Before layout PhotoView reports a placeholder scale of 1.0 that is wrong
      // for any image that does not exactly fill the viewport.
      final controller = PhotoViewController(initialScale: 2.0);
      addTearDown(controller.dispose);

      await pump(tester, controller: controller, imageSize: const Size(800, 800));

      // Falls back to the contained scale (0.5), not the untrustworthy 2.0.
      verify(() => api.setContentsRect(7, 0.0, 0.25, 1.0, 0.5)).called(1);
    });

    testWidgets('resubscribes when the controller instance is swapped', (tester) async {
      final first = PhotoViewController(initialScale: 1.0);
      final second = PhotoViewController(initialScale: 1.0);
      addTearDown(first.dispose);
      addTearDown(second.dispose);

      await pump(tester, controller: first);

      await tester.pumpConsumerWidgetRaw(
        subject(controller: second, captureOnCreated: (_) {}),
        overrides: [liveTextHostApiProvider.overrideWithValue(api)],
      );
      await tester.pump();
      clearInteractions(api);

      // The old controller must no longer drive the overlay.
      first.scale = 3.0;
      await tester.pump();
      verifyNever(() => api.setContentsRect(any(), any(), any(), any(), any()));

      second.scale = 2.0;
      await tester.pump();
      verify(() => api.setContentsRect(7, -0.5, -0.5, 2.0, 2.0)).called(1);
    });

    testWidgets('disposes the native view when removed from the tree', (tester) async {
      await pump(tester);

      await tester.pumpConsumerWidgetRaw(
        const SizedBox.shrink(),
        overrides: [liveTextHostApiProvider.overrideWithValue(api)],
      );
      await tester.pump();

      verify(() => api.dispose(7)).called(1);
    });

    testWidgets('unregisters from the callback dispatcher on dispose', (tester) async {
      final before = LiveTextCallbackDispatcher.instance.listenerCount;
      await pump(tester);
      expect(LiveTextCallbackDispatcher.instance.listenerCount, before + 1);

      await tester.pumpConsumerWidgetRaw(
        const SizedBox.shrink(),
        overrides: [liveTextHostApiProvider.overrideWithValue(api)],
      );
      await tester.pump();

      expect(
        LiveTextCallbackDispatcher.instance.listenerCount,
        before,
        reason: 'leaking listeners would misroute callbacks after paging',
      );
    });

    testWidgets('reports the analysis result through onAnalysisComplete', (tester) async {
      bool? reported;
      await pump(tester, onAnalysisComplete: (hasText) => reported = hasText);

      tester.state<LiveTextOverlayState>(find.byType(LiveTextOverlay)).onAnalysisComplete(false);
      await tester.pump();

      expect(reported, isFalse);
    });

    testWidgets('a degenerate viewport pushes a zero rect rather than NaN', (tester) async {
      await pump(tester, viewportSize: Size.zero);

      verify(() => api.setContentsRect(7, 0.0, 0.0, 0.0, 0.0)).called(1);
    });

    testWidgets('reloads the analysis when the preview url changes', (tester) async {
      await pump(tester);
      clearInteractions(api);

      await tester.pumpConsumerWidgetRaw(
        subject(previewUrl: 'http://localhost:0/assets/asset-2/thumbnail?size=preview', captureOnCreated: (_) {}),
        overrides: [liveTextHostApiProvider.overrideWithValue(api)],
      );
      await tester.pump();

      verify(() => api.loadImage(7, 'http://localhost:0/assets/asset-2/thumbnail?size=preview')).called(1);
    });

    testWidgets('does not reload when an unrelated prop changes', (tester) async {
      await pump(tester);
      clearInteractions(api);

      await tester.pumpConsumerWidgetRaw(
        subject(viewportSize: const Size(400, 900), captureOnCreated: (_) {}),
        overrides: [liveTextHostApiProvider.overrideWithValue(api)],
      );
      await tester.pump();

      verifyNever(() => api.loadImage(any(), any()));
    });
  });
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd mobile && flutter test test/presentation/widgets/asset_viewer/live_text_overlay_test.dart
```

Expected: FAIL — `Error when reading 'lib/presentation/widgets/asset_viewer/live_text_overlay.widget.dart': No such file or directory`.

- [ ] **Step 3: Write the implementation**

```dart
// mobile/lib/presentation/widgets/asset_viewer/live_text_overlay.widget.dart
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd mobile && flutter test test/presentation/widgets/asset_viewer/live_text_overlay_test.dart
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/presentation/widgets/asset_viewer/live_text_overlay.widget.dart mobile/test/presentation/widgets/asset_viewer/live_text_overlay_test.dart
git commit -m "feat(mobile): add Live Text overlay widget"
```

---

### Task 8: Overlay switcher and asset page integration

The switcher is the only thing `asset_page.widget.dart` sees, which keeps the upstream diff to one import plus one identifier. It also owns the correctness case Live Text introduces: the OCR button is shown when the _server_ found text, but the _displayed_ text now comes from Live Text. If Live Text finds nothing, the user would toggle OCR on and see an empty screen — so we fall back to `OcrOverlay`.

**Files:**

- Create: `mobile/lib/presentation/widgets/asset_viewer/ocr_overlay_switcher.widget.dart`
- Modify: `mobile/lib/presentation/widgets/asset_viewer/asset_page.widget.dart:17,461`
- Test: `mobile/test/presentation/widgets/asset_viewer/ocr_overlay_switcher_test.dart`

**Interfaces:**

- Consumes: `liveTextSupportedProvider` (Task 4), `LiveTextOverlay` (Task 7), the existing `OcrOverlay`, `getThumbnailUrlForRemoteId` (`mobile/lib/utils/image_url_builder.dart`).
- Produces: `OcrOverlaySwitcher({required BaseAsset asset, required Size imageSize, required Size viewportSize, PhotoViewControllerBase? controller})` — a drop-in replacement for `OcrOverlay` with an identical parameter list.

- [ ] **Step 1: Write the failing tests**

```dart
// mobile/test/presentation/widgets/asset_viewer/ocr_overlay_switcher_test.dart
import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/ocr.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_overlay.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/ocr_overlay.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/ocr_overlay_switcher.widget.dart';
import 'package:immich_mobile/providers/infrastructure/live_text.provider.dart';
import 'package:immich_mobile/providers/infrastructure/ocr.provider.dart';
import 'package:immich_mobile/widgets/photo_view/photo_view.dart';

import '../../../fixtures/asset.stub.dart';
import '../../../test_utils.dart';
import '../../../unit/factories/remote_asset_factory.dart';
import '../../../widget_tester_extensions.dart';

void main() {
  late Drift db;

  final remoteAsset = RemoteAssetFactory.create(id: 'asset-1');
  final otherRemoteAsset = RemoteAssetFactory.create(id: 'asset-2');
  final localAsset = LocalAssetStub.image1;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    TestUtils.init();
    db = Drift(drift.DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    await StoreService.init(storeRepository: DriftStoreRepository(db), listenUpdates: false);
  });

  setUp(() async {
    await Store.clear();
    await Store.put(StoreKey.serverEndpoint, 'http://localhost:0');
  });

  tearDownAll(() async {
    await db.close();
  });

  Widget subject(BaseAsset asset, {PhotoViewControllerBase? controller}) => OcrOverlaySwitcher(
    asset: asset,
    imageSize: const Size(400, 800),
    viewportSize: const Size(400, 800),
    controller: controller,
  );

  Future<void> pump(WidgetTester tester, {required bool supported, BaseAsset? asset}) async {
    final target = asset ?? remoteAsset;
    await tester.pumpConsumerWidgetRaw(
      subject(target),
      overrides: [
        liveTextSupportedProvider.overrideWith((ref) async => supported),
        // Keep the upstream overlay away from a real database.
        ocrAssetProvider(target is RemoteAsset ? target.id : '').overrideWith((ref) async => <Ocr>[]),
      ],
    );
    await tester.pumpAndSettle();
  }

  group('OcrOverlaySwitcher', () {
    testWidgets('uses the server OCR overlay when Live Text is unsupported', (tester) async {
      await pump(tester, supported: false);

      expect(find.byType(OcrOverlay), findsOneWidget);
      expect(find.byType(LiveTextOverlay), findsNothing);
    });

    testWidgets('uses the Live Text overlay when supported', (tester) async {
      await pump(tester, supported: true);

      expect(find.byType(LiveTextOverlay), findsOneWidget);
      expect(find.byType(OcrOverlay), findsNothing);
    });

    testWidgets('falls back to the server overlay while support is still resolving', (tester) async {
      await tester.pumpConsumerWidgetRaw(
        subject(remoteAsset),
        overrides: [
          liveTextSupportedProvider.overrideWith((ref) async {
            await Future<void>.delayed(const Duration(seconds: 1));
            return true;
          }),
          ocrAssetProvider(remoteAsset.id).overrideWith((ref) async => <Ocr>[]),
        ],
      );
      await tester.pump();

      expect(find.byType(OcrOverlay), findsOneWidget);

      await tester.pumpAndSettle(const Duration(seconds: 2));
    });

    testWidgets('falls back to the server overlay when the support probe errors', (tester) async {
      await tester.pumpConsumerWidgetRaw(
        subject(remoteAsset),
        overrides: [
          liveTextSupportedProvider.overrideWith((ref) async => throw Exception('boom')),
          ocrAssetProvider(remoteAsset.id).overrideWith((ref) async => <Ocr>[]),
        ],
      );
      await tester.pumpAndSettle();

      expect(find.byType(OcrOverlay), findsOneWidget);
    });

    testWidgets('uses the server overlay for non-remote assets even when supported', (tester) async {
      await pump(tester, supported: true, asset: localAsset);

      expect(find.byType(OcrOverlay), findsOneWidget);
      expect(find.byType(LiveTextOverlay), findsNothing);
    });

    testWidgets('falls back to the server overlay when Live Text finds no text', (tester) async {
      await pump(tester, supported: true);
      expect(find.byType(LiveTextOverlay), findsOneWidget);

      tester.widget<LiveTextOverlay>(find.byType(LiveTextOverlay)).onAnalysisComplete(false);
      await tester.pumpAndSettle();

      expect(find.byType(OcrOverlay), findsOneWidget);
      expect(find.byType(LiveTextOverlay), findsNothing);
    });

    testWidgets('keeps the Live Text overlay when it finds text', (tester) async {
      await pump(tester, supported: true);

      tester.widget<LiveTextOverlay>(find.byType(LiveTextOverlay)).onAnalysisComplete(true);
      await tester.pumpAndSettle();

      expect(find.byType(LiveTextOverlay), findsOneWidget);
    });

    testWidgets('builds the preview url for the asset', (tester) async {
      await pump(tester, supported: true);

      final overlay = tester.widget<LiveTextOverlay>(find.byType(LiveTextOverlay));

      expect(overlay.previewUrl, contains('asset-1'));
      expect(overlay.previewUrl, contains('preview'));
    });

    testWidgets('forwards the photo view controller to the Live Text overlay', (tester) async {
      final controller = PhotoViewController();
      addTearDown(controller.dispose);

      await tester.pumpConsumerWidgetRaw(
        subject(remoteAsset, controller: controller),
        overrides: [
          liveTextSupportedProvider.overrideWith((ref) async => true),
          ocrAssetProvider(remoteAsset.id).overrideWith((ref) async => <Ocr>[]),
        ],
      );
      await tester.pumpAndSettle();

      expect(tester.widget<LiveTextOverlay>(find.byType(LiveTextOverlay)).controller, same(controller));
    });

    testWidgets('retries Live Text after paging to a different asset', (tester) async {
      await pump(tester, supported: true);

      // This asset has no Live Text results, so we drop to the server overlay.
      tester.widget<LiveTextOverlay>(find.byType(LiveTextOverlay)).onAnalysisComplete(false);
      await tester.pumpAndSettle();
      expect(find.byType(OcrOverlay), findsOneWidget);

      // Swiping to a new asset must re-arm Live Text rather than stay latched.
      await tester.pumpConsumerWidgetRaw(
        subject(otherRemoteAsset),
        overrides: [
          liveTextSupportedProvider.overrideWith((ref) async => true),
          ocrAssetProvider(otherRemoteAsset.id).overrideWith((ref) async => <Ocr>[]),
        ],
      );
      await tester.pumpAndSettle();

      expect(find.byType(LiveTextOverlay), findsOneWidget);
      expect(find.byType(OcrOverlay), findsNothing);
    });
  });
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd mobile && flutter test test/presentation/widgets/asset_viewer/ocr_overlay_switcher_test.dart
```

Expected: FAIL — `Error when reading 'lib/presentation/widgets/asset_viewer/ocr_overlay_switcher.widget.dart': No such file or directory`.

- [ ] **Step 3: Write the implementation**

```dart
// mobile/lib/presentation/widgets/asset_viewer/ocr_overlay_switcher.widget.dart
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/live_text_overlay.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/ocr_overlay.widget.dart';
import 'package:immich_mobile/providers/infrastructure/live_text.provider.dart';
import 'package:immich_mobile/utils/image_url_builder.dart';
import 'package:immich_mobile/widgets/photo_view/photo_view.dart';
import 'package:openapi/api.dart';

/// Picks the OCR text-selection surface for the current platform.
///
/// On iOS 16+ with supporting hardware this is Apple's Live Text, which allows
/// dragging a selection across multiple lines. Everywhere else — and whenever
/// Live Text finds no text in an image the server did OCR — it falls back to
/// the upstream per-line overlay.
///
/// This exists so `asset_page.widget.dart` (upstream code) needs only a
/// one-identifier change.
class OcrOverlaySwitcher extends ConsumerStatefulWidget {
  final BaseAsset asset;
  final Size imageSize;
  final Size viewportSize;
  final PhotoViewControllerBase? controller;

  const OcrOverlaySwitcher({
    super.key,
    required this.asset,
    required this.imageSize,
    required this.viewportSize,
    this.controller,
  });

  @override
  ConsumerState<OcrOverlaySwitcher> createState() => _OcrOverlaySwitcherState();
}

class _OcrOverlaySwitcherState extends ConsumerState<OcrOverlaySwitcher> {
  bool _liveTextFoundNoText = false;

  @override
  void didUpdateWidget(OcrOverlaySwitcher oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.asset != widget.asset) {
      _liveTextFoundNoText = false;
    }
  }

  Widget _serverOverlay() => OcrOverlay(
    asset: widget.asset,
    imageSize: widget.imageSize,
    viewportSize: widget.viewportSize,
    controller: widget.controller,
  );

  @override
  Widget build(BuildContext context) {
    final asset = widget.asset;
    if (asset is! RemoteAsset || _liveTextFoundNoText) {
      return _serverOverlay();
    }

    // Anything other than a resolved `true` keeps the upstream overlay.
    final supported = ref.watch(liveTextSupportedProvider).valueOrNull ?? false;
    if (!supported) {
      return _serverOverlay();
    }

    return LiveTextOverlay(
      previewUrl: getThumbnailUrlForRemoteId(
        asset.id,
        type: AssetMediaSize.preview,
        thumbhash: asset.thumbHash ?? '',
      ),
      imageSize: widget.imageSize,
      viewportSize: widget.viewportSize,
      controller: widget.controller,
      onAnalysisComplete: (hasText) {
        if (!hasText && mounted) {
          setState(() => _liveTextFoundNoText = true);
        }
      },
    );
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd mobile && flutter test test/presentation/widgets/asset_viewer/ocr_overlay_switcher_test.dart
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Wire it into the asset page**

In `mobile/lib/presentation/widgets/asset_viewer/asset_page.widget.dart`, change the import on line 17 to:

```dart
import 'package:immich_mobile/presentation/widgets/asset_viewer/ocr_overlay_switcher.widget.dart';
```

and the widget on line 461 to:

```dart
                    child: OcrOverlaySwitcher(
```

Confirm the diff is exactly two lines:

```bash
git diff --stat mobile/lib/presentation/widgets/asset_viewer/asset_page.widget.dart
```

Expected: `1 file changed, 2 insertions(+), 2 deletions(-)`.

- [ ] **Step 6: Run the full mobile gate**

```bash
cd mobile && flutter test && dart analyze --fatal-infos lib test && mise run format
```

Expected: all tests pass, `No issues found!`, no formatting changes.

- [ ] **Step 7: Commit**

```bash
git add mobile/lib/presentation/widgets/asset_viewer/ocr_overlay_switcher.widget.dart mobile/lib/presentation/widgets/asset_viewer/asset_page.widget.dart mobile/test/presentation/widgets/asset_viewer/ocr_overlay_switcher_test.dart
git commit -m "feat(mobile): use native Live Text for OCR selection on iOS"
```

---

### Task 9: Device verification

CI cannot execute any VisionKit code, so this checklist is the real acceptance gate. It must be run on a physical device before the PR is marked ready.

**Files:**

- Create: `docs/superpowers/plans/2026-08-02-ios-live-text-device-test-report.md`

**Interfaces:**

- Consumes: everything above.
- Produces: a filled-in report committed alongside the feature.

- [ ] **Step 1: Build and install on a physical device**

```bash
cd mobile && flutter build ios --release && flutter install -d <device-id>
```

- [ ] **Step 2: Work through the checklist**

Record PASS/FAIL plus device model and iOS version for each:

| #   | Scenario                                            | Expected                                                      |
| --- | --------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Open a photo of a document, toggle OCR on           | Text highlights appear across the whole image                 |
| 2   | Drag from the first line to the last                | Selection spans **multiple lines** (the headline fix)         |
| 3   | Long-press a selection                              | Copy / Look Up / Translate / Share callout appears            |
| 4   | Pinch-zoom while OCR is on                          | Image zooms **and** highlights stay aligned to the text       |
| 5   | Pan while zoomed                                    | Highlights track the text                                     |
| 6   | Swipe to the next asset with OCR on                 | New photo analysed; no stale highlights from the previous one |
| 7   | Swipe down to dismiss                               | Viewer closes normally                                        |
| 8   | Tap a phone number / URL in a photo                 | Data detector action offered                                  |
| 9   | Toggle OCR off then on                              | Selection cleared, highlights re-appear                       |
| 10  | Open a photo with **no** text that the server OCR'd | Falls back to the per-line overlay, no blank screen           |
| 11  | Rotate the device with OCR on                       | Highlights realign after relayout                             |
| 12  | Airplane mode, previously-viewed photo              | Analysis still works (served from URLCache)                   |
| 13  | Same build on an **iOS 15** device                  | App launches; OCR uses the per-line overlay; no crash         |
| 14  | Android build, unchanged                            | Per-line overlay behaves exactly as before                    |

- [ ] **Step 3: Write the report**

Create `docs/superpowers/plans/2026-08-02-ios-live-text-device-test-report.md` with a results table, the device models and iOS versions used, and screenshots for scenarios 2, 4 and 10.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write docs/superpowers/plans/2026-08-02-ios-live-text-device-test-report.md
git add docs/superpowers/plans/2026-08-02-ios-live-text-device-test-report.md
git commit -m "docs: record Live Text device verification results"
```

---

## Out of Scope

- **Android.** No native equivalent of `ImageAnalysisInteraction` exists. Cross-platform multi-line selection would require geometry-based line grouping in Dart and is a separate plan.
- **Server-side OCR and text search.** Unchanged. Live Text output is never persisted.
- **Subject lifting / Visual Look Up.** `preferredInteractionTypes` is limited to `.textSelection` and `.dataDetectors`. Adding `.imageSubject` / `.visualLookUp` is a cheap follow-up once the base interaction is proven on-device.
- **QR / barcode interaction.** The analyzer is configured for `.text` only. Admitting machine-readable codes would also require widening `LiveTextPassthroughView.hitTest`, which currently gates on `analysisHasText(at:)` — that returns false over a QR code, so analysing for them without changing the gate would produce a capability that can never be tapped. Data detectors inside recognised _text_ (phone numbers, URLs, addresses) do work, because those points are text.
- **The OCR toggle button gate.** It continues to key off server OCR data (`ocr_toggle_button.widget.dart:15`), so Live Text is never offered on images the server has not OCR'd. Ungating it on iOS is a deliberate follow-up decision, not part of this plan.
- **Rotation of the image itself.** `contentsRect` cannot express rotation, and `PhotoView` is constructed without `enableRotation`, so this is not reachable today.
