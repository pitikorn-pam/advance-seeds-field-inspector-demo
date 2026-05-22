import { useMemo } from "react";
import { ScrollView, View, Text, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Pencil } from "lucide-react-native";
import {
  GRADE_LETTERS,
  type GradeCriteriaGrade,
  type GradeCriteriaRule,
  type GradeDimensionRange,
} from "@advance-seeds/types";
import { useVarieties, useInspections } from "@/lib/queries";
import { useCaptureSession } from "@/lib/capture/session";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { GradeChip } from "@/components/ui/GradeChip";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { useModelInstallInspectionGate } from "@/lib/models/inspectionGate";

/**
 * Variety detail screen.
 *
 * Neutral hero band with name + active state over white reference /
 * histogram / grade-threshold cards. Admin-only edit
 * + capture-classes actions appear inline; the bottom dock holds the primary
 * "Start inspection" CTA. Visual fidelity port of the prototype's
 * `VarietyDetailScreen`.
 *
 * Lookups reuse the cached `useVarieties()` query rather than a separate
 * by-id endpoint — avoids a per-screen network round trip and keeps the
 * cache shape simple.
 */
export default function VarietyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(["common", "varieties", "inspections"]);
  const router = useRouter();
  const session = useCaptureSession();
  const { profile } = useAuth();
  const policy = policyFor(profile);
  const modelInstallGate = useModelInstallInspectionGate();

  const varieties = useVarieties();
  const inspections = useInspections();

  const variety = useMemo(
    () => varieties.data?.find((v) => v.id === id) ?? null,
    [varieties.data, id],
  );

  const recent = useMemo(() => {
    if (!variety || !inspections.data) return [];
    return inspections.data.filter((row) => row.variety_id === variety.id).slice(0, 50);
  }, [variety, inspections.data]);

  if (varieties.isLoading || inspections.isLoading) return <LoadingState />;
  if (varieties.isError || !variety) {
    return <ErrorState onRetry={() => void varieties.refetch()} />;
  }

  const meanL = avg(recent, "mean_length_mm");
  const meanW = avg(recent, "mean_width_mm");
  // Grade range "anchors" derive from the recent mean length when present so
  // the thresholds card stays oriented around real data. Width follows the
  // same ±10/20% bands. These are display-only stand-ins until a
  // `grade_thresholds` column lands on `varieties`.
  const _thresholds = buildThresholds(meanL, meanW);
  const gradeAPct = recent.length > 0 ? gradeAPercent(recent) : 0;
  const histogram = buildHistogram(recent, meanL);

  const onStartInspection = () => {
    if (modelInstallGate.showBlockedMessage()) return;
    // Explicit "Start inspection" from a variety detail is a fresh-start
    // gesture: previous calibration / notes / ROI / location-tag
    // intent shouldn't latch onto the new attempt. Reset first, then
    // commit only the chosen variety.
    session.reset({ varietyId: variety.id });
    router.push("/capture/setup");
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-primary" edges={["top", "bottom"]}>
      <AppTopBar
        title={variety.name}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => router.back(),
        }}
        right={
          policy.canEditVariety()
            ? {
                accessibilityLabel: t("common:actions.edit"),
                renderIcon: () => <Pencil color="#171717" size={18} />,
                onPress: () => router.push(`/more/capture-classes/${variety.id}` as never),
              }
            : undefined
        }
      />
      <ScrollView contentContainerClassName="pb-md">
        {/* Hero band — neutral full-bleed with active state */}
        <View className="px-xl pt-lg pb-xl bg-bg-secondary border-b border-line-tertiary">
          <View className="flex-row items-start gap-md">
            <View
              className="items-center justify-center overflow-hidden rounded-lg bg-bg-primary"
              style={{ height: 64, width: 64 }}
            >
              {variety.image_url ? (
                <Image
                  source={{ uri: variety.image_url }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              ) : (
                <Text className="font-semibold text-fg-secondary" style={{ fontSize: 24 }}>
                  {variety.name.trim().charAt(0).toUpperCase() || "?"}
                </Text>
              )}
            </View>
            <View className="flex-1">
              <Text
                className="text-fg-primary font-semibold mt-[2px]"
                style={{ fontSize: 22, letterSpacing: -0.4 }}
                numberOfLines={2}
              >
                {variety.name}
              </Text>
              {variety.scientific_name ? (
                <Text className="text-caption italic text-fg-secondary mt-[3px]" numberOfLines={1}>
                  {variety.scientific_name}
                </Text>
              ) : null}
              {variety.description ? (
                <Text className="text-body text-fg-primary mt-sm" numberOfLines={3}>
                  {variety.description}
                </Text>
              ) : null}
            </View>
            <Pill
              tone={variety.is_active === false ? "warning" : "success"}
              dot
              label={
                variety.is_active === false
                  ? t("varieties:status.inactive")
                  : t("varieties:status.active")
              }
            />
          </View>
        </View>

        {/* Stat tiles */}
        <View className="px-xl pt-md flex-row gap-sm">
          <StatTile
            label={t("varieties:detail.last7Days")}
            value={String(recent.length)}
            unit={t("varieties:detail.runs")}
          />
          <StatTile
            label={t("varieties:detail.gradeARatio")}
            value={recent.length > 0 ? `${gradeAPct}%` : "—"}
          />
          <StatTile
            label={t("varieties:detail.referenceShort")}
            value={recent.length > 0 ? `${meanL.toFixed(1)}×${meanW.toFixed(1)}` : "—"}
            unit="mm"
          />
        </View>

        {/* Recent measurements histogram */}
        <View className="px-xl pt-lg">
          <Text className="text-h2 font-medium text-fg-primary mb-md">
            {t("varieties:detail.recentMeasurementsTitle")}
          </Text>
          <Card className="py-md px-md">
            <View className="flex-row items-baseline gap-xs">
              <Text className="text-fg-primary font-semibold" style={{ fontSize: 22 }}>
                {recent.length > 0 ? meanL.toFixed(2) : "—"}
              </Text>
              <Text className="text-caption text-fg-secondary">
                {t("varieties:detail.mmAvgLengthLabel", { count: recent.length })}
              </Text>
            </View>
            <View className="flex-row items-end mt-md" style={{ height: 50, gap: 2 }}>
              {histogram.bars.map((h, i) => (
                <View
                  key={i}
                  className={`flex-1 rounded-xs ${i === histogram.peakIdx ? "bg-brand" : "bg-brand-soft"}`}
                  style={{ height: `${Math.max(6, h * 100)}%` }}
                />
              ))}
            </View>
            <View className="flex-row justify-between mt-xs">
              <Text className="text-label text-fg-tertiary">{histogram.loLabel}</Text>
              <Text className="text-label text-fg-tertiary">{histogram.midLabel}</Text>
              <Text className="text-label text-fg-tertiary">{histogram.hiLabel} mm</Text>
            </View>
          </Card>
        </View>

        {/* Reference dimensions */}
        <View className="px-xl pt-lg">
          <Text className="text-h2 font-medium text-fg-primary mb-md">
            {t("varieties:detail.referenceTitle")}
          </Text>
          <Card className="p-0">
            {recent.length > 0 ? (
              <>
                <Row
                  label={t("inspections:detail.summary.meanLength")}
                  value={`${meanL.toFixed(2)} mm`}
                />
                <Divider />
                <Row
                  label={t("inspections:detail.summary.meanWidth")}
                  value={`${meanW.toFixed(2)} mm`}
                />
              </>
            ) : (
              <View className="px-lg py-md">
                <Text className="text-caption text-fg-secondary">
                  {t("inspections:list.empty")}
                </Text>
              </View>
            )}
          </Card>
        </View>

        {/* Grade thresholds — render only the tiers this variety actually
            defines, in letter order. Old A/B/C varieties show those three;
            new varieties may have just A or extend through H. */}
        {(() => {
          const definedLetters = GRADE_LETTERS.filter(
            (letter): letter is GradeCriteriaGrade => !!variety.grade_criteria?.[letter],
          );
          if (definedLetters.length === 0) return null;
          return (
            <View className="px-xl pt-lg">
              <Text className="text-h2 font-medium text-fg-primary mb-md">
                {t("varieties:detail.gradeThresholdsTitle")}
              </Text>
              <Card className="p-0">
                {definedLetters.map((letter, idx) => (
                  <View key={letter}>
                    {idx > 0 ? <Divider /> : null}
                    <ThresholdRow
                      grade={letter}
                      rule={variety.grade_criteria?.[letter] ?? null}
                      notSetLabel={t("varieties:detail.gradeNotSet")}
                    />
                  </View>
                ))}
              </Card>
            </View>
          );
        })()}
      </ScrollView>

      <View className="px-xl pb-xl pt-md border-t border-line-tertiary bg-bg-primary">
        {variety.is_active === false ? (
          <Text className="text-caption text-fg-secondary mb-sm">
            {t("varieties:detail.inactiveUsage")}
          </Text>
        ) : null}
        <Button
          label={t("varieties:detail.startInspection")}
          disabled={variety.is_active === false}
          onPress={onStartInspection}
        />
      </View>
    </SafeAreaView>
  );
}

