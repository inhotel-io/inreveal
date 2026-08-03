# iOS Live Text — Device Test Report

Companion to `2026-08-02-ios-live-text-ocr-overlay.md` (Task 1 gate and Task 9 checklist).

## Environment

|                   |                                                                          |
| ----------------- | ------------------------------------------------------------------------ |
| Date              | 2026-08-03                                                               |
| Device            | iPhone 17 Pro Max (`iPhone18,2`), 440×956 pt @3x                         |
| iOS               | 26.5.2 (23F84)                                                           |
| Build             | Release, branded (`de.opennoodle.gallery`), development-signed           |
| Flutter           | 3.44.8                                                                   |
| Server            | `pierre-gallery.taild637f7.ts.net` (12,284 assets carry server OCR rows) |
| Install transport | CoreDevice over `localNetwork` — no cable required                       |

## Task 1 — GO/NO-GO gate

**Verdict: GO.** Architecture A1 (transparent `UiKitView` over Flutter `PhotoView`) is viable. A2 (native
`UIScrollView` owning zoom) is not needed.

Task 1 was specified as a throwaway spike with a left-half/right-half probe view. Because Task 5 was
already implemented, the spike was collapsed into the real feature: the probes were run against the
shipping overlay, where the axis is _over text_ vs _over blank space_ rather than left vs right half.

| Probe                               | Result | Note                                               |
| ----------------------------------- | ------ | -------------------------------------------------- |
| Pinch-zoom starting off text        | PASS   | Required both fixes in Task 1 addendum below       |
| One-finger pan while zoomed         | PASS   |                                                    |
| Swipe left/right at 1x              | PASS   | Pages to the next asset                            |
| Swipe down                          | PASS   | Dismisses the viewer                               |
| Touch on text is not passed through | PASS   | Selection engages instead of panning               |
| Tap on blank space                  | PASS   | Toggles controls — see defect 6, needed a real fix |

### Task 1 addendum — the plan's stated mechanism is wrong

The plan asserted that the native view returning `nil` from `hitTest` would let pinch/pan/tap "reach
Flutter untouched". **This is false.** Flutter's gesture arena resolves _before_ UIKit hit-testing, so
Swift cannot arbitrate routing at all. Two Dart-side properties do, and both are required:

- `hitTestBehavior: PlatformViewHitTestBehavior.translucent` — the overlay is a Stack sibling _above_
  `PhotoView`; the default `opaque` absorbs the hit so `PhotoView` never enters the hit-test path.
- `gestureRecognizers: {LiveTextGestureRecognizer}` — with none, the native view only receives sequences
  nobody claimed, and the `PageView` claims every horizontal drag. `EagerGestureRecognizer` over-corrects
  and kills pinch/pan/swipe outright.

`LiveTextPassthroughView.hitTest` still matters — it stops VisionKit acting on touches it was handed — but
it cannot decide who receives them.

## Task 9 — device checklist

| #   | Scenario                                 | Result       | Note                                                                                         |
| --- | ---------------------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| 1   | Document photo, toggle OCR on            | PASS         | Needed defect 4 fix; nothing was highlighted until then                                      |
| 2   | Drag from first line to last             | **PASS**     | **The headline fix.** Selection spans multiple lines                                         |
| 3   | Long-press a selection                   | PASS         | Copy / Look Up / Translate callout                                                           |
| 4   | Pinch-zoom while OCR is on               | PASS         | Highlights stay aligned; needed defect 3 fix                                                 |
| 5   | Pan while zoomed                         | PASS         | Highlights track the text                                                                    |
| 6   | Swipe to the next asset with OCR on      | PASS         |                                                                                              |
| 7   | Swipe down to dismiss                    | PASS         |                                                                                              |
| 8   | Tap a phone number / URL                 | PASS         | Data detectors fire; a date offered Add to Calendar / Reminders                              |
| 9   | Toggle OCR off then on                   | NOT VERIFIED |                                                                                              |
| 10  | Photo with no text that the server OCR'd | NOT VERIFIED | Candidate identified: `IMG_0150.JPG` (2010-02-04), one box whose text is `-`                 |
| 11  | Rotate the device with OCR on            | NOT VERIFIED |                                                                                              |
| 12  | Airplane mode, previously-viewed photo   | NOT VERIFIED |                                                                                              |
| 13  | iOS 15 device                            | NOT RUN      | No iOS 15 hardware available                                                                 |
| 14  | Android build unchanged                  | NOT RUN      | Covered indirectly: `LiveTextService` short-circuits on `!CurrentPlatform.isIOS` (unit test) |

Scenarios 9–12 are exercisable on this hardware and remain open. 13 and 14 need other devices.

## Defects found

None of these were reachable by CI: the Swift shell cannot be compiled or executed in this repo's test
infrastructure, and VisionKit cannot run in the Simulator.

