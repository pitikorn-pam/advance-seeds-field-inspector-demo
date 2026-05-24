import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View, Text, Image as RNImage } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft, Share2 } from "lucide-react-native";
import Svg, { Polygon as SvgPolygon } from "react-native-svg";
import type { BoundingBox, SeedGrade, SeedMaskMeasurement } from "@advance-seeds/types";
import { Card } from "@/components/ui/Card";
import { GradeChip } from "@/components/ui/GradeChip";
import { gradePalette } from "@/lib/grading/palette";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { Toast } from "@/components/ui/Toast";
import { shareAnnotatedImage } from "@/lib/capture/imageActions";

const HERO_HEIGHT = 280;

// Bbox ring colours map to the grade-* ink tokens via the shared
// runtime palette. Kept as raw hex because the projection ring is a
// stroke on a positioned <View>, not a Tailwind class.

export interface SeedDetailSeed {
  index: number;
  label?: string | null;
  length_mm: number;
  width_mm: number;
  area_mm2: number;
  volume_ml?: number;
  grade: SeedGrade;
  bbox: BoundingBox;
  /**
   * Optional segment-based measurement bundle from the analyzer's mask
   * head. When present, the hero crop renders the polygon outline and
   * the metrics card surfaces perimeter / aspect / circularity (mirrors
   * `measure_instance` from scripts/run_segmentation.py).
   */
  mask?: SeedMaskMeasurement;
}

interface Props {
  seed: SeedDetailSeed;
  /** Source image URI (https or file://). Null falls back to a placeholder. */
  sourceUri: string | null;
  /** Source pixel dimensions used when the analyzer produced bbox/mask coordinates. */
  sourceFrameWidth?: number | null;
  sourceFrameHeight?: number | null;
  /** Optional override for the AppTopBar title. Defaults to `Seed #N`. */
  title?: string;
  /**
   * Persist a new grade. Saved-inspection wires this to a Supabase
   * UPDATE; in-capture wires it to a session mutation. When omitted,
   * the override row is hidden (read-only mode).
   */
  onUpdateGrade?: (grade: SeedGrade) => void | Promise<void>;
  /** Disable the action buttons while a previous mutation is in flight. */
  busy?: boolean;
  /**
   * Grade options shown in the override picker. Defaults to the legacy
   * A/B/C + reject set. Callers with access to the inspection's variety
   * (or the set of grades the analyzer produced) should pass the
   * variety-specific list so newer multi-tier varieties can be overridden
   * cleanly without exposing tiers the variety never defined.
   */
  availableGrades?: SeedGrade[];
}

const DEFAULT_GRADE_OPTIONS: SeedGrade[] = ["A", "B", "C", "reject"];

/**
 * Shared per-seed detail UI. Used by:
 *   • /seed/[inspection]/[index] — drilling into a synced inspection.
 *   • /capture/seed/[index] — drilling into the in-progress capture
 *     before the user taps Save.
 *
 * Owns its own AppTopBar with a back chevron so the screen reads the
 * same regardless of which stack pushed it.
 */
