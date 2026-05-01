import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Alert, Linking, ActivityIndicator, Pressable, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library";
import { Camera as VCCamera } from "react-native-vision-camera";
import { Viewfinder } from "@/components/camera/Viewfinder";
import { GlassTopBar } from "@/components/camera/GlassTopBar";
import type { FlashMode } from "@/components/camera/GlassTopBar";
import { ShutterBar } from "@/components/camera/ShutterBar";
import { KpiStrip } from "@/components/camera/KpiStrip";
import { CalibrationPill } from "@/components/camera/CalibrationPill";
import { RoiOverlay } from "@/components/camera/RoiOverlay";
import { RoiToolbar } from "@/components/camera/RoiToolbar";
import { RecordingTimer } from "@/components/camera/RecordingTimer";
import { Toast } from "@/components/ui/Toast";
import { useFrameTicker } from "@/lib/analyzer/useFrameTicker";
import { useLiveDetections } from "@/lib/analyzer/useLiveDetections";
import { DEFAULT_CAPTURE_CLASS_IDS } from "@/lib/analyzer/captureClasses";
import { DetectionOverlay } from "@/components/camera/DetectionOverlay";
import { useVarieties } from "@/lib/queries";
import { useCaptureSession } from "@/lib/capture/session";
import { useRecordingState } from "@/lib/capture/recording";
import { useLiveArucoCalibration } from "@/lib/calibration/useLiveArucoCalibration";
import { useLiveLidarCalibration } from "@/lib/calibration/useLiveLidarCalibration";
import { stopLidarCalibration } from "@/lib/calibration/LidarCalibrator";
import { useNotify } from "@/lib/notifications";
import type { Roi, RoiKind } from "@/lib/capture/roi";
import type { CalibrationReading } from "@advance-seeds/types";
import type { LidarCalibrationResult } from "@/lib/calibration/LidarCalibrator";

/**
 * Live capture screen.
 *
 * Renders the live camera preview, the prototype's `.cam-stats` KPI strip
 * driven by the mock analyzer's `analyzeFrame` ticker, a calibration status
 * pill, and the Phase 6b ROI tools. The shutter takes a high-res photo via
 * vision-camera, persists the URI on the capture session, and routes to
 * /capture/processing.
 *
 * Phase 7b: long-pressing the shutter starts a video recording. While
 * recording, the shutter shows the recording state (red square) and a
 * timer overlay anchored at the top of the viewfinder; tapping the shutter
 * stops the recording. Upload + analysis live on /capture/processing so photo
 * and video both use the same review/save flow.
 *
 * Phase 4 swaps `useFrameTicker` for a real vision-camera frame processor.
 * The KPI strip's data shape (`AnalysisFrameResult`) stays the same.
 */
