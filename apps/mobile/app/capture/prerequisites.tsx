import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { AppTopBar } from "@/components/ui/AppTopBar";

export default function CapturePrerequisites() {
  const { t } = useTranslation(["common", "inspections"]);
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-bg-secondary" edges={["top", "bottom"]}>
      <AppTopBar
        title={t("inspections:capture.modePicker.infoTitle")}
        left={{
          accessibilityLabel: t("common:actions.back"),
          renderIcon: () => <ChevronLeft color="#1A1A1A" size={20} />,
          onPress: () => router.back(),
        }}
      />
      <ScrollView contentContainerClassName="px-xl py-lg gap-md">
        <Text className="text-body text-fg-secondary px-xs">
          {t("inspections:capture.modePicker.infoSubtitle")}
        </Text>

        <PrerequisiteBlock
          title={t("inspections:capture.modePicker.livePrereqTitle")}
          items={[
            t("inspections:capture.modePicker.livePrereqDevice"),
            t("inspections:capture.modePicker.livePrereqCalibration"),
            t("inspections:capture.modePicker.livePrereqFrame"),
            t("inspections:capture.modePicker.livePrereqLighting"),
            t("inspections:capture.modePicker.livePrereqMotion"),
          ]}
        />

        <PrerequisiteBlock
          title={t("inspections:capture.modePicker.precisePrereqTitle")}
          items={[
            t("inspections:capture.modePicker.precisePrereqDevice"),
            t("inspections:capture.modePicker.precisePrereqCalibration"),
            t("inspections:capture.modePicker.precisePrereqHold"),
            t("inspections:capture.modePicker.precisePrereqLighting"),
            t("inspections:capture.modePicker.precisePrereqUse"),
          ]}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function PrerequisiteBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <View className="rounded-xl border border-line-tertiary bg-bg-primary px-xl py-lg">
      <Text className="text-title font-medium text-fg-primary">{title}</Text>
      <View className="mt-md gap-sm">
        {items.map((item) => (
          <View key={item} className="flex-row gap-sm">
            <Text className="text-body text-fg-secondary">•</Text>
            <Text className="flex-1 text-body text-fg-secondary">{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
