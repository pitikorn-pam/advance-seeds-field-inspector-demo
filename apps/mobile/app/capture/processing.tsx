import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import { AlertTriangle, Check, X } from "lucide-react-native";
import { tokens } from "@advance-seeds/tokens";
import { useTheme } from "@/lib/theme";
import type { AnalysisResult } from "@advance-seeds/types";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useAnalyzer } from "@/lib/analyzer/AnalyzerProvider";
import { useCaptureSession } from "@/lib/capture/session";
import { getCurrentLocation } from "@/lib/capture/location";
import { exportAnnotatedVideo } from "@/lib/capture/annotatedVideo";
import { optimizeImageForUpload } from "@/lib/capture/imageOptimization";
import { liveFrameFallbackResult } from "@/lib/capture/liveFrameFallback";
import { detectArucoCalibration } from "@/lib/calibration/ArucoCalibrator";
import { useCreateRecording, useVarieties } from "@/lib/queries";
import { addQueueEntry } from "@/lib/sync/store";
import { replaySyncQueue } from "@/lib/sync/replay";
import { isQueueableSyncError } from "@/lib/sync/errors";
import { readActiveModel } from "@/lib/models/modelStore";
import { classNameForSeed, resolveDetectorFilter } from "@/lib/capture/detectorFilter";
import { useNotify } from "@/lib/notifications";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { Button } from "@/components/ui/Button";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const PILOT_SLOW_STAGE_MS = 2500;

async function monitorPilotStage<T>(stage: string, work: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await work();
  } finally {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= PILOT_SLOW_STAGE_MS) {
      console.warn("[pilot-monitor] %s slow: %dms", stage, elapsedMs);
    } else {
      console.info("[pilot-monitor] %s: %dms", stage, elapsedMs);
    }
  }
}

