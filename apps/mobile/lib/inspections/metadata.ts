import type { Roi } from "@/lib/capture/roi";
import type { CapturedLocation } from "@/lib/capture/location";
import type { CalibrationReading } from "@advance-seeds/types";
import type {
  CaptureCameraPosition,
  CaptureFlashMode,
  CaptureMediaKind,
  CaptureMode,
} from "@/lib/capture/session";

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
