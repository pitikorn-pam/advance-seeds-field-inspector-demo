import * as FileSystem from "expo-file-system/legacy";
import type { SyncQueuePayload } from "./types";

// Local media lifecycle for queued captures:
//   - retained while a queue entry is pending / syncing / failed so the
//     replay worker can re-upload from disk;
//   - deleted once the entry hits `synced` (server has a copy);
//   - deleted on explicit user discard (cancel-and-remove).
//
// `expo-file-system` deleteAsync's `idempotent: true` swallows
// "doesn't exist" errors, so calling this on an already-cleaned URI is
// a no-op.

export async function deleteLocalMediaFile(uri: string | null | undefined): Promise<void> {
  if (!uri) return;
  if (!uri.startsWith("file://") && !uri.startsWith("/")) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (err) {
    // Best-effort cleanup; never block the sync flow on a delete error.
    console.warn("[sync] failed to delete local media", uri, err);
  }
}

/** Convenience wrapper that picks the right local URI per payload kind. */
export async function deleteLocalMediaForPayload(payload: SyncQueuePayload): Promise<void> {
  const uri =
    payload.kind === "inspection" ? payload.data.local_media_uri : payload.data.local_video_uri;
  await deleteLocalMediaFile(uri);
}
