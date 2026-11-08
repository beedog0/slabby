import ExpoModulesCore
import UIKit
import Vision

/// On-device text recognition for slab labels (Apple Vision, no network).
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

      let request = VNRecognizeTextRequest { request, error in
        if let error = error {
          promise.reject("E_RECOGNIZE", error.localizedDescription)
          return
        }
        let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
        let lines: [[String: Any]] = observations.compactMap { obs in
          guard let text = obs.topCandidates(1).first?.string else { return nil }
          // Vision's boxes are normalized with the origin at the bottom-left.
          let box = obs.boundingBox
          return ["text": text, "x": Double(box.minX), "y": Double(1 - box.midY)]
        }
        let sorted = lines.sorted { a, b in
          let ay = a["y"] as! Double, by = b["y"] as! Double
          if abs(ay - by) > 0.015 { return ay < by }
          return (a["x"] as! Double) < (b["x"] as! Double)
        }
        promise.resolve(sorted)
      }
      request.recognitionLevel = .accurate
      // Labels are codes and names, not prose: autocorrect would "fix" SV2a or ex.
      request.usesLanguageCorrection = false
      request.recognitionLanguages = ["en-US"]
      if let h = options?["minTextHeight"] as? Double, h > 0 {
        request.minimumTextHeight = Float(h)
      }

      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: Self.orientation(image.imageOrientation))
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try handler.perform([request])
        } catch {
          promise.reject("E_RECOGNIZE", error.localizedDescription)
        }
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
