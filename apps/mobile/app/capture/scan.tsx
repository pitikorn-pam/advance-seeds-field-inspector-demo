import { useRef, useState } from "react";
import { View, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import { Camera as VCCamera } from "react-native-vision-camera";
import { Viewfinder } from "@/components/camera/Viewfinder";
import { GlassTopBar } from "@/components/camera/GlassTopBar";
import { ShutterBar } from "@/components/camera/ShutterBar";
import { KpiStrip } from "@/components/camera/KpiStrip";
import { CalibrationPill } from "@/components/camera/CalibrationPill";
import { RoiOverlay } from "@/components/camera/RoiOverlay";
import { RoiToolbar } from "@/components/camera/RoiToolbar";
import { RecordingTimer } from "@/components/camera/RecordingTimer";
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

  const onLongPressShutter = () => {
    if (recording.isRecording || busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    recording.start();
  };

  return (
    <View className="flex-1 bg-black">
      <Viewfinder
        active={cameraActive}
        cameraRef={cameraRef}
        cameraProps={{ video: true, audio: true }}
      >
        <SafeAreaView className="flex-1" edges={["top", "bottom"]} pointerEvents="box-none">
          <GlassTopBar
            centerLabel={`${t("inspections:capture.live.pillLabel")} · ${t("inspections:capture.shutter")}`}
            centerDotColor="#5DCAA5"
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
            isLive={!recording.isRecording}
            isRecording={recording.isRecording}
            disabled={busy}
          />
        </SafeAreaView>
      </Viewfinder>
    </View>
  );
}
