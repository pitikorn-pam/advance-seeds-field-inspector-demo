export type ModelPlatform = "android" | "ios";
export type ModelQuantization = "none" | "fp16" | "int8";
export type ModelInstallStatus = "installed" | "active" | "failed";

export interface ModelMetadata {
  model_name: string;
  model_version: string;
  task: string;
  input_size: number;
  class_names: string[];
  output_kind: string;
  output_shape: number[];
  score_threshold?: number;
  iou_threshold?: number;
  calibration?: {
    required?: boolean;
    supported_sources?: string[];
    default_marker_mm?: number;
  };
  [key: string]: unknown;
}

export interface ModelArtifactManifest {
  path: string;
  sha256: string;
  size_bytes: number;
}

export interface ModelCandidateManifest {
  key: string;
  display_name: string;
  quantized?: boolean;
  quantization: ModelQuantization;
  metadata: string;
  artifacts: {
    tflite?: ModelArtifactManifest;
    coreml?: ModelArtifactManifest;
  };
  weights?: string;
  train_results?: string;
  dataset_config?: string;
}

export interface ModelCandidatesIndex {
  models: ModelCandidateManifest[];
}

export interface ModelCandidate {
  id: string;
  displayName: string;
  quantization: ModelQuantization;
  manifest: ModelCandidateManifest;
  manifestUrl: string;
  metadataUrl: string;
  metadata?: ModelMetadata;
  artifactUrl: string | null;
  platform: ModelPlatform;
  supported: boolean;
  unsupportedReason?: string;
  channel?: "staging" | "production";
  isDefault?: boolean;
}

export interface InstalledModelRecord {
  id: string;
  displayName: string;
  platform: ModelPlatform;
  quantization: ModelQuantization;
  installedAt: string;
  status: ModelInstallStatus;
  artifactUri: string;
  artifactSha256: string;
  artifactSizeBytes: number;
  metadata: ModelMetadata;
  manifest: ModelCandidateManifest;
  lastError?: string | null;
}
