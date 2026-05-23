import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { View, Text, Alert, ActivityIndicator, Platform, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Camera as VCCamera } from "react-native-vision-camera";
import {
  ChevronLeft,
  Zap,
  ZapOff,
  Grid3x3,
  RefreshCw,
  Video,
  Camera as CameraIcon,
  Square,
  Pentagon,
  Circle as CircleIcon,
} from "lucide-react-native";
import { Viewfinder } from "@/components/camera/Viewfinder";
import { GlassTopBar } from "@/components/camera/GlassTopBar";
import type { FlashMode } from "@/components/camera/GlassTopBar";
import { RoiOverlay } from "@/components/camera/RoiOverlay";
import { Toast } from "@/components/ui/Toast";
import { useFrameTicker } from "@/lib/analyzer/useFrameTicker";
import { useLiveDetections } from "@/lib/analyzer/useLiveDetections";
import { DEFAULT_CAPTURE_CLASS_IDS } from "@/lib/analyzer/captureClasses";
import { DetectionOverlay } from "@/components/camera/DetectionOverlay";
import { useVarieties } from "@/lib/queries";
import { captureFrameMetadataFromPhoto, useCaptureSession } from "@/lib/capture/session";
import { useRecordingState } from "@/lib/capture/recording";
import { useLiveArucoCalibration } from "@/lib/calibration/useLiveArucoCalibration";
import { useLiveLidarCalibration } from "@/lib/calibration/useLiveLidarCalibration";
import { useCalibrator } from "@/lib/calibration/useCalibrator";
import { useNotify } from "@/lib/notifications";
import { useModelInstallInspectionGate } from "@/lib/models/inspectionGate";
import { readActiveModel } from "@/lib/models/modelStore";
import type { InstalledModelRecord } from "@/lib/models/types";
import { saveAnnotatedImageToLibrary } from "@/lib/capture/imageActions";
import type { Roi, RoiKind } from "@/lib/capture/roi";
import type { CalibrationReading } from "@advance-seeds/types";

