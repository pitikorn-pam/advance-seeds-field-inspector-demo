import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import type { AnalysisFrameResult } from "@advance-seeds/types";

interface Props {
  /** Latest per-frame analyzer output. Null when no live data is available yet. */
  frameResult: AnalysisFrameResult | null;
}

/**
 * Live KPI strip — translucent surface anchored at the bottom of the camera
 * stage. Mirrors the prototype's `.cam-stats` element: three columns showing
 * count, average length in mm, and percentage of Grade-A seeds.
 *
 * Renders dashes ("—") when no frame data is available so the layout never
 * jumps once the analyzer starts emitting.
 */
export function KpiStrip({ frameResult }: Props) {
  const { t } = useTranslation("inspections");

  const count = frameResult?.summary.total_seeds ?? null;
  const avgMm = frameResult?.summary.mean_length_mm ?? null;
  const gradeAPct =
    frameResult && frameResult.seeds.length > 0
      ? Math.round(
          (frameResult.seeds.filter((s) => s.grade === "A").length / frameResult.seeds.length) *
            100,
        )
      : null;

  return (
    <View className="mx-md mb-md flex-row gap-md rounded-xl bg-black/[0.62] px-lg py-md">
      <Stat value={count !== null ? String(count) : "—"} label={t("capture.kpi.count")} />
      <Stat value={avgMm !== null ? avgMm.toFixed(1) : "—"} label={t("capture.kpi.avgMm")} />
      <Stat value={gradeAPct !== null ? `${gradeAPct}%` : "—"} label={t("capture.kpi.gradeA")} />
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-white font-medium" style={{ fontSize: 20, letterSpacing: -0.4 }}>
        {value}
      </Text>
      <Text
        className="text-white/65 mt-[2px] uppercase"
        style={{ fontSize: 10, letterSpacing: 0.2 }}
      >
        {label}
      </Text>
    </View>
  );
}
