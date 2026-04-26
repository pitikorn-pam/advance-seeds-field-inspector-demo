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
import { RoiOverlay } from "@/components/camera/RoiOverlay";
import { RoiToolbar } from "@/components/camera/RoiToolbar";
import { useFrameTicker } from "@/lib/analyzer/useFrameTicker";
import { useCaptureSession } from "@/lib/capture/session";
import type { Roi, RoiKind } from "@/lib/capture/roi";

/**
 * Live capture screen.
 *
 * Renders the live camera preview, the prototype's `.cam-stats` KPI strip
 * driven by the mock analyzer's `analyzeFrame` ticker, a calibration status
 * pill, and the Phase 6b ROI tools. The shutter takes a high-res photo via
 * vision-camera, persists the URI on the capture session, and routes to
 * /capture/processing.
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
  const [cameraActive, setCameraActive] = useState(true);
  const [roiTool, setRoiTool] = useState<RoiKind | null>(null);

  // Drives the bottom KPI strip with mock detections every ~200 ms.
  const frameResult = useFrameTicker(!busy);

  const setRoi = (roi: Roi | null) => session.set({ roi });

  const onClosePolygon = () => {
    if (session.roi?.kind === "polygon" && session.roi.points.length >= 3) {
      setRoi({ ...session.roi, closed: true });
      setRoiTool(null);
    }
  };

  const onClearRoi = () => {
    setRoi(null);
    setRoiTool(null);
  };

  const onShutter = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // flash: "off" is the safest default cross-device. Some Android cameras
      // throw on flash: "auto" if the lens doesn't expose auto mode; we'll
      // wire a UI flash toggle in Phase 6 once we read `device.hasFlash`.
      const photo = await cameraRef.current.takePhoto({ flash: "off" });
      const uri = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`;
      session.set({ capturedImageUri: uri, uploadedImageUrl: null });

      // Deactivate the camera, then wait a frame before navigating so Android
      // releases the SurfaceView before react-native-screens draws the
      // transition. Without this gap we hit IndexOutOfBoundsException in
      // ScreenStack.performDraw on certain devices (Z Flip 7 FE among them).
      setCameraActive(false);
      setTimeout(() => router.push("/capture/processing"), 60);
    } catch (err) {
      console.error("[scan] takePhoto failed", err);
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-black">
      <Viewfinder active={cameraActive} cameraRef={cameraRef}>
        <SafeAreaView className="flex-1" edges={["top", "bottom"]} pointerEvents="box-none">
          <GlassTopBar
            centerLabel={`${t("inspections:capture.live.pillLabel")} · ${t("inspections:capture.shutter")}`}
            centerDotColor="#5DCAA5"
          />

          {/* Inline calibration pill — sits below the top bar. */}
          <View className="items-center mt-xs" pointerEvents="box-none">
            <CalibrationPill reading={null} />
          </View>

          {/* ROI overlay sits between the chrome and the KPI strip. When no
              tool is active it's pointerEvents-transparent and only renders
              the committed shape; when a tool is active it captures touches
              for drawing. Phase 4 will render Skia detection rings here too. */}
          <View className="flex-1" pointerEvents="box-none">
            <RoiOverlay drawingTool={roiTool} roi={session.roi} onRoi={setRoi} />
          </View>

          <RoiToolbar
            activeTool={roiTool}
            onSelectTool={setRoiTool}
            roi={session.roi}
            onClear={onClearRoi}
            onClosePolygon={onClosePolygon}
          />

          <KpiStrip frameResult={frameResult} roi={session.roi} />

          <ShutterBar onShutter={onShutter} isLive disabled={busy} />
        </SafeAreaView>
      </Viewfinder>
    </View>
  );
}
