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
 * Live capture screen.
 *
 * Phase 2 scope: viewfinder renders the live camera preview, shutter takes a
 * photo via vision-camera's `takePhoto`, persists the local URI on the
 * capture session, and routes to /capture/processing.
 *
 * Phase 4 layers in the frame-processor + analyzer to draw real detection
 * rings on the preview. ROI tools (Phase 6b) and recording (Phase 7b) attach
 * via the placeholders already wired in `ShutterBar`.
 */
export default function CaptureScan() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const session = useCaptureSession();
  const cameraRef = useRef<VCCamera>(null);
  const [busy, setBusy] = useState(false);

  const onShutter = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: "auto",
        enableShutterSound: true,
      });
      const uri = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`;
      session.set({ capturedImageUri: uri, uploadedImageUrl: null });
      router.push("/capture/processing");
    } catch (err) {
      console.error("[scan] takePhoto failed", err);
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-black">
      <Viewfinder active cameraRef={cameraRef}>
        <SafeAreaView className="flex-1" edges={["top", "bottom"]} pointerEvents="box-none">
          <GlassTopBar
            centerLabel={`${t("inspections:capture.live.pillLabel")} · ${t("inspections:capture.shutter")}`}
            centerDotColor="#5DCAA5"
          />

          {/* Spacer — Phase 4 will render detection-ring overlays here */}
          <View className="flex-1" />

          {/* Phase 4 will replace this with a live KPI strip
              (Count / Avg mm / Grade A%) updating each frame. */}
          <View className="mx-md mb-md flex-row gap-md rounded-xl bg-black/55 px-lg py-md">
            <Stat label={t("inspections:detail.summary.totalSeeds")} value="—" />
            <Stat label={t("inspections:detail.summary.meanLength")} value="—" />
            <Stat label={t("inspections:seedGrade.A")} value="—" />
          </View>

          <ShutterBar onShutter={onShutter} isLive disabled={busy} />
        </SafeAreaView>
      </Viewfinder>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-white text-h2 font-medium">{value}</Text>
      <Text className="text-white/70 text-caption uppercase">{label}</Text>
    </View>
  );
}
