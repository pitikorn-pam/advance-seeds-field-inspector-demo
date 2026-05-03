import { useSyncExternalStore } from "react";
import type { ResolveDefaultModelResult } from "./registryService";

export type ModelUpdateAvailable = Extract<ResolveDefaultModelResult, { action: "update" }>;

type State = {
  available: ModelUpdateAvailable | null;
  dismissedVersionId: string | null;
};

let state: State = { available: null, dismissedVersionId: null };
const subscribers = new Set<() => void>();

function emit(): void {
  for (const fn of subscribers) fn();
}

export function publishResolveResult(result: ResolveDefaultModelResult | null): void {
  const next = result && result.action === "update" ? result : null;
  if (next?.version_id === state.available?.version_id) return;
  state = { ...state, available: next };
  emit();
}

export function dismissUpdate(versionId: string): void {
  state = { ...state, dismissedVersionId: versionId };
  emit();
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function getSnapshot(): State {
  return state;
}

export function useModelUpdate(): ModelUpdateAvailable | null {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!snapshot.available) return null;
  if (snapshot.available.version_id === snapshot.dismissedVersionId) return null;
  return snapshot.available;
}
