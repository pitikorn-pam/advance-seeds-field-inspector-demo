import { useMemo, useState } from "react";
import { FlatList, View, Text, Pressable, Alert, ScrollView, Platform } from "react-native";
import Svg, { Ellipse } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Share2, Trash2 } from "lucide-react-native";
import { GRADE_LETTERS, type Seed, type SeedGrade } from "@advance-seeds/types";
import type { Roi } from "@/lib/capture/roi";
import { shareAnnotatedImage, shareVideo } from "@/lib/capture/imageActions";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useInspection, useDeleteInspection } from "@/lib/queries";
import {
  type AnalysisDiagnosticsMetadata,
  readAnalyzerModelMetadata,
  readAnalysisDiagnosticsMetadata,
  readCaptureMetadata,
  readCalibrationMetadata,
  readDeviceUsageMetadata,
  readLocationMetadata,
  readSeedAnnotationMetadata,
  locationDisplayName,
} from "@/lib/inspections/metadata";
import { Pill } from "@/components/ui/Pill";
import { GradeChip } from "@/components/ui/GradeChip";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { CaptureMediaPreview } from "@/components/capture/CaptureMediaPreview";
import { gradePalette } from "@/lib/grading/palette";

type GradeFilter = "all" | Seed["grade"];

/**
 * Read the captured ROI off of `inspection.metadata.roi`. Returns the
 * shape kind + a translation-friendly arg bag, or null when no ROI was
 * persisted with this inspection. The roi shape is whatever the capture
 * session held at save-time — see lib/capture/roi.ts.
 */
