import { useRef, useState } from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Camera as VCCamera } from "react-native-vision-camera";
import { Viewfinder } from "@/components/camera/Viewfinder";
import { GlassTopBar } from "@/components/camera/GlassTopBar";
import type { FlashMode } from "@/components/camera/GlassTopBar";
import { ShutterBar } from "@/components/camera/ShutterBar";
import { CalibrationBanner } from "@/components/camera/CalibrationBanner";
import { useCaptureSession } from "@/lib/capture/session";
import { useCalibrator } from "@/lib/calibration/useCalibrator";

/**
 * Precise capture mode.
 *
 * Adds corner brackets, "Hold steady" guidance, distance indicator, and a
 * calibration banner pinned to the bottom of the camera stage. Today the
 * banner shows "Calibration unavailable" because LiveCalibrator (Phase 5)
 * isn't wired yet — the layout is exact so Phase 5 just provides a real
 * `CalibrationReading` object.
 *
 * The shutter remains enabled even without a lock (same fallback as live
 * mode) so the screen is testable end-to-end on hardware that lacks LiDAR.
 *
 * Camera controls (flash / flip / grid) mirror scan mode but live as local
 * state — there's no value carrying them across modes.
 */
export default function CapturePrecise() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const session = useCaptureSession();
  const cameraRef = useRef<VCCamera>(null);
  const [busy, setBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [position, setPosition] = useState<"back" | "front">("back");
  const [flashMode, setFlashMode] = useState<FlashMode>("off");
  const [showGrid, setShowGrid] = useState(false);
  const calibrator = useCalibrator();
  // Torch fallback for vision-camera's unreliable flash:'on' on iOS 26 +
  // iPhone 17 series — see scan.tsx for the rationale.
  const [torch, setTorch] = useState<"off" | "on">("off");
  const cameraTorch = flashMode === "on" && position === "back" ? "on" : torch;

  const cycleFlash = () =>
    setFlashMode((m) => (m === "off" ? "auto" : m === "auto" ? "on" : "off"));
  const toggleFlip = () => setPosition((p) => (p === "back" ? "front" : "back"));
  const toggleGrid = () => setShowGrid((g) => !g);

  const onShutter = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // Torch bracket for explicit "flash: on" + back camera. See scan.tsx
    // for the full rationale; key constraint is that takePhoto must use
    // flash:"off" while the torch is on, otherwise AVFoundation kills the
    // torch and the proper flash sequence doesn't fire on iOS 26.
    const wantFlash = flashMode === "on" && position === "back";
    if (wantFlash) {
      setTorch("on");
      await new Promise((r) => setTimeout(r, 120));
    }
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: wantFlash ? "off" : flashMode,
      });
      const uri = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`;
      session.set({
        capturedMediaKind: "photo",
        capturedImageUri: uri,
        capturedVideoUri: null,
        uploadedImageUrl: null,
        analysisResult: null,
        recordingDurationMs: null,
        recordingId: null,
        cameraPosition: position,
        flashMode,
        capturedAt: new Date().toISOString(),
      });

      // Deactivate the camera before pushing — same rnscreens-vs-camera-surface
      // race as scan mode (see scan.tsx for context).
      setCameraActive(false);
      setTimeout(() => router.push("/capture/processing"), 60);
    } catch (err) {
      console.error("[precise] takePhoto failed", err);
      setBusy(false);
    } finally {
      if (wantFlash) setTorch("off");
    }
  };

  return (
    <View className="flex-1 bg-black">
      <Viewfinder
        active={cameraActive}
        cameraRef={cameraRef}
        position={position}
        showGrid={showGrid}
        cameraProps={{ torch: cameraTorch }}
      >
        <SafeAreaView className="flex-1" edges={["top", "bottom"]} pointerEvents="box-none">
          <GlassTopBar
            centerLabel={`${t("inspections:capture.precise.pillLabel")} · ${t("inspections:capture.shutter")}`}
            centerDotColor="#B5D4F4"
            flashMode={flashMode}
            onFlashPress={cycleFlash}
          />

          {/* Corner brackets + "Hold steady" guidance. Phase 5 hooks the
              calibrator's distance reading into the live label below. */}
          <View className="flex-1 items-center justify-center" pointerEvents="none">
            <View className="absolute inset-0 m-2xl">
              <View className="absolute top-0 left-0 h-6 w-6 rounded-tl-md border-t-2 border-l-2 border-white/55" />
              <View className="absolute top-0 right-0 h-6 w-6 rounded-tr-md border-t-2 border-r-2 border-white/55" />
              <View className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-md border-b-2 border-l-2 border-white/55" />
              <View className="absolute bottom-0 right-0 h-6 w-6 rounded-br-md border-b-2 border-r-2 border-white/55" />
            </View>
            <Text className="text-white/60" style={{ fontSize: 12, fontWeight: "500" }}>
              {t("inspections:capture.precise.holdSteady")}
            </Text>
            <Text
              className="text-white/85 mt-xs font-medium"
              style={{ fontSize: 28, letterSpacing: -0.6 }}
            >
              {calibrator.distanceLabel ?? t("inspections:capture.precise.distanceUnknown")}
            </Text>
          </View>

          <View className="mx-md mb-md" pointerEvents="box-none">
            <CalibrationBanner
              reading={calibrator.reading}
              profileName={calibrator.profileName}
              distanceLabel={calibrator.distanceLabel}
            />
          </View>

          <ShutterBar
            onShutter={onShutter}
            onFlip={toggleFlip}
            onGrid={toggleGrid}
            disabled={busy}
          />
        </SafeAreaView>
      </Viewfinder>
    </View>
  );
}
