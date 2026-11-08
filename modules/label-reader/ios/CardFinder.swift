import CoreGraphics
import CoreImage
import Foundation
import Vision

/// The Vision work behind the scan screen, free of UIKit and Expo so the backtest
/// (scripts/backtest/scan-cli.swift) runs exactly this code on a Mac.
///
/// - `lines`: text recognition, one entry per line ({ text, x, y }, 0..1 from the top-left).
/// - `card`: finds the card in a photo (rectangle detection, card-shaped only), straightens it
///   (perspective correction) and returns its pixels at a fixed size. The app turns those into an
///   art fingerprint (supabase/functions/_shared/art-hash.ts) and looks it up in the catalog.
public enum CardFinder {
  /// Card face size handed back; the fingerprint code brings any size to 100 × 140.
  public static let outW = 200
  public static let outH = 280
  /// 63 × 88 mm.
  static let cardRatio: CGFloat = 63.0 / 88.0
  /// One Core Image context for every frame (making one is the slow part).
  static let context = CIContext(options: [.useSoftwareRenderer: false])

  // MARK: Text

  public static func lines(_ cgImage: CGImage, orientation: CGImagePropertyOrientation, minTextHeight: Double?) throws -> [[String: Any]] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    // Labels are codes and names, not prose: autocorrect would "fix" SV2a or ex.
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US"]
    if let h = minTextHeight, h > 0 { request.minimumTextHeight = Float(h) }
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation)
    try handler.perform([request])
    let observations = request.results ?? []
    let lines: [[String: Any]] = observations.compactMap { obs in
      guard let text = obs.topCandidates(1).first?.string else { return nil }
      // Vision's boxes are normalized with the origin at the bottom-left.
      let box = obs.boundingBox
      return ["text": text, "x": Double(box.minX), "y": Double(1 - box.midY)]
    }
    return lines.sorted { a, b in
      let ay = a["y"] as! Double, by = b["y"] as! Double
      if abs(ay - by) > 0.015 { return ay < by }
      return (a["x"] as! Double) < (b["x"] as! Double)
    }
  }

  // MARK: Card

  /// Corners in the upright image, 0..1 from the top-left.
  public struct Quad {
    public var tl: CGPoint, tr: CGPoint, br: CGPoint, bl: CGPoint
  }

  public struct Found {
    /// Card face pixels, RGB, outW × outH, top row first.
    public var rgb: Data
    /// True when a card-shaped rectangle was found; false means the fallback region was used.
    public var found: Bool
    public var quad: Quad
  }

  /// Find, straighten and sample the card. `region` (0..1, top-left origin) limits the search to
  /// the on-screen frame in live scan; when no card-shaped edge is found, that region (or the
  /// middle of the photo) is used as is.
  public static func card(_ cgImage: CGImage, orientation: CGImagePropertyOrientation, region: CGRect?) -> Found? {
    let upright = CIImage(cgImage: cgImage).oriented(orientation)
    let ext = upright.extent
    let W = ext.width, H = ext.height
    // Top-left 0..1 → Core Image pixels (bottom-left origin).
    func ci(_ p: CGPoint) -> CGPoint { CGPoint(x: ext.minX + p.x * W, y: ext.minY + (1 - p.y) * H) }

    var quad: Quad? = nil
    let request = VNDetectRectanglesRequest()
    request.minimumAspectRatio = 0.55
    request.maximumAspectRatio = 0.9
    request.minimumSize = 0.2
    request.maximumObservations = 12
    request.minimumConfidence = 0.4
    request.quadratureTolerance = 20
    if let r = region {
      // Vision's region of interest is bottom-left based; pad it a little so an edge on the frame line still counts.
      let pad: CGFloat = 0.06
      let x0 = max(0, r.minX - pad), x1 = min(1, r.maxX + pad)
      let y0 = max(0, r.minY - pad), y1 = min(1, r.maxY + pad)
      request.regionOfInterest = CGRect(x: x0, y: 1 - y1, width: x1 - x0, height: y1 - y0)
    }
    let handler = VNImageRequestHandler(ciImage: upright, options: [:])
    if (try? handler.perform([request])) != nil {
      var best: (score: CGFloat, area: CGFloat, quad: Quad)? = nil
      for obs in request.results ?? [] {
        // Observation points are normalized to the whole image, bottom-left origin.
        let flip = { (p: CGPoint) in CGPoint(x: p.x, y: 1 - p.y) }
        var q = Quad(tl: flip(obs.topLeft), tr: flip(obs.topRight), br: flip(obs.bottomRight), bl: flip(obs.bottomLeft))
        let px = { (p: CGPoint) in CGPoint(x: p.x * W, y: p.y * H) }
        let d = { (a: CGPoint, b: CGPoint) -> CGFloat in hypot(px(a).x - px(b).x, px(a).y - px(b).y) }
        let w = (d(q.tl, q.tr) + d(q.bl, q.br)) / 2
        let h = (d(q.tl, q.bl) + d(q.tr, q.br)) / 2
        guard w > 0, h > 0 else { continue }
        // A card held sideways: turn it so its long side runs top to bottom (the left edge becomes the top).
        if w > h { q = Quad(tl: q.bl, tr: q.tl, br: q.tr, bl: q.br) }
        let ratio = min(w, h) / max(w, h)
        let score = abs(ratio - cardRatio)
        // A toploader (3 × 4 in) or a slab is boxier or taller than a card: only near-card shapes.
        guard score < 0.05 else { continue }
        let area = w * h
        // The most card-like shape; between two nearly as good, the smaller (the card inside its toploader).
        if let b = best {
          if score < b.score - 0.012 || (abs(score - b.score) <= 0.012 && area < b.area) { best = (score, area, q) }
        } else {
          best = (score, area, q)
        }
      }
      quad = best?.quad
    }

    let found = quad != nil
    let q: Quad = quad ?? {
      // No edge: the frame (live) or a card-shaped middle of the photo.
      var r = region ?? CGRect(x: 0, y: 0, width: 1, height: 1)
      let pxW = r.width * W, pxH = r.height * H
      if pxW / pxH > cardRatio {
        let w = pxH * cardRatio / W
        r = CGRect(x: r.midX - w / 2, y: r.minY, width: w, height: r.height)
      } else {
        let h = pxW / cardRatio / H
        r = CGRect(x: r.minX, y: r.midY - h / 2, width: r.width, height: h)
      }
      if region == nil { r = r.insetBy(dx: r.width * 0.075, dy: r.height * 0.075) }
      return Quad(tl: CGPoint(x: r.minX, y: r.minY), tr: CGPoint(x: r.maxX, y: r.minY), br: CGPoint(x: r.maxX, y: r.maxY), bl: CGPoint(x: r.minX, y: r.maxY))
    }()

    guard let filter = CIFilter(name: "CIPerspectiveCorrection") else { return nil }
    filter.setValue(upright, forKey: kCIInputImageKey)
    filter.setValue(CIVector(cgPoint: ci(q.tl)), forKey: "inputTopLeft")
    filter.setValue(CIVector(cgPoint: ci(q.tr)), forKey: "inputTopRight")
    filter.setValue(CIVector(cgPoint: ci(q.br)), forKey: "inputBottomRight")
    filter.setValue(CIVector(cgPoint: ci(q.bl)), forKey: "inputBottomLeft")
    guard let straight = filter.outputImage, straight.extent.width > 4, straight.extent.height > 4 else { return nil }

    guard let face = context.createCGImage(straight, from: straight.extent) else { return nil }
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    var rgba = [UInt8](repeating: 0, count: outW * outH * 4)
    let drawn: Bool = rgba.withUnsafeMutableBytes { (buf: UnsafeMutableRawBufferPointer) -> Bool in
      guard let ctx = CGContext(data: buf.baseAddress, width: outW, height: outH, bitsPerComponent: 8, bytesPerRow: outW * 4, space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
      ctx.interpolationQuality = .high
      ctx.draw(face, in: CGRect(x: 0, y: 0, width: outW, height: outH))
      return true
    }
    guard drawn else { return nil }
    var rgb = Data(count: outW * outH * 3)
    rgb.withUnsafeMutableBytes { (out: UnsafeMutableRawBufferPointer) in
      for i in 0..<(outW * outH) {
        out[i * 3] = rgba[i * 4]
        out[i * 3 + 1] = rgba[i * 4 + 1]
        out[i * 3 + 2] = rgba[i * 4 + 2]
      }
    }
    return Found(rgb: rgb, found: found, quad: q)
  }

  public static func quadJSON(_ q: Quad) -> [[Double]] {
    [q.tl, q.tr, q.br, q.bl].map { [Double($0.x), Double($0.y)] }
  }
}
