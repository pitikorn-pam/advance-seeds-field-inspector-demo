import { useSyncExternalStore } from "react";
import type { InstallProgress } from "./modelRegistry";

export type BackgroundModelInstallKind = "firstLaunchDefault" | "autoUpdate";
export type BackgroundModelInstallStatus = "idle" | "installing" | "completed" | "failed";

export interface BackgroundModelInstallState {
  runId: string | null;
  kind: BackgroundModelInstallKind | null;
  status: BackgroundModelInstallStatus;
  candidateId: string | null;
  displayName: string | null;
  versionId: string | null;
  progress: InstallProgress | null;
  error: string | null;
}

const idleState: BackgroundModelInstallState = {
  runId: null,
  kind: null,
  status: "idle",
  candidateId: null,
  displayName: null,
  versionId: null,
  progress: null,
  error: null,
};

let state: BackgroundModelInstallState = idleState;
const subscribers = new Set<() => void>();

export function beginBackgroundModelInstall(args: {
  kind: BackgroundModelInstallKind;
  candidateId: string;
  displayName: string;
  versionId: string | null;
}): string {
  const runId = `${args.kind}:${args.candidateId}:${Date.now()}`;
  state = {
    runId,
    kind: args.kind,
    status: "installing",
    candidateId: args.candidateId,
    displayName: args.displayName,
    versionId: args.versionId,
    progress: { phase: "preparing" },
    error: null,
  };
  emit();
  return runId;
}

export function updateBackgroundModelInstall(runId: string, progress: InstallProgress): void {
  if (state.runId !== runId || state.status !== "installing") return;
  state = { ...state, progress };
  emit();
}

export function completeBackgroundModelInstall(runId: string): void {
  if (state.runId !== runId) return;
  state = { ...state, status: "completed", progress: { phase: "finalizing" }, error: null };
  emit();
}

export function failBackgroundModelInstall(runId: string, error: unknown): void {
  if (state.runId !== runId) return;
  state = {
    ...state,
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
  };
  emit();
}

export function clearBackgroundModelInstall(runId?: string | null): void {
  if (runId && state.runId !== runId) return;
  state = idleState;
  emit();
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function getSnapshot(): BackgroundModelInstallState {
  return state;
}

function emit(): void {
  for (const fn of subscribers) fn();
}

export function useBackgroundModelInstall(): BackgroundModelInstallState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
