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
  loadModelAtPath(modelUri: string): Promise<CoreMLModelInfo>;
  compileModelPackage(packageUri: string, compiledModelUri: string): Promise<void>;
  runOnImageURL(assetName: string, fileUri: string): Promise<CoreMLOutput>;
  runOnImageURLAtPath(modelUri: string, fileUri: string): Promise<CoreMLOutput>;
};

export = AdvanceSeedsCoreMLRunner;
