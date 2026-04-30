import * as FileSystem from "expo-file-system/legacy";
import { toByteArray } from "base64-js";
import jpeg from "jpeg-js";
import { loadTensorflowModel, type TfliteModel } from "react-native-fast-tflite";
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
  decodeYolo,
  decodeYoloNms,
  letterbox,
  mapDetectionsToSeeds,
  nonMaxSuppression,
  summarizeSeeds,
} from "./yolo";
import type { RawDetection } from "./yolo";
import { ensureHyperParamsLoaded, getHyperParamsSync } from "./hyperparams";

// Generic COCO yolo11n.tflite acts as a structural placeholder until a
// seed-trained model is dropped at the same path. See assets/models/README.md.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL_SOURCE = require("../../assets/models/yolo11n-seeds.tflite");

// "raw" head emits [1, 4+numClasses, anchors] (YOLO 8/11), "nms" head emits
// [1, maxDet, 6] with NMS already baked in (YOLO 26 default export).
export type TfliteOutputKind = "raw" | "nms";

export interface LoadedTfliteModel {
  model: TfliteModel;
  outputKind: TfliteOutputKind;
  /** Cached output tensor shape — Nitro hybrid getters can lose their
   *  native state across fast-refresh, so reading `model.outputs` repeatedly
   *  is unsafe. Capture once at load time and reuse. */
  outputShape: readonly [number, number, number];
}

// Persist across fast-refresh: Metro HMR re-evaluates this module on every
// JS reload, which would otherwise reset our singleton and create a new
// TfliteModel — old instances captured by stale `useFrameProcessor`
// closures then crash with "this does not have a NativeState!" when the
// worklet runtime walks them. Stashing on globalThis lets the next module
// evaluation re-use the live hybrid object.
const GLOBAL_KEY = "__advanceSeedsTfliteModelPromise";
type GlobalSlot = { [GLOBAL_KEY]?: Promise<LoadedTfliteModel> | null };
const globalSlot = globalThis as unknown as GlobalSlot;

// Singleton loader — TfliteSeedAnalyzer (single-shot) and useLiveDetections
// (worklet) share one TfliteModel instance instead of paying ~5 MB twice.
export function loadSharedTfliteModel(): Promise<LoadedTfliteModel> {
  let modelPromise = globalSlot[GLOBAL_KEY] ?? null;
  if (!modelPromise) {
    modelPromise = (async () => {
      const model = await loadTensorflowModel(MODEL_SOURCE, []);
      const inputs = model.inputs;
      const outputs = model.outputs;
      if (inputs.length !== 1 || outputs.length !== 1) {
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
      const outShape = outputs[0].shape;
      if (outShape.length !== 3) {
        throw new Error(`Unsupported output rank ${outShape.length}; expected rank-3 tensor`);
      }
      const outputKind: TfliteOutputKind = outShape[2] === 6 ? "nms" : "raw";
      console.info(`[analyzer] tflite output kind=${outputKind} shape=${outShape.join("x")}`);
      // Snapshot the shape into a plain tuple so we never read it back off
      // the hybrid object — accessing `model.outputs[].shape` after a
      // fast-refresh throws "this does not have a NativeState".
      const outputShape: readonly [number, number, number] = [
        outShape[0],
        outShape[1],
        outShape[2],
      ];
      return { model, outputKind, outputShape };
    })().catch((err) => {
      // Reset both the local closure and the global slot so next call retries.
      globalSlot[GLOBAL_KEY] = null;
      throw err;
    });
    globalSlot[GLOBAL_KEY] = modelPromise;
  }
  return modelPromise;
}

export class TfliteSeedAnalyzer implements SeedAnalyzer {
  readonly id = "tflite-yolo";

  private constructor(
    private readonly model: TfliteModel,
    private readonly outputKind: TfliteOutputKind,
    private readonly outputShape: readonly [number, number, number],
  ) {}

  static async load(): Promise<TfliteSeedAnalyzer> {
    const { model, outputKind, outputShape } = await loadSharedTfliteModel();
    return new TfliteSeedAnalyzer(model, outputKind, outputShape);
  }

  async analyze(image: ImageRef, options: AnalyzeOptions): Promise<AnalysisResult> {
    const startedAt = Date.now();
    await ensureHyperParamsLoaded();
    const hp = getHyperParamsSync();
    const decodeStartedAt = Date.now();
    const pixels = await decodeImage(image);
    const decodeMs = Date.now() - decodeStartedAt;

    const lbStartedAt = Date.now();
    const lb = letterbox(pixels, YOLO_INPUT_SIZE);
    const lbMs = Date.now() - lbStartedAt;

    const inferStartedAt = Date.now();
    const outputs = this.model.runSync([lb.tensor.buffer as ArrayBuffer]);
    const inferMs = Date.now() - inferStartedAt;
    const out = new Float32Array(outputs[0]);
    const decodeOpts = {
      letterbox: lb,
      scoreThreshold: hp.scoreThreshold,
      classFilter: options.classFilter ?? null,
    };
    const raw: RawDetection[] =
      this.outputKind === "nms"
        ? decodeYoloNms(out, this.outputShape, decodeOpts)
        : decodeYolo(out, this.outputShape, decodeOpts);
    // YOLO26 already runs NMS in the graph, so re-running it would be a no-op
    // on overlap and a needless O(n²) on JS. Skip when the graph handled it.
    const kept = this.outputKind === "nms" ? raw : nonMaxSuppression(raw, hp.iouThreshold);
    const seeds = mapDetectionsToSeeds(kept, {
      frameWidth: pixels.width,
      frameHeight: pixels.height,
      pxPerMm: options.pxPerMm,
      roi: options.roi ?? null,
    });

    const totalMs = Date.now() - startedAt;
    console.info(
      `[analyzer] ${this.id} decode=${decodeMs}ms letterbox=${lbMs}ms infer=${inferMs}ms total=${totalMs}ms raw=${raw.length} kept=${kept.length} seeds=${seeds.length} frame=${pixels.width}x${pixels.height}`,
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