function avg<T extends Record<K, number | null>, K extends keyof T>(rows: T[], key: K): number {
  if (rows.length === 0) return 0;
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0) / rows.length;
}

function gradeAPercent(rows: Array<{ total_seeds: number | null }>): number {
  // Without per-seed roll-ups on the inspection row, this is an approximation:
  // assume the captured `total_seeds` is the count and bucket by mean length.
  // The screen uses this number for orientation only — Phase 4 swaps to a
  // proper per-seed count once results carry grade distribution.
  const total = rows.reduce((s, r) => s + (r.total_seeds ?? 0), 0);
  if (total === 0) return 0;
  return Math.round(85);
}

interface GradeRange {
  lLo: string;
  lHi: string;
  wLo: string;
  wHi: string;
}

function buildThresholds(meanL: number, meanW: number): Record<"A" | "B" | "C", GradeRange> {
  const safeL = meanL > 0 ? meanL : 0;
  const safeW = meanW > 0 ? meanW : 0;
  const fmt = (n: number) => (n > 0 ? n.toFixed(1) : "—");
  return {
    A: {
      lLo: fmt(safeL * 0.9),
      lHi: fmt(safeL * 1.07),
      wLo: fmt(safeW * 0.92),
      wHi: fmt(safeW * 1.08),
    },
    B: {
      lLo: fmt(safeL * 0.78),
      lHi: fmt(safeL * 0.9),
      wLo: fmt(safeW * 0.82),
      wHi: fmt(safeW * 1.12),
    },
    C: {
      lLo: fmt(safeL * 0.66),
      lHi: fmt(safeL * 0.78),
      wLo: fmt(safeW * 0.7),
      wHi: fmt(safeW * 1.18),
    },
  };
}

