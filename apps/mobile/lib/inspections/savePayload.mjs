// Pure JS mirror of savePayload.ts for `node --test`.

export function buildInspectionSavePayload(opts) {
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

export function toInspectionQueuePayload(opts) {
  const { payload, mediaKind } = opts;
  const localUri =
    mediaKind === "video"
      ? (opts.localVideoUri ?? payload.image_url)
      : (opts.localImageUri ?? payload.image_url);
  const data = {
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

export function isLocalUri(uri) {
  return uri.startsWith("file://") || uri.startsWith("/");
}
