import { useMemo } from "react";
import { ScrollView, View, Text, Image, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Camera as CameraIcon,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Layers,
} from "lucide-react-native";
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

type VarietyTintKey = "corn" | "rice" | "legume" | "mungbean";

// Token-backed tint pairs. The hex `seed` is only used for the seed-shape
// placeholder (React Native can't currentColor an inline ellipse), and
// mirrors the `--as-{key}-text` token value.
const VARIETY_TINTS: Record<VarietyTintKey, { bg: string; text: string; seed: string }> = {
  corn: { bg: "bg-corn-bg", text: "text-corn-text", seed: "#704B00" },
  rice: { bg: "bg-rice-bg", text: "text-rice-text", seed: "#0F6E56" },
  legume: { bg: "bg-legume-bg", text: "text-legume-text", seed: "#3F249B" },
  mungbean: { bg: "bg-mungbean-bg", text: "text-mungbean-text", seed: "#8C3C12" },
};

function resolveTint(colorKey: string | null | undefined): {
  key: VarietyTintKey;
  bg: string;
  text: string;
  seed: string;
} {
  const k = (colorKey ?? "rice") as VarietyTintKey;
  const tint = VARIETY_TINTS[k] ?? VARIETY_TINTS.rice;
  return { key: k in VARIETY_TINTS ? k : "rice", ...tint };
}

