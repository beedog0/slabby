// Backtest CLI (macOS): runs the app's own Vision code (modules/label-reader/ios/CardFinder.swift)
// over a folder of photos, so scan accuracy and speed can be measured off the phone.
//
//   swiftc -O modules/label-reader/ios/CardFinder.swift scripts/backtest/main.swift -o /tmp/slabby-scan
//   /tmp/slabby-scan read  <photos dir> > reads.jsonl     # text + card finding, as Photo mode does
//   /tmp/slabby-scan synth <set dir>                       # phone-like photos from catalog images
//
// See scripts/backtest/README.md.

import CoreGraphics
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

// Same knobs as Photo mode (src/services/photoTiles.ts).
let PHOTO_MIN_TEXT = 0.006
let TILE_COLS = 2, TILE_ROWS = 3
let TILE_OVERLAP = 0.3
let TILE_W = 1400

func load(_ path: String) -> (CGImage, CGImagePropertyOrientation)? {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
  let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
  let raw = (props?[kCGImagePropertyOrientation] as? UInt32) ?? 1
  return (img, CGImagePropertyOrientation(rawValue: raw) ?? .up)
}

func upright(_ img: CGImage, _ o: CGImagePropertyOrientation) -> CGImage {
  if o == .up { return img }
  let ci = CIImage(cgImage: img).oriented(o)
  return CIContext().createCGImage(ci, from: ci.extent) ?? img
}

func scaled(_ img: CGImage, width: Int) -> CGImage? {
  let h = Int(Double(img.height) * Double(width) / Double(img.width))
  guard let ctx = CGContext(data: nil, width: width, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
  ctx.interpolationQuality = .high
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: width, height: h))
  return ctx.makeImage()
}

/// Photo mode's closer look: overlapping enlarged pieces, lines placed back on the whole photo.
func tiles(_ img: CGImage) -> [[String: Any]] {
  let W = Double(img.width), H = Double(img.height)
  let tw = W / (Double(TILE_COLS) - Double(TILE_COLS - 1) * TILE_OVERLAP)
  let th = H / (Double(TILE_ROWS) - Double(TILE_ROWS - 1) * TILE_OVERLAP)
  var out: [[String: Any]] = []
  for r in 0..<TILE_ROWS {
    for c in 0..<TILE_COLS {
      let x = (Double(c) * tw * (1 - TILE_OVERLAP)).rounded(), y = (Double(r) * th * (1 - TILE_OVERLAP)).rounded()
      let rect = CGRect(x: x, y: y, width: min(tw.rounded(), W - x), height: min(th.rounded(), H - y))
      guard let piece = img.cropping(to: rect), let big = scaled(piece, width: TILE_W),
            let lines = try? CardFinder.lines(big, orientation: .up, minTextHeight: PHOTO_MIN_TEXT) else { continue }
      for l in lines {
        out.append(["text": l["text"]!, "x": (x + (l["x"] as! Double) * rect.width) / W, "y": (y + (l["y"] as! Double) * rect.height) / H])
      }
    }
  }
  return out
}

func ms(_ t: Date) -> Int { Int(Date().timeIntervalSince(t) * 1000) }

func read(_ dir: String) {
  let files = ((try? FileManager.default.contentsOfDirectory(atPath: dir)) ?? [])
    .filter { ["jpg", "jpeg", "png", "heic", "webp"].contains(($0 as NSString).pathExtension.lowercased()) }
    .sorted()
  for f in files {
    let path = (dir as NSString).appendingPathComponent(f)
    guard let loaded = load(path) else { continue }
    let img = upright(loaded.0, loaded.1)
    var t = Date()
    let lines = (try? CardFinder.lines(img, orientation: .up, minTextHeight: PHOTO_MIN_TEXT)) ?? []
    let ocrMs = ms(t)
    t = Date()
    let card = CardFinder.card(img, orientation: .up, region: nil)
    let cardMs = ms(t)
    t = Date()
    let tileLines = tiles(img)
    let tileMs = ms(t)
    var row: [String: Any] = ["file": f, "lines": lines, "tileLines": tileLines, "ocrMs": ocrMs, "cardMs": cardMs, "tileMs": tileMs]
    if let card = card {
      row["card"] = ["rgb": card.rgb.base64EncodedString(), "width": CardFinder.outW, "height": CardFinder.outH, "found": card.found, "quad": CardFinder.quadJSON(card.quad)]
    }
    if let data = try? JSONSerialization.data(withJSONObject: row), let s = String(data: data, encoding: .utf8) {
      print(s)
      fflush(stdout)
    }
  }
}

// MARK: synth: catalog image → phone-like photos

func writeJPEG(_ img: CGImage, _ path: String) {
  guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { return }
  CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
  CGImageDestinationFinalize(dest)
}

struct Rng {
  var s: UInt64
  mutating func next() -> Double {
    s = s &* 6364136223846793005 &+ 1442695040888963407
    return Double((s >> 11) & ((1 << 53) - 1)) / Double(1 << 53)
  }
  mutating func range(_ a: Double, _ b: Double) -> Double { a + (b - a) * next() }
}

