import { useMemo, useState } from "react";
import { Alert, Image, ScrollView, View, Text } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft, Download } from "lucide-react-native";
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
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !active ? (
          <EmptyState hint={t("calibration:honestFallback")} />
        ) : (
          <>
            {/* Active profile card */}
            <Card>
              <View className="flex-row items-center gap-sm">
                <Pill tone="success" dot label={t("calibration:active.label")} />
                <Text className="text-caption text-fg-secondary">
                  {t(`calibration:sources.${active.source}`)}
                </Text>
              </View>
              <Text className="mt-sm text-title font-medium text-fg-primary">{active.name}</Text>
              <View className="mt-md flex-row gap-xl">
                <View>
                  <Text className="text-caption text-fg-secondary uppercase">
                    {t("calibration:units.pxPerMm")}
                  </Text>
                  <Text className="mt-xs text-display font-medium text-fg-primary tracking-tight">
                    {Number(active.px_per_mm).toFixed(2)}
                  </Text>
                </View>
                <View>
                  <Text className="text-caption text-fg-secondary uppercase">
                    {t("calibration:fields.source")}
                  </Text>
                  <Text className="mt-xs text-body text-fg-primary">
                    {t(`calibration:sources.${active.source}`)}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Other profiles */}
            {others.length > 0 ? (
              <View className="gap-sm">
                <Text className="px-xs text-caption font-medium text-fg-secondary uppercase">
                  {t("calibration:other.sectionTitle")}
                </Text>
                <Card className="px-0 py-0">
                  {others.map((c, i) => (
                    <View
                      key={c.id}
                      className={`flex-row items-center px-xl py-md ${
                        i < others.length - 1 ? "border-b border-line-tertiary" : ""
                      }`}
                    >
                      <View className="flex-1 gap-xs">
                        <Text className="text-body text-fg-primary">{c.name}</Text>
                        <Text className="text-caption text-fg-secondary">
                          {t(`calibration:sources.${c.source}`)}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-body font-medium text-fg-primary">
                          {Number(c.px_per_mm).toFixed(2)}
                        </Text>
                        <Text className="text-caption text-fg-secondary">
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

        {/* ArUco marker preview */}
        <View className="gap-sm">
          <Text className="px-xs text-caption font-medium text-fg-secondary uppercase">
            {t("calibration:marker.title")}
          </Text>
          <Card>
            <View className="items-center">
              <Image
                source={ARUCO_MARKER_IMAGE}
                className="h-48 w-48 rounded-md bg-bg-primary"
                resizeMode="contain"
                accessibilityLabel={t("calibration:marker.imageAlt")}
              />
              <Pill className="mt-md" tone="neutral" label={t("calibration:marker.size")} />
              <Text className="mt-md text-center text-caption text-fg-secondary">
                {t("calibration:marker.description")}
              </Text>
            </View>
            <Button
              className="mt-md"
              variant="outline"
              label={
                sharingMarker ? t("calibration:marker.sharing") : t("calibration:marker.download")
              }
              renderLeadingIcon={() => <Download color="#171717" size={18} />}
              disabled={sharingMarker}
              onPress={() => void onShareMarker()}
            />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
