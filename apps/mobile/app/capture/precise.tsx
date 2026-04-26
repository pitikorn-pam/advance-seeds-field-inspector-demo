import { useRef, useState } from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Camera as VCCamera } from "react-native-vision-camera";
import { Viewfinder } from "@/components/camera/Viewfinder";
import { GlassTopBar } from "@/components/camera/GlassTopBar";
import { ShutterBar } from "@/components/camera/ShutterBar";
import { useCaptureSession } from "@/lib/capture/session";

/**
 * Precise capture mode.
 *
 * Phase 2 scope: same shutter behaviour as scan, but with corner brackets and
 * "Hold steady" guidance overlays. The calibration-lock UX (LiDAR distance
 * pill, gating shutter on lock) lands in Phase 5 once LiveCalibrator exists.
 * Until then, the shutter is enabled — same fallback as live mode.
 */
export default function CapturePrecise() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const session = useCaptureSession();
  const cameraRef = useRef<VCCamera>(null);
  const [busy, setBusy] = useState(false);

  const onShutter = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: "off",
        enableShutterSound: true,
      });
      const uri = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`;
      session.set({ capturedImageUri: uri, uploadedImageUrl: null });
      router.push("/capture/processing");
    } catch (err) {
      console.error("[precise] takePhoto failed", err);
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-black">
      <Viewfinder active cameraRef={cameraRef}>
        <SafeAreaView className="flex-1" edges={["top", "bottom"]} pointerEvents="box-none">
          <GlassTopBar
            centerLabel={`${t("inspections:capture.precise.pillLabel")} · ${t("inspections:capture.shutter")}`}
            centerDotColor="#B5D4F4"
          />

          {/* Corner brackets + "Hold steady" guidance — purely cosmetic in
              Phase 2; Phase 5 hooks calibration distance into the live label. */}
          <View className="flex-1 items-center justify-center" pointerEvents="none">
            <View className="absolute inset-0 m-2xl border-2 border-transparent">
              <View className="absolute top-0 left-0 h-6 w-6 border-t-2 border-l-2 border-white" />
              <View className="absolute top-0 right-0 h-6 w-6 border-t-2 border-r-2 border-white" />
              <View className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-white" />
              <View className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-white" />
            </View>
            <Text className="text-white/60 text-caption">Hold steady</Text>
            <Text className="text-white/85 text-display font-medium tracking-tight">— cm</Text>
          </View>

          <ShutterBar onShutter={onShutter} disabled={busy} />
        </SafeAreaView>
      </Viewfinder>
    </View>
  );
}
