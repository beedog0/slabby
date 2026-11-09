import ExpoModulesCore
import UIKit
import Vision

/// On-device text recognition and card finding (Apple Vision, no network). The Vision work
/// itself is in CardFinder.swift, shared with the backtest.
/// recognize(uri) -> [{ text, x, y }], one entry per recognized line, top to bottom.
/// x is the line's left edge and y its vertical centre, both 0..1 from the top-left of the photo.
public class LabelReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LabelReader")

    // The scan screen reads a frame every second or so; drop each photo once it's been read.
    Function("discard") { (uri: String) in
      let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
      if url.isFileURL { try? FileManager.default.removeItem(at: url) }
    }

    // options.minTextHeight: smallest text to read, as a share of the photo's height. Vision's
    // default (1/32) skips a card's set code and number in a photo of the whole card, so Photo
    // mode asks for much smaller text. Leaving it out keeps the default (live scan).
    AsyncFunction("recognize") { (uri: String, options: [String: Any]?, promise: Promise) in
      guard let image = Self.loadImage(uri), let cgImage = image.cgImage else {
        promise.reject("E_IMAGE", "Couldn't open the photo")
        return
      }

      let orientation = Self.orientation(image.imageOrientation)
      let minHeight = options?["minTextHeight"] as? Double
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          promise.resolve(try CardFinder.lines(cgImage, orientation: orientation, minTextHeight: minHeight))
        } catch {
          promise.reject("E_RECOGNIZE", error.localizedDescription)
        }
      }
    }

    // The card in a photo, straightened, as pixels for its art fingerprint (CardFinder.card).
    // options.region: { x, y, width, height } 0..1 from the top-left, the on-screen frame in live
    // scan. Resolves { rgb: base64 RGB, width, height, found, quad: [[x, y] ×4] } or null.
    AsyncFunction("findCard") { (uri: String, options: [String: Any]?, promise: Promise) in
      guard let image = Self.loadImage(uri), let cgImage = image.cgImage else {
        promise.reject("E_IMAGE", "Couldn't open the photo")
        return
      }
      var region: CGRect? = nil
      if let r = options?["region"] as? [String: Any],
         let x = r["x"] as? Double, let y = r["y"] as? Double,
         let w = r["width"] as? Double, let h = r["height"] as? Double, w > 0, h > 0 {
        region = CGRect(x: x, y: y, width: w, height: h)
      }
      let orientation = Self.orientation(image.imageOrientation)
      DispatchQueue.global(qos: .userInitiated).async {
        guard let found = CardFinder.card(cgImage, orientation: orientation, region: region) else {
          promise.resolve(nil)
          return
        }
        promise.resolve([
          "rgb": found.rgb.base64EncodedString(),
          "width": CardFinder.outW,
          "height": CardFinder.outH,
          "found": found.found,
          "quad": CardFinder.quadJSON(found.quad),
        ])
      }
    }
  }

  private static func loadImage(_ uri: String) -> UIImage? {
    let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
    if url.isFileURL { return UIImage(contentsOfFile: url.path) }
    guard let data = try? Data(contentsOf: url) else { return nil }
    return UIImage(data: data)
  }

  private static func orientation(_ o: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch o {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
