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
  return {
    inspector_id: opts.inspectorId,
    variety_id: opts.varietyId,
    batch_id: opts.batchId,
    calibration_id: opts.calibrationId,
    image_url: opts.imageUrl,
    total_seeds: opts.summary.total_seeds,
    mean_length_mm: opts.summary.mean_length_mm,
    mean_width_mm: opts.summary.mean_width_mm,
    mean_area_mm2: opts.summary.mean_area_mm2,
    seeds: opts.seeds,
    metadata: opts.metadata,
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
