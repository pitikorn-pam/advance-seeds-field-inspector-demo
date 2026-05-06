import { useState } from "react";
import { Image, Text, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import type { Roi } from "@/lib/capture/roi";
import { RoiPreviewOverlay } from "@/components/camera/RoiPreviewOverlay";

interface Props {
  uri: string;
  kind: "photo" | "video";
  roi?: Roi | null;
}

export function CaptureMediaPreview({ uri, kind, roi = null }: Props) {
  if (kind === "video") {
    return (
      <View className="h-full w-full">
        <VideoPreview uri={uri} />
        <RoiPreviewOverlay roi={roi} />
      </View>
    );
  }
  return <PhotoPreview uri={uri} roi={roi} />;
}

function PhotoPreview({ uri, roi }: { uri: string; roi: Roi | null }) {
  const [error, setError] = useState<string | null>(null);
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
