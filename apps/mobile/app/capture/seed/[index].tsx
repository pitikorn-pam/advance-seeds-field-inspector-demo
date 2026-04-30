import { useLocalSearchParams } from "expo-router";
import { useCaptureSession } from "@/lib/capture/session";
import { ErrorState } from "@/components/ui/States";
import { SeedDetailView } from "@/components/inspections/SeedDetailView";

/**
 * Per-seed detail for the IN-PROGRESS capture session.
 *
 * Route: /capture/seed/[index] — pushed from the inspection-result
 * (review) screen so the user can drill into a specific detected seed
 * BEFORE saving. Reads from `useCaptureSession`'s in-memory analysis
 * result; once the inspection is saved, the equivalent path becomes
 * `/seed/[inspection]/[index]`. Both routes render the same
 * `SeedDetailView`.
 */
export default function CaptureSeedDetail() {
  const params = useLocalSearchParams<{ index: string }>();
  const session = useCaptureSession();
  const result = session.analysisResult;
  const seedIndex = Number(params.index);

  const seed = result?.seeds.find((s) => s.index === seedIndex) ?? null;
  if (!result || !seed) return <ErrorState />;

  // The capture session keeps both a local file URI and the post-upload
  // remote URL. Prefer local for instant decode in the hero crop;
  // fall back to whatever's available.
  const sourceUri =
    session.capturedImageUri ?? session.uploadedImageUrl ?? session.capturedVideoUri ?? null;

  return <SeedDetailView seed={seed} sourceUri={sourceUri} />;
}
