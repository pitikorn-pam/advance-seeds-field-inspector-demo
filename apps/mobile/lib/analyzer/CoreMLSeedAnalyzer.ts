import { Image } from "react-native";
import type {
  AnalysisFrameResult,
  AnalysisResult,
  AnalyzeOptions,
  Frame,
  ImageRef,
  SeedAnalyzer,
} from "@advance-seeds/types";
import CoreMLRunner, { type CoreMLModelInfo } from "@advance-seeds/coreml-runner";
import {
  YOLO_INPUT_SIZE,
  decodeYolo,
  decodeYoloNms,
  mapDetectionsToSeeds,
  nonMaxSuppression,
  summarizeSeeds,
} from "./yolo";
import type { RawDetection } from "./yolo";

const SCORE_THRESHOLD = 0.5;
const IOU_THRESHOLD = 0.75;
const MODEL_ASSET = "yolo26n";

type OutputKind = "raw" | "nms";

interface LoadedCoreMLModel {
  info: CoreMLModelInfo;
  outputKind: OutputKind;
}

let modelPromise: Promise<LoadedCoreMLModel> | null = null;

export function loadSharedCoreMLModel(): Promise<LoadedCoreMLModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const info = await CoreMLRunner.loadModel(MODEL_ASSET);
      const primary =
        info.outputs
          .filter((o) => o.shape && o.shape.length > 0)
          .sort((a, b) => prod(b.shape!) - prod(a.shape!))[0] ?? info.outputs[0];
      const lastDim = primary?.shape?.[primary.shape.length - 1] ?? 0;
      const outputKind: OutputKind = lastDim === 6 ? "nms" : "raw";
      console.info(
        `[analyzer] coreml output kind=${outputKind} primary=${primary?.name} shape=${(primary?.shape ?? []).join("x")}`,
      );
      return { info, outputKind };
    })().catch((err) => {
      modelPromise = null;
      throw err;
    });
  }
  return modelPromise;
}

function prod(s: number[]): number {
  return s.reduce((a, b) => a * b, 1);
}

/**
 * Single-shot Core ML photo analyzer for iOS. The native side handles
 * JPEG decode, image-to-tensor conversion, and inference (orders of
 * magnitude faster than the JS jpeg-js TFLite path).
 *
 * Coordinate handling:
 *   - The bundled YOLO26 Core ML model takes a 640×640 image input;
 *     CoreML's `MLImageConstraint` aspect-fits with a center-crop, so
 *     detections come back in 640-px space relative to the *cropped*
 *     square of the source photo, NOT the full photo dims.
 *   - We read source image dims via `Image.getSize` (cheap, no native
 *     change required) and feed them to the same letterbox-inverse
 *     decoder helpers used by the worklet path: a detection at (cx, cy)
 *     in 640 maps to (offsetX + cx * cropSize/640) in the source image.
 *   - With detections in source-image pixel space, the session ROI
 *     (normalized [0..1] against the source photo) compares correctly
 *     in `mapDetectionsToSeeds`, fixing the earlier `seeds=0 while
 *     kept=N` bug when an ROI was active.
 */
export class CoreMLSeedAnalyzer implements SeedAnalyzer {
  readonly id = "coreml-yolo";

  private constructor(private readonly outputKind: OutputKind) {}

  static async load(): Promise<CoreMLSeedAnalyzer> {
    const { outputKind } = await loadSharedCoreMLModel();
    return new CoreMLSeedAnalyzer(outputKind);
  }

  async analyze(image: ImageRef, options: AnalyzeOptions): Promise<AnalysisResult> {
    if (image.kind !== "uri") {
      throw new Error(`CoreMLSeedAnalyzer needs a uri ImageRef, got ${image.kind}`);
    }
    const startedAt = Date.now();

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
    const cropSize = Math.min(srcW, srcH);
    const fitScale = YOLO_INPUT_SIZE / cropSize;
    const padX = -((srcW - cropSize) / 2) * fitScale;
    const padY = -((srcH - cropSize) / 2) * fitScale;

    const inferStartedAt = Date.now();
    const result = await CoreMLRunner.runOnImageURL(MODEL_ASSET, image.uri);
    const inferMs = Date.now() - inferStartedAt;
    const out = Float32Array.from(result.values);
    const shape = result.shape as unknown as readonly [number, number, number];

    const decodeOpts = {
      letterbox: { scale: fitScale, padX, padY, target: YOLO_INPUT_SIZE },
      scoreThreshold: SCORE_THRESHOLD,
      classFilter: options.classFilter ?? null,
    };
    const raw: RawDetection[] =
      this.outputKind === "nms"
        ? decodeYoloNms(out, shape, decodeOpts)
        : decodeYolo(out, shape, decodeOpts);
    const kept = this.outputKind === "nms" ? raw : nonMaxSuppression(raw, IOU_THRESHOLD);
    const seeds = mapDetectionsToSeeds(kept, {
      frameWidth: srcW,
      frameHeight: srcH,
      pxPerMm: options.pxPerMm,
      roi: options.roi ?? null,
    });

    const totalMs = Date.now() - startedAt;
    console.info(
      `[analyzer] ${this.id} infer=${inferMs}ms total=${totalMs}ms raw=${raw.length} kept=${kept.length} seeds=${seeds.length} src=${srcW}x${srcH}`,
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
