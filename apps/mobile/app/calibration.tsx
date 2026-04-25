import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useCalibrations } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";

export default function CalibrationRoute() {
  const { t } = useTranslation(["common", "calibration"]);
  const { data, isLoading, isError, refetch } = useCalibrations();

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-xl py-xl gap-md">
        <Text className="text-h1 font-medium text-fg-primary">{t("calibration:title")}</Text>

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