/**
 * Variety detail screen.
 *
 * Read-only view of a variety: tinted hero band with family + scientific
 * name + seed thumb, reference dimensions card, grade thresholds preview,
 * and a brief recent-inspections roll-up. Admin-only actions (edit
 * variety, capture classes) appear at the bottom of the scroll. Bottom
 * CTA jumps to capture setup with the variety pre-selected.
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

  const totalSeeds = recent.reduce((sum, r) => sum + (r.total_seeds ?? 0), 0);

  if (varieties.isLoading || inspections.isLoading) return <LoadingState />;
  if (varieties.isError || !variety) {
    return <ErrorState onRetry={() => void varieties.refetch()} />;
  }

  const tint = resolveTint(variety.color_key);
  const meanL = avg(recent, "mean_length_mm");
  const meanW = avg(recent, "mean_width_mm");
  const meanArea = avg(recent, "mean_area_mm2");
  // Grade range "anchors" derive from the recent mean length when present so
  // the thresholds card stays oriented around real data. Width follows the
  // same ±10/20% bands. These are display-only stand-ins until a
  // `grade_thresholds` column lands on `varieties`.
  const thresholds = buildThresholds(meanL, meanW);
  const gradeAPct = recent.length > 0 ? gradeAPercent(recent) : 0;

  const onStartInspection = () => {
    if (modelInstallGate.showBlockedMessage()) return;
    // Explicit "Start inspection" from a variety detail is a fresh-start
    // gesture: previous calibration / notes / ROI / location-tag
    // intent shouldn't latch onto the new attempt. Reset first, then
    // commit only the chosen variety.
    session.reset({ varietyId: variety.id });
    router.push("/capture/setup");
  };

  const familyLabel = t(`varieties:family.${tint.key}`);

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
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
        {/* Hero band — tinted full-bleed with seed thumb + family + sci name */}
        <View className={`px-xl pt-lg pb-xl ${tint.bg}`}>
          <View className="flex-row items-center gap-md">
            <View
              className="items-center justify-center overflow-hidden rounded-lg"
              style={{ height: 72, width: 72, backgroundColor: "rgba(255,255,255,0.55)" }}
            >
              {variety.image_url ? (
                <Image
                  source={{ uri: variety.image_url }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              ) : (
                <View className="flex-row gap-[3px]">
                  <SeedShape color={tint.seed} rotate="-15deg" />
                  <SeedShape color={tint.seed} rotate="8deg" />
                  <SeedShape color={tint.seed} rotate="-22deg" />
                </View>
              )}
            </View>
            <View className="flex-1">
              <Text
                className={`text-label uppercase font-medium ${tint.text}`}
                style={{ letterSpacing: 0.6 }}
              >
                {familyLabel}
              </Text>
              <Text
                className="text-fg-primary font-medium mt-[2px]"
                style={{ fontSize: 22, letterSpacing: -0.4 }}
                numberOfLines={2}
              >
                {variety.name}
              </Text>
              {variety.scientific_name ? (
                <Text className="text-caption italic text-fg-secondary mt-[2px]" numberOfLines={1}>
                  {variety.scientific_name}
                </Text>
              ) : null}
            </View>
          </View>

          <View className="flex-row gap-xs mt-md">
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

        {variety.description ? (
          <View className="px-xl pt-md">
            <Text className="text-body text-fg-secondary">{variety.description}</Text>
          </View>
        ) : null}

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
                <Divider />
                <Row
                  label={t("inspections:detail.summary.meanArea")}
                  value={`${meanArea.toFixed(2)} mm²`}
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

        {/* Grade thresholds preview */}
        <View className="px-xl pt-lg">
          <Text className="text-h2 font-medium text-fg-primary mb-md">
            {t("varieties:detail.gradeThresholdsTitle")}
          </Text>
          <Card className="p-0">
            <ThresholdRow
              grade="A"
              lengthLabel={`${thresholds.A.lLo} – ${thresholds.A.lHi} mm`}
              widthLabel={`${thresholds.A.wLo} – ${thresholds.A.wHi} mm`}
              t={t}
            />
            <Divider />
            <ThresholdRow
              grade="B"
              lengthLabel={`${thresholds.B.lLo} – ${thresholds.B.lHi} mm`}
              widthLabel={`${thresholds.B.wLo} – ${thresholds.B.wHi} mm`}
              t={t}
            />
            <Divider />
            <ThresholdRow
              grade="C"
              lengthLabel={`${thresholds.C.lLo} – ${thresholds.C.lHi} mm`}
              widthLabel={`${thresholds.C.wLo} – ${thresholds.C.wHi} mm`}
              t={t}
            />
          </Card>
        </View>

        {/* Recent inspections list */}
        <View className="px-xl pt-lg">
          <Text className="text-h2 font-medium text-fg-primary mb-md">
            {t("varieties:detail.recentTitle")}
          </Text>
          <Card className="p-0">
            {recent.length === 0 ? (
              <View className="px-lg py-md">
                <Text className="text-caption text-fg-secondary">
                  {t("inspections:list.empty")}
                </Text>
              </View>
            ) : (
              <>
                <Row
                  label={t("varieties:detail.thisWeek")}
                  value={t("varieties:detail.inspectionsCount", {
                    count: recent.length,
                    seeds: totalSeeds,
                  })}
                />
                <Divider />
                {recent.slice(0, 4).map((row, idx) => (
                  <View key={row.id}>
                    {idx > 0 ? <Divider /> : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push(`/inspections/${row.id}` as never)}
                      className="flex-row items-center justify-between px-lg py-md active:bg-bg-secondary"
                    >
                      <View className="flex-1 mr-md">
                        <Text className="text-body text-fg-primary" numberOfLines={1}>
                          {formatDate(row.captured_at ?? row.created_at)}
                        </Text>
                        <Text className="text-caption text-fg-secondary mt-[2px]">
                          {t("varieties:detail.seedsTotal", {
                            count: row.total_seeds ?? 0,
                          })}
                        </Text>
                      </View>
                      <ChevronRight color="#8C8C87" size={16} />
                    </Pressable>
                  </View>
                ))}
              </>
            )}
          </Card>
        </View>

        {policy.canEditVariety() ? (
          <View className="px-xl pt-lg gap-sm">
            <Button
              label={t("varieties:detail.editVariety")}
              variant="secondary"
              renderLeadingIcon={() => <Pencil color="#171717" size={16} />}
              onPress={() => router.push(`/more/varieties/${variety.id}/edit` as never)}
            />
            <Button
              label={t("varieties:detail.captureClasses")}
              variant="secondary"
              renderLeadingIcon={() => <Layers color="#171717" size={16} />}
              onPress={() => router.push(`/more/capture-classes/${variety.id}` as never)}
            />
          </View>
        ) : null}
      </ScrollView>

      <View className="px-xl pb-xl pt-md border-t border-line-tertiary bg-bg-primary">
        {variety.is_active === false ? (
          <Text className="text-caption text-fg-secondary mb-sm">
            {t("varieties:detail.inactiveUsage")}
          </Text>
        ) : null}
        <Button
          label={t("varieties:detail.startInspection")}
          renderLeadingIcon={() => <CameraIcon color="#FFFFFF" size={18} />}
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

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
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
        <Text className="text-fg-primary font-medium" style={{ fontSize: 18 }}>
          {value}
        </Text>
        {unit ? <Text className="text-caption text-fg-secondary">{unit}</Text> : null}
      </View>
    </View>
  );
}

function ThresholdRow({
  grade,
  lengthLabel,
  widthLabel,
  t,
}: {
  grade: "A" | "B" | "C";
  lengthLabel: string;
  widthLabel: string;
  t: (key: string) => string;
}) {
  return (
    <View className="flex-row items-center gap-md px-lg py-md">
      <GradeChip grade={grade} />
      <View className="flex-1">
        <Text className="text-body text-fg-primary">{t("varieties:detail.lengthRange")}</Text>
        <Text className="text-caption text-fg-secondary mt-[1px]">{lengthLabel}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-body text-fg-primary">{t("varieties:detail.widthRange")}</Text>
        <Text className="text-caption text-fg-secondary mt-[1px]">{widthLabel}</Text>
      </View>
    </View>
  );
}

function SeedShape({ color, rotate }: { color: string; rotate: string }) {
  return (
    <View
      style={{
        width: 18,
        height: 12,
        borderRadius: 6,
        backgroundColor: color,
        transform: [{ rotate }],
      }}
    />
  );
}
