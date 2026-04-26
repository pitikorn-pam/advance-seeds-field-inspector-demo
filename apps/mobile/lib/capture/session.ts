import { useSyncExternalStore } from "react";

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

interface CaptureSessionState {
  varietyId: string | null;
  batchId: string | null;
  calibrationId: string | null;
  mode: CaptureMode;
  /** Local file URI of the most recent capture (set by scan/precise). */
  capturedImageUri: string | null;
  /** Public URL once the captured frame uploads to Supabase Storage. */
  uploadedImageUrl: string | null;
}

const initial: CaptureSessionState = {
  varietyId: null,
  batchId: null,
  calibrationId: null,
  mode: "live",
  capturedImageUri: null,
  uploadedImageUrl: null,
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
    reset() {
      state = { ...initial };
      emit();
    },
  };
}
