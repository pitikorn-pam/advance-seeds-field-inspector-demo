import { useEffect, useMemo, useState } from "react";
import { Image, Text, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import type { Roi } from "@/lib/capture/roi";
import { RoiPreviewOverlay } from "@/components/camera/RoiPreviewOverlay";

export interface SeedPreviewOverlayItem {
  index: number;
  grade?: string | null;
  bbox: { x: number; y: number; width: number; height: number };
}

interface Props {
  uri: string;
  kind: "photo" | "video";
  roi?: Roi | null;
  seeds?: readonly SeedPreviewOverlayItem[] | null;
  seedFrameWidth?: number | null;
  seedFrameHeight?: number | null;
}

export function CaptureMediaPreview({
  uri,
  kind,
  roi = null,
  seeds = null,
  seedFrameWidth = null,
  seedFrameHeight = null,
}: Props) {
  if (kind === "video") {
    return (
      <View className="h-full w-full">
        <VideoPreview uri={uri} />
        <RoiPreviewOverlay roi={roi} />
        <SeedPreviewOverlay
          seeds={seeds}
          frameWidth={seedFrameWidth}
          frameHeight={seedFrameHeight}
        />
      </View>
    );
  }
  return <PhotoPreview uri={uri} roi={roi} seeds={seeds} />;
}

function PhotoPreview({
  uri,
  roi,
  seeds,
}: {
  uri: string;
  roi: Roi | null;
  seeds: readonly SeedPreviewOverlayItem[] | null;
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
        frameWidth={imageSize?.width ?? null}
        frameHeight={imageSize?.height ?? null}
      />
    </View>
  );
}

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: "100%" }}
      contentFit="cover"
      nativeControls
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
    return seeds.map((seed) => ({
      ...seed,
      x: seed.bbox.x * scale - dx,
      y: seed.bbox.y * scale - dy,
      width: seed.bbox.width * scale,
      height: seed.bbox.height * scale,
    }));
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
      {projected.map((seed) => {
        const label = `#${seed.index}${seed.grade ? ` ${seed.grade}` : ""}`;
        return (
          <View
            key={`${seed.index}-${seed.x}-${seed.y}`}
            style={{
              position: "absolute",
              left: seed.x,
              top: seed.y,
              width: seed.width,
              height: seed.height,
              borderWidth: 2,
              borderColor: "#22C55E",
              borderRadius: 4,
              backgroundColor: "rgba(34, 197, 94, 0.10)",
            }}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                top: -22,
                minWidth: 44,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                backgroundColor: "rgba(12, 18, 14, 0.82)",
              }}
            >
              <Text style={{ color: "#F8FAFC", fontSize: 11, fontWeight: "700" }}>{label}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
