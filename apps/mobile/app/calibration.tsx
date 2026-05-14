import { useMemo, useState } from "react";
import { Alert, Image, ScrollView, View, Text } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft, Download, Share2 } from "lucide-react-native";
import type { CalibrationProfile } from "@advance-seeds/types";
import { useCalibrations } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import arucoMarkerImage from "../assets/calibration/aruco-5cm-card.png";

const ARUCO_MARKER_IMAGE = arucoMarkerImage;

// Calibration source priority: LiDAR > ArUco > manual.
const SOURCE_PRIORITY: Record<string, number> = {
  lidar: 0,
  aruco: 1,
  manual: 2,
};

function sortByPriority(profiles: CalibrationProfile[]): CalibrationProfile[] {
  return [...profiles].sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.source] ?? 99;
    const pb = SOURCE_PRIORITY[b.source] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
}

// Hermes lacks Intl.RelativeTimeFormat — manual short relative time.
function formatRelative(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function formatShortDate(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  const diffDay = Math.round(diffMin / (60 * 24));
  if (diffDay < 1) return "Today";
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

async function shareBundledMarker(title: string) {
  const source = Image.resolveAssetSource(ARUCO_MARKER_IMAGE);
  const target = `${FileSystem.cacheDirectory}advance-seeds-aruco-5cm-card.png`;
  await FileSystem.deleteAsync(target, { idempotent: true });
  if (source.uri.startsWith("file://")) {
    await FileSystem.copyAsync({ from: source.uri, to: target });
  } else {
    await FileSystem.downloadAsync(source.uri, target);
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target, {
      mimeType: "image/png",
      dialogTitle: title,
    });
    return;
  }

  Alert.alert(title, target);
}

export default function CalibrationRoute() {
  const { t } = useTranslation(["common", "calibration"]);
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useCalibrations();
  const [sharingMarker, setSharingMarker] = useState(false);

  const sorted = useMemo(() => (data ? sortByPriority(data) : []), [data]);
  const active = sorted[0];
  const others = sorted.slice(1);

  const onShareMarker = async () => {
    setSharingMarker(true);
    try {
      await shareBundledMarker(t("calibration:marker.shareTitle"));
    } catch {
      Alert.alert(t("calibration:marker.errorTitle"), t("calibration:marker.errorBody"));
    } finally {
      setSharingMarker(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("calibration:title")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#171717" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-lg pt-md pb-2xl">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !active ? (
          <EmptyState hint={t("calibration:honestFallback")} />
        ) : (
          <>
            {/* Active profile card */}
            <Card className="p-lg">
              <View className="flex-row items-center gap-sm">
                <Pill tone="success" label={t("calibration:active.label")} />
                <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary">
                  {t("calibration:lastVerified", { time: formatRelative(active.created_at) })}
                </Text>
              </View>
              <Text
                className="mt-sm text-h2 font-semibold text-fg-primary"
                style={{ letterSpacing: -0.2 }}
              >
                {active.name}
              </Text>
              <View className="mt-md flex-row gap-xl">
                <View>
                  <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary">
                    {t("calibration:units.pxPerMm")}
                  </Text>
                  <Text
                    className="mt-xs font-semibold text-fg-primary"
                    style={{ fontSize: 26, letterSpacing: -0.4, lineHeight: 30 }}
                  >
                    {Number(active.px_per_mm).toFixed(2)}
                  </Text>
                </View>
                <View>
                  <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary">
                    {t("calibration:fields.source")}
                  </Text>
                  <Text className="mt-xs text-body text-fg-primary">
                    {t(`calibration:sourceLabels.${active.source}`)}
                  </Text>
                </View>
                {active.source === "lidar" ? (
                  <View>
                    <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary">
                      {t("calibration:fields.drift")}
                    </Text>
                    <Text className="mt-xs text-body font-medium text-success-text">±0.04</Text>
                  </View>
                ) : null}
              </View>
            </Card>

            {/* Other profiles */}
            {others.length > 0 ? (
              <View className="mt-xl">
                <Text
                  className="px-xs pb-sm text-h2 font-semibold text-fg-primary"
                  style={{ letterSpacing: -0.2 }}
                >
                  {t("calibration:other.sectionTitle")}
                </Text>
                <Card className="px-0 py-0 overflow-hidden">
                  {others.map((c, i) => (
                    <View
                      key={c.id}
                      className={`flex-row items-center px-lg py-md ${
                        i < others.length - 1 ? "border-b border-line-tertiary" : ""
                      }`}
                    >
                      <View className="flex-1">
                        <Text className="text-body font-medium text-fg-primary">
                          {t(`calibration:sourceLabels.${c.source}`)} · {c.name}
                        </Text>
                        <Text className="mt-[2px] text-caption text-fg-tertiary">
                          {formatShortDate(c.created_at)}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-body font-semibold text-fg-primary">
                          {Number(c.px_per_mm).toFixed(2)}
                        </Text>
                        <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-fg-tertiary">
                          {t("calibration:units.pxPerMm")}
                        </Text>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}
          </>
        )}

        {/* ArUco marker block */}
        <View className="mt-xl">
          <Text
            className="px-xs pb-sm text-h2 font-semibold text-fg-primary"
            style={{ letterSpacing: -0.2 }}
          >
            {t("calibration:marker.title")} · {t("calibration:marker.size")}
          </Text>
          <Card className="p-lg">
            <View className="items-center">
              <View
                className="rounded-md border border-line-secondary bg-bg-primary p-md"
                style={{ width: 240, height: 240 }}
              >
                <Image
                  source={ARUCO_MARKER_IMAGE}
                  className="h-full w-full"
                  resizeMode="contain"
                  accessibilityLabel={t("calibration:marker.imageAlt")}
                />
              </View>
              <Text className="mt-md text-center text-caption text-fg-secondary">
                {t("calibration:marker.description")}
              </Text>
            </View>
            <View className="mt-md flex-row gap-sm">
              <Button
                className="flex-1"
                variant="secondary"
                label={
                  sharingMarker ? t("calibration:marker.sharing") : t("calibration:marker.share")
                }
                renderLeadingIcon={() => <Share2 color="#171717" size={16} />}
                disabled={sharingMarker}
                onPress={() => void onShareMarker()}
              />
              <Button
                className="flex-1"
                variant="secondary"
                label={t("calibration:marker.savePdf")}
                renderLeadingIcon={() => <Download color="#171717" size={16} />}
                disabled={sharingMarker}
                onPress={() => void onShareMarker()}
              />
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
