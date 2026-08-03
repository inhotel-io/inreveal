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
          // Mirrors what Apple's own Live Text button does: wash every
          // recognised region so the user can see what was detected without
          // having to select it first. We hide that button
          // (`isSupplementaryInterfaceHidden`) because Flutter draws the OCR
          // toggle, so this state has to be driven from here instead — merely
          // mounting the overlay means the user already asked for it.
          self.interaction.selectableItemsHighlighted = true
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
    interaction.selectableItemsHighlighted = false
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

  /// Flutter's gesture arena resolves before UIKit hit-testing, so Dart decides
  /// which pointers reach us and needs to know when a selection exists: its
  /// drag handles and callout live outside the text quads Dart matches against.
  func textSelectionDidChange(_ interaction: ImageAnalysisInteraction) {
    flutterApi.onSelectionActiveChanged(viewId: viewId, active: interaction.hasActiveTextSelection) { _ in }
  }
}
