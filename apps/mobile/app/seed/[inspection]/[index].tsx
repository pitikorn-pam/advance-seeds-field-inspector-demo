import { useLocalSearchParams } from "expo-router";
import { useInspection, useUpdateSeedGrade } from "@/lib/queries";
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
  const updateGrade = useUpdateSeedGrade();

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const seed = data.seeds.find((s) => s.index === seedIndex) ?? null;
  if (!seed) return <ErrorState />;

  return (
    <SeedDetailView
      seed={seed}
      sourceUri={data.inspection.image_url ?? null}
      busy={updateGrade.isPending}
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
