import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, View, Text, Alert, Pressable } from "react-native";
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
import { exportAnnotatedVideo } from "@/lib/capture/annotatedVideo";
import { shareImageWithRoi, shareVideo } from "@/lib/capture/imageActions";
import { displayInspectionNote } from "@/lib/inspections/notes";
import { buildInspectionMetadata, locationDisplayName } from "@/lib/inspections/metadata";
import { addQueueEntry } from "@/lib/sync/store";
import { replaySyncQueue } from "@/lib/sync/replay";
import { isQueueableSyncError, syncErrorMessage } from "@/lib/sync/errors";
import { useCreateInspection } from "@/lib/queries";
import { useNotify } from "@/lib/notifications";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { GradeRing } from "@/components/inspections/GradeRing";
import { CaptureMediaPreview } from "@/components/capture/CaptureMediaPreview";

type SortMode = "index" | "grade" | "length";

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
        ? (session.uploadedImageUrl ?? session.capturedVideoUri)
        : (session.capturedImageUri ?? session.uploadedImageUrl);
    if (!uri) return;
    try {
      if (mediaKind === "video") {
        const shareUri =
          previewRoi && session.capturedVideoUri
            ? await exportAnnotatedVideo(session.capturedVideoUri, previewRoi)
            : uri;
        await shareVideo(shareUri, t("inspections:capture.review.shareVideo"));
      } else {
        await shareImageWithRoi(uri, previewRoi, t("inspections:capture.review.shareImage"));
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      Alert.alert(t("common:states.error"), reason);
    }
  };

  const onSave = async () => {
    if (!profile || !session.uploadedImageUrl || !session.varietyId) return;
    setSaving(true);
    try {
      let capturedLocation = session.capturedLocation;
      if (session.locationTagEnabled && !capturedLocation) {
        capturedLocation = await getCurrentLocation(t);
        if (capturedLocation) {
          session.set({ capturedLocation });
        }
      }
      const trimmedNotes = session.notes.trim();
      const metadata = buildInspectionMetadata({
        roi: session.roi,
        mediaKind,
        mediaUrl: session.uploadedImageUrl,
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
      });
      const payload = {
        inspector_id: profile.id,
        variety_id: session.varietyId,
        batch_id: session.batchId,
        calibration_id: session.calibrationId,
        image_url: session.uploadedImageUrl,
        ...result.summary,
        seeds: result.seeds,
        metadata,
        notes: trimmedNotes.length > 0 ? trimmedNotes : null,
      };
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
        const trimmedNotes = session.notes.trim();
        await enqueueInspection({
          inspector_id: profile.id,
          variety_id: session.varietyId,
          batch_id: session.batchId,
          calibration_id: session.calibrationId,
          image_url: session.uploadedImageUrl,
          ...result.summary,
          seeds: result.seeds,
          metadata: buildInspectionMetadata({
            roi: session.roi,
            mediaKind,
            mediaUrl: session.uploadedImageUrl,
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
            capture: {
              mode: session.mode,
              camera_position: session.cameraPosition,
              flash_mode: session.flashMode,
              captured_at: capturedAt,
            },
          }),
          notes: trimmedNotes.length > 0 ? trimmedNotes : null,
        });
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

  const enqueueInspection = async (payload: {
    inspector_id: string;
    variety_id: string;
    batch_id: string | null;
    calibration_id: string | null;
    image_url: string;
    total_seeds: number;
    mean_length_mm: number;
    mean_width_mm: number;
    mean_area_mm2: number;
    metadata: Record<string, unknown> | null;
    notes: string | null;
    seeds: typeof result.seeds;
  }) => {
    await addQueueEntry({
      kind: "inspection",
      data: {
        inspector_id: payload.inspector_id,
        variety_id: payload.variety_id,
        batch_id: payload.batch_id,
        calibration_id: payload.calibration_id,
        local_media_uri:
          mediaKind === "video"
            ? (session.capturedVideoUri ?? payload.image_url)
            : (session.capturedImageUri ?? payload.image_url),
        remote_media_url: isLocalUri(payload.image_url) ? null : payload.image_url,
        media_kind: mediaKind,
        total_seeds: payload.total_seeds,
        mean_length_mm: payload.mean_length_mm,
        mean_width_mm: payload.mean_width_mm,
        mean_area_mm2: payload.mean_area_mm2,
        metadata: payload.metadata,
        notes: payload.notes,
        seeds: payload.seeds,
      },
    });
    notify({
      kind: "success",
      title: t("notifications:captureSaved.title"),
      body: t("inspections:capture.review.queuedForSync"),
    });
    session.reset();
    setSaving(false);
    router.replace("/");
    void replaySyncQueue();
  };

  const onCancel = () => {
    Alert.alert(t("common:actions.delete"), t("inspections:detail.deleteConfirm"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("common:actions.delete"),
        style: "destructive",
        onPress: async () => {
          // Best-effort delete the orphaned upload before bailing.
          if (session.uploadedImageUrl) {
            if (session.capturedMediaKind === "video") {
              const path = session.uploadedImageUrl.split("/recordings/")[1];
              if (path) void supabase.storage.from("recordings").remove([path]);
              if (session.recordingId) {
                void supabase
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .from("recordings" as any)
                  .delete()
                  .eq("id", session.recordingId);
              }
            } else {
              const path = session.uploadedImageUrl.split("/inspection-images/")[1];
              if (path) {
                void supabase.storage.from("inspection-images").remove([path]);
              }
            }
          }
          session.reset();
          router.replace("/");
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

      <ScrollView contentContainerClassName="px-xl pb-2xl gap-lg">
        <View
          className="rounded-xl overflow-hidden"
          style={{ height: 200, backgroundColor: "#1a1816" }}
        >
          <CaptureMediaPreview uri={session.uploadedImageUrl} kind={mediaKind} roi={previewRoi} />
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
            <MetadataRow
              label={t("inspections:detail.metadata.captureMode")}
              value={t(`inspections:capture.mode${session.mode === "live" ? "Live" : "Precise"}`)}
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
                      ? t(`inspections:detail.metadata.cameraPosition.${session.cameraPosition}`)
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

        <View className="rounded-xl bg-bg-primary border border-line-tertiary overflow-hidden">
          {seeds.map((seed, i) => (
            <SeedRow key={seed.index} seed={seed} isLast={i === seeds.length - 1} />
          ))}
        </View>
      </ScrollView>

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

function isLocalUri(uri: string): boolean {
  return uri.startsWith("file://") || uri.startsWith("/");
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

function SeedRow({ seed, isLast }: { seed: AnalyzedSeed; isLast: boolean }) {
  return (
    <Pressable
      // Per-seed detail (`/inspections/seed/[index]`) lands in Phase 8.1.
      accessibilityRole="button"
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
