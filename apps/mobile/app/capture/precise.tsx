import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Alert, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Camera as VCCamera } from "react-native-vision-camera";
import { Viewfinder } from "@/components/camera/Viewfinder";
import { GlassTopBar } from "@/components/camera/GlassTopBar";
import type { FlashMode } from "@/components/camera/GlassTopBar";
import { ShutterBar } from "@/components/camera/ShutterBar";
import { CalibrationBanner } from "@/components/camera/CalibrationBanner";
import { captureFrameMetadataFromPhoto, useCaptureSession } from "@/lib/capture/session";
import { useLiveDetections } from "@/lib/analyzer/useLiveDetections";
import { DEFAULT_CAPTURE_CLASS_IDS } from "@/lib/analyzer/captureClasses";
import { DetectionOverlay } from "@/components/camera/DetectionOverlay";
import { useVarieties } from "@/lib/queries";
import { useLiveArucoCalibration } from "@/lib/calibration/useLiveArucoCalibration";
import { useLiveLidarCalibration } from "@/lib/calibration/useLiveLidarCalibration";
import { useCalibrator } from "@/lib/calibration/useCalibrator";
import { useModelInstallInspectionGate } from "@/lib/models/inspectionGate";

/**
 * Precise capture mode.
 *
 * Adds corner brackets, "Hold steady" guidance, distance indicator, and a
 * calibration banner pinned to the bottom of the camera stage. Precise mode
 * prefers iOS LiDAR scene-depth scale on supported devices, then falls back to
 * ArUco if the device has no LiDAR or LiDAR cannot lock.
 *
 * Persisted inspection measurements only proceed once an automatic calibration
 * source locks.
 *
 * Camera controls (flash / flip / grid) mirror scan mode but live as local
 * state — there's no value carrying them across modes.
 */
