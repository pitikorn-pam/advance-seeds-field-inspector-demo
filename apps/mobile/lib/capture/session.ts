import { useSyncExternalStore } from "react";
import type { AnalysisResult, CalibrationReading } from "@advance-seeds/types";
import type { Roi } from "./roi";
import type { CapturedLocation } from "./location";

/**
 * Cross-screen capture session.
 *
 * State that the user assembles in /capture/setup and that the rest of the
 * /capture flow consumes (scan / precise / processing / review). Lives outside
 * React state because Expo Router screens unmount when pushed away — we don't
 * want to round-trip everything via params for every transition.
 *
 * Backed by a tiny in-memory store with a useSyncExternalStore hook so React
 * components re-render when fields change. No persistence: a session is
 * per-app-launch — backgrounding for hours and returning starts fresh, which
 * matches the prototype's behaviour ("each session is its own attempt").
 */

export type CaptureMode = "live" | "precise";
export type CaptureMediaKind = "photo" | "video";
export type CaptureCameraPosition = "back" | "front";
export type CaptureFlashMode = "off" | "auto" | "on";

interface CaptureSessionState {
  varietyId: string | null;
  batchId: string | null;
  calibrationId: string | null;
  mode: CaptureMode;
  /** Free-form notes captured at setup time. Persisted on the inspection. */
  notes: string;
  /**
   * UI-only flag for the auto-tag location toggle on /capture/setup.
   * Real geolocation capture lands when expo-location is wired; for now
   * the value is stashed into inspection.metadata.location_capture_enabled
   * so the intent is on the record.
   */
  locationTagEnabled: boolean;
  /** Local file URI of the most recent capture (set by scan/precise). */
  capturedImageUri: string | null;
  /** Local file URI of the most recent recording. */
  capturedVideoUri: string | null;
  /** Current capture artifact type. */
  capturedMediaKind: CaptureMediaKind;
  /** Camera settings used for the current capture artifact. */
  cameraPosition: CaptureCameraPosition | null;
  flashMode: CaptureFlashMode | null;
  capturedAt: string | null;
  /** Calibration reading used at capture time, frozen for processing/review traceability. */
  capturedCalibrationReading: CalibrationReading | null;
  /** Selected profile name at capture time; persisted with calibration metadata. */
  capturedCalibrationProfileName: string | null;
  /** Recording duration for video captures. */
  recordingDurationMs: number | null;
  /** Linked recordings row once video upload completes. */
  recordingId: string | null;
  /**
   * Public URL of the inspection's still image once uploaded. For photo
   * captures this is the photo itself; for video captures this is a JPG
   * thumbnail extracted from the recording. The inspection's `image_url`
   * column is always a JPG so the seed-detail page can decode it as an
   * image and crop per-seed bounding boxes from it.
   */
  uploadedImageUrl: string | null;
  /**
   * Public URL of the recording's video, only set for video captures.
   * Tracked separately from `uploadedImageUrl` because the inspection's
   * `image_url` must be a JPG (see above) — but the metadata's
   * `capture_media.url` still needs to reference the actual mp4 so the
   * inspection detail page can play the recording.
   */
  uploadedVideoUrl: string | null;
  /** Analyzer output consumed by review after the processing route unmounts. */
  analysisResult: AnalysisResult | null;
  /**
   * Active region-of-interest (Phase 6b). Null when the user hasn't drawn
   * one — KPI strip shows full-frame counts in that case. Lives on the
   * session so it survives a scan ⇄ precise mode toggle within the same
   * capture attempt; cleared by `session.reset()` after save (task 6b.9).
   */
  roi: Roi | null;
  /**
   * GPS reading captured when `locationTagEnabled` is true. Stashed here
   * because the moment of capture (live snapshot, precise photo, recording
   * start) is upstream of the inspection-save site (review.tsx). Persists
   * onto inspection.metadata.location at save time; cleared by reset().
   */
  capturedLocation: CapturedLocation | null;
}

const initial: CaptureSessionState = {
  varietyId: null,
  batchId: null,
  calibrationId: null,
  mode: "live",
  notes: "",
  locationTagEnabled: true,
  capturedImageUri: null,
  capturedVideoUri: null,
  capturedMediaKind: "photo",
  cameraPosition: null,
  flashMode: null,
  capturedAt: null,
  capturedCalibrationReading: null,
  capturedCalibrationProfileName: null,
  recordingDurationMs: null,
  recordingId: null,
  uploadedImageUrl: null,
  uploadedVideoUrl: null,
  analysisResult: null,
  roi: null,
  capturedLocation: null,
};

let state: CaptureSessionState = { ...initial };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useCaptureSession() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...snap,
    set(patch: Partial<CaptureSessionState>) {
      state = { ...state, ...patch };
      emit();
    },
    reset(patch: Partial<CaptureSessionState> = {}) {
      state = { ...initial, ...patch };
      emit();
    },
  };
}
