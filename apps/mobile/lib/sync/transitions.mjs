// Pure mirror of transitions.ts for `node --test`. Mirrors the existing
// `ClassicalSeedAnalyzerCore.{ts,mjs}` dual-file pattern used elsewhere in
// the repo: TS for the app bundle, .mjs for node-side tests so AsyncStorage
// (and other native-only deps) don't get pulled in. Keep the two files
// in lock-step; CI runs node --test against the .mjs.

const defaultClock = {
  now: () => new Date().toISOString(),
  id: () => `queue-${Date.now()}-${Math.random().toString(36).slice(2)}`,
};

export function applyAdd(current, payload, clock = defaultClock) {
  const now = clock.now();
  const entry = {
    id: clock.id(),
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    lastError: null,
    remoteId: null,
    payload,
  };
  return { next: [entry, ...current], entry };
}

export function applyUpdate(current, id, patch, clock = defaultClock) {
  const now = clock.now();
  return current.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: now } : entry));
}

export function applyRemove(current, id) {
  return current.filter((entry) => entry.id !== id);
}

export function applyClearFailed(current) {
  return current.filter((entry) => entry.status !== "failed");
}

export function applyRetryAllFailed(current, clock = defaultClock) {
  const now = clock.now();
  return current.map((entry) =>
    entry.status === "failed" || entry.status === "syncing"
      ? { ...entry, status: "pending", lastError: null, updatedAt: now }
      : entry,
  );
}

export function applyMarkFailed(current, id, error, clock = defaultClock) {
  const message = syncErrorMessage(error);
  const now = clock.now();
  return current.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          status: "failed",
          attempts: entry.attempts + 1,
          lastError: message,
          updatedAt: now,
        }
      : entry,
  );
}

export function syncErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    for (const key of ["message", "error_description", "details", "hint"]) {
      const value = error[key];
      if (typeof value === "string" && value.trim().length > 0) return value;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}