export default function CapturePrecise() {
  const { t } = useTranslation(["common", "inspections", "more"]);
  const router = useRouter();
  const session = useCaptureSession();
  const cameraRef = useRef<VCCamera>(null);
  const [busy, setBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [position, setPosition] = useState<"back" | "front">("back");
  const [flashMode, setFlashMode] = useState<FlashMode>("off");
  const [showGrid, setShowGrid] = useState(false);
  // Continuous LiDAR — see scan.tsx for the design notes.
  const [firstLidarReadingSeen, setFirstLidarReadingSeen] = useState(false);
  const liveLidar = useLiveLidarCalibration(cameraActive && position === "back");
  const liveAruco = useLiveArucoCalibration(
    cameraActive && position === "back" && liveLidar.supported === false,
  );
  const manualCalibration = useCalibrator();
  const modelInstallGate = useModelInstallInspectionGate();
  const modelInstallInProgress = modelInstallGate.blocked;
  const automaticCalibration =
    liveLidar.result?.reading ?? liveAruco.result?.reading ?? manualCalibration.reading;
  const automaticCalibrationProfileName =
    automaticCalibration?.source === "manual" ? manualCalibration.profileName : null;
  const lidarGateActive =
    cameraActive && position === "back" && liveLidar.supported !== false && !firstLidarReadingSeen;
  // Torch fallback for vision-camera's unreliable flash:'on' on iOS 26 +
  // iPhone 17 series — see scan.tsx for the rationale.
  const [torch, setTorch] = useState<"off" | "on">("off");
  const cameraTorch = flashMode === "on" && position === "back" ? "on" : torch;
  const calibrationLocked =
    liveLidar.locked || liveAruco.locked || manualCalibration.reading !== null;
  const varieties = useVarieties();
  const activeVariety = useMemo(
    () => varieties.data?.find((v) => v.id === session.varietyId),
    [varieties.data, session.varietyId],
  );
  const liveClassFilter = useMemo<readonly number[]>(
    () =>
      activeVariety?.coco_class_id !== null && activeVariety?.coco_class_id !== undefined
        ? [activeVariety.coco_class_id]
        : DEFAULT_CAPTURE_CLASS_IDS,
    [activeVariety?.coco_class_id],
  );
  const preciseVarietyNames = useMemo<readonly string[] | null>(
    () => (activeVariety?.name ? [activeVariety.name] : null),
    [activeVariety?.name],
  );
  const gradingConfig = useMemo(
    () =>
      activeVariety
        ? {
            criteria: activeVariety.grade_criteria,
            targetLengthMm: activeVariety.ref_length_mm,
            targetWidthMm: activeVariety.ref_width_mm,
          }
        : null,
    [activeVariety],
  );
  const liveDetections = useLiveDetections({
    enabled: cameraActive && calibrationLocked && !busy && !modelInstallInProgress,
    pxPerMm: automaticCalibration?.pxPerMm ?? 38.4,
    classFilter: liveClassFilter,
    varietyNames: preciseVarietyNames,
    modelClassAliases: activeVariety?.model_class_aliases ?? null,
    roi: null,
    gradingConfig,
  });
  const activeFrameProcessor =
    busy || modelInstallInProgress
      ? undefined
      : (liveDetections.frameProcessor ?? liveAruco.frameProcessor);
  const androidFrameProcessorActive =
    Platform.OS === "android" &&
    !busy &&
    !modelInstallInProgress &&
    activeFrameProcessor !== undefined;
  const viewfinderCameraProps = useMemo(
    () => ({
      photo: !androidFrameProcessorActive,
      torch: cameraTorch,
      frameProcessor: activeFrameProcessor,
      pixelFormat: "yuv" as const,
    }),
    [androidFrameProcessorActive, cameraTorch, activeFrameProcessor],
  );
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);

  const cycleFlash = () =>
    setFlashMode((m) => (m === "off" ? "auto" : m === "auto" ? "on" : "off"));
  const toggleFlip = () => setPosition((p) => (p === "back" ? "front" : "back"));
  const toggleGrid = () => setShowGrid((g) => !g);
  useFocusEffect(
    useCallback(() => {
      setBusy(false);
      setCameraActive(true);
      setTorch("off");
      setFirstLidarReadingSeen(false);
      return () => {
        setCameraActive(false);
        setTorch("off");
        setFirstLidarReadingSeen(false);
      };
    }, []),
  );

  useEffect(() => {
    if (liveLidar.result && !firstLidarReadingSeen) {
      setFirstLidarReadingSeen(true);
    }
  }, [liveLidar.result, firstLidarReadingSeen]);

  const leaveCamera = () => {
    setCameraActive(false);
    setTorch("off");
    setTimeout(() => router.back(), 80);
  };

  const ensureCalibrationLock = () => {
    if (liveLidar.result || (liveAruco.locked && liveAruco.result) || manualCalibration.reading) {
      return true;
    }
    Alert.alert(
      t("inspections:capture.calibration.lockRequiredTitle"),
      t("inspections:capture.calibration.lockRequiredBody"),
    );
    return false;
  };

  const onShutter = async () => {
    if (busy || !cameraRef.current) return;
    if (!ensureCalibrationLock()) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (Platform.OS === "android") {
      // Android live detection disables ImageCapture while YOLO owns the
      // frame stream. Give CameraX a short reconfigure window before
      // takePhoto so `photo` is back on and the frameProcessor is detached.
      await new Promise((r) => setTimeout(r, 180));
    }
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
        uploadedVideoUrl: null,
        analysisResult: null,
        capturedLiveFrameResult: liveDetections.detections,
        capturedFrameMetadata: captureFrameMetadataFromPhoto(photo),
        analysisDiagnostics: null,
        recordingDurationMs: null,
        recordingId: null,
        cameraPosition: position,
        flashMode,
        capturedAt: new Date().toISOString(),
        capturedCalibrationReading: automaticCalibration ?? null,
        capturedCalibrationProfileName: automaticCalibrationProfileName,
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

  if (modelInstallGate.blocked) {
    const title = modelInstallGate.installing
      ? t("inspections:capture.modelInstallBlockedTitle")
      : t("inspections:capture.modelRequiredTitle");
    const body = modelInstallGate.installing
      ? t("inspections:capture.modelInstallBlockedBody", {
          name: modelInstallGate.install.displayName ?? t("more:models.defaultPill"),
        })
      : t("inspections:capture.modelRequiredBody");
    return (
      <View className="flex-1 bg-black">
        <SafeAreaView className="flex-1" edges={["top", "bottom"]} pointerEvents="box-none">
          <GlassTopBar
            centerLabel={title}
            centerDotColor="#FAC775"
            flashMode={flashMode}
            onFlashPress={cycleFlash}
            onBackPress={leaveCamera}
          />
          <View className="flex-1 items-center justify-center px-xl">
            <ActivityIndicator color="#FFFFFF" />
            <Text className="mt-lg text-center text-white font-medium" style={{ fontSize: 18 }}>
              {title}
            </Text>
            <Text className="mt-xs text-center text-white/65" style={{ fontSize: 13 }}>
              {body}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (lidarGateActive) {
    return (
      <View className="flex-1 bg-black">
        <SafeAreaView className="flex-1" edges={["top", "bottom"]} pointerEvents="box-none">
          <GlassTopBar
            centerLabel="LiDAR calibration"
            centerDotColor="#B5D4F4"
            flashMode={flashMode}
            onFlashPress={cycleFlash}
            onBackPress={leaveCamera}
          />
          <View className="flex-1 items-center justify-center px-xl">
            <ActivityIndicator color="#FFFFFF" />
            <Text className="mt-lg text-center text-white font-medium" style={{ fontSize: 18 }}>
              {"Calibrating depth"}
            </Text>
            <Text className="mt-xs text-center text-white/65" style={{ fontSize: 13 }}>
              {"Point the camera at the work surface — depth scale tracks live as you move."}
            </Text>
            {liveLidar.result ? (
              <Text className="mt-md text-center text-white/85" style={{ fontSize: 28 }}>
                {liveLidar.result.reading.pxPerMm.toFixed(1)} px/mm
              </Text>
            ) : null}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <Viewfinder
        active={cameraActive}
        cameraRef={cameraRef}
        position={position}
        showGrid={showGrid}
        performanceProfile={androidFrameProcessorActive ? "low" : "quality"}
        cameraProps={viewfinderCameraProps}
      >
        <View
          className="absolute inset-0"
          pointerEvents="none"
          onLayout={(e) =>
            setStageSize({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })
          }
        >
          {stageSize && cameraActive && !busy && liveDetections.detections ? (
            <DetectionOverlay
              frameResult={liveDetections.detections}
              frameWidth={liveDetections.detections.frameWidth ?? 1920}
              frameHeight={liveDetections.detections.frameHeight ?? 1080}
              stageWidth={stageSize.width}
              stageHeight={stageSize.height}
              varietyName={activeVariety?.name ?? null}
            />
          ) : null}
        </View>
        <SafeAreaView className="flex-1" edges={["top", "bottom"]} pointerEvents="box-none">
          <GlassTopBar
            centerLabel={`${t("inspections:capture.precise.pillLabel")} · ${t("inspections:capture.shutter")}`}
            centerDotColor="#B5D4F4"
            flashMode={flashMode}
            onFlashPress={cycleFlash}
            onBackPress={leaveCamera}
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
              {automaticCalibration
                ? t("inspections:capture.calibration.lockedHintBare", {
                    pxPerMm: automaticCalibration.pxPerMm.toFixed(1),
                  })
                : t("inspections:capture.precise.distanceUnknown")}
            </Text>
          </View>

          <View className="mx-md mb-md" pointerEvents="box-none">
            <CalibrationBanner
              reading={automaticCalibration ?? null}
              profileName={automaticCalibrationProfileName}
              distanceLabel={liveLidar.distanceLabel}
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
