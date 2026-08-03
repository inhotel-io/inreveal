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

  // `LiveTextPlatformView` is implicitly @MainActor because it conforms to
  // `ImageAnalysisInteractionDelegate`. Pigeon delivers host-API calls on the
  // platform thread, which is the main thread, so asserting that isolation is
  // safe and keeps these methods matching the generated protocol's signatures.
  func setContentsRect(viewId: Int64, left: Double, top: Double, width: Double, height: Double) throws {
    guard #available(iOS 16.0, *) else { return }
    MainActor.assumeIsolated {
      registry.view(viewId)?.setContentsRect(CGRect(x: left, y: top, width: width, height: height))
    }
  }

  func loadImage(viewId: Int64, url: String) throws {
    guard #available(iOS 16.0, *) else { return }
    MainActor.assumeIsolated {
      registry.view(viewId)?.loadImage(url: url)
    }
  }

  func dispose(viewId: Int64) throws {
    if #available(iOS 16.0, *) {
      MainActor.assumeIsolated {
        registry.view(viewId)?.reset()
      }
    }
    registry.remove(viewId: viewId)
  }
}
