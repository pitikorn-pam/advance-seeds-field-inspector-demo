import { useRef, useState } from "react";
import { View, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
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
import { useCaptureSession } from "@/lib/capture/session";
import { useRecordingState } from "@/lib/capture/recording";
import { useNotify } from "@/lib/notifications";
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
  const [busy, setBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [roiTool, setRoiTool] = useState<RoiKind | null>(null);
  const [position, setPosition] = useState<"back" | "front">("back");
  const [flashMode, setFlashMode] = useState<FlashMode>("off");
  const [showGrid, setShowGrid] = useState(false);
  // Torch is the LED-as-flashlight control. Vision Camera's `flash: 'on'`
  // option is unreliable on iOS 26 + iPhone 17 series, so we briefly toggle
  // the torch around `takePhoto` instead. See onShutter for the bracket.
  const [torch, setTorch] = useState<"off" | "on">("off");
  // Snapshot toast — surfaces "Snapshot saved" for ~2 s without an Alert.
  const [toast, setToast] = useState<string | null>(null);
  const cameraTorch = flashMode === "on" && position === "back" ? "on" : torch;

  const cycleFlash = () =>
    setFlashMode((m) => (m === "off" ? "auto" : m === "auto" ? "on" : "off"));
  const toggleFlip = () => setPosition((p) => (p === "back" ? "front" : "back"));
  const toggleGrid = () => setShowGrid((g) => !g);

  // Drives the bottom KPI strip with mock detections every ~200 ms.
  const frameResult = useFrameTicker(!busy);

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
      });
      setCameraActive(false);
      setTimeout(() => router.push("/capture/processing"), 60);
    },
    onRecordingError: (err) => {
      console.error("[scan] recording error", err);
      Alert.alert(t("common:states.error"), err.message);
    },
  });

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
    // Tap-to-stop while recording — overrides photo capture.
    if (recording.isRecording) {
      recording.stop();
      return;
    }
    if (busy || !cameraRef.current) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    recording.start();
  };

  const onRecordPress = () => {
    if (recording.isRecording) {
      recording.stop();
      return;
    }
    if (busy) return;
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

  return (
    <View className="flex-1 bg-black">
      <Viewfinder
        active={cameraActive}
        cameraRef={cameraRef}
        position={position}
        showGrid={showGrid}
        cameraProps={{ video: true, audio: true, torch: cameraTorch }}
      >
        <SafeAreaView className="flex-1" edges={["top", "bottom"]} pointerEvents="box-none">
          <GlassTopBar
            centerLabel={`${t("inspections:capture.live.pillLabel")} · ${t("inspections:capture.shutter")}`}
            centerDotColor="#5DCAA5"
            flashMode={flashMode}
            onFlashPress={cycleFlash}
          />

          {/* Inline calibration pill — sits below the top bar (hidden during
              recording so the timer takes the spotlight). */}
          {!recording.isRecording ? (
            <View className="items-center mt-xs" pointerEvents="box-none">
              <CalibrationPill reading={null} />
            </View>
          ) : (
            <RecordingTimer durationMs={recording.durationMs} />
          )}

          {/* ROI overlay sits between the chrome and the KPI strip. When no
              tool is active it's pointerEvents-transparent and only renders
              the committed shape; when a tool is active it captures touches
              for drawing. Phase 4 will render Skia detection rings here too. */}
          <View className="flex-1" pointerEvents="box-none">
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

          <KpiStrip frameResult={frameResult} roi={session.roi} />

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
