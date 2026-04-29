import { ScrollView, View, Text, Pressable, Alert } from "react-native";
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
          icon: <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: () => router.back(),
        }}
        right={{
          accessibilityLabel: t("common:actions.more"),
          icon: <MoreHorizontal color="#1A1A1A" size={20} />,
          onPress: openMenu,
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-xl">
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
            <CaptureMediaPreview
              uri={mediaUrl}
              kind={captureMedia.kind}
              roi={captureMedia.kind === "photo" ? roi : null}
            />
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

        <View>
          <Text className="text-h2 font-medium text-fg-primary mb-md">
            {t("inspections:detail.perSeedTitle")}
          </Text>
          <View className="flex-row flex-wrap gap-sm">
            {seeds.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => router.push(`/seed/${inspection.id}/${s.index}`)}
                className="basis-[31%] grow items-center gap-xs rounded-lg bg-bg-primary border border-line-tertiary px-md py-md"
              >
                <Text className="text-h2 font-medium text-fg-primary">{s.index}</Text>
                <Pill tone={gradeToTone[s.grade]} label={t(`inspections:seedGrade.${s.grade}`)} />
                <Text className="text-caption text-fg-secondary">
                  {Number(s.length_mm).toFixed(1)} × {Number(s.width_mm).toFixed(1)} mm
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {policy.canDeleteInspection(inspection) ? (
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
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
