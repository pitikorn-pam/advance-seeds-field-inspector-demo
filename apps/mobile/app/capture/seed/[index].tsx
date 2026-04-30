import { useLocalSearchParams } from "expo-router";
import type { SeedGrade } from "@advance-seeds/types";
import { useCaptureSession } from "@/lib/capture/session";
import { ErrorState } from "@/components/ui/States";
import { SeedDetailView } from "@/components/inspections/SeedDetailView";

/**
 * Per-seed detail for the IN-PROGRESS capture session.
 *
 * Edit grade / Reject mutate `session.analysisResult` in place — the
 * inspection isn't saved yet, so the change lives on the session until
 * the user taps Save and Sync (which writes the grade as part of the
 * seed insert payload). When the inspection later saves, the persisted
 * row carries the user-corrected grade.
 */
export default function CaptureSeedDetail() {
  const params = useLocalSearchParams<{ index: string }>();
  const session = useCaptureSession();
  const result = session.analysisResult;
  const seedIndex = Number(params.index);

  const seed = result?.seeds.find((s) => s.index === seedIndex) ?? null;
  if (!result || !seed) return <ErrorState />;

  const sourceUri =
    session.capturedImageUri ?? session.uploadedImageUrl ?? session.capturedVideoUri ?? null;

  const onUpdateGrade = (grade: SeedGrade) => {
    if (!result) return;
    const nextSeeds = result.seeds.map((s) => (s.index === seed.index ? { ...s, grade } : s));
    session.set({
      analysisResult: { ...result, seeds: nextSeeds },
    });
  };

  return <SeedDetailView seed={seed} sourceUri={sourceUri} onUpdateGrade={onUpdateGrade} />;
}
