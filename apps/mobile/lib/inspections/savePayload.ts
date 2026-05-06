// Pure assembly of inspection save + queue payloads. Lives outside
// `app/capture/review.tsx` so:
//   1) the same payload shape can be enqueued from anywhere (offline save,
//      future "retry from history" affordance, etc.) without touching the
//      review screen;
//   2) the duplicate code in review.tsx's success path and queue-fallback
//      path collapses into one helper;
//   3) we can unit-test the assembly + the queue wrapper in `node --test`,
//      no React or Supabase mocks needed.

import type { AnalyzedSeed, AnalysisSummary } from "@advance-seeds/types";
import type { InspectionQueuePayload, SyncQueuePayload } from "../sync/types";

const DB_MAX_MM = 999.999;
const DB_MAX_AREA_MM2 = 99999.999;

export interface InspectionSavePayload {
  inspector_id: string;
  variety_id: string;
  batch_id: string | null;
  calibration_id: string | null;
  image_url: string;
  total_seeds: number;
  mean_length_mm: number;
  mean_width_mm: number;
  mean_area_mm2: number;
  seeds: AnalyzedSeed[];
  metadata: Record<string, unknown> | null;
  notes: string | null;
}

export interface BuildSavePayloadOptions {
  inspectorId: string;
  varietyId: string;
  batchId: string | null;
  calibrationId: string | null;
  imageUrl: string;
  summary: AnalysisSummary;
  seeds: AnalyzedSeed[];
  metadata: Record<string, unknown> | null;
  notes: string;
}

/** Returns the row shape `useCreateInspection` accepts. */
export function buildInspectionSavePayload(opts: BuildSavePayloadOptions): InspectionSavePayload {
  const trimmed = opts.notes.trim();
  const seeds = sanitizeSeedsForPersistence(opts.seeds);
  const summary = summarizeSeedsForPersistence(seeds, opts.summary, opts.seeds.length);
  return {
    inspector_id: opts.inspectorId,
    variety_id: opts.varietyId,
    batch_id: opts.batchId,
    calibration_id: opts.calibrationId,
    image_url: opts.imageUrl,
    total_seeds: summary.total_seeds,
    mean_length_mm: summary.mean_length_mm,
    mean_width_mm: summary.mean_width_mm,
    mean_area_mm2: summary.mean_area_mm2,
    seeds,
    metadata: withPersistenceSanitizationMetadata(opts.metadata, opts.seeds.length, seeds.length),
    notes: trimmed.length > 0 ? trimmed : null,
  };
}

export interface ToQueuePayloadOptions {
  payload: InspectionSavePayload;
  mediaKind: "photo" | "video";
  /** Local file:// URI of the captured asset — the queue uploads from here. */
  localImageUri: string | null;
  localVideoUri: string | null;
}

/**
 * Wraps an `InspectionSavePayload` into the queue's `SyncQueuePayload` shape.
 * If the saved `image_url` is already a remote `https://` URL we record it
 * as `remote_media_url` so the replay worker skips the upload step.
 */
export function toInspectionQueuePayload(opts: ToQueuePayloadOptions): SyncQueuePayload {
  const { payload, mediaKind } = opts;
  const localUri =
    mediaKind === "video"
      ? (opts.localVideoUri ?? payload.image_url)
      : (opts.localImageUri ?? payload.image_url);
  const data: InspectionQueuePayload = {
    inspector_id: payload.inspector_id,
    variety_id: payload.variety_id,
    batch_id: payload.batch_id,
    calibration_id: payload.calibration_id,
    local_media_uri: localUri,
    remote_media_url: isLocalUri(payload.image_url) ? null : payload.image_url,
    media_kind: mediaKind,
    total_seeds: payload.total_seeds,
    mean_length_mm: payload.mean_length_mm,
    mean_width_mm: payload.mean_width_mm,
    mean_area_mm2: payload.mean_area_mm2,
    metadata: payload.metadata,
    notes: payload.notes,
    seeds: payload.seeds,
  };
  return { kind: "inspection", data };
}

