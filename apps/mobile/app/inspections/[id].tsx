import { useMemo, useState } from "react";
import { FlatList, View, Text, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, MoreHorizontal } from "lucide-react-native";
import type { Seed } from "@advance-seeds/types";
import type { Roi } from "@/lib/capture/roi";
import { saveImageToLibrary } from "@/lib/capture/imageActions";
import { useAuth } from "@/lib/auth";
import { policyFor } from "@/lib/access";
import { useInspection, useDeleteInspection } from "@/lib/queries";
import { displayInspectionNote } from "@/lib/inspections/notes";
import {
  readCaptureMetadata,
  readCalibrationMetadata,
  readDeviceUsageMetadata,
  readLocationMetadata,
  locationDisplayName,
} from "@/lib/inspections/metadata";
import { StatTile } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { CaptureMediaPreview } from "@/components/capture/CaptureMediaPreview";

const gradeToTone: Record<Seed["grade"], "success" | "info" | "warning" | "danger"> = {
  A: "success",
  B: "info",
  C: "warning",
  reject: "danger",
};

type GradeFilter = "all" | Seed["grade"];

const gradeFilters: GradeFilter[] = ["all", "A", "B", "C", "reject"];

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

function readCaptureMedia(metadata: unknown): { kind: "photo" | "video"; url: string | null } {
  if (!metadata || typeof metadata !== "object") return { kind: "photo", url: null };
  const media = (metadata as { capture_media?: unknown }).capture_media;
  if (!media || typeof media !== "object") return { kind: "photo", url: null };
  const kind = (media as { kind?: unknown }).kind;
  const url = (media as { url?: unknown }).url;
  return {
    kind: kind === "video" ? "video" : "photo",
    url: typeof url === "string" ? url : null,
  };
}