function getImageDimensions(uri: string): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err),
    );
  });
}

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
  const { resolved } = useTheme();
  // Lucide icons take a fixed hex; thread the theme-correct ink so the
  // close-button glyph stays legible in dark mode. AppTopBar themes its own
  // icon — this covers the AlertTriangle / Cancel-X usage below.
  const inkHex = pickHex(tokens, ["color", "text", "primary"], resolved);
  const dangerHex = pickHex(tokens, ["color", "semantic", "danger", "text"], resolved);

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

    // Step 2 fires almost immediately — capture screen's ensureCalibrationLock
    // already gates entry on a real px/mm reading, so the operator doesn't
    // need to watch a 600 ms ceremony to confirm what's already true. A
    // 120 ms tick keeps the UI from flashing all steps at once, which would
    // be just as confusing.
    const calibrationTimer = setTimeout(() => {
      if (!cancelledRef.current) markStep("calibration");
    }, 120);

    // Cached thumbnail extracted from the video. Reused across:
    //   • inspection.image_url upload (must be a JPG so seed-detail can crop)
    //   • ArUco calibration on the still frame
    //   • analyzer single-shot
    // Declared at the outer scope so both stages can read it.
    let videoThumbnailLocalUri: string | null = null;
    // Resized JPEG used for both ArUco + analyzer in the photo branch. The
    // photo branch promotes this from optimizeImageForUpload(); ArUco and
    // the analyzer share the same pixel space so pxPerMm stays consistent.
    let photoAnalyzerUri: string = sourceUri;

    void (async () => {
      try {
        if (session.capturedMediaKind === "video") {
          const liveFrame = session.capturedLiveFrameResult;
          const uploadUri = await monitorPilotStage("video.export", () =>
            exportAnnotatedVideo(sourceUri, {
              roi: session.mode === "live" ? session.roi : null,
              seeds: liveFrame?.seeds ?? null,
              frameWidth: liveFrame?.frameWidth ?? null,
              frameHeight: liveFrame?.frameHeight ?? null,
              frameOrientation: liveFrame?.frameOrientation ?? null,
            }),
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
          const { error: uploadErr } = await monitorPilotStage("video.upload", () =>
            supabase.storage
              .from("recordings")
              .upload(path, fd, { contentType: "video/mp4", upsert: false }),
          );
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
              recordingId = await monitorPilotStage("recording.insert", () =>
                createRecording.mutateAsync({
                  inspector_id: profile.id,
                  video_url: videoUrl,
                  duration_ms: durationMs,
                  metadata: recordingMetadata,
                }),
              );
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
            const { uri: thumbUri } = await monitorPilotStage("video.thumbnail.extract", () =>
              VideoThumbnails.getThumbnailAsync(uploadUri, {
                time: midpointMs,
                quality: 0.9,
              }),
            );
            videoThumbnailLocalUri = thumbUri;
          } catch (err) {
            console.warn("[processing] video thumbnail extraction failed", err);
          }

          let thumbnailRemoteUrl: string | null = null;
          if (videoThumbnailLocalUri) {
            const thumbnailUri = videoThumbnailLocalUri;
            const optimizedThumb = await monitorPilotStage("video.thumbnail.optimize", () =>
              optimizeImageForUpload(thumbnailUri, {
                maxLongEdge: 1280,
                quality: 0.8,
              }),
            );
            console.info(
              "[processing] thumb optimized %d→%d bytes",
              optimizedThumb.originalBytes,
              optimizedThumb.optimizedBytes,
            );
            videoThumbnailLocalUri = optimizedThumb.uri;
            const thumbPath = `${profile.id}/${Date.now()}-thumb.jpg`;
            const thumbFd = new FormData();
            thumbFd.append("file", {
              uri: optimizedThumb.uri,
              type: "image/jpeg",
              name: "thumb.jpg",
            } as unknown as Blob);
            const { error: thumbErr } = await monitorPilotStage("video.thumbnail.upload", () =>
              supabase.storage
                .from("inspection-images")
                .upload(thumbPath, thumbFd, { contentType: "image/jpeg", upsert: false }),
            );
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
          // Stage 1: optimize → upload via FormData. Source iPhone/Samsung
          // JPEGs are typically 4032×3024 + minimal compression. We resize
          // to a 1280 long edge (~1280×960, ~720p): YOLO downsamples to
          // 640×640 internally so any size above ~1280 is loss-free for
          // detection, and on Android the post-capture analyzer decodes
          // JPEGs in pure JS via jpeg-js — going from 4032 to 1280 is a
          // ~10× pixel reduction and proportional decode speedup. The
          // inspection result image is shown at viewport sizes well under
          // 1280 px wide, so display fidelity is preserved.
          const optimized = await monitorPilotStage("photo.optimize", () =>
            optimizeImageForUpload(sourceUri, { maxLongEdge: 1280 }),
          );
          console.info(
            "[processing] photo optimized %d→%d bytes",
            optimized.originalBytes,
            optimized.optimizedBytes,
          );
          // Promote the optimized URI for downstream ArUco + analyzer use.
          // YOLO downsamples to 640×640 internally, so feeding a 2048-long-edge
          // JPEG is loss-free for detection. Big win on Android, where the
          // post-capture analyzer decodes JPEGs in pure JS via jpeg-js — a
          // 4032 px source can take seconds, the optimized one is ~5× faster.
          // ArUco moves with it so pxPerMm stays in the same pixel space as
          // the bboxes the analyzer produces.
          photoAnalyzerUri = optimized.uri;
          // Fire upload in the background while ArUco + analyze run on
          // the local URI. The upload typically takes ~1 s — blocking
          // on it before analyze stalls the user staring at "Detecting
          // seeds…" when the analyzer is actually ready in ~150 ms.
          // Set the local URI on session immediately so Review can render
          // the image; the remote URL overwrites when upload resolves
          // (usually well before the user taps Save and sync).
          session.set({ uploadedImageUrl: photoAnalyzerUri });
          const localUriForFallback = photoAnalyzerUri;
          const path = `${profile.id}/${Date.now()}.jpg`;
          const fd = new FormData();
          fd.append("file", {
            uri: optimized.uri,
            type: "image/jpeg",
            name: "capture.jpg",
          } as unknown as Blob);
          // Intentionally NOT awaited — runs in parallel with ArUco +
          // analyzer + the eventual review transition. Errors fall back
          // to the local URI, which the sync queue can re-upload on a
          // later online attempt.
          void monitorPilotStage("photo.upload", async () => {
            const { error: uploadErr } = await supabase.storage
              .from("inspection-images")
              .upload(path, fd, { contentType: "image/jpeg", upsert: false });
            const { data: urlData } = supabase.storage.from("inspection-images").getPublicUrl(path);
            if (cancelledRef.current) return;
            if (uploadErr) {
              console.warn("[processing] photo upload queued", uploadErr);
              session.set({ uploadedImageUrl: localUriForFallback });
            } else {
              session.set({ uploadedImageUrl: urlData.publicUrl });
            }
          });
        }
        if (cancelledRef.current) return;

        // Stage 2: calibrate + analyze. ArUco detection upgrades the manual
        // fallback when the printed 50 mm marker is visible in the capture.
        let calibrationReading = session.capturedCalibrationReading;
        if (session.capturedMediaKind === "photo") {
          try {
            const aruco = await monitorPilotStage("photo.aruco", () =>
              detectArucoCalibration(photoAnalyzerUri),
            );
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
        const activeModel = await readActiveModel().catch(() => null);
        const detectorFilter = resolveDetectorFilter(
          { mode: session.detectorFilterMode, classNames: session.detectorClassNames },
          activeModel?.metadata.class_names ?? null,
        );
        const activeVariety = session.varietyId
          ? varieties.data?.find((v) => v.id === session.varietyId)
          : null;
        const varietyNames =
          detectorFilter.varietyNames ?? (activeVariety?.name ? [activeVariety.name] : null);
        const modelClassAliases =
          detectorFilter.modelClassAliases ?? activeVariety?.model_class_aliases ?? null;
        const gradingConfig = activeVariety
          ? {
              criteria: activeVariety.grade_criteria,
              targetLengthMm: activeVariety.ref_length_mm,
              targetWidthMm: activeVariety.ref_width_mm,
            }
          : null;
        // For video captures we run the analyzer on the same representative
        // still that became the inspection's image_url (extracted above when
        // the video branch ran). Keeps the displayed crops consistent with
        // the analyzed frame and avoids extracting twice. ArUco calibration
        // also runs on the thumbnail so video flows benefit from marker-based
        // px/mm.
        let analyzerImageUri = photoAnalyzerUri;
        if (session.capturedMediaKind === "video" && videoThumbnailLocalUri) {
          const thumbnailUri = videoThumbnailLocalUri;
          analyzerImageUri = thumbnailUri;
          try {
            const aruco = await monitorPilotStage("video.thumbnail.aruco", () =>
              detectArucoCalibration(thumbnailUri),
            );
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
        const calibrationFallbackUsed = !calibrationReading;
        const effectivePxPerMm = calibrationReading?.pxPerMm ?? 38.4;
        if (calibrationFallbackUsed) {
          notify({
            kind: "warning",
            title: t("inspections:capture.calibration.defaultFallbackTitle"),
            body: t("inspections:capture.calibration.defaultFallbackBody"),
          });
          console.warn(
            "[processing] using default calibration fallback pxPerMm=%d",
            effectivePxPerMm,
          );
        }
        const analyzedImage = await getImageDimensions(analyzerImageUri).catch(() => ({
          width: null,
          height: null,
        }));
        let result: AnalysisResult =
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
            : await monitorPilotStage("analyzer.single-shot", () =>
                analyzer.analyze(
                  { kind: "uri", uri: analyzerImageUri },
                  {
                    pxPerMm: effectivePxPerMm,
                    classFilter: detectorFilter.classFilter
                      ? [...detectorFilter.classFilter]
                      : undefined,
                    varietyNames,
                    modelClassAliases,
                    roi: session.mode === "live" ? session.roi : null,
                    gradingConfig,
                  },
                ),
              );
        const analysisHasMasks = result.seeds.some(
          (seed) => seed.mask?.polygon && seed.mask.polygon.length >= 3,
        );
        const liveFrameHasMasks =
          session.capturedLiveFrameResult?.seeds.some(
            (seed) => seed.mask?.polygon && seed.mask.polygon.length >= 3,
          ) ?? false;
        const shouldPromoteLiveMasks =
          Platform.OS === "android" && !analysisHasMasks && liveFrameHasMasks;
        const shouldUseLiveFrameFallback =
          result.analyzerId !== "skip-video" &&
          (result.seeds.length === 0 || shouldPromoteLiveMasks);
        if (shouldUseLiveFrameFallback) {
          const fallback = await liveFrameFallbackResult(
            session.capturedLiveFrameResult,
            analyzerImageUri,
          ).catch((err) => {
            console.warn("[processing] live-frame fallback unavailable", err);
            return null;
          });
          if (fallback) {
            console.warn(
              "[processing] using shutter live-frame fallback with %d seeds (analysis seeds=%d masks=%s liveMasks=%s)",
              fallback.seeds.length,
              result.seeds.length,
              analysisHasMasks ? "yes" : "no",
              liveFrameHasMasks ? "yes" : "no",
            );
            result = fallback;
          }
        }
        const usedLiveFrameFallback = result.analyzerId.endsWith("+shutter-fallback");
        result = {
          ...result,
          seeds: result.seeds.map((seed) => ({
            ...seed,
            class_name:
              seed.class_name ?? classNameForSeed(seed.class_id, activeModel?.metadata.class_names),
          })),
        };
        if (cancelledRef.current) return;

        // No-detection inspections are saved with an empty seed list rather
        // than being blocked. The review screen surfaces the count
        // prominently so the operator can re-capture or accept; blocking
        // here turned every false-positive frame into a frustrating retry
        // loop. The earlier hard guard helped find decoder/format bugs but
        // is no longer needed now that the pipeline is correct.
        if (result.seeds.length === 0 && result.analyzerId !== "skip-video") {
          console.warn(
            "[processing] analyzer returned 0 seeds; saving inspection with empty result",
          );
        }

        // Reveal the count step once we know the number of seeds, then
        // grading after a short pause so the user sees the transition.
        setDetectedCount(result.summary.total_seeds);
        markStep("detected");

        const liveFrame = session.capturedLiveFrameResult;
        const diagnostics = {
          live_seed_count: liveFrame?.summary.total_seeds ?? liveFrame?.seeds.length ?? null,
          analyze_seed_count: result.summary.total_seeds,
          live_frame_width: liveFrame?.frameWidth ?? null,
          live_frame_height: liveFrame?.frameHeight ?? null,
          live_frame_orientation: liveFrame?.frameOrientation ?? null,
          analyzed_image_width: analyzedImage.width,
          analyzed_image_height: analyzedImage.height,
          captured_image_orientation: session.capturedFrameMetadata?.orientation ?? null,
          analyzed_image_orientation: "up",
          used_live_frame_fallback: usedLiveFrameFallback,
          calibration_fallback_used: calibrationFallbackUsed,
          calibration_source_used: calibrationReading?.source ?? "default",
        };
        console.info(
          "[capture-qa] live=%s analyze=%d liveOrientation=%s image=%sx%s fallback=%s calibration=%s pxPerMm=%d",
          diagnostics.live_seed_count ?? "n/a",
          diagnostics.analyze_seed_count,
          diagnostics.live_frame_orientation ?? "unknown",
          diagnostics.analyzed_image_width ?? "?",
          diagnostics.analyzed_image_height ?? "?",
          diagnostics.used_live_frame_fallback ? "yes" : "no",
          diagnostics.calibration_source_used,
          effectivePxPerMm,
        );

        session.set({ analysisResult: result, analysisDiagnostics: diagnostics });

        // Tight grading ceremony — analyzer.analyze() above already took
        // hundreds of ms, so the operator has read enough progress UI.
        // 80 ms is just long enough for the grading checkmark animation
        // to start before we transition to Review.
        setTimeout(() => {
          if (cancelledRef.current) return;
          markStep("grading");
          setDone(true);
          router.replace("/capture/review");
        }, 80);
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

  // 4 steps × 25% per completed step. Derives a sensible "% done" without
  // a real progress signal from the analyzer (which only reports completion).
  const percent = useMemo(() => {
    const order: Step[] = ["captured", "calibration", "detected", "grading"];
    const doneCount = order.filter((s) => completed.has(s)).length;
    return Math.round((doneCount / order.length) * 100);
  }, [completed]);

  const activeStep: Step | null = useMemo(() => {
    const order: Step[] = ["captured", "calibration", "detected", "grading"];
    for (const s of order) if (!completed.has(s)) return s;
    return null;
  }, [completed]);

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <AppTopBar
          title={t("inspections:capture.processing.failedTitle", "Analysis failed")}
          left={{
            accessibilityLabel: t("common:actions.cancel"),
            renderIcon: () => <X color={inkHex} size={20} />,
            onPress: onCancel,
          }}
        />
        <View className="flex-1 items-center justify-center gap-md px-xl">
          <View className="h-[160px] w-[160px] items-center justify-center rounded-3xl border border-line-tertiary bg-bg-primary">
            <AlertTriangle color={dangerHex} size={56} />
          </View>
          <Text className="text-h1 text-fg-primary font-semibold mt-md text-center">
            {t("inspections:capture.processing.failedTitle", "Analysis failed")}
          </Text>
          <Text className="text-body text-fg-secondary text-center" style={{ maxWidth: 280 }}>
            {error}
          </Text>
        </View>
        <View className="gap-sm px-xl pb-xl pt-sm">
          <Button label={t("common:actions.retry")} onPress={onRetry} />
          <Button variant="secondary" label={t("common:actions.cancel")} onPress={onCancel} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("inspections:capture.processing.title")}
        left={{
          accessibilityLabel: t("common:actions.cancel"),
          renderIcon: () => <X color={inkHex} size={20} />,
          onPress: onCancel,
        }}
      />

      <View className="flex-1 items-center justify-center px-xl">
        {/* Concentric progress disc — 160×160 white card with a 120×120
            SVG ring inside and a percent readout in the centre. The disc
            stays static-sized across the four steps so the layout doesn't
            shift as progress advances. */}
        <View className="h-[160px] w-[160px] items-center justify-center rounded-3xl border border-line-tertiary bg-bg-primary">
          <ConcentricProgress percent={percent} inkHex={inkHex} />
        </View>

        <Text className="text-h2 text-fg-primary font-semibold mt-xl text-center">
          {t("inspections:capture.processing.analyzingSeeds", {
            count: detectedCount ?? 0,
            defaultValue: `Analyzing ${detectedCount ?? 0} seeds`,
          })}
        </Text>
        <Text className="text-body text-fg-secondary text-center mt-sm" style={{ maxWidth: 280 }}>
          {t("inspections:capture.processing.subtitle")}
        </Text>

        {/* Step list card */}
        <View className="mt-2xl w-full max-w-[320px] rounded-lg border border-line-tertiary bg-bg-primary p-[4px]">
          <StepRow
            label={t("inspections:capture.processing.stepCaptured")}
            state={
              completed.has("captured") ? "done" : activeStep === "captured" ? "active" : "pending"
            }
            isLast={false}
          />
          <StepRow
            label={t("inspections:capture.processing.stepCalibration")}
            state={
              completed.has("calibration")
                ? "done"
                : activeStep === "calibration"
                  ? "active"
                  : "pending"
            }
            isLast={false}
          />
          <StepRow
            label={t("inspections:capture.processing.stepDetected", {
              count: detectedCount ?? 0,
            })}
            state={
              completed.has("detected") ? "done" : activeStep === "detected" ? "active" : "pending"
            }
            isLast={false}
          />
          <StepRow
            label={t("inspections:capture.processing.stepGrading")}
            state={
              completed.has("grading") ? "done" : activeStep === "grading" ? "active" : "pending"
            }
            isLast
          />
        </View>

        {done ? (
          <Text className="mt-2xl text-caption text-fg-secondary">
            {t("inspections:capture.processing.openingResults")}
          </Text>
        ) : null}
      </View>

      <View className="px-xl pb-xl pt-sm">
        <Button variant="secondary" label={t("common:actions.cancel")} onPress={onCancel} />
      </View>
    </SafeAreaView>
  );
}

/**
 * SVG-based concentric progress ring matching the prototype: thick light
 * track, primary-coloured arc, percent readout at the centre. Pure visual —
 * the `percent` prop is what drives the dash offset.
 */
function ConcentricProgress({ percent, inkHex }: { percent: number; inkHex: string }) {
  const { resolved } = useTheme();
  // SVG strokes can't read NativeWind classes, so resolve theme-aware hex
  // out of the canonical tokens tree. Track uses the same value as the
  // `line-tertiary` border so the ring sits flush against the surrounding
  // card border; the arc is the brand purple primary.
  const trackHex = pickHex(tokens, ["color", "border", "tertiary"], resolved);
  const arcHex = pickHex(tokens, ["color", "brand", "primary"], resolved);
  const size = 120;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(100, percent)) / 100);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={trackHex}
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={arcHex}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <SvgText
        x={size / 2}
        y={size / 2 + 7}
        textAnchor="middle"
        fontSize={22}
        fontWeight="600"
        fill={inkHex}
      >
        {`${percent}%`}
      </SvgText>
    </Svg>
  );
}

type StepRowState = "pending" | "active" | "done";
function StepRow({
  label,
  state,
  isLast,
}: {
  label: string;
  state: StepRowState;
  isLast: boolean;
}) {
  const { t } = useTranslation(["inspections"]);
  const { resolved } = useTheme();
  // Check glyph rides on a coloured circle (success/primary), so use the
  // token-defined onDark ink to stay legible in both themes.
  const onDarkHex = pickHex(tokens, ["color", "text", "onDark"], resolved);
  return (
    <View
      className={`flex-row items-center gap-md px-md py-[10px] ${isLast ? "" : "border-b border-line-tertiary"}`}
    >
      <View
        className={`h-[22px] w-[22px] items-center justify-center rounded-full ${
          state === "done"
            ? "bg-success-text"
            : state === "active"
              ? "bg-primary"
              : "bg-line-tertiary"
        }`}
      >
        {state === "done" ? (
          <Check color={onDarkHex} size={14} strokeWidth={3} />
        ) : state === "active" ? (
          <View className="h-[6px] w-[6px] rounded-full bg-primary-on" />
        ) : null}
      </View>
      <Text
        className={`flex-1 ${state === "active" ? "text-body font-medium text-fg-primary" : state === "done" ? "text-caption text-fg-primary" : "text-caption text-fg-tertiary"}`}
      >
        {label}
      </Text>
      {state === "active" ? (
        <Text className="text-[11px] font-semibold text-primary">
          {t("inspections:capture.processing.inProgress", "in progress")}
        </Text>
      ) : null}
    </View>
  );
}

// Walks the runtime tokens tree to a leaf and returns the theme-correct
// hex. Mirrors the helper in welcome.tsx / splash.tsx; SVG strokes and
// Lucide icon colours need raw hex strings that NativeWind can't supply.
function pickHex(
  source: Record<string, unknown>,
  path: readonly string[],
  resolved: "light" | "dark",
): string {
  let node: unknown = source;
  for (const seg of path) {
    if (node && typeof node === "object" && seg in (node as object)) {
      node = (node as Record<string, unknown>)[seg];
    } else {
      return "transparent";
    }
  }
  if (typeof node === "string") return node;
  if (node && typeof node === "object") {
    const leaf = node as { value?: unknown; darkValue?: unknown };
    const v =
      resolved === "dark" && typeof leaf.darkValue === "string" ? leaf.darkValue : leaf.value;
    if (typeof v === "string") return v;
  }
  return "transparent";
}
