import type { Seed } from "@advance-seeds/types";

export type SyncQueueStatus = "pending" | "syncing" | "failed" | "synced" | "cancelled";

export interface InspectionQueuePayload {
  inspector_id: string;
  variety_id: string;
  batch_id: string | null;
  calibration_id: string | null;
  local_media_uri: string;
  remote_media_url: string | null;
  media_kind: "photo" | "video";
  total_seeds: number;
  mean_length_mm: number;
  mean_width_mm: number;
  mean_area_mm2: number;
  metadata: Record<string, unknown> | null;
  notes: string | null;
  seeds: {
    index: number;
    length_mm: number;
    width_mm: number;
    area_mm2: number;
    grade: Seed["grade"];
    defects: Seed["defects"];
    bbox: Seed["bbox"];
  }[];
}

export interface RecordingQueuePayload {
  inspector_id: string;
  local_video_uri: string;
  remote_video_url: string | null;
  duration_ms: number;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type SyncQueuePayload =
  | { kind: "inspection"; data: InspectionQueuePayload }
  | { kind: "recording"; data: RecordingQueuePayload };

export interface SyncQueueEntry {
  id: string;
  status: SyncQueueStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  remoteId: string | null;
  payload: SyncQueuePayload;
}
