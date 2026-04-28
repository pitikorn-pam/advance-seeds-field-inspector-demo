import { useRef, useState } from "react";
import { View, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
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
import { useAuth } from "@/lib/auth";
import { useCreateRecording } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import type { Roi, RoiKind } from "@/lib/capture/roi";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

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
 * stops the recording. On stop, the local file is checked against a 100 MB
 * upload guard, then uploaded to the `recordings` bucket and a row is
 * inserted in `recordings`. Photos and videos are orthogonal — recording
 * doesn't create an inspection row.
 *
 * Phase 4 swaps `useFrameTicker` for a real vision-camera frame processor.
 * The KPI strip's data shape (`AnalysisFrameResult`) stays the same.
 */
export default function CaptureScan() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();
  const session = useCaptureSession();
  const { profile } = useAuth();
  const createRecording = useCreateRecording();
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

  const cycleFlash = () =>
    setFlashMode((m) => (m === "off" ? "auto" : m === "auto" ? "on" : "off"));
  const toggleFlip = () => setPosition((p) => (p === "back" ? "front" : "back"));
  const toggleGrid = () => setShowGrid((g) => !g);

  // Drives the bottom KPI strip with mock detections every ~200 ms.
  const frameResult = useFrameTicker(!busy);

  const recording = useRecordingState(cameraRef, {
    onRecordingFinished: async ({ uri, durationMs }) => {
      if (!profile) return;
      try {
        const info = await FileSystem.getInfoAsync(uri);
        const bytes = info.exists && "size" in info ? (info.size as number) : 0;
        if (bytes > MAX_UPLOAD_BYTES) {
          Alert.alert(
            t("inspections:capture.recording.tooLargeTitle"),
            t("inspections:capture.recording.tooLargeBody", {
              limitMb: Math.round(MAX_UPLOAD_BYTES / 1024 / 1024),
            }),
          );
          return;
        }
        const path = `${profile.id}/${Date.now()}.mp4`;
        const fd = new FormData();
        fd.append("file", {
          uri,
          type: "video/mp4",
          name: "recording.mp4",
        } as unknown as Blob);
        const { error: upErr } = await supabase.storage
          .from("recordings")
          .upload(path, fd, { contentType: "video/mp4", upsert: false });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("recordings").getPublicUrl(path);
        await createRecording.mutateAsync({
          inspector_id: profile.id,
          video_url: urlData.publicUrl,
          duration_ms: Math.max(0, Math.round(durationMs)),
        });
      } catch (err) {
        console.error("[scan] recording upload failed", err);
        Alert.alert(
          t("inspections:capture.recording.uploadFailed"),
          err instanceof Error ? err.message : String(err),
        );
      }
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
    // Bracket takePhoto with torch-on for explicit "flash: on" + back camera.
    // Auto stays system-decided; off and front-camera (no LED hardware) skip
    // the bracket entirely.
    const wantFlash = flashMode === "on" && position === "back";
    if (wantFlash) {
      setTorch("on");
      // Give the native side ~80 ms to honour the new prop. setState ➜ render
      // ➜ Camera receives torch="on" ➜ AVCaptureDevice toggles the LED — three
      // hops, each ~one frame. Without this gap, takePhoto often runs before
      // the LED is on.
      await new Promise((r) => setTimeout(r, 80));
    }
    try {
      const photo = await cameraRef.current.takePhoto({ flash: flashMode });
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
    } finally {
      if (wantFlash) setTorch("off");
    }
  };

  const onLongPressShutter = () => {
    if (recording.isRecording || busy) return;
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
        cameraProps={{ video: true, audio: true, torch }}
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
