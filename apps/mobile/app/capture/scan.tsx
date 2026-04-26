import { useRef, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Camera as VCCamera } from "react-native-vision-camera";
import { Viewfinder } from "@/components/camera/Viewfinder";
import { GlassTopBar } from "@/components/camera/GlassTopBar";
import { ShutterBar } from "@/components/camera/ShutterBar";
import { KpiStrip } from "@/components/camera/KpiStrip";
import { CalibrationPill } from "@/components/camera/CalibrationPill";
import { useFrameTicker } from "@/lib/analyzer/useFrameTicker";
import { useCaptureSession } from "@/lib/capture/session";

/**
 * Live capture screen.
 *
 * Renders the live camera preview, the prototype's `.cam-stats` KPI strip
 * driven by the mock analyzer's `analyzeFrame` ticker, and a calibration
 * status pill. The shutter takes a high-res photo via vision-camera, persists
 * the URI on the capture session, and routes to /capture/processing.
 *
 * Phase 4 swaps `useFrameTicker` for a real vision-camera frame processor.
 * The KPI strip's data shape (`AnalysisFrameResult`) stays the same.
 */
export default function CaptureScan() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const session = useCaptureSession();
  const cameraRef = useRef<VCCamera>(null);
  const [busy, setBusy] = useState(false);

  // Drives the bottom KPI strip with mock detections every ~200 ms.
  const frameResult = useFrameTicker(!busy);

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

          {/* Inline calibration pill — sits below the top bar. */}
          <View className="items-center mt-xs" pointerEvents="box-none">
            <CalibrationPill reading={null} />
          </View>

          {/* Phase 4 will render Skia detection rings in this region. */}
          <View className="flex-1" />

          <KpiStrip frameResult={frameResult} />

          <ShutterBar onShutter={onShutter} isLive disabled={busy} />
        </SafeAreaView>
      </Viewfinder>
    </View>
  );
}
