import test from "node:test";
import assert from "node:assert/strict";

import { applyRemoteMediaUrl, getRemoteMediaUrl } from "./payloadUpdates.mjs";

const inspectionPayload = {
  kind: "inspection",
  data: {
    inspector_id: "u1",
    variety_id: "v1",
    batch_id: null,
    calibration_id: null,
    local_media_uri: "file:///local.jpg",
    remote_media_url: null,
    media_kind: "photo",
    total_seeds: 0,
    mean_length_mm: 0,
    mean_width_mm: 0,
    mean_area_mm2: 0,
    metadata: null,
    notes: null,
    seeds: [],
  },
};

const recordingPayload = {
  kind: "recording",
  data: {
    inspector_id: "u1",
    local_video_uri: "file:///local.mp4",
    remote_video_url: null,
    duration_ms: 4200,
  },
};

test("applyRemoteMediaUrl writes remote_media_url for inspection payloads", () => {
  const next = applyRemoteMediaUrl(inspectionPayload, "https://cdn/x.jpg");
  assert.equal(next.kind, "inspection");
  assert.equal(next.data.remote_media_url, "https://cdn/x.jpg");
  // Original is untouched.
  assert.equal(inspectionPayload.data.remote_media_url, null);
});

test("applyRemoteMediaUrl writes remote_video_url for recording payloads", () => {
  const next = applyRemoteMediaUrl(recordingPayload, "https://cdn/x.mp4");
  assert.equal(next.kind, "recording");
  assert.equal(next.data.remote_video_url, "https://cdn/x.mp4");
  // Original is untouched.
  assert.equal(recordingPayload.data.remote_video_url, null);
});

test("applyRemoteMediaUrl preserves all other fields", () => {
  const next = applyRemoteMediaUrl(inspectionPayload, "https://cdn/x.jpg");
  assert.equal(next.data.inspector_id, "u1");
  assert.equal(next.data.local_media_uri, "file:///local.jpg");
  assert.equal(next.data.media_kind, "photo");
});

test("getRemoteMediaUrl reads the right field per kind", () => {
  assert.equal(getRemoteMediaUrl(inspectionPayload), null);
  assert.equal(getRemoteMediaUrl(recordingPayload), null);
  assert.equal(
    getRemoteMediaUrl(applyRemoteMediaUrl(inspectionPayload, "https://cdn/x.jpg")),
    "https://cdn/x.jpg",
  );
  assert.equal(
    getRemoteMediaUrl(applyRemoteMediaUrl(recordingPayload, "https://cdn/x.mp4")),
    "https://cdn/x.mp4",
  );
});
