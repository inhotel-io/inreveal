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
