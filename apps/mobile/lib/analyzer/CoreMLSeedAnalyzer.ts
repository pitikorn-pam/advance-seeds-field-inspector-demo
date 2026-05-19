import { Image } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import type {
  AnalysisFrameResult,
  AnalysisResult,
  AnalyzeOptions,
  Frame,
  ImageRef,
  SeedAnalyzer,
} from "@advance-seeds/types";
import CoreMLRunner, { type CoreMLModelInfo } from "@advance-seeds/coreml-runner";
import { quickVerifyArtifact, readActiveModel } from "@/lib/models/modelStore";
import { mapClassFilterForModel } from "@/lib/models/compatibility";
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
import { resolvePreprocessProfile } from "./preprocess";

type OutputKind = "raw" | "nms" | "segmentation";

interface LoadedCoreMLModel {
  info: CoreMLModelInfo;
  outputKind: OutputKind;
  source: CoreMLModelSource;
}

export interface CoreMLModelSource {
  key: string;
  modelPath: string;
}

let modelPromise: Promise<LoadedCoreMLModel> | null = null;
let modelPromiseKey: string | null = null;

export function loadSharedCoreMLModel(): Promise<LoadedCoreMLModel> {
  return resolveCoreMLModelSource().then((source) => {
    if (modelPromise && modelPromiseKey === source.key) return modelPromise;
    modelPromiseKey = source.key;
    modelPromise = (async () => {
      const info = await CoreMLRunner.loadModelAtPath(source.modelPath);
      const primary =
        info.outputs
          .filter((o) => o.shape && o.shape.length > 0)
          .sort((a, b) => prod(b.shape!) - prod(a.shape!))[0] ?? info.outputs[0];
      const lastDim = primary?.shape?.[primary.shape.length - 1] ?? 0;
      // Detect output format by trailing dim: 6 = NMS-fused detection only
      // (x1,y1,x2,y2,conf,cls); >6 = NMS-fused segmentation (adds mask
      // coefs). Otherwise the model emits raw per-anchor scores and must
      // run JS-side NMS via decodeYolo.
      const outputKind: OutputKind = lastDim === 6 ? "nms" : lastDim > 6 ? "segmentation" : "raw";
      console.info(
        `[analyzer] coreml source=${source.key} output kind=${outputKind} primary=${primary?.name} shape=${(primary?.shape ?? []).join("x")}`,
      );
      return { info, outputKind, source };
    })().catch((err) => {
      modelPromise = null;
      modelPromiseKey = null;
      throw err;
    });
    return modelPromise;
  });
}

export async function resolveCoreMLModelSource(): Promise<CoreMLModelSource> {
  const active = await readActiveModel();
  const platformOk = active?.platform === "ios";
  const compiledUri = active?.compiledArtifactUri ?? null;
  const hasCompiledUri = Boolean(compiledUri);
  const verified = active ? await quickVerifyArtifact(active) : false;
  const compiledExists = compiledUri ? await fileExists(compiledUri) : false;
  if (platformOk && compiledUri && verified && compiledExists && active) {
    return {
      key: `installed:${active.id}`,
      modelPath: compiledUri,
    };
  }
  if (active) {
    console.info(
      "[coreml resolve] installed model unusable — platformOk=%s hasCompiledUri=%s verified=%s compiledExists=%s",
      platformOk,
      hasCompiledUri,
      verified,
      compiledExists,
    );
  }
  throw new Error("No installed active iOS model is available.");
}

async function fileExists(uri: string): Promise<boolean> {
  try {
    return (await FileSystem.getInfoAsync(uri)).exists;
  } catch {
    return false;
  }
}

function prod(s: number[]): number {
  return s.reduce((a, b) => a * b, 1);
}

/**
 * Find the YOLO mask prototype tensor among the CoreML runner's
 * `extraOutputs`. The prototype is a rank-4 multiArray of roughly
 * `[1, 32, 160, 160]` (or NHWC equivalent); when multiple candidates
 * exist we pick the largest by element count.
 */
function pickPrototypeFromExtras(
  extras: Record<string, { shape: number[]; values: number[] }> | undefined,
): { shape: number[]; values: number[] } | null {
  if (!extras) return null;
  let best: { shape: number[]; values: number[] } | null = null;
  for (const key of Object.keys(extras)) {
    const tensor = extras[key];
    if (!tensor || !tensor.shape || tensor.shape.length < 3) continue;
    if (!best || prod(tensor.shape) > prod(best.shape)) {
      best = tensor;
    }
  }
  return best;
}

/**
 * Single-shot Core ML photo analyzer for iOS. The native side handles
 * JPEG decode, image-to-tensor conversion, and inference (orders of
 * magnitude faster than the JS jpeg-js TFLite path).
 *
 * Coordinate handling:
 *   - CoreML's `MLImageConstraint` with `aspectFit` scales the longer
 *     edge to 640 and pads the shorter edge with gray (114), the same
 *     letterbox standard YOLO exports use. Detections come back in
 *     640-px space relative to that *padded* canvas.
 *   - The letterbox params here (scale = 640 / max(srcW, srcH); padX, padY
 *     = (640 − newWH) / 2) feed into the shared decoder at yolo.ts, whose
 *     inverse `(cx − padX) / scale` projects bboxes back to source-image
 *     pixel space.
 *   - With detections in source-image pixel space, the session ROI
 *     (normalized [0..1] against the source photo) compares correctly
 *     in `mapDetectionsToSeeds`.
 */
export class CoreMLSeedAnalyzer implements SeedAnalyzer {
  readonly id = "coreml-yolo";

