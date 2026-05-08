import { useEffect, useMemo, useState } from "react";
import { FlatList, Platform, View, Text, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { ChevronLeft, Share2, ChevronRight, Check } from "lucide-react-native";
import type { AnalyzedSeed, SeedGrade } from "@advance-seeds/types";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useCaptureSession } from "@/lib/capture/session";
import { getCurrentLocation } from "@/lib/capture/location";
import type { CaptureAnalysisDiagnostics } from "@/lib/capture/session";
import { exportAnnotatedVideo } from "@/lib/capture/annotatedVideo";
import { shareAnnotatedImage, shareVideo } from "@/lib/capture/imageActions";
import { displayInspectionNote } from "@/lib/inspections/notes";
import {
  buildInspectionMetadata,
  locationDisplayName,
  type AnalyzerModelMetadata,
} from "@/lib/inspections/metadata";
import { getHyperParamsSync } from "@/lib/analyzer/hyperparams";
import { resolvePreprocessProfile } from "@/lib/analyzer/preprocess";
import { readActiveModel } from "@/lib/models/modelStore";
import type { InstalledModelRecord } from "@/lib/models/types";
import { addQueueEntry } from "@/lib/sync/store";
import { replaySyncQueue } from "@/lib/sync/replay";
import { isQueueableSyncError, syncErrorMessage } from "@/lib/sync/errors";
import {
  buildInspectionSavePayload,
  isLocalUri,
  toInspectionQueuePayload,
  type InspectionSavePayload,
} from "@/lib/inspections/savePayload";
import { useCreateInspection } from "@/lib/queries";
import { useNotify } from "@/lib/notifications";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { GradeRing } from "@/components/inspections/GradeRing";
import { CaptureMediaPreview } from "@/components/capture/CaptureMediaPreview";

type SortMode = "index" | "grade" | "length";

/**
 * Snapshot the model + thresholds at capture time so historical
 * inspections stay traceable to a specific analyzer config even after
 * the operator changes models or tunes hyperparameters.
 */
function buildAnalyzerModelMetadata(
  active: InstalledModelRecord | null,
  analyzerRuntime: string,
): AnalyzerModelMetadata {
  const hp = getHyperParamsSync();
  if (active) {
    const channel = active.id.startsWith("staging-")
      ? "staging"
      : active.id.startsWith("production-")
        ? "production"
        : "bundled";
    return {
      id: active.id,
      display_name: active.displayName.replace(/\s+default\s*$/i, "").trim(),
      source: channel,
      model_name: active.metadata?.model_name ?? null,
      version: active.metadata?.model_version ?? null,
      analyzer_runtime: analyzerRuntime,
      score_threshold: hp.scoreThreshold,
      iou_threshold: hp.iouThreshold,
      preprocess_profile: resolvePreprocessProfile(hp.preprocessProfile, active.metadata),
    };
  }
  // Fallback: bundled / classical / mock — no registry record. Map the
  // analyzer's own id to a sensible source label.
  const source: AnalyzerModelMetadata["source"] = analyzerRuntime.startsWith("classical")
    ? "classical"
    : analyzerRuntime === "mock"
      ? "mock"
      : "bundled";
  return {
    id: source === "bundled" ? `bundled:${analyzerRuntime}` : source,
    display_name: analyzerRuntime,
    source,
    model_name: null,
    version: null,
    analyzer_runtime: analyzerRuntime,
    score_threshold: hp.scoreThreshold,
    iou_threshold: hp.iouThreshold,
    preprocess_profile: resolvePreprocessProfile(hp.preprocessProfile, null),
  };
}

function buildDeviceUsageMetadata() {
  const runtimeVersion =
    typeof Constants.expoConfig?.runtimeVersion === "string"
      ? Constants.expoConfig.runtimeVersion
      : null;
  return {
    device_name: Constants.deviceName ?? null,
    platform: Platform.OS,
    os_version: Platform.Version,
    app_version: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null,
    build_version:
      Constants.nativeBuildVersion ??
      Constants.expoConfig?.ios?.buildNumber ??
      Constants.expoConfig?.android?.versionCode?.toString() ??
      null,
    runtime_version: Constants.expoRuntimeVersion ?? runtimeVersion,
  };
}

