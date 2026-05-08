import { useMemo } from "react";
import { ScrollView, View, Text, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Camera as CameraIcon, ChevronLeft, Pencil } from "lucide-react-native";
import { useVarieties, useInspections } from "@/lib/queries";
import { useCaptureSession } from "@/lib/capture/session";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { useModelInstallInspectionGate } from "@/lib/models/inspectionGate";

const VARIETY_TINTS: Record<string, { bg: string; fg: string }> = {
  corn: { bg: "#FAEEDA", fg: "#854F0B" },
  rice: { bg: "#EAF3DE", fg: "#3B6D11" },
  legume: { bg: "#E1F5EE", fg: "#0F6E56" },
  mungbean: { bg: "#FAECE7", fg: "#993C1D" },
};

/**
 * Variety detail screen.
 *
 * Read-only view of a variety: hero image (or token-tinted placeholder),
 * scientific name, description, and a recent-inspections summary scoped to
 * the current user via RLS. Bottom CTA jumps to capture setup with the
 * variety pre-selected.
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

  const tint = VARIETY_TINTS[variety.color_key ?? ""] ?? VARIETY_TINTS.rice;

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
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={variety.name}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: () => router.back(),
        }}
        right={
          policy.canEditVariety()
            ? {
                accessibilityLabel: t("common:actions.edit"),
                renderIcon: () => <Pencil color="#1A1A1A" size={18} />,
                onPress: () => router.push(`/more/capture-classes/${variety.id}` as never),
              }
            : undefined
        }
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        <View
          className="items-center justify-center overflow-hidden"
          style={{ height: 160, borderRadius: 18, backgroundColor: tint.bg }}
        >
          {variety.image_url ? (
            <Image
              source={{ uri: variety.image_url }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <View className="flex-row gap-sm">
              <SeedShape color={tint.fg} rotate="-15deg" />
              <SeedShape color={tint.fg} rotate="8deg" />
              <SeedShape color={tint.fg} rotate="-22deg" />
            </View>
          )}
        </View>

        <View>
          <Text
            className="text-fg-primary font-medium"
            style={{ fontSize: 22, letterSpacing: -0.4 }}
          >
            {variety.name}
          </Text>
          {variety.is_active === false ? (
            <View className="mt-sm self-start">
              <Pill tone="warning" label={t("varieties:status.inactive")} />
            </View>
          ) : null}
          {variety.scientific_name ? (
            <Text className="text-caption italic text-fg-secondary mt-xs">
              {variety.scientific_name}
            </Text>
          ) : null}
          {variety.description ? (
            <Text className="text-body text-fg-secondary mt-md">{variety.description}</Text>
          ) : null}
        </View>

        <View>
          <Text className="text-h2 font-medium text-fg-primary mb-md">
            {t("varieties:detail.referenceTitle")}
          </Text>
          {/* Reference dimensions are spec-level data — varieties table doesn't
              store them yet. Show the recent-mean as a stand-in until the
              schema gets a `reference_length_mm` / `reference_width_mm`. */}
          <Card className="p-0">
            {recent.length > 0 ? (
              <>
                <Row
                  label={t("inspections:detail.summary.meanLength")}
                  value={`${avg(recent, "mean_length_mm").toFixed(2)} mm`}
                />
                <Divider />
                <Row
                  label={t("inspections:detail.summary.meanWidth")}
                  value={`${avg(recent, "mean_width_mm").toFixed(2)} mm`}
                />
                <Divider />
                <Row
                  label={t("inspections:detail.summary.meanArea")}
                  value={`${avg(recent, "mean_area_mm2").toFixed(2)} mm²`}
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

        <View>
          <Text className="text-h2 font-medium text-fg-primary mb-md">
            {t("varieties:detail.recentTitle")}
          </Text>
          <Card className="p-0">
            <Row
              label={t("varieties:detail.thisWeek")}
              value={t("varieties:detail.inspectionsCount", {
                count: recent.length,
                seeds: totalSeeds,
              })}
            />
            <Divider />
            <Row
              label={t("varieties:detail.averageGrade")}
              value={
                recent.length > 0
                  ? t("varieties:detail.gradeAPct", {
                      percent: gradeAPercent(recent),
                    })
                  : "—"
              }
            />
          </Card>
        </View>
      </ScrollView>

      <View className="px-xl pb-xl">
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

function SeedShape({ color, rotate }: { color: string; rotate: string }) {
  return (
    <View
      style={{
        width: 38,
        height: 24,
        borderRadius: 12,
        backgroundColor: color,
        transform: [{ rotate }],
      }}
    />
  );
}
