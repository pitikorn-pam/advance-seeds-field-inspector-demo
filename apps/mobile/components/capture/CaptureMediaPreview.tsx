import { Image, View } from "react-native";
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
  return (
    <View className="h-full w-full">
      <Image source={{ uri }} className="h-full w-full" resizeMode="cover" />
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
