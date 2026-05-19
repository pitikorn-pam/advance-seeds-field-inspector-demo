import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { toByteArray } from "base64-js";
import jpeg from "jpeg-js";
import { loadTensorflowModel, type TfliteModel } from "react-native-fast-tflite";
import CoreMLRunner from "@advance-seeds/coreml-runner";
import type {
  AnalysisFrameResult,
  AnalysisResult,
  AnalyzeOptions,
  Frame,
  ImageRef,
  SeedAnalyzer,
} from "@advance-seeds/types";
import type { PixelImage } from "./ClassicalSeedAnalyzerCore";
import {
  YOLO_INPUT_SIZE,
  attachSegmentationPolygons,
  decodeYolo,
  decodeYoloNms,
  decodeYoloSegmentationNms,
  mapDetectionsToSeeds,
  nonMaxSuppression,
  summarizeSeeds,
} from "./yolo";
import type { RawDetection } from "./yolo";
import { ensureHyperParamsLoaded, getHyperParamsSync } from "./hyperparams";
import { recordInference } from "./inferenceStats";
import { prepareYoloInput, resolvePreprocessProfile } from "./preprocess";
import type { InstalledModelRecord } from "@/lib/models/types";
import { mapClassFilterForModel } from "@/lib/models/compatibility";
import { quickVerifyArtifact, readActiveModel } from "@/lib/models/modelStore";

// "raw" head emits [1, 4+numClasses, anchors] (YOLO 8/11), "nms" head emits
// [1, maxDet, 6] with NMS already baked in (YOLO 26 default export).
export type TfliteOutputKind = "raw" | "nms" | "segmentation";

/** Which delegate the loaded TFLite graph is actually running under. We
 *  surface this so the inference-time histogram in the hyperparams playground
 *  can label timing samples with a `tflite-nnapi` / `tflite-android-gpu` /
 *  `tflite-cpu` source. */
export type TfliteDelegate = "nnapi" | "android-gpu" | "cpu";

export interface LoadedTfliteModel {
  model: TfliteModel;
  outputKind: TfliteOutputKind;
  outputIndex: number;
  /** Cached output tensor shape — Nitro hybrid getters can lose their
   *  native state across fast-refresh, so reading `model.outputs` repeatedly
   *  is unsafe. Capture once at load time and reuse. */
  outputShape: readonly [number, number, number];
  /**
   * Mask prototype tensor index, when the model emits one (segmentation
   * head). Used by `attachSegmentationPolygons` to reconstruct per-instance
   * masks. -1 when the model is detection-only.
   */
  protoIndex: number;
  /** Cached prototype shape, snapshot for the same reason as `outputShape`. */
  protoShape: readonly number[] | null;
  delegate: TfliteDelegate;
  sourceKey: string;
  modelRecord: InstalledModelRecord | null;
}

// Persist across fast-refresh: Metro HMR re-evaluates this module on every
// JS reload, which would otherwise reset our singleton and create a new
// TfliteModel — old instances captured by stale `useFrameProcessor`
// closures then crash with "this does not have a NativeState!" when the
// worklet runtime walks them. Stashing on globalThis lets the next module
// evaluation re-use the live hybrid object.
const GLOBAL_KEY = "__advanceSeedsTfliteModelPromise";
type GlobalModelSlot = { key: string; promise: Promise<LoadedTfliteModel> };
type GlobalSlot = { [GLOBAL_KEY]?: GlobalModelSlot | null };
const globalSlot = globalThis as unknown as GlobalSlot;
type TfliteTensorInfo = TfliteModel["outputs"][number];

