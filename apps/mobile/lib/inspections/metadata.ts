import type { Roi } from "@/lib/capture/roi";
import type { CapturedLocation } from "@/lib/capture/location";
import type { CalibrationReading } from "@advance-seeds/types";
import type {
  CaptureCameraPosition,
  CaptureFlashMode,
  CaptureMediaKind,
  CaptureMode,
} from "@/lib/capture/session";
import type { PreprocessProfile } from "@/lib/analyzer/preprocess";

export interface DeviceUsageMetadata {
  device_name: string | null;
  platform: string;
  os_version: string | number | null;
  app_version: string | null;
  build_version: string | null;
  runtime_version: string | null;
}

export interface CaptureMetadata {
  mode: CaptureMode;
  media_kind: CaptureMediaKind;
  camera_position: CaptureCameraPosition | null;
  flash_mode: CaptureFlashMode | null;
  roi_kind: Roi["kind"] | null;
  captured_at: string;
}

/**
 * Snapshot of which detector produced this inspection's results.
 * Frozen at capture time so historical inspections stay traceable to a
 * specific model + thresholds even after the operator activates a new
 * registry model or tunes hyperparameters.
 */
export interface AnalyzerModelMetadata {
  /** Internal id (registry: "{channel}-{version_id}-{platform}", bundled: "bundled:{asset}", classical/mock for non-ML). */
  id: string;
  /** Human-readable label (semver for registry, asset name for bundled). */
  display_name: string;
  /** Source: registry channel ("production"/"staging"), or "bundled" for ship-with weights, "classical" / "mock" for fallbacks. */
  source: "production" | "staging" | "bundled" | "classical" | "mock";
  /** Trained model identifier (e.g. "yolo26n-seg"). Null when not applicable (classical / mock). */
  model_name: string | null;
  /** Semver from the registry. Null for bundled / non-ML analyzers. */
  version: string | null;
  /** Runtime that ran the inference: "coreml-yolo" / "tflite-yolo" / "classical-cv-v1" / "mock". */
  analyzer_runtime: string;
  /** Detection confidence cutoff applied for this capture. */
  score_threshold: number;
  /** NMS IoU threshold (raw YOLO11/8 head only — ignored by NMS-baked exports). */
  iou_threshold: number;
  /** Input preprocessing profile applied before detector inference. */
  preprocess_profile: PreprocessProfile;
}

export interface CalibrationMetadata {
  px_per_mm: number;
  source: CalibrationReading["source"];
  confidence: number;
  observed_at_ms: number;
  profile_id: string | null;
  profile_name: string | null;
}

interface BuildInspectionMetadataArgs {
  roi: Roi | null;
  mediaKind: CaptureMediaKind;
  mediaUrl: string;
  recordingId: string | null;
  recordingDurationMs: number | null;
  locationTagEnabled: boolean;
  capturedLocation: CapturedLocation | null;
  deviceUsage: DeviceUsageMetadata;
  calibration:
    | (CalibrationReading & {
        profileId: string | null;
        profileName: string | null;
      })
    | null;
  capture: Omit<CaptureMetadata, "media_kind" | "roi_kind">;
  analyzerModel: AnalyzerModelMetadata | null;
}

export function buildInspectionMetadata(
  args: BuildInspectionMetadataArgs,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (args.roi) metadata.roi = args.roi;
  if (args.calibration) {
    metadata.calibration = {
      px_per_mm: args.calibration.pxPerMm,
      source: args.calibration.source,
      confidence: args.calibration.confidence,
      observed_at_ms: args.calibration.observedAtMs,
      profile_id: args.calibration.profileId,
      profile_name: args.calibration.profileName,
    } satisfies CalibrationMetadata;
  }
  metadata.capture_media = {
    kind: args.mediaKind,
    url: args.mediaUrl,
    recording_id: args.mediaKind === "video" ? args.recordingId : null,
    duration_ms: args.mediaKind === "video" ? args.recordingDurationMs : null,
  };
  metadata.device_usage = args.deviceUsage;
  metadata.capture = {
    ...args.capture,
    media_kind: args.mediaKind,
    roi_kind: args.roi?.kind ?? null,
  };
  if (args.analyzerModel) metadata.analyzer_model = args.analyzerModel;
  if (args.locationTagEnabled) {
    metadata.location_capture_enabled = true;
    if (args.capturedLocation) metadata.location = args.capturedLocation;
  }
  return metadata;
}

