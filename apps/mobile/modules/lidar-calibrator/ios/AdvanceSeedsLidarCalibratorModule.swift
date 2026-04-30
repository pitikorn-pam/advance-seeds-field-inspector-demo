import ARKit
import ExpoModulesCore

public final class AdvanceSeedsLidarCalibratorModule: Module {
  private let reader = LidarCalibrationReader()

  public func definition() -> ModuleDefinition {
    Name("AdvanceSeedsLidarCalibrator")

    AsyncFunction("isSupportedAsync") { () -> Bool in
      LidarCalibrationReader.isSupported
    }

    AsyncFunction("startAsync") { () async throws -> Bool in
      try await reader.start()
    }

    AsyncFunction("stopAsync") { () async in
      await reader.stop()
    }

    AsyncFunction("getReadingAsync") { () async -> [String: Any]? in
      await reader.currentReading()
    }
  }
}

private final class LidarCalibrationReader: NSObject, ARSessionDelegate {
  static var isSupported: Bool {
    ARWorldTrackingConfiguration.isSupported &&
      ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
  }

  private let session = ARSession()
  private let stateQueue = DispatchQueue(label: "AdvanceSeedsLidarCalibrator.state")
  private var latestReading: [String: Any]?
  private var running = false

  override init() {
    super.init()
    session.delegate = self
  }

  @MainActor
  func start() async throws -> Bool {
    guard Self.isSupported else {
      await stop()
      return false
    }
    let config = ARWorldTrackingConfiguration()
    config.frameSemantics.insert(.sceneDepth)
    config.worldAlignment = .gravity
    session.run(config, options: [.resetTracking, .removeExistingAnchors])
    stateQueue.sync {
      running = true
      latestReading = nil
    }
    return true
  }

  @MainActor
  func stop() async {
    session.pause()
    stateQueue.sync {
      running = false
      latestReading = nil
    }
  }

  func currentReading() async -> [String: Any]? {
    stateQueue.sync { latestReading }
  }

  nonisolated func session(_ session: ARSession, didUpdate frame: ARFrame) {
    guard let reading = Self.makeReading(from: frame) else { return }
    stateQueue.async { [weak self] in
      guard self?.running == true else { return }
      self?.latestReading = reading
    }
  }

  private static func makeReading(from frame: ARFrame) -> [String: Any]? {
    guard let depthMap = frame.sceneDepth?.depthMap else { return nil }
    let distance = sampleCenterDistanceMeters(depthMap)
    guard distance.count >= 8, distance.mean > 0.05, distance.mean < 2.0 else { return nil }

    let focalLengthPx = Double(frame.camera.intrinsics.columns.0.x)
    guard focalLengthPx > 0 else { return nil }

    let pxPerMm = focalLengthPx / (distance.mean * 1000.0)
    guard pxPerMm.isFinite, pxPerMm > 0 else { return nil }

    let stability = max(0.0, 1.0 - min(distance.stdDev / max(distance.mean, 0.001), 1.0))
    let sampleConfidence = min(Double(distance.count) / 25.0, 1.0)
    let trackingConfidence = confidence(for: frame.camera.trackingState)
    let confidence = max(0.0, min(stability * sampleConfidence * trackingConfidence, 1.0))

    return [
      "pxPerMm": pxPerMm,
      "confidence": confidence,
      "observedAtMs": Date().timeIntervalSince1970 * 1000.0,
      "distanceMeters": distance.mean,
      "focalLengthPx": focalLengthPx,
      "sampleCount": distance.count
    ]
  }

  private static func confidence(for state: ARCamera.TrackingState) -> Double {
    switch state {
    case .normal:
      return 1.0
    case .limited:
      return 0.55
    case .notAvailable:
      return 0.0
    @unknown default:
      return 0.0
    }
  }

  private static func sampleCenterDistanceMeters(_ depthMap: CVPixelBuffer) -> (
    mean: Double,
    stdDev: Double,
    count: Int
  ) {
    CVPixelBufferLockBaseAddress(depthMap, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }

    let width = CVPixelBufferGetWidth(depthMap)
    let height = CVPixelBufferGetHeight(depthMap)
    let bytesPerRow = CVPixelBufferGetBytesPerRow(depthMap)
    guard
      width > 0,
      height > 0,
      let base = CVPixelBufferGetBaseAddress(depthMap)
    else {
      return (0, 0, 0)
    }

    let radius = 3
    let centerX = width / 2
    let centerY = height / 2
    var values: [Double] = []
    values.reserveCapacity((radius * 2 + 1) * (radius * 2 + 1))

    for y in max(0, centerY - radius)...min(height - 1, centerY + radius) {
      let row = base.advanced(by: y * bytesPerRow).assumingMemoryBound(to: Float32.self)
      for x in max(0, centerX - radius)...min(width - 1, centerX + radius) {
        let value = Double(row[x])
        if value.isFinite, value > 0 {
          values.append(value)
        }
      }
    }

    guard !values.isEmpty else { return (0, 0, 0) }
    let mean = values.reduce(0, +) / Double(values.count)
    let variance = values.reduce(0) { partial, value in
      let delta = value - mean
      return partial + delta * delta
    } / Double(values.count)
    return (mean, sqrt(variance), values.count)
  }
}