function formatImageDiagnostic(
  width: number | null,
  height: number | null,
  orientation: string | null,
) {
  const size = width && height ? `${width}×${height}` : "—";
  return orientation ? `${size} · ${orientation}` : size;
}

function formatLiveAnalyzeDiagnostic(diagnostics: CaptureAnalysisDiagnostics) {
  const live = diagnostics.live_seed_count === null ? "—" : diagnostics.live_seed_count.toString();
  return `${live} → ${diagnostics.analyze_seed_count}`;
}

/**
 * Post-analysis review screen.
 *
 * Mirrors the prototype's review layout:
 *   • Top bar  — back + "Inspection result" + share icon
 *   • Hero     — captured photo, plus live-mode ROI overlay when present
 *   • Summary  — Grade A ring + total seeds + avg dimensions
 *   • Per-seed — scrollable list of seeds with grade pill + dimensions
 *   • Footer   — cancel + "Save and sync" primary
 *
 * Per-seed rows are not yet tappable — the per-seed detail screen
 * (`/inspections/seed/[index]`) lands in Phase 8.1.
 */
export default function CaptureReview() {
  const { t, i18n } = useTranslation(["common", "inspections", "notifications"]);
  const router = useRouter();
  const { profile } = useAuth();
  const session = useCaptureSession();
  const create = useCreateInspection();
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("index");
  const [metadataExpanded, setMetadataExpanded] = useState(false);

  const result = session.analysisResult;
  const seeds = useMemo(() => {
    if (!result) return [];
    const next = [...result.seeds];
    if (sortMode === "grade") {
      const order: Record<SeedGrade, number> = { A: 0, B: 1, C: 2, reject: 3 };
      return next.sort((a, b) => order[a.grade] - order[b.grade] || a.index - b.index);
    }
    if (sortMode === "length") {
      return next.sort((a, b) => b.length_mm - a.length_mm || a.index - b.index);
    }
    return next.sort((a, b) => a.index - b.index);
  }, [result, sortMode]);
  const deviceUsage = useMemo(() => buildDeviceUsageMetadata(), []);

  // Snapshot the active model so the Metadata block on this screen can
  // render the same "Detector" rows that the saved inspection's detail
  // page shows — keeps Result + Detail visually consistent.
  const [reviewActiveModel, setReviewActiveModel] = useState<InstalledModelRecord | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readActiveModel().then((rec) => {
      if (!cancelled) setReviewActiveModel(rec);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const reviewAnalyzerModel = useMemo(
    () => (result ? buildAnalyzerModelMetadata(reviewActiveModel, result.analyzerId) : null),
    [reviewActiveModel, result],
  );

  // Fetch GPS once on mount when the user opted into auto-tag location.
  // Done here rather than at save time so the reading is captured close
  // to the actual photo moment (the user is still standing where they
  // pointed the camera) — and so the save click stays snappy.
  useEffect(() => {
    if (!session.locationTagEnabled) return;
    if (session.capturedLocation) return;
    void (async () => {
      const loc = await getCurrentLocation(t);
      if (loc) {
        session.set({ capturedLocation: loc });
      }
    })();
    // Intentional: depend only on the toggle so we fetch once per
    // session-enabled review. `session` is a hook closure that changes
    // each render — including it would re-trigger fetches.
  }, [session.locationTagEnabled]);

  if (!result || !session.uploadedImageUrl) {
    return (
      <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center gap-md px-xl">
          <Text className="text-h2 text-fg-primary">{t("inspections:capture.review.missing")}</Text>
          <Button
            label={t("common:actions.back")}
            onPress={() => router.replace("/capture/setup")}
          />
        </View>
      </SafeAreaView>
    );
  }

  const gradeAPct =
    seeds.length > 0
      ? Math.round((seeds.filter((s) => s.grade === "A").length / seeds.length) * 100)
      : 0;
  const avgLen = result.summary.mean_length_mm;
  const avgWid = result.summary.mean_width_mm;
  const mediaKind = session.capturedMediaKind;
  const previewMediaUri =
    mediaKind === "video"
      ? // Local mp4 (during this session) → remote mp4 (resumed session) →
        // thumbnail JPG (last-resort: video upload failed). The JPG won't
        // play but at least mounts CaptureMediaPreview's image branch.
        (session.capturedVideoUri ?? session.uploadedVideoUrl ?? session.uploadedImageUrl)
      : (session.capturedImageUri ?? session.uploadedImageUrl);
  const previewRoi = session.mode === "live" ? session.roi : null;
  const note = displayInspectionNote(session.notes);
  const capturedAt = session.capturedAt ?? new Date().toISOString();
  const calibration = session.capturedCalibrationReading;
  const dateFmt = new Intl.DateTimeFormat(i18n.language === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const openSort = () => {
    Alert.alert(t("inspections:capture.review.sort"), undefined, [
      {
        text: t("inspections:capture.review.sortIndex"),
        onPress: () => setSortMode("index"),
      },
      {
        text: t("inspections:capture.review.sortGrade"),
        onPress: () => setSortMode("grade"),
      },
      {
        text: t("inspections:capture.review.sortLength"),
        onPress: () => setSortMode("length"),
      },
      { text: t("common:actions.cancel"), style: "cancel" },
    ]);
  };

  const onShare = async () => {
    const uri =
      mediaKind === "video"
        ? (session.uploadedVideoUrl ?? session.capturedVideoUri)
        : (session.capturedImageUri ?? session.uploadedImageUrl);
    if (!uri) return;
    try {
      if (mediaKind === "video") {
        const liveFrame = session.capturedLiveFrameResult;
        const shareUri = session.capturedVideoUri
          ? await exportAnnotatedVideo(session.capturedVideoUri, {
              roi: previewRoi,
              seeds: liveFrame?.seeds ?? null,
              frameWidth: liveFrame?.frameWidth ?? null,
              frameHeight: liveFrame?.frameHeight ?? null,
              frameOrientation: liveFrame?.frameOrientation ?? null,
            })
          : uri;
        await shareVideo(shareUri, t("inspections:capture.review.shareVideo"));
      } else {
        await shareAnnotatedImage(
          uri,
          { roi: previewRoi, seeds: result.seeds },
          t("inspections:capture.review.shareImage"),
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      Alert.alert(t("common:states.error"), reason);
    }
  };

  const onSave = async () => {
    if (!profile || !session.uploadedImageUrl || !session.varietyId) return;
    setSaving(true);
    // Snapshot the analyzer + model once for both the optimistic save
    // path and the queue-fallback path. Hoisted out of the try so catch
    // sees it.
    const activeModelRecord = await readActiveModel().catch(() => null);
    const analyzerModel = buildAnalyzerModelMetadata(activeModelRecord, result.analyzerId);
    try {
      let capturedLocation = session.capturedLocation;
      if (session.locationTagEnabled && !capturedLocation) {
        capturedLocation = await getCurrentLocation(t);
        if (capturedLocation) {
          session.set({ capturedLocation });
        }
      }
      const metadata = buildInspectionMetadata({
        roi: session.roi,
        mediaKind,
        // For video captures, the inspection's image_url is a JPG
        // thumbnail (see processing.tsx); the actual recording mp4 lives
        // on `uploadedVideoUrl` and is what the detail page should render
        // as the playable preview.
        mediaUrl:
          mediaKind === "video"
            ? (session.uploadedVideoUrl ?? session.uploadedImageUrl)
            : session.uploadedImageUrl,
        recordingId: session.recordingId,
        recordingDurationMs: session.recordingDurationMs,
        locationTagEnabled: session.locationTagEnabled,
        capturedLocation,
        deviceUsage: buildDeviceUsageMetadata(),
        calibration: session.capturedCalibrationReading
          ? {
              ...session.capturedCalibrationReading,
              profileId:
                session.capturedCalibrationReading.source === "manual"
                  ? session.calibrationId
                  : null,
              profileName:
                session.capturedCalibrationReading.source === "manual"
                  ? session.capturedCalibrationProfileName
                  : null,
            }
          : null,
        capture: {
          mode: session.mode,
          camera_position: session.cameraPosition,
          flash_mode: session.flashMode,
          captured_at: capturedAt,
        },
        analyzerModel,
        analysisDiagnostics: session.analysisDiagnostics,
      });
      const payload = buildInspectionSavePayload({
        inspectorId: profile.id,
        varietyId: session.varietyId,
        batchId: null,
        calibrationId:
          session.capturedCalibrationReading?.source === "manual" ? session.calibrationId : null,
        imageUrl: session.uploadedImageUrl,
        summary: result.summary,
        seeds: result.seeds,
        metadata,
        notes: session.notes,
      });
      if (isLocalUri(session.uploadedImageUrl)) {
        await enqueueInspection(payload);
        return;
      }
      const id = await create.mutateAsync(payload);
      // Fire-and-forget — the notification is a milestone marker, not a
      // gating action. If it fails to insert, the local optimistic add
      // still shows the user immediate feedback.
      notify({
        kind: "success",
        title: t("notifications:captureSaved.title"),
        body: t("notifications:captureSaved.body", {
          variety: result.summary.total_seeds,
          count: result.summary.total_seeds,
        }),
        route: `/inspections/${id}`,
      });
      session.reset();
      router.replace(`/inspections/${id}`);
    } catch (err) {
      if (isQueueableSyncError(err)) {
        // Reuse the same payload + metadata that the optimistic save tried to
        // persist so the queued retry produces an identical row server-side.
        const fallbackPayload = buildInspectionSavePayload({
          inspectorId: profile.id,
          varietyId: session.varietyId,
          batchId: null,
          calibrationId:
            session.capturedCalibrationReading?.source === "manual" ? session.calibrationId : null,
          imageUrl: session.uploadedImageUrl,
          summary: result.summary,
          seeds: result.seeds,
          metadata: buildInspectionMetadata({
            roi: session.roi,
            mediaKind,
            mediaUrl:
              mediaKind === "video"
                ? (session.uploadedVideoUrl ?? session.uploadedImageUrl)
                : session.uploadedImageUrl,
            recordingId: session.recordingId,
            recordingDurationMs: session.recordingDurationMs,
            locationTagEnabled: session.locationTagEnabled,
            capturedLocation: session.capturedLocation,
            deviceUsage,
            calibration: session.capturedCalibrationReading
              ? {
                  ...session.capturedCalibrationReading,
                  profileId:
                    session.capturedCalibrationReading.source === "manual"
                      ? session.calibrationId
                      : null,
                  profileName:
                    session.capturedCalibrationReading.source === "manual"
                      ? session.capturedCalibrationProfileName
                      : null,
                }
              : null,
            analyzerModel,
            capture: {
              mode: session.mode,
              camera_position: session.cameraPosition,
              flash_mode: session.flashMode,
              captured_at: capturedAt,
            },
            analysisDiagnostics: session.analysisDiagnostics,
          }),
          notes: session.notes,
        });
        await enqueueInspection(fallbackPayload);
        return;
      }
      const reason = syncErrorMessage(err);
      notify({
        kind: "error",
        title: t("notifications:captureFailed.title"),
        body: t("notifications:captureFailed.body", { reason }),
      });
      Alert.alert(t("common:states.error"), reason);
      setSaving(false);
    }
  };

  const enqueueInspection = async (payload: InspectionSavePayload) => {
    const entry = await addQueueEntry(
      toInspectionQueuePayload({
        payload,
        mediaKind,
        localImageUri: session.capturedImageUri,
        localVideoUri: session.capturedVideoUri,
      }),
    );
    notify({
      kind: "success",
      title: t("notifications:captureSaved.title"),
      body: t("inspections:capture.review.queuedForSync"),
    });
    session.reset();
    setSaving(false);
    // Land the user on a pending detail screen so they can see the
    // inspection they just captured is queued, retry it, and watch it
    // auto-redirect to the canonical /inspections/<id> once it syncs.
    router.replace(`/inspections/pending/${entry.id}` as never);
    void replaySyncQueue();
  };

  const onCancel = () => {
    Alert.alert(t("common:actions.delete"), t("inspections:detail.deleteConfirm"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("common:actions.delete"),
        style: "destructive",
        onPress: async () => {
          // Best-effort delete the orphaned uploads before bailing. Video
          // captures generate two artifacts (recording mp4 + thumbnail
          // JPG); photos generate one. Each lives in its own bucket so we
          // need two cleanup paths.
          if (session.capturedMediaKind === "video") {
            if (session.uploadedVideoUrl) {
              const videoPath = session.uploadedVideoUrl.split("/recordings/")[1];
              if (videoPath) void supabase.storage.from("recordings").remove([videoPath]);
            }
            if (session.recordingId) {
              void supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from("recordings" as any)
                .delete()
                .eq("id", session.recordingId);
            }
            if (session.uploadedImageUrl) {
              const thumbPath = session.uploadedImageUrl.split("/inspection-images/")[1];
              if (thumbPath) {
                void supabase.storage.from("inspection-images").remove([thumbPath]);
              }
            }
          } else if (session.uploadedImageUrl) {
            const path = session.uploadedImageUrl.split("/inspection-images/")[1];
            if (path) {
              void supabase.storage.from("inspection-images").remove([path]);
            }
          }
          session.reset();
          // Pop back to the camera so the inspector can re-shoot without
          // bouncing to Home and re-entering setup.
          if (router.canGoBack()) router.back();
          else router.replace("/capture/setup");
        },
      },
    ]);
  };

  const onBack = () => {
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("inspections:capture.review.title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: onBack,
        }}
        right={{
          accessibilityLabel: t(
            mediaKind === "video"
              ? "inspections:capture.review.shareVideo"
              : "inspections:capture.review.shareImage",
          ),
          renderIcon: () => <Share2 color="#1A1A1A" size={18} />,
          onPress: onShare,
        }}
      />

      <FlatList
        data={seeds}
        keyExtractor={(seed) => String(seed.index)}
        contentContainerClassName="px-xl pb-2xl gap-lg"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View className="gap-lg">
            <View
              className="rounded-xl overflow-hidden"
              style={{ height: 200, backgroundColor: "#1a1816" }}
            >
              <CaptureMediaPreview
                uri={previewMediaUri}
                kind={mediaKind}
                roi={previewRoi}
                seeds={
                  mediaKind === "video" ? session.capturedLiveFrameResult?.seeds : result.seeds
                }
                seedFrameWidth={
                  mediaKind === "video"
                    ? (session.capturedLiveFrameResult?.frameWidth ?? null)
                    : null
                }
                seedFrameHeight={
                  mediaKind === "video"
                    ? (session.capturedLiveFrameResult?.frameHeight ?? null)
                    : null
                }
              />
            </View>

            {note ? (
              <View className="rounded-lg border border-line-tertiary bg-bg-primary px-lg py-md">
                <Text className="text-caption font-medium uppercase text-fg-secondary">
                  {t("inspections:detail.notesTitle")}
                </Text>
                <Text className="mt-xs text-body text-fg-primary">{note}</Text>
              </View>
            ) : null}

            <View className="rounded-lg border border-line-tertiary bg-bg-primary px-lg py-md">
              <View className="flex-row items-center justify-between gap-md">
                <Text className="text-caption font-medium uppercase text-fg-secondary">
                  {t("inspections:detail.metadata.title")}
                </Text>
                <Pressable onPress={() => setMetadataExpanded((v) => !v)} hitSlop={8}>
                  <Text className="text-caption font-medium text-brand">
                    {t(
                      metadataExpanded
                        ? "inspections:detail.metadata.showLess"
                        : "inspections:detail.metadata.showMore",
                    )}
                  </Text>
                </Pressable>
              </View>
              <View className="mt-sm gap-xs">
                {session.capturedLocation ? (
                  <>
                    <MetadataRow
                      label={t("inspections:detail.metadata.location")}
                      value={locationDisplayName(session.capturedLocation)}
                    />
                    {metadataExpanded ? (
                      <>
                        <MetadataRow
                          label={t("inspections:detail.metadata.latitude")}
                          value={session.capturedLocation.latitude.toFixed(6)}
                        />
                        <MetadataRow
                          label={t("inspections:detail.metadata.longitude")}
                          value={session.capturedLocation.longitude.toFixed(6)}
                        />
                        <MetadataRow
                          label={t("inspections:detail.metadata.accuracy")}
                          value={
                            session.capturedLocation.accuracy === null
                              ? "—"
                              : t("inspections:detail.metadata.accuracyMeters", {
                                  meters: Number(session.capturedLocation.accuracy).toFixed(1),
                                })
                          }
                        />
                        <MetadataRow
                          label={t("inspections:detail.metadata.gpsTimestamp")}
                          value={
                            session.capturedLocation.timestamp
                              ? dateFmt.format(new Date(session.capturedLocation.timestamp))
                              : "—"
                          }
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
                {session.capturedLocation ? <MetadataDivider /> : null}
                <MetadataRow
                  label={t("inspections:detail.metadata.device")}
                  value={deviceUsage.device_name ?? "—"}
                />
                {calibration ? (
                  <MetadataRow
                    label={t("inspections:detail.metadata.calibration")}
                    value={formatCalibrationValue(calibration.pxPerMm, t)}
                  />
                ) : null}
                {metadataExpanded ? (
                  <>
                    {calibration ? (
                      <>
                        <MetadataRow
                          label={t("inspections:detail.metadata.calibrationSource")}
                          value={t(
                            `inspections:detail.metadata.calibrationSourceValue.${calibration.source}`,
                          )}
                        />
                        <MetadataRow
                          label={t("inspections:detail.metadata.calibrationProfile")}
                          value={session.capturedCalibrationProfileName ?? "—"}
                        />
                        <MetadataRow
                          label={t("inspections:detail.metadata.calibrationConfidence")}
                          value={`${Math.round(calibration.confidence * 100)}%`}
                        />
                      </>
                    ) : null}
                    <MetadataRow
                      label={t("inspections:detail.metadata.platform")}
                      value={`${deviceUsage.platform}${deviceUsage.os_version ? ` ${deviceUsage.os_version}` : ""}`}
                    />
                    <MetadataRow
                      label={t("inspections:detail.metadata.appVersion")}
                      value={
                        [
                          deviceUsage.app_version,
                          deviceUsage.build_version
                            ? t("inspections:detail.metadata.buildValue", {
                                build: deviceUsage.build_version,
                              })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"
                      }
                    />
                    <MetadataRow
                      label={t("inspections:detail.metadata.runtime")}
                      value={deviceUsage.runtime_version ?? "—"}
                    />
                  </>
                ) : null}
                <MetadataDivider />
                <MetadataRow
                  label={t("inspections:detail.metadata.captureMode")}
                  value={t(
                    `inspections:capture.mode${session.mode === "live" ? "Live" : "Precise"}`,
                  )}
                />
                <MetadataRow
                  label={t("inspections:detail.metadata.mediaType")}
                  value={t(`inspections:detail.metadata.media.${mediaKind}`)}
                />
                {metadataExpanded ? (
                  <>
                    <MetadataRow
                      label={t("inspections:detail.metadata.camera")}
                      value={
                        session.cameraPosition
                          ? t(
                              `inspections:detail.metadata.cameraPosition.${session.cameraPosition}`,
                            )
                          : "—"
                      }
                    />
                    <MetadataRow
                      label={t("inspections:detail.metadata.flash")}
                      value={
                        session.flashMode
                          ? t(`inspections:detail.metadata.flashMode.${session.flashMode}`)
                          : "—"
                      }
                    />
                    <MetadataRow
                      label={t("inspections:detail.metadata.roi")}
                      value={
                        session.roi
                          ? t(`inspections:detail.roiBadge.${session.roi.kind}`, { vertices: 0 })
                          : "—"
                      }
                    />
                    <MetadataRow
                      label={t("inspections:detail.metadata.captureTimestamp")}
                      value={dateFmt.format(new Date(capturedAt))}
                    />
                    {session.analysisDiagnostics ? (
                      <>
                        <MetadataRow
                          label={t("inspections:detail.metadata.analyzedImage")}
                          value={formatImageDiagnostic(
                            session.analysisDiagnostics.analyzed_image_width,
                            session.analysisDiagnostics.analyzed_image_height,
                            session.analysisDiagnostics.analyzed_image_orientation,
                          )}
                        />
                        <MetadataRow
                          label={t("inspections:detail.metadata.liveVsAnalyze")}
                          value={formatLiveAnalyzeDiagnostic(session.analysisDiagnostics)}
                        />
                        <MetadataRow
                          label={t("inspections:detail.metadata.liveFallback")}
                          value={t(
                            session.analysisDiagnostics.used_live_frame_fallback
                              ? "inspections:detail.metadata.boolean.yes"
                              : "inspections:detail.metadata.boolean.no",
                          )}
                        />
                        <MetadataRow
                          label={t("inspections:detail.metadata.calibrationFallback")}
                          value={t(
                            session.analysisDiagnostics.calibration_fallback_used
                              ? "inspections:detail.metadata.boolean.yes"
                              : "inspections:detail.metadata.boolean.no",
                          )}
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
                {reviewAnalyzerModel ? (
                  <>
                    <MetadataDivider />
                    <MetadataRow
                      label={t("inspections:detail.metadata.detectorModel")}
                      value={
                        reviewAnalyzerModel.version
                          ? `${reviewAnalyzerModel.display_name} · ${t(
                              `inspections:detail.metadata.detectorSource.${reviewAnalyzerModel.source}`,
                            )}`
                          : t(
                              `inspections:detail.metadata.detectorSource.${reviewAnalyzerModel.source}`,
                            )
                      }
                    />
                    {metadataExpanded ? (
                      <>
                        <MetadataRow
                          label={t("inspections:detail.metadata.detectorRuntime")}
                          value={reviewAnalyzerModel.analyzer_runtime}
                        />
                        {reviewAnalyzerModel.model_name ? (
                          <MetadataRow
                            label={t("inspections:detail.metadata.detectorTrainedAs")}
                            value={reviewAnalyzerModel.model_name}
                          />
                        ) : null}
                        <MetadataRow
                          label={t("inspections:detail.metadata.detectorThresholds")}
                          value={t("inspections:detail.metadata.detectorThresholdsValue", {
                            score: reviewAnalyzerModel.score_threshold.toFixed(2),
                            iou: reviewAnalyzerModel.iou_threshold.toFixed(2),
                          })}
                        />
                        <MetadataRow
                          label={t("inspections:detail.metadata.detectorPreprocess")}
                          value={reviewAnalyzerModel.preprocess_profile}
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
              </View>
            </View>

            <View className="flex-row items-center gap-lg">
              <GradeRing
                percent={gradeAPct}
                sublabel={t("inspections:seedGrade.A")
                  .replace(/^Grade\s+/, "")
                  .trim()}
              />
              <View className="flex-1 gap-md">
                <View>
                  <Text className="text-caption text-fg-secondary">
                    {t("inspections:detail.summary.totalSeeds")}
                  </Text>
                  <Text
                    className="text-fg-primary font-medium"
                    style={{ fontSize: 22, letterSpacing: -0.4 }}
                  >
                    {result.summary.total_seeds}
                  </Text>
                </View>
                <View>
                  <Text className="text-caption text-fg-secondary">
                    {t("inspections:detail.summary.meanLength")}
                  </Text>
                  <Text className="text-fg-primary font-medium" style={{ fontSize: 16 }}>
                    {avgLen.toFixed(1)} × {avgWid.toFixed(1)} mm
                  </Text>
                </View>
              </View>
            </View>

            <View className="flex-row items-center justify-between mt-sm">
              <Text className="text-title text-fg-primary font-medium">
                {t("inspections:capture.review.perSeedTitle")}
              </Text>
              <Pressable accessibilityRole="button" onPress={openSort}>
                <Text className="text-brand text-caption font-medium">
                  {t("inspections:capture.review.sort")} ·{" "}
                  {t(`inspections:capture.review.${sortModeLabelKey(sortMode)}`)}
                </Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <SeedRow
            seed={item}
            isLast={index === seeds.length - 1}
            onPress={() => router.push(`/capture/seed/${item.index}` as never)}
          />
        )}
      />

      <View className="flex-row gap-md px-xl pb-xl pt-sm">
        <Button
          className="flex-1"
          variant="outline"
          label={t("common:actions.cancel")}
          disabled={saving}
          onPress={onCancel}
        />
        <Button
          className="flex-1"
          label={t("inspections:capture.review.saveAndSync")}
          renderLeadingIcon={() => <Check color="#FFFFFF" size={16} />}
          disabled={saving}
          onPress={onSave}
        />
      </View>
    </SafeAreaView>
  );
}

function MetadataDivider() {
  return <View className="h-[0.5px] bg-line-tertiary my-xs" />;
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-md">
      <Text className="text-caption text-fg-secondary">{label}</Text>
      <Text className="text-caption text-fg-primary text-right flex-1">{value}</Text>
    </View>
  );
}

function formatCalibrationValue(pxPerMm: number, t: ReturnType<typeof useTranslation>["t"]) {
  return t("inspections:detail.metadata.calibrationValue", {
    pxPerMm: pxPerMm.toFixed(1),
  });
}

const GRADE_BG: Record<SeedGrade, string> = {
  A: "#EAF3DE",
  B: "#FAEEDA",
  C: "#FCEBEB",
  reject: "#FCEBEB",
};
const GRADE_FG: Record<SeedGrade, string> = {
  A: "#27500A",
  B: "#633806",
  C: "#791F1F",
  reject: "#791F1F",
};

function sortModeLabelKey(mode: SortMode) {
  switch (mode) {
    case "grade":
      return "sortGrade";
    case "length":
      return "sortLength";
    case "index":
      return "sortIndex";
  }
}

function SeedRow({
  seed,
  isLast,
  onPress,
}: {
  seed: AnalyzedSeed;
  isLast: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Seed #${seed.index}`}
      onPress={onPress}
      className={`flex-row items-center gap-md px-lg py-md ${isLast ? "" : "border-b border-line-tertiary"}`}
    >
      <View
        className="h-[26px] w-[26px] items-center justify-center rounded-full"
        style={{ backgroundColor: GRADE_BG[seed.grade] }}
      >
        <Text className="font-medium" style={{ fontSize: 11, color: GRADE_FG[seed.grade] }}>
          {seed.grade === "reject" ? "R" : seed.grade}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-fg-primary font-medium" style={{ fontSize: 14 }}>
          Seed #{seed.index}
        </Text>
        <Text className="text-fg-secondary" style={{ fontSize: 12 }}>
          {seed.length_mm.toFixed(1)} × {seed.width_mm.toFixed(1)} mm · area{" "}
          {seed.area_mm2.toFixed(1)} mm²
        </Text>
      </View>
      <ChevronRight color="#9D9D9A" size={16} />
    </Pressable>
  );
}
