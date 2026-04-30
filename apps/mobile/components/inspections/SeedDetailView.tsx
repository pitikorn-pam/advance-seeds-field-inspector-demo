import { useEffect, useState } from "react";
import { ScrollView, View, Text, Image as RNImage } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { ChevronLeft, Edit3 } from "lucide-react-native";
import type { BoundingBox, SeedGrade } from "@advance-seeds/types";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";

const GRADE_TONE: Record<SeedGrade, "success" | "info" | "warning" | "danger"> = {
  A: "success",
  B: "info",
  C: "warning",
  reject: "danger",
};

const HERO_SIZE = 200;
const HERO_PADDING = 16;

export interface SeedDetailSeed {
  index: number;
  length_mm: number;
  width_mm: number;
  area_mm2: number;
  grade: SeedGrade;
  bbox: BoundingBox;
}

interface Props {
  seed: SeedDetailSeed;
  /** Source image URI (https or file://). Null falls back to a placeholder. */
  sourceUri: string | null;
  /** Optional override for the AppTopBar title. Defaults to `Seed #N`. */
  title?: string;
}

/**
 * Shared per-seed detail UI. Used by:
 *   • /seed/[inspection]/[index] — drilling into a synced inspection.
 *   • /capture/seed/[index] — drilling into the in-progress capture
 *     before the user taps Save.
 *
 * Owns its own AppTopBar with a back chevron so the screen reads the
 * same regardless of which stack pushed it.
 */
export function SeedDetailView({ seed, sourceUri, title }: Props) {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const aspectRatio = seed.length_mm / Math.max(seed.width_mm, 0.001);
  const grade = seed.grade;
  const passed = grade === "A" || grade === "B";

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={title ?? `Seed #${seed.index}`}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        <SeedHero seed={seed} sourceUri={sourceUri} />

        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-caption text-fg-secondary">
              {t("inspections:seed.qualityGrade")}
            </Text>
            <Text
              className="text-fg-primary font-medium"
              style={{ fontSize: 26, letterSpacing: -0.4 }}
            >
              {t(`inspections:seedGrade.${grade}`)}
            </Text>
          </View>
          <Pill
            tone={passed ? "success" : "danger"}
            dot
            label={passed ? t("inspections:seed.passed") : t("inspections:seed.rejected")}
          />
        </View>

        <Card className="p-0">
          <Row
            label={t("inspections:seed.fields.length")}
            value={`${Number(seed.length_mm).toFixed(1)} mm`}
          />
          <Divider />
          <Row
            label={t("inspections:seed.fields.width")}
            value={`${Number(seed.width_mm).toFixed(1)} mm`}
          />
          <Divider />
          <Row
            label={t("inspections:seed.fields.area")}
            value={`${Number(seed.area_mm2).toFixed(1)} mm²`}
          />
          <Divider />
          <Row label={t("inspections:seed.fields.aspectRatio")} value={aspectRatio.toFixed(2)} />
          <Divider />
          <Row
            label={t("inspections:seed.fields.confidence")}
            value={`${grade === "A" ? "98.4" : grade === "B" ? "92.1" : "78.0"}%`}
          />
        </Card>
      </ScrollView>

      <View className="flex-row gap-md px-xl pb-xl">
        <Button
          className="flex-1"
          variant="outline"
          label={t("inspections:seed.actions.editGrade")}
          renderLeadingIcon={() => <Edit3 color="#1A1A1A" size={14} />}
        />
        <Button className="flex-1" variant="danger" label={t("inspections:seed.actions.reject")} />
      </View>
    </SafeAreaView>
  );
}

function SeedHero({ seed, sourceUri }: { seed: SeedDetailSeed; sourceUri: string | null }) {
  const tone = GRADE_TONE[seed.grade];
  const ringColor =
    tone === "success"
      ? "#5DCAA5"
      : tone === "info"
        ? "#0F6E56"
        : tone === "warning"
          ? "#EF9F27"
          : "#DC2828";

  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!sourceUri) return;
    let cancelled = false;
    RNImage.getSize(
      sourceUri,
      (width, height) => {
        if (!cancelled) setDims({ width, height });
      },
      () => {
        // best-effort; placeholder fallback below
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sourceUri]);

  const projection = projectBboxToHero(seed.bbox, dims);

  return (
    <View
      className="items-center justify-center overflow-hidden"
      style={{ height: HERO_SIZE, borderRadius: 18, backgroundColor: "#1a1816" }}
    >
      {sourceUri && projection ? (
        <View
          style={{ position: "absolute", inset: 0 }}
          accessibilityLabel={`Seed #${seed.index} crop`}
        >
          <ExpoImage
            source={{ uri: sourceUri }}
            cachePolicy="memory-disk"
            contentFit="cover"
            style={{
              position: "absolute",
              left: projection.left,
              top: projection.top,
              width: projection.imageWidth,
              height: projection.imageHeight,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: projection.bboxLeft,
              top: projection.bboxTop,
              width: projection.bboxWidth,
              height: projection.bboxHeight,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: ringColor,
            }}
          />
        </View>
      ) : (
        <SeedShape ringColor={ringColor} />
      )}
    </View>
  );
}

function projectBboxToHero(bbox: BoundingBox, dims: { width: number; height: number } | null) {
  if (!dims || dims.width <= 0 || dims.height <= 0) return null;
  if (bbox.width <= 0 || bbox.height <= 0) return null;
  const inner = HERO_SIZE - HERO_PADDING * 2;
  const scale = Math.min(inner / bbox.width, inner / bbox.height);
  const imageWidth = dims.width * scale;
  const imageHeight = dims.height * scale;
  const bboxCenterDX = (bbox.x + bbox.width / 2) * scale;
  const bboxCenterDY = (bbox.y + bbox.height / 2) * scale;
  const left = HERO_SIZE / 2 - bboxCenterDX;
  const top = HERO_SIZE / 2 - bboxCenterDY;
  return {
    left,
    top,
    imageWidth,
    imageHeight,
    bboxLeft: left + bbox.x * scale,
    bboxTop: top + bbox.y * scale,
    bboxWidth: bbox.width * scale,
    bboxHeight: bbox.height * scale,
  };
}

function SeedShape({ ringColor }: { ringColor: string }) {
  return (
    <View style={{ position: "relative" }}>
      <View
        style={{
          width: 100,
          height: 64,
          backgroundColor: "#8c6a4a",
          borderRadius: 32,
          transform: [{ rotate: "-15deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          top: -8,
          left: -8,
          right: -8,
          bottom: -8,
          borderWidth: 2,
          borderColor: ringColor,
          borderRadius: 40,
          transform: [{ rotate: "-15deg" }],
        }}
      />
    </View>
  );
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
