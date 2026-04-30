import { useEffect, useState } from "react";
import { ScrollView, View, Text, Image as RNImage } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams } from "expo-router";
import { Stack } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { Edit3 } from "lucide-react-native";
import type { BoundingBox, Seed, SeedGrade } from "@advance-seeds/types";
import { useInspection } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/States";

const GRADE_TONE: Record<SeedGrade, "success" | "info" | "warning" | "danger"> = {
  A: "success",
  B: "info",
  C: "warning",
  reject: "danger",
};

const HERO_SIZE = 200;
const HERO_PADDING = 16; // around the bbox so the seed isn't pixel-tight to the edge

/**
 * Per-seed detail screen.
 *
 * Route: /seed/[inspection]/[index] — both segments are required because a
 * seed index alone has no meaning. We reuse `useInspection` to fetch the
 * parent inspection (already cached after the user navigates from the
 * inspection detail screen), then locate the matching seed by its 1-based
 * `index` field.
 *
 * Hero renders the source inspection photo scaled + translated so the
 * detected seed's bbox fills a fixed-size square, clipped via
 * overflow-hidden. No native crop, no extra storage — just CSS-style
 * positioning over the cached image. Falls back to a token-tinted
 * placeholder when the source image dims can't be read.
 */
export default function SeedDetail() {
  const params = useLocalSearchParams<{ inspection: string; index: string }>();
  const { t } = useTranslation(["common", "inspections"]);
  const inspectionId = params.inspection;
  const seedIndex = Number(params.index);

  const { data, isLoading, isError, refetch } = useInspection(inspectionId);

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const seed = data.seeds.find((s) => s.index === seedIndex) ?? null;
  if (!seed) return <ErrorState />;

  const aspectRatio = seed.length_mm / Math.max(seed.width_mm, 0.001);
  const grade = seed.grade;
  const passed = grade === "A" || grade === "B";

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["bottom"]}>
      <Stack.Screen options={{ title: `Seed #${seed.index}` }} />
      <ScrollView contentContainerClassName="px-xl py-md gap-lg">
        <SeedHero seed={seed} sourceUri={data.inspection.image_url ?? null} />

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
            // Confidence isn't persisted yet; derived from grade until Phase 4
            // adds the analyzer's per-seed confidence to the seeds row.
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

function SeedHero({ seed, sourceUri }: { seed: Seed; sourceUri: string | null }) {
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
        // Network/decode error — leave dims null so we fall back to the
        // stylized placeholder. Not worth alerting the user; per-seed
        // detail is best-effort.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sourceUri]);

  // Compute the displayed image's transform so the seed's bbox fills the
  // hero square (with HERO_PADDING breathing room) and gets clipped by
  // the surrounding overflow-hidden container.
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
  // Scale so the bbox fits inside the inner box (preserve aspect; the long
  // side hits the inner edge, the short side leaves margin).
  const scale = Math.min(inner / bbox.width, inner / bbox.height);
  const imageWidth = dims.width * scale;
  const imageHeight = dims.height * scale;
  // Bbox center in DISPLAYED image coords:
  const bboxCenterDX = (bbox.x + bbox.width / 2) * scale;
  const bboxCenterDY = (bbox.y + bbox.height / 2) * scale;
  // Translate so that center lands at HERO_SIZE / 2:
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

// Fallback when we can't crop: token-tinted stylized seed shape.
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
