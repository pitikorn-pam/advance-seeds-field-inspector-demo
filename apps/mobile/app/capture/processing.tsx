import { useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Check } from "lucide-react-native";
import type { AnalysisResult } from "@advance-seeds/types";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useAnalyzer } from "@/lib/analyzer/AnalyzerProvider";
import { useCaptureSession } from "@/lib/capture/session";
import { getCurrentLocation } from "@/lib/capture/location";
import { exportAnnotatedVideo } from "@/lib/capture/annotatedVideo";
import { detectArucoCalibration } from "@/lib/calibration/ArucoCalibrator";
import { useCreateRecording, useVarieties } from "@/lib/queries";
import { addQueueEntry } from "@/lib/sync/store";
import { replaySyncQueue } from "@/lib/sync/replay";
import { isQueueableSyncError } from "@/lib/sync/errors";
import { DEFAULT_CAPTURE_CLASS_IDS } from "@/lib/analyzer/captureClasses";
import { useNotify } from "@/lib/notifications";
import { ProcessingOrb } from "@/components/camera/ProcessingOrb";
import { Button } from "@/components/ui/Button";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * Post-shutter processing screen.
 *
 * Sequence (real work):
 *   1. Upload the captured frame to Supabase Storage.
 *   2. Run the analyzer on the URI to produce an AnalysisResult.
 *   3. Stash the result on the session and route to /capture/review.
 *
 * Visual (prototype-faithful):
 *   • Brand-tinted spinning orb above the headline.
 *   • Four-step checklist:
 *       - "Frame captured"        — checked immediately on mount.
 *       - "Calibration applied"   — checked at ~600 ms (decorative; Phase 5
 *                                    hooks a real LiveCalibrator here).
 *       - "Detected N seeds"      — checked once the analyzer returns the
 *                                    actual count from AnalysisResult.
 *       - "Grading quality…"      — spinner until the full result lands.
 *   • Auto-routes to /capture/review when analysis completes.
 *
 * Errors fall back to a single-screen retry/cancel state. We don't leave
 * the user staring at a stuck checklist.
 */
type Step = "captured" | "calibration" | "detected" | "grading";

