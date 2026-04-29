import { supabase } from "@/lib/supabase";
import { createInspectionRemote, createRecordingRemote } from "@/lib/queries";
import { ensureQueueLoaded, markQueueEntryFailed, updateQueueEntry } from "@/lib/sync/store";
import type { InspectionQueuePayload, SyncQueueEntry } from "@/lib/sync/types";

let running = false;

export async function replaySyncQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const entries = await ensureQueueLoaded();
    for (const entry of entries) {
      if (entry.status !== "pending" && entry.status !== "failed") continue;
      await replayEntry(entry);
    }
  } finally {
    running = false;
  }
}

async function replayEntry(entry: SyncQueueEntry) {
  await updateQueueEntry(entry.id, { status: "syncing", lastError: null });
  try {
    if (entry.payload.kind === "inspection") {
      const remoteId = await replayInspection(entry.payload.data);
      await updateQueueEntry(entry.id, { status: "synced", remoteId, lastError: null });
      return;
    }
    const remoteUrl =
      entry.payload.data.remote_video_url ??
      (await uploadMedia("recordings", entry.payload.data.local_video_uri, "video/mp4"));
    const remoteId = await createRecordingRemote({
      inspector_id: entry.payload.data.inspector_id,
      video_url: remoteUrl,
      duration_ms: entry.payload.data.duration_ms,
      notes: entry.payload.data.notes,
      metadata: entry.payload.data.metadata,
    });
    await updateQueueEntry(entry.id, { status: "synced", remoteId, lastError: null });
  } catch (err) {
    await markQueueEntryFailed(entry.id, err);
  }
}

async function replayInspection(payload: InspectionQueuePayload): Promise<string> {
  const imageUrl =
    payload.remote_media_url ??
    (await uploadMedia(
      payload.media_kind === "video" ? "recordings" : "inspection-images",
      payload.local_media_uri,
      payload.media_kind === "video" ? "video/mp4" : "image/jpeg",
    ));
  const metadata = replaceCaptureMediaUrl(payload.metadata, imageUrl);
  return createInspectionRemote({
    inspector_id: payload.inspector_id,
    variety_id: payload.variety_id,
    batch_id: payload.batch_id,
    calibration_id: payload.calibration_id,
    image_url: imageUrl,
    total_seeds: payload.total_seeds,
    mean_length_mm: payload.mean_length_mm,
    mean_width_mm: payload.mean_width_mm,
    mean_area_mm2: payload.mean_area_mm2,
    metadata,
    notes: payload.notes,
    seeds: payload.seeds,
  });
}

async function uploadMedia(bucket: "inspection-images" | "recordings", uri: string, type: string) {
  const ext = type === "video/mp4" ? "mp4" : "jpg";
  const path = `offline/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const fd = new FormData();
  fd.append("file", {
    uri,
    type,
    name: `capture.${ext}`,
  } as unknown as Blob);
  const { error } = await supabase.storage.from(bucket).upload(path, fd, {
    contentType: type,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function replaceCaptureMediaUrl(metadata: Record<string, unknown> | null, url: string) {
  if (!metadata) return metadata;
  const copy = JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
  const media = copy.capture_media;
  if (media && typeof media === "object") {
    (media as Record<string, unknown>).url = url;
  }
  return copy;
}