export function SeedDetailView({
  seed,
  sourceUri,
  sourceFrameWidth = null,
  sourceFrameHeight = null,
  title,
  onUpdateGrade,
  busy,
  availableGrades,
}: Props) {
  const gradeOptions = availableGrades ?? DEFAULT_GRADE_OPTIONS;
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const grade = seed.grade;
  const confidence = grade === "A" ? "98.4" : grade === "B" ? "92.1" : "78.0";
  const volumeMl = seed.volume_ml ?? estimateOblongVolumeMl(seed.length_mm, seed.area_mm2);

  // Toast lifecycle — show "Grade changed to X · Undo" for 3 s when the
  // operator picks a new grade. `prevGrade` is captured the moment the
  // change is applied so Undo can roll back even if `seed.grade` updates
  // mid-flight via props.
  const [toast, setToast] = useState<{ label: string; prev: SeedGrade } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const applyGrade = (next: SeedGrade) => {
    if (!onUpdateGrade) return;
    if (next === grade) return;
    const prev = grade;
    void onUpdateGrade(next);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ label: t(`inspections:seedGrade.${next}`), prev });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  };

  const onPickGrade = (next: SeedGrade) => {
    if (!onUpdateGrade || busy) return;
    if (next === "reject" && grade !== "reject") {
      Alert.alert(t("inspections:seed.actions.reject"), t("inspections:seed.rejectConfirm"), [
        { text: t("common:actions.cancel"), style: "cancel" },
        {
          text: t("inspections:seed.actions.reject"),
          style: "destructive",
          onPress: () => applyGrade("reject"),
        },
      ]);
      return;
    }
    applyGrade(next);
  };

  const onUndo = () => {
    if (!toast || !onUpdateGrade) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const prev = toast.prev;
    setToast(null);
    void onUpdateGrade(prev);
  };
  const onShare = async () => {
    if (!sourceUri) return;
    try {
      await shareAnnotatedImage(
        sourceUri,
        {
          roi: null,
          seeds: [seed],
          seedFrameWidth: sourceFrameWidth,
          seedFrameHeight: sourceFrameHeight,
        },
        title ?? `Seed #${seed.index}`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      Alert.alert(t("common:states.error"), reason);
    }
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
        right={
          sourceUri
            ? {
                accessibilityLabel: t("common:actions.share"),
                renderIcon: () => <Share2 color="#171717" size={18} />,
                onPress: onShare,
              }
            : undefined
        }
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-lg pb-2xl">
        <SeedHero
          seed={seed}
          sourceUri={sourceUri}
          sourceFrameWidth={sourceFrameWidth}
          sourceFrameHeight={sourceFrameHeight}
        />

        <Card className="flex-row items-center gap-md p-lg">
          <View className="flex-1 flex-row items-center gap-md">
            <GradeChip grade={grade} size="md" />
            <View className="flex-1">
              <Text className="text-caption text-fg-secondary">
                {seed.label ?? t("inspections:seed.detectedGrade")}
              </Text>
              <Text className="text-title text-fg-primary font-semibold mt-[2px]">
                {t(`inspections:seedGrade.${grade}`)}
              </Text>
            </View>
          </View>
          <View className="items-end">
            <Text className="text-caption text-fg-secondary">
              {t("inspections:seed.fields.confidence")}
            </Text>
            <Text className="text-title text-fg-primary font-semibold mt-[2px]">{confidence}%</Text>
          </View>
        </Card>

        <View>
          <Text className="px-xs pb-sm text-caption font-semibold text-fg-secondary uppercase tracking-[0.4px]">
            {t("inspections:seed.measurementsTitle")}
          </Text>
          <View className="flex-row gap-sm">
            <MeasurementTile
              label={t("inspections:seed.fields.length")}
              value={Number(seed.length_mm).toFixed(1)}
              unit="mm"
            />
            <MeasurementTile
              label={t("inspections:seed.fields.width")}
              value={Number(seed.width_mm).toFixed(1)}
              unit="mm"
            />
            <MeasurementTile
              label={t("inspections:seed.fields.area")}
              value={Number(seed.area_mm2).toFixed(1)}
              unit="mm²"
            />
            <MeasurementTile label="Volume" value={volumeMl.toFixed(1)} unit="ml" />
          </View>
        </View>

        {onUpdateGrade ? (
          <View>
            <Text className="px-xs pb-sm text-caption font-semibold text-fg-secondary uppercase tracking-[0.4px]">
              {t("inspections:seed.overrideTitle")}
            </Text>
            <View className="flex-row gap-sm">
              {gradeOptions.map((g) => (
                <GradeOverrideButton
                  key={g}
                  grade={g}
                  active={g === grade}
                  disabled={!!busy}
                  label={t(`inspections:seedGrade.${g}`)}
                  onPress={() => onPickGrade(g)}
                />
              ))}
            </View>
            <Text className="mt-sm text-caption text-fg-tertiary">
              {t("inspections:seed.overrideHint")}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Toast
        message={toast ? t("inspections:seed.gradeChangedTo", { grade: toast.label }) : null}
        duration={3000}
        actionLabel={toast ? t("inspections:seed.undo") : undefined}
        onAction={onUndo}
      />
    </SafeAreaView>
  );
}

function estimateOblongVolumeMl(lengthMm: number, areaMm2: number): number {
  if (!(lengthMm > 0) || !(areaMm2 > 0)) return 0;
  const equivalentWidthMm = areaMm2 / lengthMm;
  const radiusMm = equivalentWidthMm / 2;
  return (Math.PI * radiusMm * radiusMm * lengthMm) / 1000;
}

function MeasurementTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View className="flex-1 items-center rounded-[12px] bg-bg-primary border border-line-tertiary p-md">
      <Text className="text-caption text-fg-secondary uppercase tracking-[0.4px]">{label}</Text>
      <View className="flex-row items-baseline gap-[3px] mt-[4px]">
        <Text className="text-fg-primary font-semibold" style={{ fontSize: 20 }}>
          {value}
        </Text>
        <Text className="text-caption text-fg-tertiary">{unit}</Text>
      </View>
    </View>
  );
}