function readRoi(metadata: unknown): Roi | null {
  if (!metadata || typeof metadata !== "object") return null;
  const roi = (metadata as { roi?: unknown }).roi;
  if (!roi || typeof roi !== "object") return null;
  const kind = (roi as { kind?: unknown }).kind;
  if (kind === "rect") {
    const rect = roi as Partial<Extract<Roi, { kind: "rect" }>>;
    if (
      typeof rect.x === "number" &&
      typeof rect.y === "number" &&
      typeof rect.w === "number" &&
      typeof rect.h === "number"
    ) {
      return { kind, x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    }
  }
  if (kind === "circle") {
    const circle = roi as Partial<Extract<Roi, { kind: "circle" }>>;
    if (
      typeof circle.cx === "number" &&
      typeof circle.cy === "number" &&
      typeof circle.r === "number"
    ) {
      return { kind, cx: circle.cx, cy: circle.cy, r: circle.r };
    }
  }
  if (kind === "polygon") {
    const poly = roi as Partial<Extract<Roi, { kind: "polygon" }>>;
    if (
      Array.isArray(poly.points) &&
      poly.points.every((p) => typeof p.x === "number" && typeof p.y === "number")
    ) {
      return { kind, points: poly.points, closed: poly.closed === true };
    }
  }
  return null;
}

function roiBadge(roi: Roi | null): { kind: Roi["kind"]; vertices?: number } | null {
  if (!roi) return null;
  if (roi.kind === "polygon") return { kind: roi.kind, vertices: roi.points.length };
  return { kind: roi.kind };
}

function readCaptureMedia(metadata: unknown): {
  kind: "photo" | "video";
  url: string | null;
  videoDeleted: boolean;
} {
  if (!metadata || typeof metadata !== "object")
    return { kind: "photo", url: null, videoDeleted: false };
  const media = (metadata as { capture_media?: unknown }).capture_media;
  if (!media || typeof media !== "object") return { kind: "photo", url: null, videoDeleted: false };
  const kind = (media as { kind?: unknown }).kind;
  const url = (media as { url?: unknown }).url;
  const deletedAt = (media as { video_deleted_at?: unknown }).video_deleted_at;
  return {
    kind: kind === "video" ? "video" : "photo",
    url: typeof url === "string" ? url : null,
    videoDeleted: typeof deletedAt === "string" && deletedAt.length > 0,
  };
}

export default function InspectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation(["common", "inspections"]);
  const router = useRouter();

  // Inspection detail can be reached either via push (from a list — back goes
  // there) or via `router.replace` from `/capture/review` after save. The
  // replace clears the capture stack so there's nothing left to pop, and a
  // bare `router.back()` then throws "GO_BACK was not handled by any
  // navigator". Guarding with canGoBack falls back to the tabs root.
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const { profile } = useAuth();
  const policy = policyFor(profile);
  const { data, isLoading, isError, refetch } = useInspection(id);
  const del = useDeleteInspection();
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const allSeeds = data?.seeds ?? [];
  const filteredSeeds = useMemo(
    () =>
      gradeFilter === "all" ? allSeeds : allSeeds.filter((seed) => seed.grade === gradeFilter),
    [gradeFilter, allSeeds],
  );
  // Counts shown next to each filter chip (prototype shows "All 18 · A 14 …").
  // Derived from the actual seeds in this inspection so old A/B/C/reject
  // captures and new variants extending through H both render cleanly.
  const gradeCounts = useMemo(() => {
    const counts: Partial<Record<SeedGrade, number>> = {};
    for (const s of allSeeds) counts[s.grade] = (counts[s.grade] ?? 0) + 1;
    return counts;
  }, [allSeeds]);
  // Letter tiers present, in A→H order; "reject" pinned last when used.
  const gradeFilters = useMemo<GradeFilter[]>(() => {
    const out: GradeFilter[] = ["all"];
    for (const letter of GRADE_LETTERS) {
      if (gradeCounts[letter]) out.push(letter);
    }
    if (gradeCounts.reject) out.push("reject");
    return out;
  }, [gradeCounts]);

  const dateFmt = new Intl.DateTimeFormat(i18n.language === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;
  const { inspection, seeds } = data;
  const metadata = (inspection as { metadata?: unknown }).metadata;
  const roi = readRoi(metadata);
  const roiLabel = roiBadge(roi);
  const captureMedia = readCaptureMedia(metadata);
  const previewKind =
    captureMedia.kind === "video" && captureMedia.videoDeleted ? "photo" : captureMedia.kind;
  const mediaUrl = captureMedia.videoDeleted
    ? inspection.image_url
    : (captureMedia.url ?? inspection.image_url);
  const location = readLocationMetadata(metadata);
  const deviceUsage = readDeviceUsageMetadata(metadata);
  const captureDetail = readCaptureMetadata(metadata);
  const calibration = readCalibrationMetadata(metadata);
  const analyzerModel = readAnalyzerModelMetadata(metadata);
  const analysisDiagnostics = readAnalysisDiagnosticsMetadata(metadata);
  const androidSeedFrameWidth =
    Platform.OS === "android" ? (analysisDiagnostics?.analyzed_image_width ?? null) : null;
  const androidSeedFrameHeight =
    Platform.OS === "android" ? (analysisDiagnostics?.analyzed_image_height ?? null) : null;
  const seedAnnotations = readSeedAnnotationMetadata(metadata);
  const annotatedSeeds = seeds.map((seed) => {
    const annotation = seedAnnotations.get(seed.index);
    return {
      ...seed,
      label: annotation?.label ?? inspection.variety?.name ?? null,
      ...(typeof annotation?.volume_ml === "number" ? { volume_ml: annotation.volume_ml } : {}),
      ...(annotation?.mask ? { mask: annotation.mask } : {}),
    };
  });

  const onShare = async () => {
    if (!mediaUrl) return;
    try {
      const title = t("inspections:detail.title");
      if (captureMedia.kind === "video" && !captureMedia.videoDeleted) {
        await shareVideo(mediaUrl, title);
      } else {
        await shareAnnotatedImage(
          mediaUrl,
          {
            roi,
            seeds: annotatedSeeds,
            seedFrameWidth: androidSeedFrameWidth,
            seedFrameHeight: androidSeedFrameHeight,
          },
          title,
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      Alert.alert(t("common:states.error"), reason);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("inspections:detail.title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: handleBack,
        }}
        right={{
          accessibilityLabel: t("inspections:capture.review.shareImage"),
          renderIcon: () => <Share2 color="#171717" size={20} />,
          onPress: onShare,
        }}
      />
      <FlatList
        data={filteredSeeds}
        keyExtractor={(seed) => seed.id}
        numColumns={4}
        contentContainerClassName="px-xl py-md gap-xl"
        columnWrapperStyle={{ gap: 6 }}
        initialNumToRender={16}
        maxToRenderPerBatch={16}
        windowSize={7}
        removeClippedSubviews
        extraData={gradeFilter}
        ListHeaderComponent={
          <View className="gap-md">
            {/* Header card — prototype: pills + headline + date · inspector */}
            <View className="rounded-lg border border-line-tertiary bg-bg-primary px-lg py-md">
              <View className="flex-row flex-wrap items-center gap-sm">
                {inspection.variety?.name ? (
                  <Pill tone="brand" label={inspection.variety.name} />
                ) : null}
                {roiLabel ? (
                  <Pill
                    tone="info"
                    label={t(`inspections:detail.roiBadge.${roiLabel.kind}`, {
                      vertices: roiLabel.vertices ?? 0,
                    })}
                  />
                ) : null}
              </View>
              <Text className="mt-sm text-h2 font-medium text-fg-primary">
                {t("inspections:detail.summary.totalSeeds")} · {inspection.total_seeds}
              </Text>
              <Text className="text-caption text-fg-secondary mt-xs">
                {dateFmt.format(new Date(inspection.captured_at))} ·{" "}
                {inspection.inspector?.full_name ?? inspection.inspector?.email}
              </Text>
            </View>

            {/* Sample preview / hero image */}
            <View className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-black">
              {mediaUrl ? (
                <CaptureMediaPreview
                  uri={mediaUrl}
                  kind={previewKind}
                  roi={roi}
                  seeds={annotatedSeeds}
                  seedFrameWidth={androidSeedFrameWidth}
                  seedFrameHeight={androidSeedFrameHeight}
                />
              ) : (
                <View className="flex-1 items-center justify-center px-md">
                  <Text className="text-caption text-warning-text text-center">
                    No image stored on this inspection.
                  </Text>
                  <Text
                    className="text-caption text-fg-tertiary text-center mt-xs"
                    numberOfLines={2}
                    selectable
                  >
                    image_url={String(inspection.image_url ?? "null")}
                  </Text>
                </View>
              )}
            </View>

            {/* Stat tiles — prototype shows 3-col Avg L / Avg W / Avg A */}
            <View className="flex-row gap-sm">
              <AvgStatTile
                label={t("inspections:detail.summary.meanLength")}
                value={Number(inspection.mean_length_mm ?? 0).toFixed(2)}
                unit="mm"
              />
              <AvgStatTile
                label={t("inspections:detail.summary.meanWidth")}
                value={Number(inspection.mean_width_mm ?? 0).toFixed(2)}
                unit="mm"
              />
              <AvgStatTile
                label={t("inspections:detail.summary.meanArea")}
                value={Number(inspection.mean_area_mm2 ?? 0).toFixed(1)}
                unit="mm²"
              />
            </View>

            {(() => {
              // Calibration sanity gate. Surfaces a warning whenever the
              // measurements are likely wrong — not just when every seed
              // happens to grade reject. Three trigger conditions:
              //
              //   1. **No calibration metadata** — inspection saved with
              //      the fallback `pxPerMm = 38.4`. Measurements are
              //      placeholder values, not real mm.
              //   2. **Source != aruco** — LiDAR or live-derived px/mm
              //      was reused on the captured photo. The pixel space
              //      doesn't match the photo's resolution, so mm values
              //      systematically over/under-shoot. ArUco-on-photo is
              //      the only source that's guaranteed to match the
              //      photo's pixel space.
              //   3. **All seeds graded reject** — even if the source is
              //      ArUco, sub-millimeter measurements suggest the
              //      marker detection produced a wrong value (e.g., on a
              //      non-5cm marker, or skewed perspective).
              const px = calibration?.px_per_mm ?? null;
              const src = calibration?.source ?? null;
              const allReject = seeds.length > 0 && seeds.every((s) => s.grade === "reject");
              const noCalibration = !src;
              const liveCalibration = src === "lidar" || src === "manual";
              const trigger = allReject || noCalibration || liveCalibration;
              if (!trigger) return null;
              const reason = noCalibration
                ? "No ArUco marker detected in this photo — measurements use a placeholder px/mm and are not accurate."
                : liveCalibration
                  ? `Calibration source is "${src}" — derived from the live preview, not the captured photo. Pixel scale may not match.`
                  : "All detections graded reject — likely a calibration mismatch.";
              return (
                <View className="rounded-lg border border-line-tertiary bg-warning-bg px-lg py-md">
                  <Text className="text-caption font-medium text-warning-text">{reason}</Text>
                  <Text className="text-caption text-warning-text mt-xs" selectable>
                    px_per_mm={px === null ? "missing" : px.toFixed(2)} · source={src ?? "none"}
                  </Text>
                  <Text className="text-caption text-fg-tertiary mt-xs">
                    For accurate measurements, re-capture with the 5 cm ArUco card clearly visible
                    in the frame so post-capture calibration runs against the actual photo.
                  </Text>
                </View>
              );
            })()}

            {location || deviceUsage || captureDetail || calibration ? (
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
                  {location ? (
                    <>
                      <MetadataRow
                        label={t("inspections:detail.metadata.location")}
                        value={locationDisplayName(location)}
                      />
                      {metadataExpanded ? (
                        <>
                          <MetadataRow
                            label={t("inspections:detail.metadata.latitude")}
                            value={location.latitude.toFixed(6)}
                          />
                          <MetadataRow
                            label={t("inspections:detail.metadata.longitude")}
                            value={location.longitude.toFixed(6)}
                          />
                          <MetadataRow
                            label={t("inspections:detail.metadata.accuracy")}
                            value={
                              location.accuracy === null
                                ? "—"
                                : t("inspections:detail.metadata.accuracyMeters", {
                                    meters: Number(location.accuracy).toFixed(1),
                                  })
                            }
                          />
                          <MetadataRow
                            label={t("inspections:detail.metadata.gpsTimestamp")}
                            value={
                              location.timestamp
                                ? dateFmt.format(new Date(location.timestamp))
                                : "—"
                            }
                          />
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {deviceUsage ? (
                    <>
                      {location ? <MetadataDivider /> : null}
                      <MetadataRow
                        label={t("inspections:detail.metadata.device")}
                        value={deviceUsage.device_name ?? "—"}
                      />
                      {calibration ? (
                        <MetadataRow
                          label={t("inspections:detail.metadata.calibration")}
                          value={formatCalibrationValue(calibration.px_per_mm, t)}
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
                                value={calibration.profile_name ?? "—"}
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
                    </>
                  ) : null}
                  {captureDetail ? (
                    <>
                      {location || deviceUsage ? <MetadataDivider /> : null}
                      <MetadataRow
                        label={t("inspections:detail.metadata.captureMode")}
                        value={t(
                          `inspections:capture.mode${captureDetail.mode === "live" ? "Live" : "Precise"}`,
                        )}
                      />
                      <MetadataRow
                        label={t("inspections:detail.metadata.mediaType")}
                        value={t(`inspections:detail.metadata.media.${captureDetail.media_kind}`)}
                      />
                      {metadataExpanded ? (
                        <>
                          <MetadataRow
                            label={t("inspections:detail.metadata.camera")}
                            value={
                              captureDetail.camera_position
                                ? t(
                                    `inspections:detail.metadata.cameraPosition.${captureDetail.camera_position}`,
                                  )
                                : "—"
                            }
                          />
                          <MetadataRow
                            label={t("inspections:detail.metadata.flash")}
                            value={
                              captureDetail.flash_mode
                                ? t(
                                    `inspections:detail.metadata.flashMode.${captureDetail.flash_mode}`,
                                  )
                                : "—"
                            }
                          />
                          <MetadataRow
                            label={t("inspections:detail.metadata.roi")}
                            value={
                              captureDetail.roi_kind
                                ? t(`inspections:detail.roiBadge.${captureDetail.roi_kind}`, {
                                    vertices: 0,
                                  })
                                : "—"
                            }
                          />
                          <MetadataRow
                            label={t("inspections:detail.metadata.captureTimestamp")}
                            value={
                              captureDetail.captured_at
                                ? dateFmt.format(new Date(captureDetail.captured_at))
                                : "—"
                            }
                          />
                          {analysisDiagnostics ? (
                            <>
                              <MetadataRow
                                label={t("inspections:detail.metadata.analyzedImage")}
                                value={formatImageDiagnostic(
                                  analysisDiagnostics.analyzed_image_width,
                                  analysisDiagnostics.analyzed_image_height,
                                  analysisDiagnostics.analyzed_image_orientation,
                                )}
                              />
                              <MetadataRow
                                label={t("inspections:detail.metadata.liveVsAnalyze")}
                                value={formatLiveAnalyzeDiagnostic(analysisDiagnostics)}
                              />
                              <MetadataRow
                                label={t("inspections:detail.metadata.liveFallback")}
                                value={t(
                                  analysisDiagnostics.used_live_frame_fallback
                                    ? "inspections:detail.metadata.boolean.yes"
                                    : "inspections:detail.metadata.boolean.no",
                                )}
                              />
                              <MetadataRow
                                label={t("inspections:detail.metadata.calibrationFallback")}
                                value={t(
                                  analysisDiagnostics.calibration_fallback_used
                                    ? "inspections:detail.metadata.boolean.yes"
                                    : "inspections:detail.metadata.boolean.no",
                                )}
                              />
                            </>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {analyzerModel ? (
                    <>
                      {location || deviceUsage || captureDetail ? <MetadataDivider /> : null}
                      <MetadataRow
                        label={t("inspections:detail.metadata.detectorModel")}
                        value={
                          analyzerModel.version
                            ? `${analyzerModel.display_name} · ${t(
                                `inspections:detail.metadata.detectorSource.${analyzerModel.source}`,
                              )}`
                            : t(
                                `inspections:detail.metadata.detectorSource.${analyzerModel.source}`,
                              )
                        }
                      />
                      {metadataExpanded ? (
                        <>
                          <MetadataRow
                            label={t("inspections:detail.metadata.detectorRuntime")}
                            value={analyzerModel.analyzer_runtime}
                          />
                          {analyzerModel.model_name ? (
                            <MetadataRow
                              label={t("inspections:detail.metadata.detectorTrainedAs")}
                              value={analyzerModel.model_name}
                            />
                          ) : null}
                          <MetadataRow
                            label={t("inspections:detail.metadata.detectorThresholds")}
                            value={t("inspections:detail.metadata.detectorThresholdsValue", {
                              score: analyzerModel.score_threshold.toFixed(2),
                              iou: analyzerModel.iou_threshold.toFixed(2),
                            })}
                          />
                          <MetadataRow
                            label={t("inspections:detail.metadata.detectorPreprocess")}
                            value={analyzerModel.preprocess_profile}
                          />
                        </>
                      ) : null}
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Per-seed title + horizontally scrolling filter chips (prototype) */}
            <View className="gap-sm mt-sm">
              <View className="flex-row items-end justify-between gap-md px-xs">
                <Text className="text-title font-medium text-fg-primary">
                  {t("inspections:detail.perSeedTitle")}
                </Text>
                <Text className="text-caption text-fg-secondary">
                  {t("inspections:detail.filteredSeedCount", {
                    count: filteredSeeds.length,
                    total: seeds.length,
                  })}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingBottom: 4 }}
              >
                {gradeFilters.map((filter) => {
                  const count =
                    filter === "all" ? allSeeds.length : (gradeCounts[filter as SeedGrade] ?? 0);
                  return (
                    <GradeFilterChip
                      key={filter}
                      label={
                        filter === "all"
                          ? t("inspections:detail.gradeFilterAll")
                          : filter === "reject"
                            ? t("inspections:seedGrade.reject")
                            : t("inspections:seedGradeLabel", {
                                letter: filter,
                                defaultValue: `Grade ${filter}`,
                              })
                      }
                      count={count}
                      selected={gradeFilter === filter}
                      onPress={() => setGradeFilter(filter)}
                    />
                  );
                })}
              </ScrollView>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <SeedCard
            seed={item}
            onPress={() => router.push(`/seed/${inspection.id}/${item.index}`)}
          />
        )}
        ListFooterComponent={
          <View className="mt-xl gap-sm">
            {policy.canDeleteInspection(inspection) ? (
              <Button
                variant="danger"
                renderLeadingIcon={() => <Trash2 color="#A02828" size={16} />}
                onPress={() =>
                  Alert.alert(t("common:actions.delete"), t("inspections:detail.deleteConfirm"), [
                    { text: t("common:actions.cancel"), style: "cancel" },
                    {
                      text: t("common:actions.delete"),
                      style: "destructive",
                      onPress: async () => {
                        await del.mutateAsync(inspection.id);
                        handleBack();
                      },
                    },
                  ])
                }
              >
                <Text className="text-title font-medium text-error">
                  {t("common:actions.delete")}
                </Text>
              </Button>
            ) : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}

/**
 * 3-column "Avg L / Avg W / Avg A" stat tile — matches the prototype's
 * `StatTile`: centred label cap, value + unit on a baseline-aligned row.
 */
function AvgStatTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View className="flex-1 rounded-lg border border-line-tertiary bg-bg-primary px-md py-md items-center">
      <Text className="text-[11px] uppercase tracking-[0.6px] font-semibold text-fg-tertiary">
        {label}
      </Text>
      <View className="flex-row items-baseline gap-[3px] mt-xs">
        <Text
          className="text-fg-primary font-semibold"
          style={{ fontSize: 20, fontVariant: ["tabular-nums"] }}
        >
          {value}
        </Text>
        <Text className="text-caption text-fg-tertiary">{unit}</Text>
      </View>
    </View>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-md">
      <Text className="text-caption text-fg-secondary">{label}</Text>
      <Text className="text-caption text-fg-primary text-right flex-1">{value}</Text>
    </View>
  );
}

function MetadataDivider() {
  return <View className="h-[0.5px] bg-line-tertiary my-xs" />;
}

function SeedCard({ seed, onPress }: { seed: Seed; onPress: () => void }) {
  // Prototype: white outer card with hairline; INSIDE sits a cream-tinted
  // thumb area with a tiny rotated seed silhouette; below the thumb is a
  // tabular #N on the left + grade chip on the right. The whole tile reads as
  // "a seed photo with a grade label" rather than "this whole rectangle is
  // grade X coloured" — keeps the grid scannable across many tiles.
  return (
    <Pressable
      onPress={onPress}
      className="aspect-square rounded-lg border border-line-tertiary bg-bg-primary p-[6px]"
      style={{ flex: 1 }}
    >
      <View
        className="flex-1 items-center justify-center overflow-hidden rounded-[6px]"
        style={{ backgroundColor: gradePalette(seed.grade).bg }}
      >
        {/* Tiny seed silhouette — pure decoration */}
        <Svg width="80%" height="80%" viewBox="0 0 40 40">
          <Ellipse
            cx={20}
            cy={20}
            rx={13}
            ry={5.5}
            fill="#F3E6C8"
            stroke="#7A5A32"
            strokeWidth={0.7}
            transform={`rotate(${(seed.index * 23) % 180} 20 20)`}
          />
        </Svg>
      </View>
      <View className="flex-row items-center justify-between mt-[4px]">
        <Text className="text-[10px] text-fg-tertiary" style={{ fontVariant: ["tabular-nums"] }}>
          #{seed.index}
        </Text>
        <GradeChip grade={seed.grade} size="sm" />
      </View>
    </Pressable>
  );
}

function GradeFilterChip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`flex-row items-center gap-xs rounded-full border px-md py-xs ${
        selected ? "border-fg-primary bg-fg-primary" : "border-line-tertiary bg-bg-primary"
      }`}
    >
      <Text
        className={`text-caption font-medium ${selected ? "text-fg-on-dark" : "text-fg-primary"}`}
      >
        {label}
      </Text>
      <Text
        className={`text-caption ${selected ? "text-fg-on-dark opacity-80" : "text-fg-tertiary"}`}
      >
        {count}
      </Text>
    </Pressable>
  );
}

function formatCalibrationValue(pxPerMm: number, t: ReturnType<typeof useTranslation>["t"]) {
  return t("inspections:detail.metadata.calibrationValue", {
    pxPerMm: pxPerMm.toFixed(1),
  });
}

function formatImageDiagnostic(
  width: number | null,
  height: number | null,
  orientation: string | null,
) {
  const size = width && height ? `${width}×${height}` : "—";
  return orientation ? `${size} · ${orientation}` : size;
}

function formatLiveAnalyzeDiagnostic(diagnostics: AnalysisDiagnosticsMetadata) {
  const live = diagnostics.live_seed_count === null ? "—" : diagnostics.live_seed_count.toString();
  return `${live} → ${diagnostics.analyze_seed_count}`;
}