export function readCalibrationMetadata(metadata: unknown): CalibrationMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const calibration = (metadata as { calibration?: unknown }).calibration;
  if (!calibration || typeof calibration !== "object") return null;
  const row = calibration as Partial<CalibrationMetadata>;
  const source =
    row.source === "manual" || row.source === "aruco" || row.source === "lidar" ? row.source : null;
  if (
    typeof row.px_per_mm !== "number" ||
    typeof row.confidence !== "number" ||
    typeof row.observed_at_ms !== "number" ||
    !source
  ) {
    return null;
  }
  return {
    px_per_mm: row.px_per_mm,
    source,
    confidence: row.confidence,
    observed_at_ms: row.observed_at_ms,
    profile_id: typeof row.profile_id === "string" ? row.profile_id : null,
    profile_name: typeof row.profile_name === "string" ? row.profile_name : null,
  };
}

export function readLocationMetadata(metadata: unknown): CapturedLocation | null {
  if (!metadata || typeof metadata !== "object") return null;
  const location = (metadata as { location?: unknown }).location;
  if (!location || typeof location !== "object") return null;
  const row = location as Partial<CapturedLocation>;
  if (typeof row.latitude !== "number" || typeof row.longitude !== "number") return null;
  return {
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: typeof row.accuracy === "number" ? row.accuracy : null,
    timestamp: typeof row.timestamp === "string" ? row.timestamp : "",
    name: typeof row.name === "string" ? row.name : null,
    address: typeof row.address === "string" ? row.address : null,
    city: typeof row.city === "string" ? row.city : null,
    region: typeof row.region === "string" ? row.region : null,
    country: typeof row.country === "string" ? row.country : null,
  };
}

export function locationDisplayName(location: CapturedLocation): string {
  return (
    location.address ||
    [location.name, location.city, location.region, location.country]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .filter((part, index, all) => all.indexOf(part) === index)
      .join(", ") ||
    `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
  );
}

export function readDeviceUsageMetadata(metadata: unknown): DeviceUsageMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const device = (metadata as { device_usage?: unknown }).device_usage;
  if (!device || typeof device !== "object") return null;
  const row = device as Partial<DeviceUsageMetadata>;
  return {
    device_name: typeof row.device_name === "string" ? row.device_name : null,
    platform: typeof row.platform === "string" ? row.platform : "unknown",
    os_version:
      typeof row.os_version === "string" || typeof row.os_version === "number"
        ? row.os_version
        : null,
    app_version: typeof row.app_version === "string" ? row.app_version : null,
    build_version: typeof row.build_version === "string" ? row.build_version : null,
    runtime_version: typeof row.runtime_version === "string" ? row.runtime_version : null,
  };
}

export function readAnalyzerModelMetadata(metadata: unknown): AnalyzerModelMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const row = (metadata as { analyzer_model?: unknown }).analyzer_model;
  if (!row || typeof row !== "object") return null;
  const m = row as Partial<AnalyzerModelMetadata>;
  if (typeof m.id !== "string" || typeof m.display_name !== "string") return null;
  const source =
    m.source === "production" ||
    m.source === "staging" ||
    m.source === "bundled" ||
    m.source === "classical" ||
    m.source === "mock"
      ? m.source
      : "bundled";
  return {
    id: m.id,
    display_name: m.display_name,
    source,
    model_name: typeof m.model_name === "string" ? m.model_name : null,
    version: typeof m.version === "string" ? m.version : null,
    analyzer_runtime: typeof m.analyzer_runtime === "string" ? m.analyzer_runtime : "unknown",
    score_threshold: typeof m.score_threshold === "number" ? m.score_threshold : 0,
    iou_threshold: typeof m.iou_threshold === "number" ? m.iou_threshold : 0,
    preprocess_profile: m.preprocess_profile === "morph_fused_v1" ? "morph_fused_v1" : "raw_rgb",
  };
}

export function readCaptureMetadata(metadata: unknown): CaptureMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const capture = (metadata as { capture?: unknown }).capture;
  if (!capture || typeof capture !== "object") return null;
  const row = capture as Partial<CaptureMetadata>;
  const mode = row.mode === "precise" ? "precise" : row.mode === "live" ? "live" : null;
  if (!mode) return null;
  return {
    mode,
    media_kind: row.media_kind === "video" ? "video" : "photo",
    camera_position:
      row.camera_position === "front" || row.camera_position === "back"
        ? row.camera_position
        : null,
    flash_mode:
      row.flash_mode === "on" || row.flash_mode === "auto" || row.flash_mode === "off"
        ? row.flash_mode
        : null,
    roi_kind:
      row.roi_kind === "rect" || row.roi_kind === "polygon" || row.roi_kind === "circle"
        ? row.roi_kind
        : null,
    captured_at: typeof row.captured_at === "string" ? row.captured_at : "",
  };
}