export default function InspectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation(["common", "inspections"]);
  const router = useRouter();
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
  const mediaUrl = captureMedia.url ?? inspection.image_url;
  const note = displayInspectionNote(inspection.notes);
  const location = readLocationMetadata(metadata);
  const deviceUsage = readDeviceUsageMetadata(metadata);
  const captureDetail = readCaptureMetadata(metadata);
  const calibration = readCalibrationMetadata(metadata);

  const saveImage = async () => {
    if (!mediaUrl) return;
    try {
      await saveImageToLibrary(mediaUrl, {
        title: t("inspections:detail.imageSaved"),
        permissionDeniedTitle: t("inspections:capture.snapshot.permissionDeniedTitle"),
        permissionDeniedBody: t("inspections:capture.snapshot.permissionDeniedBody"),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      Alert.alert(t("common:states.error"), reason);
    }
  };

  const openMenu = () => {
    Alert.alert(t("common:actions.more"), undefined, [
      {
        text: t("inspections:detail.saveImage"),
        onPress: saveImage,
      },
      { text: t("common:actions.cancel"), style: "cancel" },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("inspections:detail.title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: () => router.back(),
        }}
        right={{
          accessibilityLabel: t("common:actions.more"),
          renderIcon: () => <MoreHorizontal color="#1A1A1A" size={20} />,
          onPress: openMenu,
        }}
      />
      <FlatList
        data={filteredSeeds}
        keyExtractor={(seed) => seed.id}
        numColumns={3}
        contentContainerClassName="px-xl py-md gap-xl"
        columnWrapperStyle={{ gap: 8 }}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        extraData={gradeFilter}
        ListHeaderComponent={
          <View className="gap-xl">
            <View>
              <Text className="text-h1 font-medium text-fg-primary">
                {inspection.variety?.name ?? "—"}
              </Text>
              <Text className="text-caption text-fg-secondary mt-xs">
                {dateFmt.format(new Date(inspection.captured_at))} ·{" "}
                {inspection.inspector?.full_name ?? inspection.inspector?.email}
                {inspection.batch?.code ? ` · ${inspection.batch.code}` : ""}
              </Text>
              {roiLabel ? (
                <View className="mt-sm flex-row">
                  <Pill
                    tone="brand"
                    label={t(`inspections:detail.roiBadge.${roiLabel.kind}`, {
                      vertices: roiLabel.vertices ?? 0,
                    })}
                  />
                </View>
              ) : null}
            </View>

            {mediaUrl ? (
              <View className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-black">
                <CaptureMediaPreview uri={mediaUrl} kind={captureMedia.kind} roi={roi} />
              </View>
            ) : null}

            {note ? (
              <View className="rounded-lg border border-line-tertiary bg-bg-primary px-lg py-md">
                <Text className="text-caption font-medium uppercase text-fg-secondary">
                  {t("inspections:detail.notesTitle")}
                </Text>
                <Text className="mt-xs text-body text-fg-primary">{note}</Text>
              </View>
            ) : null}

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
                        </>
                      ) : null}
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View className="flex-row gap-sm">
              <StatTile
                value={inspection.total_seeds}
                label={t("inspections:detail.summary.totalSeeds")}
              />
              <StatTile
                value={Number(inspection.mean_length_mm ?? 0).toFixed(2)}
                label={t("inspections:detail.summary.meanLength")}
              />
            </View>
            <View className="flex-row gap-sm">
              <StatTile
                value={Number(inspection.mean_width_mm ?? 0).toFixed(2)}
                label={t("inspections:detail.summary.meanWidth")}
              />
              <StatTile
                value={Number(inspection.mean_area_mm2 ?? 0).toFixed(2)}
                label={t("inspections:detail.summary.meanArea")}
              />
            </View>

            <View className="gap-md">
              <View className="flex-row items-end justify-between gap-md">
                <View>
                  <Text className="text-h2 font-medium text-fg-primary">
                    {t("inspections:detail.perSeedTitle")}
                  </Text>
                  <Text className="text-caption text-fg-secondary">
                    {t("inspections:detail.filteredSeedCount", {
                      count: filteredSeeds.length,
                      total: seeds.length,
                    })}
                  </Text>
                </View>
              </View>
              <View className="flex-row flex-wrap gap-sm">
                {gradeFilters.map((filter) => (
                  <GradeFilterChip
                    key={filter}
                    label={
                      filter === "all"
                        ? t("inspections:detail.gradeFilterAll")
                        : t(`inspections:seedGrade.${filter}`)
                    }
                    selected={gradeFilter === filter}
                    onPress={() => setGradeFilter(filter)}
                  />
                ))}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <SeedCard
            seed={item}
            onPress={() => router.push(`/seed/${inspection.id}/${item.index}`)}
            gradeLabel={t(`inspections:seedGrade.${item.grade}`)}
          />
        )}
        ListFooterComponent={
          policy.canDeleteInspection(inspection) ? (
            <Button
              variant="outline"
              label={t("common:actions.delete")}
              onPress={() =>
                Alert.alert(t("common:actions.delete"), t("inspections:detail.deleteConfirm"), [
                  { text: t("common:actions.cancel"), style: "cancel" },
                  {
                    text: t("common:actions.delete"),
                    style: "destructive",
                    onPress: async () => {
                      await del.mutateAsync(inspection.id);
                      router.back();
                    },
                  },
                ])
              }
            />
          ) : null
        }
      />
    </SafeAreaView>
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

function SeedCard({
  seed,
  gradeLabel,
  onPress,
}: {
  seed: Seed;
  gradeLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="items-center gap-xs rounded-lg bg-bg-primary border border-line-tertiary px-sm py-md"
      style={{ flex: 1 }}
    >
      <Text className="text-h2 font-medium text-fg-primary">{seed.index}</Text>
      <Pill tone={gradeToTone[seed.grade]} label={gradeLabel} />
      <Text className="text-caption text-fg-secondary text-center">
        {Number(seed.length_mm).toFixed(1)} × {Number(seed.width_mm).toFixed(1)} mm
      </Text>
    </Pressable>
  );
}

function GradeFilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`rounded-full border px-md py-xs ${
        selected ? "border-brand bg-brand" : "border-line-tertiary bg-bg-primary"
      }`}
    >
      <Text
        className="text-caption font-medium"
        style={{ color: selected ? "#FFFFFF" : "#1A1A1A" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatCalibrationValue(pxPerMm: number, t: ReturnType<typeof useTranslation>["t"]) {
  return t("inspections:detail.metadata.calibrationValue", {
    pxPerMm: pxPerMm.toFixed(1),
  });
}
