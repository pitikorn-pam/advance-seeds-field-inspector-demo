import type { SeedAnalyzer } from "@advance-seeds/types";
import { Platform } from "react-native";
import { ClassicalSeedAnalyzer } from "./ClassicalSeedAnalyzer";
import { CoreMLSeedAnalyzer } from "./CoreMLSeedAnalyzer";
import { MockSeedAnalyzer } from "./MockSeedAnalyzer";
import { TfliteSeedAnalyzer } from "./TfliteSeedAnalyzer";

// Resolve the best available analyzer at startup. Per-platform priority:
//   iOS:     CoreMLSeedAnalyzer  → TfliteSeedAnalyzer → ClassicalSeedAnalyzer → Mock.
//   Android: TfliteSeedAnalyzer  → ClassicalSeedAnalyzer → Mock.
//
// The chain stays tolerant of a missing/invalid model file so a dev-client
// build boots even if a model artifact hasn't been bundled yet.
export async function selectAnalyzer(): Promise<SeedAnalyzer> {
  if (Platform.OS === "ios") {
    try {
      const coreml = await CoreMLSeedAnalyzer.load();
      console.info("[analyzer] selected coreml-yolo");
      // Log active model hint for diagnostics
      try {
        const { readActiveModel } = await import("@/lib/models/modelStore");
        const active = await readActiveModel();
        if (active)
          console.info(`[analyzer] coreml active model=${active.id} status=${active.status}`);
      } catch {
        // ignore logging errors
      }
      return coreml;
    } catch (err) {
      console.warn("[analyzer] coreml unavailable; falling back to tflite", err);
    }
  }
  try {
    const tflite = await TfliteSeedAnalyzer.load();
    console.info("[analyzer] selected tflite-yolo");
    try {
      const { readActiveModel } = await import("@/lib/models/modelStore");
      const active = await readActiveModel();
      if (active)
        console.info(`[analyzer] tflite active model=${active.id} status=${active.status}`);
    } catch {
      // ignore logging errors
    }
    return tflite;
  } catch (err) {
    console.warn("[analyzer] tflite unavailable; falling back to classical", err);
  }
  try {
    const classical = new ClassicalSeedAnalyzer();
    console.info("[analyzer] selected classical-cv-v1");
    return classical;
  } catch (err) {
    console.warn("[analyzer] classical unavailable; falling back to mock", err);
  }
  console.info("[analyzer] selected mock");
  return new MockSeedAnalyzer();
}
