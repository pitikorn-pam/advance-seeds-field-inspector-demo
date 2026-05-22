import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { useInspection, useUpdateSeedGrade, useVarieties } from "@/lib/queries";
import { availableGradesForVariety } from "@/lib/grading/palette";
import { readSeedAnnotationMetadata } from "@/lib/inspections/metadata";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { SeedDetailView } from "@/components/inspections/SeedDetailView";

/**
 * Per-seed detail for a SAVED inspection. Edit grade / Reject write
 * through `useUpdateSeedGrade` to Supabase; React Query invalidates the
 * parent inspection detail so the change shows up everywhere on the
 * next render.
 */
export default function SavedSeedDetail() {
  const params = useLocalSearchParams<{ inspection: string; index: string }>();
  const inspectionId = params.inspection;
  const seedIndex = Number(params.index);

  const { data, isLoading, isError, refetch } = useInspection(inspectionId);
  const varieties = useVarieties();
  const updateGrade = useUpdateSeedGrade();

  const variety = useMemo(
    () => varieties.data?.find((v) => v.id === data?.inspection.variety_id) ?? null,
    [varieties.data, data?.inspection.variety_id],
  );
  const availableGrades = useMemo(() => availableGradesForVariety(variety), [variety]);

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const seedAnnotation = readSeedAnnotationMetadata(
    (data.inspection as { metadata?: unknown }).metadata,
  ).get(seedIndex);
  const seedRow = data.seeds.find((s) => s.index === seedIndex) ?? null;
  const seed = seedRow
    ? {
        ...seedRow,
        label: seedAnnotation?.label ?? variety?.name ?? null,
        ...(typeof seedAnnotation?.volume_ml === "number"
          ? { volume_ml: seedAnnotation.volume_ml }
          : {}),
        ...(seedAnnotation?.mask ? { mask: seedAnnotation.mask } : {}),
      }
    : null;
  if (!seed) return <ErrorState />;

  return (
    <SeedDetailView
      seed={seed}
      sourceUri={data.inspection.image_url ?? null}
      busy={updateGrade.isPending}
      availableGrades={availableGrades}
      onUpdateGrade={(grade) =>
        updateGrade.mutateAsync({
          inspectionId: data.inspection.id,
          seedId: seed.id,
          grade,
        })
      }
    />
  );
}