  private constructor() {}

  static async load(): Promise<CoreMLSeedAnalyzer> {
    await loadSharedCoreMLModel();
    return new CoreMLSeedAnalyzer();
  }

  async analyze(image: ImageRef, options: AnalyzeOptions): Promise<AnalysisResult> {
    if (image.kind !== "uri") {
      throw new Error(`CoreMLSeedAnalyzer needs a uri ImageRef, got ${image.kind}`);
    }
    const startedAt = Date.now();
    await ensureHyperParamsLoaded();
    const hp = getHyperParamsSync();
    const { outputKind, source } = await loadSharedCoreMLModel();
    const active = await readActiveModel();
    const preprocessProfile = resolvePreprocessProfile(
      hp.preprocessProfile,
      active?.platform === "ios" ? active.metadata : null,
    );
    if (preprocessProfile === "morph_fused_v1") {
      console.warn(
        "[analyzer] coreml-yolo preprocess=morph_fused_v1 requested; iOS Core ML image-input path runs raw_rgb in v1",
      );
    }

    // Source dims drive the inverse-letterbox math + ROI normalization.
    // Image.getSize is async but cheap (RN's image loader caches).
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(
        image.uri,
        (width, height) => resolve({ width, height }),
        (err) => reject(err),
      );
    });
    const srcW = dims.width;
    const srcH = dims.height;
    // Aspect-fit-pad letterbox params, matching the standard YOLO CoreML
    // export (and the Android TFLite path's `letterbox()` in yolo.ts).
    // CoreML's `MLImageConstraint` with `aspectFit` scales the longer edge
    // to 640 and pads the shorter edge to keep aspect ratio. The decoder
    // at yolo.ts:87 inverts via `(cx - padX) / scale`, which exactly
    // undoes this convention.
    //
    // Earlier this code used a center-crop convention (negative padX/padY,
    // scale by the *shorter* edge). That assumption matched neither the
    // standard CoreML export nor the Android path — bboxes landed in
    // wrong/blank regions on iOS while Android stayed accurate. Switching
    // to aspect-fit-pad aligns iOS with Android and the decoder math.
    const fitScale = YOLO_INPUT_SIZE / Math.max(srcW, srcH);
    const newW = Math.round(srcW * fitScale);
    const newH = Math.round(srcH * fitScale);
    const padX = Math.floor((YOLO_INPUT_SIZE - newW) / 2);
    const padY = Math.floor((YOLO_INPUT_SIZE - newH) / 2);

    const inferStartedAt = Date.now();
    const result = await CoreMLRunner.runOnImageURLAtPath(source.modelPath, image.uri);
    const inferMs = Date.now() - inferStartedAt;
    const out = Float32Array.from(result.values);
    const shape = result.shape as unknown as readonly [number, number, number];

    const decodeOpts = {
      letterbox: { scale: fitScale, padX, padY, target: YOLO_INPUT_SIZE },
      scoreThreshold: hp.scoreThreshold,
      // Mirror the live path: aliases + variety names resolve to model
      // class indices through the same compatibility helper. Without this
      // the post-capture analyzer would only honor COCO-id filters and
      // miss every detection on a custom seg model.
      classFilter: mapClassFilterForModel(
        options.classFilter,
        active?.metadata ?? null,
        options.varietyNames ?? null,
        options.modelClassAliases ?? null,
      ),
    };
    const raw: RawDetection[] =
      outputKind === "nms"
        ? decodeYoloNms(out, shape, decodeOpts)
        : outputKind === "segmentation"
          ? decodeYoloSegmentationNms(out, shape, decodeOpts)
          : decodeYolo(out, shape, decodeOpts);
    // Segmentation output is already NMS-fused on-graph; only the raw
    // path needs JS-side NMS. nms-fused detection is also pre-NMS'd.
    const kept = outputKind === "raw" ? nonMaxSuppression(raw, hp.iouThreshold) : raw;
    // Reconstruct per-instance binary masks from the prototype tensor +
    // per-row coefficients so length/width/area come from
    // `measure_instance` (mirror of scripts/run_segmentation.py). The
    // CoreML runner surfaces the prototype tensor under `extraOutputs`
    // alongside the primary detection tensor — pick the largest rank-4
    // multiArray as the prototype candidate.
    if (outputKind === "segmentation") {
      const proto = pickPrototypeFromExtras(result.extraOutputs);
      if (proto) {
        attachSegmentationPolygons(kept, {
          prototypes: Float32Array.from(proto.values),
          protoShape: proto.shape,
          letterbox: decodeOpts.letterbox,
          srcWidth: srcW,
          srcHeight: srcH,
        });
      }
    }
    const seeds = mapDetectionsToSeeds(kept, {
      frameWidth: srcW,
      frameHeight: srcH,
      pxPerMm: options.pxPerMm,
      roi: options.roi ?? null,
      gradingConfig: options.gradingConfig ?? null,
    });

    const totalMs = Date.now() - startedAt;
    console.info(
      `[analyzer] ${this.id} preprocess=${preprocessProfile} infer=${inferMs}ms total=${totalMs}ms raw=${raw.length} kept=${kept.length} seeds=${seeds.length} src=${srcW}x${srcH}`,
    );

    return {
      analyzerId: this.id,
      durationMs: totalMs,
      seeds,
      summary: summarizeSeeds(seeds),
    };
  }

  analyzeFrame(_frame: Frame, _options: AnalyzeOptions): AnalysisFrameResult | null {
    return null;
  }
}