| #   | Defect                                                                                                                                                                                                | Fix                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Xcode group given a repo-relative path under the already-`Runner` parent → `ios/Runner/Runner/LiveText`; all five Swift files were silently never compiled                                            | Group path corrected; plan Step 7 script fixed in both occurrences   |
| 2   | Swift strict concurrency: `LiveTextPlatformView` is implicitly `@MainActor` via `ImageAnalysisInteractionDelegate`, called from nonisolated Pigeon impl and factory (4 errors)                        | `MainActor.assumeIsolated` at both entry points                      |
| 3   | `contentsRect` normalised against `viewportSize` but denormalised by VisionKit against the oversized `Positioned.fill` bounds — measured 1.39× vertical stretch, highlights spilling onto the toolbar | `Align(topLeft)` + `SizedBox(viewportSize)` around the platform view |
| 4   | `selectableItemsHighlighted` never set. The plan hides Apple's supplementary button, whose sole job is toggling it, so nothing was visibly detected until a long press                                | Set `true` on analysis, `false` on reset                             |
| 5   | Gesture routing cannot be arbitrated in Swift (see Task 1 addendum)                                                                                                                                   | `translucent` + `LiveTextGestureRecognizer`                          |
| 6   | A hit-testable platform view swallows **every** tap in its bounds                                                                                                                                     | Overlay forwards taps via `onTap` → `toggleControls()`               |

### Defect 3 — measured

Image 3024×4032 fitted to 440×586.6 pt, centred, occupying y=184.7→771.3 pt. Solving the observed
displacement of the lowest highlight (~951 pt) for the view height that produces it gives ≈1326 pt against
a 956 pt viewport — a 1.39× error. The residual 1326 − 747 = 579 pt is the details panel, where
747 = `detailsOffset = (956 + 586.6 − 48) / 2`.

**Asymmetry worth remembering:** `OcrOverlay` maps to absolute pixel offsets and is immune to an oversized
container. `LiveTextOverlay` uses unit coordinates and is not.

### Defect 6 — mechanism

`TapGestureRecognizer` does not accept on touch-up; it waits to win the arena, so it is decided by the
arena _sweep_. `RenderUiKitView` installs `_UiKitViewGestureRecognizer` as a `GestureArenaTeam` captain
that tracks the pointer and never resolves; being deeper it is the first arena member and wins every
sweep. A team member rejecting only removes itself — `_CombiningGestureArenaMember` resolves the entry
rejected only once _all_ members are gone, and the captain never goes.
(`packages/flutter/lib/src/rendering/platform_view.dart:498`.)

Pan, swipe and pinch survive because drag and scale recognizers _actively accept_ once past their slop,
beating the captain. Tap is the only common gesture that resolves passively.

Reproduced locally in `live_text_tap_passthrough_test.dart`, which still fails with the custom recognizer
deleted entirely — proving the recognizer was never the cause.

## Known gaps

- **`tapToNavigate` is not reproduced while Live Text is on.** The setting (tap the left/right quarter to
  page) lives in the asset page's private `onTapNavigate`; reaching it would push the upstream diff past
  the plan's "one import plus one widget name" constraint. Defaults to `false`
  (`viewer_config.dart:11`). **Open product decision.**
- **Pinch starting with both fingers on text** relies on deferred acceptance rather than the explicit
  second-finger concession branch; that branch is not behaviourally covered by tests (see below).
- **Text geometry is the server's, not VisionKit's.** `ImageAnalysis` publishes `transcript` but no
  per-line rects, so the pointer test uses the OCR rows already in the local DB. They describe the same
  text and agree closely, but not exactly — expect occasional disagreement at the edge of a word.

## Test-quality note

The pinch test does **not** cover the explicit second-finger concession branch: removing that branch keeps
it green. What actually preserves pinch is _deferred acceptance_ — never claiming on touch-down. Confirmed
discriminating by swapping in `EagerGestureRecognizer`, which fails it. The test is named for what it
proves; the concession branch remains as a guard but is unverified.

## Build recipe (physical device)

The `mobile-emulator` skill covers the Simulator only. Three separate things block the device path:

1. **Branding must be applied first** — signing needs `de.opennoodle.gallery` and team `77MWNP37MV`:
   `PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:/opt/homebrew/opt/gnu-sed/libexec/gnubin:$PATH" bash branding/scripts/apply-branding.sh`
2. **Release only.** Debug wants `de.opennoodle.gallery{.debug,.debug.Widget,.debug.ShareExtension}` plus a
   `.debug` App Group, none registered, and Xcode has no interactive account — it reports the misleading
   "No Accounts: Add a new account in Accounts settings". `-allowProvisioningUpdates` does not help.
3. **`pod install` first** — the committed `Podfile.lock` lags the locally resolved pod set.

Then, using `-destination` rather than `-sdk` (the same Xcode 26 `StructuredQueriesMacros` trap as the
Simulator):

```bash
cd mobile/ios && xcodebuild -configuration Release -workspace Runner.xcworkspace -scheme Runner \
  BUILD_DIR="$PWD/../build/ios" \
  -destination "platform=iOS,id=<device-udid>" -allowProvisioningUpdates build
xcrun devicectl device install app --device <coredevice-uuid> \
  "mobile/build/ios/Release-iphoneos/Noodle Gallery.app"
```

Revert the branding afterwards; do not commit it. Note that `pod install` re-adds a `[CP] Copy Pods
Resources` phase and branding rewrites `PRODUCT_NAME` in `project.pbxproj` — the only legitimate change to
that file is the LiveText group path.
