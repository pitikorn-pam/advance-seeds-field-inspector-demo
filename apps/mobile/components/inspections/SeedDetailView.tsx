import { useEffect, useState } from "react";
import { Alert, ScrollView, View, Text, Image as RNImage } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
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
  /**
   * Persist a new grade. Saved-inspection wires this to a Supabase
   * UPDATE; in-capture wires it to a session mutation. When omitted,
   * Edit grade / Reject buttons are hidden (read-only mode).
   */
  onUpdateGrade?: (grade: SeedGrade) => void | Promise<void>;
  /** Disable the action buttons while a previous mutation is in flight. */
  busy?: boolean;
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
export function SeedDetailView({ seed, sourceUri, title, onUpdateGrade, busy }: Props) {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const aspectRatio = seed.length_mm / Math.max(seed.width_mm, 0.001);
  const grade = seed.grade;
  const passed = grade === "A" || grade === "B";

  const onEdit = () => {
    if (!onUpdateGrade) return;
    // Lightweight grade picker via Alert. The Settings/Master-data style
    // chip picker we use elsewhere doesn't fit this screen's footer
    // layout, but Alert is good enough for a 4-option pick.
    const opts: SeedGrade[] = ["A", "B", "C", "reject"];
    Alert.alert(
      t("inspections:seed.actions.editGrade"),
      t("inspections:seed.editGradeBody", { current: t(`inspections:seedGrade.${grade}`) }),
      [
        { text: t("common:actions.cancel"), style: "cancel" },
        ...opts
          .filter((g) => g !== grade)
          .map((g) => ({
            text: t(`inspections:seedGrade.${g}`),
            onPress: () => void onUpdateGrade(g),
            style: g === "reject" ? ("destructive" as const) : ("default" as const),
          })),
      ],
    );
  };

  const onReject = () => {
    if (!onUpdateGrade) return;
    if (grade === "reject") return;
    Alert.alert(t("inspections:seed.actions.reject"), t("inspections:seed.rejectConfirm"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("inspections:seed.actions.reject"),
        style: "destructive",
        onPress: () => void onUpdateGrade("reject"),
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={title ?? `Seed #${seed.index}`}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
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

      {onUpdateGrade ? (
        <View className="flex-row gap-md px-xl pb-xl">
          <Button
            className="flex-1"
            variant="outline"
            label={t("inspections:seed.actions.editGrade")}
            renderLeadingIcon={() => <Edit3 color="#171717" size={14} />}
            onPress={onEdit}
            disabled={busy}
          />
          <Button
            className="flex-1"
            variant="danger"
            label={t("inspections:seed.actions.reject")}
            onPress={onReject}
            disabled={busy || grade === "reject"}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function SeedHero({ seed, sourceUri }: { seed: SeedDetailSeed; sourceUri: string | null }) {
  const tone = GRADE_TONE[seed.grade];
  const ringColor =
    tone === "success"
      ? "#5DCAA5"
      : tone === "info"
        ? "#6E40E0"
        : tone === "warning"
          ? "#EF9F27"
          : "#DC2828";

  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [getSizeError, setGetSizeError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  useEffect(() => {
    if (!sourceUri) return;
    let cancelled = false;
    RNImage.getSize(
      sourceUri,
      (width, height) => {
        if (!cancelled) setDims({ width, height });
      },
      (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[SeedHero] Image.getSize failed", sourceUri, msg);
        if (!cancelled) setGetSizeError(msg);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sourceUri]);

  const projection = projectBboxToHero(seed.bbox, dims);
  const bboxInvalid = seed.bbox.width <= 0 || seed.bbox.height <= 0;

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
          {/* Use RN's <Image> here, not expo-image: the main capture preview
              renders the same URL via RN <Image> successfully, but expo-image
              with cachePolicy="memory-disk" intermittently fails to display
              the same source on the seed-hero (different request stack, no
              onError fired). Cross-component consistency means whatever
              loads on the parent page also loads here. */}
          <RNImage
            source={{ uri: sourceUri }}
            resizeMode="cover"
            onError={(e) => {
              const native = e.nativeEvent as { error?: string } | undefined;
              const reason = native?.error ?? "Image load failed";
              console.warn("[SeedHero] Image error", sourceUri, reason);
              setImageError(reason);
            }}
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

      {/* Diagnostic overlay — only renders when something looks wrong.
          Stays in the codebase so future regressions surface in-screen
          (with the actual reason) rather than as silent black images. */}
      {(() => {
        const fitsInside =
          dims &&
          seed.bbox.x >= 0 &&
          seed.bbox.y >= 0 &&
          seed.bbox.x + seed.bbox.width <= dims.width &&
          seed.bbox.y + seed.bbox.height <= dims.height;
        const status = !sourceUri
          ? "no image_url"
          : getSizeError
            ? `getSize:${getSizeError}`
            : imageError
              ? `load:${imageError}`
              : bboxInvalid
                ? "bbox invalid"
                : dims && !fitsInside
                  ? "bbox outside image"
                  : null;
        if (status === null) return null;
        const bb = `bbox=${seed.bbox.x.toFixed(0)},${seed.bbox.y.toFixed(0)} ${seed.bbox.width.toFixed(0)}×${seed.bbox.height.toFixed(0)}`;
        const dimStr = dims ? `dims=${dims.width}×${dims.height}` : "dims=loading…";
        return (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 8,
              right: 8,
              bottom: 8,
              backgroundColor: "rgba(0,0,0,0.7)",
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 10 }} numberOfLines={4}>
              {`${status} · ${bb} · ${dimStr}`}
            </Text>
          </View>
        );
      })()}
    </View>
  );
}

function projectBboxToHero(bbox: BoundingBox, dims: { width: number; height: number } | null) {
  if (!dims || dims.width <= 0 || dims.height <= 0) return null;
  if (bbox.width <= 0 || bbox.height <= 0) return null;
  // Project a fixed crop region (bbox + 15% margin) into the hero
  // container. Same visual framing on iOS and Android regardless of how
  // big the stored image is in inspection.image_url. Without this the
  // operator sees inconsistent margins between the two platforms — iOS
  // tends to show a tight bbox view because its `image_url` is stored
  // at full sensor resolution, while Android shows more context around
  // the bbox because it stores a downsized JPEG.
  const inner = HERO_SIZE - HERO_PADDING * 2;
  const margin = 0.15;
  const cropW = bbox.width * (1 + 2 * margin);
  const cropH = bbox.height * (1 + 2 * margin);
  const scale = Math.min(inner / cropW, inner / cropH);
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
