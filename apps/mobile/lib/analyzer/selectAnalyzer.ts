import type { SeedAnalyzer } from "@advance-seeds/types";
import { ClassicalSeedAnalyzer } from "./ClassicalSeedAnalyzer";
import { MockSeedAnalyzer } from "./MockSeedAnalyzer";
import { TfliteSeedAnalyzer } from "./TfliteSeedAnalyzer";

// Resolve the best available analyzer at startup. Order:
//   1. TfliteSeedAnalyzer — preferred when the model file is valid.
//   2. ClassicalSeedAnalyzer — pure-JS CV fallback (Phase 1 analyzer).
//   3. MockSeedAnalyzer — last-resort deterministic fixture for demo.
//
// The chain is intentionally tolerant of a missing/invalid .tflite so a
// dev-client build still boots before a real seed-trained export is dropped
// into apps/mobile/assets/models/.
export async function selectAnalyzer(): Promise<SeedAnalyzer> {
  try {
    const tflite = await TfliteSeedAnalyzer.load();
    console.info("[analyzer] selected tflite-yolo11n");
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
