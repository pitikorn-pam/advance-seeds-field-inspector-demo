import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import Svg, { Polygon as SvgPolygon } from "react-native-svg";
import { X } from "lucide-react-native";
import type { Roi } from "@/lib/capture/roi";
import { RoiPreviewOverlay } from "@/components/camera/RoiPreviewOverlay";

export interface SeedPreviewOverlayItem {
  index: number;
  grade?: string | null;
  label?: string | null;
  length_mm?: number | null;
  area_mm2?: number | null;
  volume_ml?: number | null;
  bbox: { x: number; y: number; width: number; height: number };
  mask?: {
    polygon: ReadonlyArray<{ x: number; y: number }>;
  } | null;
}

interface Props {
  uri: string;
  kind: "photo" | "video";
  roi?: Roi | null;
  seeds?: readonly SeedPreviewOverlayItem[] | null;
  seedFrameWidth?: number | null;
  seedFrameHeight?: number | null;
  openOnPress?: boolean;
  deferVideoPreview?: boolean;
  onVideoLoadingChange?: (loading: boolean) => void;
}

export function CaptureMediaPreview({
  uri,
  kind,
  roi = null,
  seeds = null,
  seedFrameWidth = null,
  seedFrameHeight = null,
  openOnPress = true,
  deferVideoPreview = false,
  onVideoLoadingChange,
}: Props) {
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  useEffect(() => {
    if (!videoOpen) {
      setVideoLoading(false);
      onVideoLoadingChange?.(false);
      return;
    }
    setVideoLoading(true);
    onVideoLoadingChange?.(true);
    const timer = setTimeout(() => {
      setVideoLoading(false);
      onVideoLoadingChange?.(false);
    }, 650);
    return () => clearTimeout(timer);
  }, [onVideoLoadingChange, videoOpen]);
  if (kind === "video") {
    return (
      <View className="h-full w-full">
        {deferVideoPreview ? (
          <View className="h-full w-full bg-black" />
        ) : (
          <VideoPreview uri={uri} nativeControls={!openOnPress} />
        )}
        <RoiPreviewOverlay roi={roi} />
        <SeedPreviewOverlay
          seeds={seeds}
          frameWidth={seedFrameWidth}
          frameHeight={seedFrameHeight}
        />
        {openOnPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open video"
            onPress={() => {
              setVideoLoading(true);
              onVideoLoadingChange?.(true);
              setVideoOpen(true);
            }}
            className="absolute inset-0"
          />
        ) : null}
        <Modal visible={videoOpen} animationType="fade" presentationStyle="fullScreen">
          <View className="flex-1 bg-black">
            <VideoPreview uri={uri} nativeControls />
            {videoLoading ? (
              <View className="absolute inset-0 items-center justify-center bg-black/55">
                <ActivityIndicator color="#FFFFFF" />
                <Text className="mt-sm text-caption font-medium text-white">Loading video</Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close video"
              onPress={() => setVideoOpen(false)}
              className="absolute right-xl h-14 w-14 items-center justify-center rounded-full bg-black/70"
              style={{ top: 72 }}
              hitSlop={12}
            >
              <X color="#FFFFFF" size={26} />
            </Pressable>
          </View>
        </Modal>
      </View>
    );
  }
  return (
    <PhotoPreview
      uri={uri}
      roi={roi}
      seeds={seeds}
      seedFrameWidth={seedFrameWidth}
      seedFrameHeight={seedFrameHeight}
    />
  );
}

function PhotoPreview({
  uri,
  roi,
  seeds,
  seedFrameWidth,
  seedFrameHeight,
}: {
  uri: string;
  roi: Roi | null;
  seeds: readonly SeedPreviewOverlayItem[] | null;
  seedFrameWidth: number | null;
  seedFrameHeight: number | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri,
      (width, height) => {
        if (!cancelled) setImageSize({ width, height });
      },
      () => {
        if (!cancelled) setImageSize(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);
  return (
    <View className="h-full w-full bg-bg-tertiary">
      {error ? (
        <View className="absolute inset-0 items-center justify-center px-md">
          <Text className="text-caption text-danger-text text-center" numberOfLines={3}>
            {error}
          </Text>
          <Text
            className="text-caption text-fg-tertiary text-center mt-xs"
            numberOfLines={2}
            selectable
          >
            {uri}
          </Text>
        </View>
      ) : (
        <Image
          source={{ uri }}
          className="h-full w-full"
          resizeMode="cover"
          onError={(e) => {
            const native = e.nativeEvent as { error?: string } | undefined;
            const reason = native?.error ?? "Image render failed";
            console.warn("[CaptureMediaPreview] image load failed", uri, reason);
            setError(reason);
          }}
        />
      )}
      <RoiPreviewOverlay roi={roi} />
      <SeedPreviewOverlay
        seeds={seeds}
        frameWidth={seedFrameWidth ?? imageSize?.width ?? null}
        frameHeight={seedFrameHeight ?? imageSize?.height ?? null}
      />
    </View>
  );
}

function VideoPreview({ uri, nativeControls }: { uri: string; nativeControls?: boolean }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: "100%" }}
      contentFit="cover"
      nativeControls={nativeControls}
    />
  );
}