function selectDetectionOutput(outputs: readonly TfliteTensorInfo[]): {
  index: number;
  shape: readonly number[];
} {
  for (let index = 0; index < outputs.length; index++) {
    const shape = outputs[index]?.shape ?? [];
    if (shape.length !== 3) continue;
    const [batch, rows, fields] = shape;
    if (batch === 1 && rows === 300 && (fields === 6 || fields >= 38)) {
      return { index, shape };
    }
  }
  const firstRank3 = outputs.findIndex((output) => (output.shape ?? []).length === 3);
  if (firstRank3 >= 0) {
    return { index: firstRank3, shape: outputs[firstRank3].shape };
  }
  throw new Error(
    `Unsupported TFLite output shapes ${outputs.map((output) => output.shape.join("x")).join(",")}`,
  );
}

/**
 * Locate the segmentation-head mask prototype tensor among the model's
 * outputs. Standard YOLO seg models emit a rank-4 tensor of roughly
 * `[1, 160, 160, 32]` (NHWC) — the largest non-detection output. We skip
 * the index already taken by the detection head and pick the first rank-4
 * tensor we find. Returns null when no candidate matches (detection-only
 * model, or unexpected export layout).
 */
function selectPrototypeOutput(
  outputs: readonly TfliteTensorInfo[],
  detectionIndex: number,
): { index: number; shape: readonly number[] } | null {
  for (let index = 0; index < outputs.length; index++) {
    if (index === detectionIndex) continue;
    const shape = outputs[index]?.shape ?? [];
    if (shape.length === 4 && shape[0] === 1) {
      return { index, shape };
    }
  }
  return null;
}

// Singleton loader — TfliteSeedAnalyzer (single-shot) and useLiveDetections
// (worklet) share one TfliteModel instance instead of paying ~5 MB twice.
export function loadSharedTfliteModel(): Promise<LoadedTfliteModel> {
  const activePromise = getActiveTfliteSource();
  return activePromise.then((source) => {
    const current = globalSlot[GLOBAL_KEY] ?? null;
    if (current?.key === source.key) return current.promise;
    const modelPromise = (async () => {
      // Android live camera stability beats peak benchmark speed here. On the
      // Z Flip 7 FE, NNAPI inference coincides with Camera2
      // FrameProcessorBase timeouts while the camera HAL is also running its
      // own Samsung AI/ISP path. Keep Android TFLite on CPU so live inference
      // does not compete with the camera pipeline's NPU/GPU resources.
      let model: TfliteModel | null = null;
      let activeDelegate: TfliteDelegate = "cpu";
      if (Platform.OS === "android") {
        model = await loadTensorflowModel(source.source, []);
        activeDelegate = "cpu";
        console.info("[analyzer] tflite delegate=cpu");
      }
      if (!model) {
        model = await loadTensorflowModel(source.source, []);
        activeDelegate = "cpu";
        if (Platform.OS === "android") console.info("[analyzer] tflite delegate=cpu");
      }
      const inputs = model.inputs;
      const outputs = model.outputs;
      if (inputs.length !== 1 || outputs.length < 1) {
        throw new Error(`Unexpected tensor signature: in=${inputs.length} out=${outputs.length}`);
      }
      const inShape = inputs[0].shape;
      if (
        inShape.length !== 4 ||
        inShape[1] !== YOLO_INPUT_SIZE ||
        inShape[2] !== YOLO_INPUT_SIZE
      ) {
        throw new Error(`Unsupported input shape ${inShape.join("x")}; expected 1x640x640x3`);
      }
      const selectedOutput = selectDetectionOutput(outputs);
      const outShape = selectedOutput.shape;
      if (outShape.length !== 3) {
        throw new Error(`Unsupported output rank ${outShape.length}; expected rank-3 tensor`);
      }
      const outputKind: TfliteOutputKind =
        outShape[2] === 6 ? "nms" : outShape[2] > 6 ? "segmentation" : "raw";
      // For segmentation models, also locate the mask prototype tensor so
      // the post-decode polygon pass has something to multiply the
      // detection-row mask coefficients against.
      const protoOutput =
        outputKind === "segmentation" ? selectPrototypeOutput(outputs, selectedOutput.index) : null;
      console.info(
        `[analyzer] tflite output kind=${outputKind} shape=${outShape.join("x")}` +
          (protoOutput ? ` proto=${protoOutput.shape.join("x")}` : ""),
      );
      // Snapshot the shape into a plain tuple so we never read it back off
      // the hybrid object — accessing `model.outputs[].shape` after a
      // fast-refresh throws "this does not have a NativeState".
      const outputShape: readonly [number, number, number] = [
        outShape[0],
        outShape[1],
        outShape[2],
      ];
      const protoShape = protoOutput ? Array.from(protoOutput.shape) : null;
      return {
        model,
        outputKind,
        outputIndex: selectedOutput.index,
        outputShape,
        protoIndex: protoOutput ? protoOutput.index : -1,
        protoShape,
        delegate: activeDelegate,
        sourceKey: source.key,
        modelRecord: source.record,
      };
    })().catch((err) => {
      // Reset both the local closure and the global slot so next call retries.
      globalSlot[GLOBAL_KEY] = null;
      throw err;
    });
    globalSlot[GLOBAL_KEY] = { key: source.key, promise: modelPromise };
    return modelPromise;
  });
}

