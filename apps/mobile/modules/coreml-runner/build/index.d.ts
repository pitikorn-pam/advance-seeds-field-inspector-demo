export interface CoreMLTensor {
  name: string;
  type: "image" | "multiArray" | "double" | "int64" | "string" | "dictionary" | "sequence" | "unknown";
  shape?: number[];
}

export interface CoreMLModelInfo {
  inputs: CoreMLTensor[];
  outputs: CoreMLTensor[];
}

export interface CoreMLTensorPayload {
  shape: number[];
  values: number[];
}

export interface CoreMLOutput {
  outputName: string;
  shape: number[];
  values: number[];
  /**
   * All other MultiArray outputs the model produced, keyed by feature
   * name. For YOLO segmentation models this typically contains the
   * mask prototype tensor (~[1, 32, 160, 160]) needed to reconstruct
   * per-detection pixel masks. Empty for detection-only models.
   */
  extraOutputs?: Record<string, CoreMLTensorPayload>;
}

export interface DecodedRgba {
  width: number;
  height: number;
  /** Pixel data in RGBA order, 4 bytes per pixel. */
  data: number[];
}

declare const AdvanceSeedsCoreMLRunner: {
  loadModel(assetName: string): Promise<CoreMLModelInfo>;
  loadModelAtPath(modelUri: string): Promise<CoreMLModelInfo>;
  compileModelPackage(packageUri: string, compiledModelUri: string): Promise<void>;
  runOnImageURL(assetName: string, fileUri: string): Promise<CoreMLOutput>;
  runOnImageURLAtPath(modelUri: string, fileUri: string): Promise<CoreMLOutput>;
  /**
   * Android-only: native JPEG decode via BitmapFactory. Replaces the
   * pure-JS jpeg-js path used by `TfliteSeedAnalyzer`. iOS rejects this
   * call (Core ML's image-input handles its own decode for the inference
   * path); on Android it returns a flat RGBA byte array plus dims.
   */
  decodeJpegToRgba(fileUri: string): Promise<DecodedRgba>;
};

export = AdvanceSeedsCoreMLRunner;