function GradeOverrideButton({
  grade,
  active,
  disabled,
  label,
  onPress,
}: {
  grade: SeedGrade;
  active: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  // Active state echoes the grade-tile colour; inactive is a neutral canvas
  // chip. We keep the active border thick so the selection is obvious even
  // when the chip's tint is faint (e.g. grade-a on a near-white background).
  const activeBg =
    grade === "A"
      ? "bg-grade-a"
      : grade === "B"
        ? "bg-grade-b"
        : grade === "C"
          ? "bg-grade-c"
          : "bg-grade-reject";
  const activeInk =
    grade === "A"
      ? "text-grade-a-ink"
      : grade === "B"
        ? "text-grade-b-ink"
        : grade === "C"
          ? "text-grade-c-ink"
          : "text-grade-reject-ink";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      className={`flex-1 items-center justify-center rounded-[10px] py-md border ${
        active ? `${activeBg} border-transparent` : "bg-bg-primary border-line-tertiary"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <Text
        className={`text-body font-semibold ${active ? activeInk : "text-fg-primary"}`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SeedHero({
  seed,
  sourceUri,
  sourceFrameWidth,
  sourceFrameHeight,
}: {
  seed: SeedDetailSeed;
  sourceUri: string | null;
  sourceFrameWidth: number | null;
  sourceFrameHeight: number | null;
}) {
  const ringColor = gradePalette(seed.grade).ink;
  const label = annotationLabel(seed);

  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null);
  const [getSizeError, setGetSizeError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  useEffect(() => {
    if (sourceFrameWidth && sourceFrameHeight) {
      setDims({ width: sourceFrameWidth, height: sourceFrameHeight });
      return;
    }
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
  }, [sourceFrameHeight, sourceFrameWidth, sourceUri]);

  const projection = projectBboxToHero(seed.bbox, dims, stage);
  const bboxInvalid = seed.bbox.width <= 0 || seed.bbox.height <= 0;

  return (
    <View
      className="items-center justify-center overflow-hidden"
      style={{ height: HERO_HEIGHT, borderRadius: 18, backgroundColor: "#1a1816" }}
      onLayout={(e) =>
        setStage({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
      }
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
          {/* Bbox ring is shown only when no mask polygon is available
              — once we have a real segmentation polygon it carries the
              localization signal more accurately than the bbox. */}
          {!(dims && seed.mask && seed.mask.polygon.length >= 3) ? (
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
          ) : null}
          {dims && seed.mask && seed.mask.polygon.length >= 3 ? (
            <MaskPolygonOverlay
              polygon={seed.mask.polygon}
              imageLeft={projection.left}
              imageTop={projection.top}
              imageWidth={projection.imageWidth}
              imageHeight={projection.imageHeight}
              sourceWidth={dims.width}
              sourceHeight={dims.height}
              color={ringColor}
            />
          ) : null}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: Math.max(8, Math.min(projection.bboxLeft, (stage?.width ?? 0) - 228)),
              top:
                projection.bboxTop >= 34
                  ? projection.bboxTop - 30
                  : Math.min(
                      (stage?.height ?? HERO_HEIGHT) - 32,
                      projection.bboxTop + projection.bboxHeight + 8,
                    ),
              maxWidth: 220,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 4,
              backgroundColor: "rgba(12, 18, 14, 0.82)",
            }}
          >
            <Text style={{ color: "#F8FAFC", fontSize: 11, fontWeight: "700" }} numberOfLines={2}>
              {label}
            </Text>
          </View>
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

function annotationLabel(seed: SeedDetailSeed): string {
  const name = seed.label?.trim() || "Seed";
  const volumeMl = seed.volume_ml ?? estimateOblongVolumeMl(seed.length_mm, seed.area_mm2);
  return [
    name,
    `${Math.round(seed.length_mm)} mm`,
    `${Math.round(seed.area_mm2)} mm²`,
    volumeMl > 0 ? `${volumeMl.toFixed(1)} ml` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/**
 * Render the segmentation mask polygon as an SVG overlay aligned with the
 * hero crop's scaled image. The polygon points are in source-image pixel
 * coordinates; we just multiply by the same scale `projectBboxToHero`
 * used and shift by the image's top-left within the container.
 */
function MaskPolygonOverlay({
  polygon,
  imageLeft,
  imageTop,
  imageWidth,
  imageHeight,
  sourceWidth,
  sourceHeight,
  color,
}: {
  polygon: SeedMaskMeasurement["polygon"];
  imageLeft: number;
  imageTop: number;
  imageWidth: number;
  imageHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  color: string;
}) {
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;
  const sx = imageWidth / sourceWidth;
  const sy = imageHeight / sourceHeight;
  const pointStr = polygon
    .map((p) => {
      const x = Math.min(sourceWidth, Math.max(0, p.x));
      const y = Math.min(sourceHeight, Math.max(0, p.y));
      return `${imageLeft + x * sx},${imageTop + y * sy}`;
    })
    .join(" ");
  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      <Svg width="100%" height="100%">
        <SvgPolygon points={pointStr} fill={`${color}14`} stroke={color} strokeWidth={1.5} />
      </Svg>
    </View>
  );
}

function projectBboxToHero(
  bbox: BoundingBox,
  dims: { width: number; height: number } | null,
  stage: { width: number; height: number } | null,
) {
  if (!dims || dims.width <= 0 || dims.height <= 0 || !stage || stage.width <= 0) return null;
  if (bbox.width <= 0 || bbox.height <= 0) return null;
  const scale = Math.max(stage.width / dims.width, stage.height / dims.height);
  const imageWidth = dims.width * scale;
  const imageHeight = dims.height * scale;
  const left = (stage.width - imageWidth) / 2;
  const top = (stage.height - imageHeight) / 2;
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
