import ExpoModulesCore

public final class AdvanceSeedsArucoCalibratorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AdvanceSeedsArucoCalibrator")

    AsyncFunction("detectInImageAsync") { (uri: String, markerSizeMm: Double) async throws -> [String: Any]? in
      let inputURL = try fileURL(from: uri)
      return try AdvanceSeedsArucoDetector.detectInImage(atPath: inputURL.path, markerSizeMm: markerSizeMm)
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
    domain: "AdvanceSeedsArucoCalibrator",
    code: 1,
    userInfo: [NSLocalizedDescriptionKey: "Expected a local file URI"]
  )
}