export function resetSharedTfliteModel(): void {
  globalSlot[GLOBAL_KEY] = null;
}

async function getActiveTfliteSource(): Promise<{
  key: string;
  source: { url: string };
  record: InstalledModelRecord | null;
}> {
  const active = await readActiveModel();
  if (active?.platform === "android" && (await quickVerifyArtifact(active))) {
    return {
      key: `installed:${active.id}:${active.artifactSha256}`,
      source: { url: active.artifactUri },
      record: active,
    };
  }
  throw new Error("No installed active Android model is available.");
}

export class TfliteSeedAnalyzer implements SeedAnalyzer {
  readonly id = "tflite-yolo";

  private constructor() {}

  static async load(): Promise<TfliteSeedAnalyzer> {
    await loadSharedTfliteModel();
    return new TfliteSeedAnalyzer();
  }

  async analyze(image: ImageRef, options: AnalyzeOptions): Promise<AnalysisResult> {
    const startedAt = Date.now();
    await ensureHyperParamsLoaded();
    const hp = getHyperParamsSync();
    const {
      model,
      outputKind,
      outputIndex,
      outputShape,
      protoIndex,
      protoShape,
      delegate,
      modelRecord,
    } = await loadSharedTfliteModel();
    const decodeStartedAt = Date.now();
    const pixels = await decodeImage(image);
    const decodeMs = Date.now() - decodeStartedAt;

    const preprocessProfile = resolvePreprocessProfile(
      hp.preprocessProfile,
      modelRecord?.metadata ?? null,
    );
    const lbStartedAt = Date.now();
    const lb = prepareYoloInput(pixels, {
      target: YOLO_INPUT_SIZE,
      profile: preprocessProfile,
    });
    const lbMs = Date.now() - lbStartedAt;

    const inferStartedAt = Date.now();
    const outputs = model.runSync([lb.tensor.buffer as ArrayBuffer]);
    const inferMs = Date.now() - inferStartedAt;
    recordInference(`tflite-${delegate}`, inferMs);
    const selectedOutput = outputs[outputIndex];
    if (!selectedOutput) {
      throw new Error(`Missing selected TFLite output index ${outputIndex}`);
    }
    const out = new Float32Array(selectedOutput);
    const decodeOpts = {
      letterbox: lb,
      scoreThreshold: hp.scoreThreshold,
      classFilter: mapClassFilterForModel(
        options.classFilter,
        modelRecord?.metadata,
        options.varietyNames ?? null,
        options.modelClassAliases ?? null,
      ),
    };
    const raw: RawDetection[] =
      outputKind === "nms"
        ? decodeYoloNms(out, outputShape, decodeOpts)
        : outputKind === "segmentation"
          ? decodeYoloSegmentationNms(out, outputShape, decodeOpts)
          : decodeYolo(out, outputShape, decodeOpts);
    // YOLO26 already runs NMS in the graph, so re-running it would be a no-op
    // on overlap and a needless O(n²) on JS. Skip when the graph handled it.
    const kept = outputKind === "raw" ? nonMaxSuppression(raw, hp.iouThreshold) : raw;
    // When the model is a segmentation head, reconstruct per-instance
    // binary masks from the prototype tensor + per-row coefficients and
    // hand polygons to `mapDetectionsToSeeds`. This is the bridge that
    // makes the seeds' length/width/area come from `measure_instance`
    // (port of scripts/run_segmentation.py) instead of the bbox-rect
    // approximation. Single-shot only — the live worklet returns null
    // from analyzeFrame so it never pays this cost.
    if (outputKind === "segmentation" && protoIndex >= 0 && protoShape) {
      const protoBuffer = outputs[protoIndex];
      if (protoBuffer) {
        const protos = new Float32Array(protoBuffer);
        attachSegmentationPolygons(kept, {
          prototypes: protos,
          protoShape,
          letterbox: lb,
          srcWidth: pixels.width,
          srcHeight: pixels.height,
        });
      }
    }
    const seeds = mapDetectionsToSeeds(kept, {
      frameWidth: pixels.width,
      frameHeight: pixels.height,
      pxPerMm: options.pxPerMm,
      roi: options.roi ?? null,
      gradingConfig: options.gradingConfig ?? null,
    });

    const totalMs = Date.now() - startedAt;
    console.info(
      `[analyzer] ${this.id} preprocess=${preprocessProfile} decode=${decodeMs}ms letterbox=${lbMs}ms infer=${inferMs}ms total=${totalMs}ms raw=${raw.length} kept=${kept.length} seeds=${seeds.length} frame=${pixels.width}x${pixels.height}`,
    );

    return {
      analyzerId: this.id,
      durationMs: totalMs,
      seeds,
      summary: summarizeSeeds(seeds),
    };
  }

