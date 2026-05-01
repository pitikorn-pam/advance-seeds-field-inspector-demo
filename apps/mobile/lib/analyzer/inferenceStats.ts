import { useSyncExternalStore } from "react";

// Per-delegate inference timing collector. Each analyzer (CoreML worklet, Android
// TFLite/NNAPI/GPU/CPU) calls `recordInference(source, ms)` after every successful
// `runSync`/plugin invocation. The hyperparams playground subscribes via
// `useInferenceStats()` and renders rolling p50/p95/p99 + a small histogram so
// QA can see the actual cost of each delegate rather than guessing `targetFps`.
//
// Data is held in plain ring buffers in module state (not React state) so the
// hot inference path doesn't allocate or trigger renders. The hook coalesces
// updates with a tiny throttle so the playground re-renders at most ~5 Hz.

export type InferenceSource =
  | "coreml"
  | "tflite-nnapi"
  | "tflite-android-gpu"
  | "tflite-cpu"
  | "tflite-metal";

const WINDOW = 100;
/** Bucket edges in milliseconds — last bucket is "≥ tail". */
const BUCKET_EDGES_MS = [10, 20, 30, 50, 75, 100, 150, 250];

interface RingBuffer {
  source: InferenceSource;
  values: number[];
  // Total samples ever recorded; useful to know whether a source is "active"
  // even if the ring is short.
  total: number;
}

const buffers = new Map<InferenceSource, RingBuffer>();
const listeners = new Set<() => void>();
let pendingNotify: ReturnType<typeof setTimeout> | null = null;

function scheduleNotify() {
  if (pendingNotify) return;
  // Coalesce notifications so a 30 fps inference stream doesn't render the
  // playground 30 times per second.
  pendingNotify = setTimeout(() => {
    pendingNotify = null;
    snapshotVersion += 1;
    for (const listener of listeners) listener();
  }, 200);
}

let snapshotVersion = 0;

export function recordInference(source: InferenceSource, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  let buffer = buffers.get(source);
  if (!buffer) {
    buffer = { source, values: [], total: 0 };
    buffers.set(source, buffer);
  }
  buffer.values.push(ms);
  if (buffer.values.length > WINDOW) buffer.values.shift();
  buffer.total += 1;
  scheduleNotify();
}

export function resetInferenceStats(): void {
  buffers.clear();
  scheduleNotify();
}

export interface InferenceStat {
  source: InferenceSource;
  count: number;
  total: number;
  p50: number;
  p95: number;
  p99: number;
  /** One value per bucket from BUCKET_EDGES_MS plus a final "tail" bucket. */
  buckets: number[];
  bucketEdgesMs: number[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function summarize(buffer: RingBuffer): InferenceStat {
  const sorted = [...buffer.values].sort((a, b) => a - b);
  const buckets = new Array(BUCKET_EDGES_MS.length + 1).fill(0);
  for (const v of buffer.values) {
    let placed = false;
    for (let i = 0; i < BUCKET_EDGES_MS.length; i += 1) {
      if (v < BUCKET_EDGES_MS[i]) {
        buckets[i] += 1;
        placed = true;
        break;
      }
    }
    if (!placed) buckets[BUCKET_EDGES_MS.length] += 1;
  }
  return {
    source: buffer.source,
    count: buffer.values.length,
    total: buffer.total,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    buckets,
    bucketEdgesMs: BUCKET_EDGES_MS,
  };
}

let cachedStats: InferenceStat[] = [];
let cachedVersion = -1;

function snapshot(): InferenceStat[] {
  if (cachedVersion === snapshotVersion) return cachedStats;
  cachedVersion = snapshotVersion;
  cachedStats = Array.from(buffers.values()).map(summarize);
  return cachedStats;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useInferenceStats(): InferenceStat[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
