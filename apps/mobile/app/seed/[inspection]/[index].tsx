import { useLocalSearchParams } from "expo-router";
import { useInspection } from "@/lib/queries";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { SeedDetailView } from "@/components/inspections/SeedDetailView";

/**
 * Per-seed detail for a SAVED inspection.
 *
 * Route: /seed/[inspection]/[index] — both segments required because a
 * seed index alone has no meaning. Reuses `useInspection` (cached) to
 * locate the matching seed by 1-based `index`. Renders via the shared
 * `SeedDetailView` so the in-capture flow at `/capture/seed/[index]`
 * stays visually identical.
 */
export default function SavedSeedDetail() {
  const params = useLocalSearchParams<{ inspection: string; index: string }>();
  const inspectionId = params.inspection;
  const seedIndex = Number(params.index);

  const { data, isLoading, isError, refetch } = useInspection(inspectionId);

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const seed = data.seeds.find((s) => s.index === seedIndex) ?? null;
  if (!seed) return <ErrorState />;

  return <SeedDetailView seed={seed} sourceUri={data.inspection.image_url ?? null} />;
}