  // Live frame inference deferred until DetectionOverlay lands (Phase 2.b);
  // returning null keeps the live KPI strip on its existing fallback path.
  analyzeFrame(_frame: Frame, _options: AnalyzeOptions): AnalysisFrameResult | null {
    return null;
  }
}

async function decodeImage(image: ImageRef): Promise<PixelImage> {
  if (image.kind === "base64") {
    return decodeJpegBase64(image.data);
  }
  if (image.kind !== "uri") {
    throw new Error(`Unsupported image ref: ${image.kind}`);
  }
  // Android: hand the JPEG to the native BitmapFactory decoder. ~10×
  // faster than the pure-JS jpeg-js path on Hermes, and returns the
  // pixel buffer in the same RGBA layout PixelImage expects. iOS
  // continues to use the jpeg-js path because iOS doesn't expose this
  // method (CoreML's image-input handles decode internally for the
  // inference path; only the rare ClassicalSeedAnalyzer flow would
  // benefit there, which is fast enough as-is).
  if (Platform.OS === "android") {
    try {
      const decoded = await CoreMLRunner.decodeJpegToRgba(image.uri);
      // The bridge marshals Kotlin ByteArray as a JS number[] of byte
      // values. Wrap in a Uint8Array (PixelImage's expected layout) so
      // downstream indexing is fast and types line up with jpeg-js's
      // useTArray output.
      const data = new Uint8Array(decoded.data);
      return { width: decoded.width, height: decoded.height, data };
    } catch (err) {
      console.warn("[analyzer] native jpeg decode failed; falling back to jpeg-js", err);
    }
  }
  const base64 = await FileSystem.readAsStringAsync(image.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decodeJpegBase64(base64);
}

function decodeJpegBase64(base64: string): PixelImage {
  const bytes = toByteArray(base64);
  const decoded = jpeg.decode(bytes, { useTArray: true });
  if (!decoded.width || !decoded.height || !decoded.data) {
    throw new Error("Unable to decode JPEG pixels");
  }
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}
