import { useState } from "react";
import { Alert, Image, ScrollView, View, Text } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft, Download } from "lucide-react-native";
import { useCalibrations } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import arucoMarkerImage from "../assets/calibration/aruco-5cm-card.png";

const ARUCO_MARKER_IMAGE = arucoMarkerImage;

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
          renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-md gap-md">
        <Card>
          <View className="flex-row gap-md">
            <Image
              source={ARUCO_MARKER_IMAGE}
              className="h-20 w-20 rounded-md bg-bg-secondary"
              resizeMode="contain"
              accessibilityLabel={t("calibration:marker.imageAlt")}
            />
            <View className="flex-1 gap-sm">
              <View className="flex-row items-center justify-between gap-md">
                <Text className="text-title font-medium text-fg-primary">
                  {t("calibration:marker.title")}
                </Text>
                <Pill tone="brand" label={t("calibration:marker.size")} />
              </View>
              <Text className="text-body text-fg-secondary">
                {t("calibration:marker.description")}
              </Text>
            </View>
          </View>
          <Button
            className="mt-md"
            variant="outline"
            label={
              sharingMarker ? t("calibration:marker.sharing") : t("calibration:marker.download")
            }
            renderLeadingIcon={() => <Download color="#1A1A1A" size={18} />}
            disabled={sharingMarker}
            onPress={() => void onShareMarker()}
          />
        </Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState hint={t("calibration:honestFallback")} />
        ) : (
          data.map((c) => (
            <Card key={c.id}>
              <View className="flex-row items-center justify-between">
                <Text className="text-title font-medium text-fg-primary">{c.name}</Text>
                <Pill tone="brand" label={t(`calibration:sources.${c.source}`)} />
              </View>
              <View className="flex-row items-baseline gap-xs mt-md">
                <Text className="text-display font-medium text-fg-primary tracking-tight">
                  {Number(c.px_per_mm).toFixed(2)}
                </Text>
                <Text className="text-body text-fg-secondary">px/mm</Text>
              </View>
              <Text className="text-caption text-fg-secondary mt-sm">
                {t("calibration:fields.source")}: {t(`calibration:sources.${c.source}`)}
              </Text>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
