import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { AppState } from "react-native";
import type { Camera } from "react-native-vision-camera";

/**
 * Hard cap on a single recording. ~60s at vision-camera's default h264 high
 * bitrate (~5 Mbps) lands at ~37 MB; well under the 100 MB upload guard
 * (task 7b.8). Caps that should be configurable end up on the capture
 * session in a follow-up.
 */
export const MAX_RECORDING_MS = 60_000;
/** Auto-stop after the app spends this long backgrounded mid-recording. */
const BACKGROUND_AUTO_STOP_MS = 2_000;

interface RecordingResult {
  uri: string;
  durationMs: number;
}

interface Options {
  onRecordingFinished?: (result: RecordingResult) => void;
  onRecordingError?: (err: Error) => void;
}

/**
 * Hook wrapping vision-camera's recording API in idiomatic React state.
 *
 * Owns three things the screen layer doesn't want to:
 *   • A `durationMs` ticker that updates ~10×/s while recording so the
 *     timer overlay re-renders smoothly.
 *   • A hard cap (`MAX_RECORDING_MS`) that auto-stops the recording so
 *     local files never grow past the upload guard.
 *   • An `AppState` listener that auto-stops if the app is backgrounded
 *     for 2+ seconds — Vision Camera will continue recording in the
 *     background otherwise, and silently producing a multi-minute file
 *     while the user is in another app is bad behaviour.
 *
 * Result is event-driven (callbacks in `options`) rather than promise-
 * returning because Vision Camera's `startRecording` already takes
 * `onRecordingFinished` / `onRecordingError`; promises would just wrap
 * those callbacks and swallow context.
 */
export function useRecordingState(camera: RefObject<Camera | null>, options: Options = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable refs to the latest callbacks so the start() closure doesn't
  // need to re-bind on every render.
  const optsRef = useRef(options);
  optsRef.current = options;

  const start = useCallback(() => {
    if (!camera.current || isRecording) return;
    startedAtRef.current = Date.now();
    setDurationMs(0);
    setIsRecording(true);

    camera.current.startRecording({
      // h264 / mp4 / hi-res are vision-camera defaults; explicit for clarity.
      fileType: "mp4",
      videoCodec: "h264",
      onRecordingFinished: (video) => {
        const ended = Date.now();
        const duration = startedAtRef.current ? ended - startedAtRef.current : 0;
        startedAtRef.current = null;
        setIsRecording(false);
        const uri = video.path.startsWith("file://") ? video.path : `file://${video.path}`;
        optsRef.current.onRecordingFinished?.({ uri, durationMs: duration });
      },
      onRecordingError: (err) => {
        startedAtRef.current = null;
        setIsRecording(false);
        const e = err instanceof Error ? err : new Error(String(err));
        optsRef.current.onRecordingError?.(e);
      },
    });
  }, [camera, isRecording]);

  const stop = useCallback(() => {
    if (!camera.current || !isRecording) return;
    try {
      camera.current.stopRecording();
    } catch (err) {
      // stopRecording can throw if the recording already finished; that's
      // fine — the finished callback will deliver the result anyway.
      console.warn("[recording] stopRecording threw", err);
    }
  }, [camera, isRecording]);

  // Duration ticker — 10 Hz is enough for an MM:SS display without burning
  // CPU. Cleanup on stop or unmount.
  useEffect(() => {
    if (!isRecording) {
      if (tickerRef.current) clearInterval(tickerRef.current);
      tickerRef.current = null;
      return;
    }
    tickerRef.current = setInterval(() => {
      if (startedAtRef.current) {
        setDurationMs(Date.now() - startedAtRef.current);
      }
    }, 100);
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
      tickerRef.current = null;
    };
  }, [isRecording]);

  // Hard cap: auto-stop at MAX_RECORDING_MS so the local file stays under
  // the 100 MB upload guard at typical h264 bitrates.
  useEffect(() => {
    if (!isRecording) return;
    const cap = setTimeout(() => {
      camera.current?.stopRecording();
    }, MAX_RECORDING_MS);
    return () => clearTimeout(cap);
  }, [isRecording, camera]);

  // App-backgrounded auto-stop (task 7b.9). Don't stop on the first state
  // change — give the user 2 s to come back, e.g. notification-shade peek.
  useEffect(() => {
    if (!isRecording) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        timeoutId = setTimeout(() => {
          camera.current?.stopRecording();
        }, BACKGROUND_AUTO_STOP_MS);
      } else if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    });
    return () => {
      sub.remove();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isRecording, camera]);

  return { isRecording, durationMs, start, stop };
}
