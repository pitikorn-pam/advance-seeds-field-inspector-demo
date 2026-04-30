import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInspectionSavePayload,
  isLocalUri,
  toInspectionQueuePayload,
} from "./savePayload.mjs";

const SUMMARY = {
  total_seeds: 12,
  mean_length_mm: 7.51,
  mean_width_mm: 2.94,
  mean_area_mm2: 22.34,
};

const SEED = {
  index: 1,
  length_mm: 7.51,
  width_mm: 2.94,
  area_mm2: 22.34,
  grade: "A",
  defects: {},
  bbox: { x: 0, y: 0, width: 10, height: 4 },
};

function baseOptions(overrides = {}) {
  return {
    inspectorId: "u1",
    varietyId: "v1",
    batchId: null,
    calibrationId: null,
    imageUrl: "https://example.com/inspection-images/abc.jpg",
    summary: SUMMARY,
    seeds: [SEED],
    metadata: { capture_media: { url: "https://example.com/inspection-images/abc.jpg" } },
    notes: "  field looks good ",
    ...overrides,
  };
}

test("buildInspectionSavePayload trims notes and folds the summary into top-level fields", () => {
  const payload = buildInspectionSavePayload(baseOptions());
  assert.equal(payload.inspector_id, "u1");
  assert.equal(payload.variety_id, "v1");
  assert.equal(payload.notes, "field looks good"); // trimmed
  assert.equal(payload.total_seeds, SUMMARY.total_seeds);
  assert.equal(payload.mean_length_mm, SUMMARY.mean_length_mm);
  assert.equal(payload.seeds.length, 1);
});

test("buildInspectionSavePayload returns null notes when only whitespace was entered", () => {
  const payload = buildInspectionSavePayload(baseOptions({ notes: "   " }));
  assert.equal(payload.notes, null);
});

test("buildInspectionSavePayload preserves nullable references", () => {
  const payload = buildInspectionSavePayload(
    baseOptions({ batchId: null, calibrationId: null, metadata: null }),
  );
  assert.equal(payload.batch_id, null);
  assert.equal(payload.calibration_id, null);
  assert.equal(payload.metadata, null);
});

test("toInspectionQueuePayload uses the local file URI for the queue's local_media_uri", () => {
  const payload = buildInspectionSavePayload(
    baseOptions({ imageUrl: "file:///var/mobile/Containers/.../local.jpg" }),
  );
  const queue = toInspectionQueuePayload({
    payload,
    mediaKind: "photo",
    localImageUri: "file:///var/mobile/Containers/.../local.jpg",
    localVideoUri: null,
  });
  assert.equal(queue.kind, "inspection");
  assert.equal(queue.data.local_media_uri, "file:///var/mobile/Containers/.../local.jpg");
  // Local URI as image_url => remote_media_url should be null so replay
  // re-uploads from local rather than reusing the placeholder URL.
  assert.equal(queue.data.remote_media_url, null);
});

test("toInspectionQueuePayload preserves a remote URL when the upload already succeeded", () => {
  const payload = buildInspectionSavePayload(baseOptions());
  const queue = toInspectionQueuePayload({
    payload,
    mediaKind: "photo",
    localImageUri: "file:///local.jpg",
    localVideoUri: null,
  });
  // image_url was https → carry through as remote_media_url so the replay
  // worker skips the storage upload step on retry.
  assert.equal(queue.data.remote_media_url, "https://example.com/inspection-images/abc.jpg");
  assert.equal(queue.data.local_media_uri, "file:///local.jpg");
});

test("toInspectionQueuePayload chooses the video URI when mediaKind is video", () => {
  const payload = buildInspectionSavePayload(
    baseOptions({ imageUrl: "https://example.com/recordings/abc.mp4" }),
  );
  const queue = toInspectionQueuePayload({
    payload,
    mediaKind: "video",
    localImageUri: null,
    localVideoUri: "file:///local.mp4",
  });
  assert.equal(queue.data.local_media_uri, "file:///local.mp4");
  assert.equal(queue.data.media_kind, "video");
});

test("toInspectionQueuePayload falls back to image_url when both local URIs are missing", () => {
  const payload = buildInspectionSavePayload(baseOptions({ imageUrl: "file:///fallback.jpg" }));
  const queue = toInspectionQueuePayload({
    payload,
    mediaKind: "photo",
    localImageUri: null,
    localVideoUri: null,
  });
  assert.equal(queue.data.local_media_uri, "file:///fallback.jpg");
});

test("isLocalUri detects file:// and bare absolute paths but not https", () => {
  assert.equal(isLocalUri("file:///var/mobile/x.jpg"), true);
  assert.equal(isLocalUri("/var/mobile/x.jpg"), true);
  assert.equal(isLocalUri("https://cdn.example/x.jpg"), false);
  assert.equal(isLocalUri("content://media/external/0/123"), false);
});