function SeedPreviewOverlay({
  seeds,
  frameWidth,
  frameHeight,
}: {
  seeds: readonly SeedPreviewOverlayItem[] | null;
  frameWidth: number | null;
  frameHeight: number | null;
}) {
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const projected = useMemo(() => {
    if (!seeds?.length || !stageSize || !frameWidth || !frameHeight) return [];
    const scale = Math.max(stageSize.width / frameWidth, stageSize.height / frameHeight);
    const dx = (frameWidth * scale - stageSize.width) / 2;
    const dy = (frameHeight * scale - stageSize.height) / 2;
    return seeds.map((seed) => {
      const polygon =
        seed.mask?.polygon && seed.mask.polygon.length >= 3
          ? seed.mask.polygon.map((p) => ({
              x: clamp(p.x, 0, frameWidth) * scale - dx,
              y: clamp(p.y, 0, frameHeight) * scale - dy,
            }))
          : null;
      const bounds = polygon ? polygonBounds(polygon) : null;
      return {
        ...seed,
        x: bounds?.x ?? seed.bbox.x * scale - dx,
        y: bounds?.y ?? seed.bbox.y * scale - dy,
        width: bounds?.width ?? seed.bbox.width * scale,
        height: bounds?.height ?? seed.bbox.height * scale,
        bboxX: seed.bbox.x * scale - dx,
        bboxY: seed.bbox.y * scale - dy,
        bboxWidth: seed.bbox.width * scale,
        bboxHeight: seed.bbox.height * scale,
        polygon,
      };
    });
  }, [frameHeight, frameWidth, seeds, stageSize]);

  return (
    <View
      pointerEvents="none"
      className="absolute inset-0"
      onLayout={(e) =>
        setStageSize({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
    >
      {projected.some((seed) => seed.polygon) && stageSize ? (
        <Svg
          width={stageSize.width}
          height={stageSize.height}
          viewBox={`0 0 ${stageSize.width} ${stageSize.height}`}
          style={{ position: "absolute", left: 0, top: 0 }}
        >
          {projected.map((seed) =>
            seed.polygon ? (
              <SvgPolygon
                key={`${seed.index}-poly`}
                points={seed.polygon.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
                fill="rgba(34, 197, 94, 0.08)"
                stroke="#22C55E"
                strokeWidth={2}
              />
            ) : null,
          )}
        </Svg>
      ) : null}
      {projected.map((seed) => {
        const label = annotationLabel(seed);
        return (
          <View
            key={`${seed.index}-${seed.x}-${seed.y}`}
            style={{
              position: "absolute",
              left: seed.x,
              top: seed.y,
              width: Math.max(1, seed.width),
              height: Math.max(1, seed.height),
              borderWidth: seed.polygon ? 0 : 2,
              borderColor: seed.polygon ? "transparent" : "#22C55E",
              borderRadius: seed.polygon ? 0 : 4,
              backgroundColor: seed.polygon ? "transparent" : "rgba(34, 197, 94, 0.06)",
            }}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                top: -24,
                minWidth: 58,
                maxWidth: 220,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                backgroundColor: "rgba(12, 18, 14, 0.82)",
              }}
            >
              <Text style={{ color: "#F8FAFC", fontSize: 10, fontWeight: "700" }} numberOfLines={1}>
                {label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function polygonBounds(points: ReadonlyArray<{ x: number; y: number }>) {
  if (points.length === 0) return null;
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function annotationLabel(seed: SeedPreviewOverlayItem): string {
  const name = seed.label?.trim() || "Seed";
  const parts = [name];
  if (typeof seed.length_mm === "number" && Number.isFinite(seed.length_mm)) {
    parts.push(`${Math.round(seed.length_mm)} mm`);
  }
  if (typeof seed.area_mm2 === "number" && Number.isFinite(seed.area_mm2) && seed.area_mm2 > 0) {
    parts.push(`${Math.round(seed.area_mm2)} mm²`);
  }
  if (typeof seed.volume_ml === "number" && Number.isFinite(seed.volume_ml) && seed.volume_ml > 0) {
    parts.push(`${seed.volume_ml.toFixed(1)} ml`);
  }
  return parts.join(" · ");
}
