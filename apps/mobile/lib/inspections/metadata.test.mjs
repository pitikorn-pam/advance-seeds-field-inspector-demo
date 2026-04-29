import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildInspectionMetadata,
  locationDisplayName,
  readCaptureMetadata,
  readDeviceUsageMetadata,
  readLocationMetadata,
} from "./metadata.ts";

const deviceUsage = {
  device_name: "PPUNGPONG's iPhone Air",
  platform: "ios",
  os_version: "26.4.2",
  app_version: "0.3.0",
  build_version: "1",
  runtime_version: "0.3.0",
};

const capture = {
  mode: "live",
  camera_position: "back",
  flash_mode: "off",
  captured_at: "2026-04-29T09:00:00.000Z",
};

test("buildInspectionMetadata keeps auto-tag intent even when GPS is unavailable", () => {
  assert.deepEqual(
    buildInspectionMetadata({
      roi: null,
      mediaKind: "photo",
      mediaUrl: "https://example.test/capture.jpg",
      recordingId: null,
      recordingDurationMs: null,
      locationTagEnabled: true,
      capturedLocation: null,
      deviceUsage,
      capture,
    }),
    {
      capture_media: {
        kind: "photo",
        url: "https://example.test/capture.jpg",
        recording_id: null,
        duration_ms: null,
      },
      device_usage: deviceUsage,
      capture: {
        ...capture,
        media_kind: "photo",
        roi_kind: null,
      },
      location_capture_enabled: true,
    },
  );
});

test("buildInspectionMetadata includes GPS when available", () => {
  const capturedLocation = {
    latitude: 13.794,
    longitude: 100.632,
    accuracy: 5,
    timestamp: "2026-04-29T09:00:00.000Z",
    address: "Lat Phrao, Bangkok, Thailand",
  };

  assert.deepEqual(
    buildInspectionMetadata({
      roi: null,
      mediaKind: "video",
      mediaUrl: "https://example.test/capture.mp4",
      recordingId: "recording-1",
      recordingDurationMs: 1250,
      locationTagEnabled: true,
      capturedLocation,
      deviceUsage,
      capture: { ...capture, mode: "precise", flash_mode: "on" },
    }),
    {
      capture_media: {
        kind: "video",
        url: "https://example.test/capture.mp4",
        recording_id: "recording-1",
        duration_ms: 1250,
      },
      device_usage: deviceUsage,
      capture: {
        ...capture,
        mode: "precise",
        flash_mode: "on",
        media_kind: "video",
        roi_kind: null,
      },
      location_capture_enabled: true,
      location: capturedLocation,
    },
  );
});

test("metadata readers return location, device usage, and capture detail", () => {
  const metadata = {
    location: {
      latitude: 13.794,
      longitude: 100.632,
      accuracy: 5,
      timestamp: "2026-04-29T09:00:00.000Z",
      address: "Lat Phrao, Bangkok, Thailand",
    },
    device_usage: deviceUsage,
    capture: {
      mode: "live",
      media_kind: "photo",
      camera_position: "back",
      flash_mode: "auto",
      roi_kind: "circle",
      captured_at: "2026-04-29T09:00:00.000Z",
    },
  };

  assert.equal(readLocationMetadata(metadata)?.latitude, 13.794);
  assert.equal(readLocationMetadata(metadata)?.address, "Lat Phrao, Bangkok, Thailand");
  assert.deepEqual(readDeviceUsageMetadata(metadata), deviceUsage);
  assert.deepEqual(readCaptureMetadata(metadata), metadata.capture);
});

test("locationDisplayName prefers reverse-geocoded address", () => {
  assert.equal(
    locationDisplayName({
      latitude: 13.794,
      longitude: 100.632,
      accuracy: 5,
      timestamp: "2026-04-29T09:00:00.000Z",
      address: "Lat Phrao, Bangkok, Thailand",
    }),
    "Lat Phrao, Bangkok, Thailand",
  );
  assert.equal(
    locationDisplayName({
      latitude: 13.794,
      longitude: 100.632,
      accuracy: 5,
      timestamp: "2026-04-29T09:00:00.000Z",
    }),
    "13.7940, 100.6320",
  );
});
