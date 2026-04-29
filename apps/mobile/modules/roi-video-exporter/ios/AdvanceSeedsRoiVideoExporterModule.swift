import AVFoundation
import ExpoModulesCore
import UIKit

public final class AdvanceSeedsRoiVideoExporterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AdvanceSeedsRoiVideoExporter")

    AsyncFunction("exportWithRoiAsync") { (inputUri: String, roi: [String: Any]) async throws -> String in
      let inputURL = try fileURL(from: inputUri)
      let outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("advance-seeds-roi-\(UUID().uuidString)")
        .appendingPathExtension("mp4")

      try await RoiVideoExporter.export(inputURL: inputURL, outputURL: outputURL, roi: roi)
      return outputURL.absoluteString
    }
  }
}

private func fileURL(from uri: String) throws -> URL {
  if let url = URL(string: uri), url.isFileURL {
    return url
  }
  if uri.hasPrefix("/") {
    return URL(fileURLWithPath: uri)
  }
  throw NSError(
    domain: "AdvanceSeedsRoiVideoExporter",
    code: 1,
    userInfo: [NSLocalizedDescriptionKey: "Expected a local file URI"]
  )
}

private final class OverlayCache: @unchecked Sendable {
  private let roi: [String: Any]
  private let lock = NSLock()
  private var cachedSize: CGSize = .zero
  private var cachedImage: CIImage?

  init(roi: [String: Any]) {
    self.roi = roi
  }

  func image(size: CGSize) -> CIImage {
    lock.lock()
    defer { lock.unlock() }

    if cachedSize == size, let cachedImage {
      return cachedImage
    }

    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false

    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let image = renderer.image { rendererContext in
      RoiVideoExporter.drawRoi(roi, in: rendererContext.cgContext, size: size)
    }

    let ciImage = CIImage(cgImage: image.cgImage!)
    cachedSize = size
    cachedImage = ciImage
    return ciImage
  }
}

private enum RoiVideoExporter {
  static func export(inputURL: URL, outputURL: URL, roi: [String: Any]) async throws {
    let asset = AVAsset(url: inputURL)
    let videoTracks = try await asset.loadTracks(withMediaType: .video)
    guard videoTracks.first != nil else {
      throw NSError(
        domain: "AdvanceSeedsRoiVideoExporter",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "No video track found"]
      )
    }

    let overlayCache = OverlayCache(roi: roi)
    let videoComposition = AVMutableVideoComposition(asset: asset) { request in
      let sourceImage = request.sourceImage
      let overlayImage = overlayCache.image(size: sourceImage.extent.size)
        .transformed(by: CGAffineTransform(translationX: sourceImage.extent.origin.x, y: sourceImage.extent.origin.y))

      request.finish(with: overlayImage.composited(over: sourceImage), context: nil)
    }

    if FileManager.default.fileExists(atPath: outputURL.path) {
      try FileManager.default.removeItem(at: outputURL)
    }

    guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality) else {
      throw NSError(
        domain: "AdvanceSeedsRoiVideoExporter",
        code: 4,
        userInfo: [NSLocalizedDescriptionKey: "Unable to create export session"]
      )
    }

    exportSession.outputURL = outputURL
    exportSession.outputFileType = .mp4
    exportSession.videoComposition = videoComposition
    exportSession.shouldOptimizeForNetworkUse = true

    try await export(exportSession)
  }

  private static func export(_ session: AVAssetExportSession) async throws {
    try await withCheckedThrowingContinuation { continuation in
      session.exportAsynchronously {
        switch session.status {
        case .completed:
          continuation.resume()
        case .failed, .cancelled:
          continuation.resume(throwing: session.error ?? NSError(
            domain: "AdvanceSeedsRoiVideoExporter",
            code: 5,
            userInfo: [NSLocalizedDescriptionKey: "Video export failed"]
          ))
        default:
          continuation.resume(throwing: NSError(
            domain: "AdvanceSeedsRoiVideoExporter",
            code: 6,
            userInfo: [NSLocalizedDescriptionKey: "Video export ended unexpectedly"]
          ))
        }
      }
    }
  }

  fileprivate static func drawRoi(_ roi: [String: Any], in context: CGContext, size: CGSize) {
    let path = UIBezierPath()
    let kind = roi["kind"] as? String

    switch kind {
    case "rect":
      let x = number(roi["x"]) * size.width
      let y = number(roi["y"]) * size.height
      let w = number(roi["w"]) * size.width
      let h = number(roi["h"]) * size.height
      path.append(UIBezierPath(rect: CGRect(x: x, y: y, width: w, height: h)))
    case "circle":
      let r = number(roi["r"]) * min(size.width, size.height)
      let cx = number(roi["cx"]) * size.width
      let cy = number(roi["cy"]) * size.height
      path.append(UIBezierPath(ovalIn: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)))
    case "polygon":
      if let points = roi["points"] as? [[String: Any]], let first = points.first {
        path.move(to: point(first, size: size))
        for p in points.dropFirst() {
          path.addLine(to: point(p, size: size))
        }
        if (roi["closed"] as? Bool) == true {
          path.close()
        }
      }
    default:
      break
    }

    context.saveGState()
    context.addPath(path.cgPath)
    context.setFillColor(UIColor(red: 0.365, green: 0.792, blue: 0.647, alpha: 0.18).cgColor)
    context.setStrokeColor(UIColor(red: 0.365, green: 0.792, blue: 0.647, alpha: 1).cgColor)
    context.setLineWidth(max(6, min(size.width, size.height) * 0.006))
    context.setLineJoin(.round)
    context.setLineCap(.round)
    context.drawPath(using: .fillStroke)
    context.restoreGState()
  }

  private static func point(_ value: [String: Any], size: CGSize) -> CGPoint {
    CGPoint(x: number(value["x"]) * size.width, y: number(value["y"]) * size.height)
  }

  private static func number(_ value: Any?) -> CGFloat {
    if let value = value as? NSNumber {
      return CGFloat(truncating: value)
    }
    if let value = value as? Double {
      return CGFloat(value)
    }
    return 0
  }
}
