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
