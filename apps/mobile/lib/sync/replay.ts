import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/lib/supabase";
import { createInspectionRemote, createRecordingRemote } from "@/lib/queries";
import {
  ensureQueueLoaded,
  markQueueEntryFailed,
  removeQueueEntry,
  updateQueueEntry,
} from "@/lib/sync/store";
import { applyRemoteMediaUrl } from "@/lib/sync/payloadUpdates";
import { recordLastSyncedAt } from "@/lib/sync/lastSync";
import { deleteLocalMediaForPayload } from "@/lib/sync/localMedia";
import type { InspectionQueuePayload, SyncQueueEntry } from "@/lib/sync/types";

// Marker error for "the local capture file is gone" so replayEntry can drop
// the queue row instead of leaving a permanently-failed entry the user can't
// recover. Captured photos/videos that landed in iOS `tmp/` can be purged by
// the OS between launches; surfacing the raw NSCocoaError 260 to the user is
// confusing and the entry is unrecoverable anyway.
const MISSING_LOCAL_MEDIA_MARKER = "advance-seeds:missing-local-media";

class MissingLocalMediaError extends Error {
  marker = MISSING_LOCAL_MEDIA_MARKER;
  constructor(uri: string) {
    super(`Local capture file is no longer on the device: ${uri}`);
    this.name = "MissingLocalMediaError";
  }
}

async function localFileExists(uri: string | null | undefined): Promise<boolean> {
  if (!uri) return false;
  // FileSystem only reads file:// URIs; remote URLs and empty strings are
  // not "local" and treated as missing for this check.
  if (!uri.startsWith("file://") && !uri.startsWith("/")) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

let running = false;
let rerunPending = false;

export async function replaySyncQueue(): Promise<void> {
  // Already running: don't start a parallel pass, but guarantee one more
  // sweep after the current finishes. Without this, "Retry all" was a
  // silent no-op whenever the boot-time replay was still walking a slow
  // upload — the freshly-flipped failed→pending entries never got picked up.
  if (running) {
    rerunPending = true;
    return;
  }
  running = true;
  try {
    do {
      rerunPending = false;
      const snapshotIds = (await ensureQueueLoaded()).map((entry) => entry.id);
      for (const id of snapshotIds) {
        const live = (await ensureQueueLoaded()).find((entry) => entry.id === id);
        if (!live) continue;
        if (live.status !== "pending" && live.status !== "failed") continue;
        await replayEntry(live);
      }
    } while (rerunPending);
  } finally {
    running = false;
  }
}

async function replayEntry(entry: SyncQueueEntry) {
  await updateQueueEntry(entry.id, { status: "syncing", lastError: null });
  try {
    if (entry.payload.kind === "inspection") {
      const remoteId = await replayInspection(entry.id, entry.payload.data);
      await updateQueueEntry(entry.id, { status: "synced", remoteId, lastError: null });
      void recordLastSyncedAt();
      // Server now has the canonical copy — release the local file so we
      // don't accumulate captured photos/videos on disk over a long
      // offline-then-online session.
      void deleteLocalMediaForPayload(entry.payload);
      return;
    }
    // Recording branch: upload first, then DB insert. If we already have
    // a `remote_video_url` from a prior partial replay, skip re-upload so
    // a DB-insert-only failure doesn't orphan more storage objects.
    let remoteUrl = entry.payload.data.remote_video_url;
    if (!remoteUrl) {
      // Pre-check the local file. iOS may purge `tmp/` captures between
      // launches; without this, FormData would attempt to read a missing
      // path and surface a confusing native NSCocoaError 260 stack.
      if (!(await localFileExists(entry.payload.data.local_video_uri))) {
        throw new MissingLocalMediaError(entry.payload.data.local_video_uri);
      }
      remoteUrl = await uploadMedia("recordings", entry.payload.data.local_video_uri, "video/mp4");
      // Persist immediately. If `createRecordingRemote` then fails, the
      // next retry sees `remote_video_url` populated and skips upload.
      await updateQueueEntry(entry.id, {
        payload: applyRemoteMediaUrl(entry.payload, remoteUrl),
      });
    }
    const remoteId = await createRecordingRemote({
      inspector_id: entry.payload.data.inspector_id,
      video_url: remoteUrl,
      duration_ms: entry.payload.data.duration_ms,
      notes: entry.payload.data.notes,
      metadata: entry.payload.data.metadata,
    });
    await updateQueueEntry(entry.id, { status: "synced", remoteId, lastError: null });
    void recordLastSyncedAt();
    void deleteLocalMediaForPayload(entry.payload);
  } catch (err) {
    if (err instanceof MissingLocalMediaError) {
      // Unrecoverable: the local file is gone, so retrying will never
      // succeed. Drop the queue row so "Retry all" doesn't keep surfacing
      // the same iOS path error to the user.
      console.warn("[sync] dropping queue entry with missing local media", entry.id);
      await removeQueueEntry(entry.id);
      return;
    }
    await markQueueEntryFailed(entry.id, err);
  }
}

async function replayInspection(entryId: string, payload: InspectionQueuePayload): Promise<string> {
  let imageUrl = payload.remote_media_url;
  if (!imageUrl) {
    // Pre-check the local file (see replayEntry above for context).
    if (!(await localFileExists(payload.local_media_uri))) {
      throw new MissingLocalMediaError(payload.local_media_uri);
    }
    imageUrl = await uploadMedia(
      payload.media_kind === "video" ? "recordings" : "inspection-images",
      payload.local_media_uri,
      payload.media_kind === "video" ? "video/mp4" : "image/jpeg",
    );
    // Persist immediately so a DB-insert failure on the very next call
    // doesn't trigger a duplicate upload on retry. The reload of the
    // entry on the next pass picks up `remote_media_url` and skips the
    // uploadMedia branch.
    await updateQueueEntry(entryId, {
      payload: applyRemoteMediaUrl({ kind: "inspection", data: payload }, imageUrl),
    });
  }
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