export default function CaptureProcessing() {
  const { t } = useTranslation(["common", "inspections", "notifications"]);
  const router = useRouter();
  const { profile } = useAuth();
  const analyzer = useAnalyzer();
  const session = useCaptureSession();
  const varieties = useVarieties();
  const createRecording = useCreateRecording();
  const notify = useNotify();

  const [completed, setCompleted] = useState<Set<Step>>(new Set());
  const [detectedCount, setDetectedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const cancelledRef = useRef(false);

  const markStep = (step: Step) =>
    setCompleted((prev) => {
      if (prev.has(step)) return prev;
      const next = new Set(prev);
      next.add(step);
      return next;
    });

  useEffect(() => {
    const sourceUri =
      session.capturedMediaKind === "video" ? session.capturedVideoUri : session.capturedImageUri;

    if (!sourceUri || !profile) {
      router.replace("/capture/setup");
      return;
    }

    cancelledRef.current = false;

    // Step 1 fires immediately — the captured frame already exists locally
    // by the time we land on this screen.
    markStep("captured");

    // Step 2 fires shortly after for ceremony. Real LiveCalibrator output
    // (Phase 5) replaces this timer with a `reading.confidence >= 0.6` gate.
    const calibrationTimer = setTimeout(() => {
      if (!cancelledRef.current) markStep("calibration");
    }, 600);

    // Cached thumbnail extracted from the video. Reused across:
    //   • inspection.image_url upload (must be a JPG so seed-detail can crop)
    //   • ArUco calibration on the still frame
    //   • analyzer single-shot
    // Declared at the outer scope so both stages can read it.
    let videoThumbnailLocalUri: string | null = null;

    void (async () => {
      try {
        if (session.capturedMediaKind === "video") {
          const uploadUri = await exportAnnotatedVideo(
            sourceUri,
            session.mode === "live" ? session.roi : null,
          );
          const info = await FileSystem.getInfoAsync(uploadUri);
          const bytes = info.exists && "size" in info ? (info.size as number) : 0;
          if (bytes > MAX_UPLOAD_BYTES) {
            const limitMb = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
            notify({
              kind: "warning",
              title: t("notifications:recordingTooLarge.title"),
              body: t("notifications:recordingTooLarge.body", { limitMb }),
            });
            throw new Error(t("inspections:capture.recording.tooLargeBody", { limitMb }));
          }

          const path = `${profile.id}/${Date.now()}.mp4`;
          const fd = new FormData();
          fd.append("file", {
            uri: uploadUri,
            type: "video/mp4",
            name: "recording.mp4",
          } as unknown as Blob);
          const { error: uploadErr } = await supabase.storage
            .from("recordings")
            .upload(path, fd, { contentType: "video/mp4", upsert: false });
          const { data: urlData } = supabase.storage.from("recordings").getPublicUrl(path);
          if (cancelledRef.current) return;

          const recordingMetadata: Record<string, unknown> | null = session.locationTagEnabled
            ? { location_capture_enabled: true }
            : null;
          if (session.locationTagEnabled) {
            const loc = await getCurrentLocation(t);
            if (loc && recordingMetadata) recordingMetadata.location = loc;
          }
          const durationMs = Math.max(0, Math.round(session.recordingDurationMs ?? 0));
          let recordingId: string | null = null;
          let videoUrl = uploadUri;
          if (!uploadErr) {
            videoUrl = urlData.publicUrl;
            try {
              recordingId = await createRecording.mutateAsync({
                inspector_id: profile.id,
                video_url: videoUrl,
                duration_ms: durationMs,
                metadata: recordingMetadata,
              });
            } catch (err) {
              if (isQueueableSyncError(err)) {
                // Storage upload succeeded but the row insert failed —
                // queue it with the remote URL preserved so replay only
                // re-runs the DB insert.
                await addQueueEntry({
                  kind: "recording",
                  data: {
                    inspector_id: profile.id,
                    local_video_uri: uploadUri,
                    remote_video_url: videoUrl,
                    duration_ms: durationMs,
                    metadata: recordingMetadata,
                  },
                });
                void replaySyncQueue();
              } else {
                throw err;
              }
            }
          } else {
            // Storage upload failed — enqueue with no remote URL; replay
            // will retry the upload + insert as one unit.
            console.warn("[processing] recording upload queued", uploadErr);
            await addQueueEntry({
              kind: "recording",
              data: {
                inspector_id: profile.id,
                local_video_uri: uploadUri,
                remote_video_url: null,
                duration_ms: durationMs,
                metadata: recordingMetadata,
              },
            });
            void replaySyncQueue();
          }
          const totalSec = Math.max(0, Math.round(durationMs / 1000));
          const min = Math.floor(totalSec / 60);
          const sec = totalSec % 60;
          notify({
            kind: "success",
            title: t("notifications:recordingUploaded.title"),
            body: t("notifications:recordingUploaded.body", {
              duration: `${min}:${sec.toString().padStart(2, "0")}`,
            }),
          });

          // Extract a representative still and upload it as the
          // inspection's `image_url`. Done AFTER the video upload so the
          // mp4 is fully flushed by the camera writer — extracting too
          // early can hit AVAssetImageGenerator while the file is still
          // being finalized. Midpoint dodges motion blur at recording
          // start.
          const midpointMs = Math.max(0, Math.floor(durationMs / 2));
          try {
            const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uploadUri, {
              time: midpointMs,
              quality: 0.9,
            });
            videoThumbnailLocalUri = thumbUri;
          } catch (err) {
            console.warn("[processing] video thumbnail extraction failed", err);
          }

          let thumbnailRemoteUrl: string | null = null;
          if (videoThumbnailLocalUri) {
            const thumbPath = `${profile.id}/${Date.now()}-thumb.jpg`;
            const thumbFd = new FormData();
            thumbFd.append("file", {
              uri: videoThumbnailLocalUri,
              type: "image/jpeg",
              name: "thumb.jpg",
            } as unknown as Blob);
            const { error: thumbErr } = await supabase.storage
              .from("inspection-images")
              .upload(thumbPath, thumbFd, { contentType: "image/jpeg", upsert: false });
            if (!thumbErr) {
              const { data: thumbUrlData } = supabase.storage
                .from("inspection-images")
                .getPublicUrl(thumbPath);
              thumbnailRemoteUrl = thumbUrlData.publicUrl;
            } else {
              console.warn("[processing] thumbnail upload failed", thumbErr);
            }
          }

          session.set({
            capturedVideoUri: uploadUri,
            // Inspection's image_url must be a JPG so seed-detail can crop
            // bboxes from it. Fall back to the local thumbnail if upload
            // failed; last resort is the video URL — preserves "save still
            // works" but seed-detail crops will miss until a thumbnail lands.
            uploadedImageUrl: thumbnailRemoteUrl ?? videoThumbnailLocalUri ?? videoUrl,
            uploadedVideoUrl: videoUrl,
            recordingId,
          });
        } else {
          // Stage 1: upload via FormData. Canonical RN pattern for Supabase
          // Storage — supabase-js detects FormData and forwards multipart.
          const path = `${profile.id}/${Date.now()}.jpg`;
          const fd = new FormData();
          fd.append("file", {
            uri: sourceUri,
            type: "image/jpeg",
            name: "capture.jpg",
          } as unknown as Blob);
          const { error: uploadErr } = await supabase.storage
            .from("inspection-images")
            .upload(path, fd, { contentType: "image/jpeg", upsert: false });
          const { data: urlData } = supabase.storage.from("inspection-images").getPublicUrl(path);
          if (cancelledRef.current) return;
          if (uploadErr) console.warn("[processing] photo upload queued", uploadErr);
          session.set({ uploadedImageUrl: uploadErr ? sourceUri : urlData.publicUrl });
        }
        if (cancelledRef.current) return;

        // Stage 2: calibrate + analyze. ArUco detection upgrades the manual
        // fallback when the printed 50 mm marker is visible in the capture.
        let calibrationReading = session.capturedCalibrationReading;
        if (session.capturedMediaKind === "photo") {
          try {
            const aruco = await detectArucoCalibration(sourceUri);
            if (aruco) {
              calibrationReading = aruco.reading;
              session.set({
                capturedCalibrationReading: aruco.reading,
                capturedCalibrationProfileName: null,
              });
            }
          } catch (err) {
            console.warn("[processing] aruco calibration unavailable", err);
          }
        }
        // Source the class filter from the inspected variety. Empty array
        // means "no filter" (analyzer keeps every class), so we fall back to
        // the demo default whenever a variety has no COCO mapping yet.
        const activeVariety = varieties.data?.find((v) => v.id === session.varietyId);
        const classFilter =
          activeVariety?.coco_class_id !== null && activeVariety?.coco_class_id !== undefined
            ? [activeVariety.coco_class_id]
            : [...DEFAULT_CAPTURE_CLASS_IDS];
        // For video captures we run the analyzer on the same representative
        // still that became the inspection's image_url (extracted above when
        // the video branch ran). Keeps the displayed crops consistent with
        // the analyzed frame and avoids extracting twice. ArUco calibration
        // also runs on the thumbnail so video flows benefit from marker-based
        // px/mm.
        let analyzerImageUri = sourceUri;
        if (session.capturedMediaKind === "video" && videoThumbnailLocalUri) {
          analyzerImageUri = videoThumbnailLocalUri;
          try {
            const aruco = await detectArucoCalibration(videoThumbnailLocalUri);
            if (aruco) {
              calibrationReading = aruco.reading;
              session.set({
                capturedCalibrationReading: aruco.reading,
                capturedCalibrationProfileName: null,
              });
            }
          } catch (err) {
            console.warn("[processing] aruco on video thumbnail failed", err);
          }
        }
        const effectivePxPerMm = calibrationReading?.pxPerMm ?? 38.4;
        const result: AnalysisResult =
          analyzerImageUri === sourceUri && session.capturedMediaKind === "video"
            ? // Thumbnail extraction failed — fall back to empty result so the
              // Review page still mounts with the video.
              {
                analyzerId: "skip-video",
                durationMs: 0,
                seeds: [],
                summary: {
                  total_seeds: 0,
                  mean_length_mm: 0,
                  mean_width_mm: 0,
                  mean_area_mm2: 0,
                },
              }
            : await analyzer.analyze(
                { kind: "uri", uri: analyzerImageUri },
                {
                  pxPerMm: effectivePxPerMm,
                  classFilter,
                  roi: session.mode === "live" ? session.roi : null,
                },
              );
        if (cancelledRef.current) return;

        // Reveal the count step once we know the number of seeds, then
        // grading after a short pause so the user sees the transition.
        setDetectedCount(result.summary.total_seeds);
        markStep("detected");

        session.set({ analysisResult: result });

        setTimeout(() => {
          if (cancelledRef.current) return;
          markStep("grading");
          setDone(true);
          router.replace("/capture/review");
        }, 350);
      } catch (err) {
        if (cancelledRef.current) return;
        // Surface as much detail as possible — Network failures often arrive
        // as bare "Network request failed" with the real cause on .cause.
        const detail =
          err instanceof Error
            ? `${err.name}: ${err.message}${err.cause ? `\nCause: ${String(err.cause)}` : ""}`
            : typeof err === "object" && err !== null
              ? JSON.stringify(err, null, 2)
              : String(err);
        console.error("[processing] failed", err);
        if (session.capturedMediaKind === "video") {
          const reason = err instanceof Error ? err.message : String(err);
          notify({
            kind: "error",
            title: t("notifications:recordingFailed.title"),
            body: t("notifications:recordingFailed.body", { reason }),
          });
        }
        setError(detail);
      }
    })();

    return () => {
      cancelledRef.current = true;
      clearTimeout(calibrationTimer);
    };
    // Intentionally run-once on mount: the captured URI at first render is
    // what we want to upload + analyze. Re-running on session/profile/analyzer
    // changes would trigger duplicate uploads.
  }, []);

  const onCancel = () => {
    session.reset();
    router.replace("/capture/setup");
  };
  const onRetry = () => router.replace("/capture/processing");

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center gap-md px-xl">
          <Text className="text-h1 text-fg-primary font-medium">{t("common:states.error")}</Text>
          <Text className="text-body text-fg-secondary text-center">{error}</Text>
          <View className="flex-row gap-md mt-md">
            <Button variant="outline" label={t("common:actions.cancel")} onPress={onCancel} />
            <Button label={t("common:actions.retry")} onPress={onRetry} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <View className="flex-1 items-center px-xl pt-3xl">
        <View className="mt-3xl mb-xl">
          <ProcessingOrb />
        </View>

        <Text className="text-h1 text-fg-primary font-medium" style={{ fontSize: 26 }}>
          {t("inspections:capture.processing.title")}
        </Text>
        <Text className="text-body text-fg-secondary text-center mt-sm" style={{ maxWidth: 320 }}>
          {t("inspections:capture.processing.subtitle")}
        </Text>

        <View className="mt-2xl gap-md self-start" style={{ width: 240, alignSelf: "center" }}>
          <Step
            label={t("inspections:capture.processing.stepCaptured")}
            done={completed.has("captured")}
          />
          <Step
            label={t("inspections:capture.processing.stepCalibration")}
            done={completed.has("calibration")}
          />
          <Step
            label={t("inspections:capture.processing.stepDetected", {
              count: detectedCount ?? 0,
            })}
            done={completed.has("detected")}
          />
          <Step
            label={t("inspections:capture.processing.stepGrading")}
            done={completed.has("grading")}
            spinning={!completed.has("grading") && completed.has("detected")}
          />
        </View>

        {done ? (
          <Text className="mt-3xl text-caption text-fg-secondary">
            {t("inspections:capture.processing.openingResults")}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function Step({
  label,
  done,
  spinning = false,
}: {
  label: string;
  done: boolean;
  spinning?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-md">
      {done ? (
        <Check color="#0F6E56" size={16} />
      ) : spinning ? (
        <ActivityIndicator color="#0F6E56" size="small" />
      ) : (
        <View
          className="h-4 w-4 rounded-full"
          style={{ borderWidth: 1.5, borderColor: "rgba(0,0,0,0.12)" }}
        />
      )}
      <Text className={done ? "text-fg-primary" : "text-fg-secondary"} style={{ fontSize: 13 }}>
        {label}
      </Text>
    </View>
  );
}
