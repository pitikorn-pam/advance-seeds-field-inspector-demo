import ExpoModulesCore
import CoreML
import CoreImage
import ImageIO
import UIKit

/// iOS Core ML inference runner for the Advance Seeds demo.
///
/// Designed around the Ultralytics YOLO Core ML export shape:
///   • Input  — `Image (Color 640 × 640)` (model owns image scaling)
///   • Output — primary `MultiArray (Float32 1 × 300 × 6)` with NMS baked in
///
/// JS calls `runOnImageURL(assetName, fileUri)` for single-shot photo
/// capture. Native loads the JPEG via ImageIO, hands a CGImage to Core ML
/// (which handles resize + colorspace + normalization), runs the prediction,
/// and returns the largest output multiArray flattened to a `[Double]`
/// alongside its shape. The JS side reconstructs a `Float32Array` and reuses
/// the existing `decodeYoloNms` helper.
public final class AdvanceSeedsCoreMLRunnerModule: Module {
  private var loaded: [String: MLModel] = [:]

  public func definition() -> ModuleDefinition {
    Name("AdvanceSeedsCoreMLRunner")

    AsyncFunction("loadModel") { (assetName: String) async throws -> [String: Any] in
      let model = try self.loadFromBundle(assetName: assetName)
      self.loaded[assetName] = model
      return self.describe(model: model)
    }

    AsyncFunction("runOnImageURL") {
      (assetName: String, fileUri: String) async throws -> [String: Any] in
      let model = try self.modelFor(assetName: assetName)
      let url = try Self.fileURL(from: fileUri)
      guard let cgImage = Self.loadCGImage(at: url) else {
        throw NSError(
          domain: "AdvanceSeedsCoreMLRunner",
          code: 4,
          userInfo: [NSLocalizedDescriptionKey: "Failed to decode JPEG at \(url.path)"]
        )
      }
      let inputName = model.modelDescription.inputDescriptionsByName.keys.first ?? "image"
      guard let imageConstraint =
              model.modelDescription.inputDescriptionsByName[inputName]?.imageConstraint
      else {
        throw NSError(
          domain: "AdvanceSeedsCoreMLRunner",
          code: 6,
          userInfo: [NSLocalizedDescriptionKey: "Model input \(inputName) is not an image"]
        )
      }
      let feature = try MLFeatureValue(
        cgImage: cgImage,
        constraint: imageConstraint,
        options: nil
      )
      let provider = try MLDictionaryFeatureProvider(dictionary: [inputName: feature])
      let result = try model.prediction(from: provider)
      return try Self.flattenLargestOutput(result)
    }
  }

  private func modelFor(assetName: String) throws -> MLModel {
    if let model = loaded[assetName] { return model }
    let model = try loadFromBundle(assetName: assetName)
    loaded[assetName] = model
    return model
  }

  private func loadFromBundle(assetName: String) throws -> MLModel {
    guard let url = Bundle.main.url(forResource: assetName, withExtension: "mlmodelc") else {
      throw NSError(
        domain: "AdvanceSeedsCoreMLRunner",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Compiled model \(assetName).mlmodelc missing from app bundle"]
      )
    }
    let config = MLModelConfiguration()
    config.computeUnits = .all
    return try MLModel(contentsOf: url, configuration: config)
  }

  private func describe(model: MLModel) -> [String: Any] {
    let inputs: [[String: Any]] = model.modelDescription.inputDescriptionsByName.map { (name, desc) in
      var entry: [String: Any] = ["name": name, "type": typeLabel(desc)]
      if let mc = desc.multiArrayConstraint {
        entry["shape"] = mc.shape.map { $0.intValue }
      } else if let ic = desc.imageConstraint {
        entry["shape"] = [Int(ic.pixelsHigh), Int(ic.pixelsWide)]
      }
      return entry
    }
    let outputs: [[String: Any]] = model.modelDescription.outputDescriptionsByName.map { (name, desc) in
      var entry: [String: Any] = ["name": name, "type": typeLabel(desc)]
      if let mc = desc.multiArrayConstraint {
        entry["shape"] = mc.shape.map { $0.intValue }
      }
      return entry
    }
    return ["inputs": inputs, "outputs": outputs]
  }

  private func typeLabel(_ desc: MLFeatureDescription) -> String {
    switch desc.type {
    case .image: return "image"
    case .multiArray: return "multiArray"
    case .double: return "double"
    case .int64: return "int64"
    case .string: return "string"
    case .dictionary: return "dictionary"
    case .sequence: return "sequence"
    default: return "unknown"
    }
  }

  private static func fileURL(from uri: String) throws -> URL {
    if let url = URL(string: uri), url.isFileURL { return url }
    if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
    if uri.hasPrefix("file://") {
      return URL(fileURLWithPath: String(uri.dropFirst("file://".count)))
    }
    throw NSError(
      domain: "AdvanceSeedsCoreMLRunner",
      code: 5,
      userInfo: [NSLocalizedDescriptionKey: "Expected a local file URI, got \(uri)"]
    )
  }

  private static func loadCGImage(at url: URL) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(src, 0, nil)
  }

  private static func flattenLargestOutput(_ result: MLFeatureProvider) throws -> [String: Any] {
    var bestName = ""
    var bestArray: MLMultiArray?
    var bestCount = -1
    for name in result.featureNames {
      guard let f = result.featureValue(for: name), f.type == .multiArray, let arr = f.multiArrayValue
      else { continue }
      if arr.count > bestCount {
        bestName = name
        bestArray = arr
        bestCount = arr.count
      }
    }
    guard let array = bestArray else {
      throw NSError(
        domain: "AdvanceSeedsCoreMLRunner",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Model produced no MLMultiArray outputs"]
      )
    }
    var values = [Double](repeating: 0, count: array.count)
    switch array.dataType {
    case .float32:
      let p = array.dataPointer.bindMemory(to: Float32.self, capacity: array.count)
      for i in 0..<array.count { values[i] = Double(p[i]) }
    case .float64:
      let p = array.dataPointer.bindMemory(to: Float64.self, capacity: array.count)
      for i in 0..<array.count { values[i] = p[i] }
    case .int32:
      let p = array.dataPointer.bindMemory(to: Int32.self, capacity: array.count)
      for i in 0..<array.count { values[i] = Double(p[i]) }
    case .float16:
      // MLMultiArray exposes float16 only on iOS 16+ via a specialized API.
      // For our YOLO export the storage precision is float16 internally but
      // outputs project to float32, so this branch is rarely hit. Cast via
      // double-bridged multiArray as a safe fallback.
      for i in 0..<array.count {
        values[i] = Double(truncating: array[i])
      }
    @unknown default:
      for i in 0..<array.count {
        values[i] = Double(truncating: array[i])
      }
    }
    return [
      "outputName": bestName,
      "shape": array.shape.map { $0.intValue },
      "values": values,
    ]
  }
}
