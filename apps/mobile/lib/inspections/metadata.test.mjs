import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildInspectionMetadata,
  readAnalysisDiagnosticsMetadata,
  locationDisplayName,
  readCaptureMetadata,
  readCalibrationMetadata,
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

const analysisDiagnostics = {
  live_seed_count: 11,
  analyze_seed_count: 12,
  live_frame_width: 1920,
  live_frame_height: 1080,
  live_frame_orientation: "right",
  analyzed_image_width: 1280,
  analyzed_image_height: 960,
  captured_image_orientation: "portrait",
  analyzed_image_orientation: "up",
  used_live_frame_fallback: false,
  calibration_fallback_used: false,
  calibration_source_used: "lidar",
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
      calibration: {
        pxPerMm: 41.2,
        source: "manual",
        confidence: 1,
        observedAtMs: 1777453200000,
        profileId: "cal-1",
        profileName: "Lab card",
      },
      capture,
      analysisDiagnostics,
    }),
    {
      calibration: {
        px_per_mm: 41.2,
        source: "manual",
        confidence: 1,
        observed_at_ms: 1777453200000,
        profile_id: "cal-1",
        profile_name: "Lab card",
      },
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
      analysis_diagnostics: analysisDiagnostics,
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
      calibration: null,
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
    calibration: {
      px_per_mm: 41.2,
      source: "manual",
      confidence: 1,
      observed_at_ms: 1777453200000,
      profile_id: "cal-1",
      profile_name: "Lab card",
    },
    capture: {
      mode: "live",
      media_kind: "photo",
      camera_position: "back",
      flash_mode: "auto",
      roi_kind: "circle",
      captured_at: "2026-04-29T09:00:00.000Z",
    },
    analysis_diagnostics: analysisDiagnostics,
  };

  assert.equal(readLocationMetadata(metadata)?.latitude, 13.794);
  assert.equal(readLocationMetadata(metadata)?.address, "Lat Phrao, Bangkok, Thailand");
  assert.deepEqual(readDeviceUsageMetadata(metadata), deviceUsage);
  assert.deepEqual(readCaptureMetadata(metadata), metadata.capture);
  assert.deepEqual(readCalibrationMetadata(metadata), metadata.calibration);
  assert.deepEqual(readAnalysisDiagnosticsMetadata(metadata), analysisDiagnostics);
});

test("analysis diagnostics marks default calibration fallback explicitly", () => {
  const metadata = {
    analysis_diagnostics: {
      ...analysisDiagnostics,
      live_seed_count: null,
      calibration_fallback_used: true,
      calibration_source_used: "default",
    },
  };

  const diagnostics = readAnalysisDiagnosticsMetadata(metadata);
  assert.equal(diagnostics.live_seed_count, null);
  assert.equal(diagnostics.calibration_fallback_used, true);
  assert.equal(diagnostics.calibration_source_used, "default");
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
