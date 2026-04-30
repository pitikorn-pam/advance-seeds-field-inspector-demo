// Pure JS mirror of payloadUpdates.ts for `node --test`.

export function applyRemoteMediaUrl(payload, url) {
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

export function getRemoteMediaUrl(payload) {
  if (payload.kind === "inspection") return payload.data.remote_media_url;
  return payload.data.remote_video_url;
}
