import type { ModelCandidate } from "./types";

export function pickFirstLaunchDefaultCandidate(
  candidates: readonly ModelCandidate[],
): ModelCandidate | null {
  return candidates.find((candidate) => isFirstLaunchDefaultCandidate(candidate)) ?? null;
}

function isFirstLaunchDefaultCandidate(candidate: ModelCandidate): boolean {
  return candidate.supported && candidate.channel === "production" && candidate.isDefault === true;
}