export function isLocalUri(uri: string): boolean {
  return uri.startsWith("file://") || uri.startsWith("/");
}

function sanitizeSeedsForPersistence(seeds: AnalyzedSeed[]): AnalyzedSeed[] {
  return seeds
    .filter(
      (seed) =>
        isPersistableMeasurement(seed.length_mm, DB_MAX_MM) &&
        isPersistableMeasurement(seed.width_mm, DB_MAX_MM) &&
        isPersistableMeasurement(seed.area_mm2, DB_MAX_AREA_MM2),
    )
    .map((seed) => ({
      ...seed,
      length_mm: roundToScale(seed.length_mm, 3),
      width_mm: roundToScale(seed.width_mm, 3),
      area_mm2: roundToScale(seed.area_mm2, 3),
    }));
}

function summarizeSeedsForPersistence(
  seeds: AnalyzedSeed[],
  fallback: AnalysisSummary,
  originalSeedCount: number,
): AnalysisSummary {
  if (
    seeds.length === originalSeedCount &&
    isPersistableMeasurement(fallback.mean_length_mm, DB_MAX_MM) &&
    isPersistableMeasurement(fallback.mean_width_mm, DB_MAX_MM) &&
    isPersistableMeasurement(fallback.mean_area_mm2, DB_MAX_AREA_MM2)
  ) {
    return {
      total_seeds: Math.max(0, Math.floor(fallback.total_seeds || 0)),
      mean_length_mm: roundToScale(fallback.mean_length_mm, 3),
      mean_width_mm: roundToScale(fallback.mean_width_mm, 3),
      mean_area_mm2: roundToScale(fallback.mean_area_mm2, 3),
    };
  }

  if (seeds.length === 0) {
    return {
      total_seeds: 0,
      mean_length_mm: 0,
      mean_width_mm: 0,
      mean_area_mm2: 0,
    };
  }

  const meanLength = average(seeds.map((seed) => seed.length_mm));
  const meanWidth = average(seeds.map((seed) => seed.width_mm));
  const meanArea = average(seeds.map((seed) => seed.area_mm2));
  const summary = {
    total_seeds: seeds.length,
    mean_length_mm: roundToScale(meanLength, 3),
    mean_width_mm: roundToScale(meanWidth, 3),
    mean_area_mm2: roundToScale(meanArea, 3),
  };

  if (
    isPersistableMeasurement(summary.mean_length_mm, DB_MAX_MM) &&
    isPersistableMeasurement(summary.mean_width_mm, DB_MAX_MM) &&
    isPersistableMeasurement(summary.mean_area_mm2, DB_MAX_AREA_MM2)
  ) {
    return summary;
  }

  return {
    total_seeds: Math.max(0, Math.floor(fallback.total_seeds || 0)),
    mean_length_mm: clampPersistedMeasurement(fallback.mean_length_mm, DB_MAX_MM),
    mean_width_mm: clampPersistedMeasurement(fallback.mean_width_mm, DB_MAX_MM),
    mean_area_mm2: clampPersistedMeasurement(fallback.mean_area_mm2, DB_MAX_AREA_MM2),
  };
}

function withPersistenceSanitizationMetadata(
  metadata: Record<string, unknown> | null,
  originalCount: number,
  persistedCount: number,
): Record<string, unknown> | null {
  if (originalCount === persistedCount) {
    return metadata;
  }
  return {
    ...(metadata ?? {}),
    persistence_sanitization: {
      reason: "db_numeric_range",
      original_seed_count: originalCount,
      persisted_seed_count: persistedCount,
      dropped_seed_count: originalCount - persistedCount,
    },
  };
}

function isPersistableMeasurement(value: number, max: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= max;
}

function clampPersistedMeasurement(value: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return roundToScale(Math.min(value, max), 3);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundToScale(value: number, scale: number): number {
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
}
