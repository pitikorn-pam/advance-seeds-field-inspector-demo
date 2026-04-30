export interface CoreMLTensor {
  name: string;
  type: "image" | "multiArray" | "double" | "int64" | "string" | "dictionary" | "sequence" | "unknown";
  shape?: number[];
}

export interface CoreMLModelInfo {
  inputs: CoreMLTensor[];
  outputs: CoreMLTensor[];
}

export interface CoreMLOutput {
  outputName: string;
  shape: number[];
  values: number[];
}

declare const AdvanceSeedsCoreMLRunner: {
  loadModel(assetName: string): Promise<CoreMLModelInfo>;
  runOnImageURL(assetName: string, fileUri: string): Promise<CoreMLOutput>;
};

export = AdvanceSeedsCoreMLRunner;
