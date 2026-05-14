import { useMemo } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import type { AnalysisFrameResult, AnalyzedSeed } from "@advance-seeds/types";
import { isRoiCommitted, normalizeCentroid, pointInRoi } from "@/lib/capture/roi";
import type { Roi } from "@/lib/capture/roi";

interface Props {
  /** Latest per-frame analyzer output. Null when no live data is available yet. */
  frameResult: AnalysisFrameResult | null;
  /** Active region of interest. When committed, the strip counts only the
   *  detections whose centroid falls inside the shape. */
  roi?: Roi | null;
  /** Frame dimensions (used to normalize bbox centroids for the ROI test).
   *  Defaults to 1920×1080 — matches `useFrameTicker`'s synthetic frames. */
  frameWidth?: number;
  frameHeight?: number;
}

/**
 * Live KPI strip — translucent surface anchored at the bottom of the camera
 * stage. Mirrors the prototype's `.cam-stats` element: three columns showing
 * count, average length in mm, and percentage of Grade-A seeds.
 *
 * Renders dashes ("—") when no frame data is available so the layout never
 * jumps once the analyzer starts emitting. When a committed ROI is active,
 * counts and averages are computed only over the detections whose centroid
 * is inside the shape (Phase 6b.7).
 */
export function KpiStrip({
  frameResult,
  roi = null,
  frameWidth = 1920,
  frameHeight = 1080,
}: Props) {
  const { t } = useTranslation("inspections");

  const filtered = useMemo<AnalyzedSeed[]>(() => {
    if (!frameResult) return [];
    if (!isRoiCommitted(roi) || !roi) return frameResult.seeds;
    return frameResult.seeds.filter((s) =>
      pointInRoi(normalizeCentroid(s.bbox, frameWidth, frameHeight), roi),
    );
  }, [frameResult, roi, frameWidth, frameHeight]);

  const count = frameResult ? filtered.length : null;
  const avgMm =
    filtered.length > 0
      ? filtered.reduce((sum, s) => sum + s.length_mm, 0) / filtered.length
      : null;
  const gradeAPct =
    filtered.length > 0
      ? Math.round((filtered.filter((s) => s.grade === "A").length / filtered.length) * 100)
      : null;

  return (
    <View className="mx-md mb-md flex-row gap-md rounded-lg bg-glass-surface px-lg py-md">
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