export default function CaptureScan() {
  const { t } = useTranslation(["common", "inspections", "notifications"]);
  const router = useRouter();
  const session = useCaptureSession();
  const notify = useNotify();
  const cameraRef = useRef<VCCamera>(null);
  const recordingCalibrationRef = useRef<CalibrationReading | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [roiTool, setRoiTool] = useState<RoiKind | null>(null);
  const [position, setPosition] = useState<"back" | "front">("back");
  const [flashMode, setFlashMode] = useState<FlashMode>("off");
  const [showGrid, setShowGrid] = useState(false);
  const [lockedLidar, setLockedLidar] = useState<LidarCalibrationResult | null>(null);
  const [lidarReleased, setLidarReleased] = useState(false);
  // Torch is the LED-as-flashlight control. Vision Camera's `flash: 'on'`
  // option is unreliable on iOS 26 + iPhone 17 series, so we briefly toggle
  // the torch around `takePhoto` instead. See onShutter for the bracket.
  const [torch, setTorch] = useState<"off" | "on">("off");
  // Snapshot toast — surfaces "Snapshot saved" for ~2 s without an Alert.
  const [toast, setToast] = useState<string | null>(null);
  const liveLidar = useLiveLidarCalibration(cameraActive && position === "back" && !lockedLidar);
  const liveAruco = useLiveArucoCalibration(
    cameraActive && position === "back" && liveLidar.supported === false,
  );
  const automaticCalibration = lockedLidar?.reading ?? liveAruco.result?.reading ?? null;
  const lidarGateActive =
    cameraActive &&
    position === "back" &&
    liveLidar.supported !== false &&
    (!lockedLidar || !lidarReleased);
  const cameraTorch = flashMode === "on" && position === "back" ? "on" : torch;

  // Once calibration is locked we hand the camera frame stream over to the
  // ML detector. Vision Camera takes one frameProcessor at a time, so this
  // is a swap rather than a compose — composing the two worklets is a
  // future refactor.
  const calibrationLocked = Boolean(lockedLidar) || liveAruco.locked;
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
  const liveDetections = useLiveDetections({
    enabled: cameraActive && calibrationLocked && !busy,
    pxPerMm: automaticCalibration?.pxPerMm ?? 38.4,
    classFilter: liveClassFilter,
    roi: session.mode === "live" ? session.roi : null,
  });
  const activeFrameProcessor = busy
    ? undefined
    : (liveDetections.frameProcessor ?? liveAruco.frameProcessor);
  const androidLiveDetectorActive =
    Platform.OS === "android" && !busy && liveDetections.frameProcessor !== undefined;
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);

  const cycleFlash = () =>
    setFlashMode((m) => (m === "off" ? "auto" : m === "auto" ? "on" : "off"));
  const toggleFlip = () => setPosition((p) => (p === "back" ? "front" : "back"));
  const toggleGrid = () => setShowGrid((g) => !g);
  const recalibrateLidar = () => {
    if (!lockedLidar || recording.isRecording) return;
    setCameraActive(false);
    setTorch("off");
    setLockedLidar(null);
    setLidarReleased(false);
    recordingCalibrationRef.current = null;
    setTimeout(() => setCameraActive(true), 80);
  };

  useFocusEffect(
    useCallback(() => {
      setBusy(false);
      setCameraActive(true);
      setTorch("off");
      recordingCalibrationRef.current = null;
      setLockedLidar(null);
      setLidarReleased(false);
      return () => {
        setCameraActive(false);
        setTorch("off");
        setLockedLidar(null);
        setLidarReleased(false);
      };
    }, []),
  );

  useEffect(() => {
    if (liveLidar.locked && liveLidar.result && !lockedLidar) {
      setLockedLidar(liveLidar.result);
    }
  }, [liveLidar.locked, liveLidar.result, lockedLidar]);

  useEffect(() => {
    if (!lockedLidar) {
      setLidarReleased(false);
      return;
    }

    let cancelled = false;
    void stopLidarCalibration().finally(() => {
      setTimeout(() => {
        if (!cancelled) setLidarReleased(true);
      }, 250);
    });

    return () => {
      cancelled = true;
    };
  }, [lockedLidar]);

  const leaveCamera = () => {
    setCameraActive(false);
    setTorch("off");
    setTimeout(() => router.back(), 80);
  };

  // Drives the bottom KPI strip with mock detections every ~200 ms.
  const frameResult = useFrameTicker(!busy, {
    pxPerMm: automaticCalibration?.pxPerMm,
  });

  const recording = useRecordingState(cameraRef, {
    onRecordingFinished: async ({ uri, durationMs }) => {
      session.set({
        capturedMediaKind: "video",
        capturedVideoUri: uri,
        capturedImageUri: null,
        uploadedImageUrl: null,
        analysisResult: null,
        recordingDurationMs: Math.max(0, Math.round(durationMs)),
        recordingId: null,
        cameraPosition: position,
        flashMode,
        capturedAt: new Date().toISOString(),
        capturedCalibrationReading: recordingCalibrationRef.current ?? automaticCalibration,
        capturedCalibrationProfileName: null,
      });
      setCameraActive(false);
      setTimeout(() => router.push("/capture/processing"), 60);
    },
    onRecordingError: (err) => {
      console.error("[scan] recording error", err);
      Alert.alert(t("common:states.error"), err.message);
    },
  });

  // Z Flip 7 FE / Exynos 2400 caps at 3 simultaneous Camera2 streams. Photo
  // (always on, default in <Viewfinder>) + frame processor = 2 surfaces.
  // Adding `video: true` would spin up an MP4 encoder pipeline (3rd stream)
  // and `audio: true` would attach a mic AudioRecord — combined that pushes
  // the HAL past its limit and triggers ERROR_CAMERA_DEVICE. So we only enable
  // them while a recording is actively in progress.
  const recordingActive = recording.isRecording;
  const viewfinderCameraProps = useMemo(
    () => ({
      video: recordingActive,
      audio: recordingActive,
      photo: !androidLiveDetectorActive,
      torch: cameraTorch,
      frameProcessor: activeFrameProcessor,
      pixelFormat: "yuv" as const,
    }),
    [androidLiveDetectorActive, cameraTorch, activeFrameProcessor, recordingActive],
  );

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

  const ensureCalibrationLock = () => {
    if (lockedLidar || (liveAruco.locked && liveAruco.result)) {
      return true;
    }
    Alert.alert(
      t("inspections:capture.calibration.lockRequiredTitle"),
      t("inspections:capture.calibration.lockRequiredBody"),
    );
    return false;
  };

  const onShutter = async () => {
    // Tap-to-stop while recording — overrides photo capture.
    if (recording.isRecording) {
      recording.stop();
      return;
    }
    if (busy || !cameraRef.current) return;
    if (!ensureCalibrationLock()) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === "android") {
      // Android live detection disables ImageCapture while YOLO owns the
      // frame stream. Give CameraX a short reconfigure window before
      // takePhoto so `photo` is back on and the frameProcessor is detached.
      await new Promise((r) => setTimeout(r, 180));
    }
    // Torch bracket for explicit "flash: on" + back camera. Auto stays
    // system-decided; off and front-camera skip the bracket.
    //
    // CRITICAL: when bracketing with torch, pass `flash: "off"` to takePhoto.
    // AVFoundation's AVCapturePhotoSettings.flashMode = .on does a pre-flash
    // sequence that *turns off any active torch first*, then fires the proper
    // flash — and on iOS 26 + iPhone 17, that proper-flash step doesn't
    // reliably land. Result: torch off, no flash, no light. Telling takePhoto
    // not to touch the flash leaves our torch as the sole illumination
    // source through the entire capture.
    const wantFlash = flashMode === "on" && position === "back";
    if (wantFlash) {
      setTorch("on");
      // 120 ms: setState → render → Camera receives torch="on" →
      // AVCaptureDevice toggles the LED. Empirically reliable; <16 ms
      // sometimes fires before the LED is on, especially on cold launches.
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
        capturedCalibrationReading: automaticCalibration,
        capturedCalibrationProfileName: null,
      });

      // Deactivate the camera, then wait a frame before navigating so Android
      // releases the SurfaceView before react-native-screens draws the
      // transition. Without this gap we hit IndexOutOfBoundsException in
      // ScreenStack.performDraw on certain devices (Z Flip 7 FE among them).
      setCameraActive(false);
      setTimeout(() => router.push("/capture/processing"), 60);
    } catch (err) {
      console.error("[scan] takePhoto failed", err);
      setBusy(false);
    } finally {
      if (wantFlash) setTorch("off");
    }
  };

  const onLongPressShutter = () => {
    if (recording.isRecording || busy) return;
    if (!ensureCalibrationLock()) return;
    recordingCalibrationRef.current = automaticCalibration;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    recording.start();
  };

  const onRecordPress = () => {
    if (recording.isRecording) {
      recording.stop();
      return;
    }
    if (busy) return;
    if (!ensureCalibrationLock()) return;
    recordingCalibrationRef.current = automaticCalibration;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    recording.start();
  };

  /**
   * Save the current frame to the device Photos library. Distinct from the
   * shutter — no inspection row is created and no upload happens.
   *
   * Permission flow:
   *   • If undetermined, requestPermissionsAsync() shows the system prompt.
   *   • If denied, alert with a deep link to Settings (the system won't
   *     re-prompt after a previous deny — only the user can flip it).
   *   • If granted, takePhoto + saveToLibraryAsync + toast.
   */
  const onSnapshot = async () => {
    if (!cameraRef.current || busy || recording.isRecording) return;
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        t("inspections:capture.snapshot.permissionDeniedTitle"),
        t("inspections:capture.snapshot.permissionDeniedBody"),
        [
          { text: t("common:actions.cancel"), style: "cancel" },
          { text: t("common:actions.openSettings"), onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const photo = await cameraRef.current.takePhoto({ flash: "off" });
      const uri = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`;
      await MediaLibrary.saveToLibraryAsync(uri);
      setToast(t("inspections:capture.snapshot.savedToast"));
      notify({
        kind: "success",
        title: t("notifications:snapshotSaved.title"),
        body: t("notifications:snapshotSaved.body"),
      });
    } catch (err) {
      console.error("[scan] snapshot failed", err);
    }
  };

  if (lidarGateActive) {
    return (
      <View className="flex-1 bg-black">
        <SafeAreaView className="flex-1" edges={["top", "bottom"]} pointerEvents="box-none">
          <GlassTopBar
            centerLabel="LiDAR calibration"
            centerDotColor="#5DCAA5"
            flashMode={flashMode}
            onFlashPress={cycleFlash}
            onBackPress={leaveCamera}
          />
          <View className="flex-1 items-center justify-center px-xl">
            <ActivityIndicator color="#FFFFFF" />
            <Text className="mt-lg text-center text-white font-medium" style={{ fontSize: 18 }}>
              {lockedLidar ? "Preparing live camera" : "Hold steady"}
            </Text>
            <Text className="mt-xs text-center text-white/65" style={{ fontSize: 13 }}>
              {lockedLidar
                ? "LiDAR locked. Releasing depth sensor before live count."
                : "Hold the iPad still for 1 second until depth scale locks."}
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
        cameraProps={viewfinderCameraProps}
      >
        <SafeAreaView className="flex-1" edges={["top", "bottom"]} pointerEvents="box-none">
          <GlassTopBar
            centerLabel={`${t("inspections:capture.live.pillLabel")} · ${t("inspections:capture.shutter")}`}
            centerDotColor="#5DCAA5"
            flashMode={flashMode}
            onFlashPress={cycleFlash}
            onBackPress={leaveCamera}
          />

          {/* Inline calibration pill — sits below the top bar (hidden during
              recording so the timer takes the spotlight). */}
          {!recording.isRecording ? (
            <View className="items-center mt-xs" pointerEvents="box-none">
              <CalibrationPill reading={automaticCalibration} />
              <Text className="mt-xs rounded-full bg-black/45 px-sm py-[2px] text-white/75 text-caption">
                {lockedLidar
                  ? t("inspections:capture.calibration.lockedHintBare", {
                      pxPerMm: lockedLidar.reading.pxPerMm.toFixed(1),
                    })
                  : liveAruco.locked
                    ? t("inspections:capture.calibration.lockedHintBare", {
                        pxPerMm: liveAruco.result?.reading.pxPerMm.toFixed(1),
                      })
                    : t("inspections:capture.calibration.alignMarker")}
              </Text>
              {lockedLidar ? (
                <Pressable
                  accessibilityRole="button"
                  className="mt-xs rounded-full bg-black/45 px-sm py-[2px]"
                  onPress={recalibrateLidar}
                >
                  <Text className="text-caption font-medium text-white">
                    {t("inspections:capture.calibration.recalibrate")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <RecordingTimer durationMs={recording.durationMs} />
          )}

          {/* ROI overlay sits between the chrome and the KPI strip. When no
              tool is active it's pointerEvents-transparent and only renders
              the committed shape; when a tool is active it captures touches
              for drawing. Phase 4 will render Skia detection rings here too. */}
          <View
            className="flex-1"
            pointerEvents="box-none"
            onLayout={(e) =>
              setStageSize({
                width: e.nativeEvent.layout.width,
                height: e.nativeEvent.layout.height,
              })
            }
          >
            {stageSize && liveDetections.detections ? (
              <DetectionOverlay
                frameResult={liveDetections.detections}
                frameWidth={liveDetections.detections.frameWidth ?? 1920}
                frameHeight={liveDetections.detections.frameHeight ?? 1080}
                stageWidth={stageSize.width}
                stageHeight={stageSize.height}
              />
            ) : null}
            <RoiOverlay drawingTool={roiTool} roi={session.roi} onRoi={setRoi} />
          </View>

          {!recording.isRecording ? (
            <RoiToolbar
              activeTool={roiTool}
              onSelectTool={setRoiTool}
              roi={session.roi}
              onClear={onClearRoi}
              onClosePolygon={onClosePolygon}
            />
          ) : null}

          <KpiStrip
            frameResult={liveDetections.detections ?? frameResult}
            roi={session.roi}
            frameWidth={liveDetections.detections?.frameWidth}
            frameHeight={liveDetections.detections?.frameHeight}
          />

          <ShutterBar
            onShutter={onShutter}
            onLongPress={onLongPressShutter}
            onSnapshot={onSnapshot}
            onRecordPress={onRecordPress}
            onFlip={toggleFlip}
            onGrid={toggleGrid}
            isLive={!recording.isRecording}
            isRecording={recording.isRecording}
            disabled={busy}
          />
          <Toast message={toast} tone="success" />
        </SafeAreaView>
      </Viewfinder>
    </View>
  );
}
