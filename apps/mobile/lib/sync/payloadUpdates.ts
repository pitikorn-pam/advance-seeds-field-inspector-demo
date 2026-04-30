// Pure projections that update a `SyncQueuePayload` mid-flight.
// Used by `replay.ts` to checkpoint progress between the upload step and the
// DB-insert step so a network failure between the two doesn't cause the
// next retry to re-upload (and orphan a Storage object).
//
// Mirrored in `payloadUpdates.mjs` for `node --test`.

import type { SyncQueuePayload } from "./types";

/**
 * Returns a copy of `payload` with the appropriate remote-media URL
 * field set, depending on whether it's an inspection (`remote_media_url`)
 * or a recording (`remote_video_url`).
 */
export function applyRemoteMediaUrl(payload: SyncQueuePayload, url: string): SyncQueuePayload {
  if (payload.kind === "inspection") {
    return {
      ...payload,
      data: { ...payload.data, remote_media_url: url },
    };
  }
  return {
    ...payload,
    data: { ...payload.data, remote_video_url: url },
  };
}

/** Reads the appropriate already-uploaded URL for the payload kind. */
export function getRemoteMediaUrl(payload: SyncQueuePayload): string | null {
  if (payload.kind === "inspection") return payload.data.remote_media_url;
  return payload.data.remote_video_url;
}