/// One catalog image as if photographed: on a table or in a hand-coloured background, smaller in
/// the frame, tilted in perspective, a bit blurred, warmer or cooler, darker or brighter, with a
/// glare spot and (sometimes) a toploader's clear edge round it. 3024 × 4032 like a phone photo,
/// scaled down to 1512 × 2016 to keep files small.
func synth(card: CGImage, seed: UInt64, sleeve: Bool) -> CGImage? {
  var r = Rng(s: seed &* 2654435761 &+ 1)
  let W: CGFloat = 1512, H: CGFloat = 2016
  let ctx = CIContext()
  let cardCI = CIImage(cgImage: card)
  let cw = cardCI.extent.width, ch = cardCI.extent.height
  // Card size in the photo: 45–80 % of the width.
  let targetW = W * CGFloat(r.range(0.45, 0.8))
  let s = targetW / cw
  let cx = W / 2 + CGFloat(r.range(-0.08, 0.08)) * W, cy = H / 2 + CGFloat(r.range(-0.08, 0.08)) * H
  let hw = cw * s / 2, hh = ch * s / 2
  func jitter() -> CGFloat { CGFloat(r.range(-0.06, 0.06)) * targetW }
  let tilt = CGFloat(r.range(-0.08, 0.08)) * targetW // one side nearer the camera
  let tl = CGPoint(x: cx - hw + jitter() - tilt, y: cy + hh + jitter())
  let tr = CGPoint(x: cx + hw + jitter() + tilt, y: cy + hh + jitter())
  let bl = CGPoint(x: cx - hw + jitter(), y: cy - hh + jitter())
  let br = CGPoint(x: cx + hw + jitter(), y: cy - hh + jitter())
  guard let persp = CIFilter(name: "CIPerspectiveTransform") else { return nil }
  persp.setValue(cardCI, forKey: kCIInputImageKey)
  persp.setValue(CIVector(cgPoint: tl), forKey: "inputTopLeft")
  persp.setValue(CIVector(cgPoint: tr), forKey: "inputTopRight")
  persp.setValue(CIVector(cgPoint: bl), forKey: "inputBottomLeft")
  persp.setValue(CIVector(cgPoint: br), forKey: "inputBottomRight")
  guard var placed = persp.outputImage else { return nil }

  // Background: a flat colour with noise (desk, hand, mat).
  let bg = CIImage(color: CIColor(red: r.range(0.1, 0.8), green: r.range(0.1, 0.7), blue: r.range(0.1, 0.7))).cropped(to: CGRect(x: 0, y: 0, width: W, height: H))
  let noise = CIFilter(name: "CIRandomGenerator")!.outputImage!.cropped(to: bg.extent)
    .applyingFilter("CIColorMatrix", parameters: ["inputRVector": CIVector(x: 0.15, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: 0.15, z: 0, w: 0), "inputBVector": CIVector(x: 0, y: 0, z: 0.15, w: 0), "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1)])
  var base = noise.applyingFilter("CIAdditionCompositing", parameters: [kCIInputBackgroundImageKey: bg])

  if sleeve {
    // A toploader: a lighter, slightly bigger clear rectangle behind the card.
    let pad: CGFloat = targetW * 0.07
    let rect = CGRect(x: cx - hw - pad, y: cy - hh - pad * 1.2, width: hw * 2 + pad * 2, height: hh * 2 + pad * 2.6)
    let clear = CIImage(color: CIColor(red: 1, green: 1, blue: 1, alpha: 0.18)).cropped(to: rect)
    base = clear.composited(over: base)
  }
  placed = placed.composited(over: base)

  // Glare: a soft white spot somewhere on the card.
  let glare = CIFilter(name: "CIRadialGradient", parameters: [
    "inputCenter": CIVector(x: cx + CGFloat(r.range(-0.4, 0.4)) * hw * 2, y: cy + CGFloat(r.range(-0.4, 0.4)) * hh * 2),
    "inputRadius0": 0, "inputRadius1": targetW * CGFloat(r.range(0.1, 0.35)),
    "inputColor0": CIColor(red: 1, green: 1, blue: 1, alpha: r.range(0.15, 0.55)), "inputColor1": CIColor(red: 1, green: 1, blue: 1, alpha: 0),
  ])!.outputImage!.cropped(to: bg.extent)
  var photo = glare.composited(over: placed)

  // Camera: exposure, white balance, slight blur, sensor noise.
  photo = photo
    .applyingFilter("CIColorControls", parameters: ["inputBrightness": r.range(-0.12, 0.08), "inputContrast": r.range(0.85, 1.1), "inputSaturation": r.range(0.85, 1.15)])
    .applyingFilter("CITemperatureAndTint", parameters: ["inputNeutral": CIVector(x: r.range(4500, 8000), y: 0), "inputTargetNeutral": CIVector(x: 6500, y: 0)])
    .applyingFilter("CIGaussianBlur", parameters: ["inputRadius": r.range(0, 2.2)])
    .cropped(to: bg.extent)
  return ctx.createCGImage(photo, from: bg.extent)
}

/// synth <set dir>: every catalog/<id>.jpg → synth/<id>-<n>.jpg (3 variants each, one in a toploader).
func synthAll(_ dir: String) {
  let catDir = (dir as NSString).appendingPathComponent("catalog")
  let outDir = (dir as NSString).appendingPathComponent("synth")
  try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
  let files = ((try? FileManager.default.contentsOfDirectory(atPath: catDir)) ?? []).filter { $0.hasSuffix(".jpg") }.sorted()
  var n = 0
  for f in files {
    guard let loaded = load((catDir as NSString).appendingPathComponent(f)) else { continue }
    let img = loaded.0
    let id = (f as NSString).deletingPathExtension
    for v in 0..<3 {
      if let out = synth(card: img, seed: UInt64((Int(id) ?? 0) * 10 + v), sleeve: v == 2) {
        writeJPEG(out, (outDir as NSString).appendingPathComponent("\(id)-\(v).jpg"))
        n += 1
      }
    }
  }
  FileHandle.standardError.write("synth: \(n) photos in \(outDir)\n".data(using: .utf8)!)
}

let args = CommandLine.arguments
switch args.count >= 3 ? args[1] : "" {
case "read": read(args[2])
case "synth": synthAll(args[2])
default:
  FileHandle.standardError.write("usage: slabby-scan read <photos dir> | synth <set dir>\n".data(using: .utf8)!)
  exit(2)
}