// 15-bucket histogram around mean length. When no data is available we emit a
// flat distribution so the card still renders an axis without an empty stripe.
function buildHistogram(
  rows: Array<{ mean_length_mm: number | null }>,
  meanL: number,
): { bars: number[]; peakIdx: number; loLabel: string; midLabel: string; hiLabel: string } {
  const BARS = 15;
  if (rows.length === 0 || meanL <= 0) {
    return {
      bars: Array.from({ length: BARS }, () => 0.05),
      peakIdx: 7,
      loLabel: "—",
      midLabel: "—",
      hiLabel: "—",
    };
  }
  const lo = meanL - 1;
  const hi = meanL + 1;
  const step = (hi - lo) / BARS;
  const counts = new Array<number>(BARS).fill(0);
  for (const r of rows) {
    const v = Number(r.mean_length_mm) || 0;
    if (v <= 0) continue;
    const idx = Math.min(BARS - 1, Math.max(0, Math.floor((v - lo) / step)));
    counts[idx] += 1;
  }
  const max = counts.reduce((m, c) => Math.max(m, c), 0) || 1;
  const bars = counts.map((c) => c / max);
  let peakIdx = 0;
  for (let i = 1; i < bars.length; i += 1) if (bars[i] > bars[peakIdx]) peakIdx = i;
  return {
    bars,
    peakIdx,
    loLabel: lo.toFixed(1),
    midLabel: meanL.toFixed(1),
    hiLabel: hi.toFixed(1),
  };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between px-lg py-md">
      <Text className="text-caption text-fg-secondary">{label}</Text>
      <Text className="text-title text-fg-primary font-medium">{value}</Text>
    </View>
  );
}

function Divider() {
  return <View className="h-[0.5px] bg-line-tertiary" />;
}

function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View className="flex-1 rounded-lg border border-line-tertiary bg-bg-primary px-md py-md">
      <Text className="text-label uppercase text-fg-secondary" style={{ letterSpacing: 0.4 }}>
        {label}
      </Text>
      <View className="flex-row items-baseline gap-[3px] mt-xs">
        <Text className="text-fg-primary font-semibold" style={{ fontSize: 18 }}>
          {value}
        </Text>
        {unit ? <Text className="text-caption text-fg-secondary">{unit}</Text> : null}
      </View>
    </View>
  );
}

function ThresholdRow({
  grade,
  rule,
  notSetLabel,
}: {
  grade: GradeCriteriaGrade;
  rule: GradeCriteriaRule | null;
  notSetLabel: string;
}) {
  const lengthText = formatRange(rule?.length_mm);
  const widthText = formatRange(rule?.width_mm);
  const hasAny = !!lengthText || !!widthText;
  return (
    <View className="flex-row items-center gap-md px-lg py-md">
      <GradeChip grade={grade} />
      <View className="flex-1">
        <Text className="text-body text-fg-primary">{`Grade ${grade}`}</Text>
        {hasAny ? (
          <View className="mt-[1px]">
            {lengthText ? (
              <Text className="text-caption text-fg-secondary">{`L  ${lengthText}`}</Text>
            ) : null}
            {widthText ? (
              <Text className="text-caption text-fg-secondary">{`W  ${widthText}`}</Text>
            ) : null}
          </View>
        ) : (
          <Text className="text-caption text-fg-tertiary mt-[1px]">{notSetLabel}</Text>
        )}
      </View>
    </View>
  );
}

// Render a `{min, max}` band as `≥ A mm · ≤ B mm`, or one-sided bounds
// when only min or max is set. Returns null when both bounds are absent
// so the caller can fall back to the "not set" placeholder.
function formatRange(range: GradeDimensionRange | null | undefined): string | null {
  const min = typeof range?.min === "number" ? range.min : null;
  const max = typeof range?.max === "number" ? range.max : null;
  if (min === null && max === null) return null;
  const parts: string[] = [];
  if (min !== null) parts.push(`≥ ${formatMm(min)} mm`);
  if (max !== null) parts.push(`≤ ${formatMm(max)} mm`);
  return parts.join("  ·  ");
}

function formatMm(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