const LIDAR_ARUCO_FALLBACK_DELAY_MS = 1600;
const LIVE_DETECTION_START_DELAY_MS = 450;
const IOS_ARUCO_TO_LIVE_DETECTION_START_DELAY_MS = 1200;

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
  const { t } = useTranslation(["common", "inspections", "more", "notifications"]);
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
  const [activeModelRecord, setActiveModelRecord] = useState<InstalledModelRecord | null>(null);
  // Continuous LiDAR — keeps streaming pxPerMm as the operator moves;
  // no one-shot lock, no freeze. The "first reading seen" flag lets us
  // dismiss the initial calibration overlay once we have any signal,
  // then UI surfaces the live distance directly.
  const [firstLidarReadingSeen, setFirstLidarReadingSeen] = useState(false);
  const [lidarArucoFallbackReady, setLidarArucoFallbackReady] = useState(false);
  // Torch is the LED-as-flashlight control. Vision Camera's `flash: 'on'`
  // option is unreliable on iOS 26 + iPhone 17 series, so we briefly toggle
  // the torch around `takePhoto` instead. See onShutter for the bracket.
  const [torch, setTorch] = useState<"off" | "on">("off");
  // Snapshot toast — surfaces "Snapshot saved" for ~2 s without an Alert.
  const [toast, setToast] = useState<string | null>(null);
  const liveLidar = useLiveLidarCalibration(cameraActive && position === "back");
  const manualCalibration = useCalibrator();
  const shouldScanAruco =
    cameraActive &&
    position === "back" &&
    !liveLidar.locked &&
    (liveLidar.supported === false ||
      lidarArucoFallbackReady ||
      manualCalibration.reading !== null);
  const liveAruco = useLiveArucoCalibration(shouldScanAruco);
  const modelInstallGate = useModelInstallInspectionGate();
  const modelInstallInProgress = modelInstallGate.blocked;
  const automaticCalibration =
    liveLidar.result?.reading ?? liveAruco.result?.reading ?? manualCalibration.reading;
  const automaticCalibrationProfileName =
    automaticCalibration?.source === "manual" ? manualCalibration.profileName : null;
  // Show the calibration onboarding overlay only until the FIRST
  // confident LiDAR reading lands. After that, live values flow into
  // the bottom banner — no need to occlude the camera again.
  const lidarGateActive =
    cameraActive &&
    position === "back" &&
    liveLidar.supported !== false &&
    !firstLidarReadingSeen &&
    !lidarArucoFallbackReady;
  const cameraTorch = flashMode === "on" && position === "back" ? "on" : torch;

  // YOLO detector runs whenever we have any calibration source —
  // continuous LiDAR keeps it running through device movement.
  const calibrationLocked =
    liveLidar.locked || liveAruco.locked || manualCalibration.reading !== null;
  const [liveDetectionStartReady, setLiveDetectionStartReady] = useState(false);
  useEffect(() => {
    if (!cameraActive || busy || modelInstallInProgress || !calibrationLocked) {
      setLiveDetectionStartReady(false);
      return;
    }
    const delayMs =
      Platform.OS === "ios" && liveAruco.locked
        ? IOS_ARUCO_TO_LIVE_DETECTION_START_DELAY_MS
        : LIVE_DETECTION_START_DELAY_MS;
    const timer = setTimeout(() => setLiveDetectionStartReady(true), delayMs);
    return () => clearTimeout(timer);
  }, [busy, calibrationLocked, cameraActive, liveAruco.locked, modelInstallInProgress]);
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
  // Stable references so useLiveDetections' useEffect dep array doesn't
  // re-fire every render (creating a fresh array literal in the props
  // object would otherwise trigger the diagnostic log on every paint).
  const liveVarietyNames = useMemo<readonly string[] | null>(
    () => (activeVariety?.name ? [activeVariety.name] : null),
    [activeVariety?.name],
  );
  const liveModelClassAliases = activeVariety?.model_class_aliases ?? null;
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
    enabled: liveDetectionStartReady,
    pxPerMm: automaticCalibration?.pxPerMm ?? 38.4,
    classFilter: liveClassFilter,
    varietyNames: liveVarietyNames,
    modelClassAliases: liveModelClassAliases,
    roi: session.mode === "live" ? session.roi : null,
    gradingConfig,
  });
  useEffect(() => {
    let cancelled = false;
    void readActiveModel()
      .then((record) => {
        if (!cancelled) setActiveModelRecord(record);
      })
      .catch(() => {
        if (!cancelled) setActiveModelRecord(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const arucoFrameProcessor =
    shouldScanAruco && !liveAruco.locked ? liveAruco.frameProcessor : undefined;
  const frameProcessorKind =
    busy || modelInstallInProgress
      ? "none"
      : arucoFrameProcessor
        ? "aruco"
        : liveDetections.frameProcessor
          ? "live"
          : "none";
  const activeFrameProcessor =
    frameProcessorKind === "aruco"
      ? arucoFrameProcessor
      : frameProcessorKind === "live"
        ? liveDetections.frameProcessor
        : undefined;
  const cameraRemountKey = Platform.OS === "ios" ? `fp:${frameProcessorKind}` : "stable";
  const androidFrameProcessorActive =
    Platform.OS === "android" &&
    !busy &&
    !modelInstallInProgress &&
    activeFrameProcessor !== undefined;
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
      recordingCalibrationRef.current = null;
      setFirstLidarReadingSeen(false);
      setLidarArucoFallbackReady(false);
      return () => {
        setCameraActive(false);
        setTorch("off");
        setFirstLidarReadingSeen(false);
        setLidarArucoFallbackReady(false);
      };
    }, []),
  );

  // Flip the gate-overlay-dismiss flag on the first confident reading.
  // We never re-enter the gate after this within the same session —
  // continuous mode trusts ongoing LiDAR poll above any one-shot lock.
  useEffect(() => {
    if (liveLidar.result && !firstLidarReadingSeen) {
      setFirstLidarReadingSeen(true);
    }
  }, [liveLidar.result, firstLidarReadingSeen]);

  useEffect(() => {
    if (!cameraActive || position !== "back" || liveLidar.supported === false || liveLidar.result) {
      setLidarArucoFallbackReady(false);
      return;
    }

    const timer = setTimeout(() => setLidarArucoFallbackReady(true), LIDAR_ARUCO_FALLBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [cameraActive, position, liveLidar.supported, liveLidar.result]);

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
        uploadedVideoUrl: null,
        analysisResult: null,
        capturedLiveFrameResult: liveDetections.detections,
        capturedFrameMetadata: null,
        analysisDiagnostics: null,
        recordingDurationMs: Math.max(0, Math.round(durationMs)),
        recordingId: null,
        cameraPosition: position,
        flashMode,
        capturedAt: new Date().toISOString(),
        capturedCalibrationReading: recordingCalibrationRef.current ?? automaticCalibration,
        capturedCalibrationProfileName: automaticCalibrationProfileName,
      });
      setCameraActive(false);
      // Same Android-only SurfaceView teardown gap as in onShutter.
      if (Platform.OS === "android") {
        setTimeout(() => router.push("/capture/processing"), 60);
      } else {
        router.push("/capture/processing");
      }
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
      photo: !androidFrameProcessorActive,
      torch: cameraTorch,
      frameProcessor: activeFrameProcessor,
      pixelFormat: "yuv" as const,
    }),
    [androidFrameProcessorActive, cameraTorch, activeFrameProcessor, recordingActive],
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
    // Tap-to-stop while recording — overrides photo capture.
    if (recording.isRecording) {
      // Detach the live frame processor *before* signaling stop so the
      // camera tears down cleanly. On iOS the live worklet sharing the
      // camera buffer with the running video encoder during stop has
      // crashed the app immediately on Z Flip-style teardown sequences;
      // setting busy=true gates `activeFrameProcessor` to undefined.
      setBusy(true);
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
        capturedCalibrationReading: automaticCalibration,
        capturedCalibrationProfileName: automaticCalibrationProfileName,
      });

      // Deactivate the camera, then wait a frame before navigating *on
      // Android* so CameraX releases the SurfaceView before react-native-
      // screens draws the transition. Without this gap we hit
      // IndexOutOfBoundsException in ScreenStack.performDraw on certain
      // devices (Z Flip 7 FE among them). iOS doesn't have that teardown
      // race, so the delay just makes the capture feel sluggish — skip it.
      setCameraActive(false);
      if (Platform.OS === "android") {
        setTimeout(() => router.push("/capture/processing"), 60);
      } else {
        router.push("/capture/processing");
      }
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
   * The saved artifact uses the same ROI + seed overlay currently shown
   * on live capture, so operators keep the annotated evidence frame.
   */
  const onSnapshot = async () => {
    if (!cameraRef.current || busy || recording.isRecording) return;
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const photo = await cameraRef.current.takePhoto({ flash: "off" });
      const uri = photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`;
      const snapshotFrame = liveDetections.detections ?? frameResult;
      const snapshotSeeds =
        snapshotFrame?.seeds.map((seed) => {
          const className =
            typeof seed.class_id === "number"
              ? (activeModelRecord?.metadata.class_names[seed.class_id] ?? null)
              : null;
          return { ...seed, label: className ?? activeVariety?.name ?? null };
        }) ?? null;
      await saveAnnotatedImageToLibrary(
        uri,
        {
          roi: session.roi,
          seeds: snapshotSeeds,
          seedFrameWidth: snapshotFrame?.frameWidth ?? null,
          seedFrameHeight: snapshotFrame?.frameHeight ?? null,
        },
        {
          title: t("inspections:capture.snapshot.savedToast"),
          permissionDeniedTitle: t("inspections:capture.snapshot.permissionDeniedTitle"),
          permissionDeniedBody: t("inspections:capture.snapshot.permissionDeniedBody"),
        },
      );
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

  // ── Hooks below this line MUST stay above every early `return` to honor
  //    the Rules of Hooks. The model-readiness, LiDAR-calibration, and
  //    main-render branches each early-return below; any new hook must
  //    live here or be hoisted above its return site, not below it.
  const recDurationLabel = useMemo(() => {
    const ms = recording.durationMs ?? 0;
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, [recording.durationMs]);

  if (modelInstallGate.blocked) {
    const title = modelInstallGate.installing
      ? t("inspections:capture.modelInstallBlockedTitle")
      : modelInstallGate.modelStatus === "inactive"
        ? t("inspections:capture.modelInactiveTitle")
        : t("inspections:capture.modelRequiredTitle");
    const body = modelInstallGate.installing
      ? t("inspections:capture.modelInstallBlockedBody", {
          name: modelInstallGate.install.displayName ?? t("more:models.defaultPill"),
        })
      : modelInstallGate.modelStatus === "inactive"
        ? t("inspections:capture.modelInactiveBody")
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
            centerDotColor="#7DD3C7"
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

  // ── HUD data binding (ported verbatim from prototype's StatCol grid) ─
  // The prototype shows Frame/Detect/Light but the original demo's stats are
  // count/avg-mm/grade-A — we keep our existing analyzer outputs to drive
  // the same 3-up layout the prototype establishes.
  const liveFrame = liveDetections.detections ?? frameResult;
  const seeds = liveFrame?.seeds ?? [];
  const kpiCount = liveFrame ? String(seeds.length) : "—";
  const kpiAvg =
    seeds.length > 0
      ? `${(seeds.reduce((s, d) => s + d.length_mm, 0) / seeds.length).toFixed(1)} mm`
      : "—";
  const kpiArea =
    seeds.length > 0
      ? `${(seeds.reduce((s, d) => s + d.area_mm2, 0) / seeds.length).toFixed(0)} mm²`
      : "—";
  const kpiVolume =
    seeds.length > 0
      ? `${(seeds.reduce((s, d) => s + (d.volume_ml ?? 0), 0) / seeds.length).toFixed(1)} ml`
      : null;
  const kpiGrade = seeds.length > 0 ? String(seeds.filter((d) => d.grade === "A").length) : "—";

  const calibrationOk = liveLidar.result || liveAruco.locked || manualCalibration.reading !== null;
  const showCalibrationWarn = !calibrationOk;
  const calibrationLabel = liveLidar.result
    ? `LiDAR · ${liveLidar.result.reading.pxPerMm.toFixed(1)} px/mm`
    : liveAruco.result
      ? `ArUco · ${liveAruco.result.reading.pxPerMm.toFixed(1)} px/mm`
      : manualCalibration.reading
        ? `Manual · ${manualCalibration.reading.pxPerMm.toFixed(1)} px/mm`
        : "Calibration unavailable";

  const flashIconActive = flashMode === "on" || flashMode === "auto";

  return (
    <View className="flex-1" style={{ backgroundColor: "#0d0d10" }}>
      <Viewfinder
        active={cameraActive}
        cameraRef={cameraRef}
        position={position}
        showGrid={showGrid}
        performanceProfile={androidFrameProcessorActive ? "low" : "quality"}
        cameraKey={cameraRemountKey}
        cameraProps={viewfinderCameraProps}
      >
        {/* Detection overlay sits directly over the camera frame. */}
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
              modelClassNames={activeModelRecord?.metadata.class_names ?? null}
            />
          ) : null}
        </View>

        {/* ROI drawing overlay (captures touches when a tool is active). */}
        <View className="absolute inset-0" pointerEvents="box-none">
          <RoiOverlay drawingTool={roiTool} roi={session.roi} onRoi={setRoi} />
        </View>

        {/* ───── Top bar: back · variety+ROI chip · flash ───── */}
        <SafeAreaView
          edges={["top"]}
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 4,
          }}
        >
          <View
            pointerEvents="box-none"
            className="flex-row items-start justify-between px-md pt-md pb-sm"
            style={{
              backgroundColor: "rgba(0,0,0,0.0)",
            }}
          >
            <DarkChip onPress={leaveCamera}>
              <ChevronLeft color="#fff" size={16} />
            </DarkChip>
            <DarkChip wide>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 9999,
                  backgroundColor: recording.isRecording ? "#E55B5B" : "#4DAB6D",
                }}
              />
              <Text
                style={{
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {recording.isRecording ? `Live · Rec · ${recDurationLabel}` : "Live"}
              </Text>
            </DarkChip>
            <DarkChip onPress={cycleFlash}>
              {flashIconActive ? (
                <Zap color="#fff" size={16} fill="#fff" />
              ) : (
                <ZapOff color="#fff" size={16} />
              )}
            </DarkChip>
          </View>

          {/* Stacked status pills (center top) */}
          <View
            pointerEvents="box-none"
            style={{
              alignItems: "center",
              paddingHorizontal: 16,
              marginTop: 8,
              gap: 8,
            }}
          >
            <DarkChip wide>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 9999,
                  backgroundColor: showCalibrationWarn ? "#E07B3F" : "#4DAB6D",
                }}
              />
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "500" }}>
                {calibrationLabel}
              </Text>
            </DarkChip>
            {showCalibrationWarn ? (
              <DarkChip wide>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "400",
                    color: "rgba(255,255,255,0.8)",
                  }}
                >
                  Align the ArUco card to lock calibration
                </Text>
              </DarkChip>
            ) : null}
          </View>
        </SafeAreaView>

        {/* ───── Bottom control stack ───── */}
        <SafeAreaView
          edges={["bottom"]}
          pointerEvents="box-none"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 3,
          }}
        >
          <View
            pointerEvents="box-none"
            style={{
              paddingHorizontal: 14,
              paddingTop: 14,
              paddingBottom: 14,
            }}
          >
            {/* ROI shape selector — Rect / Polygon / Circle */}
            <View
              style={{
                alignItems: "center",
                marginBottom: 12,
              }}
              pointerEvents="box-none"
            >
              <RoiSelector
                active={(roiTool ?? session.roi?.kind ?? "rect") as RoiKindLocal}
                onSelect={(kind) => setRoiTool(roiTool === kind ? null : kind)}
              />
            </View>

            {/* Stat strip */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-around",
                alignItems: "flex-end",
                marginBottom: 16,
              }}
            >
              <StatCol label="COUNT" value={kpiCount} />
              <StatCol label="AVG MM" value={kpiAvg} mono />
              <StatCol label="AREA / VOL" value={kpiArea} subValue={kpiVolume} mono />
              <StatCol label="GRADE A" value={kpiGrade} accent="#4DAB6D" />
            </View>

            {/* Shutter row: grid (L) — shutter (C) — flip (R) */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <DarkChip onPress={toggleGrid}>
                <Grid3x3 color="#fff" size={16} />
              </DarkChip>

              <View style={{ alignItems: "center" }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Capture"
                  disabled={busy}
                  delayLongPress={600}
                  onPress={onShutter}
                  onLongPress={onLongPressShutter}
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 9999,
                    borderWidth: 4,
                    borderColor: "rgba(255,255,255,0.9)",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "transparent",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  <View
                    style={{
                      width: recording.isRecording ? 28 : 60,
                      height: recording.isRecording ? 28 : 60,
                      borderRadius: recording.isRecording ? 6 : 9999,
                      backgroundColor: "#E55B5B",
                    }}
                  />
                </Pressable>

                {/* Mode toggle: Rec / Snap */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Toggle capture mode"
                  onPress={onRecordPress}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    marginTop: 8,
                  }}
                >
                  {recording.isRecording ? (
                    <Video color="rgba(255,255,255,0.75)" size={14} />
                  ) : (
                    <CameraIcon color="rgba(255,255,255,0.75)" size={14} />
                  )}
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.75)",
                      fontSize: 11,
                      fontWeight: "600",
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                    }}
                  >
                    {recording.isRecording ? "Rec" : "Snap"}
                  </Text>
                </Pressable>
              </View>

              <DarkChip onPress={toggleFlip}>
                <RefreshCw color="#fff" size={16} />
              </DarkChip>
            </View>

            {/* Inline secondary actions: snapshot (saves to Photos) + clear ROI */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                marginTop: 10,
              }}
            >
              <DarkChip wide onPress={onSnapshot}>
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>Snapshot</Text>
              </DarkChip>
              {session.roi ? (
                <DarkChip wide onPress={onClearRoi}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>Clear ROI</Text>
                </DarkChip>
              ) : null}
              {roiTool === "polygon" &&
              session.roi?.kind === "polygon" &&
              !session.roi.closed &&
              session.roi.points.length >= 3 ? (
                <DarkChip wide onPress={onClosePolygon}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>
                    Close polygon
                  </Text>
                </DarkChip>
              ) : null}
            </View>
          </View>
          <Toast message={toast} tone="success" />
        </SafeAreaView>
      </Viewfinder>
    </View>
  );
}

// ── Local prototype-ported primitives ─────────────────────────────────
// These live in this file because the prototype defines them inline and
// they're scan-specific. If another camera screen needs them later they
// can be lifted into components/camera.

type RoiKindLocal = "rect" | "polygon" | "circle";

function DarkChip({
  children,
  wide = false,
  onPress,
}: {
  children: ReactNode;
  wide?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <View
      style={{
        height: 36,
        minWidth: 36,
        paddingHorizontal: wide ? 12 : 8,
        borderRadius: 9999,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        backgroundColor: "rgba(0,0,0,0.50)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
      }}
    >
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {content}
    </Pressable>
  );
}

function StatCol({
  label,
  value,
  subValue,
  mono = false,
  accent,
}: {
  label: string;
  value: string;
  subValue?: string | null;
  mono?: boolean;
  accent?: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text
        style={{
          fontSize: subValue ? 17 : 22,
          fontWeight: "600",
          color: accent ?? "#fff",
          lineHeight: subValue ? 19 : 24,
          letterSpacing: 0,
          fontVariant: mono ? ["tabular-nums"] : undefined,
        }}
      >
        {value}
      </Text>
      {subValue ? (
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: "rgba(255,255,255,0.72)",
            lineHeight: 14,
            letterSpacing: 0,
            fontVariant: mono ? ["tabular-nums"] : undefined,
          }}
        >
          {subValue}
        </Text>
      ) : null}
      <View
        style={{
          width: 28,
          height: 2,
          backgroundColor: "rgba(255,255,255,0.35)",
          borderRadius: 9999,
          marginVertical: 6,
        }}
      />
      <Text
        style={{
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.8,
          color: "rgba(255,255,255,0.6)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function RoiSelector({
  active,
  onSelect,
}: {
  active: RoiKindLocal;
  onSelect: (kind: RoiKindLocal) => void;
}) {
  const opts: { id: RoiKindLocal; label: string; Icon: typeof Square }[] = [
    { id: "rect", label: "Rect", Icon: Square },
    { id: "polygon", label: "Polygon", Icon: Pentagon },
    { id: "circle", label: "Circle", Icon: CircleIcon },
  ];
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: "rgba(0,0,0,0.45)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        borderRadius: 9999,
        padding: 4,
        gap: 2,
      }}
    >
      {opts.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onSelect(id)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              height: 32,
              paddingHorizontal: 14,
              borderRadius: 9999,
              backgroundColor: isActive ? "rgba(255,255,255,0.95)" : "transparent",
            }}
          >
            <Icon size={14} color={isActive ? "#191918" : "rgba(255,255,255,0.85)"} />
            <Text
              style={{
                color: isActive ? "#191918" : "rgba(255,255,255,0.85)",
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
